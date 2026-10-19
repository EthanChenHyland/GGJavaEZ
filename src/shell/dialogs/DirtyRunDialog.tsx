import {DialogFrame} from './DialogFrame'
export function DirtyRunDialog({paths,busy,error,onSave,onCancel}:{paths:readonly string[];busy:boolean;error:string;onSave():void;onCancel():void}){
 return <DialogFrame title="Unsaved changes before Run" onClose={()=>{if(!busy)onCancel()}} actions={<>
  <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
  <button type="button" disabled={busy} className="shell-dialog-primary" onClick={onSave}>Save All and Run</button>
 </>}>
  <p>Save every changed file before running this project.</p>
  <ul aria-label="Unsaved files">{paths.map(path=><li key={path}>{path}</li>)}</ul>
  {busy&&<p role="status">Saving changed files…</p>}
  {error&&<p role="alert" style={{whiteSpace:'pre-wrap'}}>{error}</p>}
 </DialogFrame>
}
