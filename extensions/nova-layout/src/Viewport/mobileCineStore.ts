/**
 * mobileCineStore
 *
 * Fuente de verdad (singleton de módulo) de si la barra de cine del modo móvil
 * está visible. El modo móvil tiene UN solo viewport, así que basta un booleano
 * global (no hace falta el set por-viewport del desktop, ver nova-cine).
 *
 * Lo usan dos partes desacopladas:
 *  - El botón "Cine" de la toolbar, vía el comando `novaMobileToggleCine`
 *    (`toggle()`), que vive fuera de React.
 *  - El componente `MobileCinePlayer`, que se suscribe para mostrar/ocultar la
 *    barra y arrancar/detener la reproducción.
 *
 * El reproductor RESETEA el store al montarse para cada serie (autoplay en
 * US/RF/XA, oculto en el resto), de modo que un toggle "viejo" no se arrastra
 * entre series.
 */
type Listener = () => void;

let _visible = false;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach(listener => listener());
}

export const mobileCineStore = {
  isVisible(): boolean {
    return _visible;
  },

  set(visible: boolean): void {
    if (_visible !== visible) {
      _visible = visible;
      emit();
    }
  },

  toggle(): void {
    _visible = !_visible;
    emit();
  },

  /** Suscribe a cambios de visibilidad. Devuelve función para desuscribir. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export default mobileCineStore;
