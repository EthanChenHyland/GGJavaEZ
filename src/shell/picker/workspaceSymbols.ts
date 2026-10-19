import type {LspWorkspaceSymbol} from '../../language/protocol'
import {documentPath} from '../../language/protocol'
import type {SourceLocation} from '../../ide/contracts'
import type {SearchableItem} from '../../ide/fuzzy'
export interface PickerItem extends SearchableItem {enabled:boolean;reason?:string;shortcut?:string}
export interface SymbolChoice extends PickerItem {location:SourceLocation|null}
export interface SymbolSnapshot {query:string;projectId:string|null;items:readonly SymbolChoice[];status:string}
export interface SymbolSearchHost {projectId():string|null;request(query:string):Promise<LspWorkspaceSymbol[]|null>;publish(snapshot:SymbolSnapshot):void}
/** Only the request's original project/query may publish. The server owns
 * symbol matching; client fuzzy filtering must not discard valid JDT matches. */
export function createWorkspaceSymbolSearch(host:SymbolSearchHost){
 let revision=0
 return{
  invalidate(){revision++},
  async search(query:string){
   const ticket=++revision,projectId=host.projectId(),current=()=>ticket===revision&&host.projectId()===projectId
   if(!projectId||!query.trim()){host.publish({query,projectId,items:[],status:'Search project symbols'});return}
   host.publish({query,projectId,items:[],status:'Searching…'})
   try{
    const symbols=await host.request(query);if(!current())return
    const items:SymbolChoice[]=[]
    for(const [index,symbol]of(symbols??[]).entries()){
     const path=documentPath(symbol.location.uri,projectId);if(!path)continue
     const start=symbol.location.range?.start
     const valid=!!start&&Number.isInteger(start.line)&&start.line>=0&&Number.isInteger(start.character)&&start.character>=0
     items.push({id:`${symbol.location.uri}:${start?.line}:${start?.character}:${index}`,label:symbol.name,detail:symbol.containerName||path,enabled:valid,
      ...(!valid?{reason:'The language service supplied no valid source position'}:{}),location:valid?{path,line:start.line+1,column:start.character+1}:null})
     if(items.length===80)break
    }
    host.publish({query,projectId,items,status:items.length?`${items.length} symbols`:'No matching project symbols'})
   }catch(error){if(current())host.publish({query,projectId,items:[],status:error instanceof Error?error.message:String(error)})}
  },
 }
}
