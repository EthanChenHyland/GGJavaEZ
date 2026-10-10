/** A semantic blue/violet emitter is identified by its peak radiance. Using
 * perceived luminance would suppress violet at the same specified HDR range. */
export function emitterHighPass(fragmentShader:string):string {
 return fragmentShader.replace('float v = luminance( texel.xyz );','float v = max(texel.r, max(texel.g, texel.b));')
}
