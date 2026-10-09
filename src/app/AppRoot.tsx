import { useState } from 'react'
import { Shell } from '../shell/Shell'
import { curatedExampleOptions, curatedExampleTraces, type CuratedExampleId } from '../examples/catalog'
export function AppRoot() {
  const [recording, setRecording] = useState<CuratedExampleId>(curatedExampleOptions[0].id)
  if (window.location.pathname !== '/examples') return <Shell/>
  return <Shell recording={curatedExampleTraces[recording]} recordingChoices={<><select aria-label="Runtime example" value={recording} onChange={event => setRecording(event.target.value as CuratedExampleId)}>{curatedExampleOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><a href="/">Workspace</a></>}/>
}
