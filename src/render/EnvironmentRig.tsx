import {memo} from 'react'
import {Environment,Lightformer} from '@react-three/drei'

// Environment's capture effect depends on children identity. Keep the static
// panels stable across runtime updates; context recovery remounts this owner.
export const EnvironmentRig=memo(function EnvironmentRig(){
 return <Environment resolution={256} frames={1}>
  <Lightformer form="rect" position={[-6,10,8]} rotation={[Math.PI/4,0,0]} scale={[12,4,1]} color="#65ACFF" intensity={2.2}/>
  <Lightformer form="rect" position={[14,7,-8]} rotation={[0,Math.PI,0]} scale={[8,12,1]} color="#B777FF" intensity={1.8}/>
  <Lightformer form="rect" position={[2,14,0]} rotation={[Math.PI/2,0,0]} scale={[14,2,1]} color="#EEF4FF" intensity={1}/>
  <Lightformer form="rect" position={[2,-12,0]} rotation={[-Math.PI/2,0,0]} scale={[18,18,1]} color="#0A1230" intensity={.15}/>
 </Environment>
})
