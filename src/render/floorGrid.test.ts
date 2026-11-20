import {expect,it} from 'vitest'
import gridSource from '@react-three/drei/core/Grid.js?raw'
import {ShaderMaterial} from 'three'
import {configureFloorGrid,floorGridFragment} from './floorGrid'

it('dims the installed grid coverage after intersections and before discard/output without altering spacing or distance fade',()=>{
 const fragment=gridSource.match(/uniform float cellSize;[\s\S]*?#include <tonemapping_fragment>/)?.[0]
 if(!fragment)throw new Error('Installed grid fragment could not be inspected')
 const material=new ShaderMaterial(),opacity={value:.45},shader={uniforms:{},fragmentShader:fragment,vertexShader:''}
 configureFloorGrid(material,opacity)
 material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0],{} as Parameters<typeof material.onBeforeCompile>[1])
 expect(shader.uniforms).toMatchObject({runtimeFloorOpacity:opacity})
 expect(shader.fragmentShader.indexOf('clamp(gl_FragColor.a')).toBeGreaterThan(shader.fragmentShader.indexOf('gl_FragColor.a = mix'))
 expect(shader.fragmentShader.indexOf('* runtimeFloorOpacity')).toBeLessThan(shader.fragmentShader.indexOf('discard;'))
 expect(shader.fragmentShader).toContain('getGrid(cellSize, cellThickness)')
 expect(shader.fragmentShader).toContain('getGrid(sectionSize, sectionThickness)')
 expect(shader.fragmentShader).toContain('pow(d, fadeStrength)')
 expect(material.depthWrite).toBe(false);expect(material.toneMapped).toBe(false)
 opacity.value=1;expect(Reflect.get(shader.uniforms,'runtimeFloorOpacity').value).toBe(1)
 material.dispose()
})
it('fails explicitly on an incompatible grid shader instead of silently keeping full-strength empty-world ink',()=>{
 expect(()=>floorGridFragment('void main() {}')).toThrow('Unsupported grid shader')
})
