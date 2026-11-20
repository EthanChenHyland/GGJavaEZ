import {expect,it} from 'vitest'
import fc from 'fast-check'
import {returnCaptionLines,returnCaptionStyle} from './returnCaptions'
import {textAdvance} from './text/textSystem'
it('fits captured values and operands independently without losing the return prefix or inventing an operand line (100 runs)',()=>{
 fc.assert(fc.property(fc.string({maxLength:1000}),value=>{
  const lines=returnCaptionLines(value,null)
  expect(lines.primary.startsWith('return ')).toBe(true);expect(lines.operands).toBeNull()
  expect(textAdvance(lines.primary,600)*returnCaptionStyle.size).toBeLessThanOrEqual(returnCaptionStyle.width)
 }),{numRuns:100})
})
it('keeps short recorded values and source-ordered operand text exact at the prescribed secondary scale',()=>{
 expect(returnCaptionLines('6','3 × 2')).toEqual({primary:'return 6',operands:'3 × 2'})
 expect(returnCaptionLines('null',null)).toEqual({primary:'return null',operands:null})
 expect(returnCaptionStyle.operandRatio).toBeGreaterThanOrEqual(.6);expect(returnCaptionStyle.operandRatio).toBeLessThanOrEqual(.7)
})
