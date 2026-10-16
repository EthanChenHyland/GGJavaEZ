import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import type { Selection } from '../contracts/interaction';
import type { LayoutState, PresentationPlan, SceneModel } from '../contracts/worldV2';
import type { Rect } from '../shell/shellLayout';
import { CameraRig, cameraReadiness, type CameraInput } from '../camera/CameraRig';
import { color } from '../theme/tokens';
import { useCameraStore } from '../camera/cameraStore';
import { useInteractionStore } from '../interaction/interactionStore';
import { RuntimeSolid, WorldText } from './RuntimeSolid';
import { roleColor } from './RuntimeMaterials';
import { FaceTextBatch, textReadiness } from './FaceText';
import { ACESFilmicToneMapping, Color, DataTexture, InstancedMesh, PerspectiveCamera, RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector3 } from 'three';
import type {} from '../qa/worldObservation';
import { SolidBatch,buildSolidBatch } from './SolidBatch';
import { ConnectorBatch } from './ConnectorBatch';
import {accessibleEntities,type AccessibleEntity} from '../interaction/accessibleEntities';
import { QualityRuntime } from './quality/QualityRuntime';
import { useQualityStore } from './quality/qualityStore';
import {MotionLayer,motionReadiness} from './MotionLayer';
import type {TraceDocument} from '../contracts/runtime';
import type {TimelineStore} from '../timeline/timelineStore';
import {PostPipeline,postReadiness,postPerformance} from './post/PostPipeline';
import {Floor} from './Floor';
import {supportsRuntimeWebGL,graphicsRecovery} from './graphicsRecovery';
import {ExceptionPanel} from './ExceptionPanel';
import {projectBodies,projectInstancedBody,projectRect} from '../qa/worldProjection';
import {anchorCorners} from '../world/presentationPlanner';
import {StructuralLabels} from './StructuralLabels';
import {projectedFontPixels,projectedPlaneFontPixels} from './text/textSystem';
import type {Text} from 'troika-three-text';
import type {StructuralLabelSpec} from './text/structuralLabelLayout';

function GradientBackground() {
    const texture = useMemo(() => {
        const height = 256, data = new Uint8Array(height * 4);
        const bottom = new Color(color.background.bottom), top = new Color(color.background.top), sample = new Color();
        for (let row = 0; row < height; row++) {
            sample.copy(bottom).lerp(top, row / (height - 1)).convertLinearToSRGB();
            data.set([Math.round(sample.r * 255), Math.round(sample.g * 255), Math.round(sample.b * 255), 255], row * 4);
        }
        const texture = new DataTexture(data, 1, height, RGBAFormat, UnsignedByteType);
        texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true;
        return texture;
    }, []);
    useEffect(() => () => texture.dispose(), [texture]);
    return <primitive object={texture} attach="background"/>;
}
function Metrics({ scene, plan, selection,trace }: {
    scene: SceneModel;
    plan: PresentationPlan;
    selection:Selection;
    trace:TraceDocument;
}) {
    const { gl, camera, scene:world, size,invalidate } = useThree();
    const latest=useRef({scene,plan,size});latest.current={scene,plan,size};
    const displayFrame=useRef(0);
    useFrame(() => {
        displayFrame.current++;
        if (import.meta.env.DEV||import.meta.env.VITE_QA==='1')
            window.__ggjavaezWorld={ scene: () => scene, plan: () => plan, selection:()=>selection,
                recordedEvents:()=>trace.events,
                runtimeHeadings:()=>{
                    const headings:ReturnType<NonNullable<Window['__ggjavaezWorld']>['runtimeHeadings']>[number][]=[];
                    if(!(camera instanceof PerspectiveCamera))return headings;
                    world.traverse(group=>{
                        const heading=group.userData.runtimeHeading as {entityId:string;kind:'title'|'identity';text:Text}|undefined;
                        if(!heading)return;
                        const text=heading.text,point=new Vector3().setFromMatrixPosition(text.matrix),scale=new Vector3().setFromMatrixScale(text.matrix).y;
                        headings.push({entityId:heading.entityId,kind:heading.kind,text:text.text,opacity:text.fillOpacity,fontPixels:projectedFontPixels(text.fontSize*scale,point,camera,size.height),planePixels:projectedPlaneFontPixels(text.fontSize*scale,point,camera,size),widthPixels:projectedPlaneFontPixels(text.fontSize*scale,point,camera,size,'x')});
                    });return headings;
                },
                collectionText:()=>{
                    const labels:ReturnType<NonNullable<Window['__ggjavaezWorld']>['collectionText']>[number][]=[];
                    if(!(camera instanceof PerspectiveCamera))return labels;
                    world.traverse(group=>{
                        const label=group.userData.runtimeCollectionText as {entityId:string;kind:'size'|'more'|'key'|'value';slotId?:string;text:Text}|undefined;
                        if(!label)return;
                        const text=label.text,point=new Vector3().setFromMatrixPosition(text.matrix),scale=new Vector3().setFromMatrixScale(text.matrix).y;
                        labels.push({entityId:label.entityId,kind:label.kind,slotId:label.slotId,text:text.text,opacity:text.fillOpacity,fontPixels:projectedFontPixels(text.fontSize*scale,point,camera,size.height),planePixels:projectedPlaneFontPixels(text.fontSize*scale,point,camera,size),widthPixels:projectedPlaneFontPixels(text.fontSize*scale,point,camera,size,'x')});
                    });return labels;
                },
                returnText:()=>{
                    const labels:ReturnType<NonNullable<Window['__ggjavaezWorld']>['returnText']>[number][]=[];
                    if(!(camera instanceof PerspectiveCamera))return labels;
                    world.traverse(group=>{
                        const label=group.userData.runtimeReturnText as {flowId:string;kind:'value'|'operands';text:Text}|undefined;
                        if(!label)return;
                        const text=label.text,point=new Vector3().setFromMatrixPosition(text.matrix),scale=new Vector3().setFromMatrixScale(text.matrix).y;
                        labels.push({flowId:label.flowId,kind:label.kind,text:text.text,opacity:text.fillOpacity,fontPixels:projectedFontPixels(text.fontSize*scale,point,camera,size.height)});
                    });return labels;
                },
                frameText:()=>{
                    const labels:ReturnType<NonNullable<Window['__ggjavaezWorld']>['frameText']>[number][]=[];
                    if(!(camera instanceof PerspectiveCamera))return labels;
                    world.traverse(group=>{
                        const label=group.userData.runtimeFrameText as {entityId:string;kind:'scope'|'name'|'value';slotId?:string;text:Text}|undefined;
                        if(!label)return;
                        const text=label.text,point=new Vector3().setFromMatrixPosition(text.matrix),scale=new Vector3().setFromMatrixScale(text.matrix).y;
                        labels.push({entityId:label.entityId,kind:label.kind,slotId:label.slotId,text:text.text,position:point.toArray() as [number,number,number],opacity:text.fillOpacity,fontPixels:projectedFontPixels(text.fontSize*scale,point,camera,size.height)});
                    });return labels;
                },
                structuralLabels:()=>{
                    const host=world.getObjectByName('structural-labels');if(!host||!(camera instanceof PerspectiveCamera))return[];
                    return host.children.map(group=>{
                        const spec=group.userData.structuralLabel as StructuralLabelSpec;group.updateWorldMatrix(true,false);
                        const [left,right,bottom,top]=spec.localBounds,points=[left,right].flatMap(x=>[bottom,top].map(y=>new Vector3(x,y,0).applyMatrix4(group.matrixWorld)));
                        const scale=new Vector3().setFromMatrixScale(group.matrixWorld).y;
                        return{id:spec.id,kind:spec.kind,visible:group.visible,minimumFontPixels:Math.min(...points.map(point=>projectedPlaneFontPixels(spec.size*scale,point,camera,size))),bounds:projectRect(points.map(point=>point.toArray() as [number,number,number]),camera,size)};
                    });
                },
                worldProjection:()=>{const projection=projectBodies([
                    ...buildSolidBatch(scene,plan).filter(solid=>solid.role!=='face').map(solid=>({anchor:solid.anchor,live:scene.entities[solid.anchor.entityId]?.kind==='frame'&&(scene.entities[solid.anchor.entityId] as {live:boolean}).live})),
                ],camera,size);
                 const panel=plan.exceptionPanel,frame=panel?.content.throwFrameId?scene.entities[panel.content.throwFrameId]:null;
                 const panelBody=world.getObjectByName('exception-panel-body');
                 return{...projection,exception:panel?{bounds:panelBody instanceof InstancedMesh?projectInstancedBody(panelBody,0,camera,size):null,throwFrame:frame?projectRect(anchorCorners(frame.anchor),camera,size):null}:null};
                },
                projectedPoint:(id)=>{
                    const position=scene.entities[id]?.anchor.position??[...plan.cellWindows.values()].flatMap(window=>[...window.mapping.values()]).find(cell=>cell.anchor.entityId===id)?.anchor.position;
                    if(!position)return null;
                    const p=new Vector3(...position).project(camera);
                    return{x:(p.x+1)*size.width/2,y:(1-p.y)*size.height/2,visible:Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&p.z>=-1&&p.z<=1};
                },
                renderer: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, frame: gl.info.render.frame }),
                effects:()=>({...postReadiness}),
                framePerformance:()=>postPerformance?.snapshot()??null,
                quality:()=>{const state=useQualityStore.getState();return{setting:state.setting,active:state.active,compiled:state.compiled,cinematicStatus:state.cinematicStatus,availability:state.cinematicAvailable,capabilities:state.capabilities,contextLost:state.contextLost,notice:state.notice}},
                ready:()=>new Promise<void>((resolve,reject)=>{
                    const started=performance.now();let eligibleFrame:number|null=null,stableKey='';
                    const check=()=>{
                        const quality=useQualityStore.getState(),busy=quality.activity.scrubbing||quality.activity.liveTrailing||quality.activity.cameraMoving;
                        const qualityReady=!quality.contextLost&&quality.cinematicStatus!=='loading'&&(quality.setting!=='CINEMATIC'||busy||quality.active==='CINEMATIC'&&quality.compiled);
                        if(performance.now()-started>10000){reject(new Error(`World readiness timed out: ${textReadiness.pending.size} glyph layouts pending; environment ${!!world.environment}; camera moving ${cameraReadiness.moving}; motion ${motionReadiness.animating}; quality ${quality.setting}/${quality.active}/${quality.cinematicStatus}`));return}
                        const current=latest.current;
                        const key=JSON.stringify([current.scene.recordingId,current.scene.revision,current.plan.revision,
                            [...current.plan.cellWindows].map(([id,window])=>[id,window.windowRevision]),current.size.width,current.size.height,
                            ...camera.position.toArray().map(value=>Math.round(value*1e7)),...camera.quaternion.toArray().map(value=>Math.round(value*1e7)),
                            quality.active,quality.compiled,quality.cinematicStatus,textReadiness.lastSync,postReadiness.revision]);
                        if(key!==stableKey){stableKey=key;eligibleFrame=null}
                        const eligible=textReadiness.mounted&&textReadiness.pending.size===0&&!!world.environment&&!cameraReadiness.moving&&!motionReadiness.animating&&qualityReady&&postReadiness.ready&&postReadiness.frames>=2;
                        if(eligible){eligibleFrame??=displayFrame.current;if(displayFrame.current>=eligibleFrame+2){resolve();return}}else eligibleFrame=null;
                        invalidate();requestAnimationFrame(check);
                    };
                    void document.fonts.ready.then(check,reject);
                }),
            };
    });
    return null;
}
function AccessibleCatalog({scene,plan,publish}:{scene:SceneModel;plan:PresentationPlan;publish(items:AccessibleEntity[]):void}) {
 const{camera,size}=useThree(),last=useRef(0),revision=useRef(-1),ids=useRef('')
 // Selection may change represented geometry without changing runtime truth.
 // Publish each committed cut immediately; throttle only unchanged-cut orbit.
 useFrame(()=>{const now=performance.now();if(now-last.current<100&&revision.current===plan.revision)return;last.current=now;revision.current=plan.revision
  const items=accessibleEntities(scene,plan,point=>{const p=new Vector3(...point).project(camera);return{x:(p.x+1)*size.width/2,y:(1-p.y)*size.height/2,visible:Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&p.z>=-1&&p.z<=1}}),key=JSON.stringify(items.map(item=>[item.id,item.label]))
  if(key!==ids.current){ids.current=key;publish(items)}
 })
 return null
}
export function RuntimeCanvas({ scene, plan, layout, safeFrame,inspectorRect, selection, onSelect, onFocus,trace,timeline }: {
    scene: SceneModel;
    plan: PresentationPlan;
    layout: LayoutState;
    safeFrame: Rect;
    inspectorRect?:Rect|null;
    selection: Selection;
    onSelect(selection: Selection): void;
    onFocus(selection: NonNullable<Selection>): void;
    trace:TraceDocument;timeline:TimelineStore;
}) {
    const quality = useQualityStore(state => state.active);
    const contextLost=useQualityStore(state=>state.contextLost),notice=useQualityStore(state=>state.notice);
    const supportsWebGL=useMemo(supportsRuntimeWebGL,[]);
    const [accessible,setAccessible]=useState<AccessibleEntity[]>([]),list=useRef<HTMLDivElement>(null);
    const curves=useMemo(()=>[...plan.curves,...plan.bundles],[plan.curves,plan.bundles]);
    const activeIndex=accessible.findIndex(item=>item.id===selection?.id);
    const worldElement=useRef<HTMLDivElement>(null)
    const input = useRef<CameraInput | null>(null), pointer = useRef<{
        x: number;
        y: number;
        button:number;
        orbitStarted:boolean;
    } | null>(null), moved = useRef(false);
    const lightTarget = useMemo(() => ({ x: 4, y: -3, z: 0 }), []);
    useEffect(()=>{
        const element=worldElement.current;if(!element)return
        const wheel=(event:WheelEvent)=>{event.preventDefault();event.stopPropagation();input.current?.wheel(event.deltaX,event.deltaY,event.deltaMode===0&&!event.ctrlKey&&Math.abs(event.deltaY)<50)}
        element.addEventListener('wheel',wheel,{capture:true,passive:false})
        return()=>element.removeEventListener('wheel',wheel,true)
    },[])
    const select = (next: Selection) => { if (!moved.current)
        onSelect(next); };
    return <div ref={worldElement} className="world-canvas" role="application" tabIndex={0} aria-label="Three-dimensional Java runtime world" onContextMenu={event => event.preventDefault()} onPointerDownCapture={event => { event.currentTarget.focus(); pointer.current = { x: event.clientX, y: event.clientY,button:event.button,orbitStarted:false }; moved.current = false; input.current?.shift(event.shiftKey); input.current?.cancel(); }} onPointerMoveCapture={event => {
        const gesture=pointer.current;if(!gesture)return;
        const distance=Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y);
        if(distance>0&&!gesture.orbitStarted&&gesture.button===0&&(event.buttons&1)&&!event.shiftKey){input.current?.orbit();gesture.orbitStarted=true}
        if(distance>4)moved.current=true;
    }} onPointerUpCapture={() => { pointer.current = null; }} onPointerCancelCapture={() => {pointer.current=null}} onKeyDown={event => {
            if(event.key==='Tab'&&accessible.length){const index=activeIndex+(event.shiftKey?-1:1),next=accessible[index];if(next){event.preventDefault();onSelect(next.selection);list.current?.focus()}return}
            if(event.target===list.current&&event.key.startsWith('Arrow')){event.preventDefault();const index=Math.min(accessible.length-1,Math.max(0,activeIndex+(event.key==='ArrowUp'||event.key==='ArrowLeft'?-1:1)));if(accessible[index])onSelect(accessible[index].selection);return}
            if (event.key === 'Escape') {
                event.preventDefault();
                if(useInteractionStore.getState().trace.active)useCameraStore.getState().explore(); else if (useInteractionStore.getState().focus)
                    useCameraStore.getState().exitFocus();
                else
                    onSelect(null);
            }
            else if (event.key === 'Enter' && selection) {
                event.preventDefault();
                onFocus(selection);
            }
            else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) {
                event.preventDefault();
                input.current?.key(event.key, event.shiftKey);
            }
        }}>
    {!supportsWebGL?<div className="world-graphics-status glass" role="status">The 3D World requires WebGL</div>:<Canvas frameloop="demand" shadows="percentage" dpr={[1, 1.5]} camera={{ fov: 36, position: [7, 5, 24], near: .05, far: 10000 }} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping }} onPointerMissed={() => { if (!moved.current)
        onSelect(null); }}>
      <GradientBackground/>
      <hemisphereLight args={['#A8C8FF', '#090B22', .25]}/>
      <directionalLight position={[-10, 12, 9]} intensity={2.2} color="#9CC8FF" castShadow shadow-mapSize={quality === 'CINEMATIC' ? [2048, 2048] : [1024, 1024]} shadow-camera-left={-35} shadow-camera-right={35} shadow-camera-top={20} shadow-camera-bottom={-35}/>
      <directionalLight position={[14, 4, -9]} intensity={1.8} color="#B57BFF"/>
      <directionalLight position={[lightTarget.x, lightTarget.y + 10, 8]} intensity={.6} color="#C9D6FF"/>
      <Suspense fallback={null}>
        {!contextLost&&<Environment resolution={256} frames={1}>
          <Lightformer form="rect" position={[-6, 10, 8]} rotation={[Math.PI / 4, 0, 0]} scale={[12, 4, 1]} color="#65ACFF" intensity={2.2}/>
          <Lightformer form="rect" position={[14, 7, -8]} rotation={[0, Math.PI, 0]} scale={[8, 12, 1]} color="#B777FF" intensity={1.8}/>
          <Lightformer form="rect" position={[2, 14, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[14, 2, 1]} color="#EEF4FF" intensity={1}/>
          <Lightformer form="rect" position={[2, -12, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[18, 18, 1]} color="#0A1230" intensity={.15}/>
        </Environment>}
        <Floor layout={layout} plan={plan} scene={scene} quality={quality}/>
        <SolidBatch scene={scene} plan={plan} onSelect={select} onFocus={onFocus}/>
        <FaceTextBatch>
        {[...plan.entities].map(([id, presented]) => <RuntimeSolid key={id} node={scene.entities[id]} presented={presented} plan={plan}/>)}
        <StructuralLabels scene={scene} plan={plan} safeFrame={safeFrame} inspectorRect={inspectorRect}/>
        <ConnectorBatch curves={curves} onSelect={id => { if(plan.bundles.some(bundle=>bundle.id===id))select({kind:'bundle',id}); else if (scene.references.some(ref => ref.id === id)||scene.historicalBindings.some(binding=>binding.id===id))
        select({ kind: 'reference', id }); else if(plan.curves.some(curve=>curve.id===id)) select({kind:'flow',id}); }}/>
        {plan.structural.map(item => <WorldText key={item.id} position={item.position} size={.3} width={5} tint={color.ui.textSecondary}>{item.text}</WorldText>)}
        <ExceptionPanel panel={plan.exceptionPanel} recordingState={scene.recording.state}/>
        {scene.io.map(io => <group key={io.id} position={[...io.anchor.position]}><mesh><boxGeometry args={[...io.anchor.size]}/><meshStandardMaterial color={roleColor[io.id]} emissive={roleColor[io.id]} emissiveIntensity={.2}/></mesh><WorldText position={[-.75, .02, .17]} size={.2} width={1.5}>{`${io.id} · ${io.lines}`}</WorldText></group>)}
        </FaceTextBatch>
      </Suspense>
      <CameraRig scene={scene} plan={plan} event={trace.events[scene.cursor-1]??null} layout={layout} safeFrame={safeFrame} inspectorRect={inspectorRect} input={input}/>
      <QualityRuntime guidedMoving={() => cameraReadiness.moving}/>
      <MotionLayer trace={trace} timeline={timeline} scene={scene} plan={plan}/>
      <AccessibleCatalog scene={scene} plan={plan} publish={setAccessible}/>
      <Metrics scene={scene} plan={plan} selection={selection} trace={trace}/>
      <PostPipeline/>
    </Canvas>}
    {contextLost&&<div className="world-graphics-status glass" role="alert">{notice??'Restoring the World…'}{notice==='The World could not be restored'&&<button onClick={()=>graphicsRecovery.retry?.()}>Retry</button>}</div>}
    <div ref={list} className="gg-world-entities" role="listbox" tabIndex={-1} aria-label="Runtime entities" aria-activedescendant={selection&&activeIndex>=0?`world-entity-${encodeURIComponent(selection.id)}`:undefined}>
      {accessible.slice(Math.max(0,activeIndex-20),Math.max(40,activeIndex+21)).map((item,index)=><div key={item.id} id={`world-entity-${encodeURIComponent(item.id)}`} role="option" aria-selected={selection?.id===item.id} aria-posinset={Math.max(0,activeIndex-20)+index+1} aria-setsize={accessible.length}>{item.label}</div>)}
    </div>
  </div>;
}
