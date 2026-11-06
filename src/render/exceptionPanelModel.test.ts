import {expect,it} from 'vitest'
import type {Evidence,SceneExceptionPath} from '../contracts/world'
import {buildExceptionPanelModel,layoutExceptionPanel,wrapExceptionPanelText} from './exceptionPanelModel'
import {localFontText,textAdvance} from './text/textSystem'
const observed:Evidence={kind:'observed',introducedSeq:2,changedSeq:2,eventIds:['throw']}
const unavailable:Evidence={kind:'unavailable',introducedSeq:null,changedSeq:null,eventIds:[],unavailableReason:'not captured'}
function path(overrides:Partial<SceneExceptionPath>={}):SceneExceptionPath{return{exceptionId:'failure',className:'java.lang.IllegalStateException',simpleName:'IllegalStateException',message:null,throwFrameId:'throwing',unwound:['caller','throwing'],catchFrameId:null,uncaught:true,causes:[],complete:true,throwLine:null,stack:[],causeEvidence:unavailable,stackEvidence:unavailable,evidence:observed,...overrides}}
it('keeps ambiguous recorder null unavailable independently of path and stack evidence',()=>{
 const model=buildExceptionPanelModel(path(),'FULL')
 expect(model.message).toBe('message: unavailable or null')
 expect(model.captions).toContain('Stack text unavailable · not captured')
 expect(model.captions).toContain('Cause chain unavailable · not captured')
 expect(model.captions.some(caption=>caption.includes('path incomplete'))).toBe(false)
 const missing=buildExceptionPanelModel(path({evidence:unavailable,throwFrameId:null,complete:false}),'STOPPED_ERROR')
 expect(missing.message).toBe('message: unavailable or null')
 expect(missing.captions).toContain('Exception path incomplete · STOPPED_ERROR')
 expect(missing.captions).toContain('Throw frame unavailable · not recorded')
 expect(buildExceptionPanelModel(path({message:'captured message',evidence:unavailable,complete:false}),'STOPPED_ERROR').message).toBe('message: captured message')
})
it('retains every captured entry while bounding the face to eight stack entries',()=>{
 const content=path({stack:Array.from({length:11},(_,i)=>`at pkg.App.run(App.java:${i+1})`),stackEvidence:observed,causes:['cause-1','cause-2'],causeEvidence:observed})
 const model=buildExceptionPanelModel(content,'FULL')
 expect(model.captured).toBe(content)
 expect(model.stackLines).toEqual(content.stack.slice(0,8))
 expect(model.stackRemainder).toBe('3 more · captured stack lines')
 expect(model.causeIds).toEqual(['cause-1','cause-2'])
 expect(model.captions).toContain('Cause-chain completeness not recorded')
 expect(model.captions).toContain('Stack bounds unavailable · counts cover captured lines only')
})
it('wraps qualified names and unsupported Unicode without losing or splitting escape groups',()=>{
 const text='pkg.App$Nested.failure 😀  whitespace retained'
 const wrapped=wrapExceptionPanelText(text,2.2,.27,400,32)
 expect(wrapped.truncated).toBe(false)
 expect(wrapped.escaped).toBe(true)
 expect(wrapped.lines.join('')).toBe(localFontText(text))
 for(const line of wrapped.lines){expect(textAdvance(line)*.27).toBeLessThanOrEqual(2.2-.012);expect(line.endsWith('\\u')).toBe(false)}
})
it('states pathological face truncation and keeps the full message in the captured model',()=>{
 const content=path({message:'failure '.repeat(1000),stack:['at pkg.App.run(App.java:7)'],stackEvidence:observed})
 const layout=layoutExceptionPanel(buildExceptionPanelModel(content,'FULL'))
 expect(layout.truncated).toBe(true)
 expect(layout.lines.some(line=>line.text.includes('Panel text truncated'))).toBe(true)
 expect(layout.lines.map(line=>line.text).join('')).toContain('at pkg.App.run(App.java:7)')
 expect(content.message).toHaveLength(8000)
 for(const line of layout.lines)expect(textAdvance(line.text,line.weight)*line.size).toBeLessThanOrEqual(layout.textWidth-.012)
})

it('breaks before intact exception names and whole evidence words when they fit',()=>{
 const header='java.lang.IllegalStateException'
 const titleWidth=textAdvance('IllegalStateException',600)*.4+.02
 const title=wrapExceptionPanelText(header,titleWidth,.4,600,16)
 expect(title.lines).toEqual(['java.lang.','IllegalStateException'])
 expect(title.lines.join('')).toBe(header)
 const caption='No captured stack-text fact'
 const captionWidth=textAdvance('No capture',400)*.27+.02
 const wrapped=wrapExceptionPanelText(caption,captionWidth,.27,400,16)
 expect(wrapped.lines[0]).toBe('No ')
 expect(wrapped.lines[1]).toMatch(/^captured /)
 expect(wrapped.lines.join('')).toBe(caption)
})
