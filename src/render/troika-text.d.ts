declare module 'troika-three-text' {
  import type { Mesh, Material, ColorRepresentation } from 'three'
  export class Text extends Mesh {
    text: string
    font: string
    letterSpacing: number
    fontSize: number
    fontWeight: number
    maxWidth: number
    whiteSpace: string
    anchorX: string
    anchorY: string
    color: ColorRepresentation
    fillOpacity: number
    readonly textRenderInfo: { blockBounds: readonly number[]; glyphBounds: Float32Array } | null
    material: Material
    sync(callback?: () => void): void
    dispose(): void
  }
  export class BatchedText extends Text {
    addText(text: Text): void
    removeText(text: Text): void
    dispose(): void
  }
  export function preloadFont(options: { font: string; characters: string; sdfGlyphSize: number }, callback: () => void): void
}
