/**
 * runCapabilityGuard — flujo compartido de la compuerta preventiva.
 *
 * Evalúa el viewport activo y:
 *   - 'ok'    → ejecuta `onProceed` (la acción real), sin fricción
 *   - 'warn'  → popup con "Continuar bajo mi responsabilidad"
 *   - 'block' → popup con aviso fuerte de configuración NO recomendada
 *
 * En 'warn' y 'block' el usuario SIEMPRE puede continuar: la compuerta informa y
 * pide confirmación, nunca prohíbe. Solo cambia el tono del aviso.
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
  /** Acción real: se ejecuta en 'ok' o cuando el usuario confirma el aviso. */
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

  if (assessment.severity === 'ok') {
    onProceed();
    return;
  }

  uiModalService.show({
    title:
      assessment.severity === 'block'
        ? 'Configuración no recomendada para esta serie'
        : 'Rendimiento limitado para esta serie',
    content: RenderingCapabilityModal,
    contentProps: {
      assessment,
      // Siempre se ofrece continuar, también en 'block': la compuerta advierte,
      // no prohíbe.
      onContinue: onProceed,
    },
  });
}
