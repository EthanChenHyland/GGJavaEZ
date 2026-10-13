import type { Selection } from '../contracts/interaction'
import type { SceneModel, PresentationPlan } from '../contracts/worldV2'
import type {TraceEvent} from '../contracts/runtime'
import type {WorldProjection} from './worldProjection'
export interface WorldObservation {
  scene(): SceneModel
  plan(): PresentationPlan
  selection(): Selection
  recordedEvents():readonly TraceEvent[]
  worldProjection():WorldProjection
  runtimeHeadings():readonly {entityId:string;kind:'title'|'identity';text:string;opacity:number;fontPixels:number;planePixels:number;widthPixels:number}[]
  collectionText():readonly {entityId:string;kind:'size'|'more'|'key'|'value';slotId?:string;text:string;opacity:number;fontPixels:number;planePixels:number;widthPixels:number}[]
  structuralLabels():readonly {id:string;kind:'cluster'|'heading'|'bundle';visible:boolean;minimumFontPixels:number;bounds:import('../shell/shellLayout').Rect|null}[]
  projectedPoint(id: string): { x:number; y:number; visible:boolean } | null
  renderer(): {calls:number;triangles:number;geometries:number;textures:number;frame:number}
  effects():{ready:boolean;frames:number;revision:number;failure:string;cinematic:boolean}
  framePerformance():import('./framePerformance').FramePerformanceObservation|null
  quality():{setting:string;active:string;compiled:boolean;cinematicStatus:string;availability:{enabled:true}|{enabled:false;reason:string};capabilities:import('../render/quality/gpuCapabilities').GpuCapabilities|null;contextLost:boolean;notice:string|null}
  ready(): Promise<void>
}
declare global { interface Window { __ggjavaezWorld?: WorldObservation } }
