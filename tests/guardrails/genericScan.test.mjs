import {expect,test} from 'vitest'
import {scanGeneric,scanSource} from '../../scripts/reference/scan-generic.mjs'

test.each(['Person','person','createPersonWorld','PERSON','Per_son','P-e-r-s-o-n','compute_factorial','bubble-sort','bubble sort','sortDemo','acc01-clinic-maven'])('rejects fixture word/camel segments: %s',name=>{
 expect(scanSource(`const value = '${name}'`,'unit.ts',['acc01-clinic-maven'])).toHaveLength(1)
})
test('ignores comments, substrings and genuine product commands, but checks identifiers and artwork captions',()=>{
 expect(scanSource('// Person\n/* SortDemo */\nconst personal = "personality"; const label = "Focus"','unit.ts')).toEqual([])
 expect(scanSource('const personWorld = 1;\nconst title = "Fly up to a single object"','unit.ts').map(hit=>hit.line)).toEqual([1,2])
})
test('generic production sources contain no fixture-specific implementation',()=>{
 expect(scanGeneric()).toEqual([])
})
