import {useMemo,useState} from 'react'
import type {ConsoleEntry} from '../contracts/runtime'
import type {ExecutionSession} from '../execution/contracts'
import type {BuildResult} from '../ide/contracts'
import type {ConsoleChunk,ConsoleChannel} from './consoleLineIndex'
export interface ConsolePresentationInput {build:BuildResult|null;execution:ExecutionSession|null;hasRecording:boolean;entries:readonly ConsoleEntry[]}
/** Shared output groups; ownership, channel order and retention stay unchanged. */
export function useConsolePresentation({build,execution,hasRecording,entries}:ConsolePresentationInput){
  const recorded = useMemo<ConsoleChunk[]>(() => entries.map(entry => ({ key: entry.eventId,
    channel: entry.kind === 'input' ? 'stdin' : entry.channel ?? 'stdout', text: entry.text })), [entries])
  const ordered = useMemo<ConsoleChunk[]>(() => (execution?.runEvents ?? []).map(event => ({ key: String(event.id), channel: event.kind,
    text: event.kind === 'exit' ? event.signal ? `Process stopped (${event.signal})` : `Process finished with exit code ${event.exitCode ?? '—'}` : event.text ?? '' })), [execution?.runEvents])
  const buildChunks = useMemo<ConsoleChunk[]>(() => build?.rawOutput && !build.success ? [{ key: 'build', channel: 'stderr', text: build.rawOutput }] : [], [build])
  const stdout = useMemo<ConsoleChunk[]>(() => [{ key: 'pipe:stdout', channel: 'stdout', text: execution?.stdout ?? '' }], [execution?.stdout])
  const stderr = useMemo<ConsoleChunk[]>(() => [{ key: 'pipe:stderr', channel: 'stderr', text: execution?.stderr ?? '' }], [execution?.stderr])
  const partial = hasRecording && execution?.recording && execution.recording.state !== 'FULL'
  return {recorded,ordered,buildChunks,stdout,stderr,partial}
}

interface Checkpoint {key:string;channel:ConsoleChannel;text:string;before:number;partial:boolean;previous:ConsoleChannel|null}
/** Counts the same logical rows as ConsoleLineIndex without storing line offsets
 * or allocating line strings. Growing pipes scan only their appended suffix. */
export class ConsoleRowCounter {
 private chunks:Checkpoint[]=[];private count=0;private partial=false;private previous:ConsoleChannel|null=null
 scannedCharacters=0
 update(next:readonly ConsoleChunk[]){
  this.scannedCharacters=0;let common=0
  while(common<next.length&&common<this.chunks.length){const a=this.chunks[common],b=next[common];if(a.key!==b.key||a.channel!==b.channel||a.text!==b.text)break;common++}
  const old=this.chunks[common],value=next[common]
  if(old&&value&&(value.channel==='stdout'||value.channel==='stderr')&&common===this.chunks.length-1&&old.key===value.key&&old.channel===value.channel&&value.text.startsWith(old.text)){this.append(value.text.slice(old.text.length),value.channel);old.text=value.text;common++}
  else if(common<this.chunks.length){const checkpoint=this.chunks[common];this.count=checkpoint.before;this.partial=checkpoint.partial;this.previous=checkpoint.previous}
  this.chunks.length=common
  for(let i=common;i<next.length;i++){const chunk=next[i];this.chunks.push({...chunk,before:this.count,partial:this.partial,previous:this.previous});this.append(chunk.text,chunk.channel)}
  return this.count
 }
 private append(text:string,channel:ConsoleChannel){
  this.scannedCharacters+=text.length
  if(!text.length){if(channel==='stdin'){this.count++;this.partial=false;this.previous=channel}return}
  if(this.partial&&this.previous===channel&&(channel==='stdout'||channel==='stderr'))this.count--
  let cursor=0,newline=text.indexOf('\n')
  while(newline!==-1){this.count++;cursor=newline+1;newline=text.indexOf('\n',cursor)}
  this.partial=cursor<text.length;if(this.partial)this.count++;this.previous=channel
 }
}
export function useConsoleRowCount(input:ConsolePresentationInput){
 const model=useConsolePresentation(input),[counters]=useState(()=>Array.from({length:5},()=>new ConsoleRowCounter()))
 // Retained pipe rows in the expandable process-output section are included.
 const groups=[model.buildChunks,model.partial?[]:input.hasRecording?model.recorded:model.ordered,
  model.partial||input.hasRecording&&!!input.execution||!model.ordered.length&&input.execution?.failureKind!=='build'?model.stdout:[],
  model.partial||input.hasRecording&&!!input.execution||!model.ordered.length&&input.execution?.failureKind!=='build'?model.stderr:[]]
 return groups.reduce((count,chunks,index)=>count+counters[index].update(chunks),0)
}
