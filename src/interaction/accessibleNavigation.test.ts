import {expect,it} from 'vitest'
import {nextAccessibleEntity,type AccessibleCursor} from './accessibleNavigation'
import type {AccessibleEntity} from './accessibleEntities'
const item=(id:string,y:number,x=0):AccessibleEntity=>({id,label:id,selection:{kind:'object',id},x,y})
const a=item('a',0),b=item('b',1),c=item('c',2),d=item('d',3)
const remembered:AccessibleCursor={recordingId:'one',cursor:12,item:b}
const step=(extra:Partial<Parameters<typeof nextAccessibleEntity>[0]>={})=>nextAccessibleEntity({items:[a,b,c],selectionId:'b',remembered:null,recordingId:'one',cursor:12,direction:1,clamp:false,...extra})
it('returns only an actual catalog entry for ordinary next and previous keys',()=>{expect(step()).toBe(c);expect(step({direction:-1})).toBe(a)})
it('lets Tab leave either end of the visible catalog',()=>{expect(step({selectionId:'c'})).toBeNull();expect(step({selectionId:'a',direction:-1})).toBeNull()})
it('keeps arrow keys at a visible boundary and handles an empty catalog',()=>{expect(step({selectionId:'c',clamp:true})).toBe(c);expect(step({selectionId:'a',direction:-1,clamp:true})).toBe(a);expect(step({items:[],clamp:true})).toBeNull()})
it('enters from the first actual item without an applicable remembered selection',()=>{expect(step({selectionId:null})).toBe(a);expect(step({selectionId:null,direction:-1})).toBeNull()})
it('continues after a selected virtualized cell disappears instead of restarting',()=>{expect(step({items:[a,c,d],remembered})).toBe(c)})
it('returns the actual preceding entity when the selected cell disappears',()=>{expect(step({items:[a,c,d],remembered,direction:-1})).toBe(a)})
it('uses spatial ordering even when a disappearing cell changes catalog ordinals',()=>{const inserted=item('inserted',.5);expect(step({items:[a,inserted,c,d],remembered})).toBe(c)})
it('uses the current visible position over a remembered old projection',()=>{const moved=item('b',2.5);expect(step({items:[a,c,moved,d],remembered})).toBe(d)})
it('rejects remembered traversal from another recording or prefix',()=>{expect(step({items:[a,c,d],remembered,recordingId:'two'})).toBe(a);expect(step({items:[a,c,d],remembered,cursor:13})).toBe(a)})
it('rejects remembered traversal when a different entity was selected elsewhere',()=>{expect(step({items:[a,c,d],selectionId:'elsewhere',remembered})).toBe(a)})
it('does not fabricate a removed item at a remembered outer boundary',()=>{const old={...remembered,item:item('removed',8)};expect(step({items:[a,c],selectionId:'removed',remembered:old})).toBeNull();expect(step({items:[a,c],selectionId:'removed',remembered:old,clamp:true})).toBe(c)})
it('uses the same x and identity tie order as the actual spatial catalog',()=>{const before=item('a',1,1),after=item('c',1,1),old={...remembered,item:item('b',1,1)};expect(step({items:[before,after],remembered:old})).toBe(after)})
