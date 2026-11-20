import type {WebGLRenderer} from 'three'

const passes=new WeakMap<WebGLRenderer,Map<string,()=>void>>()
/** Renderer-owned auxiliary work runs immediately before the composer, inside
 * the same submission boundary. Registration never requests an extra frame. */
export function registerAuxiliaryPass(renderer:WebGLRenderer,id:string,render:()=>void){
 const registered=passes.get(renderer)??new Map<string,()=>void>()
 if(registered.has(id))throw new Error(`Duplicate auxiliary render pass: ${id}`)
 registered.set(id,render);passes.set(renderer,registered)
 return()=>{if(registered.get(id)===render)registered.delete(id)}
}
export function renderAuxiliaryPasses(renderer:WebGLRenderer){
 for(const render of passes.get(renderer)?.values()??[])render()
}
