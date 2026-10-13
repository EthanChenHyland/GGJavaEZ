import {expect,test} from 'vitest'
import {checkReferences} from '../../scripts/reference/check-references.mjs'

test('the six original references retain their bytes and tracked/user-owned status',()=>{
 const report=checkReferences()
 expect(report.failures).toEqual([])
 expect(report.images).toHaveLength(6)
 expect(report.images.filter(image=>image.tracked).map(image=>image.root)).toEqual(['best.png'])
})
