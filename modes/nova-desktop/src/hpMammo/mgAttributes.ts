/**
 * Atributos personalizados de hanging protocol para mamografía (MG).
 *
 * El objetivo es una identificación ROBUSTA de cada serie de mama combinando
 * todas las señales disponibles en DICOM, y exponiéndolas NORMALIZADAS para que
 * los selectores del HP sólo tengan que comparar con `equals` (en vez de encadenar
 * muchas reglas frágiles):
 *
 *  - `MGLaterality` → 'R' | 'L' | undefined
 *  - `MGView`       → 'CC' | 'MLO' | 'ML' | 'LM' | 'XCCL' | ... | undefined
 *
 * Señales para la VISTA (`MGView`), en orden de prioridad según DICOM:
 *  1. ViewCodeSequence (0054,0220) — medio NORMATIVO. PS3.3 indica que esta
 *     secuencia codificada describe la proyección y reemplaza funcionalmente a
 *     ViewPosition (0018,5101). Los valores provienen del CID 4014 "Mammography
 *     View" (p. ej. CC = SNM3/SRT R-10242 ó SCT 399162004; MLO = R-10226 ó
 *     399368009). Se empareja por CodeValue (multi-esquema) y, como respaldo,
 *     por CodeMeaning (texto legible: "Cranio-Caudal", "Medio-lateral oblique"…).
 *  2. ViewPosition (0018,5101) — legado, sólo si no hay ViewCodeSequence.
 *  3. Heurística sobre SeriesDescription (incluye variantes en español de PACS
 *     locales: CRANEOCAUDAL, OBLICUA…).
 *
 * Señales para la LATERALIDAD (`MGLaterality`):
 *  1. ImageLaterality (0020,0062) / Laterality (0020,0060).
 *  2. FrameAnatomySequence/FrameLaterality (MG "enhanced"/tomosíntesis).
 *  3. Heurística sobre descripción (DERECHA/IZQUIERDA, MD/MI…).
 */

type AnyDisplaySet = Record<string, any>;

/** Devuelve la primera instancia/imagen del display set, sea `images` o `instances`. */
const firstInstance = (displaySet: AnyDisplaySet) =>
  displaySet?.images?.[0] ?? displaySet?.instances?.[0] ?? null;

/** Texto combinado (mayúsculas) útil para heurística de descripción. */
const descriptorText = (displaySet: AnyDisplaySet, inst: AnyDisplaySet | null): string =>
  `${displaySet?.SeriesDescription ?? ''} ${inst?.ViewPosition ?? ''} ${inst?.SeriesDescription ?? ''}`
    .toUpperCase()
    .trim();

// CID 4014 "Mammography View". Códigos por CodeValue en los esquemas habituales
// (SNM3/SRT comparten el código R-…; SCT usa el numérico). Se normalizan a la
// vista interna usada por los selectores del HP.
const VIEW_CODE_VALUES: Record<string, string> = {
  // Cranio-caudal (CC)
  'R-10242': 'CC',
  '399162004': 'CC',
  // Medio-lateral oblique (MLO)
  'R-10226': 'MLO',
  '399368009': 'MLO',
  // Medio-lateral (ML)
  'R-10224': 'ML',
  '399352000': 'ML',
  // Latero-medial (LM)
  'R-10228': 'LM',
  '399260004': 'LM',
  // Exaggerated cranio-caudal laterally (XCCL)
  'R-10244': 'XCCL',
};

/**
 * Normaliza la vista a partir del CodeMeaning (texto legible) de un código de
 * proyección. Respaldo cuando el CodeValue no está en la tabla anterior.
 */
const viewFromCodeMeaning = (meaning?: string): string | undefined => {
  if (!meaning) {
    return undefined;
  }
  const m = String(meaning).toUpperCase();
  if (m.includes('OBLIQUE') || m.includes('OBLIC')) {
    return m.includes('LATERO-MEDIAL') || m.includes('LATEROMEDIAL') ? 'LMO' : 'MLO';
  }
  if (m.includes('CRANIO-CAUDAL') || m.includes('CRANIOCAUDAL') || m.includes('CRANEOCAUDAL')) {
    return m.includes('EXAGGERAT') ? 'XCCL' : 'CC';
  }
  if (m.includes('LATERO-MEDIAL') || m.includes('LATEROMEDIAL')) {
    return 'LM';
  }
  if (m.includes('MEDIO-LATERAL') || m.includes('MEDIOLATERAL')) {
    return 'ML';
  }
  return undefined;
};

/**
 * Lee el primer item de ViewCodeSequence (0054,0220) de una instancia, tanto si
 * está a nivel de instancia (MG convencional) como dentro de los grupos
 * funcionales compartidos (MG "enhanced"/tomosíntesis).
 */
const readViewCode = (
  inst: AnyDisplaySet | null
): { codeValue?: string; codeMeaning?: string } => {
  const seq =
    inst?.ViewCodeSequence ??
    inst?.SharedFunctionalGroupsSequence?.[0]?.FrameViewCodeSequence ??
    inst?.SharedFunctionalGroupsSequence?.[0]?.FrameContentSequence?.[0]?.ViewCodeSequence;
  const item = Array.isArray(seq) ? seq[0] : seq;
  if (!item) {
    return {};
  }
  return {
    codeValue: item.CodeValue != null ? String(item.CodeValue).trim() : undefined,
    codeMeaning: item.CodeMeaning != null ? String(item.CodeMeaning) : undefined,
  };
};

/**
 * Lateralidad normalizada de un display set de mama: 'R' | 'L' | undefined.
 */
export const mgLaterality = (displaySet: AnyDisplaySet): 'R' | 'L' | undefined => {
  const inst = firstInstance(displaySet);

  // 1) Tags DICOM directos de lateralidad.
  let raw: string | undefined =
    inst?.ImageLaterality ||
    inst?.Laterality ||
    displaySet?.Laterality ||
    inst?.SharedFunctionalGroupsSequence?.[0]?.FrameAnatomySequence?.[0]?.FrameLaterality;

  if (raw) {
    const v = String(raw).trim().toUpperCase();
    if (v.startsWith('R')) return 'R';
    if (v.startsWith('L')) return 'L';
  }

  // 2) Heurística sobre descripción (EN/ES).
  const text = descriptorText(displaySet, inst);
  const isRight =
    /\bR(IGHT)?\b/.test(text) ||
    /\bRT\b/.test(text) ||
    /\bR\s?(CC|MLO|ML|XCCL|LM)\b/.test(text) ||
    /\bR(CC|MLO|ML)\b/.test(text) ||
    /DERECH/.test(text) ||
    /\bMD\b/.test(text);
  const isLeft =
    /\bL(EFT)?\b/.test(text) ||
    /\bLT\b/.test(text) ||
    /\bL\s?(CC|MLO|ML|XCCL|LM)\b/.test(text) ||
    /\bL(CC|MLO|ML)\b/.test(text) ||
    /IZQUIERD/.test(text) ||
    /\bMI\b/.test(text);

  // Si ambas o ninguna coinciden, no arriesgamos una clasificación errónea.
  if (isRight && !isLeft) return 'R';
  if (isLeft && !isRight) return 'L';
  return undefined;
};

/**
 * Vista normalizada de un display set de mama: 'CC' | 'MLO' | 'ML' | 'LM' |
 * 'XCCL' | ... | undefined.
 */
export const mgView = (displaySet: AnyDisplaySet): string | undefined => {
  const inst = firstInstance(displaySet);

  // 1) ViewCodeSequence (0054,0220): medio NORMATIVO (CID 4014). Prioritario por
  //    encima de ViewPosition, al que reemplaza funcionalmente según DICOM.
  const { codeValue, codeMeaning } = readViewCode(inst);
  if (codeValue && VIEW_CODE_VALUES[codeValue]) {
    return VIEW_CODE_VALUES[codeValue];
  }
  const fromMeaning = viewFromCodeMeaning(codeMeaning);
  if (fromMeaning) {
    return fromMeaning;
  }

  // 2) ViewPosition (0018,5101): tag legado, sólo si no hubo código de proyección.
  const vpRaw = inst?.ViewPosition && String(inst.ViewPosition).trim().toUpperCase();
  if (vpRaw) {
    if (vpRaw.includes('MLO')) return 'MLO';
    if (vpRaw === 'ML') return 'ML';
    if (vpRaw === 'LM') return 'LM';
    if (vpRaw.includes('XCCL') || vpRaw.includes('XCC')) return 'XCCL';
    if (vpRaw.includes('CC')) return 'CC';
    return vpRaw; // otras vistas con su valor textual (FB, SIO, etc.)
  }

  // 3) Heurística sobre descripción (EN/ES).
  const text = descriptorText(displaySet, inst);
  if (/\bMLO\b/.test(text) || /OBLIC/.test(text) || /\bOML\b/.test(text)) return 'MLO';
  if (/\bXCCL?\b/.test(text)) return 'XCCL';
  if (/\bLM\b/.test(text)) return 'LM';
  if (/\bML\b/.test(text)) return 'ML';
  if (/\bCC\b/.test(text) || /CRANEOCAUDAL/.test(text) || /CRANIOCAUDAL/.test(text)) return 'CC';
  return undefined;
};

/**
 * Registra los atributos personalizados de mamografía en el HangingProtocolService.
 * Idempotente: re-registrar con el mismo id simplemente sobre-escribe el callback.
 */
export function registerMammoAttributes({ servicesManager }: { servicesManager: any }): void {
  const { hangingProtocolService } = servicesManager.services;
  hangingProtocolService.addCustomAttribute(
    'MGLaterality',
    'Mammography laterality (R/L)',
    mgLaterality
  );
  hangingProtocolService.addCustomAttribute('MGView', 'Mammography view (CC/MLO/…)', mgView);
}
