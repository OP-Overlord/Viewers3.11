/**
 * getToolbarModule (nova-layout)
 * ------------------------------------------------------------------------------
 * Evaluador OPCIONAL `evaluate.novaHeavyRenderingCapable` para greyear botones
 * volumétricos según la capacidad del equipo/serie. Es un utilitario reutilizable:
 * el guard PRINCIPAL ya no depende de los botones, se aplica de forma central
 * interceptando los comandos MPR/3D (ver `preRegistration.ts`). Este evaluador
 * queda disponible por si se quiere además deshabilitar visualmente algún botón.
 *
 * El toolbar de OHIF permite combinar varios evaluadores en un arreglo y
 * deshabilita el botón si CUALQUIERA devuelve `disabled: true`
 * (ver ToolbarService._mapEvaluate). El `console.info` de carga sirve de chequeo
 * de despliegue (si no aparece, el bundle servido es viejo / cacheado por el SW).
 */

import { assessViewportCapability, type HeavyFeature } from './renderingCapability';

const DEFAULT_DISABLED_TEXT =
  'Este equipo no cumple los requisitos mínimos para MPR / 3D con esta serie';

export default function getToolbarModule({ servicesManager, extensionManager }: withAppTypes) {
  // Diagnóstico de despliegue: si NO ves este log en consola, el bundle servido
  // es viejo (revisa el service worker / caché del navegador).
  // eslint-disable-next-line no-console
  console.info('[nova] getToolbarModule cargado → evaluate.novaHeavyRenderingCapable registrado');

  return [
    {
      name: 'evaluate.novaHeavyRenderingCapable',
      // Opciones inyectables desde el botón:
      //   evaluate: [{ name: '...', feature: 'mpr', greyOn: 'software' }]
      // - greyOn: 'block'    (def) → deshabilita el botón en el límite duro.
      //                                Úsalo cuando NO hay popup que lo explique
      //                                (p.ej. el menú de orientación).
      // - greyOn: 'software'        → deshabilita SOLO si no hay GPU. El resto de
      //                                casos los explica el popup del guard central.
      evaluate: ({
        viewportId,
        feature = 'mpr',
        greyOn = 'block',
        disabledText = DEFAULT_DISABLED_TEXT,
      }: {
        viewportId?: string;
        feature?: HeavyFeature;
        greyOn?: 'block' | 'software';
        disabledText?: string;
      }) => {
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
