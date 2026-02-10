import { Types } from '@ohif/core';
import HorizontalThumbnailList from './ViewerLayoutWithBottomPanel/HorizontalThumbnailList';
import NovaPanelStudyBrowser from './Panels/NovaPanelStudyBrowser';

function getPanelModule(): Types.Panel[] {
  return [
    {
      name: 'horizontalThumbnails',
      iconName: 'tab-studies',
      iconLabel: 'Series',
      label: 'Series',
      component: HorizontalThumbnailList,
    },
    {
      name: 'cachedSeriesList',
      iconName: 'tab-studies',
      iconLabel: 'Studies',
      label: 'Studies',
      component: NovaPanelStudyBrowser,
    },
  ];
}

export default getPanelModule;
