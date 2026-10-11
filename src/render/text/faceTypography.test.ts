import{expect,it}from'vitest'
import{rowValueLabel}from'./faceTypography'
import{valueText}from'../../world/valueText'
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
