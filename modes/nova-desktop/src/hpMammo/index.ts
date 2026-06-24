/**
 * Hanging Protocol de Mamografía (MG) — sólo modo nova-desktop.
 *
 * Identificación robusta de cada serie de mama combinando ViewPosition,
 * ViewCodeSequence, ImageLaterality/Laterality/FrameLaterality y SeriesDescription
 * (ver `mgAttributes.ts`, que expone los atributos normalizados `MGLaterality` y
 * `MGView`).
 *
 * Layout adaptativo según la cantidad de imágenes disponibles. Los stages se
 * evalúan en orden y se activa el PRIMERO cuyo `minViewportsMatched` se cumpla
 * (ver HangingProtocolService._findStageIndex):
 *
 *   1. 2x2 estándar  → R/L × CC/MLO posicionadas espalda-con-espalda (≥3 vistas).
 *   2. 2x2 genérico  → rellena con cualquier MG si la identificación no alcanza (≥3).
 *   3. 1x2 genérico  → 2 imágenes.
 *   4. 1x1 genérico  → 1 imagen.
 *
 * Se registra (junto con sus atributos) en el onModeEnter de nova-desktop y se
 * lista con prioridad alta en el array `hangingProtocol`.
 */
import { RCC, LCC, RMLO, LMLO, MGAny } from './mgSelectors';

export { registerMammoAttributes } from './mgAttributes';

// Posicionamiento "espalda con espalda": la mama derecha se alinea a la izquierda
// y la izquierda a la derecha, con la pared torácica hacia el centro.
const rightDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1, 1],
  imageCanvasPoint: {
    imagePoint: [0, 0.5],
    canvasPoint: [0, 0.5],
  },
};

const leftDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1, 1],
  imageCanvasPoint: {
    imagePoint: [1, 0.5],
    canvasPoint: [1, 0.5],
  },
};

const baseViewportOptions = {
  viewportType: 'stack',
  toolGroupId: 'default',
  allowUnmatchedView: true,
};

const genericViewport = (matchedDisplaySetsIndex = 0) => ({
  viewportOptions: { ...baseViewportOptions },
  displaySets: [{ id: 'MGAny', matchedDisplaySetsIndex }],
});

const hpMammo = {
  id: '@nova/hpMammo',
  locked: true,
  name: 'Mamografía',
  numberOfPriorsReferenced: 0,
  protocolMatchingRules: [
    {
      id: 'studyHasMG',
      // Prioridad alta para ganar a los HP genéricos cuando hay MG.
      weight: 1000,
      attribute: 'ModalitiesInStudy',
      constraint: {
        contains: 'MG',
      },
      required: true,
    },
    {
      id: 'hasImages',
      attribute: 'numberOfDisplaySetsWithImages',
      constraint: {
        greaterThan: { value: 0 },
      },
      required: true,
    },
  ],
  toolGroupIds: ['default'],
  displaySetSelectors: {
    RCC,
    LCC,
    RMLO,
    LMLO,
    MGAny,
  },
  // Viewport por defecto al añadir paneles con la herramienta de layout.
  defaultViewport: {
    viewportOptions: { ...baseViewportOptions },
    displaySets: [{ id: 'MGAny', matchedDisplaySetsIndex: -1 }],
  },
  stages: [
    // 1) 2x2 estándar: CC arriba (R | L), MLO abajo (R | L), posicionadas.
    {
      id: 'mg-2x2-standard',
      name: 'CC / MLO 2x2',
      stageActivation: {
        enabled: {
          minViewportsMatched: 3,
        },
      },
      viewportStructure: {
        layoutType: 'grid',
        properties: { rows: 2, columns: 2 },
      },
      viewports: [
        {
          viewportOptions: { ...baseViewportOptions, displayArea: leftDisplayArea },
          displaySets: [{ id: 'RCC' }],
        },
        {
          viewportOptions: { ...baseViewportOptions, displayArea: rightDisplayArea },
          displaySets: [{ id: 'LCC' }],
        },
        {
          viewportOptions: { ...baseViewportOptions, displayArea: leftDisplayArea },
          displaySets: [{ id: 'RMLO' }],
        },
        {
          viewportOptions: { ...baseViewportOptions, displayArea: rightDisplayArea },
          displaySets: [{ id: 'LMLO' }],
        },
      ],
    },

    // 2) 2x2 genérico: respaldo cuando la identificación por vista no alcanza.
    {
      id: 'mg-2x2-generic',
      name: '2x2',
      stageActivation: {
        enabled: {
          minViewportsMatched: 3,
        },
      },
      viewportStructure: {
        layoutType: 'grid',
        properties: { rows: 2, columns: 2 },
      },
      viewports: [
        genericViewport(0),
        genericViewport(1),
        genericViewport(2),
        genericViewport(3),
      ],
    },

    // 3) 1x2 genérico: dos imágenes.
    {
      id: 'mg-1x2',
      name: '1x2',
      stageActivation: {
        enabled: {
          minViewportsMatched: 2,
        },
      },
      viewportStructure: {
        layoutType: 'grid',
        properties: { rows: 1, columns: 2 },
      },
      viewports: [genericViewport(0), genericViewport(1)],
    },

    // 4) 1x1 genérico: una imagen.
    {
      id: 'mg-1x1',
      name: '1x1',
      stageActivation: {
        enabled: {
          minViewportsMatched: 1,
        },
      },
      viewportStructure: {
        layoutType: 'grid',
        properties: { rows: 1, columns: 1 },
      },
      viewports: [genericViewport(0)],
    },
  ],
};

export default hpMammo;
