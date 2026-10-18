import {expect,it} from 'vitest'
import {faceColumns} from './faceTypography'
import {fitWorldText} from './textSystem'

it('keeps ordinary recorded object names and declared types whole at the fixed face fonts',()=>{
 const rows=[{name:'label',type:'String'},{name:'quantity',type:'int'},{name:'tags',type:'List'},{name:'related',type:'StockItem'}]
 const columns=faceColumns(5.2,'CLOSE',rows)
 for(const row of rows){
  expect(fitWorldText(row.name,columns.name,.32,500)).toBe(row.name)
  expect(fitWorldText(row.type,columns.type,.27,400)).toBe(row.type)
 }
})

it('keeps notebook and String[] readable on a frame without shrinking text or covering its value column',()=>{
 const rows=[{name:'args',type:'String[]'},{name:'notebook',type:'StockItem'},{name:'score',type:'int',indent:.18}]
 const columns=faceColumns(4.8,'CLOSE',rows)
 for(const row of rows)expect(fitWorldText(row.name,columns.name-(row.indent??0),.32,500)).toBe(row.name)
 expect(fitWorldText('String[]',columns.type,.27)).toBe('String[]')
 expect(columns.value).toBeGreaterThanOrEqual((4.8-.56)*.35)
 expect(columns.typeOffset+columns.type).toBeLessThan(4.8-.56-columns.value)
})

it('reclaims space from short name/type columns to retain an actual reference type and identity',()=>{
 const columns=faceColumns(4.8,'CLOSE',[{name:'p',type:'Person'},{name:'args',type:'String[]'}])
 expect(fitWorldText('Person #17',columns.value,.34,600)).toBe('Person #17')
 expect(fitWorldText('p',columns.name,.32,500)).toBe('p')
 expect(fitWorldText('Person',columns.type,.27)).toBe('Person')
})

it('fits the ordinary MEDIUM name/arrow without mounting a declared-type column',()=>{
 const columns=faceColumns(4.8,'MEDIUM',[{name:'notebook',type:'StockItem'}])
 expect(fitWorldText('notebook →',columns.name,.32,500)).toBe('notebook →')
 expect(columns.type).toBe(0)
 expect(columns.value).toBeGreaterThanOrEqual((4.8-.56)*.35)
})

it('bounds long names, types and scoped indents on every real face width and leaves the captured rows unchanged',()=>{
 const rows=[{name:'value'.repeat(80),type:'Map<String,List<Map<Long,CharSequence>>>',indent:.36},{name:'x',type:'int'}],before=JSON.stringify(rows)
 for(const width of[3.8,4.2,4.8,5.2])for(const detail of['MEDIUM','CLOSE']as const){
  const columns=faceColumns(width,detail,rows),available=width-.56
  expect(columns.name).toBeGreaterThan(.36)
  expect(columns.value).toBeGreaterThanOrEqual(available*.35)
  if(detail==='CLOSE'){
   expect(columns.name).toBeLessThan(columns.typeOffset)
   expect(columns.typeOffset+columns.type).toBeLessThan(available-columns.value)
  }else expect(columns.name).toBeLessThan(available-columns.value)
  expect(fitWorldText(rows[0].name,columns.name-.36,.32,500)).toContain('…')
 }
 expect(JSON.stringify(rows)).toBe(before)
})
