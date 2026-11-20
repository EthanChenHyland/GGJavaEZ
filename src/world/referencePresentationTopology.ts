import {buildReferenceTopology,type ReferenceTopologyInput} from './referenceTopology'

/** Current and historical individuals share one nominal budget. A drawable
 * selected historical binding reserves its place first; each side then admits
 * mandatory overflow without spending optional capacity beyond max(B, M).
 * Structural bundles and unavailable facts remain complete on both sides. */
export function referencePresentationTopology(input:ReferenceTopologyInput,history:NonNullable<ReferenceTopologyInput['references']>,historicalEnabled:boolean){
 const historyInput={...input,references:history,historical:true,enabled:historicalEnabled,mandatoryIds:new Set(history.filter(ref=>input.mandatoryIds.has(ref.id)).map(ref=>ref.id))}
 const reserved=historyInput.mandatoryIds.size?buildReferenceTopology({...historyInput,individualLimit:0}).individual.length:0
 const current=buildReferenceTopology({...input,individualLimit:Math.max(0,input.individualLimit-reserved)})
 const historical=buildReferenceTopology({...historyInput,individualLimit:Math.max(0,input.individualLimit-current.individual.length)})
 return{current,historical}
}
