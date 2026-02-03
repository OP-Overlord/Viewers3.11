import React from 'react';
import PropTypes from 'prop-types';

import { OHIFCornerstoneViewport } from '@ohif/extension-cornerstone';
import ViewportErrorBoundary from './ViewportErrorBoundary';

import './MobileViewport.css';

/**
 * MobileViewport - Simplified viewport for mobile devices
 * Uses OHIFCornerstoneViewport directly with error boundary for resilience
 */
function MobileViewport(
  props: withAppTypes<{ viewportId: string; displaySets: AppTypes.DisplaySet[] }>
) {
  const { viewportId, displaySets } = props as {
    displaySets: AppTypes.DisplaySet[];
    viewportId: string;
  };

  // Log viewport info for debugging (visible in eruda console with ?debug=true)
  React.useEffect(() => {
    if (displaySets?.length > 0) {
      const displaySet = displaySets[0] as any;
      console.log('[MobileViewport] Rendering viewport:', {
        viewportId,
        displaySetUID: displaySet?.displaySetInstanceUID,
        modality: displaySet?.Modality,
        numFrames: displaySet?.numImageFrames,
        seriesDescription: displaySet?.SeriesDescription,
      });
    }
  }, [viewportId, displaySets]);

  return (
    <ViewportErrorBoundary viewportId={viewportId}>
      <div className="mobile-viewport-wrapper relative flex h-full w-full flex-row overflow-hidden">
        <OHIFCornerstoneViewport {...props} />
      </div>
    </ViewportErrorBoundary>
  );
}

MobileViewport.propTypes = {
  displaySets: PropTypes.arrayOf(PropTypes.object.isRequired).isRequired,
  viewportId: PropTypes.string.isRequired,
  dataSource: PropTypes.object,
  children: PropTypes.node,
};

export default MobileViewport;
