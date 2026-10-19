import {afterEach,expect,it} from 'vitest'
import {createIdeCommandService,executeInspectorCommand,inspectorCommandAvailability,registerWorldCommandSurface,type IdeCommandHost,type InspectorActionState,type InspectorCommandId} from './commands'
let release:(()=>void)|undefined
afterEach(()=>{release?.();release=undefined})
function surface(state:InspectorActionState,calls:InspectorCommandId[]){
 release=registerWorldCommandSurface({hasPresentedFlow:()=>false,canFocusSelection:()=>false,inspection:{state:()=>state,execute:id=>{calls.push(id)}}})
}
it('disabled missing-item actions reject before any handler runs',async()=>{
 const calls:InspectorCommandId[]=[];surface({present:false,sourceAvailable:true,copyAvailable:true},calls)
 for(const id of['view.revealSource','view.copyValue']as const){expect(inspectorCommandAvailability(id)).toMatchObject({enabled:false,reason:'Item is not present at this point in time'});await expect(executeInspectorCommand(id)).rejects.toThrow('not present')}
 expect(calls).toEqual([])
})
it('reveal and copy availability are independent and reevaluated against current mounted evidence',async()=>{
 const state={present:true,sourceAvailable:false,copyAvailable:true},calls:InspectorCommandId[]=[];surface(state,calls)
 expect(inspectorCommandAvailability('view.revealSource')).toMatchObject({enabled:false,reason:'No source line was recorded for this item'})
 await expect(executeInspectorCommand('view.revealSource')).rejects.toThrow('No source line');await executeInspectorCommand('view.copyValue')
 state.sourceAvailable=true;state.copyAvailable=false
 await executeInspectorCommand('view.revealSource');await expect(executeInspectorCommand('view.copyValue')).rejects.toThrow('No captured text')
 expect(calls).toEqual(['view.copyValue','view.revealSource'])
})
it('the projectless command service invokes the same registered actions and disabled reasons',async()=>{
 const state={present:true,sourceAvailable:true,copyAvailable:true},calls:InspectorCommandId[]=[];surface(state,calls)
 const host:IdeCommandHost={snapshot:()=>({projectId:'',workspaceGeneration:0,tabs:[],activePath:null,resources:[],closedDrafts:[],debugState:'inactive',languageReady:false,editorPath:null,shellAvailability:{'view.revealSource':inspectorCommandAvailability('view.revealSource'),'view.copyValue':inspectorCommandAvailability('view.copyValue')}}),operations:{shell:async id=>{if(id!=='view.revealSource'&&id!=='view.copyValue')throw new Error('Unexpected action');await executeInspectorCommand(id)}},prompts:{}}
 const commands=createIdeCommandService(host),context={projectId:'',workspaceGeneration:0}
 expect(commands.availability('view.revealSource',context)).toEqual({enabled:true})
 await commands.execute('view.revealSource',context,{})
 state.sourceAvailable=false
 expect(commands.availability('view.revealSource',context)).toMatchObject({enabled:false,reason:'No source line was recorded for this item'})
 await expect(commands.execute('view.revealSource',context,{})).rejects.toThrow('No source line')
 await commands.execute('view.copyValue',context,{})
 expect(calls).toEqual(['view.revealSource','view.copyValue'])
})
it('retiring an older World cannot clear the newer World action provider',async()=>{
 const olderCalls:InspectorCommandId[]=[],newerCalls:InspectorCommandId[]=[],state={present:true,sourceAvailable:true,copyAvailable:true}
 surface(state,olderCalls);const older=release!
 surface(state,newerCalls);older();await executeInspectorCommand('view.copyValue')
 expect(olderCalls).toEqual([]);expect(newerCalls).toEqual(['view.copyValue'])
})
