/** Yield through a browser task without the nested setTimeout 4 ms clamp.
 * Ingestion has one outstanding task; presentation may run between bounded slices.
 */
export function yieldTraceWork(): Promise<void> {
  return new Promise(resolve => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve() }
    channel.port2.postMessage(null)
  })
}
