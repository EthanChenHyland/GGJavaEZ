import {rankPickerItems,type SearchableItem} from '../../ide/fuzzy'

/** Match the actual project path and keep stable fuzzy ranking within each
 * group. Only matches need scoring, and the empty result uses catalog order. */
export function rankFileItems<T extends SearchableItem>(items:readonly T[],query:string):T[]{
 const trimmed=query.trim()
 if(!trimmed)return items.slice()
 const exact=trimmed.toLowerCase(),pathQuery=trimmed.replace(/\s+/g,'').toLowerCase()
 const matching=items.filter(item=>{
  const path=(item.detail??item.label).toLowerCase()
  let cursor=0
  for(const character of pathQuery){
   const index=path.indexOf(character,cursor)
   if(index<0)return false
   cursor=index+1
  }
  return true
 })
 const exactMatches:T[]=[],other:T[]=[]
 for(const item of rankPickerItems(matching,query)){
  (item.label.toLowerCase()===exact?exactMatches:other).push(item)
 }
 return exactMatches.concat(other)
}
