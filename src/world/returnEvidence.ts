import type {ExecutionGraph,GraphEdge,GraphStorage} from '../contracts/executionGraph'
import type {TraceEvent} from '../contracts/runtime'

/** Resolve only a recorded consumer of this exact value version. Equal values,
 * adjacent events and legacy ReturnTransfer destinations do not establish it. */
export function consumingWriteDestination(graph:ExecutionGraph,valueId:string,events:Pick<ReadonlyMap<string,TraceEvent>,'get'>):GraphStorage|null {
 for(const index of graph.outgoing[valueId]??[]){
  const edge=graph.edges[index],event=events.get(edge.eventId),storage=graph.storage[edge.to]
  if(!storage||!['ASSIGN','FIELD_WRITE','STATIC_WRITE','ARRAY_WRITE'].includes(edge.kind)||event?.type!=='EXECUTION_FACT'||event.fact.kind!=='write')continue
  if(['call_result','field_read','static_read','array_read'].includes(event.fact.origin.kind))return storage
 }
 return null
}

/** The VM return's value edge is the transfer identity; invocation/call
 * completion edges describe completion, never an additional value transfer. */
export function recordedReturnDestination(graph:ExecutionGraph,edge:GraphEdge,event:TraceEvent,events:Pick<ReadonlyMap<string,TraceEvent>,'get'>):{frameId:string;destination:GraphStorage}|null {
 if(edge.kind!=='RETURN'||event.type!=='EXECUTION_FACT'||event.fact.kind!=='return'||graph.invocations[edge.from]||graph.calls[edge.from])return null
 const frameId=event.fact.invocationId
 if(graph.invocations[frameId]?.returnValueId!==edge.to)return null
 const destination=consumingWriteDestination(graph,edge.to,events)
 return destination?{frameId,destination}:null
}
