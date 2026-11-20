import {expect,it,vi} from 'vitest'
import {createSurfaceStack} from './surfaceStack'
const node=(label:string)=>({label})as unknown as HTMLElement
it('keeps a nested menu above its dialog when the child registers first',()=>{
 const stack=createSurfaceStack(),dialog=Symbol('dialog'),menu=Symbol('menu'),child=stack.register(menu,dialog,node('menu')),parent=stack.register(dialog,null,node('dialog'))
 expect(stack.rank(dialog)).toBe(0);expect(stack.rank(menu)).toBe(1);expect(stack.top()?.id).toBe(menu)
 child();expect(stack.top()?.id).toBe(dialog);parent();expect(stack.top()).toBeNull();expect(stack.size).toBe(0)
})
it('puts a later sibling dialog above the whole earlier nested subtree and restores it on close',()=>{
 const stack=createSurfaceStack(),first=Symbol(),menu=Symbol(),second=Symbol()
 const a=stack.register(first,null,node('first')),b=stack.register(menu,first,node('menu')),c=stack.register(second,null,node('second'))
 expect(stack.top()?.id).toBe(second);expect(stack.rank(second)).toBe(2)
 c();expect(stack.top()?.id).toBe(menu);b();expect(stack.top()?.id).toBe(first);a()
})
it('removes an unmounted parent without leaking its child and permits an idempotent cleanup or StrictMode remount',()=>{
 const stack=createSurfaceStack(),first=Symbol(),menu=Symbol(),a=stack.register(first,null,node('first')),b=stack.register(menu,first,node('menu'))
 a();a();expect(stack.size).toBe(1);expect(stack.top()?.id).toBe(menu);b();expect(stack.size).toBe(0)
 const c=stack.register(first,null,node('remount'));expect(stack.rank(first)).toBe(0);c();expect(stack.size).toBe(0)
})
it('notifies only current subscribers and rejects duplicate ownership',()=>{
 const stack=createSurfaceStack(),notify=vi.fn(),unsubscribe=stack.subscribe(notify),id=Symbol(),close=stack.register(id,null,node('one'))
 expect(notify).toHaveBeenCalledOnce();expect(()=>stack.register(id,null,node('duplicate'))).toThrow('already mounted')
 unsubscribe();close();expect(notify).toHaveBeenCalledOnce();expect(stack.top()).toBeNull()
})

it('rejects direct and delayed parent cycles while retaining the original mounted owner',()=>{
 const stack=createSurfaceStack(),a=Symbol(),b=Symbol()
 expect(()=>stack.register(a,a,node('self'))).toThrow('parent cycle')
 const close=stack.register(a,b,node('child first'))
 expect(()=>stack.register(b,a,node('cycle'))).toThrow('parent cycle')
 expect(stack.size).toBe(1);expect(stack.top()?.id).toBe(a);close()
})
