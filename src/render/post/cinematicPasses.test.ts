import { expect, it, vi } from 'vitest'
import { Color, Line, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Sprite, Texture, WebGLRenderTarget, type WebGLRenderer } from 'three'
import { CinematicOcclusionPass } from './cinematicPasses'

function fixture() {
  const scene = new Scene(), background = new Color('#071226')
  scene.background = background
  const protection = new Texture()
  const pass = new CinematicOcclusionPass(scene, new PerspectiveCamera(), protection)
  const target = new WebGLRenderTarget(), write = new WebGLRenderTarget(), read = new WebGLRenderTarget()
  let active = target, clear = new Color('#192348'), alpha = .4
  const context = { FRAMEBUFFER: 0x8d40, FRAMEBUFFER_COMPLETE: 0x8cd5,
    checkFramebufferStatus: vi.fn(() => 0x8cd5), getProgramInfoLog: () => 'optional shader link error' }
  const draw = vi.fn()
  const renderer = {
    shadowMap: { autoUpdate: true }, debug: { onShaderError: vi.fn() }, autoClear: true,
    getContext: () => context,
    getRenderTarget: () => active,
    setRenderTarget: vi.fn((value: WebGLRenderTarget) => { active = value }),
    getClearColor: (value: Color) => value.copy(clear), getClearAlpha: () => alpha,
    setClearColor: (value: Color | number, nextAlpha: number) => {
      clear = new Color(value)
      if (nextAlpha !== undefined) alpha = nextAlpha
    },
    setClearAlpha: (nextAlpha: number) => { alpha = nextAlpha },
    clear: vi.fn(), render: draw,
  } as unknown as WebGLRenderer
  return {
    scene, pass, target, background, renderer, draw, context,
    render() { pass.render(renderer, write, read) },
    expectRestored() {
      expect(scene.background).toBe(background); expect(scene.overrideMaterial).toBeNull()
      expect(active).toBe(target); expect(clear.getHexString()).toBe('192348'); expect(alpha).toBe(.4)
      expect(renderer.shadowMap.autoUpdate).toBe(true)
      expect(renderer.autoClear).toBe(true)
    },
    dispose() { pass.dispose(); protection.dispose(); target.dispose(); write.dispose(); read.dispose() },
  }
}

it('restores depthless overlays, connectors, materials and render state when the normal draw is interrupted', () => {
  const f = fixture(), line = new Line(), hidden = new Line(), mesh = new Mesh(), atmosphere = new Sprite()
  const chip = new Mesh(undefined, new MeshBasicMaterial({ depthWrite: false }))
  hidden.visible = false
  atmosphere.userData.runtimeAtmosphere = 'heap'
  f.scene.add(line, hidden, mesh, chip, atmosphere)
  const original = mesh.material
  f.draw.mockImplementation(() => {
    expect(line.visible).toBe(false)
    expect(chip.visible).toBe(false)
    expect(atmosphere.visible).toBe(false)
    expect(mesh.material).not.toBe(original)
    throw new Error('interrupted normal draw')
  })
  try {
    expect(f.render).toThrow('interrupted normal draw')
    expect(f.draw).toHaveBeenCalledOnce()
    expect(line.visible).toBe(true); expect(hidden.visible).toBe(false)
    expect(mesh.material).toBe(original); expect(mesh.visible).toBe(true)
    expect(chip.visible).toBe(true); expect(atmosphere.visible).toBe(true)
    f.expectRestored()
  } finally {
    f.dispose()
    for (const object of [line, hidden, mesh, chip]) {
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
    }
    atmosphere.material.dispose()
  }
})

it('validates exactly the three half-resolution targets once per allocation and restores renderer state', () => {
  const f = fixture()
  try {
    f.pass.setSize(1439, 901)
    f.render()
    expect(f.pass.targetCount).toBe(3)
    const bound = vi.mocked(f.renderer.setRenderTarget).mock.calls.slice(0, 3).map(([target]) => [target?.width, target?.height])
    expect(bound).toEqual([[720, 451], [720, 451], [720, 451]])
    expect(f.context.checkFramebufferStatus).toHaveBeenCalledTimes(3)
    // Normal scene, AO, denoise and resolve only. Glyph coverage is reused.
    expect(f.draw).toHaveBeenCalledTimes(4)
    f.render()
    expect(f.context.checkFramebufferStatus).toHaveBeenCalledTimes(3)
    f.pass.setSize(761, 899)
    f.render()
    expect(f.context.checkFramebufferStatus).toHaveBeenCalledTimes(6)
    f.expectRestored()
  } finally {
    f.dispose()
  }
})

it('rejects an incomplete optional framebuffer and captures shader linker failure without losing the previous handler', () => {
  const f = fixture(), prior = f.renderer.debug.onShaderError
  try {
    f.context.checkFramebufferStatus.mockReturnValueOnce(0)
    expect(f.render).toThrow('Cinematic occlusion framebuffer is incomplete')
    expect(f.draw).not.toHaveBeenCalled()
    expect(f.renderer.debug.onShaderError).toBe(prior)
    f.expectRestored()
    f.draw.mockImplementationOnce(() => {
      f.renderer.debug.onShaderError!(f.context as unknown as WebGL2RenderingContext, {} as never, {} as WebGLShader, {} as WebGLShader)
    })
    expect(f.render).toThrow('optional shader link error')
    expect(f.renderer.debug.onShaderError).toBe(prior)
    f.expectRestored()
  } finally {
    f.dispose()
  }
})
