import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { BatchedText, Text } from 'troika-three-text';
import { Group, MeshBasicMaterial } from 'three';
import type { Vec3 } from '../contracts/worldV2';
import { color, runtimeFonts } from '../theme/tokens';
import { truncateFrameText } from '../world/valueText';
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
        return object;
    }, []);
    useLayoutEffect(()=>{textReadiness.mounted=true;return()=>{textReadiness.mounted=false}},[]);
    useEffect(() => () => { batch.material.dispose(); batch.dispose(); }, [batch]);
    useFrame(({ gl }) => { textReadiness.lastUploadFrame = gl.info.render.frame; });
    return <Context.Provider value={batch}><primitive object={batch}/>{children}</Context.Provider>;
}
export function WorldText({ children, position, size = .25, tint = color.ui.text, width = 4, align = 'left', opacity = 1, weight=400, tracking=0 }: {
    children: string;
    position: Vec3;
    size?: number;
    tint?: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
    opacity?: number;
    weight?:400|500|600;
    tracking?:number;
}) {
    const batch = useContext(Context), anchor = useRef<Group>(null), id = useId(), text = useMemo(() => new Text(), []),lastLayout=useRef(''),syncGeneration=useRef(0);
    useLayoutEffect(() => {
        const content=truncateFrameText(children, Math.max(3, Math.floor(width / (size * .55))));
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
        text.sync(() => { if(generation===syncGeneration.current)textReadiness.pending.delete(id); textReadiness.lastSync = performance.now(); });
    }, [text, children, size, width, align, id, weight, tracking]);
    useLayoutEffect(()=>{text.color=tint;text.fillOpacity=opacity},[text,tint,opacity]);
    useLayoutEffect(() => { batch?.addText(text); return () => { batch?.removeText(text); textReadiness.pending.delete(id); text.dispose(); }; }, [batch, text, id]);
    useFrame(() => { if (anchor.current) {
        anchor.current.updateWorldMatrix(true, false);
        text.matrix.copy(anchor.current.matrixWorld);
    } });
    return <group ref={anchor} position={[...position]}/>;
}
