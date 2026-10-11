import {color} from '../../theme/tokens'
import type {BodyRole} from './materialTypes'
/** Exception acrylic uses the same material grammar with the recorded-path red. */
export function bodyPalette(role:BodyRole){return role==='exception'?{core:color.semantic.exception,edge:color.semantic.exception}:color[role]}
