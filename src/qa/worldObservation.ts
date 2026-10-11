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
  projectedPoint(id: string): { x:number; y:number; visible:boolean } | null
  renderer(): {calls:number;triangles:number;geometries:number;textures:number;frame:number}
  effects():{ready:boolean;frames:number;revision:number;failure:string;cinematic:boolean}
  quality():{setting:string;active:string;compiled:boolean;cinematicStatus:string;availability:{enabled:true}|{enabled:false;reason:string};capabilities:import('../render/quality/gpuCapabilities').GpuCapabilities|null;contextLost:boolean;notice:string|null}
  ready(): Promise<void>
}
declare global { interface Window { __ggjavaezWorld?: WorldObservation } }
