import { MeshPhysicalMaterial } from 'three'
import { color } from '../../theme/tokens'
import type { BodyRole } from './materialTypes'

/** This module is requested only after an explicit Cinematic selection. */
export function createCinematicBody(role: BodyRole, emphasis: number): MeshPhysicalMaterial {
  const palette = color[role]
  const material = new MeshPhysicalMaterial({
    color: palette.core, attenuationColor: palette.core, attenuationDistance: 4,
    transmission: .75, thickness: 1, ior: 1.45, roughness: .22,
    metalness: 0, envMapIntensity: 1.35,
    emissive: palette.core, emissiveIntensity: .08,
    transparent: emphasis < 1, opacity: emphasis, depthWrite: true,
  })
  material.name = `runtime:CINEMATIC:${role}`
  return material
}
