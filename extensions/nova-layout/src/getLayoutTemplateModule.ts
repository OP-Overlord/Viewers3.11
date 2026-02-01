import ViewerLayoutWithBottomPanel from './ViewerLayoutWithBottomPanel';

export default function ({ servicesManager, extensionManager, commandsManager, hotkeysManager }) {
  function ViewerLayoutWithServices(props) {
    return ViewerLayoutWithBottomPanel({
      servicesManager,
      extensionManager,
      commandsManager,
      hotkeysManager,
      ...props,
    });
  }

  return [
    {
      name: 'viewerLayoutWithBottomPanel',
      id: 'viewerLayoutWithBottomPanel',
      component: ViewerLayoutWithServices,
    },
  ];
}
