/**
 * Hanging Protocol "Documento" (DOC) — solo modo nova-desktop.
 *
 * Se aplica a estudios que contengan AL MENOS una serie de modalidad DOC (PDF
 * encapsulado, p. ej. un informe complementario). La idea es que el documento
 * sea el centro de la escena: ocupa la mitad IZQUIERDA del layout, y la mitad
 * DERECHA se reparte en 1, 2 o (máximo) 3 viewports apilados verticalmente con
 * el resto de series NO-DOC del estudio (DX, CR, CT, MR, XA, …).
 *
 * Layout asimétrico vía `viewportStructure.properties.layoutOptions` (x/y/width
 * /height en fracciones del lienzo), igual que hace la extensión tmtv. El
 * componente de cada viewport lo decide el grid según el SOPClassHandlerId del
 * display set (la serie DOC se renderiza con el viewport de @ohif/extension-
 * dicom-pdf automáticamente), por lo que NO hace falta forzar `viewportType`.
 *
 * Selección de stage: los stages se evalúan en orden y se activa el PRIMERO cuyo
 * `minViewportsMatched` se cumpla (HangingProtocolService._updateStageStatus →
 * _findStageIndex). `matchedViewports` sólo cuenta viewports que REALMENTE
 * encontraron un display set (allowUnmatchedView no infla la cuenta), así que
 * ordenando los stages de más a menos viewports obtenemos el reparto deseado:
 *
 *   1. doc-1x3  → DOC + 3 series NO-DOC  (derecha 3x1)  · minViewportsMatched 4
 *   2. doc-1x2  → DOC + 2 series NO-DOC  (derecha 2x1)  · minViewportsMatched 3
 *   3. doc-1x1  → DOC + 1 serie  NO-DOC  (derecha 1x1)  · minViewportsMatched 2
 *   4. doc-solo → sólo DOC                              · minViewportsMatched 1
 *
 * Si hay más de un DOC se usa el PRIMERO (matchedDisplaySetsIndex 0) y el resto
 * de viewports se rellenan con las primeras series NO-DOC.
 *
 * Se registra (addProtocol) en el onModeEnter de nova-desktop y se lista en su
 * array `hangingProtocol`. Prioridad por encima del HP de mamografía y genéricos,
 * por debajo del de XA (cine), de modo que un estudio con DOC abra centrado en
 * el informe salvo que predomine XA.
 */

const baseViewportOptions = {
  toolGroupId: 'default',
  allowUnmatchedView: true,
};

// Geometría del DOC: siempre la mitad izquierda, a toda la altura.
const DOC_AREA = { x: 0, y: 0, width: 1 / 2, height: 1 };

/** Viewport del documento (mitad izquierda). Usa el primer DOC disponible. */
const docViewport = {
  viewportOptions: { ...baseViewportOptions },
  displaySets: [{ id: 'docSelector', matchedDisplaySetsIndex: 0 }],
};

/** Viewport de una serie NO-DOC (n-ésima coincidencia del selector). */
const nonDocViewport = (matchedDisplaySetsIndex: number) => ({
  viewportOptions: { ...baseViewportOptions, viewportType: 'stack' },
  displaySets: [{ id: 'nonDocSelector', matchedDisplaySetsIndex }],
});

const displaySetSelectors = {
  // Primer (y preferido) documento encapsulado del estudio.
  docSelector: {
    seriesMatchingRules: [
      {
        weight: 100,
        attribute: 'Modality',
        constraint: { equals: 'DOC' },
        required: true,
      },
    ],
  },
  // Cualquier serie que NO sea DOC. El grid las ordena por su matching natural;
  // matchedDisplaySetsIndex 0/1/2 toma las primeras 1/2/3 según el stage.
  nonDocSelector: {
    seriesMatchingRules: [
      {
        weight: 100,
        attribute: 'Modality',
        // OJO: el comparador registrado es `doesNotEqual` (ver
        // HangingProtocolService/lib/comparators.js + validator.js). El tipo
        // Constraint expone `notEquals`, pero ese validador NO existe y lanza
        // → la regla `required` fallaría siempre y el selector no matchearía.
        constraint: { doesNotEqual: 'DOC' },
        required: true,
      },
    ],
  },
};

const hpDoc = {
  id: '@nova/hpDoc',
  locked: true,
  name: 'Documento + series',
  numberOfPriorsReferenced: 0,
  protocolMatchingRules: [
    {
      id: 'studyHasDOC',
      // Por encima de mamografía (1000) y genéricos; por debajo de XA (2000).
      weight: 1500,
      attribute: 'ModalitiesInStudy',
      constraint: { contains: 'DOC' },
      required: true,
    },
  ],
  toolGroupIds: ['default'],
  displaySetSelectors,
  // Viewport por defecto al añadir paneles con la herramienta de layout.
  defaultViewport: {
    viewportOptions: { ...baseViewportOptions, viewportType: 'stack' },
    displaySets: [{ id: 'nonDocSelector', matchedDisplaySetsIndex: -1 }],
  },
  stages: [
    // 1) DOC (izq) + 3 series NO-DOC apiladas (der 3x1).
    {
      id: 'doc-1x3',
      name: 'Documento + 3',
      stageActivation: { enabled: { minViewportsMatched: 4 } },
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 3,
          columns: 2,
          layoutOptions: [
            DOC_AREA,
            { x: 1 / 2, y: 0, width: 1 / 2, height: 1 / 3 },
            { x: 1 / 2, y: 1 / 3, width: 1 / 2, height: 1 / 3 },
            { x: 1 / 2, y: 2 / 3, width: 1 / 2, height: 1 / 3 },
          ],
        },
      },
      viewports: [docViewport, nonDocViewport(0), nonDocViewport(1), nonDocViewport(2)],
    },

    // 2) DOC (izq) + 2 series NO-DOC apiladas (der 2x1).
    {
      id: 'doc-1x2',
      name: 'Documento + 2',
      stageActivation: { enabled: { minViewportsMatched: 3 } },
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 2,
          columns: 2,
          layoutOptions: [
            DOC_AREA,
            { x: 1 / 2, y: 0, width: 1 / 2, height: 1 / 2 },
            { x: 1 / 2, y: 1 / 2, width: 1 / 2, height: 1 / 2 },
          ],
        },
      },
      viewports: [docViewport, nonDocViewport(0), nonDocViewport(1)],
    },

    // 3) DOC (izq) + 1 serie NO-DOC (der 1x1).
    {
      id: 'doc-1x1',
      name: 'Documento + 1',
      stageActivation: { enabled: { minViewportsMatched: 2 } },
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 2,
          layoutOptions: [DOC_AREA, { x: 1 / 2, y: 0, width: 1 / 2, height: 1 }],
        },
      },
      viewports: [docViewport, nonDocViewport(0)],
    },

    // 4) Sólo DOC: no hay series complementarias.
    {
      id: 'doc-solo',
      name: 'Documento',
      stageActivation: { enabled: { minViewportsMatched: 1 } },
      viewportStructure: {
        layoutType: 'grid',
        properties: { rows: 1, columns: 1 },
      },
      viewports: [docViewport],
    },
  ],
};

export default hpDoc;
