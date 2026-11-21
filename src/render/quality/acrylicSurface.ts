import { Color, type MeshStandardMaterial } from 'three'
import { acrylic } from '../../theme/tokens'
import { applyRoundedBoxMaterial } from '../geometry/roundedBox'
import { bodyPalette } from './bodyPalette'
import type { BodyRole } from './materialTypes'

/** Shared optical finish on both tiers. Local distances keep the polished
 * bevel narrow even on wide array trays and deep or very small bodies. */
export function applyAcrylicSurface<T extends MeshStandardMaterial>(material: T, role: BodyRole): T {
  const tint = new Color(bodyPalette(role).edge)
  const surface = `varying vec3 runtimeSurfacePosition;
varying vec3 runtimeSurfaceNormal;
varying vec3 runtimeHalfSize;
varying float runtimeFinish;`
  material.onBeforeCompile = shader => {
    shader.uniforms.runtimeEdgeTint = { value: tint }
    shader.vertexShader = surface + '\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
runtimeHalfSize = runtimeRoundedSize() * 0.5;
runtimeSurfacePosition = transformed * runtimeHalfSize * 2.0;
runtimeSurfaceNormal = normal;
runtimeFinish = 1.0;
#ifdef USE_INSTANCING_COLOR
  runtimeFinish = instanceColor.r;
#endif`)
    shader.fragmentShader = 'uniform vec3 runtimeEdgeTint;\n' + surface + '\n' + shader.fragmentShader
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= mix(1.12, 0.78, max(normalize(runtimeSurfaceNormal).y, 0.0));`)
      .replace('#include <opaque_fragment>', `
vec3 localNormal = normalize(runtimeSurfaceNormal);
vec3 surfaceGap = max(runtimeHalfSize - abs(runtimeSurfacePosition), vec3(0.0));
float edgeDistance = max(min(surfaceGap.x, surfaceGap.y), min(max(surfaceGap.x, surfaceGap.y), surfaceGap.z));
float edgeWidth = min(fwidth(edgeDistance), 0.085);
float bevel = 1.0 - smoothstep(${acrylic.edgeNear}, ${acrylic.edgeFar} + edgeWidth, edgeDistance);
float grazing = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.3);
float key = clamp(dot(localNormal, vec3(-0.48, 0.81, 0.28)) * 0.5 + 0.5, 0.0, 1.0);
float height = clamp(0.5 + runtimeSurfacePosition.y / (2.0 * runtimeHalfSize.y), 0.0, 1.0);
float polish = bevel * (0.075 + key * 0.19 + grazing * 0.18);
vec3 finish = outgoingLight * (0.60 + 0.22 * key + 0.16 * height)
  + runtimeEdgeTint * (polish + max(localNormal.y, 0.0) * 0.035);
float luminance = dot(finish, vec3(0.2126, 0.7152, 0.0722));
outgoingLight = mix(vec3(luminance) * vec3(0.74, 0.84, 1.06), finish, runtimeFinish)
  * (0.42 + 0.58 * runtimeFinish);
#include <opaque_fragment>`)
  }
  material.customProgramCacheKey = () => 'runtime-acrylic-studio-v1'
  return applyRoundedBoxMaterial(material)
}
