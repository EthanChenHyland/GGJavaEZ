import type {SceneReference,SceneReferenceBinding} from '../contracts/worldV2'
const catalogs=new WeakMap<readonly SceneReferenceBinding[],{references:readonly SceneReference[];lifetimeExcluded:readonly {id:string;endKind:SceneReferenceBinding['endKind']}[]}>()

/** Retirement and missing capture are queryable history, not proof of an
 * overwritten/null binding with a current semantic source port. */
export function historicalReferenceEligible(binding:SceneReferenceBinding):boolean{
 return binding.endSeq!==null&&(binding.endKind==='overwritten'||binding.endKind==='null')
}
export function historicalSceneReference(binding:SceneReferenceBinding):SceneReference{
 return{id:binding.id,sourceId:binding.sourceId,sourceSlotId:binding.sourceSlotId,targetId:binding.targetId,role:binding.role,overlay:null,
  evidence:{kind:'observed',introducedSeq:binding.introducedSeq,changedSeq:binding.endSeq,eventIds:[binding.introducedEventId,...(binding.endEventId?[binding.endEventId]:[])]}}
}
/** Unchanged closed prefixes reuse their derived catalog across ordinary
 * cursor/camera updates. The WeakMap cannot retain an obsolete recording. */
export function historicalReferenceCatalog(bindings:readonly SceneReferenceBinding[]){
 const existing=catalogs.get(bindings);if(existing)return existing
 const references:SceneReference[]=[],lifetimeExcluded:Array<{id:string;endKind:SceneReferenceBinding['endKind']}>=[]
 for(const binding of bindings)if(historicalReferenceEligible(binding))references.push(historicalSceneReference(binding));else lifetimeExcluded.push({id:binding.id,endKind:binding.endKind})
 const catalog={references,lifetimeExcluded};catalogs.set(bindings,catalog);return catalog
}
