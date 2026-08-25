import { Types } from '@ohif/core';
import { studyWithImages } from './utils/studySelectors';
import { seriesWithImages } from './utils/seriesSelectors';
import { viewportOptions } from './utils/viewportOptions';

/**
 * Opciones de viewport para mnGrid que, al cargar cada serie, posicionan el
 * viewport en el corte MEDIO solo si la serie es CT o MR; el resto de
 * modalidades abren en la primera instancia (indice 0).
 *
 * La decision es por serie, asi que no puede ser estatica: se delega en el
 * atributo custom 'ctMrInitialSlice' (utils/ctMrInitialSlice.ts), que
 * HangingProtocolService.getComputedOptions resuelve con los displaySets ya
 * casados y devuelve { preset: 'middle' } o { index: 0 }
 * (ver CornerstoneViewportService._getInitialImageIndex).
 */
const initialImageOptionsCtMr = {
  custom: 'ctMrInitialSlice',
  // Si el atributo no puede resolverse (sin displaySet casado), primera imagen.
  defaultValue: { index: 0 },
};

const viewportOptionsMiddleSlice = {
  ...viewportOptions,
  initialImageOptions: initialImageOptionsCtMr,
};

/**
 * Sync group configuration for hydrating segmentations across viewports
 * that share the same frame of reference
 * @type {Types.HangingProtocol.SyncGroup}
 */
export const HYDRATE_SEG_SYNC_GROUP = {
  type: 'hydrateseg',
  id: 'sameFORId',
  source: true,
  target: true,
  options: {
    matchingRules: ['sameFOR'],
  },
} as const;

/**
 * This hanging protocol can be activated on the primary mode by directly
 * referencing it in a URL or by directly including it within a mode, e.g.:
 * `&hangingProtocolId=@ohif/mnGrid` added to the viewer URL
 * It is not included in the viewer mode by default.
 */
export const hpMN: Types.HangingProtocol.Protocol = {
  id: '@ohif/mnGrid',
  description: 'Has various hanging protocol grid layouts',
  name: '2x2',
  protocolMatchingRules: studyWithImages,
  toolGroupIds: ['default'],
  displaySetSelectors: {
    defaultDisplaySetId: {
      allowUnmatchedView: true,
      seriesMatchingRules: seriesWithImages,
    },
  },
  defaultViewport: {
    viewportOptions: {
      viewportType: 'stack',
      toolGroupId: 'default',
      // Corte medio solo para CT/MR al añadir viewports con el layout tool.
      initialImageOptions: initialImageOptionsCtMr,
      syncGroups: [HYDRATE_SEG_SYNC_GROUP],
    },
    displaySets: [
      {
        id: 'defaultDisplaySetId',
        matchedDisplaySetsIndex: -1,
      },
    ],
  },
  stages: [
    {
      id: '2x2',
      name: '2x2',
      stageActivation: {
        enabled: {
          minViewportsMatched: 4,
        },
      },
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 2,
          columns: 2,
        },
      },
      viewports: [
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 1,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 2,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 3,
              id: 'defaultDisplaySetId',
            },
          ],
        },
      ],
    },

    // 3x1 stage
    {
      name: '3x1',
      stageActivation: {
        enabled: {
          minViewportsMatched: 3,
        },
      },
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 3,
        },
      },
      viewports: [
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              id: 'defaultDisplaySetId',
              matchedDisplaySetsIndex: 1,
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              id: 'defaultDisplaySetId',
              matchedDisplaySetsIndex: 2,
            },
          ],
        },
      ],
    },

    // A 2x1 stage
    {
      name: '2x1',
      stageActivation: {
        enabled: {
          minViewportsMatched: 2,
        },
      },
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 2,
        },
      },
      viewports: [
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 1,
              id: 'defaultDisplaySetId',
            },
          ],
        },
      ],
    },

    // A 1x1 stage - should be automatically activated if there is only 1 viewable instance
    {
      name: '1x1',
      stageActivation: {
        enabled: {
          minViewportsMatched: 1,
        },
      },
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 1,
        },
      },
      viewports: [
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              id: 'defaultDisplaySetId',
            },
          ],
        },
      ],
    },
  ],
  numberOfPriorsReferenced: -1,
};

/**
 * This hanging protocol can be activated on the primary mode by directly
 * referencing it in a URL or by directly including it within a mode, e.g.:
 * `&hangingProtocolId=@ohif/mnGrid8` added to the viewer URL
 * It is not included in the viewer mode by default.
 */
export const hpMN8: Types.HangingProtocol.Protocol = {
  ...hpMN,
  id: '@ohif/mnGrid8',
  description: 'Has various hanging protocol grid layouts up to 4x2',
  name: '4x2',
  stages: [
    {
      id: '4x2',
      name: '4x2',
      stageActivation: {
        enabled: {
          minViewportsMatched: 7,
        },
      },
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 2,
          columns: 4,
        },
      },
      viewports: [
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 1,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 2,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 3,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 4,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 5,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 6,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 7,
              id: 'defaultDisplaySetId',
            },
          ],
        },
      ],
    },

    {
      id: '3x2',
      name: '3x2',
      stageActivation: {
        enabled: {
          minViewportsMatched: 5,
        },
      },
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 2,
          columns: 3,
        },
      },
      viewports: [
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 1,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 2,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 3,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 4,
              id: 'defaultDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: viewportOptionsMiddleSlice,
          displaySets: [
            {
              matchedDisplaySetsIndex: 5,
              id: 'defaultDisplaySetId',
            },
          ],
        },
      ],
    },

    ...hpMN.stages,
  ],
};

export default hpMN;
