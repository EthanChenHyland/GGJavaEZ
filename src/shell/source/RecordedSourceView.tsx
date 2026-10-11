import { lazy, Suspense } from 'react'
import type { SourceLocation, TraceDocument } from '../../contracts/runtime'
import type { SourceMark } from './sourceScrollPolicy'
const RecordedSourceEditor = lazy(() => import('./RecordedSourceEditor'))
export function RecordedSourceView({file,location,mark='history',sourceKey='',pauseId=null,viewportHeight}:{file:TraceDocument['sourceFiles'][number]|undefined;location:SourceLocation|null;mark?:SourceMark;sourceKey?:string;pauseId?:string|null;viewportHeight:number}) {
 if(!file)return <div className="ide-editor-empty" role="status">No recorded project source at this point in time.</div>
 return <Suspense fallback={<div role="status">Loading recorded source…</div>}><RecordedSourceEditor file={file} location={location} mark={mark} sourceKey={sourceKey} pauseId={pauseId} viewportHeight={viewportHeight} onChooseLine={()=>{}}/></Suspense>
}
