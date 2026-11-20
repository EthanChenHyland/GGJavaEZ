/** Curve emphasis is alpha, not RGB darkening. Preserve LineMaterial's AA and depth treatment. */
export function curveAlphaShaders(vertexShader:string,fragmentShader:string):{vertexShader:string;fragmentShader:string} {
 const vertexEntry='void main() {',fragmentOutput='gl_FragColor = vec4( diffuseColor.rgb, alpha );'
 if(!vertexShader.includes(vertexEntry)||!fragmentShader.includes(fragmentOutput))throw new Error('Unsupported LineMaterial shader: curve alpha capability unavailable')
 return{vertexShader:'attribute float instanceCurveOpacity;\nvarying float vCurveOpacity;\n'+vertexShader.replace(vertexEntry,vertexEntry+'\n vCurveOpacity = instanceCurveOpacity;'),fragmentShader:'varying float vCurveOpacity;\n'+fragmentShader.replace(fragmentOutput,'gl_FragColor = vec4( diffuseColor.rgb, alpha * vCurveOpacity );')}
}
