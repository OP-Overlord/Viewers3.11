import { hotkeys, defaults } from '@ohif/core';
import toolbarButtons from './toolbarButtons';
import initToolGroups from './initToolGroups';
import { id } from './id';
import { preloadThumbnails } from '../../../extensions/nova-layout/src/Panels/preloadThumbnails';
import AudioCinePlayer from '../../../extensions/nova-cine/src/AudioCinePlayer';
import { cineViewportStore } from '../../../extensions/nova-cine/src/cineViewportStore';
import hpXA from './hpXA';
import hpMammo, { registerMammoAttributes } from './hpMammo';
import hpDoc from './hpDoc';
import {
  mountConnectivityAgent,
  unmountConnectivityAgent,
} from '../../../extensions/nova-connectivity/src';
import './nova-theme.css';

/**
 * Hotkeys de NOVA Desktop derivados de los defaults de OHIF con dos cambios
 * relativos al cine:
 *  - Se elimina el binding por defecto `c` -> `toggleCine` (que solo mostraba la
 *    barra sin reproducir y afectaba a todos los viewports).
 *  - `space` deja de ser `resetViewport` y pasa a `novaCineTogglePlay` (activa y
 *    reproduce el cine en el viewport seleccionado). El reset se mueve a `0`.
 */
const novaDesktopHotkeyBindings = [
  ...defaults.hotkeyBindings
    .filter(binding => binding.commandName !== 'toggleCine')
    .map(binding =>
      binding.commandName === 'resetViewport' ? { ...binding, keys: ['0'] } : binding
    ),
  {
    commandName: 'novaCineTogglePlay',
    label: 'Cine (reproducir en viewport)',
    keys: ['space'],
  },
  {
    commandName: 'copyViewportToClipboard',
    label: 'Copy Viewport to Clipboard',
    keys: ['ctrl+c'],
    isEditable: true,
  },
  {
    commandName: 'toggleViewportOverlays',
    label: 'Toggle Viewport Overlays',
    keys: ['x'],
    isEditable: true,
  },
];

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
const nova = {
  cachedSeriesList: 'nova-layout.panelModule.cachedSeriesList',
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
  'nova-layout': '^1.0.0',
};

function modeFactory({ modeConfiguration }) {
  let _activatePanelTriggersSubscriptions = [];
  let _thumbnailPreloadSub: { unsubscribe: () => void } | null = null;
  let _stackScrollActivated = false;
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
      const {
        measurementService,
        toolbarService,
        toolGroupService,
        customizationService,
        studyPrefetcherService,
      } = servicesManager.services;

      // 👉 Forzar clase del tema en el root
      const root = document.getElementById('root');
      if (root && !root.classList.contains('theme-nova')) {
        root.classList.add('theme-nova');
      }

      // Prefetch en segundo plano: tras renderizar la primera imagen, precarga
      // el resto del display set activo (y los más cercanos) sin bloquear la
      // interacción. Se habilita explícitamente aquí (el servicio es singleton y
      // viene deshabilitado por defecto; nova-mobile lo desactiva por memoria).
      studyPrefetcherService?.setConfiguration?.({
        enabled: true,
        order: 'closest',
        displaySetsCount: 2,
        maxNumPrefetchRequests: 6,
      } as any);

      // Agente informativo de conectividad (NOVA AI): aparece sólo si detecta
      // latencia alta o descarga lenta. No invasivo y puramente informativo.
      mountConnectivityAgent();

      measurementService.clearMeasurements();

      // Comando de cine de nova: activa y reproduce el cine en el viewport
      // SELECCIONADO (no en todos), y como segundo toggle lo cierra. La
      // visibilidad por-viewport la gestiona cineViewportStore (ver nova-cine).
      // Lo usan tanto el atajo `space` como el botón "Cine" de la toolbar.
      commandsManager.registerCommand('CORNERSTONE', 'novaCineTogglePlay', () => {
        const { cineService, viewportGridService, cornerstoneViewportService } =
          servicesManager.services;
        const activeViewportId = viewportGridService.getActiveViewportId();
        if (!activeViewportId) {
          return;
        }

        if (cineViewportStore.isOpen(activeViewportId)) {
          // Segundo toggle: cerrar el cine de este viewport.
          const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
          if (viewport?.element) {
            cineService.stopClip(viewport.element, { viewportId: activeViewportId });
          }
          cineService.setCine({ id: activeViewportId, isPlaying: false });
          cineService.setViewportCineClosed(activeViewportId);
          cineViewportStore.close(activeViewportId);
          if (cineViewportStore.size() === 0) {
            cineService.setIsCineEnabled(false);
          }
          return;
        }

        // Mostrar y reproducir el cine en el viewport seleccionado.
        cineService.setIsCineEnabled(true);
        cineService.clearViewportCineClosed(activeViewportId);
        cineViewportStore.open(activeViewportId);
        cineService.setCine({ id: activeViewportId, isPlaying: true });
      });

      // Comando usado por el hanging protocol de XA (hpXA): muestra el cine en
      // el viewport activo pero PAUSADO.
      commandsManager.registerCommand('CORNERSTONE', 'novaCineShowPaused', () => {
        const { cineService, viewportGridService } = servicesManager.services;
        const activeViewportId = viewportGridService.getActiveViewportId();
        if (!activeViewportId) {
          return;
        }
        cineService.setIsCineEnabled(true);
        cineViewportStore.open(activeViewportId);
        cineService.setCine({ id: activeViewportId, isPlaying: false });

        // Suprime el autoplay del CinePlayer al cargar el HP de XA: la barra
        // queda visible (cineViewportStore) pero el cine NO arranca solo. Debe
        // ir DESPUÉS de setIsCineEnabled, que limpia el set de "cine cerrado".
        // El CinePlayer marca este displaySet como ya gestionado, por lo que el
        // primer play/pausa del usuario se respeta sin re-disparar autoplay.
        cineService.setViewportCineClosed(activeViewportId);
      });

      // Registrar el hanging protocol de XA (1x1 + cine pausado) solo en este
      // modo. Su id ya está listado en `hangingProtocol` (máxima prioridad).
      servicesManager.services.hangingProtocolService.addProtocol(hpXA.id, hpXA);

      // Registrar el hanging protocol de Mamografía (MG) y sus atributos
      // normalizados de identificación (MGLaterality/MGView). Layout adaptativo
      // 2x2 / 1x2 / 1x1 según la cantidad de imágenes (ver hpMammo).
      registerMammoAttributes({ servicesManager });
      servicesManager.services.hangingProtocolService.addProtocol(hpMammo.id, hpMammo);

      // Registrar el hanging protocol de Documento (DOC): documento a la
      // izquierda y series NO-DOC complementarias a la derecha (1/2/3 según
      // cuántas haya). Su id ya está listado en `hangingProtocol`.
      servicesManager.services.hangingProtocolService.addProtocol(hpDoc.id, hpDoc);

      // Init Default and SR ToolGroups
      initToolGroups(extensionManager, toolGroupService, commandsManager);

      toolbarService.register([...toolbarButtons]);

      const primaryTools = [
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
      ];
      toolbarService.updateSection('primary', primaryTools);

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
        // Reproductor de cine estilo reproductor de audio (barra inferior
        // flotante que no obstruye la imagen). Provisto por la extensión nova-cine.
        cinePlayer: {
          $set: AudioCinePlayer,
        },
        'panelSegmentation.disableEditing': {
          $set: true,
        },
        'ohif.hotkeyBindings': {
          $set: novaDesktopHotkeyBindings,
        },
      });
      // si está en DX/CR/RX, mostramos el grupo; si no, lo vaciamos (queda oculto)
      toolbarService.updateSection('SpecialMeasures', [
        'CobbAngle',
        'CardioThoracicIndex',
        'KiteAngle',
        'HilgenreinerAngle',
        'TonnisAngle',
        'InsallSalvatiIndex',
      ]);

      // Auto-activar sincronización de imagen cuando hay 2+ viewports reconstructables
      const { viewportGridService, displaySetService, syncGroupService } = servicesManager.services;

      const autoActivateImageSliceSync = () => {
        const { viewports } = viewportGridService.getState();
        const allViewports = [...viewports.values()];

        const reconstructable = allViewports.filter(vp => {
          if (!vp.displaySetInstanceUIDs?.length) {
            return false;
          }
          return vp.displaySetInstanceUIDs.some(uid => {
            const ds = displaySetService.getDisplaySetByUID(uid);
            return ds?.isReconstructable;
          });
        });

        if (reconstructable.length < 2) {
          return;
        }

        const syncExists = syncGroupService.getSynchronizer('IMAGE_SLICE_SYNC');
        if (syncExists) {
          return;
        }

        commandsManager.runCommand('toggleSynchronizer', { type: 'imageSlice' });
      };

      const gridStateSub = viewportGridService.subscribe(
        viewportGridService.EVENTS.GRID_STATE_CHANGED,
        () => setTimeout(autoActivateImageSliceSync, 300)
      );
      _activatePanelTriggersSubscriptions.push(gridStateSub);

      const viewportsReadySub = viewportGridService.subscribe(
        viewportGridService.EVENTS.VIEWPORTS_READY,
        () => setTimeout(autoActivateImageSliceSync, 300)
      );
      _activatePanelTriggersSubscriptions.push(viewportsReadySub);

      // Auto-activar StackScroll en modalidades con múltiples cortes (CT, MR, PT, NM…)
      const autoActivateStackScroll = () => {
        if (_stackScrollActivated) return;

        const { viewports } = viewportGridService.getState();
        const hasMultiFrame = [...viewports.values()].some(vp => {
          if (!vp.displaySetInstanceUIDs?.length) return false;
          return vp.displaySetInstanceUIDs.some(uid => {
            const ds = displaySetService.getDisplaySetByUID(uid);
            return ds?.isReconstructable || ((ds as any)?.numImageFrames != null && (ds as any).numImageFrames > 1);
          });
        });

        if (!hasMultiFrame) return;

        _stackScrollActivated = true;
        commandsManager.runCommand('setToolActiveToolbar', {
          toolName: 'StackScroll',
          toolGroupIds: ['default', 'mpr', 'SRToolGroup'],
        });
      };

      const stackScrollGridSub = viewportGridService.subscribe(
        viewportGridService.EVENTS.GRID_STATE_CHANGED,
        () => setTimeout(autoActivateStackScroll, 350)
      );
      _activatePanelTriggersSubscriptions.push(stackScrollGridSub);

      const stackScrollViewportsSub = viewportGridService.subscribe(
        viewportGridService.EVENTS.VIEWPORTS_READY,
        () => setTimeout(autoActivateStackScroll, 350)
      );
      _activatePanelTriggersSubscriptions.push(stackScrollViewportsSub);

      // Precargar thumbnails para que estén listas cuando se abra el panel
      _thumbnailPreloadSub = preloadThumbnails(servicesManager, extensionManager);

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
      root?.classList.remove('nova-hide-overlays');

      // Retirar el agente de conectividad y detener el monitor.
      unmountConnectivityAgent();

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
      _stackScrollActivated = false;

      // Limpiar el estado por-viewport del cine para no arrastrar viewports
      // "abiertos" a una próxima entrada al modo.
      cineViewportStore.clear();

      if (_thumbnailPreloadSub) {
        _thumbnailPreloadSub.unsubscribe();
        _thumbnailPreloadSub = null;
      }

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
              leftPanels: [nova.cachedSeriesList],
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
    hangingProtocol: ['@nova/hpXA', '@nova/hpDoc', '@nova/hpMammo', '@ohif/mnGrid', 'default'],
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