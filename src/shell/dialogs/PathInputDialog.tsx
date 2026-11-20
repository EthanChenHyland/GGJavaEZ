import {DialogFrame} from './DialogFrame'
type PathKind='class'|'file'|'folder'|'rename'|'project'|'open'
export function PathInputDialog({kind,value,busy,error,onChange,onClose,onSubmit}:{kind:PathKind;value:string;busy:boolean;error:string;onChange(value:string):void;onClose():void;onSubmit():void}){
 const title={class:'New Java Class',file:'New File',folder:'New Folder',rename:'Rename',project:'New Project',open:'Open File'}[kind]
 return <DialogFrame title={title} selectInput onClose={onClose} onSubmit={onSubmit} actions={<>
  <button type="button" onClick={onClose}>Cancel</button><button type="submit" className="shell-dialog-primary" disabled={busy}>{kind==='rename'?'Rename':kind==='open'?'Open':'Create'}</button>
 </>}>
  <label>{kind==='project'?'Project name':kind==='class'?'Class name':'Path relative to project root'}<input value={value} onChange={event=>onChange(event.target.value)} spellCheck={false} required aria-invalid={!!error}/></label>
  {error&&<p role="alert">{error}</p>}
 </DialogFrame>
}
