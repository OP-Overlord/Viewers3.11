import type { Button } from '@ohif/core/types';

export const setToolActiveToolbar = {
  commandName: 'setToolActiveToolbar',
  commandOptions: {
    toolGroupIds: ['default', 'mpr', 'SRToolGroup'],
  },
};

// Comando móvil que activa la herramienta; pero si el botón YA está activo y se
// vuelve a presionar, la desactiva y cae al tool por defecto: StackScroll en series
// multi-instancia (para navegar) o Desplazar (Pan) en series de una sola instancia.
// `commandOptions.toolName` también lo lee `getToolNameForButton` → mantiene el
// resaltado de `evaluate.cornerstoneTool`.
const toggleMobileTool = (toolName: string) => ({
  commandName: 'novaMobileSetTool',
  commandOptions: { toolName },
});

const toolbarButtons: Button[] = [
  {
    id: 'Pan',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-move',
      label: 'Desplazar',
      tooltip: 'Mueve la imagen dentro del visor',
      commands: toggleMobileTool('Pan'),
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Length',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-length',
      label: 'Medir',
      tooltip: 'Mide la distancia entre dos puntos',
      commands: toggleMobileTool('Length'),
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'WindowLevel',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-window-level-nova',
      label: 'Contraste',
      tooltip: 'Ajusta el contraste de la imagen',
      commands: toggleMobileTool('WindowLevel'),
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Cine',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-cine-nova',
      label: 'Cine',
      tooltip: 'Reproduce la serie como video (automático en US/RF/XA)',
      commands: 'novaMobileToggleCine',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'Share',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-capture-nova',
      label: 'Compartir',
      tooltip: 'Comparte o descarga la imagen actual',
      commands: 'shareViewportImage',
      evaluate: 'evaluate.action',
    },
  },
];

export default toolbarButtons;
