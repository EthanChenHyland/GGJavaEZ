import {execFileSync} from 'node:child_process'
import {existsSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
const root=fileURLToPath(new URL('../../',import.meta.url))
const bundled=join(root,'.ggjavaez/tools/fonttools/bin/python3')
const python=process.env.VJ_FONTTOOLS_PYTHON??(existsSync(bundled)?bundled:'python3')
const program=String.raw`
import json,sys
from fontTools.ttLib import TTFont
root=sys.argv[1]
result={}
for weight,name in [(400,'runtime/VisualJavaInter-Regular.ttf'),(500,'runtime/VisualJavaInter-Medium.ttf'),(600,'runtime/VisualJavaInter-SemiBold.ttf')]:
 font=TTFont(root+'/public/fonts/'+name)
 units=font['head'].unitsPerEm
 cmap=font.getBestCmap()
 advances={str(code):round(font['hmtx'].metrics[glyph][0]/units,7) for code,glyph in cmap.items()}
 pairs={}
 ascii_codes=range(32,127)
 if 'GPOS' in font:
  gpos=font['GPOS'].table
  indices=set(index for record in gpos.FeatureList.FeatureRecord if record.FeatureTag=='kern' for index in record.Feature.LookupListIndex)
  for index in sorted(indices):
   lookup=gpos.LookupList.Lookup[index]
   for raw in lookup.SubTable:
    sub=raw.ExtSubTable if lookup.LookupType==9 and raw.ExtensionLookupType==2 else raw
    if lookup.LookupType not in [2,9] or not hasattr(sub,'PairSet') and not hasattr(sub,'Class1Record'):continue
    coverage={glyph:i for i,glyph in enumerate(sub.Coverage.glyphs)}
    for first in ascii_codes:
     glyph=cmap.get(first)
     if glyph not in coverage:continue
     for second in ascii_codes:
      other=cmap.get(second)
      value=None
      if sub.Format==1:
       for record in sub.PairSet[coverage[glyph]].PairValueRecord:
        if record.SecondGlyph==other:value=record.Value1;break
      elif sub.Format==2:
       value=sub.Class1Record[sub.ClassDef1.classDefs.get(glyph,0)].Class2Record[sub.ClassDef2.classDefs.get(other,0)].Value1
      delta=getattr(value,'XAdvance',0) if value else 0
      if delta:
       key=str(first)+','+str(second)
       pairs[key]=round(pairs.get(key,0)+delta/units,7)
 result[str(weight)]={'advances':advances,'kerning':pairs,'missingAdvance':round(font['hmtx'].metrics['.notdef'][0]/units,7)}
 font.close()
print(json.dumps(result,separators=(',',':'),sort_keys=True))
`
const metrics=execFileSync(python,['-c',program,root],{encoding:'utf8',maxBuffer:4*1024*1024})
writeFileSync(join(root,'src/render/text/interMetrics.json'),metrics)
console.log('Generated local Inter 400/500/600 advances and ASCII kerning.')
