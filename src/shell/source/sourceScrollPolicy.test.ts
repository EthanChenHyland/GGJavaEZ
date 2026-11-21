import {expect,it} from 'vitest'
import fc from 'fast-check'
import {createSourceScrollPolicy,firstVisibleLineForMiddleThird,type SourceScrollTarget} from './sourceScrollPolicy'
const visible={first:10,last:30}
const target=(mark:SourceScrollTarget['mark'],line=80,key:string=mark):SourceScrollTarget=>({mark,line,key})
it('centres once per captured pause and keeps subsequent manual scrolling until the next pause',()=>{
 const policy=createSourceScrollPolicy()
 expect(policy.decide(target('paused'),visible,'session:10:f1:80',0)).toBe('middle-third')
 policy.manualScroll(20)
 expect(policy.decide(target('paused'),visible,'session:10:f1:80',4000)).toBe('none')
 expect(policy.decide(target('paused'),visible,'session:11:f1:80',4001)).toBe('middle-third')
})
it('does not consume a pause while a higher-priority Focus or History location is presented',()=>{
 const policy=createSourceScrollPolicy()
 expect(policy.decide(target('focus'),visible,'p1',0)).toBe('reveal')
 expect(policy.decide(target('paused'),visible,'p1',1)).toBe('middle-third')
 expect(policy.decide(target('history',80,'cursor:7'),visible,'p1',2)).toBe('reveal')
 expect(policy.decide(target('paused'),visible,'p1',3)).toBe('none')
 expect(policy.decide(target('focus',80,'focus:new'),visible,'p2',4)).toBe('reveal')
 expect(policy.decide(target('paused'),visible,'p2',5)).toBe('middle-third')
})
it('a real resume resets once-per-pause even if the next captured identity is unchanged',()=>{
 const policy=createSourceScrollPolicy()
 expect(policy.decide(target('paused'),visible,'p1',0)).toBe('middle-third')
 policy.decide({...target('running'),line:null},visible,null,1)
 expect(policy.decide(target('paused'),visible,'p1',2)).toBe('middle-third')
})
it('running follow reveals only an outside line and is suppressed for exactly two seconds after the latest manual scroll',()=>{
 const policy=createSourceScrollPolicy()
 expect(policy.decide(target('running',20),visible,null,0)).toBe('none')
 expect(policy.decide(target('running'),visible,null,0)).toBe('reveal')
 policy.manualScroll(100)
 expect(policy.decide(target('running'),visible,null,2099)).toBe('none')
 expect(policy.decide(target('running'),visible,null,2100)).toBe('reveal')
 policy.manualScroll(2000)
 expect(policy.decide(target('running'),visible,null,3999)).toBe('none')
 expect(policy.decide(target('running'),visible,null,4000)).toBe('reveal')
})
it('new Focus targets and History cursors can reveal the same line, while resizing or repainting cannot undo manual scrolling',()=>{
 const policy=createSourceScrollPolicy()
 expect(policy.decide(target('history',80,'cursor:7'),visible,null,0)).toBe('reveal')
 policy.manualScroll(1)
 expect(policy.decide(target('history',80,'cursor:7'),visible,null,2)).toBe('none')
 expect(policy.decide(target('history',80,'cursor:8'),visible,null,3)).toBe('reveal')
 expect(policy.decide(target('focus',80,'focus:o1'),visible,null,4)).toBe('reveal')
 expect(policy.decide(target('focus',80,'focus:o2'),visible,null,5)).toBe('reveal')
})
it('an unavailable source or unmounted editor does not consume a pending pause',()=>{
 const policy=createSourceScrollPolicy()
 expect(policy.decide({...target('paused'),line:null},visible,'p1',0)).toBe('none')
 expect(policy.decide(target('paused'),null,'p1',1)).toBe('none')
 expect(policy.decide(target('paused'),visible,'p1',2)).toBe('middle-third')
})
it('restores a clipped History line on resize until the user takes over scrolling',()=>{
 const policy=createSourceScrollPolicy(),history=target('history',22,'cursor:12'),shorter={first:10,last:20}
 expect(policy.decide(history,visible,null,0)).toBe('none')
 expect(policy.decide(history,shorter,null,1,true)).toBe('reveal')
 policy.manualScroll(2)
 expect(policy.decide(history,shorter,null,3000,true)).toBe('none')
 expect(policy.decide({...history,key:'cursor:13'},shorter,null,3001)).toBe('reveal')
})
it('Property 10: middle-third scrolling stays at the closest permitted centre at file boundaries (100 cases)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:2000}),fc.integer({min:3,max:120}),fc.nat(),(total,count,n)=>{
  const line=n%total+1,first=firstVisibleLineForMiddleThird(line,count,total),last=Math.min(total,first+count-1)
  expect(first).toBeGreaterThanOrEqual(1);expect(last).toBeLessThanOrEqual(total)
  expect(first).toBeLessThanOrEqual(line);expect(last).toBeGreaterThanOrEqual(line)
  if(first>1&&last<total){const fraction=(line-first)/(count-1);expect(fraction).toBeGreaterThanOrEqual(1/3);expect(fraction).toBeLessThanOrEqual(2/3)}
  const distance=Math.abs(line-(first+(count-1)/2))
  for(const candidate of [first-1,first+1])if(candidate>=1&&candidate<=Math.max(1,total-count+1))expect(Math.abs(line-(candidate+(count-1)/2))).toBeGreaterThanOrEqual(distance)
 }),{numRuns:100})
})
