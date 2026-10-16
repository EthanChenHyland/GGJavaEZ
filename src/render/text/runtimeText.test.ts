// Original runtimeText cases through current projection, semantic-detail and
// fixed glyph-fit policy; there is no per-label font-growth/density subsystem.
import {describe,expect,it} from 'vitest'
import {PerspectiveCamera,Vector3} from 'three'
import {projectedFontPixels,fitWorldText,textAdvance,worldTextVisible} from './textSystem'
import {nextDetailLevel} from '../../camera/projection'
import {detailLevel} from '../../theme/tokens'
import {runtimeCharacters} from '../../theme/runtimeFont'
describe('current projected runtime label policy',()=>{
 it('uses actual viewport height and depth rather than reserved stack depth',()=>{
  const camera=new PerspectiveCamera(41,2,.1,100);camera.position.set(0,0,10);camera.updateMatrixWorld()
  const small=projectedFontPixels(.24,new Vector3(),camera,400)
  expect(projectedFontPixels(.24,new Vector3(),camera,800)).toBeCloseTo(small*2)
  camera.position.z=20;camera.updateMatrixWorld()
  expect(projectedFontPixels(.24,new Vector3(),camera,400)).toBeCloseTo(small/2)
  expect(projectedFontPixels(.24,new Vector3(0,0,30),camera,400)).toBe(0)
 })
 it('retains semantic detail through hysteresis without oscillating per-label density',()=>{
  const height=900,close=detailLevel.closeH*height,far=detailLevel.farH*height
  expect(nextDetailLevel('CLOSE',close*.99,height)).toBe('CLOSE')
  expect(nextDetailLevel('MEDIUM',close*.99,height)).toBe('MEDIUM')
  expect(nextDetailLevel('FAR',far*1.01,height)).toBe('FAR')
  expect(nextDetailLevel('MEDIUM',far*1.01,height)).toBe('MEDIUM')
 })
 it('bounds priority identities with the same fixed physical font and exact captured label',()=>{
  const source='qualifiedIdentity'.repeat(20),fitted=fitWorldText(source,4.25,.38,600)
  expect(textAdvance(fitted,600)*.38).toBeLessThanOrEqual(4.25);expect(fitted).toContain('…')
  expect(fitWorldText('run()',4.25,.38,600)).toBe('run()')
  expect(source).toBe('qualifiedIdentity'.repeat(20))
 })
 it('preloads one finite shared alphabet with the original runtime symbols',()=>{
  expect(runtimeCharacters.length).toBeLessThan(128);expect(runtimeCharacters).toContain('0123456789');expect(runtimeCharacters).toContain('·→—×')
 })
 it.each([0,3,20,100])('bounds an oversized identity at %s pixels per unit without growing its face',pixels=>{
  const source='oversizedIdentity'.repeat(12),size=.38,text=fitWorldText(source,4.25,size,600)
  expect(textAdvance(text,600)*size).toBeLessThanOrEqual(4.25)
  expect(worldTextVisible(size*pixels)).toBe(size*pixels>=11)
  expect(size).toBe(.38)
 })
})
