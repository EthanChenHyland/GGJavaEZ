import {readdir,readFile,access} from 'node:fs/promises'
import {resolve,dirname,relative,extname} from 'node:path'
import {createRequire} from 'node:module'
import ts from 'typescript'
import {it,expect} from 'vitest'
const require=createRequire(import.meta.url),root=process.cwd()
async function files(directory){
 const entries=await readdir(directory,{withFileTypes:true}),all=[]
 for(const entry of entries){const path=resolve(directory,entry.name);if(entry.isDirectory())all.push(...await files(path));else if(/\.(?:[cm]?[jt]sx?|css)$/.test(path))all.push(path)}
 return all
}
it('all literal CSS imports in production modules and live browser fixtures resolve to existing files',async()=>{
 const missing=[]
 for(const file of[...await files(resolve(root,'src')),...await files(resolve(root,'e2e'))]){
  const text=await readFile(file,'utf8'),imports=[]
  if(extname(file)==='.css')for(const match of text.matchAll(/@import\s+['"]([^'"]+)['"]/g))imports.push(match[1])
  else{
   const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true)
   const visit=node=>{
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier))imports.push(node.moduleSpecifier.text)
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0]))imports.push(node.arguments[0].text)
    ts.forEachChild(node,visit)
   };visit(source)
  }
  for(const specifier of imports){
   const path=specifier.split('?')[0];if(!path.endsWith('.css')||/^https?:/.test(path))continue
   try{await access(path.startsWith('.')?resolve(dirname(file),path):path.startsWith('/')?resolve(root,path.slice(1)):require.resolve(path))}
   catch{missing.push(`${relative(root,file)} → ${specifier}`)}
  }
 }
 expect(missing.sort()).toEqual([])
})
