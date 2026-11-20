import type {CommandSnapshot} from '../ide/commands'

/** Open models are authoritative; the persisted index also covers closed drafts. */
export function dirtyRunPaths(snapshot:Pick<CommandSnapshot,'tabs'|'closedDrafts'>):string[]{
 const open=new Set(snapshot.tabs.map(tab=>tab.path))
 return [...new Set([
  ...snapshot.tabs.filter(tab=>tab.draft!==tab.content).map(tab=>tab.path),
  ...snapshot.closedDrafts.filter(draft=>draft.dirty&&!open.has(draft.path)).map(draft=>draft.path),
 ])]
}
interface DirtyRunSaveHost {
 checkContext():void
 paths():readonly string[]
 saveAll():Promise<unknown>
}
/** A save failure, workspace replacement or edit during Save keeps the decision
 * open. The existing save owner retains revision/conflict/source-proof checks. */
export async function saveDirtyRun(approved:readonly string[],host:DirtyRunSaveHost):Promise<void>{
 host.checkContext()
 const added=host.paths().filter(path=>!approved.includes(path))
 if(added.length)throw new Error(`Unsaved files changed; review before Run:\n${added.join('\n')}`)
 await host.saveAll()
 host.checkContext()
 const remaining=host.paths()
 if(remaining.length)throw new Error(`Files changed while saving; review before Run:\n${remaining.join('\n')}`)
}
