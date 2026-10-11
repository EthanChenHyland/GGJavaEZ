import { BoxGeometry, Color, EdgesGeometry, MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, RGBADepthPacking } from 'three';
import type { MaterialRole } from '../contracts/worldV2';
import { color } from '../theme/tokens';
import { qualityStore, type QualityTier } from './quality/qualityStore';
import {bodyPalette} from './quality/bodyPalette';
import type { BodyRole } from './quality/materialTypes';
import { applyRoundedBoxMaterial } from './geometry/roundedBox';
export const unitBox = new BoxGeometry(1, 1, 1);
export const unitEdges = new EdgesGeometry(unitBox);
export const roleColor: Record<MaterialRole, string> = { stack: color.stack.edge, heap: color.heap.edge, class: color.class.edge, reference: color.semantic.execution, call: color.stack.edge, return: color.semantic.return, exception: color.semantic.exception, mutation: color.semantic.mutation, stdout: color.semantic.stdout, stderr: color.semantic.stderr, stdin: color.semantic.stdin };
const materials = new Map<string, MeshStandardMaterial>();
let roundedDepth: MeshDepthMaterial | null = null;
let roundedDistance: MeshDistanceMaterial | null = null;
export function roundedDepthMaterial() {
    return roundedDepth ??= applyRoundedBoxMaterial(new MeshDepthMaterial({ depthPacking: RGBADepthPacking }));
}
export function roundedDistanceMaterial() {
    return roundedDistance ??= applyRoundedBoxMaterial(new MeshDistanceMaterial());
}
export function glassMaterial(role: BodyRole, opacity = 1, tier: QualityTier = 'INTERACTIVE') {
    const cinematic = tier === 'CINEMATIC' ? qualityStore.getState().cinematicModule : null;
    const actualTier = cinematic ? 'CINEMATIC' : 'INTERACTIVE';
    const key = `${actualTier}:${role}:${opacity}`, existing = materials.get(key);
    if (existing)
        return existing;
    const palette = bodyPalette(role);
    if (cinematic) {
        const material = cinematic.createCinematicBody(role, opacity);
        materials.set(key, material);
        return material;
    }
    const material = new MeshStandardMaterial({ color: palette.core, emissive: palette.core, emissiveIntensity: .10, roughness: .22, metalness: .06, envMapIntensity: 1.35, transparent: true, opacity: .78 * opacity, depthWrite: true });
    material.name = `runtime:INTERACTIVE:${role}`;
    material.onBeforeCompile = shader => {
        shader.uniforms.runtimeEdgeTint = { value: new Color(palette.edge) };
        const surfaceVaryings='varying vec3 runtimeBodyPoint;\nvarying vec3 runtimeBodyHalfSize;\n';
        // Rounded-box expansion composes after this hook, before these captures.
        shader.vertexShader=surfaceVaryings+shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
runtimeBodyHalfSize = runtimeRoundedSize() * 0.5;
runtimeBodyPoint = transformed * runtimeRoundedSize();`);
        shader.fragmentShader = 'uniform vec3 runtimeEdgeTint;\n'+surfaceVaryings + shader.fragmentShader.replace('#include <opaque_fragment>', `
float acrylicFacing = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
float acrylicRim = pow(1.0 - acrylicFacing, 2.5);
// The nearest plane is the surface itself; the second nearest locates its rim.
// World-unit distances keep the edge band fixed across differently sized bodies.
vec3 surfaceGap = max(runtimeBodyHalfSize - abs(runtimeBodyPoint), vec3(0.0));
float edgeDistance = max(min(surfaceGap.x, surfaceGap.y), min(max(surfaceGap.x, surfaceGap.y), surfaceGap.z));
float edgeBand = 1.0 - smoothstep(0.10, 0.35, edgeDistance);
// Grazing-angle reflection alone must not turn an entire top/side into emissive ink.
outgoingLight = outgoingLight * mix(0.62, 1.0, acrylicRim * edgeBand) + runtimeEdgeTint * acrylicRim * 0.72 * edgeBand;
#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'runtime-acrylic-fresnel-v4-3';
    applyRoundedBoxMaterial(material);
    materials.set(key, material);
    return material;
}
/** Renderer lifetime resources; never dispose them merely because a tier changes. */
export function disposeRuntimeMaterials(): void {
    for (const material of materials.values()) material.dispose();
    materials.clear();
    roundedDepth?.dispose();
    roundedDistance?.dispose();
    roundedDepth = roundedDistance = null;
}
