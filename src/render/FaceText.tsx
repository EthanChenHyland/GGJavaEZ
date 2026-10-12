import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame,useThree } from '@react-three/fiber';
import { BatchedText, Text } from 'troika-three-text';
import { Group, MeshBasicMaterial,Vector3,type Object3D } from 'three';
import type { Vec3 } from '../contracts/worldV2';
import { color, runtimeFonts } from '../theme/tokens';
import {fitWorldText,projectedFontPixels,worldTextVisible} from './text/textSystem';
const Context = createContext<BatchedText | null>(null);
export const textReadiness = { pending: new Set<string>(), lastSync: 0, lastUploadFrame: 0, mounted:false };
export function FaceTextBatch({ children }: {
    children: ReactNode;
}) {
    const batch = useMemo(() => {
        const object = new BatchedText();
        object.material = new MeshBasicMaterial({ color: 'white', transparent: true, depthWrite: false, toneMapped: false });
        object.frustumCulled = false;
        object.renderOrder = 3;
        object.userData.runtimeBloomRole = 'protected';
        object.userData.runtimeText = true;
        return object;
    }, []);
    useLayoutEffect(()=>{textReadiness.mounted=true;return()=>{textReadiness.mounted=false}},[]);
    useEffect(() => () => { batch.material.dispose(); batch.dispose(); }, [batch]);
    useFrame(({ gl }) => { textReadiness.lastUploadFrame = gl.info.render.frame; });
    return <Context.Provider value={batch}><primitive object={batch}/>{children}</Context.Provider>;
}
export function WorldText({ children, position, size = .25, tint = color.ui.text, width = 4, align = 'left', opacity = 1, weight=400, tracking=0, minimumPixels=11, heading,collectionText }: {
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
    heading?:{entityId:string;kind:'title'|'identity'};
    collectionText?:{entityId:string;kind:'size'|'more'|'key'|'value';slotId?:string};
}) {
    const batch = useContext(Context), anchor = useRef<Group>(null), id = useId(), text = useMemo(() => new Text(), []),lastLayout=useRef(''),syncGeneration=useRef(0);
    const invalidate=useThree(state=>state.invalidate);
    const {camera,size:viewport}=useThree(),projection=useMemo(()=>({point:new Vector3(),scratch:new Vector3()}),[]);
    useLayoutEffect(() => {
        const content=fitWorldText(children,width,size,weight,tracking);
        const key=JSON.stringify([content,runtimeFonts[weight],tracking,size,width,align]);
        if(lastLayout.current===key)return;
        lastLayout.current=key;
        const generation=++syncGeneration.current;
        text.font = runtimeFonts[weight];
        text.letterSpacing=tracking;
        text.fontSize = size;
        text.text = content;
        text.maxWidth = width;
        text.whiteSpace = 'nowrap';
        text.anchorX = align;
        text.anchorY = 'middle';
        text.matrixAutoUpdate = false;
        textReadiness.pending.add(id);
        text.sync(() => { if(generation===syncGeneration.current)textReadiness.pending.delete(id); textReadiness.lastSync = performance.now(); invalidate(); });
    }, [text, children, size, width, align, id, weight, tracking,invalidate]);
    useLayoutEffect(()=>{text.color=tint;text.fillOpacity=opacity},[text,tint,opacity]);
    useLayoutEffect(() => { batch?.addText(text); return () => { batch?.removeText(text); textReadiness.pending.delete(id); text.dispose(); }; }, [batch, text, id]);
    useFrame(() => { if (anchor.current) {
        anchor.current.updateWorldMatrix(true, false);
        text.matrix.copy(anchor.current.matrixWorld);
        projection.point.setFromMatrixPosition(anchor.current.matrixWorld);
        const scale=projection.scratch.setFromMatrixScale(anchor.current.matrixWorld).y;
        let visible=true;for(let parent:Object3D|null=anchor.current;parent;parent=parent.parent)if(!parent.visible){visible=false;break}
        const pixels=projectedFontPixels(size*scale,projection.point,camera,viewport.height,projection.scratch);
        text.fillOpacity=visible&&worldTextVisible(pixels,minimumPixels)?opacity:0;
    } },.5);
    return <group ref={anchor} position={[...position]} userData={{...(heading?{runtimeHeading:{...heading,text}}:{}),...(collectionText?{runtimeCollectionText:{...collectionText,text}}:{})}}/>;
}
