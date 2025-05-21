/** @type {AppTypes.Config} */
window.config = {
  routerBasename: '/v3',
  modes: [],
  extensions: [],
  showStudyList: true,
  showWarningMessageForCrossOrigin: false,
  strictZSpacingForVolumeViewport: false,
  showCPUFallbackMessage: false,
  showLoadingIndicator: true,
  experimentalStudyBrowserSort: false,
  groupEnabledModesFirst: true,
  allowMultiSelectExport: false,

  maxNumberOfWebWorkers: 3,

  investigationalUseDialog: {
    option: 'never',
  },
  useNorm16Texture: false,
  maxNumRequests: {
    interaction: 100,
    thumbnail: 75,
    // Prefetch number is dependent on the http protocol. For http 2 or
    // above, the number of requests can be go a lot higher.
    prefetch: 25,
  },
  defaultDataSourceName: 'nova',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'nova',
      configuration: {
        friendlyName: 'NOVA PACS',
        name: 'NOVAPACS',
        wadoUriRoot: 'https://pacs2.novaimaging.co/dcm4chee-arc/aets/NOVAPACS/wado',
        qidoRoot: 'https://pacs2.novaimaging.co/dcm4chee-arc/aets/NOVAPACS/rs',
        wadoRoot: 'https://pacs2.novaimaging.co/dcm4chee-arc/aets/NOVAPACS/rs',
        qidoSupportsIncludeField: true,
        imageRendering: 'wadors',
        enableStudyLazyLoad: true,
        dicomUploadEnabled: true,
        singlepart: 'pdf,video',
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
        },
        acceptHeader: ['multipart/related; type=application/pdf; q=0.6','multipart/related; type=image/jls; q=1','multipart/related; type=application/octet-stream; q=0.5'],
        omitQuotationForMultipartRequest: true,
      },
    },
  ],
  i18n: {
    LOCIZE_PROJECTID: 'a8da3f9a-e467-4dd6-af33-474d582a0294',
    LOCIZE_API_KEY: null, // Developers can use this to do in-context editing. DO NOT COMMIT THIS KEY!
    USE_LOCIZE: true,
  },
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
};
