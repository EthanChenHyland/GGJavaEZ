import {DialogFrame} from '../dialogs/DialogFrame'
export function JdkDialog({value,error,busy,onChange,onClose,onSubmit}:{value:string;error:string|null;busy:boolean;onChange(value:string):void;onClose():void;onSubmit():void}){
 return <DialogFrame title="Configure JDK" onClose={onClose} onSubmit={onSubmit} actions={<><button type="button" onClick={onClose}>Close</button><button type="submit" disabled={busy}>Use JDK</button></>}>
  <label>JDK home<input value={value} placeholder="Auto-detect from PATH" onChange={event=>onChange(event.target.value)}/></label>{error&&<p role="alert">{error}</p>}
 </DialogFrame>
}
