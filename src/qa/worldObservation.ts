import type { Selection } from '../contracts/interaction'
import type { SceneModel, PresentationPlan, Vec3 } from '../contracts/world'
import type {TraceEvent} from '../contracts/runtime'
import type {WorldProjection} from './worldProjection'
export interface WorldObservation {
  scene(): SceneModel
  plan(): PresentationPlan
  selection(): Selection
  recordedEvents():readonly TraceEvent[]
  worldProjection():WorldProjection
  runtimeHeadings():readonly {entityId:string;kind:'title'|'identity';text:string;opacity:number;fontPixels:number;planePixels:number;widthPixels:number;position:Vec3;localInkBounds:readonly[number,number,number,number]|null;inkCorners:readonly Vec3[]}[]
  collectionText():readonly {entityId:string;kind:'size'|'more'|'key'|'value';slotId?:string;text:string;opacity:number;fontPixels:number;planePixels:number;widthPixels:number;inkCorners:readonly Vec3[];bounds:import('./worldProjection').ProjectedRect|null}[]
  returnText():readonly {flowId:string;kind:'value'|'operands';text:string;opacity:number;fontPixels:number}[]
  frameText():readonly {entityId:string;kind:'scope'|'name'|'value';slotId?:string;text:string;position:readonly[number,number,number];opacity:number;fontPixels:number}[]
  arrayText():readonly {entityId:string;slotId:string;kind:'index'|'value';text:string;position:Vec3;opacity:number;fontPixels:number;localInkBounds:readonly number[]|null;bounds:import('./worldProjection').ProjectedRect|null}[]
  exceptionText():readonly {text:string;opacity:number;fontPixels:number;position:readonly[number,number,number];bounds:import('./worldProjection').ProjectedRect|null}[]
  structuralLabels():readonly {id:string;kind:'cluster'|'heading'|'bundle'|'return';visible:boolean;minimumFontPixels:number;bounds:import('../shell/shellLayout').Rect|null}[]
  projectedPoint(id: string): { x:number; y:number; visible:boolean } | null
  renderer(): {calls:number;triangles:number;geometries:number;textures:number;frame:number}
  connectorPorts():readonly {position:Vec3;radius:number;opacity:number;referenceChip:boolean}[]
  valueChips():readonly {slotId:string;part:string;position:Vec3;size:Vec3}[]
  environment():{id:string;captureVersion:number}|null
  effects():{ready:boolean;frames:number;revision:number;failure:string;cinematic:boolean}
  atmosphere():readonly {region:string;position:readonly[number,number,number];size:readonly[number,number,number];color:string;opacity:number;visible:boolean;depthWrite:boolean;depthTest:boolean;castShadow:boolean;maxLinearTint:number;maskSize:readonly[number,number]}[]
  framePerformance():import('./framePerformance').FramePerformanceObservation|null
  quality():{setting:string;active:string;compiled:boolean;cinematicStatus:string;availability:{enabled:true}|{enabled:false;reason:string};capabilities:import('../render/quality/gpuCapabilities').GpuCapabilities|null;contextLost:boolean;notice:string|null}
  ready(): Promise<void>
}
declare global { interface Window { __ggjavaezWorld?: WorldObservation } }
