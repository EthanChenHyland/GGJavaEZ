import fc from 'fast-check'
import {expect,it,vi} from 'vitest'
import {dispatchShellShortcut,type ShellKeyboardHost,type ShellKeyEvent} from './keyboard'
import type {IdeCommandId} from '../ide/commands'
import type {Platform,ShortcutFocus} from '../ide/shortcuts'
const world:ShortcutFocus={world:true,editor:false,textInput:false,shellSurface:false}
const editor:ShortcutFocus={world:false,editor:true,textInput:true,shellSurface:true}
function key(code:string,changes:Partial<ShellKeyEvent>={}){
 return{code,key:code,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,defaultPrevented:false,isComposing:false,preventDefault:vi.fn(),stopPropagation:vi.fn(),...changes}
}
function host(changes:Partial<ShellKeyboardHost>={}){
 return{platform:'mac' as Platform,blocked:false,busy:false,navigation:vi.fn(()=>({inspectorOpen:false,focusActive:false,traceActive:false})),available:vi.fn(()=>true),invoke:vi.fn(),...changes} satisfies ShellKeyboardHost
}
it('Property16: Save chords use the physical code and exact platform modifiers, including disabled and busy states',()=>{
 fc.assert(fc.property(fc.constantFrom<Platform>('mac','windows','linux'),fc.boolean(),fc.boolean(),fc.boolean(),fc.boolean(),fc.string({maxLength:8}),fc.boolean(),fc.boolean(),(platform,ctrlKey,metaKey,altKey,shiftKey,glyph,enabled,busy)=>{
  const event=key('KeyS',{key:glyph,ctrlKey,metaKey,altKey,shiftKey}),ports=host({platform,busy,available:vi.fn(()=>enabled)})
  const primary=platform==='mac'?metaKey&&!ctrlKey:ctrlKey&&!metaKey
  const expected=primary&&!altKey?(shiftKey?'file.saveAll':'file.save'):null
  expect(dispatchShellShortcut(event,editor,ports)).toBe(expected)
  expect(event.preventDefault).toHaveBeenCalledTimes(expected?1:0);expect(event.stopPropagation).toHaveBeenCalledTimes(expected?1:0)
  if(expected&&enabled&&!busy)expect(ports.invoke).toHaveBeenCalledExactlyOnceWith(expected);else expect(ports.invoke).not.toHaveBeenCalled()
 }),{numRuns:300})
})
const chords:{id:IdeCommandId;code:string;alt?:boolean;shift?:boolean;primary?:boolean;editor?:boolean;duringBusy:boolean}[]=[
 {id:'execution.run',code:'KeyR',alt:true,shift:true,duringBusy:false},
 {id:'debug.startOrContinue',code:'F5',duringBusy:false},
 {id:'debug.stepOver',code:'F10',duringBusy:false},
 {id:'workbench.quickOpen',code:'KeyP',primary:true,duringBusy:true},
 {id:'workbench.commandPalette',code:'F1',duringBusy:true},
 {id:'navigation.home',code:'KeyH',duringBusy:true},
 {id:'navigation.focusSelection',code:'KeyF',alt:true,shift:true,duringBusy:true},
 {id:'java.renameSymbol',code:'F2',editor:true,duringBusy:false},
]
it.each(chords)('Property16: $id consumes its chord once and honors availability while busy',chord=>{
 fc.assert(fc.property(fc.constantFrom<Platform>('mac','windows','linux'),fc.boolean(),fc.boolean(),fc.string({maxLength:8}),(platform,enabled,busy,glyph)=>{
  const event=key(chord.code,{key:glyph,altKey:!!chord.alt,shiftKey:!!chord.shift,metaKey:!!chord.primary&&platform==='mac',ctrlKey:!!chord.primary&&platform!=='mac'}),ports=host({platform,busy,available:vi.fn(()=>enabled)})
  expect(dispatchShellShortcut(event,chord.editor?editor:world,ports)).toBe(chord.id)
  expect(event.preventDefault).toHaveBeenCalledOnce();expect(event.stopPropagation).toHaveBeenCalledOnce()
  if(enabled&&(!busy||chord.duringBusy))expect(ports.invoke).toHaveBeenCalledExactlyOnceWith(chord.id);else expect(ports.invoke).not.toHaveBeenCalled()
 }),{numRuns:100})
})
it('leaves composing, already-consumed and blocked-surface keys entirely with their owner',()=>{
 for(const kind of ['composing','consumed','surface']){
  const event=key('F1',{isComposing:kind==='composing',defaultPrevented:kind==='consumed'}),ports=host({blocked:kind==='surface'})
  expect(dispatchShellShortcut(event,world,ports)).toBeNull();expect(event.preventDefault).not.toHaveBeenCalled();expect(event.stopPropagation).not.toHaveBeenCalled();expect(ports.navigation).not.toHaveBeenCalled();expect(ports.available).not.toHaveBeenCalled();expect(ports.invoke).not.toHaveBeenCalled()
 }
})
it('leaves Home typing to editor/input/Shell surfaces and unbound browser chords untouched',()=>{
 for(const focus of [editor,{...world,world:false},{...world,textInput:true},{...world,shellSurface:true}]){
  const event=key('KeyH'),ports=host();expect(dispatchShellShortcut(event,focus,ports)).toBeNull();expect(event.preventDefault).not.toHaveBeenCalled();expect(ports.invoke).not.toHaveBeenCalled()
 }
 for(const event of [key('KeyQ',{metaKey:true}),key('KeyS',{metaKey:true,altKey:true}),key('F2',{shiftKey:true})]){
  const ports=host();expect(dispatchShellShortcut(event,world,ports)).toBeNull();expect(event.preventDefault).not.toHaveBeenCalled();expect(ports.available).not.toHaveBeenCalled();expect(ports.invoke).not.toHaveBeenCalled()
 }
 const event=key('KeyP',{metaKey:true}),ports=host();expect(dispatchShellShortcut(event,editor,ports)).toBe('workbench.quickOpen');expect(ports.invoke).toHaveBeenCalledExactlyOnceWith('workbench.quickOpen')
})
it('resolves Escape from current navigation facts, with Inspector before Focus before Trace and Source retaining its key',()=>{
 const rows:{focus:ShortcutFocus;navigation:ReturnType<ShellKeyboardHost['navigation']>;command:IdeCommandId|null}[]=[
  {focus:{...world,inspector:true},navigation:{inspectorOpen:true,focusActive:true,traceActive:true},command:'workbench.inspector'},
  {focus:world,navigation:{inspectorOpen:true,focusActive:true,traceActive:true},command:'navigation.exitFocus'},
  {focus:world,navigation:{inspectorOpen:true,focusActive:false,traceActive:true},command:'navigation.explore'},
  {focus:editor,navigation:{inspectorOpen:true,focusActive:true,traceActive:true},command:null},
  {focus:{...world,shellSurface:true},navigation:{inspectorOpen:true,focusActive:true,traceActive:true},command:null},
 ]
 for(const row of rows){const event=key('Escape'),ports=host({navigation:()=>row.navigation});expect(dispatchShellShortcut(event,row.focus,ports)).toBe(row.command);expect(event.preventDefault).toHaveBeenCalledTimes(row.command?1:0);if(row.command)expect(ports.invoke).toHaveBeenCalledExactlyOnceWith(row.command);else expect(ports.invoke).not.toHaveBeenCalled()}
 const event=key('Escape',{shiftKey:true}),ports=host({navigation:()=>({inspectorOpen:true,focusActive:true,traceActive:true})});expect(dispatchShellShortcut(event,world,ports)).toBeNull();expect(event.preventDefault).not.toHaveBeenCalled()
})
it('consumes a registered chord before evaluating its availability and reads navigation at dispatch time',()=>{
 const event=key('F5'),ports=host({available:vi.fn(()=>{expect(event.preventDefault).toHaveBeenCalledOnce();expect(event.stopPropagation).toHaveBeenCalledOnce();return false})})
 expect(dispatchShellShortcut(event,world,ports)).toBe('debug.startOrContinue');expect(ports.available).toHaveBeenCalledExactlyOnceWith('debug.startOrContinue');expect(ports.invoke).not.toHaveBeenCalled()
 let focusActive=true;const live=host({navigation:()=>({inspectorOpen:false,focusActive,traceActive:true})})
 expect(dispatchShellShortcut(key('Escape'),world,live)).toBe('navigation.exitFocus');focusActive=false;expect(dispatchShellShortcut(key('Escape'),world,live)).toBe('navigation.explore')
})
