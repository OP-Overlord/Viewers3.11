// TODO: torn, can either bake this here; or have to create a whole new button type
// Only ways that you can pass in a custom React component for render :l
import type { Button } from '@ohif/core/types';
import { EVENTS } from '@cornerstonejs/core';
import { ViewportGridService } from '@ohif/core';

import { defaults } from '@ohif/core';
const { windowLevelPresets } = defaults;

const callbacks = (toolName: string) => [
  {
    commandName: 'setViewportForToolConfiguration',
    commandOptions: {
      toolName,
    },
  },
];

/**
 *
 * @param {*} preset - preset number (from above import)
 * @param {*} title
 * @param {*} subtitle
 */
function _createWwwcPreset(preset, title, subtitle) {
  return {
    id: title,
    uiType: 'ohif.toolButton',
    props: {
      title,
      subtitle,
      commands: [
        {
          commandName: 'setWindowLevel',
          commandOptions: {
            ...windowLevelPresets[preset],
          },
          context: 'CORNERSTONE',
        },
      ],
    },
  };
}

export const setToolActiveToolbar = {
  commandName: 'setToolActiveToolbar',
  commandOptions: {
    toolGroupIds: ['default', 'mpr', 'SRToolGroup'],
  },
};

const toolbarButtons: Button[] = [
  {
    id: 'MeasurementTools',
    uiType: 'ohif.toolButtonList',
    props: {
      buttonSection: true,
    },
  },
  {
    id: 'MoreTools',
    uiType: 'ohif.toolButtonList',
    props: {
      buttonSection: true,
    },
  },
  {
    id: 'SpecialMeasures',
    uiType: 'ohif.toolButtonList',
    props: {
      buttonSection: true,
      icon: 'tool-kiteangle', // icono del grupo
      label: 'Medidas Especiales',
      tooltip: 'Herramientas de medición especializadas',
    },
  },
  {
    id: 'WindowLevelGroup',
    uiType: 'ohif.toolButtonList',
    props: {
      buttonSection: true,
    },
  },

  // tool defs
  {
    id: 'advancedRenderingControls',
    uiType: 'ohif.advancedRenderingControls',
    props: {
      evaluate: {
        name: 'evaluate.advancedRenderingControls',
        hideWhenDisabled: true,
      },
    },
  },
  {
    id: 'modalityLoadBadge',
    uiType: 'ohif.modalityLoadBadge',
    props: {
      icon: 'Status',
      label: 'Estado',
      tooltip: 'Estado',
      evaluate: {
        name: 'evaluate.modalityLoadBadge',
        hideWhenDisabled: true,
      },
    },
  },
  {
    id: 'navigationComponent',
    uiType: 'ohif.navigationComponent',
    props: {
      icon: 'Navigation',
      label: 'Navegación',
      tooltip: 'Navegar entre segmentos/mediciones y gestionar su visibilidad',
      evaluate: {
        name: 'evaluate.navigationComponent',
        hideWhenDisabled: true,
      },
    },
  },
  {
    id: 'trackingStatus',
    uiType: 'ohif.trackingStatus',
    props: {
      icon: 'TrackingStatus',
      label: 'Estado de Seguimiento',
      tooltip: 'Ver y gestionar el estado de seguimiento de mediciones y anotaciones',
      evaluate: {
        name: 'evaluate.trackingStatus',
        hideWhenDisabled: true,
      },
    },
  },
  {
    id: 'dataOverlayMenu',
    uiType: 'ohif.dataOverlayMenu',
    props: {
      icon: 'ViewportViews',
      tooltip:
        'Configurar opciones de superposición de datos y gestionar conjuntos de visualización',
      evaluate: 'evaluate.dataOverlayMenu',
    },
  },
  {
    id: 'orientationMenu',
    uiType: 'ohif.orientationMenu',
    props: {
      icon: 'OrientationSwitch',
      tooltip: 'Cambiar orientación del visor entre planos axial, sagital, coronal y reformateados',
      evaluate: {
        name: 'evaluate.orientationMenu',
      },
    },
  },
  {
    id: 'windowLevelMenu',
    uiType: 'ohif.windowLevelMenu',
    props: {
      icon: 'WindowLevel',
      tooltip: 'Ajustar preajustes de ventana/nivel y personalizar configuración de contraste',
      evaluate: 'evaluate.windowLevelMenu',
    },
  },
  {
    id: 'voiManualControlMenu',
    uiType: 'ohif.voiManualControlMenu',
    props: {
      icon: 'WindowLevelAdvanced',
      label: 'Ventana/Nivel Avanzado',
      tooltip: 'Configuración avanzada de ventana/nivel con controles manuales y preajustes',
      evaluate: 'evaluate.voiManualControlMenu',
    },
  },
  {
    id: 'thresholdMenu',
    uiType: 'ohif.thresholdMenu',
    props: {
      icon: 'Threshold',
      label: 'Umbral',
      tooltip: 'Configuración de umbral de imagen',
      evaluate: {
        name: 'evaluate.thresholdMenu',
        hideWhenDisabled: true,
      },
    },
  },
  {
    id: 'opacityMenu',
    uiType: 'ohif.opacityMenu',
    props: {
      icon: 'Opacity',
      label: 'Opacidad',
      tooltip: 'Configuración de opacidad de imagen',
      evaluate: {
        name: 'evaluate.opacityMenu',
        hideWhenDisabled: true,
      },
    },
  },
  {
    id: 'Colorbar',
    uiType: 'ohif.colorbar',
    props: {
      type: 'tool',
      label: 'Colorbar',
    },
  },
  _createWwwcPreset(1, 'Tejidos blandos', '400 / 40'),
  _createWwwcPreset(2, 'Pulmon', '1500 / -600'),
  _createWwwcPreset(3, 'Hígado', '150 / 90'),
  _createWwwcPreset(4, 'Hueso', '2500 / 480'),
  _createWwwcPreset(5, 'Cerebro', '80 / 40'),
  {
    id: 'WindowLevel',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-window-level-nova',
      label: 'Contraste',
      tooltip: 'Contraste',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Length',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-length',
      label: 'Longitud',
      tooltip: 'Longitud',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Bidirectional',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-bidirectional',
      label: 'Bidireccional',
      tooltip: 'Bidireccional',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'ArrowAnnotate',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-annotate',
      label: 'Señalador',
      tooltip: 'Señalador',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'EllipticalROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-ellipse',
      label: 'Elipse',
      tooltip: 'Región de interés elíptica',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'CircleROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-circle',
      label: 'Circulo',
      tooltip: 'Circulo',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'PlanarFreehandROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-freehand-roi',
      label: 'ROI Mano Alzada',
      tooltip: 'Región de interés a mano alzada',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'SplineROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-spline-roi',
      label: 'ROI Spline',
      tooltip: 'Región de interés con curvas spline',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'LivewireContour',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-livewire',
      label: 'Herramienta Livewire',
      tooltip: 'Herramienta de contorno inteligente',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Zoom',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-zoom',
      label: 'Zoom',
      tooltip: 'Zoom',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Pan',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-move',
      label: 'Desplazar',
      tooltip: 'Desplazar',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'MPR',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-mpr',
      label: 'MPR',
      tooltip: 'MPR',
      // El guard de capacidad MPR/3D se aplica de forma CENTRAL interceptando
      // `toggleHangingProtocol` (ver nova-layout/preRegistration.ts).
      commands: {
        commandName: 'toggleHangingProtocol',
        commandOptions: {
          protocolId: 'mpr',
        },
      },
      evaluate: 'evaluate.displaySetIsReconstructable',
    },
  },
  {
    id: 'TrackBallRotate',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-3d-rotate',
      label: 'Rotar 3D',
      tooltip: 'Rotación 3D',
      commands: setToolActiveToolbar,
    },
  },
  {
    id: 'Capture',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-capture-nova',
      label: 'Captura',
      tooltip: 'Capturar imagen del visor',
      commands: 'showDownloadViewportModal',
      evaluate: [
        'evaluate.action',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video', 'wholeSlide'],
        },
      ],
    },
  },
  {
    id: 'Layout',
    uiType: 'ohif.layoutSelector',
    props: {
      rows: 3,
      columns: 4,
      label: 'Diseño',
      evaluate: 'evaluate.action',
      commands: 'setViewportGridLayout',
    },
  },
  {
    id: 'Crosshairs',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-crosshair',
      label: 'Triangular',
      tooltip: 'Triangular',
      commands: {
        commandName: 'setToolActiveToolbar',
        commandOptions: {
          toolGroupIds: ['mpr'],
        },
      },
      evaluate: 'evaluate.cornerstoneTool',
    },
  },

  {
    id: 'Reset',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-reset',
      label: 'Resetear',
      tooltip: 'Resetear Vista',
      commands: 'resetViewport',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'rotate-right',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-rotate-right',
      label: 'Rotar',
      tooltip: 'Rotar 90 grados en el sentido horario',
      commands: 'rotateViewportCW',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'flipHorizontal',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-flip-horizontal',
      label: 'Flip',
      tooltip: 'Flip',
      commands: 'flipViewportHorizontal',
      evaluate: 'evaluate.viewportProperties.toggle',
    },
  },
  {
    id: 'ImageSliceSync',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'link',
      label: 'Sincronizar',
      tooltip: 'Habilitar la sincronización entre imágenes',
      commands: {
        commandName: 'toggleSynchronizer',
        commandOptions: {
          type: 'imageSlice',
        },
      },
      listeners: {
        [EVENTS.VIEWPORT_NEW_IMAGE_SET]: {
          commandName: 'toggleImageSliceSync',
          commandOptions: { toggledState: true },
        },
      },
      evaluate: [
        'evaluate.cornerstone.synchronizer',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video', 'volume3d'],
        },
      ],
    },
  },
  {
    id: 'ReferenceLines',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-referenceLines',
      label: 'Lineas de referencia',
      tooltip: 'Lineas de referencia',
      commands: 'toggleEnabledDisabledToolbar',
      listeners: {
        [ViewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED]: callbacks('ReferenceLines'),
        [ViewportGridService.EVENTS.VIEWPORTS_READY]: callbacks('ReferenceLines'),
      },
      evaluate: [
        'evaluate.cornerstoneTool.toggle',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video'],
        },
      ],
    },
  },
  {
    id: 'ImageOverlayViewer',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'toggle-dicom-overlay',
      label: 'Superposición de Imagen',
      tooltip: 'Alternar superposición de imagen',
      commands: 'toggleEnabledDisabledToolbar',
      evaluate: 'evaluate.cornerstoneTool.toggle',
    },
  },
  {
    id: 'StackScroll',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-stack-scroll',
      label: 'Stack',
      tooltip: 'Stack',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'invert',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-invert',
      label: 'Invertir',
      tooltip: 'Invertir',
      commands: 'invertViewport',
      evaluate: 'evaluate.viewportProperties.toggle',
    },
  },
  {
    id: 'Probe',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-probe',
      label: 'Probe',
      tooltip: 'Probe',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Cine',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-cine-nova',
      label: 'Cine',
      tooltip: 'Cine',
      commands: 'toggleCine',
      evaluate: 'evaluate.cine',
    },
  },
  {
    id: 'CardioThoracicIndex',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-ict',
      label: 'Indice Cardiotorácico',
      tooltip: 'Relación entre el ancho cardíaco y el diámetro torácico para evaluar cardiomegalia',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.modality.supported',
          supportedModalities: ['DX', 'CR', 'RX'],
        },
      ],
    },
  },
  {
    id: 'KiteAngle',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-kiteangle',
      label: 'Ángulo de Kite',
      tooltip:
        'Ángulo entre el eje del astrágalo y el calcáneo, usado para evaluar alineación del retropié',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.modality.supported',
          supportedModalities: ['DX', 'CR', 'RX'],
        },
      ],
    },
  },
  {
    id: 'HilgenreinerAngle',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-hilgenreiner',
      label: 'Ángulo Acetabular',
      tooltip: 'Inclinación del techo acetabular respecto a la pelvi',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.modality.supported',
          supportedModalities: ['DX', 'CR', 'RX'],
        },
      ],
    },
  },
  {
    id: 'TonnisAngle',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-tonnis',
      label: 'Ángulo de Tonnis',
      tooltip: 'Inclinación del techo acetabular en pelvis infantil',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.modality.supported',
          supportedModalities: ['DX', 'CR', 'RX'],
        },
      ],
    },
  },
  {
    id: 'InsallSalvatiIndex',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-insall-salvati',
      label: 'Índice Insall-Salvati',
      tooltip: 'Relación entre la longitud del tendón rotuliano y la rótula para evaluar la posición de la rótula',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.modality.supported',
          supportedModalities: ['DX', 'CR', 'RX'],
        },
      ],
    },
  },
  {
    id: 'Angle',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-angle',
      label: 'Angulo',
      tooltip: 'Angulo',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'CobbAngle',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-cobb-angle',
      label: 'Ángulo de Cobb',
      tooltip: 'Ángulo que mide la desviación lateral de la columna para evaluar escoliosis',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.modality.supported',
          supportedModalities: ['DX', 'CR', 'RX'],
        },
      ],
    },
  },
  {
    id: 'Magnify',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-magnify',
      label: 'Zoom-in',
      tooltip: 'Zoom-in',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'RectangleROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-rectangle',
      label: 'Rectangulo',
      tooltip: 'Rectangulo',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'CalibrationLine',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-calibration',
      label: 'Calibración',
      tooltip: 'Calibración',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'TagBrowser',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'dicom-tag-browser',
      label: 'Buscador DICOM Tag',
      tooltip: 'Buscador DICOM Tag',
      commands: 'openDICOMTagViewer',
    },
  },
  {
    id: 'AdvancedMagnify',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-loupe',
      label: 'Lupa Avanzada',
      tooltip: 'Herramienta de lupa con información de píxeles',
      commands: 'toggleActiveDisabledToolbar',
      evaluate: 'evaluate.cornerstoneTool.toggle.ifStrictlyDisabled',
    },
  },
  {
    id: 'UltrasoundDirectionalTool',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-ultrasound-bidirectional',
      label: 'Ultrasonido Direccional',
      tooltip: 'Herramienta de medición direccional para ultrasonido',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.modality.supported',
          supportedModalities: ['US'],
        },
      ],
    },
  },
  {
    id: 'WindowLevelRegion',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-window-region',
      label: 'Contraste de un región',
      tooltip: 'Contraste de un región',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
];

export default toolbarButtons;
