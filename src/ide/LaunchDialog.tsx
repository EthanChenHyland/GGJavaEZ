import { useEffect, useRef, useState } from 'react'
import type { LaunchConfiguration } from './javaProject'

export function LaunchDialog({ value, targets, onSave, onClose }: { value: LaunchConfiguration; targets: string[]; onSave: (value: LaunchConfiguration) => void; onClose: () => void }) {
  const [mainClass, setMain] = useState(value.mainClass)
  const [workingDirectory, setDirectory] = useState(value.workingDirectory)
  const [program, setProgram] = useState(JSON.stringify(value.programArgs))
  const [jvm, setJvm] = useState(JSON.stringify(value.jvmArgs))
  const [error, setError] = useState('')
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLSelectElement>('select')?.focus()
    return () => previous?.focus()
  }, [])
  const save = () => {
    try {
      const programArgs: unknown = JSON.parse(program), jvmArgs: unknown = JSON.parse(jvm)
      if (![programArgs, jvmArgs].every((args) => Array.isArray(args) && args.every((arg: unknown) => typeof arg === 'string'))) throw new Error('Arguments must be JSON arrays of strings.')
      onSave({ mainClass, workingDirectory, programArgs: programArgs as string[], jvmArgs: jvmArgs as string[] })
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  return <div className="ide-confirm-backdrop"><form ref={ref} className="ide-confirm ide-launch" role="dialog" aria-modal="true" aria-labelledby="launch-title" onSubmit={(event) => { event.preventDefault(); save() }} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key === 'Tab') {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input,select,textarea,button'))
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}>
    <h2 id="launch-title">Launch configuration</h2>
    <p>Used by Run and Debug. Dependencies come from the project build.</p>
    <label>Main class<select value={mainClass} onChange={(event) => setMain(event.target.value)}><option value="">First runnable main</option>{targets.map((target) => <option key={target}>{target}</option>)}</select></label>
    <label>Working directory<input value={workingDirectory} onChange={(event) => setDirectory(event.target.value)} placeholder="."/></label>
    <label>Program arguments<textarea value={program} onChange={(event) => setProgram(event.target.value)} placeholder={'["first", "second"]'}/></label>
    <label>JVM arguments<textarea value={jvm} onChange={(event) => setJvm(event.target.value)} placeholder={'["-Xmx256m"]'}/></label>
    <small>Arguments are JSON arrays; each string is one argument. Paths are relative to this project.</small>
    {error && <p role="alert">{error}</p>}
    <div><button type="button" onClick={onClose}>Cancel</button><button className="ide-primary" type="submit">Save configuration</button></div>
  </form></div>
}
