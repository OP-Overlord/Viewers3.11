import React, { useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

import { OHIFCornerstoneViewport } from '@ohif/extension-cornerstone';
import ViewportErrorBoundary from './ViewportErrorBoundary';
import { useSystem } from '@ohif/core';

import './MobileViewport.css';

// Prefix for all mobile viewport logs
const LOG_PREFIX = '[MobileViewport]';

// Cache the max texture size to avoid repeated WebGL queries
let cachedMaxTextureSize: number | null = null;

function getMaxTextureSize(): number {
  if (cachedMaxTextureSize !== null) {
    return cachedMaxTextureSize;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      cachedMaxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      return cachedMaxTextureSize;
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} Error getting max texture size:`, e);
  }
  // Default fallback
  cachedMaxTextureSize = 4096;
  return cachedMaxTextureSize;
}

// Helper to translate Transfer Syntax UID to human-readable name
function getTransferSyntaxName(uid: string): string {
  const transferSyntaxMap: Record<string, string> = {
    '1.2.840.10008.1.2': 'Implicit VR Little Endian (Uncompressed)',
    '1.2.840.10008.1.2.1': 'Explicit VR Little Endian (Uncompressed)',
    '1.2.840.10008.1.2.2': 'Explicit VR Big Endian (Uncompressed)',
    '1.2.840.10008.1.2.4.50': 'JPEG Baseline (Lossy)',
    '1.2.840.10008.1.2.4.51': 'JPEG Extended (Lossy)',
    '1.2.840.10008.1.2.4.57': 'JPEG Lossless',
    '1.2.840.10008.1.2.4.70': 'JPEG Lossless First-Order',
    '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless ⚠️',
    '1.2.840.10008.1.2.4.81': 'JPEG-LS Near-Lossless ⚠️',
    '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
    '1.2.840.10008.1.2.4.91': 'JPEG 2000 Lossy',
    '1.2.840.10008.1.2.5': 'RLE Lossless',
  };
  return transferSyntaxMap[uid] || `Unknown (${uid})`;
}

/**
 * MobileViewport - Simplified viewport for mobile devices
 * Uses OHIFCornerstoneViewport directly with error boundary for resilience
 */
function MobileViewport(
  props: withAppTypes<{ viewportId: string; displaySets: AppTypes.DisplaySet[] }>
) {
  const { servicesManager, extensionManager } = useSystem();
  const { viewportId, displaySets } = props as {
    displaySets: AppTypes.DisplaySet[];
    viewportId: string;
  };

  const mountTimeRef = useRef(Date.now());
  const hasLoggedInitialRef = useRef(false);

  // Get services for debugging
  const { cornerstoneViewportService } = servicesManager.services;

  // Log initial mount and displaySet info
  useEffect(() => {
    if (hasLoggedInitialRef.current) return;
    hasLoggedInitialRef.current = true;

    console.log(`${LOG_PREFIX} ========== VIEWPORT MOUNT ==========`);
    console.log(`${LOG_PREFIX} ViewportId: ${viewportId}`);
    console.log(`${LOG_PREFIX} Mount time: ${new Date().toISOString()}`);
    console.log(`${LOG_PREFIX} DisplaySets count: ${displaySets?.length || 0}`);

    // Log device info
    console.log(`${LOG_PREFIX} Device Info:`, {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      deviceMemory: (navigator as any).deviceMemory || 'unknown',
      hardwareConcurrency: navigator.hardwareConcurrency,
    });

    // Check WebGL capabilities
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        console.log(`${LOG_PREFIX} WebGL Info:`, {
          version: gl.getParameter(gl.VERSION),
          vendor: gl.getParameter(gl.VENDOR),
          renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown',
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        });
      } else {
        console.warn(`${LOG_PREFIX} WebGL not available!`);
      }
    } catch (e) {
      console.error(`${LOG_PREFIX} Error checking WebGL:`, e);
    }
  }, [viewportId, displaySets]);

  // Log displaySet details when they change
  useEffect(() => {
    if (!displaySets?.length) {
      console.warn(`${LOG_PREFIX} No displaySets provided to viewport ${viewportId}`);
      return;
    }

    const maxTextureSize = getMaxTextureSize();

    displaySets.forEach((ds: any, index) => {
      console.log(`${LOG_PREFIX} DisplaySet[${index}]:`, {
        displaySetInstanceUID: ds?.displaySetInstanceUID,
        modality: ds?.Modality,
        seriesDescription: ds?.SeriesDescription,
        numImageFrames: ds?.numImageFrames,
        sopClassUIDs: ds?.sopClassUIDs,
        isReconstructable: ds?.isReconstructable,
        unsupported: ds?.unsupported,
        loadingStatus: ds?.loadingStatus,
      });

      // Get image metadata from instances to check dimensions BEFORE loading
      if (ds?.instances?.length > 0) {
        const firstInstance = ds.instances[0];
        const rows = firstInstance?.Rows || firstInstance?.metadata?.Rows;
        const columns = firstInstance?.Columns || firstInstance?.metadata?.Columns;
        const bitsAllocated = firstInstance?.BitsAllocated || firstInstance?.metadata?.BitsAllocated;
        const transferSyntaxUID =
          firstInstance?.TransferSyntaxUID || firstInstance?.metadata?.TransferSyntaxUID;
        const photometricInterpretation =
          firstInstance?.PhotometricInterpretation ||
          firstInstance?.metadata?.PhotometricInterpretation;

        const exceedsLimit = (rows && rows > maxTextureSize) || (columns && columns > maxTextureSize);

        console.log(`${LOG_PREFIX} 📋 DisplaySet[${index}] INSTANCE METADATA:`, {
          rows,
          columns,
          maxTextureSize,
          EXCEEDS_TEXTURE_LIMIT: exceedsLimit ? '⚠️ YES!' : '✓ No',
          bitsAllocated,
          transferSyntaxUID,
          transferSyntaxName: getTransferSyntaxName(transferSyntaxUID),
          photometricInterpretation,
          instanceCount: ds.instances.length,
        });

        if (exceedsLimit) {
          console.error(
            `${LOG_PREFIX} ⚠️ POTENTIAL PROBLEM: Image dimensions (${columns}x${rows}) ` +
              `exceed WebGL max texture size (${maxTextureSize}). ` +
              `This modality (${ds?.Modality}) may fail to render on mobile devices!`
          );
        }
      }

      // Try to get imageIds for this displaySet
      try {
        const [dataSource] = extensionManager.getActiveDataSource();
        const imageIds = dataSource?.getImageIdsForDisplaySet?.(ds);
        console.log(`${LOG_PREFIX} DisplaySet[${index}] imageIds:`, {
          count: imageIds?.length || 0,
          firstImageId: imageIds?.[0]?.substring(0, 100) + '...',
          lastImageId: imageIds?.[imageIds?.length - 1]?.substring(0, 100) + '...',
        });
      } catch (e) {
        console.error(`${LOG_PREFIX} Error getting imageIds:`, e);
      }
    });
  }, [viewportId, displaySets, extensionManager]);

  // Callback when viewport element is enabled
  const onElementEnabled = useCallback(
    (evt: any) => {
      const elapsed = Date.now() - mountTimeRef.current;
      console.log(`${LOG_PREFIX} ✓ Element ENABLED for viewport ${viewportId} (after ${elapsed}ms)`);

      if (evt?.detail?.element) {
        const element = evt.detail.element;

        // Log element info
        console.log(`${LOG_PREFIX} Element details:`, {
          tagName: element.tagName,
          width: element.offsetWidth,
          height: element.offsetHeight,
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
        });

        // Listen for image rendered events
        element.addEventListener('CORNERSTONE_IMAGE_RENDERED', (e: any) => {
          const image = e.detail?.image;
          console.log(`${LOG_PREFIX} ✓ IMAGE_RENDERED event`, {
            viewportId,
            imageId: image?.imageId?.substring(0, 80),
          });

          // Log critical image dimensions for debugging texture limits
          if (image) {
            const maxTextureSize = getMaxTextureSize();
            const exceedsLimit = image.width > maxTextureSize || image.height > maxTextureSize;
            console.log(`${LOG_PREFIX} 📐 IMAGE DIMENSIONS:`, {
              width: image.width,
              height: image.height,
              rows: image.rows,
              columns: image.columns,
              maxTextureSize,
              EXCEEDS_LIMIT: exceedsLimit ? '⚠️ YES - IMAGE TOO LARGE!' : '✓ No',
              bitsAllocated: image.bitsAllocated,
              bitsStored: image.bitsStored,
              pixelRepresentation: image.pixelRepresentation,
              photometricInterpretation: image.photometricInterpretation,
              windowCenter: image.windowCenter,
              windowWidth: image.windowWidth,
              minPixelValue: image.minPixelValue,
              maxPixelValue: image.maxPixelValue,
              sizeInBytes: image.sizeInBytes,
            });

            if (exceedsLimit) {
              console.error(
                `${LOG_PREFIX} ⚠️ IMAGE EXCEEDS WebGL MAX TEXTURE SIZE! ` +
                  `Image: ${image.width}x${image.height}, Max: ${maxTextureSize}. ` +
                  `This will cause rendering failure on mobile devices.`
              );
            }
          }
        });

        // Listen for image load progress
        element.addEventListener('CORNERSTONE_IMAGE_LOAD_PROGRESS', (e: any) => {
          console.log(`${LOG_PREFIX} Image load progress:`, e.detail?.percentComplete + '%');
        });

        // Listen for errors
        element.addEventListener('CORNERSTONE_IMAGE_LOAD_ERROR', (e: any) => {
          console.error(`${LOG_PREFIX} ✗ IMAGE_LOAD_ERROR:`, e.detail);
        });
      }

      // Call original handler if provided
      (props as any).onElementEnabled?.(evt);
    },
    [viewportId, props]
  );

  // Callback when viewport element is disabled
  const onElementDisabled = useCallback(
    (evt: any) => {
      console.log(`${LOG_PREFIX} Element DISABLED for viewport ${viewportId}`);
      (props as any).onElementDisabled?.(evt);
    },
    [viewportId, props]
  );

  // Monitor viewport state changes
  useEffect(() => {
    if (!cornerstoneViewportService) return;

    const checkViewportState = () => {
      try {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId) as any;
        if (viewport) {
          console.log(`${LOG_PREFIX} Viewport state check:`, {
            viewportId,
            type: viewport.type,
            hasCamera: !!viewport.getCamera?.(),
            currentImageIdIndex: viewport.getCurrentImageIdIndex?.(),
            imageIds: viewport.getImageIds?.()?.length || 0,
          });
        }
      } catch (e) {
        // Viewport may not be ready yet
      }
    };

    // Check after delays
    const timers = [
      setTimeout(checkViewportState, 1000),
      setTimeout(checkViewportState, 3000),
      setTimeout(checkViewportState, 5000),
    ];

    return () => timers.forEach(clearTimeout);
  }, [viewportId, cornerstoneViewportService]);

  console.log(`${LOG_PREFIX} Render - viewportId: ${viewportId}, displaySets: ${displaySets?.length}`);

  return (
    <ViewportErrorBoundary viewportId={viewportId}>
      <div className="mobile-viewport-wrapper relative flex h-full w-full flex-row overflow-hidden">
        <OHIFCornerstoneViewport
          {...props}
          onElementEnabled={onElementEnabled}
          onElementDisabled={onElementDisabled}
        />
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
