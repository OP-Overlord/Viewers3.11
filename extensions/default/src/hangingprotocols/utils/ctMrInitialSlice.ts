import type { Types } from '@ohif/core';

/** Modalidades que se abren en el corte medio de la serie. */
const MIDDLE_SLICE_MODALITIES = new Set(['CT', 'MR']);

/**
 * Atributo custom para `viewportOptions.initialImageOptions`.
 *
 * Regla de negocio: al colgar una serie multicorte, el viewport se posiciona en
 * el corte MEDIO solo si la serie es CT o MR (donde el primer corte suele ser
 * anatómicamente poco informativo). Para el resto de modalidades (XA, US, DX,
 * MG, RF, PT, NM, DOC, ...) se abre en la PRIMERA instancia.
 *
 * `getComputedOptions` (HangingProtocolService) invoca este callback con el
 * array de displaySets casados para el viewport; el primero es el principal
 * (los siguientes son overlays tipo SEG/RTSTRUCT).
 *
 * @returns `{ preset: 'middle' }` para CT/MR, `{ index: 0 }` en cualquier otro
 * caso. Ambos los consume `CornerstoneViewportService._getInitialImageIndex`.
 */
export default function ctMrInitialSlice(displaySets: Types.DisplaySet | Types.DisplaySet[]): {
  preset?: string;
  index?: number;
} {
  const displaySet = Array.isArray(displaySets) ? displaySets[0] : displaySets;
  const modality = displaySet?.Modality;

  return MIDDLE_SLICE_MODALITIES.has(modality) ? { preset: 'middle' } : { index: 0 };
}
