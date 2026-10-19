import type {ArrayWindow,PresentedEntity} from '../contracts/world'

/** Whole-array emphasis includes its cells; a physical cell selection/Focus
 * emphasizes that index only. Access and required-flow pins stay distinct. */
export function arrayCellTargeted(presented:Pick<PresentedEntity,'highlight'>,window:ArrayWindow):(slotId:string)=>boolean{
 const reasons=window.budgetOverflow.reasons
 const marked=[...reasons.values()]
 const whole=presented.highlight==='selected'&&!marked.some(items=>items.includes('selected'))
  ||presented.highlight==='focus'&&!marked.some(items=>items.includes('focused'))
 return slotId=>{const flags=reasons.get(slotId);return whole||!!flags?.includes('selected')||!!flags?.includes('focused')}
}
