import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import { useViewportRef } from '@ohif/core';
import * as pdfjsLib from 'pdfjs-dist';
import { pdfViewportRegistry } from '../pdfViewportRegistry';

pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || '/'}pdf.worker.js`;

// ─── Constants ────────────────────────────────────────────────────────────────
const MIN_SCALE = 0.25;
const MAX_SCALE = 5.0;
const SCALE_STEP = 0.25;
const INITIAL_SCALE = 0.5;

// Espaciado del layout NATURAL (escala 1). Importante: estos valores viven DENTRO
// del nodo escalado por transform, así que se escalan junto con las páginas → la
// geometría del zoom es uniforme (clave para que el anclaje de scroll sea exacto).
const PAGE_MARGIN = 8; // arriba + abajo de cada página
const WRAP_PADDING = 4; // izquierda + derecha del wrapper

// Lado máximo del bitmap de canvas (px). Evita agotar memoria/GPU en móvil al
// renderizar a alta resolución (renderScale × devicePixelRatio puede dispararse).
const MAX_CANVAS_SIDE = 4096;

// ─── Types ────────────────────────────────────────────────────────────────────
type LoadState = 'fetching' | 'rendering' | 'ready' | 'error';
type Size = { width: number; height: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTouchDist(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─── PdfPage Component (Double-Buffered) ──────────────────────────────────────
//
// La página se DIMENSIONA en su tamaño NATURAL (escala 1, = `baseSize`). El zoom
// visual lo aplica el `transform: scale()` del contenedor padre (`inner`), no el
// tamaño CSS de la página. El bitmap del canvas se renderiza a `renderScale × dpr`
// (acotado) para nitidez, pero su tamaño en pantalla siempre es `width/height:100%`
// del box natural → el transform del padre lo escala sin recomputar layout.
function PdfPage({
  pdf,
  pageNum,
  renderScale,
  isVisible,
  baseSize,
}: {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  renderScale: number;
  isVisible: boolean;
  baseSize: Size | null;
}) {
  const activeCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const lastRenderedScaleRef = useRef(0);

  // Render a alta resolución cuando cambia renderScale y la página es visible.
  useEffect(() => {
    if (!isVisible || !baseSize || !pdf) return;
    if (Math.abs(renderScale - lastRenderedScaleRef.current) < 0.001) return;

    let mounted = true;

    const render = async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (!mounted) return;

        renderTaskRef.current?.cancel();

        const dpr = window.devicePixelRatio || 1;
        const natural = page.getViewport({ scale: 1 });
        // Tope de resolución: nunca exceder MAX_CANVAS_SIDE en el lado mayor.
        const capScale = MAX_CANVAS_SIDE / Math.max(natural.width, natural.height);
        const targetScale = Math.min(renderScale * dpr, capScale);
        const viewport = page.getViewport({ scale: targetScale });

        // 1. Render a canvas offscreen (doble buffer → sin parpadeo).
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = Math.ceil(viewport.width);
        offscreenCanvas.height = Math.ceil(viewport.height);
        const ctx = offscreenCanvas.getContext('2d');
        if (!ctx) return;

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;

        await task.promise;
        if (!mounted) return;

        // 2. Volcar el buffer al canvas visible.
        const activeCanvas = activeCanvasRef.current;
        if (activeCanvas) {
          activeCanvas.width = offscreenCanvas.width;
          activeCanvas.height = offscreenCanvas.height;
          activeCanvas.getContext('2d')?.drawImage(offscreenCanvas, 0, 0);
        }

        lastRenderedScaleRef.current = renderScale;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`[MobilePdf] Page ${pageNum} render error:`, err);
        }
      }
    };

    render();
    return () => {
      mounted = false;
    };
  }, [pdf, pageNum, renderScale, isVisible, baseSize]);

  // Cancelar tarea de render pendiente al desmontar.
  useEffect(() => () => renderTaskRef.current?.cancel(), []);

  // Tamaño CSS NATURAL (el transform del padre aplica el zoom).
  const width = baseSize ? `${baseSize.width}px` : 'auto';
  const height = baseSize ? `${baseSize.height}px` : 'auto';

  return (
    <div
      data-page={pageNum}
      style={{
        width,
        height,
        flexShrink: 0,
        margin: `${PAGE_MARGIN}px 0`,
        position: 'relative',
        backgroundColor: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
      }}
    >
      <canvas
        ref={activeCanvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
      {!baseSize && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: '#7b8b9f', fontSize: 12 }}>Cargando...</span>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
function MobilePdfViewport({ displaySets, viewportId = 'mobile-pdf-viewport' }) {
  const [loadState, setLoadState] = useState<LoadState>('fetching');
  const [fetchProgress, setFetchProgress] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  // `scale` = ÚNICA fuente de verdad del zoom (aplicada como transform sobre `inner`).
  // `renderScale` = escala "comprometida" para la nitidez del bitmap (se actualiza al
  // terminar el gesto / al usar los botones, no en cada frame del pinch).
  const [scale, setScale] = useState(INITIAL_SCALE);
  const [renderScale, setRenderScale] = useState(INITIAL_SCALE);
  const [baseSize, setBaseSize] = useState<Size | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Páginas visibles (render perezoso).
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));

  const viewportElementRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useViewportRef(viewportId);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sizerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Scroll a aplicar tras el commit de React (solo para zoom por botón).
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);

  // Escala "viva" leída por los manejadores táctiles sin closures obsoletos.
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // Tamaño NATURAL (escala 1) del contenido: ancho de página + padding, alto =
  // suma de páginas + márgenes. Asume páginas homogéneas (igual que el render).
  const naturalW = baseSize ? baseSize.width + WRAP_PADDING * 2 : 0;
  const naturalH = baseSize ? totalPages * (baseSize.height + PAGE_MARGIN * 2) : 0;
  const naturalSizeRef = useRef({ w: naturalW, h: naturalH });
  naturalSizeRef.current = { w: naturalW, h: naturalH };

  // ── Aplicar el scroll pendiente (zoom por botón) antes de pintar ────────────
  // El pinch ya ajusta el scroll en vivo (vía refs) y comitea la MISMA escala, así
  // que tras su commit no hay pendiente → el scroll se queda donde lo dejó el gesto
  // (sin saltos). Solo los botones encolan un scroll a aplicar aquí.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (pendingScrollRef.current && container) {
      container.scrollLeft = pendingScrollRef.current.left;
      container.scrollTop = pendingScrollRef.current.top;
      pendingScrollRef.current = null;
    }
  }, [scale]);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      viewportRef.unregister();
      pdfViewportRegistry.delete(viewportId);
      pdfDocRef.current?.destroy();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch PDF bytes and load with PDF.js ─────────────────────────────────────
  const renderedUrlDep = displaySets?.[0]?.renderedUrl;
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadState('fetching');
      setFetchProgress(0);
      setTotalPages(0);
      setCurrentPage(1);

      try {
        if (!displaySets?.[0]) throw new Error('Sin displaySet para el PDF');
        const resolvedUrl: string = await displaySets[0].renderedUrl;
        if (cancelled) return;
        setFallbackUrl(resolvedUrl);

        const response = await fetch(resolvedUrl, {
          credentials: 'include',
          headers: { Accept: 'application/pdf, application/octet-stream, */*' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const contentLength = response.headers.get('Content-Length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
        let receivedBytes = 0;
        const chunks: Uint8Array[] = [];

        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done || cancelled) break;
            chunks.push(value);
            receivedBytes += value.length;
            if (totalBytes > 0) {
              setFetchProgress(Math.min(90, Math.round((receivedBytes / totalBytes) * 100)));
            } else {
              setFetchProgress(prev => Math.min(prev + 3, 80));
            }
          }
        } else {
          const buf = await response.arrayBuffer();
          if (cancelled) return;
          chunks.push(new Uint8Array(buf));
        }
        if (cancelled) return;

        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        const pdfData = new Uint8Array(totalLen);
        let off = 0;
        for (const chunk of chunks) {
          pdfData.set(chunk, off);
          off += chunk.length;
        }

        const blob = new Blob([pdfData], { type: 'application/pdf' });
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(blob);
        pdfViewportRegistry.set(viewportId, blobUrlRef.current);

        setFetchProgress(95);
        setLoadState('rendering');

        const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
        if (cancelled) {
          pdfDoc.destroy();
          return;
        }

        pdfDocRef.current = pdfDoc;
        setTotalPages(pdfDoc.numPages);

        // Tamaño base de la página 1 → relación de aspecto del layout.
        if (pdfDoc.numPages > 0) {
          const page1 = await pdfDoc.getPage(1);
          const vp1 = page1.getViewport({ scale: 1 });
          setBaseSize({ width: vp1.width, height: vp1.height });
        }

        setFetchProgress(100);
        setLoadState('ready');
      } catch (err: any) {
        if (cancelled) return;
        console.error('[MobilePdf] Load failed:', err);
        setErrorMsg(err?.message ?? 'Error desconocido');
        setLoadState('error');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedUrlDep]);

  // ── Pinch-to-zoom (modelo sizer + transform-origin 0 0) ─────────────────────
  //
  // La escala es la ÚNICA fuente de verdad. El nodo `inner` (con las páginas a
  // tamaño natural) se escala con `transform: scale(s)` y `transform-origin: 0 0`;
  // el `sizer` reserva el área scrolleable (= natural × s). Como TODO el contenido
  // (incluidos márgenes/padding) vive dentro del nodo escalado, el mapeo es uniforme:
  //   punto-contenido c  →  pantalla = c·s − scroll
  // por lo que anclar un punto bajo los dedos es exacto, sin "hornear" tamaños ni
  // recomputar scroll en un sistema de coordenadas distinto (origen del bug previo:
  // centrado condicional + márgenes que no escalaban + clamping).
  useEffect(() => {
    if (loadState !== 'ready') return;
    const container = scrollContainerRef.current;
    const sizer = sizerRef.current;
    const inner = innerRef.current;
    if (!container || !sizer || !inner) return;

    let startDist = 0;
    let startScale = 1;
    // Punto de contenido (coords escala 1) bajo el punto medio de los dedos.
    let anchorContentX = 0;
    let anchorContentY = 0;
    // Offset del punto medio respecto al borde del contenedor (constante en el gesto).
    let midOffsetX = 0;
    let midOffsetY = 0;
    let liveScale = 1;
    let gestureActive = false;
    let pinchEndTime = 0;

    const applyLiveScale = (s: number) => {
      liveScale = s;
      const { w, h } = naturalSizeRef.current;
      // Crecer el área scrolleable en vivo para que el anclaje no quede recortado.
      sizer.style.width = `${w * s}px`;
      sizer.style.height = `${h * s}px`;
      inner.style.transform = `scale(${s})`;
      // Anclar: el punto de contenido bajo los dedos cae en c·s; el scroll lo lleva
      // de vuelta bajo el punto medio (offset respecto al contenedor).
      container.scrollLeft = anchorContentX * s - midOffsetX;
      container.scrollTop = anchorContentY * s - midOffsetY;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();

      gestureActive = true;
      startDist = getTouchDist(e.touches);
      startScale = scaleRef.current;
      liveScale = startScale;

      const rect = container.getBoundingClientRect();
      const midClientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midClientY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      midOffsetX = midClientX - rect.left;
      midOffsetY = midClientY - rect.top;
      // Punto de contenido bajo los dedos en escala 1.
      anchorContentX = (container.scrollLeft + midOffsetX) / startScale;
      anchorContentY = (container.scrollTop + midOffsetY) / startScale;

      inner.style.willChange = 'transform';
    };

    const onTouchMove = (e: TouchEvent) => {
      // Tras un pinch, ignora el arrastre/scroll con el dedo que queda un instante.
      if (e.touches.length === 1 && Date.now() - pinchEndTime < 350) {
        e.preventDefault();
        return;
      }
      if (e.touches.length !== 2 || !gestureActive) return;
      e.preventDefault();

      const dist = getTouchDist(e.touches);
      const next = clamp((dist / startDist) * startScale, MIN_SCALE, MAX_SCALE);
      applyLiveScale(next);
    };

    const onPinchEnd = (e: TouchEvent) => {
      // Ventana de gracia: bloquea el touch-end del segundo dedo (evita snap nativo).
      if (!gestureActive && Date.now() - pinchEndTime < 350) {
        e.preventDefault();
        return;
      }
      if (!gestureActive || e.touches.length >= 2) return;
      e.preventDefault();

      gestureActive = false;
      pinchEndTime = Date.now();
      inner.style.willChange = 'auto';

      // Comitear la MISMA escala que ya está pintada en vivo. React re-renderiza el
      // sizer/inner a esos mismos valores → sin cambio visual → SIN SALTO. El scroll
      // ya quedó anclado por applyLiveScale, así que NO encolamos pendingScroll.
      const committed = parseFloat(liveScale.toFixed(3));
      scaleRef.current = committed;
      setScale(committed);
      setRenderScale(committed); // nitidez del bitmap al nivel final
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onPinchEnd, { passive: false });
    container.addEventListener('touchcancel', onPinchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onPinchEnd);
      container.removeEventListener('touchcancel', onPinchEnd);
    };
  }, [loadState]);

  // ── IntersectionObserver: render perezoso + página actual ───────────────────
  useEffect(() => {
    if (loadState !== 'ready') return;
    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      entries => {
        setVisiblePages(prev => {
          const next = new Set(prev);
          entries.forEach(entry => {
            const pageNum = parseInt((entry.target as HTMLElement).dataset.page ?? '1', 10);
            if (entry.isIntersecting) {
              next.add(pageNum);
              setCurrentPage(pageNum);
            } else {
              next.delete(pageNum);
            }
          });
          return next;
        });
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    );

    scrollContainerRef.current
      ?.querySelectorAll('[data-page]')
      .forEach(el => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, [loadState, totalPages]);

  // ── Ref Callbacks ─────────────────────────────────────────────────────────────
  const registerRef = useCallback(
    (el: HTMLDivElement | null) => {
      viewportElementRef.current = el;
      if (el) viewportRef.register(el);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Zoom por botón: ancla el centro del contenedor y encola el scroll para después
  // del commit (useLayoutEffect), manteniendo el centro visual estable.
  const applyScaleAnchored = (target: number) => {
    const next = clamp(parseFloat(target.toFixed(3)), MIN_SCALE, MAX_SCALE);
    const container = scrollContainerRef.current;
    if (container) {
      const midX = container.clientWidth / 2;
      const midY = container.clientHeight / 2;
      const cur = scaleRef.current;
      const contentX = (container.scrollLeft + midX) / cur;
      const contentY = (container.scrollTop + midY) / cur;
      pendingScrollRef.current = {
        left: contentX * next - midX,
        top: contentY * next - midY,
      };
    }
    scaleRef.current = next;
    setScale(next);
    setRenderScale(next);
  };

  const zoomIn = () => applyScaleAnchored(scaleRef.current + SCALE_STEP);
  const zoomOut = () => applyScaleAnchored(scaleRef.current - SCALE_STEP);
  const zoomReset = () => applyScaleAnchored(1.0);

  const openInNewTab = () => {
    const url = blobUrlRef.current || fallbackUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loadState === 'fetching' || loadState === 'rendering') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-black">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{ borderColor: '#1a2940', borderTopColor: '#4a9eff' }}
        />
        <div
          className="overflow-hidden rounded-full"
          style={{ width: 180, height: 4, backgroundColor: '#1a2940' }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${fetchProgress}%`, backgroundColor: '#4a9eff' }}
          />
        </div>
        <span style={{ fontSize: 11, color: '#7b8b9f' }}>
          {loadState === 'fetching' ? 'Descargando PDF…' : 'Preparando páginas…'}
        </span>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (loadState === 'error') {
    return (
      <div
        ref={registerRef}
        className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black p-6"
        data-viewport-id={viewportId}
      >
        <svg
          style={{ width: 52, height: 52, color: '#1a2940' }}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <div className="text-center">
          <p
            className="text-sm font-medium"
            style={{ color: '#fff' }}
          >
            No se pudo cargar el PDF
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: '#7b8b9f' }}
          >
            {errorMsg}
          </p>
        </div>
        {fallbackUrl && (
          <button
            onClick={openInNewTab}
            className="flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium"
            style={{
              backgroundColor: 'rgba(74,158,255,0.15)',
              border: '1px solid #4a9eff',
              color: '#4a9eff',
            }}
          >
            <OpenIcon /> Abrir PDF
          </button>
        )}
      </div>
    );
  }

  // ── Ready ─────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={registerRef}
      className="flex h-full w-full flex-col bg-black"
      data-viewport-id={viewportId}
    >
      {/* Scroll container. touch-action: pan-x pan-y → permite scroll con 1 dedo y
          deja que el handler de 2 dedos haga preventDefault del pinch nativo. */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          backgroundColor: '#1a1a1a',
          position: 'relative',
          touchAction: 'pan-x pan-y',
        }}
      >
        {/* Sizer: reserva el área scrolleable (= natural × scale). */}
        <div
          ref={sizerRef}
          style={{
            position: 'relative',
            width: naturalW ? `${naturalW * scale}px` : '100%',
            height: naturalH ? `${naturalH * scale}px` : 'auto',
            // El fondo oscuro llena el viewport aunque el contenido sea pequeño.
            minWidth: '100%',
            minHeight: '100%',
          }}
        >
          {/* Inner: páginas a tamaño NATURAL, escaladas por transform (origen 0 0). */}
          <div
            ref={innerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: naturalW ? `${naturalW}px` : 'max-content',
              transformOrigin: '0 0',
              transform: `scale(${scale})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: `0 ${WRAP_PADDING}px`,
            }}
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
              <PdfPage
                key={pageNum}
                pdf={pdfDocRef.current!}
                pageNum={pageNum}
                renderScale={renderScale}
                isVisible={visiblePages.has(pageNum)}
                baseSize={baseSize}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-3 py-2"
        style={{ borderTop: '1px solid #1a2940', backgroundColor: '#000' }}
      >
        <span style={{ fontSize: 11, color: '#7b8b9f', minWidth: 60 }}>
          {currentPage} / {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <ToolbarBtn
            onClick={zoomOut}
            title="Reducir zoom"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6"
              />
            </svg>
          </ToolbarBtn>
          <button
            onClick={zoomReset}
            style={{
              fontSize: 11,
              color: '#7b8b9f',
              backgroundColor: 'transparent',
              border: '1px solid #1a2940',
              borderRadius: 4,
              padding: '2px 6px',
              minWidth: 44,
              textAlign: 'center',
            }}
          >
            {Math.round(scale * 100)}%
          </button>
          <ToolbarBtn
            onClick={zoomIn}
            title="Aumentar zoom"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"
              />
            </svg>
          </ToolbarBtn>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={blobUrlRef.current ?? fallbackUrl ?? '#'}
            download="documento.pdf"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              border: '1px solid #1a2940',
              borderRadius: 4,
              color: '#7b8b9f',
            }}
            title="Descargar PDF"
          >
            <DownloadIcon />
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  title,
  primary = false,
  children,
}: {
  onClick: () => void;
  title: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: 4,
        border: primary ? '1px solid #4a9eff' : '1px solid #1a2940',
        backgroundColor: primary ? 'rgba(74,158,255,0.12)' : 'transparent',
        color: primary ? '#4a9eff' : '#7b8b9f',
      }}
    >
      {children}
    </button>
  );
}

function OpenIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  );
}

export default MobilePdfViewport;
