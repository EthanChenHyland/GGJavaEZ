import type { SourceLocation, TraceEvent } from '../contracts/runtime';
import type { SceneExceptionPath, SceneModel } from '../contracts/world';

export type ForensicPhase = 'throw' | 'unwind' | 'catch' | 'uncaught';

export function observedExceptionEvent(event: TraceEvent | undefined, previous: TraceEvent | undefined): (NonNullable<SceneExceptionPath['current']> & { exceptionId: string }) | undefined {
    if (!event) return;
    const { eventId, source } = event;
    if (event.type === 'THROW_EXCEPTION' || event.type === 'UNWIND_EXCEPTION' || event.type === 'CATCH_EXCEPTION') {
        const phase = event.type === 'THROW_EXCEPTION' ? 'throw' : event.type === 'UNWIND_EXCEPTION' ? 'unwind' : 'catch';
        return { eventId, phase, frameId: event.frameId, source, exceptionId: event.exceptionId };
    }
    if (event.type !== 'EXECUTION_FACT') return;
    const fact = event.fact;
    if ((fact.kind !== 'throw' && fact.kind !== 'unwind' && fact.kind !== 'catch') || !fact.exceptionId) return;
    // Legacy recorders could emit another graph throw while an earlier throw
    // was still open. Only echo an origin when its raw throw was accepted.
    if (fact.kind === 'throw' && !(previous?.type === 'THROW_EXCEPTION' && previous.exceptionId === fact.exceptionId && previous.frameId === fact.invocationId)) return;
    return { eventId, phase: fact.kind, frameId: fact.invocationId, source: source ?? fact.context.source, exceptionId: fact.exceptionId };
}

/** Only the exact applied exception event can activate a nonterminal panel. */
export function forensicPhaseAtCursor(scene: SceneModel): ForensicPhase | null {
    const path = scene.exception;
    if (!path) return null;
    if (path.uncaught) return scene.cursor === scene.liveHead ? 'uncaught' : null;
    if (!path.current || path.current.eventId !== scene.cursorEvent?.id) return null;
    return path.current.phase;
}

function siteCaption(label: string, source: SourceLocation | null): string {
    const file = source?.fileId.split('/').at(-1);
    return source && file ? `${label} · ${file}:${source.line}` : `${label} unavailable`;
}

/** The spatial captions preview the observed propagation. The captured Java
 * stack text has its own independent evidence and its own layout. */
export function forensicCaptions(path: SceneExceptionPath): { phase: string | null; sites: readonly string[] } {
    const unwound = path.unwound.length;
    if (path.uncaught) return { phase: unwound ? `Uncaught · ${unwound} unwound` : 'Uncaught', sites: [] };

    const current = path.current;
    if (!current) return { phase: null, sites: [] };
    const throwSite = siteCaption('Throw site', path.throwLine ?? (current.phase === 'throw' ? current.source : null));
    if (current.phase === 'throw') return { phase: 'Thrown', sites: [throwSite] };
    if (current.phase === 'catch') return { phase: 'Caught', sites: [throwSite, siteCaption('Catch site', current.source)] };
    return {
        phase: unwound ? `Unwinding · ${unwound} unwound` : 'Unwinding',
        sites: [throwSite, siteCaption('Unwind site', current.source)],
    };
}
