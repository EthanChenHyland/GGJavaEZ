import type {DirtyDecision} from '../../ide/commands'
import {DialogFrame} from './DialogFrame'
export function UnsavedChangesDialog({label,paths,busy,error,onDecision}:{label:string;paths:readonly string[];busy:boolean;error:string;onDecision(choice:DirtyDecision):void}){
 return <DialogFrame title="Unsaved changes" onClose={()=>onDecision('cancel')} actions={<>
  <button type="button" disabled={busy} onClick={()=>onDecision('cancel')}>Cancel</button><button type="button" disabled={busy} onClick={()=>onDecision('discard')}>Don't Save</button><button type="button" disabled={busy} className="shell-dialog-primary" onClick={()=>onDecision('save')}>Save</button>
 </>}>
  <p>Save {paths.length} changed {paths.length===1?'file':'files'} before {label}?</p><ul aria-label="Unsaved files">{paths.map(path=><li key={path}>{path}</li>)}</ul>
  {error&&<p role="alert">{error}</p>}
 </DialogFrame>
}
