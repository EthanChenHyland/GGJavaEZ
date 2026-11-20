import {expect,it} from 'vitest'
import {parseLaunchConfigDraft} from './launchConfigDraft'
it('preserves exact main, working-directory and each JSON argument without shell splitting or trimming',()=>{
 const draft={mainClass:'app.Entry',workingDirectory:' folder with spaces ',program:JSON.stringify(['',' two words ','"quoted"','<&>','🟣']),jvm:JSON.stringify(['-Xmx256m','-Dkey=two words'])},before=JSON.stringify(draft)
 expect(parseLaunchConfigDraft(draft)).toEqual({mainClass:'app.Entry',workingDirectory:' folder with spaces ',programArgs:['',' two words ','"quoted"','<&>','🟣'],jvmArgs:['-Xmx256m','-Dkey=two words']})
 expect(JSON.stringify(draft)).toBe(before)
})
it.each(['null','{}','"text"','[1]','["valid",null]'])('rejects invalid argument shape %s without altering the draft',input=>{
 const draft={mainClass:'',workingDirectory:'.',program:input,jvm:'[]'},before=JSON.stringify(draft)
 expect(()=>parseLaunchConfigDraft(draft)).toThrow('Arguments must be JSON arrays of strings.');expect(JSON.stringify(draft)).toBe(before)
 expect(()=>parseLaunchConfigDraft({...draft,program:'[]',jvm:input})).toThrow('Arguments must be JSON arrays of strings.')
})
it('retains the unselected-main default and reports malformed JSON instead of changing arguments',()=>{
 expect(parseLaunchConfigDraft({mainClass:'',workingDirectory:'.',program:'[]',jvm:'[]'})).toEqual({mainClass:'',workingDirectory:'.',programArgs:[],jvmArgs:[]})
 expect(()=>parseLaunchConfigDraft({mainClass:'',workingDirectory:'.',program:'[',jvm:'[]'})).toThrow()
})
