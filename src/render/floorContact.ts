import { MeshBasicMaterial } from 'three'
import type { PresentationPlan, SceneModel, Vec3, WorldAnchor } from '../contracts/world'
import { color } from '../theme/tokens'
import { arrayBackplate, arrayTitlePlate } from '../world/arrayCellGeometry'
import { floorStyle, underside } from './floorModel'

interface FloorSupport {
  anchor: WorldAnchor
  opacity: number
  accent: string
  featured: boolean
}

export interface ContactFootprint {
  id: string
  position: Vec3
  size: readonly [number, number]
  core: readonly [number, number]
  opacity: number
  accent: string
  sheen: number
}

/** Contacts use the same bounded body/cell cut submitted by SolidBatch. */
export function floorSupports(scene: Pick<SceneModel, 'entities'>, plan: Pick<PresentationPlan, 'entities' | 'clusters' | 'cellWindows'>): FloorSupport[] {
  const supports: FloorSupport[] = []
  for (const [id, presented] of plan.entities) {
    const node = scene.entities[id]
    if (!node || presented.opacity <= 0) continue
    const palette = color[node.kind === 'frame' ? 'stack' : node.kind === 'class' ? 'class' : 'heap']
    const featured = Boolean(presented.highlight)
    const accent = presented.highlight === 'mutation' ? color.semantic.mutation
      : presented.highlight === 'exception' ? color.semantic.exception : palette.edge
    const add = (anchor: WorldAnchor, emphasized = featured) => supports.push({
      anchor, opacity: presented.opacity, accent: emphasized ? accent : palette.edge, featured: emphasized,
    })
    if (node.kind === 'array') {
      // The tray's envelope is safe for the stage height. Its backing sheet is
      // narrow and the actual cells provide the distinct local contact cues.
      if (presented.mode === 'detailed') {
        add(arrayBackplate(node.anchor), false)
        for (const cell of plan.cellWindows.get(id)?.mapping.values() ?? []) add(cell.anchor, featured && cell.index === node.activity?.index)
      } else add(arrayTitlePlate(node.anchor), false)
    } else add(node.anchor)
  }
  for (const cluster of plan.clusters) {
    if (cluster.opacity <= 0) continue
    const role = cluster.anchor.region === 'stack' ? 'stack' : cluster.anchor.region === 'class' ? 'class' : 'heap'
    supports.push({ anchor: cluster.anchor, opacity: cluster.opacity * .7, accent: color[role].edge, featured: cluster.selected })
  }
  return supports
}

export function contactFootprints(supports: readonly FloorSupport[], floorY: number): ContactFootprint[] {
  const footprints: ContactFootprint[] = []
  for (const { anchor, opacity, accent, featured } of supports) {
    const distance = underside(anchor) - floorY
    if (distance < 0 || distance >= floorStyle.maxContactHeight) continue
    const [x, , z] = anchor.position, [w, , d] = anchor.size
    const heightFade = (1 - distance / floorStyle.maxContactHeight) ** 2
    const strength = opacity * heightFade
    const penumbra = .52 + .42 * distance
    const width = w + 2 * penumbra, depth = d + 2 * penumbra
    footprints.push({
      id: anchor.entityId, position: [x, floorY + floorStyle.contactLift, z], size: [width, depth],
      core: [w / width, d / depth], opacity: strength * (featured ? .58 : .44),
      accent, sheen: strength * (featured ? .22 : .075),
    })
  }
  return footprints.sort((a, b) => b.opacity + b.sheen - a.opacity - a.sheen || a.id.localeCompare(b.id)).slice(0, floorStyle.maxContacts)
}

export function createFloorContactMaterial(): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ color: '#03050C', transparent: true, depthWrite: false })
  material.name = 'runtime-floor-contact'
  material.onBeforeCompile = shader => {
    shader.vertexShader = `
      attribute vec4 runtimeContact;
      varying vec4 contactStyle;
      varying vec2 contactUv;
      varying vec3 contactPosition;
      ` + shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        contactStyle = runtimeContact;
        contactUv = uv;
        contactPosition = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      `)
    shader.fragmentShader = `
      varying vec4 contactStyle;
      varying vec2 contactUv;
      varying vec3 contactPosition;
      ` + shader.fragmentShader.replace('#include <opaque_fragment>', `
        vec2 p = abs(contactUv * 2.0 - 1.0);
        vec2 core = contactStyle.xy;
        vec2 soft = (p - core) / max(vec2(0.001), 1.0 - core);
        float edge = length(max(soft, 0.0)) + min(max(soft.x, soft.y), 0.0);
        float occlusion = (1.0 - smoothstep(-0.25, 0.66, edge)) * contactStyle.z;
        float sheen = (1.0 - smoothstep(-0.5, 1.0, edge)) * (1.0 - occlusion) * contactStyle.w;
        float coverage = occlusion + sheen * (1.0 - occlusion);
        #ifdef USE_COLOR
          outgoingLight = mix(diffuse, vColor.rgb * 0.27, sheen / max(coverage, 0.0001));
        #endif
        float grazing = smoothstep(0.012, 0.17, normalize(cameraPosition - contactPosition).y);
        diffuseColor.a *= coverage * grazing;
        #include <opaque_fragment>
      `)
  }
  material.customProgramCacheKey = () => 'runtime-floor-contact-v2'
  return material
}
