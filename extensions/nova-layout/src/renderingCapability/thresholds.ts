/**
 * thresholds
 * ------------------------------------------------------------------------------
 * Umbrales (tunables) que definen, por tier de GPU, a partir de qué tamaño de
 * serie se considera que MPR / Volume Rendering pasa de "seguro" a "advertencia"
 * y de "advertencia" a "no recomendado".
 *
 * NINGUNA banda impide usar la herramienta: la política es que el usuario
 * siempre pueda continuar (ver runCapabilityGuard / RenderingCapabilityModal).
 * Lo único que cambia entre bandas es la fricción y el tono del aviso:
 *
 *   n ≤ safeInstances            → sin popup
 *   safeInstances < n ≤ block…   → advertencia ("continuar bajo mi responsabilidad")
 *   n > blockInstances           → advertencia fuerte ("configuración no recomendada")
 *
 * Defaults alineados con lo observado en campo: una GPU integrada de portátil
 * ejecuta MPR bien con ~150 cortes pero se vuelve inestable por encima de ~500
 * instancias. Una integrada moderna sobre una estación de trabajo (mucha RAM
 * compartida) aguanta bastante más: ver tier 'integratedHigh'.
 *
 * Son overridables por despliegue vía appConfig:
 *   window.config = { ..., novaRenderingCapability: { integrated: { blockInstances: 400 } } }
 */

import type { DeviceTier } from './detectDeviceCapabilities';

export interface TierThresholds {
  /** ≤ safeInstances → banda segura (sin fricción). */
  safeInstances: number;
  /**
   * Frontera entre la advertencia normal y la fuerte:
   * safeInstances < n ≤ blockInstances → advertencia;
   * n > blockInstances → advertencia fuerte (sigue permitiendo continuar).
   */
  blockInstances: number;
  /** Presupuesto de memoria estimada de volumen en bytes. */
  maxVolumeBytes: number;
  /** Límite de dimensión por corte (px). Fallback si no hay MAX_3D_TEXTURE_SIZE real. */
  maxSliceDimFallback: number;
}

export type ThresholdsByTier = Record<DeviceTier, TierThresholds>;

const MB = 1024 * 1024;

export const DEFAULT_THRESHOLDS: ThresholdsByTier = {
  // Sin GPU real: cualquier reconstrucción volumétrica es muy probable que
  // reviente el visor → advertencia fuerte siempre (pero se puede continuar).
  software: {
    safeInstances: 0,
    blockInstances: 0,
    maxVolumeBytes: 0,
    maxSliceDimFallback: 0,
  },
  // GPU integrada sobre equipo modesto (portátil de oficina): caso del crash
  // reportado originalmente.
  integrated: {
    safeInstances: 300,
    blockInstances: 500,
    maxVolumeBytes: 400 * MB,
    maxSliceDimFallback: 2048,
  },
  // GPU integrada moderna sobre estación de trabajo (≥8 GB de RAM reportada,
  // ≥12 núcleos, textura 3D ≥2048). En una iGPU la VRAM es RAM compartida, así
  // que el margen real es muy superior al del portátil de 8 GB.
  integratedHigh: {
    safeInstances: 800,
    blockInstances: 1500,
    maxVolumeBytes: 1024 * MB,
    maxSliceDimFallback: 2048,
  },
  // Sin pistas: tratar conservador, igual que integrada.
  unknown: {
    safeInstances: 300,
    blockInstances: 500,
    maxVolumeBytes: 400 * MB,
    maxSliceDimFallback: 2048,
  },
  // GPU dedicada: márgenes amplios, sin fricción para estudios grandes habituales.
  dedicated: {
    safeInstances: 1500,
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
