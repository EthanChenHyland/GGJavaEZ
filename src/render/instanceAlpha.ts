import { MeshBasicMaterial } from 'three'
/** Bounded endpoint/arrow batches retain each curve's alpha rather than RGB dimming. */
export function instanceAlphaMaterial(): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ color: 'white', toneMapped: false, transparent: true, depthWrite: false })
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float runtimeAlpha; varying float instanceAlpha;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ninstanceAlpha = runtimeAlpha;')
    shader.fragmentShader = 'varying float instanceAlpha;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= instanceAlpha;')
  }
  material.customProgramCacheKey = () => 'runtime-endpoint-alpha-v1'
  return material
}
