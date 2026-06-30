import React, { useEffect, useState, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { useViewportRef } from '@ohif/core';
import * as pdfjsLib from 'pdfjs-dist';
import { pdfViewportRegistry } from '../pdfViewportRegistry';

pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || '/'}pdf.worker.js`;

// ─── Constants ────────────────────────────────────────────────────────────────
const MIN_SCALE = 0.2;
const MAX_SCALE = 6.0;
const ZOOM_FACTOR = 1.4; // factor multiplicativo de los botones (+/-)

// Espaciado del layout en coords NATURALES (escala 1). Como TODO el contenido vive
// dentro del nodo escalado por `transform`, estos valores se escalan junto con las
// páginas → la geometría del zoom es perfectamente uniforme.
const PAGE_GAP = 12; // separación vertical entre páginas
const SIDE_PAD = 8; // margen izq/der del contenido
const EDGE_PAD = 12; // margen superior/inferior del contenido

// Lado máximo del bitmap del canvas (px). Evita agotar memoria/GPU en móvil cuando
// renderScale × devicePixelRatio se dispara en páginas grandes.
const MAX_CANVAS_SIDE = 4096;

// ─── Types ────────────────────────────────────────────────────────────────────
type LoadState = 'fetching' | 'rendering' | 'ready' | 'error';
type Size = { width: number; height: number };
type Transform = { scale: number; tx: number; ty: number };
type Layout = { offsets: number[]; naturalW: number; naturalH: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTouchDist(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// Layout vertical analítico a partir de los tamaños naturales de cada página.
// Devuelve el `top` natural de cada página y el tamaño total natural del contenido.
function computeLayout(sizes: Size[]): Layout {
  const offsets: number[] = [];
  let y = EDGE_PAD;
  let maxW = 0;
  for (const s of sizes) {
    offsets.push(y);
    y += s.height + PAGE_GAP;
    maxW = Math.max(maxW, s.width);
  }
  const naturalW = maxW + SIDE_PAD * 2;
  const naturalH = sizes.length ? y - PAGE_GAP + EDGE_PAD : 0;
  return { offsets, naturalW, naturalH };
}

// ─── PdfPage (doble buffer, posicionada de forma absoluta) ──────────────────────
//
// La página se DIMENSIONA a su tamaño NATURAL (escala 1). El zoom visual lo aplica
// el `transform` del nodo padre. El bitmap del canvas se renderiza a
// `renderScale × dpr` (acotado a MAX_CANVAS_SIDE) para nitidez, pero su caja CSS
// siempre es el tamaño natural → el transform del padre lo escala sin reflow.
const PdfPage = React.memo(function PdfPage({
  pdf,
  pageNum,
  size,
  left,
  top,
  renderScale,
  isVisible,
}: {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  size: Size;
  left: number;
  top: number;
  renderScale: number;
  isVisible: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const lastScaleRef = useRef(0);

  useEffect(() => {
    if (!isVisible || !pdf) return;
    // Re-render solo si la resolución cambió de forma apreciable (o nunca se pintó).
    if (Math.abs(renderScale - lastScaleRef.current) < 0.01) return;

    let mounted = true;
    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (!mounted) return;
        taskRef.current?.cancel();

        const dpr = window.devicePixelRatio || 1;
        const natural = page.getViewport({ scale: 1 });
        const cap = MAX_CANVAS_SIDE / Math.max(natural.width, natural.height);
        const target = Math.min(renderScale * dpr, cap);
        const vp = page.getViewport({ scale: target });

        // 1. Render a canvas offscreen (doble buffer → sin parpadeo).
        const off = document.createElement('canvas');
        off.width = Math.ceil(vp.width);
        off.height = Math.ceil(vp.height);
        const ctx = off.getContext('2d');
        if (!ctx) return;

        const task = page.render({ canvasContext: ctx, viewport: vp });
        taskRef.current = task;
        await task.promise;
        if (!mounted) return;

        // 2. Volcar el buffer al canvas visible.
        const cv = canvasRef.current;
        if (cv) {
          cv.width = off.width;
          cv.height = off.height;
          cv.getContext('2d')?.drawImage(off, 0, 0);
        }
        lastScaleRef.current = renderScale;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`[MobilePdf] Page ${pageNum} render error:`, err);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [pdf, pageNum, renderScale, isVisible]);

  useEffect(() => () => taskRef.current?.cancel(), []);

  return (
    <div
      data-page={pageNum}
      style={{
        position: 'absolute',
        left,
        top,
        width: size.width,
        height: size.height,
        backgroundColor: '#fff',
        boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
});

// ─── Component ────────────────────────────────────────────────────────────────
function MobilePdfViewport({ displaySets, viewportId = 'mobile-pdf-viewport' }) {
  const [loadState, setLoadState] = useState<LoadState>('fetching');
  const [fetchProgress, setFetchProgress] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSizes, setPageSizes] = useState<Size[]>([]);
  // `renderScale` controla SOLO la resolución del bitmap (se comitea al soltar el
  // gesto o al usar los botones). El zoom visual lo lleva la matriz `tfRef`.
  const [renderScale, setRenderScale] = useState(1);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const viewportElementRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useViewportRef(viewportId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // ── Matriz de transform: ÚNICA fuente de verdad del zoom/pan ────────────────
  // Se aplica de forma IMPERATIVA (no por estado React) para que ningún re-render
  // la pise. React solo gestiona width/height del contenido (que no cambian tras
  // la carga), nunca el `transform` → la matriz persiste entre renders.
  const tfRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 });

  // Geometría natural lista para los handlers táctiles (sin closures obsoletos).
  const layout = useMemo<Layout>(() => computeLayout(pageSizes), [pageSizes]);
  const layoutRef = useRef<Layout>(layout);
  layoutRef.current = layout;
  const pageSizesRef = useRef<Size[]>(pageSizes);
  pageSizesRef.current = pageSizes;

  const visRafRef = useRef(0);

  // ── Aplicar / clampear / comitear la matriz ─────────────────────────────────
  const applyTransform = useCallback(() => {
    const c = contentRef.current;
    if (!c) return;
    const { scale, tx, ty } = tfRef.current;
    c.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
  }, []);

  // Restringe la matriz a límites válidos: centra el eje cuando el contenido cabe,
  // o lo acota al borde cuando desborda. Idempotente → comitear una matriz ya
  // clampeada no produce ningún cambio visual (clave para "sin salto").
  const clampTransform = useCallback((t: Transform): Transform => {
    const container = containerRef.current;
    const { naturalW, naturalH } = layoutRef.current;
    if (!container || !naturalW || !naturalH) return t;

    const CW = container.clientWidth;
    const CH = container.clientHeight;
    const scale = clamp(t.scale, MIN_SCALE, MAX_SCALE);
    const SW = naturalW * scale;
    const SH = naturalH * scale;

    let tx: number;
    let ty: number;
    if (SW <= CW) tx = (CW - SW) / 2;
    else tx = clamp(t.tx, CW - SW, 0);
    if (SH <= CH) ty = (CH - SH) / 2;
    else ty = clamp(t.ty, CH - SH, 0);

    return { scale, tx, ty };
  }, []);

  // Recalcula páginas visibles + página actual a partir de la matriz (matemática
  // pura, sin lecturas del DOM → sin reflow). Throttle por rAF.
  const updateVisibility = useCallback(() => {
    const container = containerRef.current;
    const sizes = pageSizesRef.current;
    const { offsets } = layoutRef.current;
    if (!container || !sizes.length) return;

    const CH = container.clientHeight;
    const { scale, ty } = tfRef.current;
    const buffer = CH; // precarga ~1 pantalla por encima/debajo

    const next = new Set<number>();
    let best = 1;
    let bestDist = Infinity;
    for (let i = 0; i < sizes.length; i++) {
      const top = ty + offsets[i] * scale;
      const bottom = ty + (offsets[i] + sizes[i].height) * scale;
      if (bottom > -buffer && top < CH + buffer) next.add(i + 1);
      const dist = Math.abs((top + bottom) / 2 - CH / 2);
      if (dist < bestDist) {
        bestDist = dist;
        best = i + 1;
      }
    }

    setVisiblePages(prev => (setsEqual(prev, next) ? prev : next));
    setCurrentPage(prev => (prev === best ? prev : best));
  }, []);

  const scheduleVisibility = useCallback(() => {
    if (visRafRef.current) return;
    visRafRef.current = requestAnimationFrame(() => {
      visRafRef.current = 0;
      updateVisibility();
    });
  }, [updateVisibility]);

  // Escribe una nueva matriz (clampeada) y opcionalmente comitea la resolución.
  const setTransform = useCallback(
    (t: Transform, opts?: { commit?: boolean }) => {
      tfRef.current = clampTransform(t);
      applyTransform();
      scheduleVisibility();
      if (opts?.commit) {
        setRenderScale(tfRef.current.scale);
        setZoomPercent(Math.round(tfRef.current.scale * 100));
      }
    },
    [applyTransform, clampTransform, scheduleVisibility]
  );

  // ── Carga del PDF ───────────────────────────────────────────────────────────
  const renderedUrlDep = displaySets?.[0]?.renderedUrl;
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadState('fetching');
      setFetchProgress(0);
      setTotalPages(0);
      setCurrentPage(1);
      setPageSizes([]);

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

        // Tamaño natural REAL de cada página (soporta páginas heterogéneas).
        const sizes: Size[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          if (cancelled) {
            pdfDoc.destroy();
            return;
          }
          const vp = page.getViewport({ scale: 1 });
          sizes.push({ width: vp.width, height: vp.height });
        }

        pdfDocRef.current = pdfDoc;
        setTotalPages(pdfDoc.numPages);
        setPageSizes(sizes);
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

  // ── Transform inicial (fit-to-width, antes de pintar → sin flash) ───────────
  useLayoutEffect(() => {
    if (loadState !== 'ready' || pageSizes.length === 0) return;
    const container = containerRef.current;
    if (!container) return;

    const { naturalW } = layoutRef.current;
    const CW = container.clientWidth;
    const fit = clamp(naturalW ? CW / naturalW : 1, MIN_SCALE, MAX_SCALE);
    tfRef.current = clampTransform({ scale: fit, tx: 0, ty: 0 });
    applyTransform();
    setRenderScale(tfRef.current.scale);
    setZoomPercent(Math.round(tfRef.current.scale * 100));
    updateVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState, pageSizes]);

  // ── Re-clamp en resize/rotación ─────────────────────────────────────────────
  useEffect(() => {
    if (loadState !== 'ready') return;
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      tfRef.current = clampTransform(tfRef.current);
      applyTransform();
      scheduleVisibility();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [loadState, clampTransform, applyTransform, scheduleVisibility]);

  // ── Gestos táctiles: pan (1 dedo) + pinch anclado (2 dedos) + inercia ────────
  useEffect(() => {
    if (loadState !== 'ready') return;
    const container = containerRef.current;
    if (!container) return;

    type Mode = 'none' | 'pan' | 'pinch';
    let mode: Mode = 'none';
    let lastX = 0;
    let lastY = 0;
    // pinch
    let startDist = 0;
    let startScale = 1;
    let anchorCX = 0; // punto de contenido (escala 1) bajo el punto medio de los dedos
    let anchorCY = 0;
    // inercia
    let vx = 0;
    let vy = 0;
    let lastT = 0;
    let inertiaRaf = 0;

    const stopInertia = () => {
      if (inertiaRaf) {
        cancelAnimationFrame(inertiaRaf);
        inertiaRaf = 0;
      }
    };

    const midpoint = (touches: TouchList) => {
      const rect = container.getBoundingClientRect();
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
        y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
      };
    };

    const startPinch = (touches: TouchList) => {
      mode = 'pinch';
      startDist = getTouchDist(touches);
      startScale = tfRef.current.scale;
      const mid = midpoint(touches);
      anchorCX = (mid.x - tfRef.current.tx) / startScale;
      anchorCY = (mid.y - tfRef.current.ty) / startScale;
    };

    const startPan = (touch: Touch) => {
      mode = 'pan';
      lastX = touch.clientX;
      lastY = touch.clientY;
      vx = 0;
      vy = 0;
      lastT = performance.now();
    };

    const onStart = (e: TouchEvent) => {
      stopInertia();
      if (e.touches.length >= 2) {
        e.preventDefault();
        startPinch(e.touches);
      } else if (e.touches.length === 1) {
        startPan(e.touches[0]);
      }
    };

    const onMove = (e: TouchEvent) => {
      if (mode === 'pinch' && e.touches.length >= 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        const mid = midpoint(e.touches);
        const newScale = clamp((dist / startDist) * startScale, MIN_SCALE, MAX_SCALE);
        // Mantener el punto de contenido anclado bajo el punto medio ACTUAL de los
        // dedos → zoom centrado en los dedos y pan simultáneo, sin deriva.
        setTransform({
          scale: newScale,
          tx: mid.x - anchorCX * newScale,
          ty: mid.y - anchorCY * newScale,
        });
      } else if (mode === 'pan' && e.touches.length === 1) {
        e.preventDefault();
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const dx = x - lastX;
        const dy = y - lastY;
        lastX = x;
        lastY = y;
        const now = performance.now();
        const dt = now - lastT || 16;
        lastT = now;
        vx = dx / dt;
        vy = dy / dt;
        const t = tfRef.current;
        setTransform({ scale: t.scale, tx: t.tx + dx, ty: t.ty + dy });
      }
    };

    const startInertia = () => {
      const FRICTION = 0.95;
      const MIN_V = 0.03; // px/ms
      if (Math.abs(vx) < MIN_V && Math.abs(vy) < MIN_V) return;
      let prev = performance.now();
      const step = () => {
        const now = performance.now();
        const dt = now - prev;
        prev = now;
        const decay = Math.pow(FRICTION, dt / 16);
        vx *= decay;
        vy *= decay;
        if (Math.abs(vx) < MIN_V && Math.abs(vy) < MIN_V) {
          inertiaRaf = 0;
          return;
        }
        const t = tfRef.current;
        const before = { ...t };
        tfRef.current = clampTransform({ scale: t.scale, tx: t.tx + vx * dt, ty: t.ty + vy * dt });
        applyTransform();
        scheduleVisibility();
        // Detener al chocar con un borde en ese eje.
        if (tfRef.current.tx === before.tx) vx = 0;
        if (tfRef.current.ty === before.ty) vy = 0;
        inertiaRaf = requestAnimationFrame(step);
      };
      inertiaRaf = requestAnimationFrame(step);
    };

    const onEnd = (e: TouchEvent) => {
      if (mode === 'pinch') {
        if (e.touches.length >= 2) return;
        // Comitea la MISMA matriz ya pintada (solo refresca resolución) → sin salto.
        setTransform(tfRef.current, { commit: true });
        if (e.touches.length === 1) startPan(e.touches[0]);
        else mode = 'none';
      } else if (mode === 'pan') {
        if (e.touches.length === 0) {
          mode = 'none';
          startInertia();
        } else if (e.touches.length >= 2) {
          startPinch(e.touches);
        }
      }
    };

    container.addEventListener('touchstart', onStart, { passive: false });
    container.addEventListener('touchmove', onMove, { passive: false });
    container.addEventListener('touchend', onEnd, { passive: false });
    container.addEventListener('touchcancel', onEnd, { passive: false });

    return () => {
      stopInertia();
      container.removeEventListener('touchstart', onStart);
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', onEnd);
      container.removeEventListener('touchcancel', onEnd);
    };
  }, [loadState, setTransform, clampTransform, applyTransform, scheduleVisibility]);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (visRafRef.current) cancelAnimationFrame(visRafRef.current);
      viewportRef.unregister();
      pdfViewportRegistry.delete(viewportId);
      pdfDocRef.current?.destroy();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Zoom por botón: anclado al centro del viewport ──────────────────────────
  const zoomToCenter = useCallback(
    (factor: number, absolute?: number) => {
      const container = containerRef.current;
      if (!container) return;
      const t = tfRef.current;
      const newScale = clamp(
        absolute != null ? absolute : t.scale * factor,
        MIN_SCALE,
        MAX_SCALE
      );
      const cx = container.clientWidth / 2;
      const cy = container.clientHeight / 2;
      const contentX = (cx - t.tx) / t.scale;
      const contentY = (cy - t.ty) / t.scale;
      setTransform(
        { scale: newScale, tx: cx - contentX * newScale, ty: cy - contentY * newScale },
        { commit: true }
      );
    },
    [setTransform]
  );

  const zoomIn = () => zoomToCenter(ZOOM_FACTOR);
  const zoomOut = () => zoomToCenter(1 / ZOOM_FACTOR);
  const fitToWidth = () => {
    const container = containerRef.current;
    const { naturalW } = layoutRef.current;
    if (!container || !naturalW) return;
    zoomToCenter(1, clamp(container.clientWidth / naturalW, MIN_SCALE, MAX_SCALE));
  };

  const openInNewTab = () => {
    const url = blobUrlRef.current || fallbackUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ── Ref callback (registro OHIF del elemento raíz) ──────────────────────────
  const registerRef = useCallback(
    (el: HTMLDivElement | null) => {
      viewportElementRef.current = el;
      if (el) viewportRef.register(el);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Loading ─────────────────────────────────────────────────────────────────
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

  // ── Error ───────────────────────────────────────────────────────────────────
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

  // ── Ready ───────────────────────────────────────────────────────────────────
  return (
    <div
      ref={registerRef}
      className="flex h-full w-full flex-col bg-black"
      data-viewport-id={viewportId}
    >
      {/* Contenedor de recorte. touch-action: none → todos los gestos los maneja el
          modelo de transform (pan/pinch); no hay scroll nativo que recortar. */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          backgroundColor: '#1a1a1a',
          position: 'relative',
          touchAction: 'none',
        }}
      >
        {/* Nodo escalado: páginas a tamaño NATURAL, posicionadas de forma absoluta.
            El `transform` se aplica de forma imperativa (nunca por estado React). */}
        <div
          ref={contentRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: layout.naturalW || '100%',
            height: layout.naturalH || '100%',
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          {pageSizes.map((sz, i) => (
            <PdfPage
              key={i + 1}
              pdf={pdfDocRef.current!}
              pageNum={i + 1}
              size={sz}
              left={(layout.naturalW - sz.width) / 2}
              top={layout.offsets[i]}
              renderScale={renderScale}
              isVisible={visiblePages.has(i + 1)}
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
            onClick={fitToWidth}
            title="Ajustar al ancho"
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
            {zoomPercent}%
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

// ─── Micro-components ───────────────────────────────────────────────────────────

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
