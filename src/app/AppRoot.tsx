import { useState } from 'react'
import { Shell } from '../shell/Shell'
import { curatedExampleOptions, curatedExampleTraces, type CuratedExampleId } from '../examples/catalog'
export function AppRoot() {
  const [recording, setRecording] = useState<CuratedExampleId>(curatedExampleOptions[0].id)
  if (window.location.pathname !== '/examples') return <Shell/>
  return <Shell recording={curatedExampleTraces[recording]} recordingChoices={{value:recording,options:curatedExampleOptions,onSelect:id=>setRecording(id as CuratedExampleId)}}/>
}
