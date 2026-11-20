/** Retired presentation settings must not revive old layout/renderer modes.
 * Removing an absent key is idempotent; no migration marker or other data is written. */
export function retirePresentationPreferences(storage:Pick<Storage,'removeItem'>):void {
 for(const key of['ggjavaez:runtime-view','ggjavaez:animation-quality','ggjavaez:p5:source-width','ggjavaez:m8:explorer']){
  try{storage.removeItem(key)}catch{/* A blocked preference must not prevent application startup. */}
 }
}
