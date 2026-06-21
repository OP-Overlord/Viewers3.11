import { id } from './id';
import AudioCinePlayer from './AudioCinePlayer';

/**
 * nova-cine
 *
 * Provee un reproductor de cine con estética de reproductor de audio que se
 * ubica como una barra flotante en el borde inferior del viewport, evitando
 * obstruir la imagen mientras el médico interpreta.
 *
 * El componente se publica como la customización `cinePlayer`, de modo que
 * cualquier modo que registre esta extensión (o que la importe y la inyecte
 * vía `customizationService`) reemplaza el reproductor de cine por defecto.
 *
 * En este proyecto se activa únicamente desde el modo `nova-desktop`, que
 * importa `AudioCinePlayer` y lo registra en `onModeEnter`.
 */
const novaCineExtension = {
  id,

  getCustomizationModule: () => [
    {
      name: 'default',
      value: {
        // Reemplaza el reproductor de cine por defecto (@ohif/ui-next CinePlayer).
        cinePlayer: AudioCinePlayer,
      },
    },
  ],
};

export { AudioCinePlayer };
export default novaCineExtension;
