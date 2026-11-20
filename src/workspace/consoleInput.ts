import type { ExecutionSession } from '../execution/contracts'

export interface ConsoleSubmission { key:string; sessionId:string; text:string }
export interface ConsoleInputState { pending:boolean; feedback:string|null; submissions:readonly ConsoleSubmission[] }
export const emptyConsoleInput:ConsoleInputState = {pending:false,feedback:null,submissions:[]}
export const acceptsConsoleInput = (session:Pick<ExecutionSession,'phase'>|null) => !!session && ['RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(session.phase)
interface InputContext {
  active:boolean; projectId:string; generation:number; text:string; worldSessionId:string|null
  session:Pick<ExecutionSession,'id'|'projectId'|'phase'>|null
}
interface InputHost {
  context():InputContext
  send(id:string,text:string):Promise<{ok:boolean}>
  clear():void
  changed(state:ConsoleInputState):void
}
const sameOwner = (a:InputContext,b:InputContext) => b.active && a.projectId===b.projectId && a.generation===b.generation && a.session?.id===b.session?.id

/** Client acknowledgements are submission evidence only, never runtime events.
 * Current draft, process identity and project generation are read at the action. */
export class ConsoleInputController {
  state:ConsoleInputState = emptyConsoleInput
  private owner:InputContext
  private token=0
  private sequence=0
  constructor(private host:InputHost) { this.owner=host.context() }
  private publish(state:ConsoleInputState) { this.state=state; this.host.changed(state) }
  reconcile() {
    const context=this.host.context(), changed=!sameOwner(this.owner,context)
    const submissions=this.state.submissions.filter(row=>row.sessionId===context.session?.id || row.sessionId===context.worldSessionId)
    if(changed) this.token++
    this.owner=context
    if(changed || submissions.length!==this.state.submissions.length)
      this.publish({pending:changed?false:this.state.pending,feedback:changed?null:this.state.feedback,submissions})
  }
  reset() { this.token++; this.owner=this.host.context(); this.publish(emptyConsoleInput) }
  async submit() {
    this.reconcile()
    const captured=this.host.context()
    if(!captured.active || this.state.pending) return
    if(!captured.session || captured.session.projectId!==captured.projectId || !acceptsConsoleInput(captured.session)) {
      this.publish({...this.state,feedback:'Program is not accepting input'})
      return
    }
    const token=++this.token, text=captured.text+'\n', id=captured.session.id
    this.publish({...this.state,pending:true,feedback:null})
    try {
      const result=await this.host.send(id,text)
      const current=this.host.context()
      if(token!==this.token || !sameOwner(captured,current)) return
      if(result.ok!==true) throw new Error('The write was not acknowledged')
      const submission={key:`submission-${++this.sequence}`,sessionId:id,text}
      this.publish({pending:false,feedback:'Input submission acknowledged',submissions:[...this.state.submissions,submission]})
      if(current.text===captured.text) this.host.clear()
    } catch(error) {
      const current=this.host.context()
      if(token!==this.token || !sameOwner(captured,current)) return
      this.publish({...this.state,pending:false,feedback:!acceptsConsoleInput(current.session)?'Program is not accepting input':
        `Input submission not confirmed: ${error instanceof Error?error.message:String(error)}`})
    }
  }
}
