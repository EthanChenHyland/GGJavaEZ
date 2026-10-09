/** Keep CSS scroll extents below browser limits, independent of logical length. */
export const virtualPageRows = 4096
export function virtualRange(count:number,rowHeight:number,pageIndex:number,scrollTop:number,viewportHeight:number,overscan=2) {
  const total=Math.max(0,Math.floor(count)),pageStart=Math.floor(Math.max(0,Math.min(total-1,pageIndex))/virtualPageRows)*virtualPageRows;
  const pageCount=Math.min(virtualPageRows,total-pageStart);
  const localStart=Math.max(0,Math.min(pageCount,Math.floor(Math.max(0,scrollTop)/rowHeight)-overscan));
  const visible=Math.min(pageCount-localStart,Math.max(0,Math.ceil(viewportHeight/rowHeight)+2*overscan));
  return{pageStart,pageCount,start:pageStart+localStart,count:visible,height:pageCount*rowHeight};
}
