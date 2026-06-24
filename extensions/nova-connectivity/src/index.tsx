import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { id } from './id';
import ConnectivityAgent from './ConnectivityAgent';
import { connectivityMonitor } from './connectivityMonitor';

/**
 * nova-connectivity
 *
 * Agente informativo de calidad de conexión ("NOVA AI"). Vigila de forma PASIVA la
 * latencia y la velocidad de descarga y, sólo cuando detecta degradación, muestra
 * una burbuja flotante no invasiva con tono de asistente de IA. Es puramente
 * informativo (no ejecuta acciones sobre el visor).
 *
 * Se consume desde el código fuente (igual que nova-cine): cada modo que lo quiera
 * (nova-desktop, nova-anonimized, nova-mobile) llama a `mountConnectivityAgent()`
 * en su `onModeEnter` y a `unmountConnectivityAgent()` en su `onModeExit`.
 *
 * El widget se monta vía portal en <body> (un <div> propio), por lo que es
 * independiente del layout de cada modo y funciona igual en desktop y móvil.
 */

const CONTAINER_ID = 'nova-connectivity-root';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Monta el agente y arranca el monitor. Idempotente. */
export function mountConnectivityAgent(): void {
  if (typeof document === 'undefined' || root) {
    return;
  }
  container = document.createElement('div');
  container.id = CONTAINER_ID;
  document.body.appendChild(container);

  root = createRoot(container);
  root.render(<ConnectivityAgent />);

  connectivityMonitor.start();
}

/** Desmonta el agente y detiene el monitor. Idempotente. */
export function unmountConnectivityAgent(): void {
  connectivityMonitor.stop();
  if (root) {
    root.unmount();
    root = null;
  }
  if (container?.parentNode) {
    container.parentNode.removeChild(container);
  }
  container = null;
}

export { ConnectivityAgent, connectivityMonitor };

// Objeto de extensión OHIF (mínimo). El cableado real es vía los helpers de
// arriba; este objeto existe por consistencia con el resto de extensiones nova.
const novaConnectivityExtension = {
  id,
};

export default novaConnectivityExtension;
