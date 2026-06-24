/**
 * connectivityMonitor — vigilante PASIVO de la calidad de la conexión.
 *
 * Objetivo: detectar mala velocidad de descarga o latencia alta SIN generar
 * tráfico propio significativo (no invasivo). Combina tres señales, en orden de
 * preferencia según disponibilidad del navegador:
 *
 *  1. Network Information API (`navigator.connection`): rtt (ms), downlink
 *     (Mbps) y effectiveType ('slow-2g'|'2g'|'3g'|'4g'). Es la señal principal en
 *     Chromium (desktop y Android) y funciona aunque el PACS sea cross-origin.
 *  2. PerformanceObserver('resource'): mide TTFB y throughput REALES de las
 *     peticiones DICOM/WADO cuando hay datos de timing (mismo origen o con
 *     cabecera Timing-Allow-Origin). Afina la estimación cuando existe.
 *  3. eventos `online`/`offline`: corte total de red.
 *
 * NO hace polling activo ni descargas de prueba: si un navegador no expone
 * ninguna señal útil (p. ej. Safari/Firefox sin Network Information API y con un
 * PACS cross-origin sin TAO), el monitor simplemente permanece en 'good' y el
 * widget no aparece. Es informativo y conservador por diseño.
 *
 * Expone un estado de salud con histéresis (para no parpadear) al que la UI se
 * suscribe.
 */

export type ConnHealth = 'good' | 'degraded' | 'poor' | 'offline';

export interface ConnSnapshot {
  health: ConnHealth;
  /** Latencia estimada de ida y vuelta, en ms (si se conoce). */
  rttMs?: number;
  /** Ancho de banda de bajada estimado, en Mbps (si se conoce). */
  downlinkMbps?: number;
  /** Clasificación del navegador, si la expone. */
  effectiveType?: string;
  /** De dónde salió la lectura dominante. */
  source: 'connection' | 'resource' | 'offline' | 'none';
}

type Listener = (snapshot: ConnSnapshot) => void;

// --- Umbrales -------------------------------------------------------------
// Pensados para uso clínico: "degraded" = molesto pero usable; "poor" = la
// carga de imágenes pesadas (DX/MG/CT) será claramente lenta.
const RTT_DEGRADED_MS = 350;
const RTT_POOR_MS = 700;
const DOWNLINK_DEGRADED_MBPS = 2.5;
const DOWNLINK_POOR_MBPS = 0.8;

// Cada cuánto reevaluamos (además de reaccionar a eventos).
const EVAL_INTERVAL_MS = 4000;
// Histéresis: nº de evaluaciones consecutivas para mostrar / ocultar.
const SHOW_AFTER_BAD_EVALS = 2; // ~8 s degradado antes de avisar
const HIDE_AFTER_GOOD_EVALS = 4; // ~16 s estable antes de retirar el aviso

// Ventana de muestras de PerformanceObserver que conservamos.
const RESOURCE_WINDOW_MS = 30000;
const MIN_BYTES_FOR_THROUGHPUT = 50 * 1024; // throughput sólo con descargas grandes

interface NavigatorConnectionLike {
  rtt?: number;
  downlink?: number;
  effectiveType?: string;
  addEventListener?: (type: 'change', cb: () => void) => void;
  removeEventListener?: (type: 'change', cb: () => void) => void;
}

interface ResourceSample {
  t: number; // performance.now() en que se registró
  ttfbMs?: number;
  throughputMbps?: number;
}

const severity: Record<ConnHealth, number> = {
  good: 0,
  degraded: 1,
  poor: 2,
  offline: 3,
};

class ConnectivityMonitor {
  private listeners = new Set<Listener>();
  private snapshot: ConnSnapshot = { health: 'good', source: 'none' };
  private samples: ResourceSample[] = [];
  private observer?: PerformanceObserver;
  private intervalId?: ReturnType<typeof setInterval>;
  private started = false;

  // Histéresis: contadores de rachas y salud "publicada".
  private badEvals = 0;
  private goodEvals = 0;
  private publishedHealth: ConnHealth = 'good';

  private onConnChange = () => this.evaluate();
  private onOnline = () => this.evaluate();
  private onOffline = () => this.evaluate();

  start(): void {
    if (this.started || typeof window === 'undefined') {
      return;
    }
    this.started = true;

    // PerformanceObserver para timing real de peticiones de imagen.
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        this.observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            this.ingestResourceEntry(entry as PerformanceResourceTiming);
          }
        });
        this.observer.observe({ type: 'resource', buffered: true });
      } catch {
        /* navegador sin soporte: seguimos con las otras señales */
      }
    }

    const conn = this.getConnection();
    conn?.addEventListener?.('change', this.onConnChange);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);

    this.intervalId = setInterval(() => this.evaluate(), EVAL_INTERVAL_MS);
    this.evaluate();
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.observer?.disconnect();
    this.observer = undefined;
    const conn = this.getConnection();
    conn?.removeEventListener?.('change', this.onConnChange);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.samples = [];
    this.badEvals = 0;
    this.goodEvals = 0;
    this.publishedHealth = 'good';
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Entrega inmediata del estado actual.
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): ConnSnapshot {
    return this.snapshot;
  }

  // --- internos -----------------------------------------------------------

  private getConnection(): NavigatorConnectionLike | undefined {
    const nav = navigator as Navigator & {
      connection?: NavigatorConnectionLike;
      mozConnection?: NavigatorConnectionLike;
      webkitConnection?: NavigatorConnectionLike;
    };
    return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  }

  private ingestResourceEntry(e: PerformanceResourceTiming): void {
    if (e.initiatorType !== 'xmlhttprequest' && e.initiatorType !== 'fetch') {
      return;
    }
    // Sin Timing-Allow-Origin (PACS cross-origin) estos campos llegan en 0 y no
    // aportan; se descartan silenciosamente.
    const ttfbMs =
      e.responseStart > 0 && e.requestStart > 0 ? e.responseStart - e.requestStart : undefined;

    let throughputMbps: number | undefined;
    const bytes = e.encodedBodySize || e.transferSize || 0;
    const downloadMs = e.responseEnd > 0 && e.responseStart > 0 ? e.responseEnd - e.responseStart : 0;
    if (bytes >= MIN_BYTES_FOR_THROUGHPUT && downloadMs > 0) {
      throughputMbps = (bytes * 8) / (downloadMs / 1000) / 1e6;
    }

    if (ttfbMs === undefined && throughputMbps === undefined) {
      return;
    }
    this.samples.push({ t: performance.now(), ttfbMs, throughputMbps });
  }

  /** Mediana simple (robusta frente a outliers). */
  private median(values: number[]): number | undefined {
    if (!values.length) {
      return undefined;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private pruneSamples(): void {
    const cutoff = performance.now() - RESOURCE_WINDOW_MS;
    if (this.samples.length && this.samples[0].t < cutoff) {
      this.samples = this.samples.filter(s => s.t >= cutoff);
    }
  }

  /** Construye la lectura cruda (sin histéresis) combinando todas las señales. */
  private readRaw(): ConnSnapshot {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { health: 'offline', source: 'offline' };
    }

    this.pruneSamples();
    const conn = this.getConnection();

    // Latencia: preferimos la medida real (resource) si existe; si no, connection.rtt.
    const measuredTtfb = this.median(
      this.samples.map(s => s.ttfbMs).filter((v): v is number => v !== undefined)
    );
    const measuredThroughput = this.median(
      this.samples.map(s => s.throughputMbps).filter((v): v is number => v !== undefined)
    );

    const rttMs = measuredTtfb ?? conn?.rtt;
    const downlinkMbps = measuredThroughput ?? conn?.downlink;
    const effectiveType = conn?.effectiveType;

    const source: ConnSnapshot['source'] =
      measuredTtfb !== undefined || measuredThroughput !== undefined
        ? 'resource'
        : conn
          ? 'connection'
          : 'none';

    // Clasificación: nos quedamos con la PEOR señal disponible.
    let health: ConnHealth = 'good';
    const worsen = (h: ConnHealth) => {
      if (severity[h] > severity[health]) {
        health = h;
      }
    };

    if (rttMs !== undefined) {
      if (rttMs >= RTT_POOR_MS) {
        worsen('poor');
      } else if (rttMs >= RTT_DEGRADED_MS) {
        worsen('degraded');
      }
    }
    if (downlinkMbps !== undefined) {
      if (downlinkMbps <= DOWNLINK_POOR_MBPS) {
        worsen('poor');
      } else if (downlinkMbps <= DOWNLINK_DEGRADED_MBPS) {
        worsen('degraded');
      }
    }
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      worsen('poor');
    } else if (effectiveType === '3g') {
      worsen('degraded');
    }

    return { health, rttMs, downlinkMbps, effectiveType, source };
  }

  private evaluate(): void {
    const raw = this.readRaw();

    // Histéresis sobre la decisión de "mostrar aviso" (todo lo != good).
    if (raw.health === 'good') {
      this.goodEvals++;
      this.badEvals = 0;
    } else {
      this.badEvals++;
      this.goodEvals = 0;
    }

    let nextPublished = this.publishedHealth;
    if (this.publishedHealth === 'good') {
      // offline se publica de inmediato; el resto exige racha.
      if (raw.health === 'offline' || this.badEvals >= SHOW_AFTER_BAD_EVALS) {
        nextPublished = raw.health;
      }
    } else {
      // Ya estábamos avisando: actualizamos severidad al instante si empeora,
      // y sólo retiramos el aviso tras una racha estable de "good".
      if (raw.health !== 'good') {
        nextPublished = raw.health;
      } else if (this.goodEvals >= HIDE_AFTER_GOOD_EVALS) {
        nextPublished = 'good';
      }
    }
    this.publishedHealth = nextPublished;

    const next: ConnSnapshot = { ...raw, health: nextPublished };
    // Emitimos sólo si cambia algo relevante para la UI.
    if (
      next.health !== this.snapshot.health ||
      next.rttMs !== this.snapshot.rttMs ||
      next.downlinkMbps !== this.snapshot.downlinkMbps
    ) {
      this.snapshot = next;
      this.listeners.forEach(l => l(next));
    }
  }
}

// Singleton compartido por todo el modo.
export const connectivityMonitor = new ConnectivityMonitor();
