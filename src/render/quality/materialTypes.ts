import type { MeshPhysicalMaterial } from 'three'
export type BodyRole = 'stack' | 'heap' | 'class'
export interface CinematicMaterialModule { createCinematicBody(role: BodyRole, emphasis: number): MeshPhysicalMaterial }
