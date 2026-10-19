import {expect,it} from 'vitest'
import fc from 'fast-check'
import type {PresentedCurve,Vec3,WorldAnchor} from '../contracts/world'
import {anchorCorners} from '../world/presentationPlanner'
import {projectionCamera,screenPoint} from './projection'
import {followPathFraming,sampleFlowPath} from './followPathFraming'
const anchor=(id:string,position:Vec3,size:Vec3):WorldAnchor=>({entityId:id,region:'heap',position,size,ports:{},bodyPort:[position[0],position[1],position[2]+size[2]/2]})
const source=anchor('frame',[0,-2,0],[4.8,3.46,1.1]),destination=anchor('object',[9,-3,-2],[5.2,4.05,2.3])
const curve:PresentedCurve={id:'captured-flow',kind:'flow',points:[source.bodyPort,[3,-2,3],[3,-6,3],[8,-6,3],destination.bodyPort],sourceAnchor:source,destinationAnchor:destination,colorRole:'reference',opacity:1,widthPx:3.5,arrow:false}
it('samples an uneven 3D route by travelled distance and preserves the exact ports',()=>{
 expect(sampleFlowPath([[0,0,0],[1,0,0],[1,0,9]],5)).toEqual([[0,0,0],[1,0,1],[1,0,3],[1,0,5],[1,0,7],[1,0,9]])
 expect(sampleFlowPath([[0,0,0],[0,0,0],[10,0,0]],2)).toEqual([[0,0,0],[5,0,0],[10,0,0]])
 expect(sampleFlowPath([[1,1,1],[1,1,1]])).toEqual([])
})
it('centres ordered source-to-destination samples and fits the entire destination in every QA viewport',()=>{
 const before=JSON.stringify(curve)
 for(const[width,height]of [[1728,1117],[1440,900],[1280,800],[760,900],[1440,650]]){
  const viewport={width,height},safe={x:width*.3,y:height*.1,width:width*.65,height:height*.73},poses=followPathFraming(curve,safe,viewport),samples=sampleFlowPath(curve.points)
  expect(poses.length).toBe(samples.length+1)
  samples.forEach((point,index)=>{const screen=screenPoint(point,projectionCamera(poses[index],viewport),viewport);expect(screen.x).toBeCloseTo(safe.x+safe.width/2,5);expect(screen.y).toBeCloseTo(safe.y+safe.height/2,5)})
  for(const point of anchorCorners(destination)){const screen=screenPoint(point,projectionCamera(poses.at(-1)!,viewport),viewport);expect(screen.x).toBeGreaterThanOrEqual(safe.x);expect(screen.x).toBeLessThanOrEqual(safe.x+safe.width);expect(screen.y).toBeGreaterThanOrEqual(safe.y);expect(screen.y).toBeLessThanOrEqual(safe.y+safe.height);expect(screen.z).toBeGreaterThan(-1);expect(screen.z).toBeLessThan(1)}
 }
 expect(JSON.stringify(curve)).toBe(before)
})
it('handles deep and tall destinations without moving their geometry (100 viewports)',()=>{
 fc.assert(fc.property(fc.integer({min:760,max:1920}),fc.integer({min:650,max:1117}),fc.integer({min:1,max:24}),(width,height,h)=>{
  const target=anchor('recorded-cell',[9,-h/2,-8],[5.2,h,2.3]),observed={...curve,destinationAnchor:target,points:[...curve.points.slice(0,-1),target.bodyPort]},viewport={width,height},safe={x:width*.3,y:height*.1,width:width*.65,height:height*.73}
  const final=followPathFraming(observed,safe,viewport).at(-1)!,camera=projectionCamera(final,viewport)
  for(const point of anchorCorners(target)){const p=screenPoint(point,camera,viewport);expect(p.x).toBeGreaterThanOrEqual(safe.x);expect(p.x).toBeLessThanOrEqual(safe.x+safe.width);expect(p.y).toBeGreaterThanOrEqual(safe.y);expect(p.y).toBeLessThanOrEqual(safe.y+safe.height)}
 }),{numRuns:100})
})
it('does not infer a missing endpoint or travel along a connector or invalid curve',()=>{
 const viewport={width:1440,height:900},safe={x:430,y:90,width:970,height:650}
 for(const invalid of [undefined,{...curve,sourceAnchor:undefined},{...curve,destinationAnchor:undefined},{...curve,kind:'connector' as const},{...curve,points:[[NaN,0,0],[1,0,0]] as Vec3[]}])expect(followPathFraming(invalid,safe,viewport)).toEqual([])
})
