/**
 * Hanging Protocol XA (angiografía) — solo modo nova-desktop.
 *
 * Se aplica a estudios que incluyan al menos una serie de modalidad XA. Usa un
 * layout 1x1 y, al aplicarse, activa el reproductor de cine PERO en pausa
 * (comando `novaCineShowPaused`, registrado en el onModeEnter de nova-desktop).
 *
 * Prioridad: el `weight` de la regla de matching es muy alto, de modo que este
 * HP gana a cualquier otro cuando hay XA presente. Solo nova-desktop lo registra
 * (`hangingProtocolService.addProtocol`) y lo lista en su array `hangingProtocol`,
 * por lo que no se usa en ningún otro modo.
 */
const hpXA = {
  id: '@nova/hpXA',
  locked: true,
  name: 'XA 1x1 Cine',
  numberOfPriorsReferenced: 0,
  // Señal declarativa que lee el CinePlayer (extensions/cornerstone) para NO
  // auto-reproducir al entrar a este protocolo: la barra de cine se muestra
  // (vía onProtocolEnter → novaCineShowPaused) pero arranca PAUSADA. Es la vía
  // determinista; no depende del timing de activeViewport ni del set "cine
  // cerrado" global del CineService.
  cineStartPaused: true,
  protocolMatchingRules: [
    {
      id: 'studyHasXA',
      // Prioridad muy alta para ganar a cualquier otro HP cuando hay XA.
      weight: 2000,
      attribute: 'ModalitiesInStudy',
      constraint: {
        contains: 'XA',
      },
      required: true,
    },
  ],
  toolGroupIds: ['default'],
  callbacks: {
    // Al entrar al protocolo, mostrar el cine pausado en el viewport activo.
    onProtocolEnter: ['novaCineShowPaused'],
  },
  displaySetSelectors: {
    xaDisplaySetId: {
      seriesMatchingRules: [
        {
          weight: 100,
          attribute: 'Modality',
          constraint: {
            equals: 'XA',
          },
          required: true,
        },
        {
          weight: 10,
          attribute: 'numImageFrames',
          constraint: {
            greaterThan: { value: 0 },
          },
        },
      ],
    },
  },
  stages: [
    {
      name: 'XA 1x1',
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
            allowUnmatchedView: true,
          },
          displaySets: [
            {
              id: 'xaDisplaySetId',
            },
          ],
        },
      ],
    },
  ],
};

export default hpXA;
