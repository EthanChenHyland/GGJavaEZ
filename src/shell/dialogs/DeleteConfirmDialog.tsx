import {DialogFrame} from './DialogFrame'
export function DeleteConfirmDialog({path,dirtyPaths,busy,error,onClose,onDelete,onSaveAndDelete}:{path:string;dirtyPaths:readonly string[];busy:boolean;error:string;onClose():void;onDelete():void;onSaveAndDelete():void}){
 return <DialogFrame title="Delete" onClose={onClose} onSubmit={onDelete} actions={<>
  <button type="button" onClick={onClose}>Cancel</button>{dirtyPaths.length>0&&<button type="button" disabled={busy} onClick={onSaveAndDelete}>Save and delete</button>}<button type="submit" className="shell-dialog-primary" disabled={busy}>Delete</button>
 </>}>
  <p>Delete <strong>{path}</strong> from this project?</p>
  {dirtyPaths.length>0?<><p>The following unsaved files will be discarded unless saved first.</p><ul aria-label="Affected unsaved files">{dirtyPaths.map(path=><li key={path}>{path}</li>)}</ul></>:<p>No unsaved files.</p>}
  {error&&<p role="alert">{error}</p>}
 </DialogFrame>
}
