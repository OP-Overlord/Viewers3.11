import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Enums, eventTarget, getRenderingEngine, imageLoader } from '@cornerstonejs/core';
import { useViewportRef, useSystem } from '@ohif/core';
import { setEnabledElement } from '@ohif/extension-cornerstone';

import ViewportErrorBoundary from './ViewportErrorBoundary';
import MobileCinePlayer from './MobileCinePlayer';
import {
  buildRenderedImageIds,
  reduceRenderSize,
  resetRenderSize,
  RENDERED_MODALITIES,
} from './renderedImageLoader';
import './MobileViewportV2.css';

// Modalidades de cine que se auto-reproducen al abrir la serie (loops temporales).
// El resto de modalidades multiframe muestran el cine solo bajo demanda (botón).
const CINE_AUTOPLAY_MODALITIES = new Set(['US', 'RF', 'XA']);

const LOG_PREFIX = '[MobileViewportV2]';
const RESIZE_DEBOUNCE_MS = 200;
// Nº máximo de remontajes de recuperación ante un fallo de render WebGL/vtk.
const MAX_RENDER_REMOUNTS = 3;

// ── Logging gated por flag ─────────────────────────────────────────────────
// Por defecto silencioso (sin ruido ni jank en producción). Activar en runtime
// con localStorage['nova-mobile-debug']='1'. Se shadowea `console` a nivel de
// módulo: todas las llamadas console.* de este archivo pasan por aquí; los
// errores reales siempre se emiten.
const DEBUG = (() => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('nova-mobile-debug') === '1') {
      return true;
    }
    // También se activa con `?debug=true` en la URL (flujo de eruda en móvil).
    if (typeof window !== 'undefined' && /[?&]debug=true\b/i.test(window.location.search)) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
})();
const _noop = () => {};
// Shadow de `console` a nivel de módulo (ver nota arriba).
// eslint-disable-next-line no-console
const console = DEBUG
  ? globalThis.console
  : ({
      log: _noop,
      warn: _noop,
      group: _noop,
      groupEnd: _noop,
      error: globalThis.console.error.bind(globalThis.console),
    } as unknown as Console);

type ViewportStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

// Modalidades NO renderizables en el visor móvil (overlays/estructurados). Se
// muestra un placeholder en vez de un canvas negro.
const NONRENDERABLE_MODALITIES = new Set([
  'SEG',
  'RTSTRUCT',
  'RTPLAN',
  'RTDOSE',
  'SR',
  'KO',
  'PR',
]);

// Cache WebGL max texture size once per session
let cachedMaxTextureSize: number | null = null;

function getMaxTextureSize(): number {
  if (cachedMaxTextureSize !== null) return cachedMaxTextureSize;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      cachedMaxTextureSize = (gl as WebGLRenderingContext).getParameter(
        (gl as WebGLRenderingContext).MAX_TEXTURE_SIZE
      );
      return cachedMaxTextureSize;
    }
  } catch (_e) {
    // ignore
  }
  cachedMaxTextureSize = 4096;
  return cachedMaxTextureSize;
}

/** ¿El dispositivo tiene WebGL? Si no, Cornerstone no puede renderizar. */
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Compara props para decidir si el componente necesita re-renderizarse.
 *
 * CRÍTICO: ViewportGrid.tsx recrea el array `displaySets` con .map() en cada
 * render (nueva referencia, mismo contenido). Sin areEqual, los useMemo/useEffect
 * de este componente detectan "cambio" en cada render de ViewportGrid, cancelan
 * la carga en progreso y la reinician → loop de parpadeo infinito.
 */
function areEqual(prevProps: any, nextProps: any): boolean {
  // viewportType distinto → sí re-renderizar
  if (
    nextProps.viewportOptions?.viewportType &&
    prevProps.viewportOptions?.viewportType !== nextProps.viewportOptions?.viewportType
  ) {
    return false;
  }

  const prevDS = prevProps.displaySets ?? [];
  const nextDS = nextProps.displaySets ?? [];
  if (prevDS.length !== nextDS.length) return false;

  // Comparar por displaySetInstanceUID (contenido), no por referencia de array.
  for (let i = 0; i < prevDS.length; i++) {
    if (prevDS[i]?.displaySetInstanceUID !== nextDS[i]?.displaySetInstanceUID) {
      return false;
    }
  }

  if (prevProps.viewportId !== nextProps.viewportId) return false;
  if (prevProps.viewportOptions?.viewportId !== nextProps.viewportOptions?.viewportId) return false;

  return true; // props equivalentes → NO re-renderizar
}

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
  // imageIds del viewport actual; el handler IMAGE_LOADED lo usa para saber si la
  // imagen que terminó de cargar pertenece a este viewport y forzar un re-render.
  const targetImageIdsRef = useRef<Set<string> | null>(null);
  // true tras el primer IMAGE_RENDERED con voiRange válido. Controla cuándo se
  // oculta el spinner: lo mantenemos visible hasta que la imagen realmente se
  // renderiza (no solo hasta que setViewportData termina, que es sync pero la
  // carga de píxeles por red puede tardar segundos más).
  const hasFirstRenderRef = useRef(false);
  // Plan B (recuperación ante fallo de render WebGL/vtk): si el render falla por
  // textura demasiado grande para la GPU, se reduce el tamaño y se recarga.
  const usedRenderedRef = useRef(false); // el load actual usó imágenes rendered
  const recoveryPendingRef = useRef(false); // se pidió recuperación (remontaje)
  const hasRenderedOkRef = useRef(false); // true SOLO tras un IMAGE_RENDERED válido

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
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null);
  // Info de cine de la serie cargada (null = sin cine). frameCount>1 habilita la
  // barra; autoPlay arranca solo en US/RF/XA.
  const [cineInfo, setCineInfo] = useState<{
    frameCount: number;
    frameRate: number;
    autoPlay: boolean;
    dsKey: string;
  } | null>(null);

  const {
    cornerstoneViewportService,
    cornerstoneCacheService,
    toolGroupService,
    segmentationService,
    displaySetService,
  } = servicesManager.services;

  // ─── ELEMENT_ENABLED handler ───────────────────────────────────────────────
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

        console.group(`${LOG_PREFIX} 📦 LOAD #${loadId} [${viewportId}]`);
        console.log(
          'DisplaySets:',
          currentDisplaySets.map((ds: any) => ({
            uid: ds.displaySetInstanceUID?.slice(-8),
            modality: ds.Modality,
          }))
        );

        // Forzar 'stack' en mobile; solo 'volume' para datasets dinámicos
        const isDynamic = currentDisplaySets.some(
          (ds: any) => ds.isDynamicVolume && ds.isReconstructable
        );
        const mobileViewportOptions = {
          ...currentViewportOptions,
          viewportType: isDynamic ? 'volume' : 'stack',
        };

        // Asegurar un entry de options por cada displaySet
        const safeDisplaySetOptions = [...(currentDisplaySetOptions || [])];
        while (safeDisplaySetOptions.length < currentDisplaySets.length) {
          safeDisplaySetOptions.push({});
        }

        const viewportData = await cornerstoneCacheService.createViewportData(
          currentDisplaySets,
          mobileViewportOptions,
          currentDataSource,
          initialImageIndex
        );

        if (signal.aborted || !isMountedRef.current) {
          console.groupEnd();
          return;
        }

        // ── Modalidades grandes → WADO-RS rendered ────────────────────────────
        // Reemplaza los imageIds wadors (16-bit, frágiles en GPU móvil) por
        // imageIds `novarendered:` (JPEG 8-bit color, ya ventaneado y reescalado
        // por el servidor). El resto de modalidades (CT/MR, US, etc.) siguen su
        // ruta normal sin cambios.
        let usedRendered = false;
        try {
          // Tamaño de render basado en el propio viewport (CSS × dpr, render 1:1)
          // en vez de la pantalla completa → texturas más pequeñas en layouts
          // multi-viewport. getTargetRenderSize aplica además el penalti (Plan B).
          const el = elementRef.current;
          const cssLongSide = el ? Math.max(el.clientWidth, el.clientHeight) : undefined;
          (viewportData?.data ?? []).forEach((d: any, n: number) => {
            const ds = currentDisplaySets[n];
            if (!Array.isArray(d?.imageIds) || !d.imageIds.length) return;
            const renderedIds = buildRenderedImageIds(d.imageIds, ds?.Modality, {
              cssLongSide,
              viewportId,
            });
            if (renderedIds && renderedIds.length === d.imageIds.length) {
              console.log(
                `${LOG_PREFIX} 🖼️ rendered remap [${viewportId}] ${ds?.Modality}:` +
                  ` ${d.imageIds.length} img → ...${renderedIds[0].slice(-60)}`
              );
              d.imageIds = renderedIds;
              usedRendered = true;
            } else {
              // 🔬DIAG TEMPORAL: ruta NO-rendered (CT/MR/US, o DX/MG cuyo imageId no
              // casó el patrón). Carga stack normal (grayscale/color nativo).
              console.log(
                `${LOG_PREFIX} 🔬DIAG NO-rendered [${viewportId}] ${ds?.Modality}:` +
                  ` ${d.imageIds?.length ?? 0} img, scheme=${String(d.imageIds?.[0] ?? '').split(':')[0]}` +
                  ` (motivo: ${!RENDERED_MODALITIES.has(ds?.Modality) ? 'modalidad-no-grande' : 'imageId-no-casó'})`
              );
            }
          });
        } catch (e) {
          console.warn(`${LOG_PREFIX} ⚠️ remap rendered falló [${viewportId}]:`, e);
        }
        usedRenderedRef.current = usedRendered;

        // ── Instancia media como vista inicial (igual que las miniaturas) ─────
        // La tira de miniaturas usa imageIds[Math.floor(N/2)]. Para que el
        // viewport principal abra en la MISMA imagen, fijamos initialImageIndex
        // al medio cuando NO se pidió un índice explícito (p. ej. navegación a
        // una medición). setStack respeta data[0].initialImageIndex
        // (CornerstoneViewportService lo lee de viewportData.data[0]). Aplica a
        // todas las modalidades (rendered y stack nativo CT/MR/XA).
        const hasExplicitIndex =
          initialImageIndex !== undefined &&
          initialImageIndex !== null &&
          (initialImageIndex as number) >= 0;
        (viewportData?.data ?? []).forEach((d: any) => {
          const n = d?.imageIds?.length ?? 0;
          if (!n) return;
          d.initialImageIndex = hasExplicitIndex
            ? Math.min(initialImageIndex as number, n - 1)
            : Math.floor(n / 2);
        });

        // ── Info de cine para la barra de reproducción ───────────────────────
        // frameCount>1 → serie multiframe (habilita el cine). autoPlay solo en
        // US/RF/XA. El FPS sale de displaySet.FrameRate (tag 0018,1063 = tiempo de
        // frame en ms → fps = 1000/ms), con default 24.
        const cineDs = currentDisplaySets[0];
        const cineFrameCount = ((viewportData?.data ?? [])[0] as any)?.imageIds?.length ?? 0;
        const frameTimeMs = cineDs?.FrameRate;
        const cineFrameRate = frameTimeMs
          ? Math.min(Math.max(Math.round(1000 / frameTimeMs), 1), 60)
          : 24;
        setCineInfo({
          frameCount: cineFrameCount,
          frameRate: cineFrameRate,
          autoPlay: CINE_AUTOPLAY_MODALITIES.has(cineDs?.Modality),
          dsKey: currentDisplaySets.map((d: any) => d.displaySetInstanceUID).join(','),
        });

        const allImageIds: string[] = (viewportData?.data ?? []).flatMap(
          (d: any) => d?.imageIds ?? []
        );
        targetImageIdsRef.current = new Set(allImageIds);
        console.log(
          `← createViewportData OK (${(performance.now() - t0).toFixed(0)}ms)` +
            ` imageIds=${allImageIds.length} rendered=${usedRendered}`
        );

        // ── Pre-carga de la imagen rendered ACTUAL (fix del negro en 1ª carga) ───
        // setStack con un imageId `novarendered:` aún sin cargar provoca un render
        // PREMATURO con el actor de color vacío → vtk hace getProgram() null → crash
        // → negro. Al re-entrar al estudio funciona porque la imagen YA está cacheada.
        // Replicamos eso: cargamos+cacheamos la imagen actual ANTES de setViewportData,
        // de modo que setStack la encuentre lista y renderice con datos al 1er intento.
        if (usedRendered) {
          try {
            const d0 = (viewportData?.data ?? [])[0] as any;
            const ids: string[] = d0?.imageIds ?? [];
            if (ids.length) {
              // Pre-cachea la imagen que realmente se mostrará (la media), no la 0,
              // para que el spinner se oculte sobre la imagen visible.
              const idx = Math.min(Math.max(d0?.initialImageIndex ?? 0, 0), ids.length - 1);
              const preImg: any = await imageLoader.loadAndCacheImage(ids[idx]);
              // 🔬DIAG TEMPORAL: detalle de la imagen pre-cacheada (debe ser color).
              console.log(
                `${LOG_PREFIX} 📥 pre-cache OK [${viewportId}] idx=${idx}` +
                  ` color=${preImg?.color} ${preImg?.columns}x${preImg?.rows}` +
                  ` comps=${preImg?.numberOfComponents} type=${preImg?.dataType ?? preImg?.getPixelData?.()?.constructor?.name}`
              );
            }
          } catch (e) {
            console.warn(`${LOG_PREFIX} ⚠️ pre-cache rendered falló [${viewportId}]:`, e);
          }
          if (signal.aborted || !isMountedRef.current) {
            console.groupEnd();
            return;
          }
        }

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
          // NO setStatus('ready') aquí: la imagen aún no está descargada. El spinner
          // se oculta en handleImageRendered cuando voiRange es válido. Fallback de
          // 12 s para viewports sin voiRange (que nunca disparan IMAGE_RENDERED con
          // voiRange set) → así el spinner no queda bloqueado.
          const abortOnLoad = signal;
          setTimeout(() => {
            if (abortOnLoad.aborted || !isMountedRef.current || hasFirstRenderRef.current) return;
            hasFirstRenderRef.current = true;
            setStatus('ready');
            console.warn(`${LOG_PREFIX} ⚠️ Fallback 12s → status=ready [${viewportId}]`);
          }, 12000);
        }
        console.groupEnd();
      } catch (error: any) {
        console.groupEnd();
        if (signal.aborted) return;
        console.error(`${LOG_PREFIX} ❌ LOAD #${loadId} ERROR [${viewportId}]`, error);
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

    // ── Guardas de compatibilidad/cobertura ───────────────────────────────
    // 1) Sin WebGL no se puede renderizar nada en Cornerstone.
    if (!isWebGLAvailable()) {
      setUnsupportedReason(
        'Tu dispositivo o navegador no soporta la visualización de imágenes (WebGL no disponible).'
      );
      setStatus('unsupported');
      return;
    }
    // 2) Modalidades no renderizables en móvil (SEG/SR/RT/KO/PR): placeholder.
    const onlyNonRenderable =
      displaySets.length > 0 &&
      displaySets.every((ds: any) => NONRENDERABLE_MODALITIES.has(ds?.Modality));
    if (onlyNonRenderable) {
      setUnsupportedReason('Este tipo de serie no está disponible en el visor móvil.');
      setStatus('unsupported');
      return;
    }

    const dsSummary = displaySets
      .map((ds: any) => `${ds.Modality}(${ds.displaySetInstanceUID?.slice(-8)})`)
      .join(', ');
    console.group(`${LOG_PREFIX} 🚀 MOUNT [${viewportId}] — ${dsSummary}`);
    console.log('maxTextureSize:', getMaxTextureSize(), 'px');

    cornerstoneViewportService.enableViewport(viewportId, element);
    eventTarget.addEventListener(Enums.Events.ELEMENT_ENABLED, handleElementEnabled);
    console.groupEnd();

    // ── Handlers del pipeline de carga/render ──────────────────────────────

    // 1. Imagen decodificada con éxito (global). Si pertenece a este viewport,
    //    forzar un re-render para que el canvas muestre los píxeles recién
    //    cargados (cubre la brecha entre setViewportData sync y la carga async).
    const handleImageLoaded = (evt: any) => {
      // Cornerstone3D IMAGE_LOADED usa evt.detail.image.imageId
      const id: string = evt.detail?.image?.imageId ?? evt.detail?.imageId ?? '';
      if (!id || !targetImageIdsRef.current?.has(id)) return;
      const re = getRenderingEngine('OHIFCornerstoneRenderingEngine');
      if (!re) return;
      requestAnimationFrame(() => {
        if (!isMountedRef.current) return;
        re.renderViewport(viewportId);
        // 🔬DIAG TEMPORAL: detalle de la imagen que terminó de cargar.
        const im = evt.detail?.image;
        console.log(
          `${LOG_PREFIX} 🔄 Post-load render kick [${viewportId}] img=...${id.slice(-26)}` +
            ` color=${im?.color} ${im?.columns}x${im?.rows} comps=${im?.numberOfComponents}`
        );
        // Los píxeles ya están decodificados → seguro ocultar el spinner. Cubre
        // las imágenes color (rendered), que no tienen voiRange y por tanto no
        // disparan la condición de handleImageRendered.
        if (!hasFirstRenderRef.current) {
          hasFirstRenderRef.current = true;
          setStatus('ready');
          console.log(`${LOG_PREFIX} ✅ IMAGE_LOADED → status=ready [${viewportId}]`);
        }
      });
    };

    // 2. Fallo al cargar imagen (global)
    const handleImageLoadFailed = (evt: any) => {
      const id: string = evt.detail?.imageId ?? evt.detail?.image?.imageId ?? '';
      if (id && !targetImageIdsRef.current?.has(id)) return;
      console.error(
        `${LOG_PREFIX} ❌ IMAGE_LOAD_FAILED [${viewportId}] imageId=...${id.slice(-40)}`,
        evt.detail?.error ?? evt.detail
      );
      if (isMountedRef.current && !hasFirstRenderRef.current) setStatus('error');
    };

    // 3. Viewport renderizó una imagen (filtramos por viewportId). Ocultar el
    //    spinner SOLO cuando voiRange está definido (imagen realmente cargada);
    //    Cornerstone dispara un IMAGE_RENDERED temprano con voiRange=null (canvas
    //    negro) justo tras setStack.
    const handleImageRendered = (evt: any) => {
      if (evt.detail?.viewportId !== viewportId) return;
      const re2 = getRenderingEngine('OHIFCornerstoneRenderingEngine');
      const vp2 = re2?.getViewport(viewportId) as any;
      const voi2 = vp2?.getProperties?.()?.voiRange;
      // Para imágenes color (rendered) no hay voiRange; usar el primer render.
      const vpData = vp2?.getImageData?.();
      const isColor = vpData?.numberOfComponents === 3 || vpData?.numComps === 3;
      const ready = voi2 != null || isColor;
      // 🔬DIAG TEMPORAL: estado del viewport en CADA render hasta el primero válido.
      // Revela si el render se disparó con la imagen ya presente (datos) o vacío
      // (sin imagen → negro / crash de vtk).
      if (!hasFirstRenderRef.current) {
        let cam: any;
        let curId = '';
        try {
          cam = vp2?.getCamera?.();
        } catch {
          /* ignore */
        }
        try {
          curId = vp2?.getCurrentImageId?.() ?? '';
        } catch {
          /* ignore */
        }
        console.log(
          `${LOG_PREFIX} 🔬DIAG render [${viewportId}]` +
            ` voi=${voi2 ? `[${voi2.lower},${voi2.upper}]` : 'null'} color=${isColor}` +
            ` dims=${vpData?.dimensions ?? '?'} comps=${vpData?.numberOfComponents ?? vpData?.numComps ?? '?'}` +
            ` hasImage=${!!curId} cur=...${String(curId).slice(-24)} parallelScale=${cam?.parallelScale}`
        );
      }
      if (ready && !hasRenderedOkRef.current) {
        hasRenderedOkRef.current = true; // render REAL exitoso (cierra la recuperación)
        hasFirstRenderRef.current = true;
        setStatus('ready');
        console.log(`${LOG_PREFIX} ✅ Primer render OK → status=ready [${viewportId}]`);
      }
    };

    // ── Recuperación ante fallo de render WebGL/vtk ──────────────────────────
    // El PRIMER render del actor color sobre el contexto/estado vtk recién creado
    // puede fallar (shader program null → "isAttributeUsed", o pérdida de contexto)
    // → negro, e `IMAGE_RENDERED` no llega a dispararse. Confirmado: al RE-ENTRAR al
    // estudio funciona (la imagen ya está cacheada y el shader ya quedó compilado en
    // el contexto). Replicamos eso pidiendo al wrapper un REMONTAJE del viewport
    // (key nuevo → desmonta+disableElement, remonta+enableViewport → re-setStack con
    // la imagen cacheada). El wrapper, en intentos posteriores, además baja el tamaño.
    const requestRemountRecovery = (reason: string) => {
      if (
        !isMountedRef.current ||
        !usedRenderedRef.current || // solo imágenes rendered (color)
        hasRenderedOkRef.current || // ya renderizó BIEN (IMAGE_RENDERED real)
        recoveryPendingRef.current // ya se pidió la recuperación
      ) {
        return;
      }
      recoveryPendingRef.current = true;
      console.warn(`${LOG_PREFIX} ♻️ Recuperación por remontaje [${viewportId}] (${reason})`);
      props?.onRenderFailure?.();
    };

    // Crash asíncrono de vtk.js (ocurre en un rAF, fuera del stack de React → la
    // ErrorBoundary no siempre lo atrapa). Se filtra por la firma del render de vtk.
    const handleGlobalError = (e: ErrorEvent) => {
      const msg = `${e?.message ?? ''} ${(e?.error as any)?.stack ?? ''}`;
      if (/isAttributeUsed|setMapperShaderParameters|renderPiece|updateShaders/.test(msg)) {
        // 🔬DIAG TEMPORAL: crash de render de vtk.
        console.error(
          `${LOG_PREFIX} 🔬DIAG vtk-crash [${viewportId}] usedRendered=${usedRenderedRef.current}` +
            ` renderedOk=${hasRenderedOkRef.current} →`,
          e?.message
        );
        requestRemountRecovery('vtk-render');
      }
    };

    // Pérdida de contexto WebGL (típico al agotar memoria de GPU). Se dispara en el
    // <canvas> (hijo) y NO burbujea → se escucha en fase de captura sobre el element.
    const handleContextLost = (e: Event) => {
      e.preventDefault?.();
      requestRemountRecovery('webgl-context-lost');
    };

    window.addEventListener('error', handleGlobalError);
    element.addEventListener('webglcontextlost', handleContextLost, true);

    // IMAGE_LOADED e IMAGE_LOAD_FAILED: globales → eventTarget.
    eventTarget.addEventListener(Enums.Events.IMAGE_LOADED, handleImageLoaded);
    eventTarget.addEventListener(Enums.Events.IMAGE_LOAD_FAILED, handleImageLoadFailed);
    // IMAGE_RENDERED: dispara sobre el elemento DOM del viewport (no eventTarget).
    element.addEventListener(Enums.Events.IMAGE_RENDERED as any, handleImageRendered);

    // ── Gate de dimensiones ────────────────────────────────────────────────
    // En mobile el layout puede estar incompleto en el primer render; Cornerstone
    // con canvas de 0px rompe el contexto WebGL permanentemente. Esperar a tener
    // ancho/alto > 0 antes de iniciar la carga.
    const resizeObserver = new ResizeObserver(entries => {
      if (!entries?.length) return;
      const { width, height } = entries[0].contentRect;

      if (width > 0 && height > 0) {
        if (!initStartedRef.current) {
          initStartedRef.current = true;
          console.log(
            `${LOG_PREFIX} 📐 Dimensiones OK [${viewportId}]: ${Math.round(width)}×${Math.round(height)}px → iniciando carga`
          );
          const abort = new AbortController();
          loadAbortRef.current = abort;
          loadViewportData(abort.signal);
        } else if (isEnabledRef.current) {
          handleResize();
        }
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
      window.removeEventListener('error', handleGlobalError);
      element.removeEventListener('webglcontextlost', handleContextLost, true);

      const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
      if (viewportInfo) {
        try {
          // Orden correcto de limpieza (igual que OHIFCornerstoneViewport)
          cornerstoneViewportService.storePresentation({ viewportId });
          const renderingEngineId = viewportInfo.getRenderingEngineId();
          toolGroupService.removeViewportFromToolGroup(viewportId, renderingEngineId);
          segmentationService.clearSegmentationRepresentations(viewportId);
          props?.onElementDisabled?.(viewportInfo);
        } catch (_e) {
          console.warn('Cleanup parcial (viewport no completamente inicializado)');
        }
        cornerstoneViewportService.disableElement(viewportId);
      }

      viewportRef.unregister();
      console.groupEnd();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Reacción a cambios REALES de displaySet (post-montaje) ───────────────
  // Solo se dispara cuando displaySets/viewportOptions/dataSource cambian de
  // verdad. React.memo + areEqual garantiza que el componente NO se re-renderiza
  // con el mismo contenido en nueva referencia → sin falsas recargas.
  useEffect(() => {
    if (!initStartedRef.current) return; // Omitir el render inicial
    if (status === 'unsupported') return;
    console.log(`${LOG_PREFIX} 🔄 DisplaySet cambio real [${viewportId}] → reiniciando carga`);
    // Contenido nuevo → re-armar la recuperación (el wrapper resetea el penalti de
    // tamaño y el contador de remontajes por dsKey).
    recoveryPendingRef.current = false;
    hasRenderedOkRef.current = false;
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
  if (status === 'unsupported') {
    return (
      <div className="mobile-v2-container">
        <div className="mobile-v2-overlay mobile-v2-overlay--unsupported">
          <span className="mobile-v2-unsupported-text">
            {unsupportedReason ?? 'Contenido no disponible en el visor móvil.'}
          </span>
        </div>
      </div>
    );
  }

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

      {/* Barra de cine: solo para series multiframe. Auto-reproduce en US/RF/XA;
          on-demand (botón Cine de la toolbar) en el resto. key por serie → se
          remonta al cambiar de displaySet (resetea autoplay/visibilidad). */}
      {status === 'ready' && cineInfo && cineInfo.frameCount > 1 && (
        <MobileCinePlayer
          key={`cine-${cineInfo.dsKey}`}
          viewportId={viewportId}
          servicesManager={servicesManager}
          frameRate={cineInfo.frameRate}
          autoPlay={cineInfo.autoPlay}
        />
      )}
    </div>
  );
}, areEqual);

MobileViewportV2Impl.displayName = 'MobileViewportV2';

/**
 * Wrapper con ErrorBoundary + recuperación por REMONTAJE.
 *
 * Cuando el primer render del actor color falla en vtk (shader null → negro), el
 * componente interno llama `onRenderFailure`. Aquí incrementamos `remountKey`: React
 * desmonta el interno (cleanup → disableElement) y lo remonta (enableViewport →
 * re-setStack con la imagen YA cacheada y el shader ya compilado en el contexto) →
 * replica el comportamiento de "volver a entrar al estudio", que sí renderiza.
 * A partir del 2º intento, además reduce el tamaño de render (fallback de límite de
 * GPU real). El contador se resetea cuando cambia el contenido (displaySets).
 */
function MobileViewportV2WithBoundary(props: any) {
  const vpId = props.viewportOptions?.viewportId || props.viewportId;
  const [remountKey, setRemountKey] = useState(0);
  const remountsRef = useRef(0);

  // Resetear contador/penalti cuando cambia el contenido mostrado.
  const dsKey = (props.displaySets ?? [])
    .map((d: any) => d?.displaySetInstanceUID)
    .join(',');
  useEffect(() => {
    remountsRef.current = 0;
    resetRenderSize(vpId);
  }, [dsKey, vpId]);

  const onRenderFailure = useCallback(() => {
    if (remountsRef.current >= MAX_RENDER_REMOUNTS) {
      console.warn(`${LOG_PREFIX} ⛔ Remontajes agotados [${vpId}] — se deja de reintentar`);
      return;
    }
    remountsRef.current += 1;
    // 1er intento: solo remontar (mismo tamaño). Siguientes: además bajar el tamaño
    // por si fuera un límite de GPU real.
    if (remountsRef.current >= 2) {
      reduceRenderSize(vpId);
    }
    console.warn(
      `${LOG_PREFIX} ♻️ Remontaje de recuperación [${vpId}] intento ${remountsRef.current}` +
        `${remountsRef.current >= 2 ? ' (+reduce tamaño)' : ''}`
    );
    // pequeño respiro antes de remontar (deja terminar el frame que crasheó)
    setTimeout(() => setRemountKey(k => k + 1), 150);
  }, [vpId]);

  return (
    <ViewportErrorBoundary viewportId={vpId}>
      <MobileViewportV2Impl key={remountKey} {...props} onRenderFailure={onRenderFailure} />
    </ViewportErrorBoundary>
  );
}

export default MobileViewportV2WithBoundary;
