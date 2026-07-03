/**
 * runCapabilityGuard — flujo compartido de la compuerta preventiva.
 *
 * Evalúa el viewport activo y:
 *   - 'ok'    → ejecuta `onProceed` (la acción real)
 *   - 'warn'  → popup con "Continuar bajo mi responsabilidad" (ejecuta `onProceed`)
 *   - 'block' → popup informativo sin override (NO ejecuta `onProceed`)
 *
 * Lo usan tanto el interceptor central de comandos (preRegistration) como
 * cualquier consumidor explícito. No requiere JSX (el modal se pasa por
 * referencia + contentProps).
 */

import { assessViewportCapability } from './assessViewport';
import RenderingCapabilityModal from './RenderingCapabilityModal';
import type { HeavyFeature } from './assessHeavyRendering';

export interface RunCapabilityGuardArgs {
  servicesManager: any;
  extensionManager: any;
  feature: HeavyFeature;
  viewportId?: string;
  /** Acción real a ejecutar si se permite ('ok') o si el usuario fuerza ('warn'). */
  onProceed: () => void;
  /** Etiqueta para el log de diagnóstico. */
  source?: string;
}

export function runCapabilityGuard({
  servicesManager,
  extensionManager,
  feature,
  viewportId,
  onProceed,
  source = '',
}: RunCapabilityGuardArgs): void {
  const { uiModalService } = servicesManager.services;

  let assessment;
  try {
    assessment = assessViewportCapability(servicesManager, extensionManager, {
      viewportId,
      feature,
    });
  } catch (e) {
    // Fail-open: ante un error de detección, no bloquear al usuario.
    // eslint-disable-next-line no-console
    console.warn('[nova] runCapabilityGuard assess failed, allowing:', e);
    onProceed();
    return;
  }

  // eslint-disable-next-line no-console
  console.info(
    `[nova] capabilityGuard ${source} feature=${feature} severity=${assessment.severity}`,
    {
      tier: assessment.device.tier,
      renderer: assessment.device.renderer,
      series: assessment.series,
    }
  );

  if (assessment.severity === 'ok') {
    onProceed();
    return;
  }

  uiModalService.show({
    title:
      assessment.severity === 'block'
        ? 'Función no disponible en este equipo'
        : 'Rendimiento limitado para esta serie',
    content: RenderingCapabilityModal,
    contentProps: {
      assessment,
      onContinue: assessment.severity === 'warn' ? onProceed : undefined,
    },
  });
}
