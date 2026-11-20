import {expect,test} from 'vitest'
import {existsSync,readFileSync,readdirSync} from 'node:fs'
import {join,relative} from 'node:path'
import ts from 'typescript'

const retired=[
 'src/classic','src/scene','src/navigation','src/playback','src/contracts/worldV2.ts','src/contracts/visualization.ts',
 'src/world/spatialLayout.ts','src/world/layout.ts','src/world/spatialPresentation.ts','src/world/detailedScene.ts','src/world/isolatedScene.ts','src/world/objectFace.ts','src/world/arrayGeometry.ts','src/world/runtimeHeadings.ts','src/world/callStructure.ts','src/world/sceneModel.ts',
 'src/ui/Inspector.tsx','src/app/layoutForTrace.ts','src/app/animationQuality.ts','src/examples/curatedLayout.ts','src/examples/scopedLayout.ts','src/examples/ControlFlowStatus.tsx','src/examples/captions.ts',
]
function sources(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const path=join(directory,entry.name);return entry.isDirectory()?sources(path):/\.(?:ts|tsx|css)$/.test(path)&&!path.includes('.test.')?[path]:[]})}
const files=sources('src')
test('production contains no superseded runtime modules or parallel renderer contracts',()=>{
 expect(retired.filter(path=>existsSync(path))).toEqual([])
})
test('production imports and declarations cannot revive retired presentation primitives',()=>{
 const banned=new Set(['CameraMode','SolidBody','SolidFace','IdentitySolid','WorldOverviewLabels','ConnectorCaptions'])
 const failures=[]
 for(const file of files.filter(path=>!path.endsWith('.css'))){
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
  const visit=node=>{
   if(ts.isIdentifier(node)&&banned.has(node.text))failures.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line+1}: ${node.text}`)
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
    const spec=node.moduleSpecifier.text
    if(/(?:^|\/)(?:classic|scene|navigation|playback)(?:\/|$)/.test(spec)||spec.includes('worldV2'))failures.push(`${file}: ${spec}`)
   }
   ts.forEachChild(node,visit)
  };visit(source)
 }
 expect(failures).toEqual([])
})
test('ordinary projects and examples render the same production Shell',()=>{
 const file='src/app/AppRoot.tsx',source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),components=[],imports=[]
 const visit=node=>{
  if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier))imports.push(node.moduleSpecifier.text)
  if(ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))components.push(node.tagName.getText(source))
  ts.forEachChild(node,visit)
 };visit(source)
 expect(imports).toContain('../shell/Shell')
 expect(new Set(components)).toEqual(new Set(['Shell']))
 expect(source.text).toContain("'/examples'")
 expect(files.filter(path=>relative('src',path).match(/(?:^|\/)(?:Classic|Theater)(?:\.|\/)/))).toEqual([])
})
