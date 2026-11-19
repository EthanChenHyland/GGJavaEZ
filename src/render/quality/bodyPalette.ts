import {Color} from 'three'
import {color} from '../../theme/tokens'
import type {BodyRole} from './materialTypes'
const ioPalettes=Object.fromEntries((['stdin','stdout','stderr'] as const).map(id=>[id,{core:`#${new Color(color.stack.chip).lerp(new Color(color.semantic[id]),.28).getHexString()}`,edge:color.semantic[id]}]))
/** Exception acrylic uses the same material grammar with the recorded-path red. */
export function bodyPalette(role:BodyRole){return role==='stdin'||role==='stdout'||role==='stderr'?ioPalettes[role]:role==='exception'?{core:color.semantic.exception,edge:color.semantic.exception}:color[role]}
