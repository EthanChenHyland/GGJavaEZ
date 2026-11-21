import {expect,it} from 'vitest'
import {faceHeading,faceRowColumns,faceValueInset,faceValueLayout} from './faceTypography'
import type {RuntimeObject} from '../../contracts/runtime'
import type {SceneArray,SceneFrame,ValueText} from '../../contracts/world'
import {notRecordedValue,valueText} from '../../world/valueText'
import {fitWorldText,textAdvance} from './textSystem'
import {world} from '../../theme/tokens'

const frame: SceneFrame = {
 kind:'frame',id:'child',invocationNumber:7,title:'SeriesApp.total(int)',callerId:'parent',depth:3,
 rows:[],status:{kind:'running',line:9},live:true,topOfStack:false,exceptionRole:null,sourceLine:null,
 ownership:'PROJECT',anchor:{entityId:'child',region:'stack',position:[0,-2,-1.25],size:[4.8,4,1.65],ports:{},bodyPort:[-2.4,0,-.7]},
 evidence:{kind:'observed',introducedSeq:1,changedSeq:1,eventIds:['entry']},
}

it.each([
 ['InventoryApp.main(String[])','main','(String[])'],
 ['Outer.Inner.Inner()','Inner','()'],
 ['StaticType.<clinit>()','<clinit>','()'],
 ['WarehouseService.acceptDelivery(Map<String,List<Integer>>)','acceptDelivery',null],
])('prioritizes the captured method name in %s and bounds its parameter summary', (exact,name,parameters)=>{
 const node = {...frame,title:exact}
 const heading = faceHeading(node)
 expect(heading.title.lines).toEqual([name])
 if(parameters)expect(heading.parameters?.text).toBe(parameters)
 else expect(heading.parameters?.text).toMatch(/^\(.*…\)$/)
 const suffix = heading.parameters!
 expect(suffix.size).toBeLessThan(heading.title.size)
 expect(suffix.position[0]).toBeGreaterThan(heading.title.position[0]+textAdvance(name,600)*heading.title.size)
 expect(suffix.position[0]+textAdvance(suffix.text)*suffix.size).toBeLessThan(heading.identity!.position[0]-heading.identityWidth)
 expect(suffix.position.slice(1)).toEqual(heading.title.position.slice(1))
 expect(node.title).toBe(exact)
})

it('distinguishes missing parameter evidence from a proven empty parameter list',()=>{
 const unknown = faceHeading({...frame,title:'App.total(⟨parameters not recorded⟩)'})
 expect(unknown.parameters?.text).toBe('(?)')
 expect(faceHeading({...frame,title:'App.total()'}).parameters?.text).toBe('()')
})

it('preserves the lower recursive header plane and large short-viewport name and parameter font',()=>{
 const normal = faceHeading(frame)
 const short = faceHeading(frame,true)
 expect(short.title.lines).toEqual(['total'])
 expect(short.parameters?.text).toBe('(int)')
 expect(short.title.size).toBeGreaterThan(normal.title.size)
 expect(short.parameters?.size).toBe(short.title.size)
 expect(short.title.position[0]).toBe(normal.title.position[0])
 expect(short.title.position[2]).toBe(normal.title.position[2])
 expect(short.title.position[1]).toBeLessThan(normal.title.position[1])
 expect(short.title.position[1]).toBeCloseTo(-.61)
 expect(short.identity?.position[1]).toBe(short.title.position[1])
})

it('fits very long method identifiers and fallback glyphs before allocating space to parameters',()=>{
 for(const name of ['W'.repeat(100),'🟣'.repeat(40)])for(const width of [1,2,4.8]){
  const node = {...frame,title:'Owner.'+name+'(int)',anchor:{...frame.anchor,size:[width,4,1.65] as const}}
  const heading = faceHeading(node)
  const nameLine = heading.title.lines![0]
  expect(textAdvance(nameLine,600)*heading.title.size).toBeLessThanOrEqual(heading.title.width)
  expect(nameLine).not.toContain('Owner')
  expect(nameLine.match(/…/g)?.length??0).toBeLessThanOrEqual(1)
  const params = heading.parameters
  if(params)expect(textAdvance(params.text)*params.size).toBeLessThanOrEqual(params.width)
 }
})

function reference(target:Partial<RuntimeObject>&Pick<RuntimeObject,'className'>, context?:'frame'):ValueText {
 const object = {id:'target',displayId:17,fields:{},allocatedAt:'allocation',...target}
 return valueText({kind:'reference',javaType:'Object',objectId:object.id},{target:object,context})
}

it('retains runtime types and identities that fit before compacting an ordinary reference to its recorded ID',()=>{
 const ref = reference({className:'pkg.Customer'})
 expect(faceValueLayout(ref,3.5,false,false).text).toBe('Customer #17')
 expect(faceValueLayout(ref,1.35,false,false).text).toBe('#17')
 expect(ref).toMatchObject({exact:'Customer #17',targetType:'pkg.Customer'})
})

it('keeps exact short quoted literals in the shared chip, including escaped quotes and delimiters',()=>{
 const ref = reference({className:'java.lang.String',string:{value:'a" · b',length:6,truncated:false}},'frame')
 const row = {slotId:'s',name:'comment',type:'String',role:'field',value:ref,port:null,evidence:frame.evidence} as const
 const columns = faceRowColumns({...frame,rows:[row]},{detail:'CLOSE'})
 const layout = faceValueLayout(ref,columns.value,false,false)
 expect(layout.text).toBe('"a\\" · b"')
 expect(ref.exact).toBe('"a\\" · b" · String #17')
 expect(layout.width).toBe(columns.value-2*faceValueInset)
 expect(fitWorldText(layout.text,layout.width,layout.size,layout.weight)).toBe(layout.text)
})

it('marks bounded and partly recorded String previews while preserving complete Java escapes and evidence',()=>{
 const string = reference({className:'java.lang.String',string:{value:'ab🟣uvwxyz',length:1000,truncated:true}})
 const capped = faceValueLayout(string,2,false,false).text
 const roomy = faceValueLayout(string,10,false,false).text
 expect(capped).toMatch(/^"ab…"$/)
 expect(roomy).toBe('"ab\\ud83d\\udfe3uvwxyz…"')
 expect(string.exact).toBe('"ab\\ud83d\\udfe3uvwxyz" · String #17')
 expect(string.observation).toBe('TRUNCATED')
 expect(string.recordedLength).toBe(1000)
})

it('retains captured array lengths and collection sizes in narrow references',()=>{
 const array = reference({displayId:23,className:'[I',array:{elementType:'int',length:5,elements:[],truncated:true}})
 const collection = reference({displayId:31,className:'java.util.ArrayList',library:{kind:'LIST',size:3,items:[],truncated:true}})
 expect(faceValueLayout(array,3,false,false).text).toBe('int[5] #23')
 expect(faceValueLayout(array,1.65,false,false).text).toBe('[5] #23')
 expect(faceValueLayout(collection,4,false,false).text).toBe('List · size 3 #31')
 expect(faceValueLayout(collection,1.8,false,false).text).toBe('size 3 #31')
 expect(array.observation).toBe('PARTIALLY_OBSERVED')
 expect(collection.exact).toBe('List · size 3 #31')
})

it('gives a recorded short mutation more area while keeping exact and unavailable values truthful',()=>{
 const changed = valueText({kind:'primitive',javaType:'int',value:18})
 const previous = faceValueLayout(changed,1.35,false,false)
 const current = faceValueLayout(changed,1.35,false,true)
 expect(current.text).toBe('18')
 expect(current.size).toBeGreaterThan(previous.size)
 expect(current.width).toBe(previous.width)
 expect(current.size*1.06).toBeLessThan(world.object.row*.62)
 const unavailable = notRecordedValue()
 expect(faceValueLayout(unavailable,3.8,false,true)).toEqual(faceValueLayout(unavailable,3.8,false,false))
 expect(faceValueLayout(unavailable,3.8,false,true).text).toBe(unavailable.text)
})

it.each([0,12,2147483647])('places the array type, identity and length %i on the title plate',length=>{
 const anchor={entityId:'array',region:'heap' as const,position:[18,-4,8] as const,size:[6.44,1.35,1.67] as const,ports:{},bodyPort:[18,-4,8] as const}
 const array:SceneArray={kind:'array',id:'array',title:'int[]',componentType:'int',displayId:23,length,cells:[],activity:null,outOfBounds:null,anchor,ownership:'PROJECT',evidence:{kind:'observed',introducedSeq:1,changedSeq:1,eventIds:['array']}}
 const {title,identity,length:label}=faceHeading(array)
 const top=anchor.position[1]+anchor.size[1]/2,front=anchor.position[2]+world.array.backplate/2
 for(const text of [title,identity!,label!]){
  expect(text.position[2]).toBeGreaterThan(front)
  expect(text.position[2]).toBeLessThan(front+.1)
  expect(text.position[1]+text.size/2).toBeLessThan(top)
  expect(text.position[1]-text.size/2).toBeGreaterThan(top-world.array.titlePlate)
 }
 expect(label!.text).toBe(`length = ${length}`)
 expect(fitWorldText(label!.text,label!.width,label!.size)).toBe(label!.text)
 expect(title.lines).toEqual([array.title])
 const nested=faceHeading({...array,title:'ExtremelyLongRecordedComponentClassName[][]'}).title
 expect(nested.lines?.[0]).toMatch(/….*\[\]\[\]$/)
 expect(fitWorldText(nested.lines![0],nested.width,nested.size,600)).toBe(nested.lines![0])
})
