/**
 * Selectores de display set para el hanging protocol de mamografía.
 *
 * Cada selector estándar (RCC/LCC/RMLO/LMLO) combina:
 *  - `Modality === 'MG'` (requerido): sólo series mamográficas.
 *  - `MGLaterality` / `MGView` normalizados (alto peso) para puntuar el encaje.
 *  - Reglas `doesNotEqual` REQUERIDAS como guarda: excluyen la lateralidad/vista
 *    contraria para evitar colocar una imagen en el cuadrante equivocado. Como
 *    `doesNotEqual` pasa cuando el atributo es undefined, una serie sin señales
 *    no queda excluida (cae a los stages genéricos), pero una claramente contraria
 *    sí se descarta.
 *  - `SeriesDescription` como desempate de bajo peso.
 */

// Sólo series MG (excluye CAD SR, presentaciones, etc.).
const onlyMG = {
  attribute: 'Modality',
  constraint: { equals: 'MG' },
  required: true,
};

const buildSelector = (laterality: 'R' | 'L', view: 'CC' | 'MLO') => {
  const otherLaterality = laterality === 'R' ? 'L' : 'R';
  const otherView = view === 'CC' ? 'MLO' : 'CC';
  return {
    // Permite que el viewport quede vacío si no hay encaje (no rompe el stage).
    allowUnmatchedView: true,
    seriesMatchingRules: [
      onlyMG,
      // Lateralidad
      { weight: 40, attribute: 'MGLaterality', constraint: { equals: laterality } },
      {
        attribute: 'MGLaterality',
        constraint: { doesNotEqual: otherLaterality },
        required: true,
      },
      // Vista
      { weight: 40, attribute: 'MGView', constraint: { equals: view } },
      {
        attribute: 'MGView',
        constraint: { doesNotEqual: otherView },
        required: true,
      },
      // Desempate por descripción (insensible a mayúsculas).
      {
        weight: 5,
        attribute: 'SeriesDescription',
        constraint: { containsI: `${laterality} ${view}` },
      },
    ],
  };
};

export const RCC = buildSelector('R', 'CC');
export const LCC = buildSelector('L', 'CC');
export const RMLO = buildSelector('R', 'MLO');
export const LMLO = buildSelector('L', 'MLO');

/**
 * Selector genérico: cualquier serie MG con imágenes. Lo usan los stages de
 * respaldo (genéricos) para rellenar la cuadrícula cuando la identificación por
 * vista/lateralidad no es concluyente, garantizando que las imágenes de mama
 * siempre se muestren.
 */
export const MGAny = {
  allowUnmatchedView: true,
  seriesMatchingRules: [
    onlyMG,
    { weight: 5, attribute: 'numImageFrames', constraint: { greaterThan: { value: 0 } } },
  ],
};
