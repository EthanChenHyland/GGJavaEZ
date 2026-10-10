import{expect,it}from'vitest'
import{rowValueLabel}from'./faceTypography'
import{valueText}from'../../world/valueText'
it('separates a captured reference identity or String literal without altering complete Inspector evidence',()=>{
 const ref=valueText({kind:'reference',javaType:'Person',objectId:'person'}, {target:{id:'person',displayId:17,className:'Person',fields:{},allocatedAt:'allocation'}})
 expect(rowValueLabel(ref)).toBe('#17');expect(ref.text).toBe('Person #17');expect(ref.exact).toBe('Person #17')
 const text=valueText({kind:'reference',javaType:'String',objectId:'string'}, {target:{id:'string',displayId:12,className:'java.lang.String',fields:{},allocatedAt:'allocation',string:{value:'Ethan',length:5,truncated:false}}})
 expect(rowValueLabel(text)).toBe('"Ethan"');expect(text.text).toContain('(5 chars) #12');expect(text.exact).toContain('String #12')
})

it('retains delimiter-like content inside a captured Java String literal',()=>{
 const value=valueText({kind:'reference',javaType:'String',objectId:'string'},{target:{id:'string',displayId:12,className:'java.lang.String',fields:{},allocatedAt:'allocation',string:{value:'a · b',length:5,truncated:false}}})
 expect(rowValueLabel(value)).toBe('"a · b"')
})
