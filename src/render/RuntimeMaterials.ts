import { BoxGeometry, Color, EdgesGeometry, MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, RGBADepthPacking } from 'three';
import type { MaterialRole } from '../contracts/worldV2';
import { color } from '../theme/tokens';
import { qualityStore, type QualityTier } from './quality/qualityStore';
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
    const palette = color[role];
    if (cinematic) {
        const material = cinematic.createCinematicBody(role, opacity);
        materials.set(key, material);
        return material;
    }
    const material = new MeshStandardMaterial({ color: palette.core, emissive: palette.core, emissiveIntensity: .10, roughness: .22, metalness: .06, envMapIntensity: 1.35, transparent: true, opacity: .78 * opacity, depthWrite: true });
    material.name = `runtime:INTERACTIVE:${role}`;
    material.onBeforeCompile = shader => {
        shader.uniforms.runtimeEdgeTint = { value: new Color(palette.edge) };
        shader.fragmentShader = 'uniform vec3 runtimeEdgeTint;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', `
float acrylicFacing = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
float acrylicRim = pow(1.0 - acrylicFacing, 2.5);
// Keep the interior dark enough for the reflected panels and luminous rim to read as depth.
outgoingLight = outgoingLight * mix(0.62, 1.0, acrylicRim) + runtimeEdgeTint * acrylicRim * 0.72;
#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'runtime-acrylic-fresnel-v4-2';
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
