/** @type {AppTypes.Config} */
window.config = {

  customizationService: [
    {
      'commandsModule.commands': {
        $set: [
          {
            commandName: 'toggleViewportOverlays',
            context: 'DEFAULT',
            commandFn: ({ servicesManager }) => {
              const { customizationService, viewportGridService } = servicesManager.services;

              const currentValue = customizationService.get('viewportOverlay.visible') ?? true;
              customizationService.set('viewportOverlay.visible', !currentValue);

              const viewports = viewportGridService.getState()?.viewports || [];
              viewportGridService.setState({ viewports: [...viewports] });
            },
          },
        ]
      }
    },
    {
      // Desactiva los tours
      'ohif.tours': {
        $set: []
      }
    },
    {
      // Superposición en la parte superior izquierda
      'viewportOverlay.topLeft': {
        $set: [
          {
            id: 'StudyDescriptionOverlay',
            customizationType: 'ohif.overlayItem',
            label: 'Estudio:',
            title: 'Descripción del estudio',
            color: 'white',
            condition: ({ instance, servicesManager }) => {
              const visible = servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return (visible !== false) && instance?.StudyDescription;
            },
            contentF: ({ instance }) => instance.StudyDescription,
          },
          {
            id: 'SeriesDescriptionOverlay',
            customizationType: 'ohif.overlayItem',
            label: 'Serie:',
            title: 'Nombre de la serie',
            color: 'white',
            condition: ({ instance, servicesManager }) => {
              const visible = servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return (visible !== false) && instance?.SeriesDescription;
            },
            contentF: ({ instance }) => instance.SeriesDescription,
          },
          {
            id: 'StudyDateOverlay',
            customizationType: 'ohif.overlayItem',
            label: 'Fecha:',
            title: 'Fecha del estudio',
            color: 'white',
            condition: ({ instance, servicesManager }) => {
              const visible = servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return (visible !== false) && instance?.StudyDate;
            },
            contentF: ({ instance, formatters: { formatDate } }) =>
              formatDate(instance.StudyDate),
          },
          {
            id: 'StudyTimeOverlay',
            customizationType: 'ohif.overlayItem',
            label: 'Hora:',
            title: 'Hora de adquisición',
            color: 'white',
            condition: ({ instance, servicesManager }) => {
              const visible = servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return (visible !== false) && instance?.StudyTime;
            },
            contentF: ({ instance, formatters: { formatTime } }) =>
              formatTime(instance.StudyTime),
          },
        ]
      }
    },
    {
      // Superposición en la parte superior derecha
      'viewportOverlay.topRight': {
        $set: [
          {
            id: 'PatientNameOverlay',
            customizationType: 'ohif.overlayItem',
            label: 'Paciente:',
            title: 'Nombre del paciente',
            color: 'white',
            condition: ({ instance, servicesManager }) => {
              const visible = servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return (visible !== false) && instance?.PatientName?.Alphabetic;
            },
            contentF: ({ instance, formatters: { formatPN } }) =>
              formatPN(instance.PatientName.Alphabetic),
          },
          {
            id: 'PatientIDOverlay',
            customizationType: 'ohif.overlayItem',
            label: 'ID:',
            title: 'Identificación del paciente',
            color: 'white',
            condition: ({ instance, servicesManager }) => {
              const visible = servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return (visible !== false) && instance?.PatientID;
            },
            contentF: ({ instance }) => instance.PatientID,
          },
          {
            id: 'PatientAgeOverlay',
            customizationType: 'ohif.overlayItem',
            label: 'Edad:',
            title: 'Edad del paciente',
            color: 'white',
            condition: ({ instance, servicesManager }) => {
              const visible = servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return (visible !== false) && instance?.PatientAge;
            },
            contentF: ({ instance }) => {
              const rawAge = instance.PatientAge;
              const value = parseInt(rawAge.slice(0, 3), 10);
              const unit = rawAge.slice(3);
              const unitMap = {
                Y: 'años',
                M: 'meses',
                W: 'semanas',
                D: 'días'
              };
              return `${value} ${unitMap[unit] || ''}`;
            },
          },
        ]
      }
    }
  ],

  routerBasename: '/v3',
  modes: [],
  extensions: [],
  showStudyList: true,
  showPatientInfo: 'visible',
  disableConfirmationPrompts: true,
  disableEditing: true,
  studyListFunctionsEnabled: true,
  useSharedArrayBuffer: 'AUTO',
  showWarningMessageForCrossOrigin: false,
  strictZSpacingForVolumeViewport: false,
  showCPUFallbackMessage: false,
  showLoadingIndicator: true,
  experimentalStudyBrowserSort: false,
  groupEnabledModesFirst: true,
  allowMultiSelectExport: false,
  addWindowLevelActionMenu: true,
  autoPlayCine: true,

  maxNumberOfWebWorkers: 3,

  investigationalUseDialog: {
    option: 'never',
  },
  useNorm16Texture: false,
  maxNumRequests: {
    interaction: 100,
    thumbnail: 75,
    prefetch: 25,
  },
  defaultDataSourceName: 'nova',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'nova',
      configuration: {
        friendlyName: 'NOVAPACS',
        name: 'NOVAPACS',
        wadoUriRoot: '',
        qidoRoot: '/dicomweb',
        wadoRoot: '/dicomweb',
        qidoSupportsIncludeField: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: true,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'pdf,video,bulkdata',
        dicomUploadEnabled: true,
        acceptHeader: ['multipart/related; type=application/pdf; q=0.6','multipart/related; type=image/jls; q=1','multipart/related; type=application/octet-stream; q=0.5'],
        omitQuotationForMultipartRequest: false,
      },
    },
  ],
  whiteLabeling: {
    /* Optional: Should return a React component to be rendered in the "Logo" section of the application's Top Navigation bar */
    createLogoComponentFn: function (React) {
      return React.createElement(
        'a',
        {
          target: '_self',
          rel: 'noopener noreferrer',
          className: 'text-purple-600 line-through',
          href: 'https://novaimaging.co/',
        },
        React.createElement('img',
          {
            src: './nova-dark.svg',
            className: 'w-20 h-10',
          }
        ))
    },
  },
  hotkeys: [
    {
      commandName: 'incrementActiveViewport',
      label: 'Next Viewport',
      keys: ['right'],
    },
    {
      commandName: 'decrementActiveViewport',
      label: 'Previous Viewport',
      keys: ['left'],
    },
    { commandName: 'rotateViewportCW', label: 'Rotate Right', keys: ['r'] },
    { commandName: 'rotateViewportCCW', label: 'Rotate Left', keys: ['l'] },
    { commandName: 'invertViewport', label: 'Invert', keys: ['i'] },
    {
      commandName: 'flipViewportHorizontal',
      label: 'Flip Horizontally',
      keys: ['h'],
    },
    {
      commandName: 'flipViewportVertical',
      label: 'Flip Vertically',
      keys: ['v'],
    },
    { commandName: 'scaleUpViewport', label: 'Zoom In', keys: ['+'] },
    { commandName: 'scaleDownViewport', label: 'Zoom Out', keys: ['-'] },
    { commandName: 'fitViewportToWindow', label: 'Zoom to Fit', keys: ['='] },
    { commandName: 'resetViewport', label: 'Reset', keys: ['space'] },
    { commandName: 'nextImage', label: 'Next Image', keys: ['down'] },
    { commandName: 'previousImage', label: 'Previous Image', keys: ['up'] },
    // {
    //   commandName: 'previousViewportDisplaySet',
    //   label: 'Previous Series',
    //   keys: ['pagedown'],
    // },
    // {
    //   commandName: 'nextViewportDisplaySet',
    //   label: 'Next Series',
    //   keys: ['pageup'],
    // },
    {
      commandName: 'toggleViewportOverlays',
      label: 'Toggle Overlays',
      keys: ['o'], // o la tecla que prefieras
    },
    { commandName: 'setZoomTool', label: 'Zoom', keys: ['z'] },
    // ~ Window level presets
    {
      commandName: 'windowLevelPreset1',
      label: 'W/L Preset 1',
      keys: ['1'],
    },
    {
      commandName: 'windowLevelPreset2',
      label: 'W/L Preset 2',
      keys: ['2'],
    },
    {
      commandName: 'windowLevelPreset3',
      label: 'W/L Preset 3',
      keys: ['3'],
    },
    {
      commandName: 'windowLevelPreset4',
      label: 'W/L Preset 4',
      keys: ['4'],
    },
    {
      commandName: 'windowLevelPreset5',
      label: 'W/L Preset 5',
      keys: ['5'],
    },
    {
      commandName: 'windowLevelPreset6',
      label: 'W/L Preset 6',
      keys: ['6'],
    },
    {
      commandName: 'windowLevelPreset7',
      label: 'W/L Preset 7',
      keys: ['7'],
    },
    {
      commandName: 'windowLevelPreset8',
      label: 'W/L Preset 8',
      keys: ['8'],
    },
    {
      commandName: 'windowLevelPreset9',
      label: 'W/L Preset 9',
      keys: ['9'],
    },
  ],
};
