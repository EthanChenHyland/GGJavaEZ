import { MeshPhysicalMaterial } from 'three'
import {bodyPalette} from './bodyPalette'
import type { BodyRole } from './materialTypes'
import { acrylic } from '../../theme/tokens'
import { applyAcrylicSurface } from './acrylicSurface'

/** This module is requested only after an explicit Cinematic selection. */
export function createCinematicBody(role: BodyRole, emphasis: number): MeshPhysicalMaterial {
  const palette = bodyPalette(role)
  const material = new MeshPhysicalMaterial({
    color: palette.core, attenuationColor: palette.core, attenuationDistance: 5,
    transmission: emphasis >= .7 ? acrylic.transmission : 0,
    thickness: acrylic.thickness, ior: acrylic.ior, roughness: acrylic.cinematicRoughness,
    metalness: 0, envMapIntensity: acrylic.cinematicEnvironment,
    emissive: palette.core, emissiveIntensity: .02,
    transparent: emphasis < 1, opacity: emphasis, depthWrite: true,
  })
  material.name = `runtime:CINEMATIC:${role}`
  return applyAcrylicSurface(material, role)
}
