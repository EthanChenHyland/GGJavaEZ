import {CircleCheck,CircleDashed,LoaderCircle,Pause,Pencil,Play,Terminal,TriangleAlert,type LucideIcon} from 'lucide-react'
import type {AppState,AppStateIcon} from '../state/appState'
import {useQualityStore} from '../render/quality/qualityStore'
const icons:Record<AppStateIcon,LucideIcon>={'pencil':Pencil,'loader-circle':LoaderCircle,'play':Play,'terminal':Terminal,'pause':Pause,'circle-check':CircleCheck,'triangle-alert':TriangleAlert,'circle-dashed':CircleDashed}
export function AppStateBadge({state,sourceChanged}:{state:AppState;sourceChanged:boolean}){
 const reduced=useQualityStore(value=>value.reducedMotion.os||value.reducedMotion.inApp),Icon=icons[state.icon],building=state.execution==='BUILDING'
 return <span className="shell-state" data-state={state.execution} data-reduced-motion={reduced} role="status" title={[state.label,...state.badges,...(sourceChanged?['Source changed since this run']:[])].join(' · ')}>
  <span className="shell-state-primary"><span className="shell-state-icon" data-icon={state.icon} role={building?'progressbar':undefined} aria-label={building?'Building project':undefined}><Icon size={15} aria-hidden="true"/></span><span className="shell-state-label">{state.label}</span></span>
  {sourceChanged&&<small className="shell-source-changed">Source changed since this run</small>}
 </span>
}
