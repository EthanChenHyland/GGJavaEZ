import {expect,it} from 'vitest'
import {rankFileItems} from './fileLookup'
it('reaches an exact filename among5000 files before prefix and path-only matches without altering the catalog',()=>{
 const files=Array.from({length:4997},(_,i)=>({id:'src/file'+i,label:`File${i}.java`,detail:`src/package${i}/File${i}.java`}))
 const items=[...files,{id:'long',label:'InventoryApp.javaExtra.java',detail:'src/InventoryApp.javaExtra.java'},{id:'path',label:'Aux.java',detail:'src/InventoryApp.java/Aux.java'},{id:'exact',label:'InventoryApp.java',detail:'src/main/java/InventoryApp.java'}],before=JSON.stringify(items)
 const result=rankFileItems(items,'InventoryApp.java');expect(result[0].id).toBe('exact');expect(result.map(item=>item.id)).toContain('path');expect(JSON.stringify(items)).toBe(before)
 expect(rankFileItems(items,'no such filename anywhere')).toEqual([])
})

it('matches only the actual path and keeps all5000 matches reachable in ranking',()=>{
 const file={id:'a',label:'A.java',detail:'src/A.java'}
 expect(rankFileItems([file],'A.javaA.java')).toEqual([])
 const files=Array.from({length:5000},(_,i)=>({id:String(i),label:`File${i}.java`,detail:`src/File${i}.java`}))
 expect(rankFileItems(files,'java')).toHaveLength(5000)
 expect(rankFileItems(files,'SRC/FILE4999.JAVA')).toEqual([files[4999]])
 expect(rankFileItems(files,'File4999 src')).toEqual([])
})
