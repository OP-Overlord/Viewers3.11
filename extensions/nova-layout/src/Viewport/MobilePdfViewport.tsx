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
function PdfPage({
  pdf,
  pageNum,
  visualScale,
  renderScale,
  isVisible,
  baseSize,
}: {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  visualScale: number;
  renderScale: number;
  isVisible: boolean;
  baseSize: Size | null;
}) {
  const activeCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const [lastRenderedScale, setLastRenderedScale] = useState(0);

  // High-res rendering logic triggered when renderScale changes and page is visible
  useEffect(() => {
    if (!isVisible || !baseSize || !pdf) return;
    if (renderScale === lastRenderedScale) return;

    let mounted = true;

    const render = async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (!mounted) return;

        if (renderTaskRef.current) renderTaskRef.current.cancel();

        // 1. Render to offscreen canvas
        const offscreenCanvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: renderScale * dpr });

        offscreenCanvas.width = viewport.width;
        offscreenCanvas.height = viewport.height;
        const ctx = offscreenCanvas.getContext('2d');
        if (!ctx) return;

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;

        await task.promise;
        if (!mounted) return;

        // 2. Draw offscreen buffer to active visible canvas (eliminates flicker)
        const activeCanvas = activeCanvasRef.current;
        if (activeCanvas) {
          activeCanvas.width = offscreenCanvas.width;
          activeCanvas.height = offscreenCanvas.height;
          const activeCtx = activeCanvas.getContext('2d');
          activeCtx?.drawImage(offscreenCanvas, 0, 0);
        }

        setLastRenderedScale(renderScale);
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
  }, [pdf, pageNum, renderScale, isVisible, baseSize, lastRenderedScale]);

  // CSS size based on visualScale
  const width = baseSize ? `${baseSize.width * visualScale}px` : 'auto';
  const height = baseSize ? `${baseSize.height * visualScale}px` : 'auto';

  return (
    <div
      data-page={pageNum}
      style={{
        width,
        height,
        padding: 0,
        margin: '8px 0',
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
  const [visualScale, setVisualScale] = useState(INITIAL_SCALE);
  const [renderScale, setRenderScale] = useState(INITIAL_SCALE);
  const [baseSize, setBaseSize] = useState<Size | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // To track which pages are currently visible (for lazy rendering)
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));

  const viewportElementRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useViewportRef(viewportId);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pagesWrapperRef = useRef<HTMLDivElement | null>(null);

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);

  // Apply scheduled scroll immediately after React commits the new DOM sizes
  // but *before* the browser paints, eliminating any visual jumps to the top-left.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (pendingScrollRef.current && container) {
      const pending = pendingScrollRef.current;
      console.log('[PINCH-DEBUG] useLayoutEffect FIRING', {
        pendingLeft: pending.left,
        pendingTop: pending.top,
        containerScrollWidth: container.scrollWidth,
        containerScrollHeight: container.scrollHeight,
        containerClientWidth: container.clientWidth,
        containerClientHeight: container.clientHeight,
        maxScrollLeft: container.scrollWidth - container.clientWidth,
        maxScrollTop: container.scrollHeight - container.clientHeight,
        visualScale,
      });

      if (pagesWrapperRef.current) {
        pagesWrapperRef.current.style.transform = '';
        pagesWrapperRef.current.style.transformOrigin = '';
        pagesWrapperRef.current.style.willChange = 'auto';
      }

      // Force synchronous reflow: the browser must recalculate layout
      // after clearing the CSS transform, otherwise it still thinks the
      // content is small and clamps scroll to 0.
      void container.offsetHeight;

      console.log('[PINCH-DEBUG] useLayoutEffect AFTER reflow, BEFORE scroll set', {
        scrollWidth: container.scrollWidth,
        scrollHeight: container.scrollHeight,
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
        maxScrollLeft: container.scrollWidth - container.clientWidth,
        maxScrollTop: container.scrollHeight - container.clientHeight,
      });

      container.scrollLeft = pending.left;
      container.scrollTop = pending.top;

      console.log('[PINCH-DEBUG] useLayoutEffect AFTER setting scroll', {
        actualScrollLeft: container.scrollLeft,
        actualScrollTop: container.scrollTop,
      });

      pendingScrollRef.current = null;
    } else {
      console.log('[PINCH-DEBUG] useLayoutEffect called but NO pending scroll', {
        hasPending: !!pendingScrollRef.current,
        hasContainer: !!scrollContainerRef.current,
        visualScale,
      });
    }
  }, [visualScale]);

  // Store refs safely for async events
  const visualScaleRef = useRef(visualScale);
  useEffect(() => {
    visualScaleRef.current = visualScale;
  }, [visualScale]);

  // ── DEBUG: Monitor scroll changes ──────────────────────────────────────────
  useEffect(() => {
    if (loadState !== 'ready') return;
    const container = scrollContainerRef.current;
    if (!container) return;

    let lastScrollLeft = container.scrollLeft;
    let lastScrollTop = container.scrollTop;

    const onScroll = () => {
      const newLeft = container.scrollLeft;
      const newTop = container.scrollTop;
      const deltaLeft = newLeft - lastScrollLeft;
      const deltaTop = newTop - lastScrollTop;

      // Only log significant jumps (> 50px) to reduce noise
      if (Math.abs(deltaLeft) > 50 || Math.abs(deltaTop) > 50) {
        console.warn('[PINCH-DEBUG] SCROLL JUMP detected!', {
          fromLeft: lastScrollLeft,
          fromTop: lastScrollTop,
          toLeft: newLeft,
          toTop: newTop,
          deltaLeft,
          deltaTop,
          timestamp: Date.now(),
        });
        console.trace('[PINCH-DEBUG] Scroll jump stack trace');
      }
      lastScrollLeft = newLeft;
      lastScrollTop = newTop;
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [loadState]);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      viewportRef.unregister();
      pdfViewportRegistry.delete(viewportId);
      pdfDocRef.current?.destroy();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // ── Fetch PDF bytes and load with PDF.js ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadState('fetching');
      setFetchProgress(0);
      setTotalPages(0);
      setCurrentPage(1);

      try {
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

        // Fetch base size of page 1 to establish aspect ratio
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
  }, [displaySets[0].renderedUrl]);

  // ── Pinch-to-zoom (Fixed) ───────────────────────────────────────────────────
  //
  // Use CSS `transform` on the inner wrappers during the pinch. When it completes,
  // bake the scale into `visualScale`, adjust scroll perfectly so the center point
  // remains unchanged, and finally trigger `renderScale` for a crisp high-res update.
  //
  useEffect(() => {
    if (loadState !== 'ready') return;
    const container = scrollContainerRef.current;
    const wrapper = pagesWrapperRef.current;
    if (!container || !wrapper) return;

    let startDist = 0;
    let startScale = 1;
    let startScrollLeft = 0;
    let startScrollTop = 0;

    // Midpoint in client coordinates
    let midClientX = 0;
    let midClientY = 0;

    let currentFactor = 1;
    let gestureActive = false;
    let pinchEndTime = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();

      gestureActive = true;
      currentFactor = 1;

      midClientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      midClientY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      startDist = getTouchDist(e.touches);
      startScale = visualScaleRef.current;
      startScrollLeft = container.scrollLeft;
      startScrollTop = container.scrollTop;

      const rect = container.getBoundingClientRect();
      const originX = startScrollLeft + (midClientX - rect.left);
      const originY = startScrollTop + (midClientY - rect.top);

      wrapper.style.transformOrigin = `${originX}px ${originY}px`;
      wrapper.style.transform = 'scale(1)';
      wrapper.style.willChange = 'transform';

      console.log('[PINCH-DEBUG] touchstart (2 fingers)', {
        startDist,
        startScale,
        startScrollLeft,
        startScrollTop,
        midClientX,
        midClientY,
        originX,
        originY,
        containerRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      // Prevent single-touch drag instantly after zoom ends
      if (e.touches.length === 1 && Date.now() - pinchEndTime < 400) {
        e.preventDefault();
        return;
      }
      if (e.touches.length !== 2 || !gestureActive) return;
      e.preventDefault();

      const dist = getTouchDist(e.touches);
      currentFactor = clamp(dist / startDist, MIN_SCALE / startScale, MAX_SCALE / startScale);

      // Smooth CSS scale during gesture
      wrapper.style.transform = `scale(${currentFactor})`;
    };

    const onPinchEnd = (e: TouchEvent) => {
      console.log('[PINCH-DEBUG] touchend/touchcancel', {
        touchesRemaining: e.touches.length,
        gestureActive,
        timeSincePinchEnd: Date.now() - pinchEndTime,
        currentScrollLeft: container.scrollLeft,
        currentScrollTop: container.scrollTop,
        eventType: e.type,
      });

      // Block any touch-end shortly after pinch to prevent browser scroll snapping
      // when the remaining finger is lifted.
      if (!gestureActive && Date.now() - pinchEndTime < 400) {
        e.preventDefault();
        console.log('[PINCH-DEBUG] touchend BLOCKED (post-pinch grace period)');
        return;
      }

      if (!gestureActive || e.touches.length >= 2) return;
      e.preventDefault(); // Prevent browser default scroll behavior on pinch end
      gestureActive = false;
      pinchEndTime = Date.now();

      const newScale = clamp(
        parseFloat((startScale * currentFactor).toFixed(2)),
        MIN_SCALE,
        MAX_SCALE
      );
      const f = newScale / startScale;

      // DO NOT remove wrapper.style.transform here! If we do, the browser will paint a frame
      // with no transform (1.0x size) *before* React synchronously updates the node sizes,
      // causing a violent flash to the top-left. We queue it for `useLayoutEffect`.

      // Adjust scroll to maintain visual center
      const rect = container.getBoundingClientRect();
      const newScrollLeft = startScrollLeft * f + (midClientX - rect.left) * (f - 1);
      const newScrollTop = startScrollTop * f + (midClientY - rect.top) * (f - 1);

      console.log('[PINCH-DEBUG] PINCH END - computing new scroll', {
        startScale,
        currentFactor,
        newScale,
        f,
        startScrollLeft,
        startScrollTop,
        midClientX,
        midClientY,
        rectLeft: rect.left,
        rectTop: rect.top,
        newScrollLeft,
        newScrollTop,
        currentScrollLeft: container.scrollLeft,
        currentScrollTop: container.scrollTop,
        wrapperTransform: wrapper.style.transform,
        wrapperTransformOrigin: wrapper.style.transformOrigin,
      });

      // Queue instantaneous scroll layout calculation before browser repaints
      pendingScrollRef.current = { left: newScrollLeft, top: newScrollTop };

      setVisualScale(newScale);
      setRenderScale(newScale);
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
      if (wrapper) {
        wrapper.style.transform = '';
        wrapper.style.transformOrigin = '';
      }
    };
  }, [loadState]);

  // ── IntersectionObserver: Lazy rendering logic ──────────────────────────────
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
  const registerRef = useCallback((el: HTMLDivElement | null) => {
    viewportElementRef.current = el;
    if (el) viewportRef.register(el);
  }, []);

  const changeScale = (newScale: number) => {
    setVisualScale(newScale);
    setRenderScale(newScale);
  };

  const zoomIn = () =>
    changeScale(
      clamp(parseFloat((visualScaleRef.current + SCALE_STEP).toFixed(2)), MIN_SCALE, MAX_SCALE)
    );
  const zoomOut = () =>
    changeScale(
      clamp(parseFloat((visualScaleRef.current - SCALE_STEP).toFixed(2)), MIN_SCALE, MAX_SCALE)
    );
  const zoomReset = () => changeScale(1.0);

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
      {/* Scroll container */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          backgroundColor: '#1a1a1a',
          position: 'relative',
        }}
      >
        {/* Pages wrapper */}
        <div
          ref={pagesWrapperRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: 'max-content',
            padding: '0 4px',
          }}
        >
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
            <PdfPage
              key={pageNum}
              pdf={pdfDocRef.current!}
              pageNum={pageNum}
              visualScale={visualScale}
              renderScale={renderScale}
              isVisible={visiblePages.has(pageNum)}
              baseSize={baseSize}
            />
          ))}
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
            {Math.round(visualScale * 100)}%
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
