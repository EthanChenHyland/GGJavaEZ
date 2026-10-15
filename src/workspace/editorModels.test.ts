import {beforeEach,expect,it,vi} from 'vitest'
import type {editor} from 'monaco-editor'
import {getLoadedJavaEditorRuntime,type JavaEditorRuntime} from '../language/editorRuntime'
import {documentUri} from '../language/protocol'
import {createEditableModelOwner,publishEditableDraft,observeEditableModels,rememberEditableView,restoreEditableView,retireEditableModels} from './editorModels'
vi.mock('../language/editorRuntime',()=>({getLoadedJavaEditorRuntime:vi.fn()}))
const loaded=vi.mocked(getLoadedJavaEditorRuntime)
const view={cursorState:[{inSelectionMode:true,selectionStart:{lineNumber:42,column:3},position:{lineNumber:42,column:9}}],viewState:{scrollLeft:10,firstPosition:{lineNumber:20,column:1},firstPositionDeltaTop:4},contributionsState:{}} as unknown as editor.ICodeEditorViewState
function model(uri:string){
 let disposed=false
 return{uri:{toString:()=>uri},isDisposed:()=>disposed,dispose:vi.fn(()=>{disposed=true})} as unknown as editor.ITextModel
}
function instance(initial:editor.ITextModel){
 let current:editor.ITextModel|null=initial
 return{getModel:()=>current,setModel:vi.fn((next:editor.ITextModel|null)=>{current=next}),saveViewState:()=>view,restoreViewState:vi.fn()} as unknown as editor.IStandaloneCodeEditor
}
beforeEach(()=>{
 loaded.mockReturnValue(undefined);retireEditableModels('p1');retireEditableModels('p2');vi.clearAllMocks()
})
it('retains exact editable caret, selection and scroll by canonical URI, excluding recorded/foreign models',()=>{
 const first=instance(model(documentUri('p1','src/Main.java'))),second=instance(model(documentUri('p1','src/Aux.java')))
 rememberEditableView(first,'p1');restoreEditableView(second,'p1');expect(second.restoreViewState).not.toHaveBeenCalled()
 restoreEditableView(first,'p1');expect(first.restoreViewState).toHaveBeenCalledExactlyOnceWith(view)
 rememberEditableView(instance(model('inmemory://model/recorded.java')),'p1')
 rememberEditableView(instance(model(documentUri('p2','Main.java'))),'p1')
 expect(observeEditableModels()).toEqual({loaded:false,modelUris:[],viewUris:[documentUri('p1','src/Main.java')]})
})
it('retires a path subtree, clears its snapshots/markers and detaches only matching models before disposal',()=>{
 const own=model(documentUri('p1','src/Main.java')),sibling=model(documentUri('p1','src2/Main.java')),foreign=model(documentUri('p2','src/Main.java')),recorded=model('inmemory://model/recorded.java')
 const ownEditor=instance(own),foreignEditor=instance(foreign),markers=vi.fn()
 rememberEditableView(ownEditor,'p1');rememberEditableView(instance(sibling),'p1');rememberEditableView(foreignEditor,'p2')
 vi.mocked(own.dispose).mockImplementation(()=>{expect(ownEditor.getModel()).toBeNull()})
 loaded.mockReturnValue({monaco:{editor:{getModels:()=>[own,sibling,foreign,recorded],getEditors:()=>[ownEditor,foreignEditor],setModelMarkers:markers}}} as unknown as JavaEditorRuntime)
 retireEditableModels('p1','src')
 expect(own.dispose).toHaveBeenCalledOnce();expect(ownEditor.setModel).toHaveBeenCalledExactlyOnceWith(null)
 expect(markers.mock.calls).toEqual([[own,'javac',[]],[own,'language',[]]])
 for(const other of [sibling,foreign,recorded])expect(other.dispose).not.toHaveBeenCalled()
 expect(foreignEditor.setModel).not.toHaveBeenCalled()
 expect(observeEditableModels().viewUris).toEqual([documentUri('p1','src2/Main.java'),documentUri('p2','src/Main.java')])
})
it('reconciles only committed closure/replacement and keeps open tab models through ordinary updates',()=>{
 const retire=vi.fn(),owner=createEditableModelOwner(retire)
 owner.update('p1',['Main.java','Aux.java']);owner.update('p1',['Aux.java','Main.java']);expect(retire).not.toHaveBeenCalled()
 owner.update('p1',['Main.java']);expect(retire.mock.calls).toEqual([['p1','Aux.java']])
 owner.update('p2',['Main.java']);expect(retire.mock.calls).toEqual([['p1','Aux.java'],['p1']])
 owner.dispose();owner.dispose();expect(retire.mock.calls).toEqual([['p1','Aux.java'],['p1'],['p2']])
})
it('clears owned view caches without fetching Monaco, including project replacement and unmount',()=>{
 const owner=createEditableModelOwner();owner.update('p1',['Main.java'])
 rememberEditableView(instance(model(documentUri('p1','Main.java'))),'p1')
 owner.update('p2',['Main.java']);expect(observeEditableModels()).toEqual({loaded:false,modelUris:[],viewUris:[]})
 rememberEditableView(instance(model(documentUri('p2','Main.java'))),'p2');owner.dispose()
 expect(observeEditableModels()).toEqual({loaded:false,modelUris:[],viewUris:[]})
})

it('ignores draft echoes and stale foreign/tab model notifications before any workspace mutation',()=>{
 const publish=vi.fn(),own=instance(model(documentUri('p1','Main.java')))
 expect(publishEditableDraft(own,documentUri('p1','Main.java'),'class Main {}','class Main {}',publish)).toBe(false)
 expect(publishEditableDraft(own,documentUri('p1','Aux.java'),'class Aux {}','class Main {}',publish)).toBe(false)
 expect(publishEditableDraft(own,documentUri('p2','Main.java'),'class Other {}','class Main {}',publish)).toBe(false)
 expect(publishEditableDraft(null,documentUri('p1','Main.java'),'old','new',publish)).toBe(false)
 expect(publish).not.toHaveBeenCalled()
})
it('publishes the exact changed draft only for the currently owned live model, including empty content',()=>{
 const publish=vi.fn(),uri=documentUri('p1','Main.java'),text=model(uri),own=instance(text)
 expect(publishEditableDraft(own,uri,'class Main {}','class Main { int age; }',publish)).toBe(true)
 expect(publish).toHaveBeenLastCalledWith('class Main { int age; }')
 expect(publishEditableDraft(own,uri,'class Main {}','',publish)).toBe(true)
 expect(publish).toHaveBeenLastCalledWith('')
 text.dispose();expect(publishEditableDraft(own,uri,'old','new',publish)).toBe(false)
 expect(publish).toHaveBeenCalledTimes(2)
})
