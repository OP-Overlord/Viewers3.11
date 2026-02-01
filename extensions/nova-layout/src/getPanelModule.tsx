import { Types } from '@ohif/core';
import HorizontalThumbnailList from './ViewerLayoutWithBottomPanel/HorizontalThumbnailList';

function getPanelModule(): Types.Panel[] {
  return [
    {
      name: 'horizontalThumbnails',
      iconName: 'tab-studies',
      iconLabel: 'Series',
      label: 'Series',
      component: HorizontalThumbnailList,
    },
  ];
}

export default getPanelModule;
