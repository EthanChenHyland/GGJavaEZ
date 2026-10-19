import {Picker,type PickerItem} from '../../../src/shell/picker/Picker'
import {StrictMode,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {DialogFrame} from '../../../src/shell/dialogs/DialogFrame'
import {CommandMenu} from '../../../src/shell/dialogs/CommandMenu'
import {LaunchConfigDialog} from '../../../src/shell/dialogs/LaunchConfigDialog'
import {color} from '../../../src/theme/tokens'
import '../../../src/app/base.css'
import '../../../src/shell/shell.css'
for(const [group,values]of Object.entries(color))for(const [name,value]of Object.entries(values))document.documentElement.style.setProperty(`--color-${group}-${name.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase())}`,value)
const fileItems:PickerItem[]=Array.from({length:5000},(_,index)=>({id:String(index),label:index===4999?'Target5000.java':`File${index}.java`,detail:`src/package${index}/${index===4999?'Target5000.java':`File${index}.java`}`,enabled:true}))
function Fixture(){
 const [picker,setPicker]=useState<'files'|'commands'|null>(null)
 const [dialog,setDialog]=useState(false),[menu,setMenu]=useState(false),[child,setChild]=useState(false),[launch,setLaunch]=useState(false),[chosen,setChosen]=useState(''),[saved,setSaved]=useState('')
 return <div className="shell" style={{padding:20}}>
  <div className="monaco-editor"><textarea aria-label="Editor fallback"/></div>
  <button onClick={()=>setDialog(true)}>Open parent</button><button onClick={()=>setLaunch(true)}>Open launch</button><button>Outside target</button>
  <button onClick={()=>setPicker('files')}>Open file picker</button><button onClick={()=>setPicker('commands')}>Open command picker</button>
  <output aria-label="Chosen command">{chosen}</output><output aria-label="Saved launch">{saved}</output>
  {picker&&<Picker mode={picker} items={picker==='files'?fileItems:[{id:'blocked',label:'Unavailable command',enabled:false,reason:'Requires a paused debugger'},{id:'active',label:'Active command',enabled:true,shortcut:'F5'}]} onClose={()=>setPicker(null)} onChoose={id=>{setChosen(previous=>previous+id+';');setPicker(null)}}/>}
  {dialog&&<DialogFrame title="Parent dialog" onClose={()=>setDialog(false)} actions={<button type="button" onClick={()=>setDialog(false)}>Close parent</button>}>
   <label>First field<input defaultValue="keep"/></label><button type="button" disabled>Disabled control</button><button type="button" hidden>Hidden control</button>
   <button type="button" onClick={()=>setMenu(true)}>Open nested menu</button><button type="button" onClick={()=>setChild(true)}>Open child dialog</button>
   {menu&&<CommandMenu label="Nested actions" x={innerWidth-15} y={innerHeight-15} items={[{id:'blocked',label:'Blocked command',enabled:false,reason:'Unavailable in this captured state'},{id:'first',label:'First action',enabled:true},{id:'last',label:'Last action',enabled:true}]} onClose={()=>setMenu(false)} onChoose={id=>{setChosen(previous=>previous+id+';');setMenu(false)}}/>}
   {child&&<DialogFrame title="Child dialog" onClose={()=>setChild(false)} actions={<button type="button" onClick={()=>{setMenu(false);setChild(false);setDialog(false)}}>Remove whole subtree</button>}><input aria-label="Child field"/></DialogFrame>}
  </DialogFrame>}
  {launch&&<LaunchConfigDialog value={{mainClass:'saved.Unlisted',workingDirectory:'.',programArgs:[],jvmArgs:[]}} targets={['listed.Main']} onClose={()=>setLaunch(false)} onSave={value=>{setSaved(JSON.stringify(value));setLaunch(false)}}/>}
 </div>
}
createRoot(document.getElementById('surfaces-test')!).render(<StrictMode><Fixture/></StrictMode>)
