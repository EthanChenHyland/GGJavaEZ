import {fuzzyScore,rankPickerItems,type SearchableItem} from '../../ide/fuzzy'
/** Match a project's actual path, not a concatenation that duplicates its basename.
 * Retain the shared fuzzy scoring and stable catalog order within each rank. */
export function rankFileItems<T extends SearchableItem>(items:readonly T[],query:string):T[]{
 const pathQuery=query.trim().replace(/\s+/g,'')
 const matching=items.filter(item=>fuzzyScore(pathQuery,item.detail??item.label)!==null)
 const ranked=rankPickerItems(matching,query),exact=query.trim().toLowerCase()
 return exact?[...ranked.filter(item=>item.label.toLowerCase()===exact),...ranked.filter(item=>item.label.toLowerCase()!==exact)]:ranked
}
