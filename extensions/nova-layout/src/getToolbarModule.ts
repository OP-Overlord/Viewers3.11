/**
 * getToolbarModule (nova-layout)
 * ------------------------------------------------------------------------------
 * Evaluador OPCIONAL `evaluate.novaHeavyRenderingCapable` para greyear botones
 * volumétricos según la capacidad del equipo/serie. Es un utilitario reutilizable:
 * el guard PRINCIPAL ya no depende de los botones, se aplica de forma central
 * interceptando los comandos MPR/3D (ver `preRegistration.ts`).
 *
 * POLÍTICA ACTUAL: la herramienta nunca se prohíbe; el guard central advierte y
 * el usuario decide. Por eso el default de este evaluador es `greyOn: 'never'`
 * (no deshabilita nada). Los modos 'block'/'software' se conservan por si algún
 * despliegue quiere deshabilitar visualmente un botón concreto.
 *
 * El toolbar de OHIF permite combinar varios evaluadores en un arreglo y
 * deshabilita el botón si CUALQUIERA devuelve `disabled: true`
 * (ver ToolbarService._mapEvaluate).
 */

import { assessViewportCapability, type HeavyFeature } from './renderingCapability';

const DEFAULT_DISABLED_TEXT =
  'Este equipo no cumple los requisitos mínimos para MPR / 3D con esta serie';

export default function getToolbarModule({ servicesManager, extensionManager }: withAppTypes) {
  return [
    {
      name: 'evaluate.novaHeavyRenderingCapable',
      // Opciones inyectables desde el botón:
      //   evaluate: [{ name: '...', feature: 'mpr', greyOn: 'software' }]
      // - greyOn: 'never'    (def) → nunca deshabilita. El guard central advierte
      //                                y el usuario decide si continúa.
      // - greyOn: 'software'        → deshabilita SOLO si no hay GPU.
      // - greyOn: 'block'           → deshabilita en la banda "no recomendada".
      //                                Contradice la política de "siempre
      //                                disponible": usar solo de forma deliberada.
      evaluate: ({
        viewportId,
        feature = 'mpr',
        greyOn = 'never',
        disabledText = DEFAULT_DISABLED_TEXT,
      }: {
        viewportId?: string;
        feature?: HeavyFeature;
        greyOn?: 'never' | 'block' | 'software';
        disabledText?: string;
      }) => {
        if (greyOn === 'never') {
          return { disabled: false };
        }

        try {
          const assessment = assessViewportCapability(servicesManager, extensionManager, {
            viewportId,
            feature,
          });

          const shouldDisable =
            greyOn === 'software'
              ? assessment.device.tier === 'software'
              : assessment.severity === 'block';

          if (shouldDisable) {
            return { disabled: true, disabledText };
          }
        } catch (e) {
          // Ante cualquier fallo de detección, no bloquear (fail-open).
          console.warn('[nova] evaluate.novaHeavyRenderingCapable failed:', e);
        }

        return { disabled: false };
      },
    },
  ];
}
