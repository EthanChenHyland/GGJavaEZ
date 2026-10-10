import { BufferGeometry, Float32BufferAttribute, Material, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { world } from '../../theme/tokens'

/** Unit template only: instance dimensions are applied by the shared vertex patch. */
export const roundedBoxBevel = world.frame.bevel
const templateCore = .5 - roundedBoxBevel
export const unitRoundedBox = new RoundedBoxGeometry(1, 1, 1, 2, roundedBoxBevel)
unitRoundedBox.name = 'runtime:shared-rounded-body'
// The shader changes the surface, but not its canonical unit envelope. Conservative
// bounds keep Three's instance culling and broad-phase picking independent of bevels.
unitRoundedBox.computeBoundingBox()
unitRoundedBox.computeBoundingSphere()
unitRoundedBox.boundingBox!.min.setScalar(-.5)
unitRoundedBox.boundingBox!.max.setScalar(.5)
unitRoundedBox.boundingSphere!.center.setScalar(0)
unitRoundedBox.boundingSphere!.radius = Math.sqrt(3) / 2

type Dimensions = readonly [number, number, number]

/** A thin tray retains a flat center rather than becoming a degenerate capsule. */
export function physicalBoxBevel(size: Dimensions): number {
  return Math.min(roundedBoxBevel, Math.min(...size) * .4)
}

/** CPU equivalent used by merged outlines; returns coordinates relative to the body. */
export function expandRoundedBoxVertex(position: Vector3, normal: Vector3, size: Dimensions, target = new Vector3()): Vector3 {
  const radius = physicalBoxBevel(size)
  for (let axis = 0; axis < 3; axis++) {
    const n = normal.getComponent(axis)
    const core = (position.getComponent(axis) - n * roundedBoxBevel) / templateCore
    target.setComponent(axis, core * (size[axis] / 2 - radius) + n * radius)
  }
  return target
}

/** Apply before Three's instance matrix; correct normals before its inverse scaling. */
export function roundedBoxVertexShader(vertexShader: string): string {
  const helpers = /* glsl */`
vec3 runtimeRoundedSize() {
  #ifdef USE_INSTANCING
    return max(vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)), vec3(0.000001));
  #else
    return vec3(1.0);
  #endif
}
vec3 runtimeRoundedPosition(vec3 p, vec3 n, vec3 size) {
  float radius = min(${roundedBoxBevel.toFixed(8)}, min(size.x, min(size.y, size.z)) * 0.4);
  vec3 core = (p - n * ${roundedBoxBevel.toFixed(8)}) / ${templateCore.toFixed(8)};
  return (core * (size * 0.5 - radius) + n * radius) / size;
}
`
  return vertexShader
    .replace('#include <common>', '#include <common>\n' + helpers)
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal *= runtimeRoundedSize();')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = runtimeRoundedPosition(position, normal, runtimeRoundedSize());')
}

/** Compose with acrylic shading; mask/depth proxies can preserve this same hook. */
export function applyRoundedBoxMaterial<T extends Material>(material: T): T {
  const previousCompile = material.onBeforeCompile
  const previousCacheKey = material.customProgramCacheKey()
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer)
    shader.vertexShader = roundedBoxVertexShader(shader.vertexShader)
  }
  material.customProgramCacheKey = () => `${previousCacheKey}:runtime-rounded-box-v1`
  material.userData.runtimeRoundedBox = true
  return material
}

/** Twelve edge centerlines joined by spherical corner arcs, all on the rounded surface.
 * One reusable template is CPU-expanded into each existing merged opacity batch.
 */
function createRoundedOutline(): BufferGeometry {
  const points: number[] = [], normals: number[] = []
  const append = (core: number[], n: Vector3) => {
    for (let axis = 0; axis < 3; axis++) {
      points.push(core[axis] * templateCore + n.getComponent(axis) * roundedBoxBevel)
      normals.push(n.getComponent(axis))
    }
  }
  const diagonal = Math.SQRT1_2
  for (let axis = 0; axis < 3; axis++) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const n = new Vector3().setComponent(a, sa * diagonal).setComponent(b, sb * diagonal)
      for (const end of [-1, 1]) {
        const core = [0, 0, 0]
        core[axis] = end; core[a] = sa; core[b] = sb
        append(core, n)
      }
    }
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const core = [x, y, z]
    const corners = [new Vector3(x, y, 0).normalize(), new Vector3(x, 0, z).normalize(), new Vector3(0, y, z).normalize()]
    for (let arc = 0; arc < 3; arc++) {
      const start = corners[arc], end = corners[(arc + 1) % 3], angle = start.angleTo(end)
      const sample = (t: number) => new Vector3().addScaledVector(start, Math.sin((1 - t) * angle) / Math.sin(angle)).addScaledVector(end, Math.sin(t * angle) / Math.sin(angle))
      for (let segment = 0; segment < 6; segment++) {
        append(core, sample(segment / 6))
        append(core, sample((segment + 1) / 6))
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.name = 'runtime:shared-rounded-outline'
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  return geometry
}
export const unitRoundedOutline = createRoundedOutline()
