import {expect,it} from 'vitest'
import {withinMillisecondBudget} from './millisecondBudget'

it('compares a known interval independently of binary subtraction at a large clock origin',()=>{
 const duration=(1_000_000_000+16.7)-1_000_000_000
 expect(duration).toBeGreaterThan(16.7)
 expect(withinMillisecondBudget(duration,16.7)).toBe(true)
 expect(duration).toBe(16.700000047683716)
})
it('keeps the fixed boundaries and rejects excesses of one nanosecond or more',()=>{
 for(const budget of[16.7,33.3,55,112,125,152,5300]){
  expect(withinMillisecondBudget(budget,budget)).toBe(true)
  expect(withinMillisecondBudget(budget+.000001,budget)).toBe(false)
 }
 expect(withinMillisecondBudget(66.360333,55)).toBe(false)
 expect(withinMillisecondBudget(79.585208,55)).toBe(false)
})
it('rejects missing, nonfinite and negative observations or budgets',()=>{
 for(const invalid of[NaN,Infinity,-Infinity,-1]){
  expect(withinMillisecondBudget(invalid,16.7)).toBe(false)
  expect(withinMillisecondBudget(16.7,invalid)).toBe(false)
 }
})
