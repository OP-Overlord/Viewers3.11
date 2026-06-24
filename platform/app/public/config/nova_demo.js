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
        ],
      },
    },
    {
      // Desactiva los tours
      'ohif.tours': {
        $set: [],
      },
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
              const visible =
                servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return visible !== false && instance?.StudyDescription;
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
              const visible =
                servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return visible !== false && instance?.SeriesDescription;
            },
            contentF: ({ instance }) => instance.SeriesDescription,
          },
          {
            id: 'SeriesDateOverlay',
            customizationType: 'ohif.overlayItem',
            label: 'Fecha:',
            title: 'Fecha de la serie',
            color: 'white',
            condition: ({ instance, servicesManager }) => {
              const visible =
                servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return visible !== false && instance?.SeriesDate;
            },
            contentF: ({ instance, formatters: { formatDate } }) => formatDate(instance.SeriesDate),
          },
          {
            id: 'SeriesTimeOverlay',
            customizationType: 'ohif.overlayItem',
            label: 'Hora:',
            title: 'Hora de la serie',
            color: 'white',
            condition: ({ instance, servicesManager }) => {
              const visible =
                servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return visible !== false && instance?.SeriesTime;
            },
            contentF: ({ instance, formatters: { formatTime } }) => formatTime(instance.SeriesTime),
          },
        ],
      },
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
              const visible =
                servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return visible !== false && instance?.PatientName?.Alphabetic;
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
              const visible =
                servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return visible !== false && instance?.PatientID;
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
              const visible =
                servicesManager?.services?.customizationService?.get('viewportOverlay.visible');
              return visible !== false && (instance?.PatientBirthDate || instance?.PatientAge);
            },
            contentF: ({ instance }) => {
              if (instance.PatientBirthDate) {
                const birth = instance.PatientBirthDate;
                const ref = instance.StudyDate || (() => {
                  const now = new Date();
                  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
                })();
                const by = parseInt(birth.slice(0, 4), 10);
                const bm = parseInt(birth.slice(4, 6), 10);
                const bd = parseInt(birth.slice(6, 8), 10);
                const ry = parseInt(ref.slice(0, 4), 10);
                const rm = parseInt(ref.slice(4, 6), 10);
                const rd = parseInt(ref.slice(6, 8), 10);
                let years = ry - by;
                if (rm < bm || (rm === bm && rd < bd)) years--;
                if (years >= 1) return `${years} años`;
                let months = (ry * 12 + rm) - (by * 12 + bm);
                if (rd < bd) months--;
                if (months >= 1) return `${months} meses`;
                const days = Math.floor(
                  (new Date(ry, rm - 1, rd).getTime() - new Date(by, bm - 1, bd).getTime()) / 86400000
                );
                const weeks = Math.floor(days / 7);
                return weeks >= 1 ? `${weeks} semanas` : `${days} días`;
              }
              const rawAge = instance.PatientAge;
              const value = parseInt(rawAge.slice(0, 3), 10);
              const unit = rawAge.slice(3);
              const unitMap = { Y: 'años', M: 'meses', W: 'semanas', D: 'días' };
              return `${value} ${unitMap[unit] || ''}`;
            },
          },
        ],
      },
    },
  ],

  routerBasename: '/v3',
  modes: [],
  extensions: [],
  showStudyList: true,
  showPatientInfo: 'disabled',
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

  // Tope de web workers de decodificación. El init usa min(hardwareConcurrency-1,
  // este valor), así que en móviles de 4 núcleos sigue siendo ~3, mientras que en
  // equipos de 8+ núcleos se acelera la decodificación en paralelo (prefetch y
  // series multiframe).
  maxNumberOfWebWorkers: 5,

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
      namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
      sourceName: 'dicomlocal',
      configuration: {
        friendlyName: 'dicom local',
      },
    },
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
        // ── CARGA PROGRESIVA (HTJ2K) — listo para activar tras VERIFICAR el PACS ──
        // La ruta progresiva ya está cableada en extensions/cornerstone/src/index.tsx
        // (stack → { retrieveOptions: { single: { streaming:true, decodeLevel:1 } } }),
        // pero solo se activa si el servidor entrega HTJ2K (transfer syntax
        // 1.2.840.10008.1.2.4.201/202, MIME image/jhc), que SÍ permite decodificar
        // una versión de baja resolución primero (primer render casi instantáneo).
        // Verificar soporte con:
        //   curl -sI -H 'Accept: multipart/related; type="image/jhc"' \
        //     '<wadoRoot>/studies/<S>/series/<Se>/instances/<I>/frames/1'
        // Si responde HTJ2K, sustituir el acceptHeader de abajo por este:
        // acceptHeader: [
        //   'multipart/related; type=application/pdf; q=0.6',
        //   'multipart/related; type=image/jhc; q=1',   // HTJ2K (progresivo)
        //   'multipart/related; type=image/jls; q=0.9', // fallback lossless
        //   'multipart/related; type=application/octet-stream; q=0.5',
        // ],
        acceptHeader: [
          'multipart/related; type=application/pdf; q=0.6',
          'multipart/related; type=image/jls; q=1',
          'multipart/related; type=application/octet-stream; q=0.5',
        ],
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
        React.createElement('img', {
          src: './nova-dark.svg',
          className: 'w-28 h-14',
        })
      );
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
