import {memo} from 'react'
import {Environment,Lightformer} from '@react-three/drei'
import {useThree} from '@react-three/fiber'
import {lighting} from '../theme/tokens'

export const StudioLights=memo(function StudioLights(){
 return <>
  <hemisphereLight args={[lighting.sky,lighting.ground,lighting.fill]}/>
  <directionalLight position={[-10,14,8]} intensity={lighting.key} color={lighting.keyColor}/>
  <directionalLight position={[12,8,-13]} intensity={lighting.rim} color={lighting.rimColor}/>
  <directionalLight position={[4,0,10]} intensity={lighting.bounce} color={lighting.bounceColor}/>
 </>
})

// Environment's capture effect depends on children identity. Keep the static
// panels stable across runtime updates; context recovery remounts this owner.
export const EnvironmentRig=memo(function EnvironmentRig(){
 const gl=useThree(state=>state.gl)
 // The environment and PMREM capture allocate float textures. The
 // directional and hemisphere rig still lights the byte-buffer fallback.
 if(!gl.extensions.has('EXT_color_buffer_float')) return null
 return <Environment resolution={256} frames={1}>
  <Lightformer form="rect" position={[-6,10,8]} rotation={[Math.PI/4,0,0]} scale={[13,7,1]} color={lighting.keyColor} intensity={1.4}/>
  <Lightformer form="rect" position={[14,7,-8]} rotation={[0,Math.PI,0]} scale={[9,6,1]} color={lighting.rimColor} intensity={.72}/>
  <Lightformer form="rect" position={[2,14,0]} rotation={[Math.PI/2,0,0]} scale={[17,3,1]} color={lighting.stripColor} intensity={1.15}/>
  <Lightformer form="rect" position={[2,-12,0]} rotation={[-Math.PI/2,0,0]} scale={[18,18,1]} color={lighting.ground} intensity={.18}/>
 </Environment>
})
