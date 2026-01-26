import { hotkeys } from '@ohif/core';
import toolbarButtons from './toolbarButtons';
import initToolGroups from './initToolGroups';
import { id } from './id';
import './nova-theme.css';

// Allow this mode by excluding non-imaging modalities such as SR, SEG
// Also, SM is not a simple imaging modalities, so exclude it.
const NON_IMAGE_MODALITIES = ['ECG', 'SEG', 'RTSTRUCT', 'RTPLAN', 'PR'];
const ohif = {
  layout: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  hangingProtocol: '@ohif/extension-default.hangingProtocolModule.default',
  thumbnailList: '@ohif/extension-default.panelModule.seriesList',
  wsiSopClassHandler:
    '@ohif/extension-cornerstone.sopClassHandlerModule.DicomMicroscopySopClassHandler',
};
const cornerstone = {
  measurements: '@ohif/extension-cornerstone.panelModule.panelMeasurement',
  segmentation: '@ohif/extension-cornerstone.panelModule.panelSegmentation',
  viewport: '@ohif/extension-cornerstone.viewportModule.cornerstone',
};
const tracked = {
  measurements: '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
  thumbnailList: '@ohif/extension-measurement-tracking.panelModule.seriesList',
  viewport: '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked',
};
const dicomsr = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-sr.sopClassHandlerModule.dicom-sr',
  sopClassHandler3D: '@ohif/extension-cornerstone-dicom-sr.sopClassHandlerModule.dicom-sr-3d',
  viewport: '@ohif/extension-cornerstone-dicom-sr.viewportModule.dicom-sr',
};

const dicomvideo = {
  sopClassHandler: '@ohif/extension-dicom-video.sopClassHandlerModule.dicom-video',
  viewport: '@ohif/extension-dicom-video.viewportModule.dicom-video',
};

const dicompdf = {
  sopClassHandler: '@ohif/extension-dicom-pdf.sopClassHandlerModule.dicom-pdf',
  viewport: '@ohif/extension-dicom-pdf.viewportModule.dicom-pdf',
};

const dicomSeg = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-seg.sopClassHandlerModule.dicom-seg',
  viewport: '@ohif/extension-cornerstone-dicom-seg.viewportModule.dicom-seg',
};

const dicomPmap = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-pmap.sopClassHandlerModule.dicom-pmap',
  viewport: '@ohif/extension-cornerstone-dicom-pmap.viewportModule.dicom-pmap',
};

const dicomRT = {
  viewport: '@ohif/extension-cornerstone-dicom-rt.viewportModule.dicom-rt',
  sopClassHandler: '@ohif/extension-cornerstone-dicom-rt.sopClassHandlerModule.dicom-rt',
};

/**
 * Just two dependencies to be able to render a viewport with panels in order
 * to make sure that the mode is working.
 */
const extensionDependencies = {
  '@ohif/extension-default': '^3.0.0',
  '@ohif/extension-cornerstone': '^3.0.0',
  '@ohif/extension-measurement-tracking': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-sr': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-pmap': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-rt': '^3.0.0',
  '@ohif/extension-dicom-pdf': '^3.0.1',
  '@ohif/extension-dicom-video': '^3.0.1',
  'nova-measures': '^1.0.0',
};

function modeFactory({ modeConfiguration }) {
  let _activatePanelTriggersSubscriptions = [];
  return {
    /**
     * Mode ID, which should be unique among modes used by the viewer. This ID
     * is used to identify the mode in the viewer's state.
     */
    id,
    routeName: 'desktop',
    /**
     * Mode name, which is displayed in the viewer's UI in the workList, for the
     * user to select the mode.
     */
    displayName: 'NOVA Desktop',

    /*getCustomizationModule() {
      return [
        { name: 'ui.themeClass', value: 'theme-nova' }, // clase raíz que podremos estilizar
      ];
    },*/

    /**
     * Runs when the Mode Route is mounted to the DOM. Usually used to initialize
     * Services and other resources.
     */
    onModeEnter: ({ servicesManager, extensionManager, commandsManager }: withAppTypes) => {
      const { measurementService, toolbarService, toolGroupService, customizationService } =
        servicesManager.services;

      // 👉 Forzar clase del tema en el root
      const root = document.getElementById('root');
      if (root && !root.classList.contains('theme-nova')) {
        root.classList.add('theme-nova');
      }

      measurementService.clearMeasurements();

      // Init Default and SR ToolGroups
      initToolGroups(extensionManager, toolGroupService, commandsManager);

      toolbarService.register([...toolbarButtons]);
      toolbarService.updateSection('primary', [
        'MeasurementTools',
        'SpecialMeasures',
        'Cine',
        'Zoom',
        'Pan',
        'TrackballRotate',
        'WindowLevel',
        'Capture',
        'Layout',
        'Crosshairs',
        'ImageSliceSync',
        'MoreTools',
      ]);

      toolbarService.updateSection(toolbarService.sections.viewportActionMenu.topLeft, [
        'orientationMenu',
        'dataOverlayMenu',
      ]);

      toolbarService.updateSection(toolbarService.sections.viewportActionMenu.bottomMiddle, [
        'AdvancedRenderingControls',
      ]);

      toolbarService.updateSection('AdvancedRenderingControls', [
        'windowLevelMenuEmbedded',
        'voiManualControlMenu',
        'Colorbar',
        'opacityMenu',
        'thresholdMenu',
      ]);

      toolbarService.updateSection(toolbarService.sections.viewportActionMenu.topRight, [
        'modalityLoadBadge',
        'trackingStatus',
        'navigationComponent',
      ]);

      toolbarService.updateSection(toolbarService.sections.viewportActionMenu.bottomLeft, [
        'windowLevelMenu',
      ]);

      toolbarService.updateSection('MeasurementTools', [
        'Length',
        'Angle',
        'Bidirectional',
        'ArrowAnnotate',
        'EllipticalROI',
        'RectangleROI',
        'CircleROI',
        'PlanarFreehandROI',
        'SplineROI',
        'LivewireContour',
      ]);

      toolbarService.updateSection('MoreTools', [
        'Reset',
        'rotate-right',
        'flipHorizontal',
        'ReferenceLines',
        'ImageOverlayViewer',
        'StackScroll',
        'invert',
        'Probe',
        'Magnify',
        'CalibrationLine',
        'TagBrowser',
        'AdvancedMagnify',
        'UltrasoundDirectionalTool',
        'WindowLevelRegion',
      ]);
      customizationService.setCustomizations({
        'panelSegmentation.disableEditing': {
          $set: true,
        },
      });
      // si está en DX/CR/RX, mostramos el grupo; si no, lo vaciamos (queda oculto)
      toolbarService.updateSection('SpecialMeasures', [
        'CobbAngle',
        'CardioThoracicIndex',
        'KiteAngle',
        'HilgenreinerAngle',
        'TonnisAngle',
      ]);

      // ==========================
      //  HOVER PARA PANEL IZQUIERDO usando el botón existente (simple por ciclos)
      // ==========================
      const setupHoverLeftPanel = () => {
        const root = document.getElementById('root');
        if (!root) {
          console.warn('[NOVA] root no encontrado');
          return;
        }

        // Evitar crear dos veces la zona
        if (document.getElementById('nova-hover-left-panel-zone')) {
          return;
        }

        // ⬅️ AJUSTA ESTE SELECTOR AL CONTENEDOR REAL DEL PANEL IZQUIERDO
        const PANEL_SELECTOR = '[data-cy="left-panel"]';
        // Botón del header que ya probaste manualmente
        const BUTTON_SELECTOR = '[data-cy="side-panel-header-left"]';

        const getPanel = () => document.querySelector(PANEL_SELECTOR) as HTMLElement | null;

        const getButton = () => document.querySelector(BUTTON_SELECTOR) as HTMLElement | null;

        // Crear zona caliente pegada al borde izquierdo
        const hoverZone = document.createElement('div');
        hoverZone.id = 'nova-hover-left-panel-zone';
        Object.assign(hoverZone.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          bottom: '0',
          width: '50px', // puedes ajustar
          zIndex: '9999',
          background: 'transparent',
        });

        // Flag para no iniciar dos ciclos a la vez
        let cycleActive = false;

        hoverZone.addEventListener('mouseenter', () => {
          const btn = getButton();
          if (!btn) {
            console.warn('[NOVA] Botón panel izquierdo no encontrado en hover');
            return;
          }

          // ya hay un ciclo abierto → no hacer nada
          if (cycleActive) {
            return;
          }

          cycleActive = true;

          console.debug('[NOVA] hover borde izquierdo → abrir panel (click botón)');
          btn.click(); // abrir panel

          // Tras un pequeño delay, medimos el panel y enganchamos pointermove
          setTimeout(() => {
            const panel = getPanel();
            let thresholdX = 350; // valor por defecto si no encontramos el panel

            if (panel) {
              const rect = panel.getBoundingClientRect();
              // umbral un poco más allá del borde derecho del panel
              thresholdX = rect.right + 20;
              console.debug('[NOVA] thresholdX calculado:', thresholdX, 'rect:', rect);
            } else {
              console.warn('[NOVA] panel no encontrado al calcular threshold, usando 350');
            }

            const onPointerMove = (evt: PointerEvent) => {
              // cuando el mouse se aleje más allá del umbral → cerrar
              if (evt.clientX > thresholdX) {
                const btnInner = getButton();
                if (btnInner) {
                  console.debug('[NOVA] pointer fuera de área → cerrar panel (click botón)');
                  btnInner.click();
                }
                window.removeEventListener('pointermove', onPointerMove, true);
                cycleActive = false;
              }
            };

            window.addEventListener('pointermove', onPointerMove, { capture: true });

            // Registrar cleanup para onModeExit
            _activatePanelTriggersSubscriptions.push({
              unsubscribe: () => {
                window.removeEventListener('pointermove', onPointerMove, true);
                cycleActive = false;
              },
            });
          }, 150); // pequeño delay para que el layout actualice el panel
        });

        root.appendChild(hoverZone);
      };

      // Darle un pequeño margen para que se monte el layout
      setTimeout(setupHoverLeftPanel, 500);
    },
    onModeExit: ({ servicesManager }: withAppTypes) => {
      const root = document.getElementById('root');
      root?.classList.remove('theme-nova');

      const {
        toolGroupService,
        syncGroupService,
        segmentationService,
        cornerstoneViewportService,
        uiDialogService,
        uiModalService,
      } = servicesManager.services;

      _activatePanelTriggersSubscriptions.forEach(sub => sub.unsubscribe());
      _activatePanelTriggersSubscriptions = [];

      uiDialogService.hideAll();
      uiModalService.hide();
      toolGroupService.destroy();
      syncGroupService.destroy();
      segmentationService.destroy();
      cornerstoneViewportService.destroy();
    },
    /** */
    validationTags: {
      study: [],
      series: [],
    },
    /**
     * A boolean return value that indicates whether the mode is valid for the
     * modalities of the selected studies. For instance a PET/CT mode should be
     */
    isValidMode: ({ modalities }) => {
      const modalities_list = modalities.split('\\');

      // Exclude non-image modalities
      return {
        valid: !!modalities_list.filter(modality => NON_IMAGE_MODALITIES.indexOf(modality) === -1)
          .length,
        description:
          'The mode does not support studies that ONLY include the following modalities: SM, ECG, SEG, RTSTRUCT',
      };
    },
    /**
     * Mode Routes are used to define the mode's behavior. A list of Mode Route
     * that includes the mode's path and the layout to be used. The layout will
     * include the components that are used in the layout. For instance, if the
     * default layoutTemplate is used (id: '@ohif/extension-default.layoutTemplateModule.viewerLayout')
     * it will include the leftPanels, rightPanels, and viewports. However, if
     * you define another layoutTemplate that includes a Footer for instance,
     * you should provide the Footer component here too. Note: We use Strings
     * to reference the component's ID as they are registered in the internal
     * ExtensionManager. The template for the string is:
     * `${extensionId}.{moduleType}.${componentId}`.
     */
    routes: [
      {
        path: 'desktop',
        layoutTemplate: ({ location, servicesManager }) => {
          return {
            id: ohif.layout,
            props: {
              leftPanels: [tracked.thumbnailList],
              leftPanelResizable: true,
              leftPanelClosed: true,

              rightPanels: [cornerstone.segmentation, tracked.measurements],
              rightPanelClosed: true,
              rightPanelResizable: true,
              viewports: [
                {
                  namespace: tracked.viewport,
                  displaySetsToDisplay: [
                    ohif.sopClassHandler,
                    dicomvideo.sopClassHandler,
                    dicomsr.sopClassHandler3D,
                    ohif.wsiSopClassHandler,
                  ],
                },
                {
                  namespace: dicomsr.viewport,
                  displaySetsToDisplay: [dicomsr.sopClassHandler],
                },
                {
                  namespace: dicompdf.viewport,
                  displaySetsToDisplay: [dicompdf.sopClassHandler],
                },
                {
                  namespace: dicomSeg.viewport,
                  displaySetsToDisplay: [dicomSeg.sopClassHandler],
                },
                {
                  namespace: dicomPmap.viewport,
                  displaySetsToDisplay: [dicomPmap.sopClassHandler],
                },
                {
                  namespace: dicomRT.viewport,
                  displaySetsToDisplay: [dicomRT.sopClassHandler],
                },
              ],
            },
          };
        },
      },
    ],
    /** List of extensions that are used by the mode */
    extensions: extensionDependencies,
    /** HangingProtocol used by the mode */
    hangingProtocol: ['@ohif/mnGrid', 'default'],
    /** SopClassHandlers used by the mode */
    sopClassHandlers: [
      dicomvideo.sopClassHandler,
      dicomSeg.sopClassHandler,
      dicomPmap.sopClassHandler,
      ohif.sopClassHandler,
      ohif.wsiSopClassHandler,
      dicompdf.sopClassHandler,
      dicomsr.sopClassHandler3D,
      dicomsr.sopClassHandler,
      dicomRT.sopClassHandler,
    ],
    ...modeConfiguration,
    /** hotkeys for mode */
  };
}

const mode = {
  id,
  modeFactory,
  extensionDependencies,
};

export default mode;
export { initToolGroups, toolbarButtons };
