import {expect,it} from 'vitest'
import fc from 'fast-check'
import {PerspectiveCamera,Vector3} from 'three'
import {placeStructuralLabels,projectStructuralLabel,structuralRectsOverlap,type StructuralLabelSpec} from './structuralLabelLayout'
const spec=(id:string,x:number,priority=2):StructuralLabelSpec=>({id,kind:'cluster',position:[x,0,0],size:.3,localBounds:[-1,1,.08,.83],priority,count:12})
const cameraAt=(distance:number)=>{const camera=new PerspectiveCamera(36,16/9,.05,10000);camera.position.set(0,8,distance);camera.lookAt(0,0,0);camera.updateMatrixWorld();return camera}
it('keeps visible text at least 12 pixels on its real plane through depth and viewport changes (100 cases)',()=>{
 fc.assert(fc.property(fc.integer({min:650,max:1117}),fc.integer({min:760,max:1920}),fc.integer({min:8,max:1500}),(height,width,distance)=>{
  const camera=cameraAt(distance),label=projectStructuralLabel(spec('recorded',0),camera,{width,height})
  expect(label.bounds).toBeTruthy();expect(label.minimumFontPixels).toBeGreaterThanOrEqual(12)
  const point=new Vector3(0,0,0).project(camera);expect(point.z).toBeLessThan(1)
  expect(label.scale).toBeGreaterThanOrEqual(1)
 }),{numRuns:100})
})
it('admits the selected cluster first, clips whole labels, avoids Inspector and keeps deterministic non-overlap',()=>{
 const camera=cameraAt(200),viewport={width:1440,height:900},safe={x:200,y:80,width:1200,height:700}
 const labels=[spec('background',0),spec('selected',0,0),spec('outside',1000),spec('clear',40)]
 const before=JSON.stringify(labels),placed=placeStructuralLabels(labels,camera,viewport,safe),shown=placed.filter(label=>label.visible)
 expect(shown.map(label=>label.id)).toEqual(['background','selected','clear'])
 expect(shown.find(label=>label.id==='selected')!.position).toEqual(labels[1].position)
 expect(shown.find(label=>label.id==='background')!.position[1]).toBeGreaterThan(labels[0].position[1])
 expect(placeStructuralLabels(labels,camera,viewport,safe)).toEqual(placed)
 for(let i=0;i<shown.length;i++)for(let j=i+1;j<shown.length;j++)expect(structuralRectsOverlap(shown[i].bounds!,shown[j].bounds!)).toBe(false)
 const selectedBounds=shown.find(label=>label.id==='selected')!.bounds!
 const lifted=placeStructuralLabels(labels,camera,viewport,safe,[selectedBounds]).find(label=>label.id==='selected')!
 expect(lifted.visible).toBe(true);expect(lifted.bounds!.y).toBeLessThan(selectedBounds.y);expect(structuralRectsOverlap(lifted.bounds!,selectedBounds)).toBe(false)
 expect(JSON.stringify(labels)).toBe(before)
})
it('measures the real glyph-axis projection at steep camera angles',()=>{
 for(const height of [650,900,1117])for(const angle of [13,45,70]){
  const camera=new PerspectiveCamera(36,1440/height,.05,10000),radians=angle*Math.PI/180
  camera.position.set(0,Math.sin(radians)*200,Math.cos(radians)*200);camera.lookAt(0,0,0);camera.updateMatrixWorld()
  const label=projectStructuralLabel(spec('oblique',0),camera,{width:1440,height})
  expect(label.bounds).toBeTruthy();expect(label.minimumFontPixels).toBeGreaterThanOrEqual(12)
 }
})
it('omits behind-camera and clipped text without changing its anchor',()=>{
 const camera=cameraAt(20),label={...spec('behind',0),position:[0,8,50] as const},before=JSON.stringify(label)
 expect(projectStructuralLabel(label,camera,{width:1440,height:900})).toMatchObject({bounds:null,visible:false})
 expect(JSON.stringify(label)).toBe(before)
})
it('lifts a blocked region heading within two font heights on its original 3D plane',()=>{
 const camera=cameraAt(60),viewport={width:1440,height:900},safe={x:0,y:0,width:1440,height:900}
 const heading:StructuralLabelSpec={...spec('HEAP',4,1),kind:'heading',size:.6,localBounds:[0,2.4,-.3,.3]}
 const before=JSON.stringify(heading),base=projectStructuralLabel(heading,camera,viewport)
 const placed=placeStructuralLabels([heading],camera,viewport,safe,[base.bounds!])[0]
 expect(placed.visible).toBe(true);expect(placed.minimumFontPixels).toBeGreaterThanOrEqual(12)
 expect(structuralRectsOverlap(placed.bounds!,base.bounds!)).toBe(false)
 expect(placed.position[0]).toBe(heading.position[0]);expect(placed.position[2]).toBe(heading.position[2])
 expect(placed.position[1]-heading.position[1]).toBeGreaterThan(0)
 expect(placed.position[1]-heading.position[1]).toBeLessThanOrEqual(2*heading.size*placed.scale)
 expect(JSON.stringify(heading)).toBe(before)
})
it('omits a heading when every bounded candidate is obstructed rather than detaching it from its region',()=>{
 const camera=cameraAt(60),viewport={width:1440,height:900},safe={x:0,y:0,width:1440,height:900}
 const heading:StructuralLabelSpec={...spec('STACK',0,1),kind:'heading',size:.6,localBounds:[0,2.4,-.3,.3]}
 const blocked=[0,1,2].map(lift=>projectStructuralLabel(heading,camera,viewport,lift).bounds!)
 expect(placeStructuralLabels([heading],camera,viewport,safe,blocked)[0].visible).toBe(false)
})
