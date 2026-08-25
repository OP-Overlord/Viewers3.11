/**
 * assessHeavyRendering
 * ------------------------------------------------------------------------------
 * Núcleo de la regla preventiva. Dado el/los displaySet del viewport activo, la
 * funcionalidad solicitada (MPR / Volume Rendering / 3D) y las capacidades del
 * equipo, decide con cuánta fricción se ejecuta:
 *
 *   severity 'ok'    → ejecutar normal, sin popup
 *   severity 'warn'  → avisar (popup con "continuar bajo mi responsabilidad")
 *   severity 'block' → configuración NO recomendada: popup con aviso fuerte
 *
 * IMPORTANTE: 'block' NO impide usar la herramienta. La política del producto es
 * que el usuario siempre pueda continuar; lo que cambia es el tono del aviso y
 * el hecho de que debe confirmarlo explícitamente. El nombre 'block' se conserva
 * por compatibilidad con la config de despliegue (`blockInstances`).
 *
 * La lógica es síncrona y pura (sin efectos), para poder usarse tanto en el
 * evaluador de toolbar (síncrono) como en el comando guard.
 */

import type { DeviceCapabilities } from './detectDeviceCapabilities';
import type { TierThresholds } from './thresholds';

export type HeavyFeature = 'mpr' | 'volumeRendering' | 'volume3d';
export type Severity = 'ok' | 'warn' | 'block';

export interface SeriesMetrics {
  /** Nº de cortes efectivos (suma de frames; multiframe incluido). */
  sliceCount: number;
  rows: number;
  columns: number;
  bitsAllocated: number;
  samplesPerPixel: number;
  /** Memoria estimada del volumen en bytes (rows·cols·slices·bytes·spp). */
  estimatedVolumeBytes: number;
}

export interface CapabilityAssessment {
  feature: HeavyFeature;
  severity: Severity;
  /**
   * true si hay que pedir confirmación explícita al usuario antes de ejecutar
   * ('warn' y 'block'). Nunca implica prohibición: siempre se puede continuar.
   */
  requiresConfirmation: boolean;
  reasons: string[];
  device: DeviceCapabilities;
  thresholds: TierThresholds;
  series: SeriesMetrics;
  /** Límite de dimensión por corte efectivo (MAX_3D_TEXTURE_SIZE real o fallback). */
  maxSliceDim: number;
}

const FEATURE_LABEL: Record<HeavyFeature, string> = {
  mpr: 'MPR (reconstrucción multiplanar)',
  volumeRendering: 'Volume Rendering',
  volume3d: 'visualización volumétrica 3D',
};

function toNum(value: unknown): number {
  if (Array.isArray(value)) {
    return toNum(value[0]);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Cortes de un displaySet contando frames de multiframe. */
function getSliceCount(displaySet: any): number {
  const instances = displaySet?.instances ?? [];
  if (Array.isArray(instances) && instances.length) {
    let frames = 0;
    for (const inst of instances) {
      frames += Math.max(1, toNum(inst?.NumberOfFrames));
    }
    return frames;
  }
  return (
    toNum(displaySet?.numImages) ||
    (Array.isArray(displaySet?.imageIds) ? displaySet.imageIds.length : 0) ||
    (Array.isArray(displaySet?.images) ? displaySet.images.length : 0)
  );
}

/** Extrae métricas del displaySet "más pesado" (mayor nº de cortes). */
export function getSeriesMetrics(displaySets: any[]): SeriesMetrics {
  const candidates = (displaySets ?? []).filter(Boolean);

  let heaviest: any = null;
  let maxSlices = -1;
  for (const ds of candidates) {
    const slices = getSliceCount(ds);
    if (slices > maxSlices) {
      maxSlices = slices;
      heaviest = ds;
    }
  }

  const first = heaviest?.instances?.[0] ?? heaviest?.instance ?? {};
  const rows = toNum(first.Rows);
  const columns = toNum(first.Columns);
  const bitsAllocated = toNum(first.BitsAllocated) || 16;
  const samplesPerPixel = toNum(first.SamplesPerPixel) || 1;
  const sliceCount = Math.max(0, maxSlices);

  const estimatedVolumeBytes =
    rows * columns * sliceCount * Math.ceil(bitsAllocated / 8) * samplesPerPixel;

  return { sliceCount, rows, columns, bitsAllocated, samplesPerPixel, estimatedVolumeBytes };
}

/** Mantiene la severidad más alta. */
function worse(a: Severity, b: Severity): Severity {
  const order: Severity[] = ['ok', 'warn', 'block'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

export function assessHeavyRendering(
  displaySets: any[],
  feature: HeavyFeature,
  device: DeviceCapabilities,
  thresholds: TierThresholds
): CapabilityAssessment {
  const series = getSeriesMetrics(displaySets);
  const featureLabel = FEATURE_LABEL[feature] ?? feature;
  const maxSliceDim =
    device.max3DTextureSize > 0 ? device.max3DTextureSize : thresholds.maxSliceDimFallback;

  const reasons: string[] = [];
  let severity: Severity = 'ok';

  // 1) Sin GPU real → advertencia fuerte (es el escenario con más riesgo real
  // de cierre inesperado, pero se permite continuar bajo confirmación).
  if (device.tier === 'software') {
    severity = 'block';
    reasons.push(
      `El equipo no dispone de aceleración por GPU (renderizado por software), ` +
        `por lo que ${featureLabel} probablemente no se ejecute de forma estable.`
    );
    return {
      feature,
      severity,
      requiresConfirmation: true,
      reasons,
      device,
      thresholds,
      series,
      maxSliceDim,
    };
  }

  // 2) Resolución por corte mayor que el límite de textura 3D → no recomendado.
  if (maxSliceDim > 0 && (series.rows > maxSliceDim || series.columns > maxSliceDim)) {
    severity = worse(severity, 'block');
    reasons.push(
      `La resolución por corte (${series.rows || '?'}×${series.columns || '?'} px) supera el ` +
        `límite de textura 3D del equipo (${maxSliceDim} px).`
    );
  }

  // 3) Memoria estimada del volumen mayor que el presupuesto → no recomendado.
  if (thresholds.maxVolumeBytes > 0 && series.estimatedVolumeBytes > thresholds.maxVolumeBytes) {
    severity = worse(severity, 'block');
    reasons.push(
      `La memoria estimada del volumen (${formatBytes(series.estimatedVolumeBytes)}) supera el ` +
        `máximo recomendado para este equipo (${formatBytes(thresholds.maxVolumeBytes)}).`
    );
  }

  // 4) Nº de cortes vs umbrales del tier.
  if (series.sliceCount > thresholds.blockInstances) {
    severity = worse(severity, 'block');
    reasons.push(
      `La serie tiene ${series.sliceCount} cortes; supera con holgura el máximo recomendado ` +
        `para este equipo (${thresholds.blockInstances}).`
    );
  } else if (series.sliceCount > thresholds.safeInstances) {
    severity = worse(severity, 'warn');
    reasons.push(
      `La serie tiene ${series.sliceCount} cortes; está por encima del rango óptimo ` +
        `(${thresholds.safeInstances}) para este equipo y puede afectar el rendimiento.`
    );
  }

  return {
    feature,
    severity,
    requiresConfirmation: severity !== 'ok',
    reasons,
    device,
    thresholds,
    series,
    maxSliceDim,
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) {
    return '—';
  }
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}
