import { Color, MeshBasicMaterial, Vector2, type Matrix4, type Texture } from 'three'
import type { FloorModel } from './floorModel'
import { floorStyle } from './floorModel'

type FloorReflectionInk = {
  target: { texture: Texture }
  textureMatrix: Matrix4
  strength: { value: number }
}

/** The stage and its faint world-space grid share one surface, so their edge
 * fades together. The procedural response is also the low-cost fallback. */
export function createFloorSurface(reflection: FloorReflectionInk | null) {
  const material = new MeshBasicMaterial({ color: floorStyle.surface, transparent: true, depthWrite: false })
  material.name = 'runtime-floor-surface'
  const studio = { value: new Color(floorStyle.studio) }
  const grid = { value: new Color(floorStyle.grid) }
  const center = { value: new Vector2() }
  const radius = { value: 20 }
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { runtimeFloorStudio: studio, runtimeFloorGrid: grid, runtimeFloorCenter: center, runtimeFloorRadius: radius })
    if (reflection) Object.assign(shader.uniforms, {
      runtimeFloorReflection: { value: reflection.target.texture }, runtimeFloorProjection: { value: reflection.textureMatrix },
      runtimeFloorReflectionStrength: reflection.strength,
      runtimeFloorBlur: { value: floorStyle.reflectionBlur / floorStyle.reflectionResolution },
    })
    shader.vertexShader = `
      varying vec2 floorUv;
      varying vec3 floorPosition;
      ${reflection ? 'uniform mat4 runtimeFloorProjection; varying vec4 floorProjection;' : ''}
    ` + shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      floorUv = uv;
      floorPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      ${reflection ? 'floorProjection = runtimeFloorProjection * vec4(transformed, 1.0);' : ''}
    `)
    shader.fragmentShader = `
      uniform vec3 runtimeFloorStudio;
      uniform vec3 runtimeFloorGrid;
      uniform vec2 runtimeFloorCenter;
      uniform float runtimeFloorRadius;
      varying vec2 floorUv;
      varying vec3 floorPosition;
      ${reflection ? reflectionFragment : ''}

      float runtimeFloorLine(vec2 coords, float spacing) {
        vec2 tile = coords / spacing;
        vec2 pixel = max(fwidth(tile), 0.0001);
        vec2 line = abs(fract(tile + 0.5) - 0.5) / pixel;
        float resolved = 1.0 - smoothstep(0.19, 0.74, min(line.x, line.y));
        return resolved * (1.0 - smoothstep(0.18, 0.65, max(pixel.x, pixel.y)));
      }
    ` + shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec2 coords = floorPosition.xz;
      float radius = length((coords - runtimeFloorCenter) / runtimeFloorRadius);
      float studioFalloff = exp(-3.1 * radius * radius);
      float stageEdge = 1.0 - smoothstep(0.55, 0.985, length(floorUv * 2.0 - 1.0));
      vec3 toEye = cameraPosition - floorPosition;
      float grazing = smoothstep(0.012, 0.17, normalize(toEye).y);

      outgoingLight = mix(outgoingLight, runtimeFloorStudio, studioFalloff * (0.36 + 0.24 * grazing));
      float viewDistance = length(toEye);
      float nearGrid = 1.0 - smoothstep(15.0, 66.0, viewDistance);
      // Retain a faint coarse scale cue when the fine grid has faded out.
      float distantGrid = 0.55 * (1.0 - smoothstep(36.0, 170.0, viewDistance));
      float minorGrid = runtimeFloorLine(coords, ${floorStyle.minorSpacing.toFixed(1)}) * 0.11 * nearGrid;
      float majorGrid = runtimeFloorLine(coords, ${floorStyle.majorSpacing.toFixed(1)}) * 0.21 * max(nearGrid, distantGrid);
      outgoingLight = mix(outgoingLight, runtimeFloorGrid, max(minorGrid, majorGrid) * grazing * (0.3 + 0.7 * studioFalloff));

      ${reflection ? 'outgoingLight += runtimeFloorMirror() * grazing * (0.22 + 0.78 * studioFalloff);' : ''}
      diffuseColor.a *= stageEdge * grazing;
      #include <opaque_fragment>
    `)
  }
  material.customProgramCacheKey = () => reflection ? 'runtime-floor-surface-reflection-v1' : 'runtime-floor-surface-v1'
  return {
    material,
    update(model: FloorModel) {
      material.opacity = model.opacity
      center.value.set(...model.studioCenter)
      radius.value = model.studioRadius
    },
  }
}

const reflectionFragment = `
  uniform sampler2D runtimeFloorReflection;
  uniform float runtimeFloorReflectionStrength;
  uniform float runtimeFloorBlur;
  varying vec4 floorProjection;

  vec3 runtimeFloorMirror() {
    if (runtimeFloorReflectionStrength <= 0.0 || floorProjection.w <= 0.0) return vec3(0.0);
    vec2 uv = floorProjection.xy / floorProjection.w;
    vec2 border = min(uv, 1.0 - uv);
    float valid = smoothstep(0.0, 0.035, min(border.x, border.y));
    if (valid <= 0.0) return vec3(0.0);

    // One fixed-size render target. A 3x3 tent filter keeps silhouettes soft
    // without additional render passes or blur textures.
    vec2 dx = vec2(runtimeFloorBlur, 0.0);
    vec2 dy = vec2(0.0, runtimeFloorBlur);
    vec3 reflected = 0.25 * texture2D(runtimeFloorReflection, uv).rgb
      + 0.125 * (texture2D(runtimeFloorReflection, uv + dx).rgb + texture2D(runtimeFloorReflection, uv - dx).rgb
        + texture2D(runtimeFloorReflection, uv + dy).rgb + texture2D(runtimeFloorReflection, uv - dy).rgb)
      + 0.0625 * (texture2D(runtimeFloorReflection, uv + dx + dy).rgb + texture2D(runtimeFloorReflection, uv + dx - dy).rgb
        + texture2D(runtimeFloorReflection, uv - dx + dy).rgb + texture2D(runtimeFloorReflection, uv - dx - dy).rgb);
    reflected *= runtimeFloorReflectionStrength;
    float peak = max(reflected.r, max(reflected.g, reflected.b));
    return reflected * valid * ${floorStyle.reflectionPeak} / max(${floorStyle.reflectionPeak}, peak);
  }
`
