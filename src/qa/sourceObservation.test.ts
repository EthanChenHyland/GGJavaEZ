import {expect,it,vi} from 'vitest'
import {observeSource,registerSourceObservation} from './sourceObservation'
it('an old lazy editor disposal cannot remove the current editor observer',()=>{
 const old=registerSourceObservation(()=>null),read=vi.fn(()=>null),current=registerSourceObservation(read)
 old();observeSource();expect(read).toHaveBeenCalledOnce()
 current();observeSource();expect(read).toHaveBeenCalledOnce()
})
