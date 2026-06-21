/**
 * cineViewportStore
 *
 * Fuente de verdad —por viewport— de qué barras de cine de nova están
 * visibles. OHIF gobierna la visibilidad del cine con un único flag GLOBAL
 * (`cineService.isCineEnabled`), por lo que al habilitarlo aparece la barra en
 * TODOS los viewports y, al cerrar una, cualquier otro viewport en reproducción
 * vuelve a activarla. Para que el cine sea realmente por-viewport (mostrar y
 * reproducir solo en el viewport seleccionado, y poder cerrar uno sin afectar a
 * los demás), nova-cine mantiene aquí el conjunto de viewports "abiertos".
 *
 * Es un store de módulo (singleton) compartido por todas las instancias de
 * `AudioCinePlayer` y por el comando `novaCineTogglePlay`. No depende de React.
 */
type Listener = () => void;

const openViewports = new Set<string>();
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(listener => listener());
}

export const cineViewportStore = {
  open(viewportId: string) {
    if (viewportId && !openViewports.has(viewportId)) {
      openViewports.add(viewportId);
      emit();
    }
  },

  close(viewportId: string) {
    if (openViewports.delete(viewportId)) {
      emit();
    }
  },

  isOpen(viewportId: string) {
    return openViewports.has(viewportId);
  },

  size() {
    return openViewports.size;
  },

  clear() {
    if (openViewports.size) {
      openViewports.clear();
      emit();
    }
  },

  /** Suscribe a cambios del conjunto. Devuelve función para desuscribir. */
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export default cineViewportStore;
