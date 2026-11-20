/** Probe before mounting Three so the operational IDE remains available. */
export function supportsRuntimeWebGL(): boolean {
  if(typeof document==='undefined')return false
  const canvas=document.createElement('canvas')
  try {
    const context=canvas.getContext('webgl2',{failIfMajorPerformanceCaveat:false})
    if(!context)return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  }catch{return false}
}
export const graphicsRecovery:{retry:(()=>void)|null}={retry:null}
