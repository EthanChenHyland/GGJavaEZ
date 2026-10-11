import type {editor} from 'monaco-editor'
import {getLoadedJavaEditorRuntime} from '../language/editorRuntime'
import {documentPath} from '../language/protocol'
import {pathIsWithin} from '../ide/pathChanges'

// Owned by editable workspace tabs, never by recorded-source editors.
const views=new Map<string,editor.ICodeEditorViewState>()
export function rememberEditableView(instance:editor.IStandaloneCodeEditor,projectId:string) {
 const model=instance.getModel(),view=instance.saveViewState()
 if(model&&!model.isDisposed()&&documentPath(model.uri.toString(),projectId)!==null&&view)views.set(model.uri.toString(),view)
}
export function restoreEditableView(instance:editor.IStandaloneCodeEditor,projectId:string) {
 const model=instance.getModel();if(!model||model.isDisposed()||documentPath(model.uri.toString(),projectId)===null)return
 const view=views.get(model.uri.toString());if(view)instance.restoreViewState(view)
}
/** No load, draft mutation or language notification: those have separate owners. */
export function retireEditableModels(projectId:string,path?:string) {
 const owns=(uri:string)=>{const relative=documentPath(uri,projectId);return relative!==null&&(path===undefined||pathIsWithin(relative,path))}
 for(const uri of views.keys())if(owns(uri))views.delete(uri)
 const monaco=getLoadedJavaEditorRuntime()?.monaco;if(!monaco)return
 for(const model of monaco.editor.getModels()){
  if(model.isDisposed()||!owns(model.uri.toString()))continue
  monaco.editor.setModelMarkers(model,'javac',[]);monaco.editor.setModelMarkers(model,'language',[])
  for(const instance of monaco.editor.getEditors())if(instance.getModel()===model)instance.setModel(null)
  model.dispose()
 }
}
/** Reconcile committed tab/project state, after dirty decisions and React's
 * outgoing view snapshot. Tab switches and hidden Source retain their models. */
export function createEditableModelOwner(retire=retireEditableModels) {
 let project='',paths=new Set<string>()
 return{
  update(nextProject:string,nextPaths:readonly string[]){
   if(project&&project!==nextProject)retire(project)
   else if(project)for(const path of paths)if(!nextPaths.includes(path))retire(project,path)
   project=nextProject;paths=new Set(nextPaths)
  },
  dispose(){if(project)retire(project);project='';paths.clear()},
 }
}
/** Actual lazy runtime inventory for QA; this cannot create or edit a model. */
export function observeEditableModels() {
 const runtime=getLoadedJavaEditorRuntime()
 return{loaded:!!runtime,modelUris:(runtime?.monaco.editor.getModels()??[]).map(model=>model.uri.toString()).sort(),viewUris:[...views.keys()].sort()}
}
