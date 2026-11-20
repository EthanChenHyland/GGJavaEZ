import { expect, it, vi } from 'vitest'
import { Color, Line, Mesh, PerspectiveCamera, Scene, WebGLRenderTarget, type WebGLRenderer } from 'three'
import { CinematicOcclusionPass } from './cinematicPasses'

it('restores connector visibility, materials and render state when the normal draw is interrupted', () => {
  const scene = new Scene(), line = new Line(), hidden = new Line(), mesh = new Mesh()
  hidden.visible = false; scene.add(line, hidden, mesh)
  const original = mesh.material, background = new Color('#071226')
  scene.background = background
  const pass = new CinematicOcclusionPass(scene, new PerspectiveCamera()), target = new WebGLRenderTarget(), write = new WebGLRenderTarget(), read = new WebGLRenderTarget()
  let active = target, clear = new Color('#192348'), alpha = .4
  const render = vi.fn(() => {
    expect(line.visible).toBe(false)
    expect(mesh.material).not.toBe(original)
    throw new Error('interrupted normal draw')
  })
  const renderer = {
    shadowMap: { autoUpdate: true },
    getRenderTarget: () => active, setRenderTarget: (value: WebGLRenderTarget) => { active = value },
    getClearColor: (value: Color) => value.copy(clear), getClearAlpha: () => alpha,
    setClearColor: (value: Color | number, nextAlpha: number) => { clear = new Color(value); alpha = nextAlpha },
    clear: vi.fn(), render,
  } as unknown as WebGLRenderer
  try {
    expect(() => pass.render(renderer, write, read)).toThrow('interrupted normal draw')
    expect(render).toHaveBeenCalledOnce()
    expect(line.visible).toBe(true); expect(hidden.visible).toBe(false)
    expect(mesh.material).toBe(original); expect(mesh.visible).toBe(true)
    expect(scene.background).toBe(background); expect(scene.overrideMaterial).toBeNull()
    expect(active).toBe(target); expect(clear.getHexString()).toBe('192348'); expect(alpha).toBe(.4)
    expect(renderer.shadowMap.autoUpdate).toBe(true)
  } finally {
    pass.dispose(); target.dispose(); write.dispose(); read.dispose(); mesh.geometry.dispose()
    for (const material of Array.isArray(original) ? original : [original]) material.dispose()
    for (const connector of [line, hidden]) { connector.geometry.dispose(); for (const material of Array.isArray(connector.material) ? connector.material : [connector.material]) material.dispose() }
  }
})
