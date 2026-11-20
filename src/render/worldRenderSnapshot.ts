import type { LayoutState, PresentationPlan, SceneModel } from '../contracts/world';

type RenderInputs = Readonly<{
    scene: SceneModel;
    plan: PresentationPlan;
    layout: LayoutState;
}>;

/** Carries one committed world cut through React without expanding its catalog
 * into component props. Rendering consumers read the same projection by reference. */
export class WorldRenderSnapshot {
    readonly #inputs: RenderInputs;

    constructor(inputs: RenderInputs) {
        this.#inputs = inputs;
    }

    read(): RenderInputs {
        return this.#inputs;
    }
}
