import{expect,it}from'vitest'
import{frameTitleLines,rowValueLabel}from'./faceTypography'
import{valueText,truncateFrameText}from'../../world/valueText'
import{fitWorldText,textAdvance}from'./textSystem'
it('retains the declaring type and method signature in two fixed-font header lines',()=>{
 const title='InventoryApp.main(String[])',width=3.6
 expect(fitWorldText(title,width,.4,600)).not.toBe(title)
 const lines=frameTitleLines(title,width)
 expect(lines).toEqual(['InventoryApp.','main(String[])'])
 expect(lines.join('')).toBe(title)
 for(const line of lines)expect(textAdvance(line,600)*.4).toBeLessThanOrEqual(width)
 expect(frameTitleLines('Main.run()',width)).toEqual(['Main.run()'])
})
it('preserves the single 28-character title summary and bounds extremely wide fallback glyphs',()=>{
 const title='WarehouseService.acceptDelivery(java.util.Map<String,List<Integer>>)',lines=frameTitleLines(title,3.6)
 expect(lines.join('')).toBe(truncateFrameText(title))
 expect(Array.from(lines.join(''))).toHaveLength(28)
 expect(lines.join('').match(/…/g)).toHaveLength(1)
 for(const text of ['W'.repeat(100),'🟣'.repeat(40)])for(const width of [.1,1,3.6]){
  const fitted=frameTitleLines(text,width)
  expect(fitted.length).toBeLessThanOrEqual(2)
  for(const line of fitted)expect(textAdvance(line,600)*.4).toBeLessThanOrEqual(width)
  expect(fitted.join('').match(/…/g)?.length??0).toBeLessThanOrEqual(1)
 }
})
it('retains runtime reference types, identities and String length alongside the declared type column',()=>{
 const ref=valueText({kind:'reference',javaType:'Person',objectId:'person'}, {target:{id:'person',displayId:17,className:'Person',fields:{},allocatedAt:'allocation'}})
 expect(rowValueLabel(ref)).toBe('Person #17');expect(ref.text).toBe('Person #17');expect(ref.exact).toBe('Person #17')
 const text=valueText({kind:'reference',javaType:'String',objectId:'string'}, {target:{id:'string',displayId:12,className:'java.lang.String',fields:{},allocatedAt:'allocation',string:{value:'Ethan',length:5,truncated:false}}})
 expect(rowValueLabel(text)).toBe('"Ethan" (5 chars) #12');expect(text.text).toContain('(5 chars) #12');expect(text.exact).toContain('String #12')
})

it('retains delimiter-like content inside a captured Java String literal',()=>{
 const value=valueText({kind:'reference',javaType:'String',objectId:'string'},{target:{id:'string',displayId:12,className:'java.lang.String',fields:{},allocatedAt:'allocation',string:{value:'a · b',length:5,truncated:false}}})
 expect(rowValueLabel(value)).toBe('"a · b" (5 chars) #12')
})

it('keeps bounded String previews and array/collection summary sizes without changing exact captured evidence',()=>{
 const string=valueText({kind:'reference',javaType:'String',objectId:'string'},{target:{id:'string',displayId:12,className:'java.lang.String',fields:{},allocatedAt:'allocation',string:{value:'a'.repeat(1000),length:1000,truncated:false}}})
 expect(rowValueLabel(string)).toBe('"'+'a'.repeat(48)+'…" (1000 chars) #12')
 expect(string.exact).toBe('"'+'a'.repeat(1000)+'" · String #12')
 const array=valueText({kind:'reference',javaType:'Object',objectId:'array'},{target:{id:'array',displayId:23,className:'int[]',fields:{},allocatedAt:'allocation',array:{elementType:'int',length:5,elements:[],truncated:true}}})
 expect(rowValueLabel(array)).toBe('int[5] #23')
 const collection=valueText({kind:'reference',javaType:'Object',objectId:'list'},{target:{id:'list',displayId:31,className:'java.util.ArrayList',fields:{},allocatedAt:'allocation',library:{kind:'LIST',size:3,items:[],truncated:true}}})
 expect(rowValueLabel(collection)).toBe('List · size 3 #31')
})
