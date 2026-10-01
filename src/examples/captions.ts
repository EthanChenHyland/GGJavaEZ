import type { ArrayActivity, ScalarValue } from '../contracts/runtime'

/** Curated array-comparison caption. ARRAY_COMPARE is emitted only by curated traces;
 * its sort-specific wording must not appear in generic runtime modules. */
export function curatedCompareCaption(activity: Extract<ArrayActivity, { kind: 'compare' }>, scalar: (value: ScalarValue) => string): string {
  return `${scalar(activity.values[0])} > ${scalar(activity.values[1])} · ${activity.result ? 'true → swap' : 'false → keep'}`
}
