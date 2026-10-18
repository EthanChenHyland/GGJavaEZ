import type {IUniform,ShaderMaterial} from 'three'

/** The installed drei grid computes alpha itself and ignores material.opacity.
 * Clamp its coverage before dimming, including intersections of both grids. */
export function floorGridFragment(source:string):string{
 const discard='if (gl_FragColor.a <= 0.0) discard;'
 if(!source.includes(discard))throw new Error('Unsupported grid shader: floor opacity unavailable')
 return 'uniform float runtimeFloorOpacity;\n'+source.replace(discard,'gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0) * runtimeFloorOpacity;\n'+discard)
}
export function configureFloorGrid(material:ShaderMaterial,opacity:IUniform<number>){
 material.depthWrite=false;material.toneMapped=false
 material.onBeforeCompile=shader=>{shader.uniforms.runtimeFloorOpacity=opacity;shader.fragmentShader=floorGridFragment(shader.fragmentShader)}
 material.customProgramCacheKey=()=> 'runtime-floor-grid-opacity-v1'
 material.needsUpdate=true
}
