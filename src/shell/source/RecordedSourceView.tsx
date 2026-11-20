import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { SourceLocation, TraceDocument } from '../../contracts/runtime'
import type { SourceMark } from './sourceScrollPolicy'
import {typography} from '../../theme/tokens'
const RecordedSourceEditor = lazy(() => import('./RecordedSourceEditor'))
/** A source editor failure must not unmount the recording or the workbench. */
class RecordedSourceBoundary extends Component<{file:TraceDocument['sourceFiles'][number];children:ReactNode},{failed:boolean}>{
 state={failed:false}
 static getDerivedStateFromError(){return{failed:true}}
 render(){
  if(!this.state.failed)return this.props.children
  return <section className="recorded-source-fallback" aria-label="Captured source fallback">
   <p role="alert">Source editor unavailable. Showing captured source.</p>
   <pre tabIndex={0} aria-label="Captured Java source" style={{fontFamily:`${typography.code.family}, SFMono-Regular, Consolas, monospace`}}>{this.props.file.content}</pre>
  </section>
 }
}
export function RecordedSourceView({file,location,mark='history',sourceKey='',pauseId=null,exceptionLine=null,viewportHeight}:{file:TraceDocument['sourceFiles'][number]|undefined;location:SourceLocation|null;mark?:SourceMark;sourceKey?:string;pauseId?:string|null;exceptionLine?:number|null;viewportHeight:number}) {
 if(!file)return <div className="ide-editor-empty" role="status">No recorded project source at this point in time.</div>
 return <RecordedSourceBoundary file={file}><Suspense fallback={<div role="status">Loading recorded source…</div>}><RecordedSourceEditor file={file} location={location} mark={mark} sourceKey={sourceKey} pauseId={pauseId} exceptionLine={exceptionLine} viewportHeight={viewportHeight} onChooseLine={()=>{}}/></Suspense></RecordedSourceBoundary>
}
