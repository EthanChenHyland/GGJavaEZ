import { createContext, memo, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame,useThree } from '@react-three/fiber';
import { BatchedText, Text } from 'troika-three-text';
import { Group, MeshBasicMaterial,Vector3,type Material,type Object3D } from 'three';
import type { Vec3, WorldAnchor } from '../contracts/world';
import { color, runtimeFonts } from '../theme/tokens';
import {fitWorldText,projectedFontPixels,worldTextVisible} from './text/textSystem';
import {FocusTextMask} from './post/focusTextMask';
import {registerAuxiliaryPass} from './post/auxiliaryPasses';
type FaceTextContext = { batch: BatchedText; frame: number; parents: WeakMap<Object3D,number> };
const Context = createContext<FaceTextContext | null>(null);

function updateTextParent(parent: Object3D, context: FaceTextContext) {
    if (context.parents.get(parent) === context.frame) return;
    if (parent.parent) updateTextParent(parent.parent, context);
    parent.updateWorldMatrix(false, false);
    context.parents.set(parent, context.frame);
}
export const textReadiness = { pending: new Set<string>(), lastSync: 0, lastUploadFrame: 0, mounted:false };
type TextPassMaterial = Material & { uniforms?: object; isTextOutlineMaterial?: boolean };
/** Fade a face without changing every glyph's React props or layout lifetime. */
export function FaceTextOpacity({opacity,children}:{opacity:number;children:ReactNode}){
    return <group userData={{runtimeTextOpacity:opacity}}>{children}</group>;
}
export function FaceTextBatch({ children, focusAnchor=null }: {
    children: ReactNode;
    focusAnchor?:WorldAnchor|null;
}) {
    const {gl,camera}=useThree(),focusMask=useMemo(()=>new FocusTextMask(),[]);
    const {context,material,preparation} = useMemo(() => {
        const object = new BatchedText();
        const material = new MeshBasicMaterial({ color: 'white', transparent: true, depthWrite: false, toneMapped: false });
        // Patch the base before Troika wraps it. Re-entering a derived compile
        // hook from its appended user hook would recurse during compilation.
        focusMask.apply(material);
        object.material = material;
        const textMaterial = object.material as TextPassMaterial;
        const preparation = { ready: false };
        const before = object.onBeforeRender;
        object.onBeforeRender = function(renderer, scene, camera, geometry, passMaterial, group) {
            const pass = passMaterial as TextPassMaterial;
            // The mask materials inherit both the render state and uniform table
            // from the batch material. Glyph transforms are set once per frame.
            const inheritedMask = Object.getPrototypeOf(pass) === textMaterial &&
                !pass.isTextOutlineMaterial && textMaterial.uniforms !== undefined &&
                pass.uniforms === textMaterial.uniforms;
            if (pass !== textMaterial && !inheritedMask) {
                preparation.ready = false;
                before.call(this, renderer, scene, camera, geometry, pass, group);
            } else if (!preparation.ready) {
                before.call(this, renderer, scene, camera, geometry, textMaterial, group);
                preparation.ready = true;
            }
            focusMask.prepareText(camera);
        };
        object.frustumCulled = false;
        object.renderOrder = 3;
        object.userData.runtimeBloomRole = 'protected';
        object.userData.runtimeText = true;
        const context:FaceTextContext={batch:object,frame:0,parents:new WeakMap()};
        return {context,material,preparation};
    }, [focusMask]);
    useLayoutEffect(()=>{focusMask.anchor=focusAnchor},[focusMask,focusAnchor]);
    useEffect(()=>registerAuxiliaryPass(gl,'focus-text',()=>focusMask.render(gl,camera)),[gl,camera,focusMask]);
    useLayoutEffect(()=>{textReadiness.mounted=true;return()=>{textReadiness.mounted=false}},[]);
    useEffect(() => () => { material.dispose(); context.batch.dispose(); focusMask.dispose(); }, [context,material,focusMask]);
    useFrame(({ gl }) => {
        preparation.ready = false;
        context.frame++;
        textReadiness.lastUploadFrame = gl.info.render.frame;
    });
    return <Context.Provider value={context}><primitive object={context.batch}/>{children}</Context.Provider>;
}
type WorldTextProps = {
    children: string;
    position: Vec3;
    size?: number;
    tint?: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
    opacity?: number;
    weight?:400|500|600;
    tracking?:number;
    minimumPixels?:11|12;
    lines?:readonly string[];
    truncation?:'middle'|'end';
    heading?:{entityId:string;kind:'title'|'identity'};
    exceptionText?:boolean;
    returnText?:{flowId:string;kind:'value'|'operands'};
    frameText?:{entityId:string;kind:'scope'|'name'|'value';slotId?:string};
    collectionText?:{entityId:string;kind:'size'|'more'|'key'|'value';slotId?:string};
    arrayText?:{entityId:string;slotId:string;kind:'index'|'value'};
};
// Parents reconstruct coordinate and semantic wrappers when detail changes.
// Compare their values while keeping unknown future object props conservative.
function sameTextProps(previous:WorldTextProps,next:WorldTextProps){
    const a=previous as unknown as Record<string,unknown>,b=next as unknown as Record<string,unknown>;
    const keys=Object.keys(a);
    if(keys.length!==Object.keys(b).length)return false;
    return keys.every(key=>{
        if(!Object.hasOwn(b,key))return false;
        const left=a[key],right=b[key];
        if(Object.is(left,right))return true;
        if(key==='position'||key==='lines')return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((value,index)=>Object.is(value,right[index]));
        if(key==='heading'||key==='frameText'||key==='collectionText'||key==='returnText'||key==='arrayText'){
            if(!left||!right||typeof left!=='object'||typeof right!=='object')return false;
            const fields=Object.keys(left),other=right as Record<string,unknown>;
            return fields.length===Object.keys(right).length&&fields.every(field=>Object.hasOwn(other,field)&&Object.is((left as Record<string,unknown>)[field],other[field]));
        }
        return false;
    });
}
export const WorldText=memo(function WorldText({ children, position, size = .25, tint = color.ui.text, width = 4, align = 'left', opacity = 1, weight=400, tracking=0, minimumPixels=11, lines, truncation='middle',heading,collectionText,frameText,returnText,arrayText,exceptionText }: WorldTextProps) {
    const context = useContext(Context), anchor = useRef<Group>(null), id = useId(), text = useMemo(() => new Text(), []),lastLayout=useRef(''),syncGeneration=useRef(0);
    const invalidate=useThree(state=>state.invalidate);
    const {camera,size:viewport}=useThree(),projection=useMemo(()=>({point:new Vector3(),scratch:new Vector3()}),[]);
    useLayoutEffect(() => {
        const fit=(value:string)=>fitWorldText(value,width,size,weight,tracking,Infinity,truncation);
        const content=lines?lines.map(fit).join('\n'):fit(children);
        const lineHeight=lines&&lines.length>1?.9:'normal';
        const key=JSON.stringify([content,runtimeFonts[weight],tracking,size,width,align,lineHeight]);
        if(lastLayout.current===key)return;
        lastLayout.current=key;
        const generation=++syncGeneration.current;
        text.font = runtimeFonts[weight];
        text.letterSpacing=tracking;
        text.fontSize = size;
        text.text = content;
        text.maxWidth = width;
        text.whiteSpace = 'nowrap';
        text.lineHeight = lineHeight;
        text.anchorX = align;
        text.anchorY = 'middle';
        text.matrixAutoUpdate = false;
        textReadiness.pending.add(id);
        text.sync(() => { if(generation===syncGeneration.current)textReadiness.pending.delete(id); textReadiness.lastSync = performance.now(); invalidate(); });
    }, [text, children, size, width, align, id, weight, tracking,lines,truncation,invalidate]);
    useLayoutEffect(()=>{text.color=tint;text.fillOpacity=opacity},[text,tint,opacity]);
    useLayoutEffect(() => { context?.batch.addText(text); return () => { context?.batch.removeText(text); textReadiness.pending.delete(id); text.dispose(); }; }, [context, text, id]);
    useFrame(() => { if (anchor.current) {
        if(context&&anchor.current.parent){
            updateTextParent(anchor.current.parent,context);
            anchor.current.updateWorldMatrix(false,false);
        }else anchor.current.updateWorldMatrix(true,false);
        text.matrix.copy(anchor.current.matrixWorld);
        projection.point.setFromMatrixPosition(anchor.current.matrixWorld);
        const scale=projection.scratch.setFromMatrixScale(anchor.current.matrixWorld).y;
        let visible=true,inheritedOpacity=1;
        for(let parent:Object3D|null=anchor.current;parent;parent=parent.parent){
            if(!parent.visible){visible=false;break}
            const fade=parent.userData.runtimeTextOpacity;
            if(typeof fade==='number')inheritedOpacity*=fade;
        }
        const pixels=projectedFontPixels(size*scale,projection.point,camera,viewport.height,projection.scratch);
        text.fillOpacity=visible&&worldTextVisible(pixels,minimumPixels)?opacity*inheritedOpacity:0;
    } },.5);
    return <group ref={anchor} position={[...position]} userData={{...(exceptionText?{runtimeExceptionText:{text}}:{}),...(heading?{runtimeHeading:{...heading,text}}:{}),...(collectionText?{runtimeCollectionText:{...collectionText,text}}:{}),...(frameText?{runtimeFrameText:{...frameText,text}}:{}),...(returnText?{runtimeReturnText:{...returnText,text}}:{}),...(arrayText?{runtimeArrayText:{...arrayText,text}}:{})}}/>;
},sameTextProps);
