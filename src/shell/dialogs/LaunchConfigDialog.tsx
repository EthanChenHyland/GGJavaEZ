import {useId,useState} from 'react'
import type {LaunchConfiguration} from '../../ide/javaProject'
import {DialogFrame} from './DialogFrame'
import {parseLaunchConfigDraft} from './launchConfigDraft'
export function LaunchConfigDialog({value,targets,onSave,onClose}:{value:LaunchConfiguration;targets:readonly string[];onSave(value:LaunchConfiguration):void;onClose():void}){
 const mainLabel=useId()
 const [draft,setDraft]=useState(()=>({mainClass:value.mainClass,workingDirectory:value.workingDirectory,program:JSON.stringify(value.programArgs),jvm:JSON.stringify(value.jvmArgs)})),[error,setError]=useState('')
 const change=(key:keyof typeof draft,text:string)=>{setDraft(previous=>({...previous,[key]:text}));setError('')}
 const save=()=>{try{onSave(parseLaunchConfigDraft(draft))}catch(reason){setError(reason instanceof Error?reason.message:String(reason))}}
 const unlisted=!!draft.mainClass&&!targets.includes(draft.mainClass)
 return <DialogFrame title="Launch configuration" className="shell-launch-dialog" onClose={onClose} onSubmit={save} actions={<>
  <button type="button" onClick={onClose}>Cancel</button><button className="shell-dialog-primary" type="submit">Save configuration</button>
 </>}>
  <p>Used by Run and Debug. Dependencies come from the project build.</p>
  <label><span id={mainLabel}>Main class</span><select aria-labelledby={mainLabel} value={draft.mainClass} onChange={event=>change('mainClass',event.target.value)}><option value="">First runnable main</option>
   {unlisted&&<option value={draft.mainClass}>{draft.mainClass} · not listed by the latest build</option>}
   {[...new Set(targets)].map(target=><option key={target}>{target}</option>)}
  </select></label>
  <label>Working directory<input value={draft.workingDirectory} onChange={event=>change('workingDirectory',event.target.value)} placeholder="."/></label>
  <label>Program arguments<textarea value={draft.program} onChange={event=>change('program',event.target.value)} placeholder={'["first", "second"]'}/></label>
  <label>JVM arguments<textarea value={draft.jvm} onChange={event=>change('jvm',event.target.value)} placeholder={'["-Xmx256m"]'}/></label>
  <small>Arguments are JSON arrays; each string is one argument. Paths are relative to this project.</small>
  {error&&<p role="alert">{error}</p>}
 </DialogFrame>
}
