import ts from 'typescript'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve,relative} from 'node:path'
import {fileURLToPath} from 'node:url'

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)))
const words=text=>text.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2').replace(/[\s_-]+/g,' ').toLowerCase().trim()
// Artwork captions describe fixture scenes; product commands such as Focus,
// Home and Trace are required functional controls, not fixture recognition.
export const referenceArtLabels=Object.freeze([
 'Fly up to a single object','Camera can travel down the call stack',
 'Deeper stack frames in −Z direction','Array as 3D blocks that can be animated',
 'Call stack as a 3D stack you can travel through','Zoomed Out (Program Overview)',
 'Medium (Related Objects)','Close Up (Object Details)',
])
export function scanSource(text,file,projectNames=[]){
 const failures=[],scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,text)
 const forbidden=['Person','Factorial','bubble sort','SortDemo',...projectNames].map(words)
 const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
 const patterns=forbidden.map(value=>[value,new RegExp(`(?:^|[^a-z0-9])${[...value.replaceAll(' ','')].map(escaped).join(' *')}(?:$|[^a-z0-9])`)])
 const labels=new Set(referenceArtLabels.map(words))
 for(let token=scanner.scan();token!==ts.SyntaxKind.EndOfFileToken;token=scanner.scan()){
  const literal=[ts.SyntaxKind.StringLiteral,ts.SyntaxKind.NoSubstitutionTemplateLiteral,ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail].includes(token)
  if(token!==ts.SyntaxKind.Identifier&&!literal)continue
  const value=literal?scanner.getTokenValue():scanner.getTokenText(),normalized=words(value)
  const hit=patterns.find(([,pattern])=>pattern.test(normalized))?.[0]??(literal&&labels.has(normalized)?normalized:null)
  if(hit){const position=scanner.getTokenPos(),line=text.slice(0,position).split('\n').length;failures.push({file,line,value,match:hit})}
 }
 return failures
}
export function scanGeneric(repository=root){
 const projects=readdirSync(resolve(repository,'fixtures/acceptance-v12'),{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>entry.name)
 const failures=[]
 const visit=directory=>{
  for(const entry of readdirSync(directory,{withFileTypes:true})){
   const path=resolve(directory,entry.name),file=relative(repository,path).replaceAll('\\','/')
   if(file==='src/examples'||/(?:^|\/)(?:node_modules|target|build|out|\.gradle|\.git)$/.test(file))continue
   if(entry.isDirectory()){visit(path);continue}
   if(!/\.(?:[cm]?[jt]sx?|java|json)$/.test(file)||/(?:^|\/)(?:__tests__|tests)\/|\.(?:test|spec)\./.test(file))continue
   failures.push(...scanSource(readFileSync(path,'utf8'),file,projects))
  }
 }
 for(const name of ['src','server','instrumentation'])visit(resolve(repository,name))
 return failures
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const failures=scanGeneric()
 if(failures.length){process.stderr.write(failures.map(item=>`${item.file}:${item.line}: ${item.match} (${JSON.stringify(item.value)})`).join('\n')+'\n');process.exitCode=1}
 else process.stdout.write('Generic source scan: no fixture identifiers, fixture literals or artwork captions.\n')
}
