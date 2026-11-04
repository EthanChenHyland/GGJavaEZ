import { BoxGeometry, Color, EdgesGeometry, MeshBasicMaterial, MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, RGBADepthPacking } from 'three';
import type { MaterialRole } from '../contracts/world';
import { color, world } from '../theme/tokens';
import { qualityStore, type QualityTier } from './quality/qualityStore';
import {bodyPalette} from './quality/bodyPalette';
import type { BodyRole } from './quality/materialTypes';
import { applyRoundedBoxMaterial } from './geometry/roundedBox';
import { applyRoundedChipMaterial } from './geometry/roundedChip';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {curveAlphaShaders} from './curveAlpha';
export const unitBox = new BoxGeometry(1, 1, 1);
export const unitEdges = new EdgesGeometry(unitBox);
export const roleColor: Record<MaterialRole, string> = { stack: color.stack.edge, heap: color.heap.edge, class: color.class.edge, reference: color.semantic.execution, call: color.stack.edge, return: color.semantic.return, exception: color.semantic.exception, mutation: color.semantic.mutation, stdout: color.semantic.stdout, stderr: color.semantic.stderr, stdin: color.semantic.stdin };
/** One material per mounted emphasis band, independent of its changing path
 * geometry. The band owns disposal; shader and mask programs survive updates. */
export function connectorMaterial(halo:boolean,widthPx:2.5|3.5):LineMaterial {
    const material=new LineMaterial({vertexColors:true,linewidth:halo?8:widthPx,transparent:true,opacity:halo?.10:1,depthTest:true,depthWrite:false});
    Object.assign(material,curveAlphaShaders(material.vertexShader,material.fragmentShader));
    material.toneMapped=false;
    material.name=`runtime:connector:${halo?'halo':widthPx}`;
    return material;
}
const materials = new Map<string, MeshStandardMaterial>();
const faces = new Map<string, MeshBasicMaterial>();
/** Fixed planner opacity bands share programs across Focus/Home batch retirement.
 * The renderer owns these materials, just as it owns the acrylic body bands. */
export function faceMaterial(opacity:number,inset:boolean):MeshBasicMaterial {
    const key=`${opacity}:${inset}`,existing=faces.get(key);
    if(existing)return existing;
    const material=new MeshBasicMaterial({color:'white',transparent:opacity<1,opacity,depthWrite:opacity>=1&&!inset,toneMapped:false});
    material.name=`runtime:face:${key}`;
    if(inset)applyRoundedChipMaterial(material);
    faces.set(key,material);
    return material;
}
let roundedDepth: MeshDepthMaterial | null = null;
let roundedDistance: MeshDistanceMaterial | null = null;
export function roundedDepthMaterial() {
    return roundedDepth ??= applyRoundedBoxMaterial(new MeshDepthMaterial({ depthPacking: RGBADepthPacking }));
}
export function roundedDistanceMaterial() {
    return roundedDistance ??= applyRoundedBoxMaterial(new MeshDistanceMaterial());
}
export function glassMaterial(role: BodyRole, opacity = 1, tier: QualityTier = 'INTERACTIVE', focusContext = false) {
    const cinematic = tier === 'CINEMATIC' ? qualityStore.getState().cinematicModule : null;
    const actualTier = cinematic ? 'CINEMATIC' : 'INTERACTIVE';
    const depthWrite=!(focusContext&&opacity<=world.opacity.focusDim);
    const key = `${actualTier}:${role}:${opacity}:${depthWrite}`, existing = materials.get(key);
    if (existing)
        return existing;
    const palette = bodyPalette(role);
    if (cinematic) {
        const material = cinematic.createCinematicBody(role, opacity);
        material.depthWrite=depthWrite;
        materials.set(key, material);
        return material;
    }
    // Focus context must not leave an opaque depth silhouette over its target.
    // All ordinary, historical, Trace and full-emphasis bands keep depth writes.
    const material = new MeshStandardMaterial({ color: palette.core, emissive: palette.core, emissiveIntensity: .10, roughness: .22, metalness: .06, envMapIntensity: 1.35, transparent: true, opacity: .78 * opacity, depthWrite });
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
    for (const material of faces.values()) material.dispose();
    faces.clear();
    for (const material of materials.values()) material.dispose();
    materials.clear();
    roundedDepth?.dispose();
    roundedDistance?.dispose();
    roundedDepth = roundedDistance = null;
}
