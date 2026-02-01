/**
 * Hanging Protocol para modo móvil
 * - Deshabilita overlays que causan problemas con CPU rendering
 * - Optimizado para pantallas pequeñas (un solo viewport)
 */
const hpMobile = {
  id: '@nova/hp-mobile',
  name: 'NOVA Mobile',
  protocolMatchingRules: [
    {
      id: 'OneOrMoreSeries',
      weight: 25,
      attribute: 'numberOfDisplaySetsWithImages',
      constraint: {
        greaterThan: 0,
      },
    },
  ],
  toolGroupIds: ['default'],
  displaySetSelectors: {
    defaultDisplaySetId: {
      seriesMatchingRules: [
        {
          weight: 1,
          attribute: 'numImageFrames',
          constraint: {
            greaterThan: { value: 0 },
          },
        },
      ],
    },
  },
  defaultViewport: {
    viewportOptions: {
      viewportType: 'stack',
      toolGroupId: 'default',
      // Deshabilitar overlays para evitar errores con CPU rendering
      customViewportProps: {
        hideOverlays: true,
      },
    },
    displaySets: [
      {
        id: 'defaultDisplaySetId',
      },
    ],
  },
  stages: [
    {
      name: 'Mobile Single Viewport',
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 1,
        },
      },
      viewports: [
        {
          viewportOptions: {
            viewportType: 'stack',
            toolGroupId: 'default',
            // Deshabilitar overlays para evitar errores con CPU rendering
            customViewportProps: {
              hideOverlays: true,
            },
          },
          displaySets: [
            {
              id: 'defaultDisplaySetId',
            },
          ],
        },
      ],
    },
  ],
};

export default hpMobile;
