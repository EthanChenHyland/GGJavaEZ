/** Compare millisecond observations at one-nanosecond precision. Keep raw
 * samples unchanged: subtraction at a large clock origin can report a known
 * 16.7 ms interval as 16.700000047683716 ms. This precision is finer than the
 * browser clock's measurement resolution and preserves real budget excesses. */
export function withinMillisecondBudget(measured:number,budget:number):boolean {
 return Number.isFinite(measured)&&measured>=0&&Number.isFinite(budget)&&budget>=0&&
  Math.round(measured*1e6)<=Math.round(budget*1e6)
}
