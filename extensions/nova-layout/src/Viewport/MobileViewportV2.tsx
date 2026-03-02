import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Enums, eventTarget, cache as csCache, getRenderingEngine, metaData } from '@cornerstonejs/core';
import { useViewportRef, useSystem } from '@ohif/core';
import { setEnabledElement } from '@ohif/extension-cornerstone';

import ViewportErrorBoundary from './ViewportErrorBoundary';
import './MobileViewportV2.css';

const LOG_PREFIX = '[MobileViewportV2]';
const RESIZE_DEBOUNCE_MS = 200;

// Modalities known to produce large images that can OOM mobile devices
const LARGE_IMAGE_MODALITIES = new Set(['DX', 'CR', 'MG', 'RX', 'DR']);

// Cache WebGL max texture size once per session
let cachedMaxTextureSize: number | null = null;

// ── Metadata override provider ─────────────────────────────────────────────
// Cornerstone3D reads bitsAllocated from metaData.get('imagePixelModule', imageId)
// (NOT from the image object) to determine the VTK scalar type:
//   bitsAllocated=16 → UNSIGNED_SHORT → R16UI texture → black on mobile WebGL
//   bitsAllocated=8  → UNSIGNED_CHAR  → R8 texture    → renders correctly
// After we convert pixel data to Uint8Array, we must override the metadata
// provider so Cornerstone creates an R8 texture instead of R16UI.
const imagePixelModuleOverrides = new Map<string, Record<string, unknown>>();
let _metadataProviderRegistered = false;

function ensureMetadataOverrideProvider() {
  if (_metadataProviderRegistered) return;
  _metadataProviderRegistered = true;
  // Priority 10000 → checked before Cornerstone's default providers (priority ~0)
  metaData.addProvider((type: string, imageId: string) => {
    if (type === 'imagePixelModule') {
      const override = imagePixelModuleOverrides.get(imageId);
      if (override) return override;
    }
    return undefined;
  }, 10000);
}

function getMaxTextureSize(): number {
  if (cachedMaxTextureSize !== null) return cachedMaxTextureSize;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      cachedMaxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      return cachedMaxTextureSize;
    }
  } catch (_e) {
    // ignore
  }
  cachedMaxTextureSize = 4096;
  return cachedMaxTextureSize;
}

/**
 * Detecta si algún displaySet contiene imágenes mayores al límite WebGL del dispositivo.
 * Las series MG y RX son las principales afectadas en móviles.
 */
function detectLargeImages(displaySets: AppTypes.DisplaySet[]): boolean {
  const maxSize = getMaxTextureSize();
  return displaySets.some((ds: any) => {
    // Modality check (fast path)
    if (LARGE_IMAGE_MODALITIES.has(ds?.Modality)) return true;
    // Dimension check (needs instance metadata)
    if (!ds?.instances?.length) return false;
    const first = ds.instances[0];
    const rows = first?.Rows || first?.metadata?.Rows || 0;
    const cols = first?.Columns || first?.metadata?.Columns || 0;
    return rows > maxSize || cols > maxSize;
  });
}

/**
 * Downsamples a Cornerstone image (in-place cache mutation) when its dimensions
 * exceed the device's WebGL max texture size.
 *
 * Called BEFORE the rendering engine tries to upload the texture. This prevents
 * the silent WebGL failure that occurs when a 5000×4000 image is loaded on a
 * device whose max texture is 4096px.
 *
 * Uses OffscreenCanvas for GPU-accelerated downsampling when available.
 * Falls back to null (no downsampling) on browsers without OffscreenCanvas.
 */
async function downsampleCachedImage(imageId: string): Promise<boolean> {
  const maxDim = getMaxTextureSize();
  const imageLoadObj = csCache.getImageLoadObject(imageId);
  if (!imageLoadObj) {
    console.log(`${LOG_PREFIX} ⏭️ downsample SKIP (no en caché): ...${imageId.slice(-30)}`);
    return false;
  }

  let image: any;
  try {
    image = await imageLoadObj.promise;
  } catch (_e) {
    console.log(`${LOG_PREFIX} ⏭️ downsample SKIP (promise rechazada): ...${imageId.slice(-30)}`);
    return false;
  }

  const { width, height } = image;
  if (!width || !height || (width <= maxDim && height <= maxDim)) {
    console.log(
      `${LOG_PREFIX} ⏭️ downsample SKIP (${width ?? '?'}×${height ?? '?'} ≤ maxDim=${maxDim}):` +
        ` ...${imageId.slice(-30)}`
    );
    return false;
  }

  const scale = Math.min(maxDim / width, maxDim / height);
  const newWidth = Math.max(1, Math.floor(width * scale));
  const newHeight = Math.max(1, Math.floor(height * scale));
  console.log(
    `${LOG_PREFIX} 📐 Downsample plan: ${width}×${height} → ${newWidth}×${newHeight}` +
      ` scale=${scale.toFixed(3)}` +
      ` AR_orig=${(width / height).toFixed(3)} AR_new=${(newWidth / newHeight).toFixed(3)}` +
      ` tipo=${(image.getPixelData?.() ?? image.pixelData)?.constructor?.name ?? '?'}`
  );

  const t0 = performance.now();
  try {
    const pixelData: ArrayLike<number> = image.getPixelData?.() ?? image.pixelData;
    if (!pixelData) return false;

    // Determine normalization window (handles 8-bit and 16-bit inputs)
    const is16bit = pixelData instanceof Int16Array || pixelData instanceof Uint16Array;
    let wc = is16bit
      ? Array.isArray(image.windowCenter)
        ? image.windowCenter[0]
        : image.windowCenter
      : undefined;
    let ww = is16bit
      ? Array.isArray(image.windowWidth)
        ? image.windowWidth[0]
        : image.windowWidth
      : undefined;

    let min: number, max: number;
    if (wc !== undefined && ww !== undefined && ww > 0) {
      min = wc - ww / 2;
      max = wc + ww / 2;
    } else {
      min = is16bit ? (image.minPixelValue ?? 0) : 0;
      max = is16bit ? (image.maxPixelValue ?? 65535) : 255;
    }
    const range = max - min || 1;

    // ── Pure-JS bilinear downsampling ─────────────────────────────────────
    // Avoids OffscreenCanvas tile-boundary artifacts (stripe artifacts in MG)
    // that occur when mobile browsers process very large images in internal tiles.
    const scaleX = width / newWidth;
    const scaleY = height / newHeight;
    const newPixelData = new Uint8Array(newWidth * newHeight);

    for (let dy = 0; dy < newHeight; dy++) {
      const srcYf = (dy + 0.5) * scaleY - 0.5;
      const y0 = Math.max(0, Math.floor(srcYf));
      const y1 = Math.min(y0 + 1, height - 1);
      const fy = srcYf - y0;
      const row0 = y0 * width;
      const row1 = y1 * width;
      const dstRow = dy * newWidth;
      for (let dx = 0; dx < newWidth; dx++) {
        const srcXf = (dx + 0.5) * scaleX - 0.5;
        const x0 = Math.max(0, Math.floor(srcXf));
        const x1 = Math.min(x0 + 1, width - 1);
        const fx = srcXf - x0;
        const p00 = pixelData[row0 + x0];
        const p10 = pixelData[row0 + x1];
        const p01 = pixelData[row1 + x0];
        const p11 = pixelData[row1 + x1];
        const interpolated = p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
        let v = Math.round(((interpolated - min) / range) * 255);
        if (v < 0) v = 0;
        else if (v > 255) v = 255;
        newPixelData[dstRow + dx] = v;
      }
    }

    // ── Patch the cached image object ────────────────────────────────────
    image.width = newWidth;
    image.height = newHeight;
    image.rows = newHeight;
    image.columns = newWidth;
    image.sizeInBytes = newWidth * newHeight;
    image.minPixelValue = 0;
    image.maxPixelValue = 255;
    image.getPixelData = () => newPixelData;
    image.pixelData = newPixelData;
    // Mismo parche que convertTo8bitInCache: voxelManager.getScalarData debe
    // retornar Uint8Array para forzar slow path en _updateActorToDisplayImageId.
    if (image.voxelManager && typeof image.voxelManager.getScalarData === 'function') {
      image.voxelManager.getScalarData = () => newPixelData;
    }
    // Patch window metadata to 8-bit range so Cornerstone's _getInitialVOIRange
    // uses correct values after setStack re-reads this image from cache.
    if (image.windowWidth !== undefined) image.windowWidth = 256;
    if (image.windowCenter !== undefined) image.windowCenter = 128;
    // CRÍTICO: igual que convertTo8bitInCache — parchear BitsAllocated para que
    // Cornerstone cree textura UNSIGNED_CHAR (R8) en lugar de UNSIGNED_SHORT (R16UI).
    image.BitsAllocated = 8;
    image.BitsStored = 8;
    image.HighBit = 7;
    // Cornerstone lee bitsAllocated del metadata provider, NO del objeto imagen.
    // Sobrescribir el provider para que VTK cree textura R8 (no R16UI).
    const origMetaDs = metaData.get('imagePixelModule', imageId) ?? {};
    imagePixelModuleOverrides.set(imageId, {
      ...origMetaDs,
      bitsAllocated: 8,
      bitsStored: 8,
      highBit: 7,
      pixelRepresentation: 0,
    });
    ensureMetadataOverrideProvider();
    console.log(`${LOG_PREFIX} 🔬 Metadata override (downsample) registrado: bitsAllocated 16→8 ...${imageId.slice(-30)}`);

    console.warn(
      `${LOG_PREFIX} 🔍 Downsample completado: ${width}×${height} → ${newWidth}×${newHeight}` +
        ` (scale=${scale.toFixed(3)}, ${(performance.now() - t0).toFixed(0)}ms)`
    );
    return true;
  } catch (err) {
    console.warn(`${LOG_PREFIX} ⚠️ No se pudo downsamplear ${imageId}:`, err);
    return false;
  }
}

/**
 * Convierte pixel data de 16-bit (Uint16Array/Int16Array) a 8-bit (Uint8Array)
 * mutando la imagen en el caché de Cornerstone.
 *
 * PROBLEMA: Muchos navegadores móviles no soportan correctamente las texturas
 * WebGL de 16-bit (R16UI / R16F). Cornerstone3D sube la imagen como textura Uint16,
 * pero el dispositivo la renderiza con todos los píxeles en negro aunque el voiRange
 * sea correcto (confirmado: R=0 G=0 B=0 A=255 en canvas sampling).
 *
 * FIX: Convertir el pixel data a Uint8Array usando el WindowCenter/WindowWidth del DICOM
 * como ventana de conversión, ANTES de que Cornerstone suba la textura a la GPU.
 * Después parchear los metadatos (windowCenter=128, windowWidth=256) para que
 * Cornerstone use voiRange=[0,256] → correcto para datos 8-bit.
 *
 * Sacrifica precisión (256 vs 16384 niveles de gris) pero garantiza visualización
 * correcta en dispositivos con soporte WebGL limitado para 16-bit.
 *
 * @returns true si la conversión fue aplicada (requiere setStack para recargar la textura).
 */
async function convertTo8bitInCache(imageId: string): Promise<boolean> {
  const loadObj = csCache.getImageLoadObject(imageId);
  if (!loadObj) return false;

  let img: any;
  try {
    img = await loadObj.promise;
  } catch {
    return false;
  }

  const pixelData = img.getPixelData?.() ?? img.pixelData;
  if (!pixelData) {
    console.log(`${LOG_PREFIX} 🔄 convertTo8bit SKIP (sin pixelData): ...${imageId.slice(-30)}`);
    return false;
  }

  // Solo convertir si realmente es 16-bit (Uint16Array o Int16Array)
  const is16bit = pixelData instanceof Uint16Array || pixelData instanceof Int16Array;
  console.log(
    `${LOG_PREFIX} 🔄 convertTo8bit ENTER: tipo=${pixelData.constructor.name}` +
      ` is16bit=${is16bit}  ${img.width}×${img.height}  wc=${img.windowCenter} ww=${img.windowWidth}` +
      `  minPx=${img.minPixelValue} maxPx=${img.maxPixelValue}` +
      `  ...${imageId.slice(-30)}`
  );
  if (!is16bit) {
    console.log(
      `${LOG_PREFIX} 🔄 convertTo8bit SKIP (ya es 8-bit, tipo=${pixelData.constructor.name}):` +
        ` ...${imageId.slice(-30)}`
    );
    return false; // Ya es 8-bit (convertido previamente o por downsample)
  }

  // Determinar ventana de conversión: usar wc/ww del DICOM para conservar la
  // intención diagnóstica del radiólogo que adquirió la imagen.
  let wc = Array.isArray(img.windowCenter) ? img.windowCenter[0] : img.windowCenter;
  let ww = Array.isArray(img.windowWidth) ? img.windowWidth[0] : img.windowWidth;

  if (wc == null || ww == null || ww <= 0) {
    // Fallback: rango DICOM minPixelValue/maxPixelValue
    const dicomMin = img.minPixelValue ?? 0;
    const dicomMax = img.maxPixelValue ?? 65535;
    wc = (dicomMin + dicomMax) / 2;
    ww = dicomMax - dicomMin || 65535;
  }

  const lo = wc - ww / 2;
  const hi = wc + ww / 2;
  const range = hi - lo || 1;

  // Conversión lineal: [lo, hi] → [0, 255] con clamping
  const uint8 = new Uint8Array(pixelData.length);
  for (let i = 0; i < pixelData.length; i++) {
    let v = Math.round(((pixelData[i] - lo) / range) * 255);
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    uint8[i] = v;
  }

  // Parchear la imagen cacheada in-place: WebGL leerá Uint8Array → 8-bit texture
  img.getPixelData = () => uint8;
  img.pixelData = uint8;
  // CRÍTICO: Cornerstone3D usa image.voxelManager.getScalarData() para:
  //   1) isDataTypeMatching check: 'Uint16Array' === voxelManager.getScalarData().constructor.name
  //      Si voxelManager retorna Uint16Array → isDataTypeMatching=true → fast path
  //      (solo copia datos en actor existente sin recrear VTK) → textura sigue R16UI → negro.
  //   2) pixelArray en _createVTKImageData (slow path, cuando isDataTypeMatching=false)
  //   Con voxelManager retornando Uint8Array → isDataTypeMatching=false → slow path
  //   → VTK actor recreado con UNSIGNED_CHAR (R8 texture) → imagen visible en mobile.
  //   Cornerstone mismo usa esta técnica en StackViewport línea ~1312.
  if (img.voxelManager && typeof img.voxelManager.getScalarData === 'function') {
    img.voxelManager.getScalarData = () => uint8;
    console.log(`${LOG_PREFIX} 🔬 voxelManager.getScalarData patched → Uint8Array (forzará slow path VTK)`);
  } else {
    console.warn(`${LOG_PREFIX} ⚠️ voxelManager no disponible — isDataTypeMatching tomará fast path con Uint16Array`);
  }
  img.minPixelValue = 0;
  img.maxPixelValue = 255;
  img.sizeInBytes = pixelData.length; // 1 byte/pixel ahora
  // Cornerstone leerá windowCenter/windowWidth en _getInitialVOIRange
  // y establecerá voiRange=[0,256] → correcto para 8-bit
  img.windowCenter = 128;
  img.windowWidth = 256;
  // CRÍTICO: Cornerstone3D usa BitsAllocated/BitsStored para determinar el tipo VTK
  // (UNSIGNED_CHAR vs UNSIGNED_SHORT). Si quedan en 16, crea textura R16UI aunque
  // getPixelData() retorne Uint8Array → imagen negra en GPU.
  img.BitsAllocated = 8;
  img.BitsStored = 8;
  img.HighBit = 7;
  // Cornerstone lee bitsAllocated del metadata PROVIDER (metaData.get), NO del
  // objeto img. Registrar override de alta prioridad para que setStack cree
  // textura R8 (UNSIGNED_CHAR) en lugar de R16UI (UNSIGNED_SHORT).
  const origMeta = metaData.get('imagePixelModule', imageId) ?? {};
  imagePixelModuleOverrides.set(imageId, {
    ...origMeta,
    bitsAllocated: 8,
    bitsStored: 8,
    highBit: 7,
    pixelRepresentation: 0,
  });
  ensureMetadataOverrideProvider();
  console.log(`${LOG_PREFIX} 🔬 Metadata override registrado: bitsAllocated 16→8 ...${imageId.slice(-30)}`);

  // Estadísticas del uint8 resultante (muestreo rápido)
  let u8min = 255, u8max = 0, u8sum = 0;
  const u8step = Math.max(1, Math.floor(uint8.length / 5000));
  for (let i = 0; i < uint8.length; i += u8step) {
    const v = uint8[i];
    if (v < u8min) u8min = v;
    if (v > u8max) u8max = v;
    u8sum += v;
  }
  const u8mean = (u8sum / (uint8.length / u8step)).toFixed(1);
  console.warn(
    `${LOG_PREFIX} 🔄 16-bit→8-bit OK (mobile WebGL compat):` +
      ` ${img.width}×${img.height}  wc=${wc.toFixed(0)} ww=${ww.toFixed(0)}` +
      ` ventana=[${lo.toFixed(0)}, ${hi.toFixed(0)}]` +
      ` → u8 range=[${u8min},${u8max}] media=${u8mean}` +
      ` (si range=[0,0] → todos los píxeles fuera de ventana → imagen negra)`
  );
  return true;
}

/**
 * Compara props para decidir si el componente necesita re-renderizarse.
 *
 * CRÍTICO: ViewportGrid.tsx recrea el array `displaySets` con .map() en cada
 * render (nueva referencia, mismo contenido). Sin areEqual, los useMemo/useEffect
 * de este componente detectan "cambio" en cada render de ViewportGrid, cancelan
 * la carga en progreso y la reinician → loop de parpadeo infinito.
 *
 * Misma lógica que OHIFCornerstoneViewport.areEqual.
 */
function areEqual(prevProps: any, nextProps: any): boolean {
  if (nextProps.needsRerendering) return false;
  if (prevProps.displaySets.length !== nextProps.displaySets.length) return false;
  if (prevProps.viewportOptions?.orientation !== nextProps.viewportOptions?.orientation)
    return false;
  if (prevProps.viewportOptions?.toolGroupId !== nextProps.viewportOptions?.toolGroupId)
    return false;
  if (
    nextProps.viewportOptions?.viewportType &&
    prevProps.viewportOptions?.viewportType !== nextProps.viewportOptions?.viewportType
  )
    return false;
  if (nextProps.viewportOptions?.needsRerendering) return false;

  for (let i = 0; i < prevProps.displaySets.length; i++) {
    const prevDS = prevProps.displaySets[i];
    const foundDS = nextProps.displaySets.find(
      (ds: any) => ds.displaySetInstanceUID === prevDS.displaySetInstanceUID
    );
    if (!foundDS) return false;
    if (foundDS.images?.length !== prevDS.images?.length) return false;
    if (foundDS.images?.length) {
      for (let j = 0; j < foundDS.images.length; j++) {
        if (foundDS.images[j].imageId !== prevDS.images[j].imageId) return false;
      }
    }
  }

  return true;
}

type ViewportStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * MobileViewportV2 – Viewport optimizado para dispositivos móviles.
 *
 * Problemas que resuelve sobre OHIFCornerstoneViewport / MobileViewport v1:
 *
 * 1. Loop de parpadeo: React.memo + areEqual previene re-renders espurios causados
 *    por el .map() de ViewportGrid (nueva referencia de array, mismo contenido).
 *
 * 2. Race condition async: AbortController cancela operaciones en vuelo al desmontar
 *    el componente o cuando el displaySet cambia realmente.
 *
 * 3. Canvas tamaño 0: ResizeObserver espera dimensiones > 0 antes de inicializar
 *    Cornerstone, evitando el "WebGL context broken" en móviles lentos.
 *
 * 4. Sincronizadores: omitidos completamente (fuente principal de errores de estado).
 *
 * 5. Tipo de viewport: forzado a 'stack' salvo volumes dinámicos.
 *
 * 6. Refs para valores actuales: evita closures obsoletos en callbacks async
 *    sin necesidad de re-crear las funciones (useCallback estable).
 *
 * 7. Cleanup correcto: storePresentation → removeFromToolGroup →
 *    clearSegmentations → disableElement → unregister.
 */
const MobileViewportV2Impl = React.memo(function MobileViewportV2(props: any) {
  const { servicesManager } = useSystem();

  // viewportId viene de viewportOptions.viewportId (igual que OHIFCornerstoneViewport)
  const { displaySets, dataSource, viewportOptions, displaySetOptions, initialImageIndex } = props;
  const viewportId: string = viewportOptions?.viewportId || props.viewportId;

  const elementRef = useRef<HTMLDivElement>(null);
  const viewportRef = useViewportRef(viewportId);

  // Refs para estado no reactivo (evita closures obsoletos en callbacks async)
  const isMountedRef = useRef(true);
  const isEnabledRef = useRef(false); // true tras ELEMENT_ENABLED
  const initStartedRef = useRef(false); // true tras el primer loadViewportData
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadCountRef = useRef(0); // Contador de cargas para detectar recargas espurias
  // imageIds del viewport actual; actualizado en loadViewportData para que el
  // handler IMAGE_LOADED pueda saber si la imagen cargada pertenece a este viewport.
  const targetImageIdsRef = useRef<Set<string> | null>(null);
  // true cuando los displaySets actuales son de modalidad LARGE_IMAGE (DX/CR/MG/RX/DR).
  // Usado para aplicar corrección de VOI tras compresión JPEG (valores 8-bit vs metadatos 12-14 bit).
  const hasLargeModalityRef = useRef(false);
  // true tras el primer IMAGE_RENDERED con voiRange válido.
  // Controla cuándo se oculta el spinner: lo mantenemos visible hasta que la imagen
  // realmente se renderiza (no solo hasta que setViewportData termina, que es sync
  // pero la carga de píxeles por red puede tardar segundos más).
  const hasFirstRenderRef = useRef(false);

  // Refs de valores actuales: se sincronizan en cada render sin regenerar funciones
  const displaySetsRef = useRef(displaySets);
  const dataSourceRef = useRef(dataSource);
  const displaySetOptionsRef = useRef(displaySetOptions);
  const viewportOptionsRef = useRef(viewportOptions);
  displaySetsRef.current = displaySets;
  dataSourceRef.current = dataSource;
  displaySetOptionsRef.current = displaySetOptions;
  viewportOptionsRef.current = viewportOptions;

  const [status, setStatus] = useState<ViewportStatus>('idle');
  const [hasLargeImages, setHasLargeImages] = useState(false);

  const {
    cornerstoneViewportService,
    cornerstoneCacheService,
    toolGroupService,
    segmentationService,
    displaySetService,
  } = servicesManager.services;

  // ─── ELEMENT_ENABLED handler ───────────────────────────────────────────────
  // Estable: depende solo de IDs, no de arrays/objetos recreados en cada render.
  const handleElementEnabled = useCallback(
    (evt: any) => {
      if (evt.detail.element !== elementRef.current) return;

      const { viewportId: evtId, element } = evt.detail;
      const viewportInfo = cornerstoneViewportService.getViewportInfo(evtId);
      if (!viewportInfo) return;

      isEnabledRef.current = true;
      setEnabledElement(evtId, element);

      const renderingEngineId = viewportInfo.getRenderingEngineId();
      const toolGroupId = viewportInfo.getToolGroupId();
      toolGroupService.addViewportToToolGroup(evtId, renderingEngineId, toolGroupId);
      // syncGroupService: omitido intencionalmente en mobile

      console.log(
        `${LOG_PREFIX} 🔌 ELEMENT_ENABLED [${evtId}]` +
          ` renderingEngine=${renderingEngineId} toolGroup=${toolGroupId}`
      );

      props?.onElementEnabled?.(evt);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewportId, cornerstoneViewportService, toolGroupService]
  );

  // ─── Resize con debounce ───────────────────────────────────────────────────
  const handleResize = useCallback(() => {
    if (!isEnabledRef.current || !isMountedRef.current) return;
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        try {
          cornerstoneViewportService.resize();
          console.log(`${LOG_PREFIX} 📐 resize() [${viewportId}]`);
        } catch (_e) {
          // ignorar errores de resize en mobile
        }
      }
    }, RESIZE_DEBOUNCE_MS);
  }, [cornerstoneViewportService, viewportId]);

  // ─── Cargador de datos (estable gracias a refs) ────────────────────────────
  const loadViewportData = useCallback(
    async (signal: AbortSignal) => {
      if (signal.aborted || !isMountedRef.current) return;

      const loadId = ++loadCountRef.current;
      const t0 = performance.now();

      try {
        setStatus('loading');

        // Leer valores actuales desde refs (estables, siempre al día)
        const currentDisplaySets = displaySetsRef.current;
        const currentDataSource = dataSourceRef.current;
        const currentViewportOptions = viewportOptionsRef.current;
        const currentDisplaySetOptions = displaySetOptionsRef.current;

        const dsSummary = currentDisplaySets.map((ds: any) => ({
          uid: ds.displaySetInstanceUID?.slice(-8),
          modality: ds.Modality,
          frames: (ds as any).numImageFrames ?? ds.images?.length ?? '?',
        }));

        console.group(`${LOG_PREFIX} 📦 LOAD #${loadId} [${viewportId}]`);
        console.log('DisplaySets:', dsSummary);
        console.log('initialImageIndex:', initialImageIndex);

        // Forzar 'stack' en mobile; solo 'volume' para datasets dinámicos
        const isDynamic = currentDisplaySets.some(
          (ds: any) => ds.isDynamicVolume && ds.isReconstructable
        );
        const mobileViewportOptions = {
          ...currentViewportOptions,
          viewportType: isDynamic ? 'volume' : 'stack',
        };
        console.log('viewportType:', mobileViewportOptions.viewportType);

        // Asegurar un entry de options por cada displaySet
        const safeDisplaySetOptions = [...(currentDisplaySetOptions || [])];
        while (safeDisplaySetOptions.length < currentDisplaySets.length) {
          safeDisplaySetOptions.push({});
        }

        console.log('→ createViewportData...');
        const viewportData = await cornerstoneCacheService.createViewportData(
          currentDisplaySets,
          mobileViewportOptions,
          currentDataSource,
          initialImageIndex
        );

        if (signal.aborted || !isMountedRef.current) {
          console.warn(`  ⚠️ Abortado tras createViewportData (#${loadId})`);
          console.groupEnd();
          return;
        }

        // Resumen de imageIds obtenidos
        const allImageIds: string[] = (viewportData?.data ?? []).flatMap(
          (d: any) => d?.imageIds ?? []
        );
        console.log(
          `← createViewportData OK (${(performance.now() - t0).toFixed(0)}ms)` +
            ` imageIds=${allImageIds.length}` +
            (allImageIds.length > 0
              ? ` primera=${allImageIds[0].split('/').pop()?.slice(-20)}`
              : '')
        );

        // Publicar los imageIds del viewport actual en el ref compartido.
        // El handler IMAGE_LOADED (en el mount effect) lee este ref para saber
        // si la imagen cargada pertenece a este viewport y aplicar downsample si es necesario.
        // Se usa IMAGE_LOADED porque IMAGE_CACHE_IMAGE_ADDED no dispara de forma fiable.
        targetImageIdsRef.current = new Set(allImageIds);
        const hasLargeModality = currentDisplaySets.some((ds: any) =>
          LARGE_IMAGE_MODALITIES.has(ds?.Modality)
        );
        hasLargeModalityRef.current = hasLargeModality;
        if (hasLargeModality && allImageIds.length > 0) {
          console.log(
            `  🔍 Downsample activado para ${allImageIds.length} imageId(s)` +
              ` de modalidad grande (maxTexture=${getMaxTextureSize()}px)`
          );
        }

        console.log('→ setViewportData...');
        cornerstoneViewportService.setViewportData(
          viewportId,
          viewportData,
          mobileViewportOptions,
          safeDisplaySetOptions,
          {} // Sin persistencia de presentaciones (evita bugs de LUT/posición obsoleta)
        );

        // ── Render kick explícito ───────────────────────────────────────────────
        // setViewportData llama renderViewport internamente vía rAF, pero cuando
        // se ejecuta desde un ResizeObserver callback ese rAF puede silenciarse.
        // Programamos nuestro propio rAF (fuera del contexto ResizeObserver) como
        // fallback garantizado.
        const kickSignal = signal;
        requestAnimationFrame(() => {
          if (kickSignal.aborted || !isMountedRef.current) return;
          const re = getRenderingEngine('OHIFCornerstoneRenderingEngine');
          if (re) {
            re.renderViewport(viewportId);
            console.log(`${LOG_PREFIX} 🔄 Render kick rAF [${viewportId}]`);
          }
        });

        if (!signal.aborted && isMountedRef.current) {
          console.log(
            `✅ LOAD #${loadId} setViewportData complete [${viewportId}]` +
              ` (total=${(performance.now() - t0).toFixed(0)}ms)` +
              ` → spinner activo hasta IMAGE_RENDERED con voiRange`
          );
          // NO llamamos setStatus('ready') aquí porque la imagen aún no está descargada.
          // El spinner se oculta en handleImageRendered cuando voiRange es válido.
          // Fallback de 12 s: para viewports sin voiRange (video, SR) que nunca disparan
          // IMAGE_RENDERED con voiRange set — así el spinner no queda bloqueado eternamente.
          const abortOnLoad = signal;
          setTimeout(() => {
            if (abortOnLoad.aborted || !isMountedRef.current || hasFirstRenderRef.current) return;
            hasFirstRenderRef.current = true;
            setStatus('ready');
            console.warn(
              `${LOG_PREFIX} ⚠️ Fallback 12s → status=ready [${viewportId}]` +
                ` (IMAGE_RENDERED con voiRange nunca llegó)`
            );
          }, 12000);
        }
        console.groupEnd();
      } catch (error: any) {
        console.groupEnd();
        if (signal.aborted) {
          console.warn(`${LOG_PREFIX} ⚠️ LOAD #${loadId} abortado [${viewportId}]`);
          return;
        }
        console.error(
          `${LOG_PREFIX} ❌ LOAD #${loadId} ERROR [${viewportId}]` +
            ` (${(performance.now() - t0).toFixed(0)}ms)`,
          error
        );
        if (isMountedRef.current) setStatus('error');
      }
    },
    // Solo IDs estables como dependencias – las refs proveen el resto
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewportId, initialImageIndex, cornerstoneCacheService, cornerstoneViewportService]
  );

  // ─── Efecto de montaje (UNA sola vez) ─────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    const element = elementRef.current;
    if (!element) return;

    const dsSummary = displaySets
      .map((ds: any) => `${ds.Modality}(${ds.displaySetInstanceUID?.slice(-8)})`)
      .join(', ');
    console.group(`${LOG_PREFIX} 🚀 MOUNT [${viewportId}] — ${dsSummary}`);
    console.log('maxTextureSize:', getMaxTextureSize(), 'px');
    console.log(
      'displaySets:',
      displaySets.map((ds: any) => ({
        uid: ds.displaySetInstanceUID,
        modality: ds.Modality,
        numFrames: (ds as any).numImageFrames ?? ds.images?.length ?? '?',
        instances: ds.instances?.length ?? '?',
      }))
    );

    cornerstoneViewportService.enableViewport(viewportId, element);
    console.log('→ enableViewport llamado');
    eventTarget.addEventListener(Enums.Events.ELEMENT_ENABLED, handleElementEnabled);
    console.groupEnd();

    // ── Listeners de diagnóstico del pipeline de carga/renderizado ──────────
    // Estos cubren la brecha entre setViewportData (sync) y el primer render
    // (async), que es exactamente donde fallan CR/DX silenciosamente.

    // ── VOI fix helper ────────────────────────────────────────────────────
    // Para modalidades LARGE_IMAGE (DX/CR/MG/RX/DR) servidas como JPEG en mobile,
    // los metadatos DICOM WindowCenter/WindowWidth están en espacio de 12-14 bit
    // pero los píxeles decodificados son 8-bit (0-255). Esto hace que Cornerstone
    // renderice la imagen completamente negra.
    //
    // Para datos nativos 16-bit, calcula el rango real desde los píxeles muestreados
    // (los metadatos DICOM pueden reportar maxPixelValue=4095 aunque los valores
    // reales excedan ese límite → imagen blanca con clipping).
    //
    // Retorna Promise para poder hacer await antes del renderViewport final.
    const applyVOIFixFromCache = async (imageId: string, vp: any): Promise<void> => {
      if (!hasLargeModalityRef.current || !vp?.setProperties) {
        console.log(
          `${LOG_PREFIX} 🔬 applyVOIFix SKIP (hasLargeModality=${hasLargeModalityRef.current}` +
            ` setProperties=${!!vp?.setProperties}) [${viewportId}]`
        );
        return;
      }
      console.log(`${LOG_PREFIX} 🔬 applyVOIFix ENTER [${viewportId}] imageId=...${imageId.slice(-30)}`);
      const loadObj = csCache.getImageLoadObject(imageId);
      if (!loadObj) return;

      let img: any;
      try {
        img = await loadObj.promise;
      } catch {
        return; // cache expiró
      }

      if (!isMountedRef.current || !vp?.setProperties) return;

      const pixelData = img.getPixelData?.() ?? img.pixelData;
      if (!pixelData || pixelData.length === 0) return;

      const is8bit = pixelData instanceof Uint8Array || pixelData instanceof Uint8ClampedArray;

      // ── Estadísticas reales de pixel (muestreo hasta 50K puntos) ──────────
      const step = Math.max(1, Math.floor(pixelData.length / 50000));
      let pMin = Infinity, pMax = -Infinity, pSum = 0, pCount = 0;
      for (let i = 0; i < pixelData.length; i += step) {
        const v = (pixelData as any)[i];
        if (v < pMin) pMin = v;
        if (v > pMax) pMax = v;
        pSum += v;
        pCount++;
      }
      const pMean = pCount > 0 ? pSum / pCount : 0;

      // ── VOI actual del viewport en este momento ───────────────────────────
      const currentVoi = vp.getProperties?.()?.voiRange;

      console.group(`${LOG_PREFIX} 🔬 IMAGE DIAG [${viewportId}]`);
      console.log(`pixel tipo:       ${pixelData.constructor.name}  (is8bit=${is8bit})`);
      console.log(`pixel dims:       ${img.width}×${img.height}  (length=${pixelData.length})`);
      console.log(`pixel range:      [${pMin}, ${pMax}]  media=${pMean.toFixed(1)}`);
      console.log(`dicom wc / ww:    ${img.windowCenter} / ${img.windowWidth}`);
      console.log(`dicom min/max px: ${img.minPixelValue} / ${img.maxPixelValue}`);
      console.log(`slope/intercept:  ${img.slope} / ${img.intercept}`);
      console.log(`invert:           ${img.invert}`);
      console.log(`color:            ${img.color}`);
      // BitsAllocated/BitsStored: Cornerstone3D usa estos para decidir el formato VTK (R8 vs R16UI).
      // Si BitsAllocated=16 y pixelData es Uint8Array (post-conversión), la textura puede ser
      // subida como R16UI igualmente → imagen negra aunque el cache esté correcto.
      console.log(`BitsAllocated:    ${img.BitsAllocated ?? '—'}  BitsStored=${img.BitsStored ?? '—'}  HighBit=${img.HighBit ?? '—'}`);
      console.log(`imageId:          ...${(img.imageId ?? '').slice(-40)}`);
      console.log(`viewport voiRange actual: [${currentVoi?.lower ?? '—'}, ${currentVoi?.upper ?? '—'}]`);
      console.groupEnd();

      if (!is8bit) {
        // Datos 16-bit nativos: Cornerstone usa correctamente el VOI de los metadatos
        // DICOM (wc/ww para DX 12-bit suele ser correcto). Sobreescribir el voiRange
        // con valores calculados causa imagen blanca porque:
        //   a) Overridea el auto-windowing de Cornerstone (que puede ser mejor que DICOM)
        //   b) Cualquier setProperties extra genera renders adicionales que corrompen estado
        // → No tocar el VOI para datos nativos 16-bit.
        console.log(
          `${LOG_PREFIX} 🔬 applyVOIFix SKIP (datos 16-bit, tipo=${pixelData.constructor.name})` +
            ` → Cornerstone usará wc=${img.windowCenter}/ww=${img.windowWidth} del DICOM [${viewportId}]`
        );
        return;
      }

      // JPEG 8-bit: el rango real de píxeles es siempre 0-255 independientemente
      // de lo que digan los metadatos DICOM (SmallestImagePixelValue = 0,
      // LargestImagePixelValue = 4095 para imagen 12-bit → ventana incorrecta → negro).
      const lo = 0;
      const hi = 255;

      const voiPre = vp.getProperties?.()?.voiRange;
      vp.setProperties({ voiRange: { lower: lo, upper: hi } });
      const voiPost = vp.getProperties?.()?.voiRange;
      console.log(
        `${LOG_PREFIX} 🔧 VOI corregido [${viewportId}]:` +
          ` antes=[${voiPre?.lower ?? '—'},${voiPre?.upper ?? '—'}]` +
          ` → ahora=[${voiPost?.lower?.toFixed(0) ?? '—'},${voiPost?.upper?.toFixed(0) ?? '—'}]` +
          ` (JPEG 8-bit vs metadatos wc=${img.windowCenter}/ww=${img.windowWidth})`
      );
      if (voiPost?.lower == null) {
        console.warn(
          `${LOG_PREFIX} ⚠️ setProperties voiRange no persistió → el viewport puede ignorarlo` +
            ` (¿otro render override inmediato?) [${viewportId}]`
        );
      }
    };

    // 1. Imagen decodificada con éxito (global, cualquier imageId).
    //    Si la imagen pertenece a este viewport, ejecutar downsample (no-op si cabe en la
    //    textura WebGL) y forzar un re-render para que Cornerstone use los datos actualizados.
    //    Este es el punto de entrada principal del downsample porque IMAGE_CACHE_IMAGE_ADDED
    //    no dispara de forma fiable desde un contexto ResizeObserver.
    const handleImageLoaded = (evt: any) => {
      // Cornerstone3D IMAGE_LOADED usa evt.detail.image.imageId, no evt.detail.imageId
      const id: string = evt.detail?.image?.imageId ?? evt.detail?.imageId ?? '';
      const inTargetSet = !!(id && targetImageIdsRef.current?.has(id));
      const targetSetSize = targetImageIdsRef.current?.size ?? -1; // -1 = ref todavía null (race condition)
      console.log(
        `${LOG_PREFIX} ✅ IMAGE_LOADED [${viewportId}]` +
          ` inTargetSet=${inTargetSet} targetSetSize=${targetSetSize}` +
          ` imageId=...${id.slice(-40)}`
      );
      if (!inTargetSet && targetSetSize === -1) {
        console.warn(
          `${LOG_PREFIX} ⚠️ IMAGE_LOADED llegó ANTES de que loadViewportData estableciera` +
            ` targetImageIdsRef (race condition). La imagen NO será procesada.`
        );
      } else if (!inTargetSet && id) {
        console.log(
          `${LOG_PREFIX} ℹ️ IMAGE_LOADED ignorado (ya procesado o es de otro viewport) [${viewportId}]`
        );
      }

      if (id && targetImageIdsRef.current?.has(id)) {
        // GUARD SINCRÓNICO: eliminar imageId del set ANTES de iniciar cualquier operación
        // asíncrona. Cornerstone3D puede disparar IMAGE_LOADED múltiples veces para el
        // mismo imageId (ej. setStack con imagen cacheada dispara otro IMAGE_LOADED).
        // Si el delete está dentro del .then() (async), un segundo IMAGE_LOADED llega
        // antes de que el .then() resuelva, ve has(id)=true y agenda otro rAF² → 3× loop.
        targetImageIdsRef.current.delete(id);

        // ── Fase 1: downsample geométrico si la imagen supera maxTextureSize ──────
        // No-op si la imagen cabe. Si retorna true, la imagen fue reducida en cache.
        downsampleCachedImage(id).then(async wasGeometricDownsample => {
          if (!isMountedRef.current) return;
          const re = getRenderingEngine('OHIFCornerstoneRenderingEngine');
          if (!re) return;

          const viewport = re.getViewport(viewportId) as any;

          // ── Fase 2: conversión 16-bit → 8-bit para compatibilidad WebGL móvil ──
          // PROBLEMA CONFIRMADO (canvas R=0,G=0,B=0,A=255):
          // Muchos dispositivos móviles no soportan texturas Uint16 correctamente en WebGL.
          // Cornerstone sube la imagen como R16UI, pero la GPU la renderiza negra aunque
          // el voiRange sea correcto. Fix: convertir a Uint8 en cache ANTES del upload.
          // Solo se aplica a modalidades grandes (DX/CR/MG/RX/DR) que no fueron ya
          // convertidas por el downsample geométrico.
          let wasPixelConverted = false;
          if (!wasGeometricDownsample && hasLargeModalityRef.current) {
            wasPixelConverted = await convertTo8bitInCache(id);
          }

          const wasDownsampled = wasGeometricDownsample || wasPixelConverted;
          console.log(
            `${LOG_PREFIX} 🔍 Pipeline parche [${viewportId}]:` +
              ` wasGeometricDownsample=${wasGeometricDownsample}` +
              ` wasPixelConverted=${wasPixelConverted}` +
              ` wasDownsampled=${wasDownsampled}` +
              ` hasLargeModality=${hasLargeModalityRef.current}`
          );

          if (wasDownsampled) {
            // La imagen en cache fue parcheada (geometría y/o tipo de pixel).
            // Llamar setStack para que Cornerstone recargue la imagen desde cache
            // y reconstruya el actor VTK con los datos actualizados.
            // SOLO si la imagen parcheada es la IMAGEN ACTUAL del viewport.
            const imageIds: string[] = viewport?.getImageIds?.() ?? [];
            const currentIdx: number = viewport?.getCurrentImageIdIndex?.() ?? 0;
            const isCurrentImage = id !== '' && (imageIds[currentIdx] ?? '') === id;
            console.log(
              `${LOG_PREFIX} 🔍 isCurrentImage check [${viewportId}]:` +
                ` isCurrentImage=${isCurrentImage}` +
                ` currentIdx=${currentIdx}` +
                ` imageIds.length=${imageIds.length}` +
                ` currentId=...${(imageIds[currentIdx] ?? '').slice(-30)}` +
                ` loadedId=...${id.slice(-30)}`
            );

            if (isCurrentImage && viewport?.setStack && imageIds.length > 0) {
              let setStackOk = false;
              try {
                const patchType = wasGeometricDownsample ? 'downsample' : '16→8bit';
                console.log(`${LOG_PREFIX} 🔄 Re-stack (${patchType}) [${viewportId}]`);
                await viewport.setStack(imageIds, currentIdx);
                setStackOk = true;
                console.log(`${LOG_PREFIX} ✅ setStack completado [${viewportId}]`);
              } catch (_e) {
                // Si setStack falla, la textura en GPU sigue siendo la original (16-bit → negra)
                console.error(
                  `${LOG_PREFIX} ❌ setStack FALLÓ [${viewportId}] — la textura GPU puede seguir siendo 16-bit:`,
                  _e
                );
              }

              // Re-fetch viewport: setStack puede recrear internamente el objeto viewport;
              // usar la referencia pre-setStack puede ser stale → setProperties ignorado.
              const freshViewport = re.getViewport(viewportId) as any;
              const activeViewport = freshViewport ?? viewport;
              console.log(
                `${LOG_PREFIX} 🔍 Viewport post-setStack [${viewportId}]:` +
                  ` setStackOk=${setStackOk}` +
                  ` freshViewport=${!!freshViewport}` +
                  ` setProperties=${!!activeViewport?.setProperties}`
              );

              // ── Diagnóstico VTK actor post-setStack ────────────────────────────
              // HIPÓTESIS PRINCIPAL: Cornerstone3D puede crear el VTK actor con formato R16UI
              // si BitsAllocated=16, aunque getPixelData() retorne Uint8Array.
              // La textura GPU quedaría en formato 16-bit → imagen negra aunque voiRange sea [0,255].
              try {
                const vtkImg = activeViewport?.getImageData?.();
                const scalars = vtkImg?.imageData?.getPointData?.()?.getScalars?.();
                const vtkData = scalars?.getData?.();
                const vtkDataType = scalars?.getDataType?.() ?? '—';
                const vtkArrType = vtkData?.constructor?.name ?? '—';
                const first3 = vtkData ? Array.from((vtkData as any).slice(0, 3)).join(',') : '—';
                console.log(
                  `${LOG_PREFIX} 🔬 VTK actor post-setStack [${viewportId}]:` +
                    ` dataType=${vtkDataType} arrType=${vtkArrType} first3=[${first3}]`
                );
                if (vtkArrType === 'Uint16Array') {
                  console.error(
                    `${LOG_PREFIX} ❌ VTK actor tiene Uint16Array — Cornerstone NO releyó el Uint8Array del cache.` +
                      ` Probablemente usa BitsAllocated para crear el VTK ImageData, ignorando el tipo real` +
                      ` de getPixelData(). Fix: también parchear img.BitsAllocated=8, img.BitsStored=8, img.HighBit=7`
                  );
                } else if (vtkArrType === 'Uint8Array') {
                  console.log(
                    `${LOG_PREFIX} ✅ VTK actor tiene Uint8Array → formato GPU correcto.` +
                      ` Si el canvas sigue negro, es preserveDrawingBuffer=false (falso positivo)`
                  );
                } else {
                  console.warn(
                    `${LOG_PREFIX} ⚠️ VTK actor tipo desconocido (${vtkArrType}) — no se puede determinar formato GPU`
                  );
                }
              } catch (_vtkErr) {
                console.log(`${LOG_PREFIX} 🔬 No se pudo inspeccionar VTK actor: ${_vtkErr}`);
              }

              // VOI fix después de setStack: setStack resetea voiRange a null.
              // Para 8-bit (post-conversión): applyVOIFixFromCache detecta Uint8Array → [0,255]
              await applyVOIFixFromCache(id, activeViewport);

              // Para modalidades grandes (MG/DX/CR): resetCamera después de setStack porque
              // las dimensiones de la imagen cambiaron (downsample/conversión). Sin resetCamera
              // la cámara sigue configurada para las dimensiones originales → imagen distorsionada
              // o descentrada. Esto es la causa más probable de la distorsión en mamografías.
              if (hasLargeModalityRef.current && activeViewport?.resetCamera) {
                activeViewport.resetCamera();
                const camPost = activeViewport?.getCamera?.();
                console.log(
                  `${LOG_PREFIX} 📷 resetCamera post-setStack [${viewportId}]` +
                    ` parallelScale=${camPost?.parallelScale?.toFixed(2) ?? '?'}` +
                    ` pos=${JSON.stringify(camPost?.position?.map((v: number) => +v.toFixed(0)) ?? [])}`
                );
              } else {
                const camCurr = activeViewport?.getCamera?.();
                console.log(
                  `${LOG_PREFIX} 📷 Camera post-setStack SIN resetCamera [${viewportId}]` +
                    ` parallelScale=${camCurr?.parallelScale?.toFixed(2) ?? '?'}` +
                    ` (hasLargeModality=${hasLargeModalityRef.current})`
                );
              }

              re.renderViewport(viewportId);
              console.log(`${LOG_PREFIX} 🔄 Post-load render kick [${viewportId}]`);

              // ── Canvas sampling POST-conversión ─────────────────────────────
              // Esperar dos frames para que el render termine y el buffer esté listo.
              // Este es el diagnóstico definitivo: si sigue negro aquí, setStack/voiRange
              // no surtieron efecto a nivel GPU.
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (!isMountedRef.current) return;
                  const canvasAfter = element.querySelector('canvas') as HTMLCanvasElement | null;
                  if (canvasAfter && canvasAfter.width > 0) {
                    try {
                      const cx = Math.floor(canvasAfter.width / 2);
                      const cy = Math.floor(canvasAfter.height / 2);
                      const tmp = document.createElement('canvas');
                      tmp.width = 1;
                      tmp.height = 1;
                      const ctx = tmp.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(canvasAfter, cx, cy, 1, 1, 0, 0, 1, 1);
                        const px = ctx.getImageData(0, 0, 1, 1).data;
                        const finalVoi = activeViewport?.getProperties?.()?.voiRange;
                        const isBlack = px[0] === 0 && px[1] === 0 && px[2] === 0;
                        console.log(
                          `${LOG_PREFIX} 🎨 Canvas POST-conversión [${viewportId}]:` +
                            ` R=${px[0]} G=${px[1]} B=${px[2]} A=${px[3]}` +
                            ` voiRange=[${finalVoi?.lower?.toFixed(0) ?? '—'},${finalVoi?.upper?.toFixed(0) ?? '—'}]`
                        );
                        if (isBlack) {
                          // Verificar si preserveDrawingBuffer=false es el motivo del falso positivo
                          let preserveDB: boolean | undefined;
                          try {
                            const glCtx = canvasAfter.getContext('webgl2') ?? canvasAfter.getContext('webgl');
                            preserveDB = glCtx?.getContextAttributes?.()?.preserveDrawingBuffer;
                          } catch (_g) { /* ignore */ }
                          console.error(
                            `${LOG_PREFIX} ❌ SIGUE NEGRO después de conversión 8-bit + setStack + renderViewport.` +
                              ` setStackOk=${setStackOk} voiRange=${finalVoi ? JSON.stringify(finalVoi) : 'null'}` +
                              ` preserveDrawingBuffer=${preserveDB}` +
                              ` — si preserveDB=false el canvas read es falso positivo y la imagen SÍ se ve.` +
                              ` Si preserveDB=true → bug real de textura GPU (VTK actor con Uint16Array?)`
                          );
                        } else {
                          console.log(
                            `${LOG_PREFIX} ✅ Canvas POST-conversión VISIBLE (R=${px[0]}) → imagen correcta [${viewportId}]`
                          );
                        }
                      }
                    } catch (_e) {
                      console.log(`${LOG_PREFIX} 🎨 No se pudo muestrear canvas post-conversión: ${_e}`);
                    }
                  }
                });
              });
            } else {
              // Imagen no-actual: el parche en cache es suficiente. Se aplicará
              // cuando el usuario navegue a este frame (setStack/loadImage lo re-leerá).
              console.log(
                `${LOG_PREFIX} 🔄 Cache patch completado (imagen no-actual) [${viewportId}]`
              );
            }
          } else {
            // Imagen en formato nativo, sin parches (CT/MR u otras modalidades sin
            // problemas de WebGL). Aplicar VOI fix si es necesario (8-bit JPEG),
            // luego render kick.
            const imageIds: string[] = viewport?.getImageIds?.() ?? [];
            const currentIdx: number = viewport?.getCurrentImageIdIndex?.() ?? 0;
            const isCurrentImage = id !== '' && (imageIds[currentIdx] ?? '') === id;

            requestAnimationFrame(() => {
              requestAnimationFrame(async () => {
                if (!isMountedRef.current) return;
                if (isCurrentImage) await applyVOIFixFromCache(id, viewport);

                // Para modalidades grandes en el PRIMER render: resetCamera asegura
                // que la cámara esté posicionada para mostrar la imagen.
                // Solo en el primer render para no invalidar zoom/pan del usuario.
                if (hasLargeModalityRef.current && !hasFirstRenderRef.current && viewport?.resetCamera) {
                  viewport.resetCamera();
                  console.log(`${LOG_PREFIX} 📷 resetCamera (pre-render, primer load) [${viewportId}]`);
                }

                re.renderViewport(viewportId);
                const postVoi = viewport?.getProperties?.()?.voiRange;
                const postVoiStr = postVoi
                  ? `[${postVoi.lower?.toFixed(0)}, ${postVoi.upper?.toFixed(0)}]`
                  : '—';
                console.log(
                  `${LOG_PREFIX} 🔄 Post-load render kick (rAF²) [${viewportId}]` +
                    `  voiRange=${postVoiStr}`
                );
              });
            });
          }
        });
      }
    };

    // 2. Fallo al cargar imagen (global, muestra la razón)
    const handleImageLoadFailed = (evt: any) => {
      const id: string = evt.detail?.imageId ?? evt.detail?.image?.imageId ?? '';
      console.error(
        `${LOG_PREFIX} ❌ IMAGE_LOAD_FAILED [${viewportId}]` + ` imageId=...${id.slice(-40)}`,
        evt.detail?.error ?? evt.detail
      );
    };

    // 3. Viewport renderizó una imagen (filtramos por viewportId)
    const handleImageRendered = (evt: any) => {
      if (evt.detail?.viewportId !== viewportId) return;
      const detail: any = evt.detail;
      // Leer el VOI real que Cornerstone usó en este render
      const re2 = getRenderingEngine('OHIFCornerstoneRenderingEngine');
      const vp2 = re2?.getViewport(viewportId) as any;
      const props2 = vp2?.getProperties?.() ?? {};
      const voi2 = props2.voiRange;
      const voiStr = voi2
        ? `[${voi2.lower?.toFixed(0)}, ${voi2.upper?.toFixed(0)}]`
        : '—';

      // ── Primera renderización real (con imagen): ocultar spinner ──────────
      // Cornerstone dispara IMAGE_RENDERED inmediatamente después de setStack (antes de que
      // la imagen cargue por red), con voiRange=null. Ese primer render muestra el canvas negro.
      // Solo ocultamos el spinner cuando voiRange está definido (imagen realmente cargada).
      if (voi2 != null && !hasFirstRenderRef.current) {
        hasFirstRenderRef.current = true;
        setStatus('ready');

        // ── Diagnóstico: pixel central del canvas ───────────────────────────
        // Si el pixel es (0,0,0,255) la imagen se renderizó pero es negra (bug de VOI/cámara).
        // Si el pixel tiene valores > 0, la imagen está oscura pero visible.
        // NOTA: puede fallar si preserveDrawingBuffer=false en el contexto WebGL.
        const canvas = element.querySelector('canvas') as HTMLCanvasElement | null;
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          try {
            const cx = Math.floor(canvas.width / 2);
            const cy = Math.floor(canvas.height / 2);
            const tmp = document.createElement('canvas');
            tmp.width = 1;
            tmp.height = 1;
            const ctx2d = tmp.getContext('2d');
            if (ctx2d) {
              ctx2d.drawImage(canvas, cx, cy, 1, 1, 0, 0, 1, 1);
              const px = ctx2d.getImageData(0, 0, 1, 1).data;
              console.log(
                `${LOG_PREFIX} 🎨 Canvas center pixel: R=${px[0]} G=${px[1]} B=${px[2]} A=${px[3]}` +
                  `  canvas=${canvas.width}×${canvas.height}`
              );
              if (px[0] === 0 && px[1] === 0 && px[2] === 0) {
                if (hasLargeModalityRef.current) {
                  console.warn(
                    `${LOG_PREFIX} ⚠️ status=ready activado con canvas NEGRO en modalidad grande [${viewportId}].` +
                      ` La textura 16-bit se renderizó antes de que IMAGE_LOADED pudiera convertirla.` +
                      ` El usuario verá negro hasta que setStack+renderViewport completen (async).`
                  );
                } else {
                  console.warn(
                    `${LOG_PREFIX} ⚠️ Pixel central es (0,0,0) → canvas completamente negro.` +
                      ` Puede ser preserveDrawingBuffer=false (falso positivo) o bug real de render.`
                  );
                }
              }
            }
          } catch (samplingErr) {
            console.log(`${LOG_PREFIX} 🎨 No se pudo leer pixel canvas: ${samplingErr}`);
          }
        }
        // ── Diagnóstico: cámara ─────────────────────────────────────────────
        const cam = vp2?.getCamera?.();
        if (cam) {
          console.log(
            `${LOG_PREFIX} 📷 Camera: pos=${JSON.stringify(cam.position)}` +
              ` focal=${JSON.stringify(cam.focalPoint)}` +
              ` parallelScale=${cam.parallelScale?.toFixed(2)}`
          );
        }
        console.log(`${LOG_PREFIX} ✅ Primer render con imagen → status=ready [${viewportId}]`);
      }

      console.log(
        `${LOG_PREFIX} 🖼️ IMAGE_RENDERED [${viewportId}]` +
          ` frame=${detail.frameIndex ?? '?'}` +
          `  voiRange=${voiStr}` +
          `  imageId=...${(detail.imageId ?? '').slice(-30)}`
      );
    };

    // 4. Stack avanzó a una nueva imagen (filtramos por viewportId)
    const handleStackNewImage = (evt: any) => {
      if (evt.detail?.viewportId !== viewportId) return;
      console.log(
        `${LOG_PREFIX} 🖼️ STACK_NEW_IMAGE [${viewportId}]` +
          ` imageId=...${(evt.detail?.imageId ?? '').slice(-30)}`
      );
    };

    // 5. El conjunto de imágenes del viewport fue actualizado
    const handleViewportNewImageSet = (evt: any) => {
      if (evt.detail?.viewportId !== viewportId) return;
      const count = evt.detail?.imageIds?.length ?? '?';
      console.log(`${LOG_PREFIX} 📋 VIEWPORT_NEW_IMAGE_SET [${viewportId}] totalImageIds=${count}`);
    };

    // IMAGE_LOADED e IMAGE_LOAD_FAILED: globales, van a eventTarget
    eventTarget.addEventListener(Enums.Events.IMAGE_LOADED, handleImageLoaded);
    eventTarget.addEventListener(Enums.Events.IMAGE_LOAD_FAILED, handleImageLoadFailed);
    // IMAGE_RENDERED, STACK_NEW_IMAGE, VIEWPORT_NEW_IMAGE_SET: disparan sobre el
    // elemento DOM del viewport (triggerEvent(element, ...)), NO sobre eventTarget.
    element.addEventListener(Enums.Events.IMAGE_RENDERED as any, handleImageRendered);
    element.addEventListener(Enums.Events.STACK_NEW_IMAGE as any, handleStackNewImage);
    element.addEventListener(Enums.Events.VIEWPORT_NEW_IMAGE_SET as any, handleViewportNewImageSet);

    const largeImages = detectLargeImages(displaySets);
    if (largeImages) {
      console.warn(
        `${LOG_PREFIX} ⚠️ Modalidad de imagen grande detectada [${viewportId}].` +
          ` maxTexture=${getMaxTextureSize()}px.` +
          ` Modalities: ${displaySets.map((ds: any) => ds.Modality).join(', ')}`
      );
      setHasLargeImages(true);
    }

    // Esperar dimensiones > 0 antes de inicializar Cornerstone.
    // En mobile, el layout puede estar incompleto en el primer render,
    // y Cornerstone con canvas de 0px rompe el contexto WebGL permanentemente.
    const resizeObserver = new ResizeObserver(entries => {
      if (!entries?.length) return;
      const { width, height } = entries[0].contentRect;

      if (width > 0 && height > 0) {
        if (!initStartedRef.current) {
          // Primera vez con dimensiones reales → inicializar
          initStartedRef.current = true;
          console.log(
            `${LOG_PREFIX} 📐 Dimensiones OK [${viewportId}]: ${Math.round(width)}×${Math.round(height)}px → iniciando carga`
          );
          const abort = new AbortController();
          loadAbortRef.current = abort;
          loadViewportData(abort.signal);
        } else if (isEnabledRef.current) {
          // Resize posterior → debounce
          console.log(
            `${LOG_PREFIX} 📐 Resize [${viewportId}]: ${Math.round(width)}×${Math.round(height)}px`
          );
          handleResize();
        }
      } else {
        console.log(
          `${LOG_PREFIX} 📐 Esperando dimensiones [${viewportId}]: ${Math.round(width)}×${Math.round(height)}px`
        );
      }
    });

    resizeObserver.observe(element);

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      console.group(`${LOG_PREFIX} 🗑️ UNMOUNT [${viewportId}]`);
      isMountedRef.current = false;
      loadAbortRef.current?.abort();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeObserver.disconnect();
      eventTarget.removeEventListener(Enums.Events.ELEMENT_ENABLED, handleElementEnabled);
      eventTarget.removeEventListener(Enums.Events.IMAGE_LOADED, handleImageLoaded);
      eventTarget.removeEventListener(Enums.Events.IMAGE_LOAD_FAILED, handleImageLoadFailed);
      element.removeEventListener(Enums.Events.IMAGE_RENDERED as any, handleImageRendered);
      element.removeEventListener(Enums.Events.STACK_NEW_IMAGE as any, handleStackNewImage);
      element.removeEventListener(
        Enums.Events.VIEWPORT_NEW_IMAGE_SET as any,
        handleViewportNewImageSet
      );

      const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
      if (viewportInfo) {
        try {
          // Orden correcto de limpieza (igual que OHIFCornerstoneViewport)
          cornerstoneViewportService.storePresentation({ viewportId });
          const renderingEngineId = viewportInfo.getRenderingEngineId();
          toolGroupService.removeViewportFromToolGroup(viewportId, renderingEngineId);
          segmentationService.clearSegmentationRepresentations(viewportId);
          console.log('storePresentation + removeFromToolGroup + clearSegmentations OK');
          props?.onElementDisabled?.(viewportInfo);
        } catch (_e) {
          // Guard para estado parcialmente inicializado
          console.warn('Cleanup parcial (viewport no completamente inicializado)');
        }
        cornerstoneViewportService.disableElement(viewportId);
        console.log('disableElement OK');
      } else {
        console.log('viewportInfo no encontrado, sin cleanup de cornerstone');
      }

      viewportRef.unregister();
      console.log('viewportRef.unregister OK');
      console.groupEnd();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Reacción a cambios REALES de displaySet (post-montaje) ───────────────
  //
  // Este efecto solo se dispara cuando displaySets/viewportOptions/dataSource
  // cambian de verdad. React.memo + areEqual garantiza que el componente NO
  // se re-renderiza cuando ViewportGrid pasa el mismo contenido en nueva referencia,
  // por lo que este efecto nunca dispara falsas recargas.
  useEffect(() => {
    if (!initStartedRef.current) return; // Omitir el render inicial
    const newMods = displaySets.map((ds: any) => ds.Modality).join(', ');
    console.log(
      `${LOG_PREFIX} 🔄 DisplaySet cambio real [${viewportId}] → modalities: ${newMods} → reiniciando carga`
    );
    // Resetear el guard de "primera renderización" para que el spinner
    // vuelva a mostrarse mientras se carga la nueva serie.
    hasFirstRenderRef.current = false;
    setStatus('loading');
    loadAbortRef.current?.abort();
    const abort = new AbortController();
    loadAbortRef.current = abort;
    loadViewportData(abort.signal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySets, viewportOptions, dataSource]);

  // ─── Invalidación de metadatos ─────────────────────────────────────────────
  useEffect(() => {
    const { unsubscribe } = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SET_SERIES_METADATA_INVALIDATED,
      async ({ displaySetInstanceUID, invalidateData }: any) => {
        if (!invalidateData || !isMountedRef.current) return;
        const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
        if (!viewportInfo?.hasDisplaySet(displaySetInstanceUID)) return;

        console.log(
          `${LOG_PREFIX} 🔄 Metadata invalidada [${viewportId}] uid=...${displaySetInstanceUID?.slice(-8)} → actualizando viewport`
        );

        const viewportData = viewportInfo.getViewportData();
        const newViewportData = await cornerstoneCacheService.invalidateViewportData(
          viewportData,
          displaySetInstanceUID,
          dataSourceRef.current,
          displaySetService
        );

        if (isMountedRef.current) {
          cornerstoneViewportService.updateViewport(viewportId, newViewportData, true);
          console.log(`${LOG_PREFIX} 🔄 updateViewport OK [${viewportId}]`);
        }
      }
    );
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportId]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mobile-v2-container">
      {/* El canvas de Cornerstone vive dentro de este div */}
      <div
        className="mobile-v2-element"
        onContextMenu={e => e.preventDefault()}
        onMouseDown={e => e.preventDefault()}
        data-viewportid={viewportId}
        ref={el => {
          elementRef.current = el;
          if (el) viewportRef.register(el);
        }}
      />

      {/* Spinner mientras se espera layout o se carga datos */}
      {(status === 'idle' || status === 'loading') && (
        <div className="mobile-v2-overlay">
          <div className="mobile-v2-spinner" />
        </div>
      )}

      {/* Overlay de error */}
      {status === 'error' && (
        <div className="mobile-v2-overlay mobile-v2-overlay--error">
          <span className="mobile-v2-error-text">Error al cargar la imagen</span>
        </div>
      )}

      {/* Badge informativo para series de alta resolución (MG/RX) */}
      {status === 'ready' && hasLargeImages && (
        <div className="mobile-v2-large-image-badge">Alta resolución</div>
      )}
    </div>
  );
}, areEqual);

MobileViewportV2Impl.displayName = 'MobileViewportV2';

/**
 * Wrapper con ErrorBoundary para recuperación de errores transitorios.
 * Usa viewportOptions.viewportId como fuente de verdad, igual que OHIFCornerstoneViewport.
 */
function MobileViewportV2WithBoundary(props: any) {
  const vpId = props.viewportOptions?.viewportId || props.viewportId;
  return (
    <ViewportErrorBoundary viewportId={vpId}>
      <MobileViewportV2Impl {...props} />
    </ViewportErrorBoundary>
  );
}

export default MobileViewportV2WithBoundary;
