// Successors for the retired faceText corpus. Font metrics and marked middle
// truncation replace character-width guesses and dynamic font shrinking.
import {expect,it} from 'vitest'
import {fitWorldText,localFontText,textAdvance} from './textSystem'
import {faceColumns} from './faceTypography'
import {valueText} from '../../world/valueText'
import {world} from '../../theme/tokens'
it('keeps the current fixed face font inside the shared physical row chip, including mutation emphasis',()=>{
 for(const pitch of[world.frame.row,world.object.row])expect(.34*1.06).toBeLessThan(pitch*.73)
 for(const height of[.31,.44])expect(.16*1.06).toBeLessThan(height)
})
it('keeps fitting captured scalars/references exact and marks long summaries',()=>{
 for(const text of['18','→ #17'])expect(fitWorldText(text,1.2,.24)).toBe(text)
 expect(fitWorldText('"twelve observed fields"',1.2,.24)).toContain('…')
})
it('keeps Unicode code-point escape groups whole through bounded truncation',()=>{
 const input='🟣🟦🟨🟥🟩',fitted=fitWorldText(input,30,.24,400,0,4)
 expect(fitted).toContain('…');expect(fitted).not.toMatch(/[\ud800-\udfff]/u)
 const groups=fitted.split('…').flatMap(part=>part.match(/\\u[0-9a-f]{4}/g)??[])
 expect(groups.length%2).toBe(0)
 for(let index=0;index<groups.length;index+=2){expect(groups[index]).toMatch(/^\\ud[89ab]/);expect(groups[index+1]).toMatch(/^\\ud[cdef]/)}
 expect(input).toBe('🟣🟦🟨🟥🟩')
})
it('escapes multiline/control glyphs on the face while preserving captured Java String evidence',()=>{
 const original='a\nb\rc\td\u0000\u2028🟣',value=valueText({kind:'stringSummary',javaType:'String',value:original})
 const face=fitWorldText(value.text,100,.24)
 for(const control of['\n','\r','\t','\u0000','\u2028'])expect(face).not.toContain(control)
 expect(value.exact).toContain('a\\nb\\rc\\td\\u0000');expect(original).toContain('\n')
})
it('bounds long identifiers and generic types using actual fixed-font advances and a marked summary',()=>{
 for(const value of['local'.repeat(40),'Map<String,List<Map<Long,List<CharSequence>>>>']){
  const fitted=fitWorldText(value,1.2,.24);expect(fitted).toContain('…');expect(textAdvance(fitted)*.24).toBeLessThanOrEqual(1.2)
 }
})
it('preserves the moderate nested-class spelling while fitting each actual fixed-font width',()=>{
 const source='DebugShape$Cell',text=fitWorldText(source,3.12,.37)
 expect(text).toContain('…');expect(textAdvance(text)*.37).toBeLessThanOrEqual(3.12)
 expect(fitWorldText(source,3.12,.3)).toBe(source);expect(source).toBe('DebugShape$Cell')
})
it.each([3.8,5.1,4.7])('keeps name/type/value columns disjoint on the original %s-unit face',width=>{
 const columns=faceColumns(width),available=width-.56
 expect(columns.name).toBeLessThan(columns.typeOffset)
 expect(columns.typeOffset+columns.type).toBeLessThan(columns.valueOffset)
 expect(columns.valueOffset+columns.value).toBeLessThan(available)
})
it('retains short values exactly and marks unavailable long content without changing fixed font size',()=>{
 for(const value of['18','→ #17'])expect(fitWorldText(value,1.2,.24)).toBe(value)
 const original='unavailable (local_capture_failed)',fitted=fitWorldText(original,1.2,.29)
 expect(fitted).toContain('…');expect(textAdvance(fitted)*.29).toBeLessThanOrEqual(1.2)
 expect(localFontText(original)).toBe(original)
})
