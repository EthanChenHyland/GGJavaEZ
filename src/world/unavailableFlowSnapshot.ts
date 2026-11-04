import type {FlowPresentation} from '../contracts/world'
type Entry=FlowPresentation['unavailable'][number]
export const reasons=Object.freeze([
 'Recorded evidence has no proved semantic source',
 'Recorded evidence has no prefix-proved semantic destination',
 'Source port is absent, retired, quiet or hidden in the current presentation',
 'Destination port is absent, retired, quiet or hidden in the current presentation',
] as const)
const empty=Object.freeze([]) as readonly Entry[]
/** Private, complete immutable snapshot. Only IDs and a flat one-byte reason
 * string stay live; no mutable catalog, source trace or future prefix is held.
 * The string stays in V8 heap, rather than moving payload outside heapUsed.
 */
export function unavailableFlowSnapshot(ids:string[],codes:string):readonly Entry[]{
 if(ids.length!==codes.length)throw new RangeError('Unavailable flow reason count differs from captured IDs')
 if(!ids.length)return empty
 Object.freeze(ids)
 const length=ids.length,index=(key:PropertyKey):number|null=>typeof key==='string'&&/^(0|[1-9]\d*)$/.test(key)&&Number.isSafeInteger(Number(key))?Number(key):null
 const at=(i:number)=>i<length?Object.freeze({id:ids[i],reason:reasons[codes.charCodeAt(i)-48]}):undefined
 const reject=():never=>{throw new TypeError('Unavailable flow snapshots are immutable')}
 return new Proxy([] as Entry[],{
  set:reject,deleteProperty:reject,defineProperty:reject,setPrototypeOf:reject,preventExtensions:reject,
  get(target,key,receiver){if(key==='length')return length;const i=index(key);return i===null?Reflect.get(target,key,receiver):at(i)},
  has(target,key){const i=index(key);return i===null?Reflect.has(target,key):i<length},
  ownKeys(){return[...ids.map((_,i)=>String(i)),'length']},
  getOwnPropertyDescriptor(target,key){
   if(key==='length')return{...Reflect.getOwnPropertyDescriptor(target,key)!,value:length}
   const i=index(key);return i!==null&&i<length?{value:at(i),enumerable:true,configurable:true,writable:false}:Reflect.getOwnPropertyDescriptor(target,key)
  },
 })
}
