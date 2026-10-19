import type {ReactNode} from 'react'
import {createPortal} from 'react-dom'
/** Keep static markup inspectable without requiring a browser DOM. */
export function SurfacePortal({children}:{children:ReactNode}){
 return typeof document==='undefined'?children:createPortal(children,document.body)
}
