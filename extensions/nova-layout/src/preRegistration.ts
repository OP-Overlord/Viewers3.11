/**
 * preRegistration (nova-layout)
 * ------------------------------------------------------------------------------
 * Compuerta preventiva CENTRAL para MPR / Volume Rendering / 3D.
 *
 * En vez de depender del cableado del botón en cada modo (chunk que puede quedar
 * cacheado/desactualizado en despliegues), interceptamos aquí —en la extensión,
 * que sí se actualiza— los comandos que disparan reconstrucción volumétrica
 * (`toggleHangingProtocol`, `setHangingProtocol`). Así el guard se ejecuta
 * SIEMPRE, venga el clic del botón MPR, de un atajo o de cualquier otra vía.
 *
 * Para cada comando: si el `protocolId` es de un protocolo pesado, evaluamos el
 * equipo + la serie y decidimos ok / warn (popup con override) / block (popup
 * informativo). Cualquier otro protocolo pasa directo sin tocar nada.
 */

import { runCapabilityGuard, type HeavyFeature } from './renderingCapability';

// protocolId → tipo de funcionalidad pesada. Ajustar si se añaden HPs volumétricos.
const HEAVY_PROTOCOLS: Record<string, HeavyFeature> = {
  mpr: 'mpr',
  main3D: 'volume3d',
  '3D': 'volume3d',
  mprAnd3DVolumeViewport: 'volume3d',
  primary3D: 'volume3d',
  only3D: 'volume3d',
};

const GUARDED_COMMANDS = ['toggleHangingProtocol', 'setHangingProtocol'];

let installed = false;

export default function preRegistration({
  servicesManager,
  commandsManager,
  extensionManager,
}: withAppTypes) {
  if (installed) {
    return;
  }

  let attempts = 0;
  const maxAttempts = 20;

  const tryInstall = () => {
    attempts += 1;
    let allFound = true;

    GUARDED_COMMANDS.forEach(commandName => {
      const definition = commandsManager.getCommand(commandName);
      if (!definition || typeof definition.commandFn !== 'function') {
        allFound = false;
        return;
      }
      wrapCommand(commandName, definition);
    });

    if (allFound) {
      installed = true;
      // eslint-disable-next-line no-console
      console.info('[nova] capabilityGuard: comandos MPR/3D interceptados', GUARDED_COMMANDS);
      return;
    }

    if (attempts < maxAttempts) {
      setTimeout(tryInstall, 150);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        '[nova] capabilityGuard: no se pudieron interceptar todos los comandos',
        GUARDED_COMMANDS
      );
    }
  };

  function wrapCommand(commandName: string, definition: any) {
    if (definition.__novaGuarded) {
      return; // idempotente
    }
    const original = definition.commandFn;

    definition.commandFn = (args: any = {}) => {
      const protocolId = args?.protocolId;
      const feature = protocolId ? HEAVY_PROTOCOLS[protocolId] : undefined;

      // Protocolo no pesado → comportamiento normal.
      if (!feature) {
        return original(args);
      }

      // toggleHangingProtocol con el protocolo pesado YA activo = "apagar" MPR/3D
      // (volver a 2D) → permitir sin fricción.
      if (commandName === 'toggleHangingProtocol') {
        try {
          const { hangingProtocolService } = servicesManager.services;
          const active = hangingProtocolService.getActiveProtocol?.();
          if (active?.protocol?.id === protocolId) {
            return original(args);
          }
        } catch {
          /* noop */
        }
      }

      runCapabilityGuard({
        servicesManager,
        extensionManager,
        feature,
        onProceed: () => original(args),
        source: commandName,
      });

      // El protocolo se aplica de forma diferida dentro de onProceed (si procede).
      return undefined;
    };

    definition.__novaGuarded = true;
  }

  // Diferir para asegurar que los comandos del core ya estén registrados.
  setTimeout(tryInstall, 0);
}
