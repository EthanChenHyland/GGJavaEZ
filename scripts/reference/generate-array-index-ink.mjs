import {execFileSync} from 'node:child_process'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'

const root=fileURLToPath(new URL('../../',import.meta.url))
const bundled=join(root,'.ggjavaez/tools/fonttools/bin/python3')
const python=process.env.VJ_FONTTOOLS_PYTHON??(existsSync(bundled)?bundled:'python3')
const program=String.raw`
import hashlib,json,sys
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
path=sys.argv[1]+'/public/fonts/runtime/VisualJavaInter-Medium.ttf'
font=TTFont(path)
units=font['head'].unitsPerEm
cmap=font.getBestCmap()
glyphs=font.getGlyphSet()
alphabet='[]0123456789 ←→…'
bounds=[]
for char in alphabet:
 pen=BoundsPen(glyphs)
 glyphs[cmap[ord(char)]].draw(pen)
 if pen.bounds:bounds.append(pen.bounds)
print(json.dumps({
 'fontSha256':hashlib.sha256(open(path,'rb').read()).hexdigest(),
 'alphabet':alphabet,
 'unitsPerEm':units,
 'ascender':font['hhea'].ascent,
 'descender':font['hhea'].descent,
 'lineGap':font['hhea'].lineGap,
 'inkMinY':min(bound[1] for bound in bounds),
 'inkMaxY':max(bound[3] for bound in bounds)
},indent=2)+'\n',end='')
`
const output=execFileSync(python,['-c',program,root],{encoding:'utf8'})
const path=join(root,'src/render/text/arrayIndexInkMetrics.json')
if(process.argv.includes('--check')){
 if(readFileSync(path,'utf8')!==output)throw new Error('Array index ink metrics differ from the bundled font; regenerate them.')
}else writeFileSync(path,output)
console.log('Verified bundled Inter 500 array index ink metrics.')
