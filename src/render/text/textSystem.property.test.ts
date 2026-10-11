import {expect,it} from 'vitest'
import fc from 'fast-check'
import {PerspectiveCamera,Vector3} from 'three'
import {fitWorldText,localFontText,projectedFontPixels,projectedPlaneFontPixels,textAdvance,worldTextVisible} from './textSystem'
it('fits captured Unicode text without splitting code points or consulting asynchronous glyph layout',()=>{
 fc.assert(fc.property(fc.array(fc.integer({min:32,max:0x10ffff}),{maxLength:100}),fc.double({min:.01,max:10,noNaN:true}),fc.constantFrom(400 as const,500 as const,600 as const),(codes,width,weight)=>{
  const text=String.fromCodePoint(...codes),fitted=fitWorldText(text,width,.32,weight)
  expect(textAdvance(fitted,weight)*.32).toBeLessThanOrEqual(width+1e-9)
  expect(fitWorldText(text,width,.32,weight)).toBe(fitted)
  expect(fitted).not.toMatch(/(?<!\\u[0-9a-f]{4})[\ud800-\udfff]/u)
 }),{numRuns:100})
})
it('Property 64: font visibility uses the actual projected size, including clip planes and the 11 CSS px boundary',()=>{
 fc.assert(fc.property(fc.double({min:.05,max:200,noNaN:true}),fc.double({min:.1,max:1,noNaN:true}),fc.integer({min:650,max:1117}),(depth,size,height)=>{
  const camera=new PerspectiveCamera(36,16/9,.05,10000);camera.updateMatrixWorld()
  const pixels=projectedFontPixels(size,new Vector3(0,0,-depth),camera,height)
  expect(pixels).toBeCloseTo(size*height/(2*Math.tan(Math.PI/10)*depth),7)
  expect(worldTextVisible(pixels)).toBe(pixels>=11)
  expect(worldTextVisible(projectedFontPixels(size,new Vector3(0,0,depth),camera,height))).toBe(false)
 }),{numRuns:100})
 expect(worldTextVisible(11)).toBe(true);expect(worldTextVisible(10.999)).toBe(false)
 expect(worldTextVisible(11.999,12)).toBe(false);expect(worldTextVisible(12,12)).toBe(true)
})
it('uses local glyph escapes and deterministic Inter advances including real pair kerning',()=>{
 for(const weight of [400,500,600] as const) expect(localFontText('⟨not captured⟩',weight)).toBe('⟨not captured⟩')
 expect(localFontText('😀')).toBe('\\ud83d\\ude00')
 expect(textAdvance('AV',500)).toBeLessThan(textAdvance('A',500)+textAdvance('V',500))
 expect(fitWorldText('Person.main(java.lang.String[])',2,.4,600,0,28)).toContain('…')
})
it('measures horizontal and vertical face foreshortening independently at the same readable nominal size',()=>{
 const viewport={width:1440,height:900},camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000),point=new Vector3()
 camera.position.set(0,0,10);camera.lookAt(point);camera.updateMatrixWorld()
 const nominal=projectedFontPixels(.28,point,camera,viewport.height)
 expect(projectedPlaneFontPixels(.28,point,camera,viewport,'x')).toBeCloseTo(nominal,6)
 expect(projectedPlaneFontPixels(.28,point,camera,viewport)).toBeCloseTo(nominal,6)
 camera.position.set(Math.sqrt(75),0,5);camera.lookAt(point);camera.updateMatrixWorld()
 expect(projectedFontPixels(.28,point,camera,viewport.height)).toBeCloseTo(nominal,6)
 expect(projectedPlaneFontPixels(.28,point,camera,viewport)).toBeCloseTo(nominal,6)
 expect(projectedPlaneFontPixels(.28,point,camera,viewport,'x')).toBeLessThan(nominal*.51)
 expect(projectedPlaneFontPixels(.28,new Vector3(0,0,10000),camera,viewport,'x')).toBe(0)
})
