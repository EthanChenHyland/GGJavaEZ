import type { MeshPhysicalMaterial } from 'three'
export type BodyRole = 'stack' | 'heap' | 'class' | 'exception' | 'stdin' | 'stdout' | 'stderr'
export interface CinematicMaterialModule { createCinematicBody(role: BodyRole, emphasis: number): MeshPhysicalMaterial }
