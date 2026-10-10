import {execFileSync} from 'node:child_process'
import {existsSync,mkdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
const root=fileURLToPath(new URL('../../',import.meta.url)),bundled=join(root,'.ggjavaez/tools/fonttools/bin/python3')
const python=process.env.VJ_FONTTOOLS_PYTHON??(existsSync(bundled)?bundled:'python3')
mkdirSync(join(root,'public/fonts/runtime'),{recursive:true})
execFileSync(python,['-c',String.raw`
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.varLib.instancer import instantiateVariableFont
root=sys.argv[1]
for weight,source,label in [(400,'Inter.ttf','Regular'),(500,'Inter-Medium.ttf','Medium'),(600,'Inter-SemiBold.ttf','SemiBold')]:
 font=TTFont(root+'/public/fonts/'+source,recalcTimestamp=False)
 if 'fvar' in font:
  instantiateVariableFont(font,{axis.axisTag:weight if axis.axisTag=='wght' else axis.defaultValue for axis in font['fvar'].axes},inplace=True)
 units=font['head'].unitsPerEm
 for code,name,mirror in [(0x27e8,'vj.angleleft',False),(0x27e9,'vj.angleright',True)]:
  pen=TTGlyphPen(None)
  points=[(.35,.85),(.40,.81),(.09,.35),(.40,-.11),(.35,-.15),(.025,.35)]
  coords=[(round((.425-x if mirror else x)*units),round(y*units)) for x,y in points]
  pen.moveTo(coords[0])
  for point in coords[1:]:pen.lineTo(point)
  pen.closePath()
  font['glyf'].glyphs[name]=pen.glyph()
  font['hmtx'].metrics[name]=(round(.43*units),round(.025*units))
  font.setGlyphOrder(font.getGlyphOrder()+[name])
  for table in font['cmap'].tables:
   if table.isUnicode() and table.format in [4,12]:table.cmap[code]=name
 family='Visual Java Inter'
 for nameID,value in [(1,family),(2,label),(3,'VisualJavaInter-'+label),(4,family+' '+label),(6,'VisualJavaInter-'+label),(16,family),(17,label)]:
  for record in list(font['name'].names):
   if record.nameID==nameID:font['name'].setName(value,nameID,record.platformID,record.platEncID,record.langID)
 font.save(root+'/public/fonts/runtime/VisualJavaInter-'+label+'.ttf')
 font.close()
`,root],{stdio:'inherit'})
console.log('Prepared static local Inter derivatives with the two recorded-availability symbols; original fonts are preserved.')
