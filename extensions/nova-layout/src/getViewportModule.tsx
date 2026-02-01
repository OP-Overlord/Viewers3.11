import React from 'react';

const Component = React.lazy(() => {
  return import(/* webpackPrefetch: true */ './Viewport/MobileViewport');
});

const LazyMobileViewport = props => {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <Component {...props} />
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
  ];
}
