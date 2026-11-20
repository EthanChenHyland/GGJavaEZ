import {ideCommandDefinitions,isPresentationCommand,type IdeCommandId} from '../ide/commands'
import {commandForShortcut,worldEscapeCommand,type KeyEventLike,type Platform,type ShortcutFocus} from '../ide/shortcuts'

export interface ShellKeyEvent extends KeyEventLike {
 defaultPrevented:boolean;isComposing:boolean;preventDefault():void;stopPropagation():void
}
export interface ShellKeyboardHost {
 platform:Platform
 blocked:boolean
 busy:boolean
 navigation():{inspectorOpen:boolean;focusActive:boolean;traceActive:boolean}
 available(id:IdeCommandId):boolean
 invoke(id:IdeCommandId):void
}
/** Physical matching stays in the command registry. Consuming a registered,
 * unavailable chord prevents browser behavior without invoking its operation. */
export function dispatchShellShortcut(event:ShellKeyEvent,focus:ShortcutFocus,host:ShellKeyboardHost):IdeCommandId|null{
 if(host.blocked||event.isComposing||event.defaultPrevented)return null
 const escape=worldEscapeCommand(event,focus,host.navigation())
 if(escape){event.preventDefault();event.stopPropagation();host.invoke(escape);return escape}
 const canonical=commandForShortcut(event,Object.values(ideCommandDefinitions),host.platform,focus)
 if(!canonical)return null
 event.preventDefault();event.stopPropagation()
 if((!host.busy||isPresentationCommand(canonical.id)||canonical.id==='workbench.quickOpen'||canonical.id==='workbench.commandPalette')&&host.available(canonical.id))host.invoke(canonical.id)
 return canonical.id
}
/** The browser adapter preserves the existing focused-surface boundaries;
 * its host is refreshed by the workspace's existing effect on every commit. */
export function createShellKeyboardHandler(host:ShellKeyboardHost){
 return(event:KeyboardEvent)=>{
  if(host.blocked||event.isComposing||event.target instanceof HTMLElement&&event.target.closest('[data-shell-menu]'))return
  if(event.defaultPrevented)return
  const target=event.target instanceof HTMLElement?event.target:null
  const focus:ShortcutFocus={
   editor:!!target?.closest('.monaco-editor'),
   textInput:!!target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'),
   world:!!target?.closest('.world-canvas'),
   inspector:!!target?.closest('.inspector, .gg-inspector'),
   shellSurface:!!target?.closest('.shell-source, .ide-source-pane, .ide-editor-panel, .shell-source-peek, .ide-jdk, .gg-inspector, .world-timeline, .world-settings, [role="dialog"], [role="menu"]'),
  }
  dispatchShellShortcut(event,focus,host)
 }
}
