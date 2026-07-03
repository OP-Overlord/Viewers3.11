import { imageLoader, metaData, utilities as csUtils } from '@cornerstonejs/core';

/**
 * renderedImageLoader — image loader de Cornerstone para modalidades grandes en
 * móvil (DX/CR/MG/RX/DR) usando WADO-RS `rendered`.
 *
 * En vez de descargar el DICOM 16-bit a resolución completa y convertirlo en el
 * cliente (frágil: texturas 16-bit no fiables en GPU móvil, OOM, límite de
 * MAX_TEXTURE_SIZE), pedimos al PACS la imagen ya **renderizada**: un JPEG 8-bit
 * ventaneado (VOI LUT por defecto) y reescalado al tamaño objetivo.
 *
 * El JPEG llega RGB pero su contenido es GRAYSCALE (DX/CR/MG/RX/DR; R=G=B). Lo
 * construimos como imagen **MONOCHROME2 de 1 componente** (canal R) en vez de color
 * RGB: el camino grayscale de Cornerstone/vtk es el mismo que usan CT/MR (estable),
 * mientras que el camino de imagen COLOR de vtk CRASHEABA en GPUs móviles
 * (`isAttributeUsed` null → negro). Además usa 1/3 de la memoria de textura.
 *
 * Esquema de imageId: `novarendered:<url-rendered>`. La URL ya lleva
 * `?viewport=W,H&quality=...`. Un metaData provider responde imagePixelModule
 * (MONOCHROME2 8-bit), voiLutModule (0-255) y generalSeriesModule (modality) para
 * este esquema, requeridos por Cornerstone (buildMetadata) al construir el actor.
 */

const SCHEME = 'novarendered';

/** Parseo numérico seguro (acepta arrays [row,col] y strings de DICOM). */
function toNum(v: unknown): number | undefined {
  if (Array.isArray(v)) {
    return toNum(v[0]);
  }
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Tope del lado mayor del render. Potencia de dos (mejor compatibilidad de texturas
// en GPUs móviles) y conservador en memoria: una textura color de 2048² = ~16 MB de
// GPU (vs ~26 MB a 2560²). Texturas más grandes hacen fallar el shader de vtk.js en
// algunos GPUs móviles (Cannot read properties of null 'isAttributeUsed') → negro.
const MAX_RENDER_SIZE = 2048;

type RenderedInfo = {
  modality?: string;
  // Dimensiones y pixel spacing del DICOM ORIGINAL (para escalar la medición).
  origRows?: number;
  origColumns?: number;
  origRowSpacing?: number;
  origColSpacing?: number;
  // Dimensiones y spacing del RENDERED (calculados al cargar; los usa el provider
  // imagePlaneModule para que las mediciones den los mismos mm que en desktop).
  rows?: number;
  columns?: number;
  rowPixelSpacing?: number;
  columnPixelSpacing?: number;
};
const infoMap = new Map<string, RenderedInfo>();

let _registered = false;
let _getAuthHeader: () => Record<string, string> | void = () => undefined;

// ── Limitador de concurrencia + reintento para /rendered ───────────────────────
// dcm4chee renderiza on-the-fly (decodifica DICOM + VOI + reescala + JPEG): es
// caro en CPU/memoria y se SATURA bajo concurrencia → devuelve HTTP 500. Verificado
// contra el PACS: 16 peticiones /rendered en paralelo → ~50% 500; 12 a 2560px →
// ~75% 500. La tira de miniaturas dispara un /rendered por serie a la vez, así que
// sin control la mayoría falla y cae a descargar el DICOM completo.
//
// Solución: un semáforo global (todas las peticiones /rendered pasan por aquí) que
// limita la concurrencia, y reintento ante 5xx/red (el 500 es transitorio).
const MAX_CONCURRENT_RENDERED = 2;
let _activeRendered = 0;
const _renderedQueue: Array<() => void> = [];

function acquireRenderedSlot(): Promise<void> {
  if (_activeRendered < MAX_CONCURRENT_RENDERED) {
    _activeRendered++;
    return Promise.resolve();
  }
  return new Promise(resolve => _renderedQueue.push(resolve));
}

function releaseRenderedSlot(): void {
  const next = _renderedQueue.shift();
  if (next) {
    next(); // cede el slot al siguiente en cola (no decrementa: se reutiliza)
  } else {
    _activeRendered--;
  }
}

/**
 * fetch a una URL `/rendered` con (1) límite de concurrencia global y (2) reintento
 * ante 5xx o error de red (saturación transitoria del render de dcm4chee). Mantiene
 * el slot durante el backoff → throttling natural. Lanza si agota los reintentos.
 */
async function fetchRenderedWithLimit(
  url: string,
  headers: Record<string, string>,
  retries = 2
): Promise<Response> {
  await acquireRenderedSlot();
  try {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { headers, credentials: 'include' });
        if (res.ok) return res;
        // 4xx → error real del cliente, no reintentar. 5xx → transitorio.
        if (res.status < 500) return res;
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (e) {
        lastErr = e; // error de red
      }
      if (attempt < retries) {
        // backoff con jitter para no reintentar todos a la vez
        const delay = 300 * (attempt + 1) + Math.random() * 250;
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastErr ?? new Error('fetchRenderedWithLimit: agotados los reintentos');
  } finally {
    releaseRenderedSlot();
  }
}

/** Tamaño máximo de textura WebGL del dispositivo (cacheado). */
let _cachedMaxTexture: number | null = null;
function getDeviceMaxTextureSize(): number {
  if (_cachedMaxTexture !== null) return _cachedMaxTexture;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    _cachedMaxTexture = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;
  } catch {
    _cachedMaxTexture = 4096;
  }
  return _cachedMaxTexture;
}

// ── Penalti de tamaño por viewport (Plan B: recuperación ante fallo de render) ──
// Si vtk.js/WebGL falla al renderizar (textura demasiado grande para la GPU del
// dispositivo → shader null → negro), se reduce el tamaño objetivo de ESE viewport
// y se recarga. Cada fallo divide el tamaño por 1.5 (2048→1365→910→607…) hasta que
// la textura entra. El penalti persiste dentro del mismo displaySet (estable, no
// re-falla) y se resetea al cambiar de displaySet (contenido nuevo → tamaño completo).
const _renderPenalty = new Map<string, number>();

/** Aumenta el penalti del viewport (lo llama la recuperación tras un fallo). */
export function reduceRenderSize(viewportId: string): number {
  const n = (_renderPenalty.get(viewportId) ?? 0) + 1;
  _renderPenalty.set(viewportId, n);
  return n;
}

/** Limpia el penalti del viewport (tras un render exitoso o al desmontar). */
export function resetRenderSize(viewportId: string): void {
  _renderPenalty.delete(viewportId);
}

function penaltyFactor(viewportId?: string): number {
  const n = viewportId ? (_renderPenalty.get(viewportId) ?? 0) : 0;
  return Math.pow(1.5, n);
}

/**
 * Tamaño objetivo del render. Se basa en el tamaño CSS del propio viewport × dpr
 * (resolución 1:1, sin sobre-muestreo) en vez de la pantalla completa, y se acota
 * por la GPU del dispositivo y `MAX_RENDER_SIZE`. Aplica el penalti del viewport si
 * hubo fallos previos de render (Plan B).
 *
 * @param cssLongSide lado mayor (CSS px) del elemento del viewport; si falta, usa la pantalla
 * @param viewportId  para aplicar el penalti acumulado de ese viewport
 */
function getTargetRenderSize(cssLongSide?: number, viewportId?: string): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const basis =
    cssLongSide && cssLongSide > 0
      ? cssLongSide * dpr
      : typeof window !== 'undefined' && window.screen
        ? Math.max(window.screen.width, window.screen.height) * dpr
        : 2048;
  let size = Math.min(getDeviceMaxTextureSize(), MAX_RENDER_SIZE, Math.round(basis));
  size = Math.round(size / penaltyFactor(viewportId));
  return Math.max(256, size);
}

/**
 * Loader de Cornerstone para el esquema `novarendered:`. Descarga el JPEG
 * renderizado, lo decodifica a RGB y construye un objeto imagen color válido.
 */
function loadRenderedImage(imageId: string) {
  const url = imageId.substring(SCHEME.length + 1);

  const promise = (async () => {
    const headers: Record<string, string> = { Accept: 'image/jpeg' };
    const auth = _getAuthHeader();
    if (auth) Object.assign(headers, auth);

    // Limitador + reintento: evita el 500 de dcm4chee bajo concurrencia.
    const res = await fetchRenderedWithLimit(url, headers);
    if (!res.ok) {
      throw new Error(`[renderedImageLoader] HTTP ${res.status} al pedir ${url}`);
    }
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const width = bitmap.width;
    const height = bitmap.height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      throw new Error('[renderedImageLoader] no 2D context');
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const rgba = ctx.getImageData(0, 0, width, height).data; // Uint8ClampedArray (4·w·h)
    // El rendered de DX/CR/MG/RX/DR es GRAYSCALE ya ventaneado (R=G=B). Lo tratamos
    // como imagen MONOCHROME2 de 1 componente (canal R) en vez de color RGB: el
    // camino grayscale de Cornerstone/vtk es el mismo que usan CT/MR (probado y
    // estable). El camino de imagen COLOR de vtk crasheaba en GPUs móviles
    // (`isAttributeUsed` null → negro). Además usa 1/3 de la memoria de textura.
    const gray = new Uint8Array(width * height);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
      gray[j] = rgba[i]; // canal R (= G = B en grayscale)
    }

    const voxelManager = (csUtils as any).VoxelManager.createImageVoxelManager({
      width,
      height,
      scalarData: gray,
      numberOfComponents: 1,
      id: imageId,
    });

    const info = infoMap.get(imageId) ?? {};
    info.rows = height;
    info.columns = width;
    // El PACS reescala el frame ENTERO a `width×height` preservando el aspecto, así
    // que el tamaño físico se conserva: origColumns·origColSpacing == width·newColSpacing.
    // → newSpacing = origSpacing · (origDim / renderedDim). Sin esto, medir sobre el
    //   rendered (más pequeño que el DICOM) da menos mm que en desktop.
    info.columnPixelSpacing =
      info.origColSpacing && info.origColumns
        ? (info.origColSpacing * info.origColumns) / width
        : undefined;
    info.rowPixelSpacing =
      info.origRowSpacing && info.origRows
        ? (info.origRowSpacing * info.origRows) / height
        : undefined;
    infoMap.set(imageId, info);

    const image: any = {
      imageId,
      dataType: 'Uint8Array',
      color: false,
      numberOfComponents: 1,
      columns: width,
      rows: height,
      width,
      height,
      minPixelValue: 0,
      maxPixelValue: 255,
      slope: 1,
      intercept: 0,
      // El servidor ya aplicó la VOI; mostramos el rango completo 0-255 tal cual.
      windowCenter: 128,
      windowWidth: 256,
      // El servidor ya aplicó la polaridad (MONOCHROME1 invertido) → no invertir aquí.
      invert: false,
      sizeInBytes: gray.length,
      getPixelData: () => gray,
      voxelManager,
      // CRÍTICO para móvil (CPU rendering forzado): el ZoomTool setea `parallelScale`
      // y StackViewport.setCameraCPU lo convierte a la escala del CPU con
      // `scale = (clientHeight * rowPixelSpacing * 0.5) / parallelScale`. Debe ser
      // finito y > 0 o el zoom se congela (NaN). Usamos el spacing REAL escalado (para
      // que las mediciones den mm correctos); si el original no tiene spacing, 1.
      columnPixelSpacing: info.columnPixelSpacing ?? 1,
      rowPixelSpacing: info.rowPixelSpacing ?? 1,
    };
    return image;
  })();

  return { promise };
}

/**
 * Registra (idempotente) el loader y el metaData provider del esquema. Captura el
 * getter de cabeceras de auth del servicio para incluirlas en cada fetch.
 */
export function registerRenderedImageLoader({ servicesManager }: { servicesManager: any }): void {
  const { userAuthenticationService } = servicesManager?.services ?? {};
  _getAuthHeader = () => userAuthenticationService?.getAuthorizationHeader?.();

  if (_registered) return;
  _registered = true;

  imageLoader.registerImageLoader(SCHEME, loadRenderedImage as any);

  // Prioridad alta para responder ANTES que los providers por defecto. Cornerstone
  // (buildMetadata) desestructura imagePixelModule y generalSeriesModule, así que
  // deben devolver objeto (no undefined) para los imageId de este esquema.
  metaData.addProvider((type: string, imageId: string) => {
    if (typeof imageId !== 'string' || !imageId.startsWith(`${SCHEME}:`)) {
      return undefined;
    }
    if (type === 'imagePixelModule') {
      // Grayscale 8-bit (MONOCHROME2): el rendered ya viene ventaneado y con la
      // polaridad aplicada por el servidor → lo tratamos como gris de 1 componente.
      return {
        bitsAllocated: 8,
        bitsStored: 8,
        highBit: 7,
        samplesPerPixel: 1,
        pixelRepresentation: 0,
        photometricInterpretation: 'MONOCHROME2',
      };
    }
    if (type === 'voiLutModule') {
      // Rango completo 0-255 (el servidor ya aplicó la VOI).
      return { windowCenter: [128], windowWidth: [256] };
    }
    if (type === 'generalSeriesModule') {
      return { modality: infoMap.get(imageId)?.modality };
    }
    if (type === 'imagePlaneModule') {
      // Spacing REAL escalado del rendered → las mediciones de longitud dan los
      // mismos mm que en desktop. `getImageDataMetadata` usa
      // `imagePlaneModule.columnPixelSpacing || image.columnPixelSpacing` y como el
      // default de cornerstone es 1 (truthy), ESTE provider es imprescindible.
      // Las cosinas/posición las rellena `getImagePlaneModule` con identidad; la
      // longitud es invariante a la orientación, así que no hace falta darlas.
      const info = infoMap.get(imageId) ?? {};
      return {
        rows: info.rows,
        columns: info.columns,
        rowPixelSpacing: info.rowPixelSpacing,
        columnPixelSpacing: info.columnPixelSpacing,
        pixelSpacing:
          info.rowPixelSpacing != null && info.columnPixelSpacing != null
            ? [info.rowPixelSpacing, info.columnPixelSpacing]
            : undefined,
      };
    }
    return undefined;
  }, 10000);
}

/** Modalidades grandes que se sirven vía `rendered` en móvil. */
export const RENDERED_MODALITIES = new Set(['DX', 'CR', 'MG', 'RX', 'DR']);

/**
 * Deriva la URL WADO-RS `rendered` (sin esquema) a partir de un imageId `wadors:`
 * por transformación de string, sin depender de metadatos de la instancia. El
 * imageId `wadors:` ya contiene `.../instances/{sop}/frames/{n}`. Devuelve null si
 * el formato no es WADO-RS por frames.
 *
 * @param original imageId original (p. ej. `wadors:.../frames/1`)
 * @param size lado del viewport pedido al servidor (px)
 * @param quality calidad JPEG 1-100
 */
function renderedUrlFromImageId(original: string, size: number, quality = 85): string | null {
  if (typeof original !== 'string') {
    return null;
  }
  // wadors:<wadoRoot>/studies/.../instances/{sop}/frames/{n}  (wadoRoot puede ser
  // absoluto o relativo). Capturamos hasta el número de frame inclusive.
  const url = original.replace(/^wadors:/, '');
  const m = url.match(/^(.*\/instances\/[^/?#]+\/frames\/\d+)/);
  if (!m) {
    return null;
  }
  return `${m[1]}/rendered?viewport=${size},${size}&quality=${quality}`;
}

/**
 * Construye los imageId `novarendered:` a partir de los imageId WADO-RS originales
 * de una modalidad grande. Se derivan por TRANSFORMACIÓN DE STRING del imageId
 * `wadors:` (que ya contiene .../instances/{sop}/frames/{n}) → `/rendered`, sin
 * depender de los metadatos de la instancia (cuyos UIDs pueden no estar presentes
 * a nivel de instancia). Devuelve null si la modalidad no aplica o el formato del
 * imageId no es WADO-RS por frames (→ se cae al path normal).
 *
 * @param imageIds imageIds originales del displaySet (p. ej. `wadors:.../frames/1`)
 * @param modality Modality del displaySet
 * @param opts.cssLongSide lado mayor (CSS px) del elemento del viewport → render 1:1
 * @param opts.viewportId  para aplicar el penalti de tamaño si hubo fallos de render
 */
export function buildRenderedImageIds(
  imageIds: string[],
  modality?: string,
  opts?: { cssLongSide?: number; viewportId?: string }
): string[] | null {
  if (!modality || !RENDERED_MODALITIES.has(modality)) {
    return null;
  }
  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    return null;
  }

  const size = getTargetRenderSize(opts?.cssLongSide, opts?.viewportId);
  const out: string[] = [];
  for (const original of imageIds) {
    const renderedUrl = renderedUrlFromImageId(original, size);
    if (!renderedUrl) {
      return null; // formato inesperado (p. ej. wadouri) → fallback al path normal
    }
    const imageId = `${SCHEME}:${renderedUrl}`;

    // Dimensiones y pixel spacing del DICOM ORIGINAL, leídos del MISMO provider que
    // usa desktop (`imagePlaneModule`) → mediciones consistentes. Se guardan para
    // escalar el spacing cuando el rendered llegue reescalado (ver loadRenderedImage).
    const plane: any = metaData.get('imagePlaneModule', original) || {};
    const pixel: any = metaData.get('imagePixelModule', original) || {};
    infoMap.set(imageId, {
      modality,
      origColumns: toNum(plane.columns ?? pixel.columns),
      origRows: toNum(plane.rows ?? pixel.rows),
      origColSpacing: toNum(plane.columnPixelSpacing),
      origRowSpacing: toNum(plane.rowPixelSpacing),
    });
    out.push(imageId);
  }
  return out;
}

/**
 * Devuelve una URL de objeto (blob) con el JPEG `rendered` de tamaño reducido para
 * usar como **miniatura** de una modalidad grande (DX/CR/MG/RX/DR), SIN descargar
 * el frame completo ni pasar por Cornerstone. Reemplaza la generación de miniatura
 * que hacía `loadAndCacheImage(wadors:.../frames/1)` (decenas de MB en una MG).
 *
 * El llamador debe usar el string devuelto directamente como `<img src>` y, cuando
 * ya no lo necesite, liberar con `URL.revokeObjectURL`. Devuelve null si la
 * modalidad no aplica, el imageId no es WADO-RS, o la petición falla (→ el llamador
 * cae a su ruta normal de Cornerstone).
 *
 * @param imageId imageId original (`wadors:.../frames/1`)
 * @param modality Modality del displaySet
 * @param size lado de la miniatura en px (por defecto 512)
 */
export async function fetchRenderedThumbnailSrc(
  imageId: string,
  modality: string | undefined,
  size = 512
): Promise<string | null> {
  if (!modality || !RENDERED_MODALITIES.has(modality)) {
    return null;
  }
  const url = renderedUrlFromImageId(imageId, size);
  if (!url) {
    return null;
  }
  try {
    const headers: Record<string, string> = { Accept: 'image/jpeg' };
    const auth = _getAuthHeader();
    if (auth) {
      Object.assign(headers, auth);
    }
    // Limitador + reintento: el 500 de dcm4chee bajo concurrencia hacía que la
    // miniatura cayera a descargar el DICOM completo. Con esto se reintenta el
    // 500 transitorio y se acota cuántos /rendered van a la vez.
    const res = await fetchRenderedWithLimit(url, headers);
    if (!res.ok) {
      return null;
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
