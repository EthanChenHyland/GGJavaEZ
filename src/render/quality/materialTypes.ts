import type { MeshPhysicalMaterial } from 'three'
export type BodyRole = 'stack' | 'heap' | 'class' | 'exception'
export interface CinematicMaterialModule { createCinematicBody(role: BodyRole, emphasis: number): MeshPhysicalMaterial }
