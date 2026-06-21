import React from 'react';

const Component = React.lazy(() => {
  return import(/* webpackPrefetch: true */ './Viewport/MobileViewportV2');
});

const LazyMobileViewport = props => {
  return (
    <React.Suspense fallback={<div className="flex h-full w-full items-center justify-center bg-black" />}>
      <Component {...props} />
    </React.Suspense>
  );
};

const PdfComponent = React.lazy(() => {
  return import(/* webpackPrefetch: true */ './Viewport/MobilePdfViewport');
});

const LazyMobilePdfViewport = props => {
  return (
    <React.Suspense fallback={<div className="flex h-full w-full items-center justify-center bg-black" />}>
      <PdfComponent {...props} />
    </React.Suspense>
  );
};

export default function getViewportModule({ servicesManager, extensionManager, commandsManager }) {
  return [
    {
      name: 'mobile',
      component: props => (
        <LazyMobileViewport
          {...props}
          servicesManager={servicesManager}
          extensionManager={extensionManager}
          commandsManager={commandsManager}
        />
      ),
    },
    {
      name: 'mobile-pdf',
      component: LazyMobilePdfViewport,
    },
  ];
}
