import {expect,it,vi} from 'vitest'
import {retirePresentationPreferences} from './presentationPreferences'
it('removes only the four retired settings, preserving project, draft, source bindings and recordings across repeat startup',()=>{
 const retained=[['ggjavaez:project','project'],['ggjavaez:draft:project:Main.java','unsaved Java'],['ggjavaez:source-bindings:project:run','captured binding'],['saved-recording','exact recording']]as const
 const values=new Map<string,string>([...retained,['ggjavaez:runtime-view','classic'],['ggjavaez:animation-quality','low'],['ggjavaez:p5:source-width','60'],['ggjavaez:m8:explorer','true']])
 const storage={removeItem:(key:string)=>{values.delete(key)}}
 retirePresentationPreferences(storage);expect([...values]).toEqual(retained)
 retirePresentationPreferences(storage);expect([...values]).toEqual(retained)
})
it('continues narrow cleanup when storage rejects a key and never prevents startup',()=>{
 const removeItem=vi.fn((key:string)=>{if(key==='ggjavaez:runtime-view')throw new Error('Storage blocked')})
 expect(()=>retirePresentationPreferences({removeItem})).not.toThrow()
 expect(removeItem.mock.calls.map(([key])=>key)).toEqual(['ggjavaez:runtime-view','ggjavaez:animation-quality','ggjavaez:p5:source-width','ggjavaez:m8:explorer'])
})
