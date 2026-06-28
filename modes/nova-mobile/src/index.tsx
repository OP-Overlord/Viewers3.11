import {
  cache as csCache,
  setUseCPURendering,
  resetUseCPURendering,
} from '@cornerstonejs/core';
import toolbarButtons from './toolbarButtons';
import initToolGroups from './initToolGroups';
import hpMobile from './hpMobile';
import { id } from './id';
import { registerRenderedImageLoader } from '../../../extensions/nova-layout/src/Viewport/renderedImageLoader';
import { mobileCineStore } from '../../../extensions/nova-layout/src/Viewport/mobileCineStore';
import {
  mountConnectivityAgent,
  unmountConnectivityAgent,
} from '../../../extensions/nova-connectivity/src';
import './nova-mobile-theme.css';

/**
 * 200 MB Cornerstone image cache for mobile.
 * Default is 3 GB — on mobile that allows 15+ large DX/MG images to accumulate
 * (~200 MB each decoded), exhausting the browser tab memory and causing a crash.
 * At 200 MB only ~1-2 large images stay cached at a time.
 */
const MOBILE_MAX_CACHE_BYTES = 200 * 1024 * 1024; // 200 MB

const NON_IMAGE_MODALITIES = ['ECG', 'SEG', 'RTSTRUCT', 'RTPLAN', 'PR', 'SM'];

/**
 * Apply mobile-optimized configuration through customizationService
 * Solo elimina los overlays del viewport para una UI más limpia en móviles
 */
function applyMobileConfiguration(customizationService) {
  // Remove all viewport overlays for mobile (cleaner UI, better performance)
  customizationService.setCustomizations({
    'viewportOverlay.topLeft': { $set: [] },
    'viewportOverlay.topRight': { $set: [] },
    'viewportOverlay.bottomLeft': { $set: [] },
    'viewportOverlay.bottomRight': { $set: [] },
    'ohif.tours': { $set: [] },
  });

  console.log('[Nova Mobile] Mobile configuration applied (overlays removed)');
}

/**
 * Configure dataSource to request mobile-friendly transfer syntax.
 *
 * Problem: DX/MG images at 4000-8000px uncompressed = 32-128MB per frame.
 * Loading even 2-3 of these exhausts the mobile browser tab memory (~400MB).
 *
 * Strategy:
 * - JPEG Baseline first (type=image/jpeg): 10-20× smaller than uncompressed,
 *   natively supported by @cornerstonejs/dicom-image-loader (libjpeg-turbo WASM).
 * - JPEG 2000 second (type=image/jp2): lossless compression, 16-bit capable.
 * - Uncompressed last resort (q=0.3): for CT/MR (512×512, ~0.5MB – safe).
 * - NEVER request JPEG-LS (1.2.840.10008.1.2.4.80): WASM decoder fails on mobile.
 *
 * How it works: initWADOImageLoader.js calls getConfig() inside beforeSend on
 * every image request, so this override takes effect immediately.
 */
function configureMobileTransferSyntax(extensionManager) {
  try {
    const [dataSource] = extensionManager.getActiveDataSource();
    const config = dataSource?.getConfig?.();
    if (!config) {
      console.warn('[Nova Mobile] No active dataSource config found');
      return;
    }

    config.acceptHeader = [
      // Prefer JPEG: 10-20× smaller than uncompressed, no WASM needed for small-medium images.
      // If server supports transcoding (Orthanc with transcoding plugin, dcm4chee) it sends JPEG.
      'multipart/related; type=image/jpeg; q=1',
      // JPEG 2000: lossless + 16-bit capable, good for servers that support it.
      'multipart/related; type=image/jp2; q=0.9',
      // JPEG-LS: native format for most CR/DX/MG. Accept it so the server can serve its native
      // format when it does not support transcoding. The WASM decoder handles it for images
      // that fit in memory (< ~30MB decoded). Large images are bounded by the 200 MB cache.
      'multipart/related; type=image/jls; q=0.7',
      // Uncompressed: last resort – fine for CT/MR (512×512 ≈ 0.5 MB) but risky for large DX/MG.
      'multipart/related; type=application/octet-stream; q=0.3',
    ];

    // requestTransferSyntaxUID is only used when acceptHeader is empty,
    // but set it for clarity / future compatibility.
    config.requestTransferSyntaxUID = '1.2.840.10008.1.2.4.50'; // JPEG Baseline

    console.log('[Nova Mobile] Transfer syntax configured (JPEG-first for mobile)');
  } catch (error) {
    console.error('[Nova Mobile] Failed to configure transfer syntax:', error);
  }
}

const ohif = {
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  thumbnailList: '@ohif/extension-default.panelModule.seriesList',
};

const nova = {
  layout: 'nova-layout.layoutTemplateModule.viewerLayoutWithBottomPanel',
  horizontalThumbnails: 'nova-layout.panelModule.horizontalThumbnails',
  viewport: 'nova-layout.viewportModule.mobile',
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
  // Use the mobile-specific PDF viewport (iframe-based) instead of the upstream
  // <object>-based one, which shows "No online PDF viewer installed" on mobile browsers.
  viewport: 'nova-layout.viewportModule.mobile-pdf',
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
  'nova-layout': '^1.0.0',
};

function modeFactory({ modeConfiguration }) {
  return {
    id,
    routeName: 'mobile',
    displayName: 'NOVA Mobile',

    // onModeInit runs BEFORE hangingProtocol is processed - register protocol here
    onModeInit: ({ servicesManager }: withAppTypes) => {
      const { hangingProtocolService } = servicesManager.services;
      hangingProtocolService.addProtocol(hpMobile.id, hpMobile);
    },

    onModeEnter: ({ servicesManager, extensionManager, commandsManager }: withAppTypes) => {
      const {
        measurementService,
        toolbarService,
        toolGroupService,
        customizationService,
        studyPrefetcherService,
      } = servicesManager.services;

      // Forzar CPU rendering SOLO en móvil. El render WebGL/vtk de las imágenes
      // rendered grandes (DX/MG/CR) es inestable en muchos GPUs móviles: el primer
      // render del actor deja el shader program en null (`isAttributeUsed` null) →
      // negro, y solo se recupera recreando el contexto. El render por CPU (canvas
      // 2D) evita por completo ese camino y es fiable en cualquier dispositivo.
      // Se restaura en onModeExit. Debe ir ANTES de montar los viewports.
      setUseCPURendering(true);
      console.log('[Nova Mobile] CPU rendering FORZADO (evita crash WebGL/vtk en GPU móvil)');

      // Apply mobile theme class (scopes all nova-mobile-theme.css rules)
      const root = document.getElementById('root');
      if (root && !root.classList.contains('theme-nova-mobile')) {
        root.classList.add('theme-nova-mobile');
      }

      // Mantener el prefetch DESHABILITADO en móvil: el servicio es singleton y
      // pudo quedar habilitado por nova-desktop/anonimized; aquí se fuerza off
      // para respetar el cap de caché (200 MB) y la memoria limitada del móvil.
      studyPrefetcherService?.setConfiguration?.({ enabled: false } as any);

      // Agente informativo de conectividad (NOVA AI): aparece sólo si detecta
      // latencia alta o descarga lenta. Especialmente útil en móvil (redes
      // celulares). No invasivo y puramente informativo.
      mountConnectivityAgent();

      measurementService.clearMeasurements();

      // Limit Cornerstone image cache to prevent OOM on mobile devices.
      // Default is 3 GB; a single decoded DX/MG image is ~80-200 MB, so the
      // default allows 15+ large images to accumulate and crash the tab.
      csCache.setMaxCacheSize(MOBILE_MAX_CACHE_BYTES);

      // Configure dataSource to request mobile-compatible transfer syntax
      // (JPEG-first to reduce network/decode load for large DX/MG images)
      configureMobileTransferSyntax(extensionManager);

      // Registrar el image loader `novarendered:` (WADO-RS rendered). Las
      // modalidades grandes (DX/CR/MG/RX/DR) se cargan como JPEG 8-bit color
      // reescalado por el servidor → render fiable en GPU móvil, sin OOM ni
      // texturas 16-bit. Ver MobileViewportV2 (remap) y renderedImageLoader.
      registerRenderedImageLoader({ servicesManager });

      // Apply mobile-optimized configuration (only removes overlays)
      applyMobileConfiguration(customizationService);

      // Init minimal ToolGroups
      initToolGroups(extensionManager, toolGroupService, commandsManager);

      // Comando del botón "Cine" de la toolbar: alterna la barra de cine móvil
      // (visible/oculta) vía mobileCineStore. El reproductor (MobileCinePlayer,
      // montado por MobileViewportV2) se suscribe al store y arranca/detiene la
      // reproducción. Solo surte efecto en series multiframe (el reproductor solo
      // se monta en esos casos); en US/RF/XA ya arranca solo (autoplay).
      commandsManager.registerCommand('CORNERSTONE', 'novaMobileToggleCine', () => {
        mobileCineStore.toggle();
      });

      // Register toolbar buttons
      toolbarService.register([...toolbarButtons]);

      // Mobile toolbar: pan + measurement + contrast + cine + share
      toolbarService.updateSection('primary', ['Pan', 'Length', 'WindowLevel', 'Cine', 'Share']);
    },

    onModeExit: ({ servicesManager }: withAppTypes) => {
      // Restaurar el modo de render (GPU si hay WebGL) al salir de móvil, para no
      // afectar a otros modos en el mismo navegador.
      resetUseCPURendering();

      // Remove mobile theme class
      const root = document.getElementById('root');
      root?.classList.remove('theme-nova-mobile');

      // Retirar el agente de conectividad y detener el monitor.
      unmountConnectivityAgent();

      const {
        toolGroupService,
        syncGroupService,
        cornerstoneViewportService,
        uiDialogService,
        uiModalService,
        panelService,
      } = servicesManager.services;

      uiDialogService.hideAll();
      uiModalService.hide();
      toolGroupService.destroy();
      syncGroupService.destroy();
      cornerstoneViewportService.destroy();
      panelService.reset();
    },

    validationTags: {
      study: [],
      series: [],
    },

    isValidMode: ({ modalities }) => {
      const modalities_list = modalities.split('\\');

      return {
        valid: !!modalities_list.filter(modality => NON_IMAGE_MODALITIES.indexOf(modality) === -1)
          .length,
        description: 'This mode does not support non-imaging modalities',
      };
    },

    routes: [
      {
        path: 'mobile',
        layoutTemplate: ({ location, servicesManager }) => {
          return {
            id: nova.layout,
            props: {
              bottomPanels: [nova.horizontalThumbnails],
              bottomPanelClosed: false,
              bottomPanelHeight: 150,
              viewports: [
                {
                  namespace: nova.viewport,
                  displaySetsToDisplay: [
                    ohif.sopClassHandler,
                    dicomvideo.sopClassHandler,
                    dicomsr.sopClassHandler3D,
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

    extensions: extensionDependencies,
    hangingProtocol: [hpMobile.id],
    sopClassHandlers: [
      ohif.sopClassHandler,
      dicomvideo.sopClassHandler,
      dicomsr.sopClassHandler3D,
      dicomsr.sopClassHandler,
      dicompdf.sopClassHandler,
      dicomSeg.sopClassHandler,
      dicomPmap.sopClassHandler,
      dicomRT.sopClassHandler,
    ],
    ...modeConfiguration,
  };
}

const mode = {
  id,
  modeFactory,
  extensionDependencies,
};

export default mode;
export { initToolGroups, toolbarButtons, hpMobile };
