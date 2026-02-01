import toolbarButtons from './toolbarButtons';
import initToolGroups from './initToolGroups';
import hpMobile from './hpMobile';
import { id } from './id';

const NON_IMAGE_MODALITIES = ['ECG', 'SEG', 'RTSTRUCT', 'RTPLAN', 'PR', 'SM'];

/**
 * Mobile-optimized configuration
 * These settings are applied automatically when entering mobile mode
 */
const mobileOptimizations = {
  // Reduce max requests for better memory management on mobile
  maxNumRequests: {
    interaction: 50,
    thumbnail: 30,
    prefetch: 10,
  },
  // Reduce web workers for limited mobile CPU
  maxNumberOfWebWorkers: 2,
  // Disable features that are heavy on mobile
  useSharedArrayBuffer: 'FALSE',
  strictZSpacingForVolumeViewport: false,
};

/**
 * Apply mobile-optimized configuration through customizationService
 * This function removes all viewport overlays and applies mobile-specific settings
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

  // Apply window.config optimizations for mobile
  if (window.config) {
    window.config.maxNumberOfWebWorkers = mobileOptimizations.maxNumberOfWebWorkers;
    window.config.maxNumRequests = mobileOptimizations.maxNumRequests;
    window.config.useSharedArrayBuffer = mobileOptimizations.useSharedArrayBuffer;
    window.config.strictZSpacingForVolumeViewport =
      mobileOptimizations.strictZSpacingForVolumeViewport;
  }

  console.log('[Nova Mobile] Mobile-optimized configuration applied');
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
      const { measurementService, toolbarService, toolGroupService, customizationService } =
        servicesManager.services;

      measurementService.clearMeasurements();

      // Apply mobile-optimized configuration
      applyMobileConfiguration(customizationService);

      // Init minimal ToolGroups
      initToolGroups(extensionManager, toolGroupService, commandsManager);

      // Register toolbar buttons
      toolbarService.register([...toolbarButtons]);

      // Mobile toolbar: pan + measurement + contrast + share
      toolbarService.updateSection('primary', ['Pan', 'Length', 'WindowLevel', 'Share']);
    },

    onModeExit: ({ servicesManager }: withAppTypes) => {
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
