import type { Evidence, SceneExceptionPath, Vec3 } from '../contracts/world';
import type { RecordingStatus } from '../instrumentation/contracts';
import { typographyV4, world } from '../theme/tokens';
import { localFontText, textAdvance, type FontWeight } from './text/textSystem';

export interface ExceptionPanelModel {
    /** Retain every captured character/ID, including text outside the face preview. */
    captured: SceneExceptionPath;
    header: string;
    message: string;
    stackLines: readonly string[];
    remainingStackLines: number;
    stackRemainder: string | null;
    causeIds: readonly string[];
    captions: readonly string[];
}

function evidenceCaption(area: string, evidence: Evidence): string | null {
    if (evidence.kind === 'unavailable')
        return `${area} unavailable · ${evidence.unavailableReason ?? 'not recorded'}`;
    if (evidence.kind === 'derived')
        return `${area} derived · ${evidence.derivation ?? 'derivation unavailable'} · inputs: ${evidence.eventIds.length ? evidence.eventIds.join(', ') : 'unavailable'}`;
    return null;
}

/** No source/stderr parsing, graph reconstruction, or cause-type inference.
 * The preserved recorder uses null for both null and unsafe message inspection.
 * Path evidence cannot disambiguate those; non-null captured text is independent.
 * Stack/cause evidence remains independent of exception-path completeness. */
export function buildExceptionPanelModel(
    content: SceneExceptionPath,
    recordingState: RecordingStatus['state'],
): ExceptionPanelModel {
    const remainingStackLines = Math.max(0, content.stack.length - 8);
    const captions: string[] = [];
    if (!content.complete || content.evidence.kind === 'unavailable' || content.throwFrameId === null)
        captions.push(`Exception path incomplete · ${recordingState}`);
    if (content.throwFrameId === null) captions.push('Throw frame unavailable · not recorded');
    const pathCaption = evidenceCaption('Path evidence', content.evidence);
    if (pathCaption) captions.push(pathCaption);
    const stackCaption = evidenceCaption('Stack text', content.stackEvidence);
    if (stackCaption) captions.push(stackCaption);
    if (!content.stack.length && content.stackEvidence.kind !== 'unavailable')
        captions.push('Captured stack lines: 0');
    // Evidence does not carry stack bounds or a proven full-stack line count.
    // Never interpret a captured array length as a complete Java stack trace.
    if (content.stack.length || content.stackEvidence.kind !== 'unavailable')
        captions.push('Stack bounds unavailable · counts cover captured lines only');
    const causeCaption = evidenceCaption('Cause chain', content.causeEvidence);
    if (causeCaption) captions.push(causeCaption);
    if (content.causes.length)
        captions.push(`Captured cause IDs (${content.causes.length}): ${content.causes.join(', ')}`);
    else if (content.causeEvidence.kind !== 'unavailable')
        captions.push('Captured cause IDs: 0');
    if (content.causeEvidence.kind !== 'unavailable')
        captions.push('Cause-chain completeness not recorded');

    return {
        captured: content,
        header: content.className || 'Exception class unavailable',
        message: content.message === null ? 'message: unavailable or null' : `message: ${content.message}`,
        stackLines: content.stack.slice(0, 8),
        remainingStackLines,
        stackRemainder: remainingStackLines ? `${remainingStackLines} more · captured stack lines` : null,
        causeIds: content.causes,
        captions,
    };
}

export interface WrappedExceptionText {
    lines: readonly string[];
    truncated: boolean;
    escaped: boolean;
}

/** Wrap using the exact generated Inter advances/kerning used by WorldText.
 * Escape unsupported glyphs before measuring; keep each escape group intact.
 * Whitespace and qualified-name punctuation are never trimmed or shortened.
 * The line bound limits glyph work, not the retained captured model. */
export function wrapExceptionPanelText(
    text: string,
    width: number,
    size: number,
    weight: FontWeight,
    maxLines: number,
): WrappedExceptionText {
    if (!(width > .012 && size > 0 && maxLines >= 1))
        return { lines: [], truncated: text.length > 0, escaped: false };
    const lines: string[] = [];
    const limit = Math.floor(maxLines);
    let line = '', escaped = false;
    const fits = (candidate: string) => textAdvance(candidate, weight) * size <= width - .012;
    for (const character of text) {
        const unit = localFontText(character, weight);
        escaped ||= unit !== character;
        if (fits(line + unit)) {
            line += unit;
            continue;
        }
        // Never submit an over-wide escape group to WorldText's ellipsis fitter.
        if (!line || lines.length + 1 >= limit || !fits(unit)) {
            if (line) lines.push(line);
            return { lines, truncated: true, escaped };
        }
        lines.push(line);
        line = unit;
    }
    lines.push(line);
    return { lines, truncated: false, escaped };
}

export interface ExceptionPanelLine {
    text: string;
    position: Vec3;
    size: number;
    weight: FontWeight;
    tone: 'title' | 'content' | 'caption';
}

export interface ExceptionPanelLayout {
    /** Centred on the planner's position; root must collision-check this size. */
    size: Vec3;
    textWidth: number;
    lines: readonly ExceptionPanelLine[];
    truncated: boolean;
}

// Proportions come from the shared runtime solids; there is no new world anchor.
export const exceptionPanelWidth = world.object.w;
export const exceptionPanelDepth = world.array.titlePlate;

/** Deterministic face layout, available to root before choosing panel placement.
 * Captured entries wrap independently so one long message cannot hide the eight
 * captured stack entries or their evidence captions. Only pathological entries
 * hit the explicit per-entry face bound. */
export function layoutExceptionPanel(model: ExceptionPanelModel): ExceptionPanelLayout {
    const padding = world.frame.pad;
    const textWidth = exceptionPanelWidth - padding * 2;
    const titleSize = typographyV4.world.title[0];
    const messageSize = typographyV4.world.row[0];
    const captionSize = typographyV4.world.type[0];
    const pitch = world.frame.row;
    const lines: Array<Omit<ExceptionPanelLine, 'position'> & { y: number }> = [];
    let height = padding, truncated = false, escaped = false;

    const append = (
        text: string,
        size: number,
        weight: FontWeight,
        tone: ExceptionPanelLine['tone'],
        maxLines: number,
    ) => {
        const wrapped = wrapExceptionPanelText(text, textWidth, size, weight, maxLines);
        escaped ||= wrapped.escaped;
        for (const line of wrapped.lines) {
            lines.push({ text: line, y: height + size / 2, size, weight, tone });
            height += Math.max(size * 1.4, pitch * .6);
        }
        return wrapped.truncated;
    };
    const entry = (
        label: string,
        text: string,
        size: number,
        weight: FontWeight,
        tone: ExceptionPanelLine['tone'],
        maxLines: number,
    ) => {
        if (append(text, size, weight, tone, maxLines)) {
            truncated = true;
            append(`Panel text truncated · ${label}`, captionSize, 400, 'caption', 4);
        }
    };

    entry('exception class', model.header, titleSize, 600, 'title', 16);
    height += padding;
    entry('message', model.message, messageSize, 500, 'content', 16);
    if (model.stackLines.length) height += padding;
    model.stackLines.forEach((line, index) => {
        entry(`captured stack line ${index + 1}`, line, captionSize, 400, 'content', 4);
    });
    if (model.stackRemainder) append(model.stackRemainder, captionSize, 400, 'caption', 4);
    if (model.captions.length) height += padding;
    model.captions.forEach((caption, index) => {
        entry(`evidence caption ${index + 1}`, caption, captionSize, 400, 'caption', 4);
    });
    if (escaped) append('Unsupported glyphs shown as Unicode escapes', captionSize, 400, 'caption', 4);
    height += padding;
    const size: Vec3 = [exceptionPanelWidth, height, exceptionPanelDepth];
    return {
        size,
        textWidth,
        truncated,
        lines: lines.map(({ y, ...line }) => ({
            ...line,
            position: [-exceptionPanelWidth / 2 + padding, height / 2 - y, exceptionPanelDepth / 2 + .085],
        })),
    };
}
