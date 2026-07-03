/**
 * thresholds
 * ------------------------------------------------------------------------------
 * Umbrales (tunables) que definen, por tier de GPU, a partir de qué tamaño de
 * serie se considera que MPR / Volume Rendering pasa de "seguro" a "advertencia"
 * y de "advertencia" a "bloqueo".
 *
 * Defaults alineados con lo observado en campo: una GPU integrada ejecuta MPR
 * bien con ~150 cortes pero crashea por encima de ~500 instancias.
 *
 * Son overridables por despliegue vía appConfig:
 *   window.config = { ..., novaRenderingCapability: { integrated: { blockInstances: 400 } } }
 */

import type { DeviceTier } from './detectDeviceCapabilities';

export interface TierThresholds {
  /** ≤ safeInstances → banda segura (sin fricción). */
  safeInstances: number;
  /** safeInstances < n ≤ warnInstances → advertencia (popup con override). */
  warnInstances: number;
  /** > warnInstances → bloqueo duro (botón greyed + popup sin override). */
  blockInstances: number;
  /** Presupuesto de memoria estimada de volumen en bytes (límite duro). */
  maxVolumeBytes: number;
  /** Límite de dimensión por corte (px). Fallback si no hay MAX_3D_TEXTURE_SIZE real. */
  maxSliceDimFallback: number;
}

export type ThresholdsByTier = Record<DeviceTier, TierThresholds>;

const MB = 1024 * 1024;

export const DEFAULT_THRESHOLDS: ThresholdsByTier = {
  // Sin GPU real: cualquier reconstrucción volumétrica revienta → bloquear todo.
  software: {
    safeInstances: 0,
    warnInstances: 0,
    blockInstances: 0,
    maxVolumeBytes: 0,
    maxSliceDimFallback: 0,
  },
  // GPU integrada (Intel HD/UHD/Iris, APUs, móvil): caso del crash reportado.
  integrated: {
    safeInstances: 300,
    warnInstances: 500,
    blockInstances: 500,
    maxVolumeBytes: 400 * MB,
    maxSliceDimFallback: 2048,
  },
  // Sin pistas: tratar conservador, igual que integrada.
  unknown: {
    safeInstances: 300,
    warnInstances: 500,
    blockInstances: 500,
    maxVolumeBytes: 400 * MB,
    maxSliceDimFallback: 2048,
  },
  // GPU dedicada: márgenes amplios, sin fricción para estudios grandes habituales.
  dedicated: {
    safeInstances: 1500,
    warnInstances: 3000,
    blockInstances: 3000,
    maxVolumeBytes: 1536 * MB,
    maxSliceDimFallback: 4096,
  },
};

/**
 * Devuelve los umbrales para un tier, fusionando los defaults con cualquier
 * override de despliegue (parcial, por tier).
 */
export function getThresholdsForTier(
  tier: DeviceTier,
  overrides?: Partial<Record<DeviceTier, Partial<TierThresholds>>>
): TierThresholds {
  const base = DEFAULT_THRESHOLDS[tier] ?? DEFAULT_THRESHOLDS.unknown;
  const tierOverride = overrides?.[tier];
  return tierOverride ? { ...base, ...tierOverride } : base;
}
