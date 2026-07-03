/**
 * assessViewport — resolución de displaySets + evaluación de capacidad para el
 * viewport activo. Separado de index.ts para evitar dependencias circulares
 * (lo usan tanto el evaluador de toolbar como el guard central de comandos).
 */

import { getDeviceCapabilities } from './detectDeviceCapabilities';
import { getThresholdsForTier, type ThresholdsByTier, type TierThresholds } from './thresholds';
import {
  assessHeavyRendering,
  type CapabilityAssessment,
  type HeavyFeature,
} from './assessHeavyRendering';

/** Devuelve los displaySet asociados al viewport (patrón de evaluate.displaySetIsReconstructable). */
export function getViewportDisplaySets(servicesManager: any, viewportId?: string): any[] {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const activeViewportId = viewportId || viewportGridService.getState()?.activeViewportId;
  if (!activeViewportId) {
    return [];
  }
  const uids = viewportGridService.getDisplaySetsUIDsForViewport(activeViewportId) || [];
  return uids.map((uid: string) => displaySetService.getDisplaySetByUID(uid)).filter(Boolean);
}

/** Lee los overrides de umbrales desde appConfig (si existen). */
function getThresholdOverrides(
  extensionManager: any
): Partial<Record<keyof ThresholdsByTier, Partial<TierThresholds>>> | undefined {
  return extensionManager?.appConfig?.novaRenderingCapability;
}

export interface AssessViewportOptions {
  viewportId?: string;
  feature: HeavyFeature;
}

/**
 * Evalúa si el viewport indicado puede ejecutar con seguridad la funcionalidad
 * volumétrica pesada solicitada. Síncrono.
 */
export function assessViewportCapability(
  servicesManager: any,
  extensionManager: any,
  { viewportId, feature }: AssessViewportOptions
): CapabilityAssessment {
  const displaySets = getViewportDisplaySets(servicesManager, viewportId);
  const device = getDeviceCapabilities();
  const thresholds = getThresholdsForTier(device.tier, getThresholdOverrides(extensionManager));
  return assessHeavyRendering(displaySets, feature, device, thresholds);
}
