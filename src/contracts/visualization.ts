/** Representation and guidance are presentation choices, never runtime inputs. */
export type VisualizationMode = 'classic' | 'spatial' | 'theater'
export const visualizationModes = [
  { id: 'classic', label: 'Classic', available: true },
  { id: 'spatial', label: 'Spatial', available: true },
  { id: 'theater', label: 'Theater', available: false, reason: 'Person uses standard stack and heap views. Theater becomes available when a specialized representation helps.' },
] as const
