import type { Button } from '@ohif/core/types';

export const setToolActiveToolbar = {
  commandName: 'setToolActiveToolbar',
  commandOptions: {
    toolGroupIds: ['default', 'mpr', 'SRToolGroup'],
  },
};

const toolbarButtons: Button[] = [
  {
    id: 'Pan',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-move',
      label: 'Desplazar',
      tooltip: 'Mueve la imagen dentro del visor',
      commands: setToolActiveToolbar,
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
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'WindowLevel',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-window-level',
      label: 'Contraste',
      tooltip: 'Ajusta el contraste de la imagen',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Share',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-capture',
      label: 'Compartir',
      tooltip: 'Comparte o descarga la imagen actual',
      commands: 'shareViewportImage',
      evaluate: 'evaluate.action',
    },
  },
];

export default toolbarButtons;
