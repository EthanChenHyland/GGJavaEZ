import { Color, Matrix4, MeshBasicMaterial, PerspectiveCamera, ShaderLib, Vector3, type InstancedMesh, type Scene, type WebGLRenderer, type WebGLRenderTarget } from 'three'
import { expect, it, vi } from 'vitest'
import type { WorldAnchor } from '../../contracts/world'
import { FocusTextMask } from './focusTextMask'
import { unitRoundedBox } from '../geometry/roundedBox'
import { BatchedText } from 'troika-three-text'

function renderer(fail=false) {
  const priorTarget={},state={target:priorTarget,offscreen:null as WebGLRenderTarget|null,color:new Color('#123456'),alpha:.4,rendered:null as Scene|null}
  const gl={autoClear:false,shadowMap:{autoUpdate:true},getDrawingBufferSize:(size:Vector3)=>size.set(760,900,0),getRenderTarget:()=>state.target,
    setRenderTarget:(target:object)=>{state.target=target;if(target!==priorTarget)state.offscreen=target as WebGLRenderTarget},getClearAlpha:()=>state.alpha,getClearColor:(color:Color)=>color.copy(state.color),
    setClearColor:(color:Color,alpha:number)=>{state.color.set(color);state.alpha=alpha},clear:vi.fn(),render:vi.fn((scene:Scene)=>{state.rendered=scene;if(fail)throw new Error('mask context interruption')})}
  return{gl:gl as unknown as WebGLRenderer,state,priorTarget}
}
const anchor={position:[2,-3,4],size:[4.8,3.2,1.1]} as unknown as WorldAnchor

it('allocates no mask draw outside Focus and uses the actual rounded target without moving its anchor',()=>{
  const mask=new FocusTextMask(),{gl,state,priorTarget}=renderer(),saved=JSON.stringify(anchor),camera=new PerspectiveCamera()
  mask.render(gl,camera);expect(gl.render).not.toHaveBeenCalled();expect(mask.uniforms.runtimeFocusTextMask.value).toBeNull()
  mask.anchor=anchor;mask.render(gl,camera)
  expect(mask.uniforms.runtimeFocusTextEnabled.value).toBe(1)
  expect(mask.uniforms.runtimeFocusTextMask.value?.image).toMatchObject({width:760,height:900})
  const solid=state.rendered!.children[0] as InstancedMesh,transform=new Matrix4()
  solid.getMatrixAt(0,transform)
  expect(solid.geometry).toBe(unitRoundedBox)
  expect(new Vector3().setFromMatrixPosition(transform).toArray()).toEqual(anchor.position)
  const scale=new Vector3().setFromMatrixScale(transform).toArray()
  scale.forEach((value,index)=>expect(value).toBeCloseTo(anchor.size[index]))
  expect(JSON.stringify(anchor)).toBe(saved);expect(state.target).toBe(priorTarget)
  expect(state.color.getHexString()).toBe('123456');expect(state.alpha).toBe(.4)
  expect(gl.autoClear).toBe(false);expect(gl.shadowMap.autoUpdate).toBe(true)
  const dispose=vi.fn();state.offscreen!.addEventListener('dispose',dispose)
  mask.anchor=null;mask.render(gl,camera);expect(mask.uniforms.runtimeFocusTextEnabled.value).toBe(0)
  expect(gl.render).toHaveBeenCalledOnce();mask.dispose();expect(dispose).toHaveBeenCalledOnce()
})

it('restores renderer state and disables sampling after a failed mask submission',()=>{
  const mask=new FocusTextMask(),{gl,state,priorTarget}=renderer(true)
  mask.anchor=anchor
  expect(()=>mask.render(gl,new PerspectiveCamera())).toThrow('mask context interruption')
  expect(mask.uniforms.runtimeFocusTextEnabled.value).toBe(0)
  expect(state.target).toBe(priorTarget);expect(state.color.getHexString()).toBe('123456');expect(state.alpha).toBe(.4)
  expect(gl.autoClear).toBe(false);expect(gl.shadowMap.autoUpdate).toBe(true);mask.dispose()
})

it('enables sampling only for the camera that produced the mask, independent of reflection pass order',()=>{
  const mask=new FocusTextMask(),{gl}=renderer(),main=new PerspectiveCamera(),reflection=new PerspectiveCamera()
  mask.anchor=anchor;mask.render(gl,main)
  for(let frame=0;frame<3;frame++){
    mask.prepareText(reflection);expect(mask.uniforms.runtimeFocusTextEnabled.value).toBe(0)
    mask.prepareText(main);expect(mask.uniforms.runtimeFocusTextEnabled.value).toBe(1)
    mask.render(gl,main)
    mask.prepareText(main);expect(mask.uniforms.runtimeFocusTextEnabled.value).toBe(1)
    mask.prepareText(reflection);expect(mask.uniforms.runtimeFocusTextEnabled.value).toBe(0)
  }
  mask.anchor=null;mask.prepareText(main);expect(mask.uniforms.runtimeFocusTextEnabled.value).toBe(0);mask.dispose()
})

it('classifies semantic glyph opacity before antialiasing and shares live renderer uniforms',()=>{
  const mask=new FocusTextMask(),material=new MeshBasicMaterial(),shader={vertexShader:ShaderLib.basic.vertexShader,fragmentShader:ShaderLib.basic.fragmentShader,uniforms:{}}
  mask.apply(material);material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0],{} as WebGLRenderer)
  expect(shader.uniforms).toMatchObject(mask.uniforms)
  expect(shader.fragmentShader).toContain('uTroikaFillOpacity <= 0.25')
  expect(shader.fragmentShader).not.toContain('gl_FragColor.a <= 0.25')
  material.dispose();mask.dispose()
})

it('compiles through the installed Troika batch derivation with per-text opacity intact',()=>{
  const mask=new FocusTextMask(),base=new MeshBasicMaterial(),batch=new BatchedText()
  mask.apply(base);batch.material=base
  const shader={vertexShader:ShaderLib.basic.vertexShader,fragmentShader:ShaderLib.basic.fragmentShader,uniforms:{}}
  batch.material.onBeforeCompile(shader as Parameters<typeof base.onBeforeCompile>[0],{} as WebGLRenderer)
  expect(shader.fragmentShader).toMatch(/varying\s+float\s+uTroikaFillOpacity/)
  expect(shader.fragmentShader).toContain('runtimeFocusTextEnabled > 0.5 && uTroikaFillOpacity <= 0.25')
  expect(shader.vertexShader).toContain('uTroikaFillOpacity = data.y')
  expect(shader.uniforms).toMatchObject(mask.uniforms)
  const disposed=vi.fn();batch.material.addEventListener('dispose',disposed)
  base.dispose();expect(disposed).toHaveBeenCalledOnce();batch.dispose();mask.dispose()
})
