import { describe,expect,it,vi } from 'vitest'
import { ConsoleInputController } from './consoleInput'
type Context=ReturnType<ConstructorParameters<typeof ConsoleInputController>[0]['context']>
const deferred=()=>{let resolve!:(value:{ok:boolean})=>void, reject!:(error:Error)=>void
  const promise=new Promise<{ok:boolean}>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
const fixture=()=>{
  const context:Context={active:true,projectId:'project',generation:0,text:'  & <exact> 😀  ',worldSessionId:'first',session:{id:'first',projectId:'project',phase:'WAITING_FOR_INPUT'}}
  const ack=deferred(),send=vi.fn(()=>ack.promise),clear=vi.fn(()=>{context.text=''}),changed=vi.fn()
  const controller=new ConsoleInputController({context:()=>({...context}),send,clear,changed})
  return {context,ack,send,clear,changed,controller}
}
describe('acknowledged Console submissions',()=>{
  it('sends unchanged text and one LF, recording only the acknowledgement',async()=>{
    const f=fixture(),work=f.controller.submit()
    expect(f.send).toHaveBeenCalledWith('first','  & <exact> 😀  \n');expect(f.controller.state.submissions).toEqual([])
    f.ack.resolve({ok:true});await work
    expect(f.controller.state.submissions).toEqual([{key:'submission-1',sessionId:'first',text:'  & <exact> 😀  \n'}])
    expect(f.context.text).toBe('');expect(f.controller.state.pending).toBe(false)
  })
  it('sends a lone LF for an empty field',async()=>{
    const f=fixture();f.context.text='';const work=f.controller.submit();f.ack.resolve({ok:true});await work
    expect(f.send).toHaveBeenCalledWith('first','\n');expect(f.controller.state.submissions[0].text).toBe('\n')
  })
  it('serializes duplicate Enter while a write is unacknowledged',async()=>{
    const f=fixture(),work=f.controller.submit();await f.controller.submit()
    expect(f.send).toHaveBeenCalledTimes(1);f.ack.resolve({ok:true});await work
    f.context.text='second';await f.controller.submit()
    expect(f.controller.state.submissions.map(row=>row.text)).toEqual(['  & <exact> 😀  \n','second\n'])
  })
  it('preserves text edited while an earlier submission is pending',async()=>{
    const f=fixture(),work=f.controller.submit();f.context.text='new draft';f.ack.resolve({ok:true});await work
    expect(f.context.text).toBe('new draft');expect(f.clear).not.toHaveBeenCalled()
  })
  it.each(['COMPLETED','STOPPED','FAILED','BUILDING'] as const)('sends nothing in %s and preserves the draft',async phase=>{
    const f=fixture();f.context.session!.phase=phase;await f.controller.submit()
    expect(f.send).not.toHaveBeenCalled();expect(f.controller.state.submissions).toEqual([])
    expect(f.context.text).toBe('  & <exact> 😀  ');expect(f.controller.state.feedback).toBe('Program is not accepting input')
  })
  it('preserves the draft and reports uncertain delivery without inventing consumption or closure',async()=>{
    const f=fixture(),work=f.controller.submit();f.ack.reject(new Error('Disconnected'));await work
    expect(f.controller.state.feedback).toBe('Input submission not confirmed: Disconnected')
    expect(f.controller.state.submissions).toEqual([]);expect(f.context.text).toBe('  & <exact> 😀  ')
  })
  it('reports actual process termination when a rejected write races exit',async()=>{
    const f=fixture(),work=f.controller.submit();f.context.session!.phase='COMPLETED';f.ack.reject(new Error('write failed'));await work
    expect(f.controller.state.feedback).toBe('Program is not accepting input');expect(f.controller.state.submissions).toEqual([])
  })
  it.each(['session','generation','unmount'] as const)('rejects stale acknowledgement after %s retirement',async kind=>{
    const f=fixture(),work=f.controller.submit()
    if(kind==='session')f.context.session={id:'replacement',projectId:'project',phase:'RUNNING'}
    if(kind==='generation')f.context.generation++
    if(kind==='unmount')f.context.active=false
    f.context.text='replacement draft';f.ack.resolve({ok:true});await work
    expect(f.clear).not.toHaveBeenCalled();expect(f.controller.state.submissions).toEqual([])
  })
  it('keeps only current and committed-World receipt owners through replacement and project reset',async()=>{
    const f=fixture(),work=f.controller.submit();f.ack.resolve({ok:true});await work
    f.context.session={id:'pending',projectId:'project',phase:'BUILDING'};f.controller.reconcile()
    expect(f.controller.state.submissions[0].sessionId).toBe('first')
    f.context.worldSessionId='pending';f.controller.reconcile();expect(f.controller.state.submissions).toEqual([])
    f.controller.reset();expect(f.controller.state).toEqual({pending:false,feedback:null,submissions:[]})
  })
  it('requires a true acknowledgement before appending or clearing',async()=>{
    const f=fixture(),work=f.controller.submit();f.ack.resolve({ok:false});await work
    expect(f.controller.state.submissions).toEqual([]);expect(f.clear).not.toHaveBeenCalled()
    expect(f.controller.state.feedback).toContain('not acknowledged')
  })
})
