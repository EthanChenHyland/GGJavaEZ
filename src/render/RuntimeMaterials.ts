import { BoxGeometry, EdgesGeometry, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { ConnectorWidth, MaterialRole } from '../contracts/world';
import { acrylic, color, world } from '../theme/tokens';
import { qualityStore, type QualityTier } from './quality/qualityStore';
import {bodyPalette} from './quality/bodyPalette';
import type { BodyRole } from './quality/materialTypes';
import { applyRoundedChipMaterial } from './geometry/roundedChip';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {curveAlphaShaders} from './curveAlpha';
import {applyAcrylicSurface} from './quality/acrylicSurface';
export const unitBox = new BoxGeometry(1, 1, 1);
export const unitEdges = new EdgesGeometry(unitBox);
export const roleColor: Record<MaterialRole, string> = { stack: color.stack.edge, heap: color.heap.edge, class: color.class.edge, reference: color.semantic.execution, call: color.stack.edge, return: color.semantic.return, exception: color.semantic.exception, mutation: color.semantic.mutation, stdout: color.semantic.stdout, stderr: color.semantic.stderr, stdin: color.semantic.stdin };
/** One material per mounted emphasis band, independent of its changing path
 * geometry. The band owns disposal; shader and mask programs survive updates. */
export function connectorMaterial(halo:boolean,widthPx:ConnectorWidth):LineMaterial {
    const material=new LineMaterial({vertexColors:true,linewidth:halo?world.connector.haloPx:widthPx,transparent:true,opacity:halo?.065:1,depthTest:true,depthWrite:false});
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
    material.onBeforeCompile = shader => {
        shader.vertexShader = 'varying vec2 runtimeFaceUv;\n' + shader.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\nruntimeFaceUv = uv;');
        shader.fragmentShader = 'varying vec2 runtimeFaceUv;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', `
            float wash = smoothstep(0.0, 1.0, runtimeFaceUv.y);
            float sheen = pow(max(0.0, 1.0 - length((runtimeFaceUv - vec2(0.12, 0.98)) * vec2(0.82, 1.05))), 2.1);
            outgoingLight = outgoingLight * (0.60 + 0.31 * wash + 0.28 * sheen)
                + vec3(0.005, 0.008, 0.016) * (0.38 + 0.62 * sheen);
            #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'runtime-readable-acrylic-face-v1';
    if(inset)applyRoundedChipMaterial(material);
    faces.set(key,material);
    return material;
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
    const material = new MeshStandardMaterial({ color: palette.core, emissive: palette.core, emissiveIntensity: .025,
        roughness: acrylic.interactiveRoughness, metalness: 0, envMapIntensity: acrylic.environment,
        transparent: true, opacity: acrylic.interactiveOpacity * opacity, depthWrite });
    material.name = `runtime:INTERACTIVE:${role}`;
    applyAcrylicSurface(material, role);
    materials.set(key, material);
    return material;
}
/** Renderer lifetime resources; never dispose them merely because a tier changes. */
export function disposeRuntimeMaterials(): void {
    for (const material of faces.values()) material.dispose();
    faces.clear();
    for (const material of materials.values()) material.dispose();
    materials.clear();
}
