import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { id } from './id';
import ToolGuideAgent from './ToolGuideAgent';

/**
 * nova-tool-guide
 *
 * Guía flotante de las herramientas de medición especializadas (ortopedia y
 * cardiología). Al activar una tool del menú "Medidas Especiales" muestra una
 * burbuja no invasiva en la esquina inferior derecha (5 s de auto-cierre) que,
 * al expandirse, explica cómo usar la medida, sus referencias anatómicas por
 * población, los valores de referencia y la bibliografía pública.
 *
 * Se consume desde el código fuente (igual que nova-cine y nova-connectivity):
 * cada modo que lo quiera llama a `mountToolGuideAgent()` en su `onModeEnter`
 * y a `unmountToolGuideAgent()` en su `onModeExit`.
 *
 * El widget se monta vía portal en <body> (un <div> propio), por lo que es
 * independiente del layout del modo y nunca interfiere con el canvas.
 */

const CONTAINER_ID = 'nova-tool-guide-root';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Monta la guía de herramientas. Idempotente. */
export function mountToolGuideAgent(): void {
  if (typeof document === 'undefined' || root) {
    return;
  }
  container = document.createElement('div');
  container.id = CONTAINER_ID;
  document.body.appendChild(container);

  root = createRoot(container);
  root.render(<ToolGuideAgent />);
}

/** Desmonta la guía de herramientas. Idempotente. */
export function unmountToolGuideAgent(): void {
  if (root) {
    root.unmount();
    root = null;
  }
  if (container?.parentNode) {
    container.parentNode.removeChild(container);
  }
  container = null;
}

export { ToolGuideAgent };
export { default as toolGuides } from './toolGuides';

// Objeto de extensión OHIF (mínimo). El cableado real es vía los helpers de
// arriba; este objeto existe por consistencia con el resto de extensiones nova.
const novaToolGuideExtension = {
  id,
};

export default novaToolGuideExtension;
