import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSystem } from '@ohif/core';
import { useImageViewer, useViewportGrid } from '@ohif/ui-next';

// Prefix for all thumbnail logs — set DEBUG_THUMBNAILS=false to silence
const LOG_PREFIX = '[Thumbnails]';
const DEBUG_THUMBNAILS = false;

// Higher quality thumbnail size (larger = better quality when scaled down)
const THUMBNAIL_SIZE = 512;

// Cache max texture size
let cachedMaxTextureSize: number | null = null;

function getMaxTextureSize(): number {
  if (cachedMaxTextureSize !== null) return cachedMaxTextureSize;
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
  cachedMaxTextureSize = 4096;
  return cachedMaxTextureSize;
}

// Helper function to get image src from imageId using cornerstone utilities
function getImageSrcFromImageId(cornerstone: any, imageId: string, modality: string) {
  const startTime = Date.now();
  DEBUG_THUMBNAILS &&
    console.log(`${LOG_PREFIX} Loading thumbnail for ${modality}:`, imageId?.substring(0, 80));

  return new Promise((resolve, reject) => {
    const loadObj = cornerstone.imageLoader.loadAndCacheImage(imageId);
    const imagePromise = loadObj?.promise ?? loadObj;

    imagePromise
      .then((image: any) => {
        const pixelData = image.getPixelData?.() ?? image.pixelData;
        const is16bit = pixelData instanceof Int16Array || pixelData instanceof Uint16Array;
        if (!is16bit) {
          if (image.windowWidth !== undefined && image.windowWidth > 256) image.windowWidth = 256;
          if (image.windowCenter !== undefined && image.windowCenter > 256)
            image.windowCenter = 128;
        }

        const canvas = document.createElement('canvas');
        // Set explicit dimensions for better quality
        canvas.width = THUMBNAIL_SIZE;
        canvas.height = THUMBNAIL_SIZE;

        DEBUG_THUMBNAILS &&
          console.log(
            `${LOG_PREFIX} Created canvas ${THUMBNAIL_SIZE}x${THUMBNAIL_SIZE} for ${modality}`
          );

        cornerstone.utilities
          .loadImageToCanvas({
            canvas,
            imageId,
            thumbnail: true, // Use thumbnail mode for efficient rendering
            // Don't specify renderingEngineId - let cornerstone use the default
          })
          .then(() => {
            const elapsed = Date.now() - startTime;
            DEBUG_THUMBNAILS &&
              console.log(`${LOG_PREFIX} ✓ Canvas loaded for ${modality} (${elapsed}ms)`);

            try {
              // Export with maximum quality (PNG for lossless)
              const dataUrl = canvas.toDataURL('image/png');
              DEBUG_THUMBNAILS &&
                console.log(
                  `${LOG_PREFIX} ✓ DataURL generated for ${modality}, length: ${dataUrl?.length}`
                );
              resolve(dataUrl);
            } catch (e) {
              console.error(`${LOG_PREFIX} ✗ Error generating dataURL for ${modality}:`, e);
              reject(e);
            }
          })
          .catch((err: any) => {
            const elapsed = Date.now() - startTime;
            console.error(
              `${LOG_PREFIX} ✗ loadImageToCanvas FAILED for ${modality} (${elapsed}ms):`,
              err
            );
            reject(err);
          });
      })
      .catch((err: any) => {
        console.error(
          `${LOG_PREFIX} ✗ Error loading image prior to canvas rendering for ${modality}:`,
          err
        );
        reject(err);
      });
  });
}

/**
 * Loads an oversized image (dimensions > WebGL maxTextureSize) via Cornerstone's imageLoader,
 * downsamples it via OffscreenCanvas, and returns a PNG data URL for the thumbnail.
 *
 * Used instead of loadImageToCanvas when rows or columns exceed the device's
 * maxTextureSize (typically 4096px on mobile), which would silently fail in WebGL.
 */
async function getOversizedThumbnailFromImageId(
  cornerstone: any,
  imageId: string,
  modality: string
): Promise<string> {
  const t0 = performance.now();

  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error(`${LOG_PREFIX} OffscreenCanvas no disponible`);
  }

  const maxDim = getMaxTextureSize();

  // Load + cache the image via Cornerstone (triggers WADO-RS fetch + decode)
  const loadObj = cornerstone.imageLoader.loadAndCacheImage(imageId);
  const image = await (loadObj?.promise ?? loadObj);

  const srcWidth: number = image.width;
  const srcHeight: number = image.height;

  // Scale to fit within maxTextureSize while preserving aspect ratio
  const scale = Math.min(1, Math.min(maxDim / srcWidth, maxDim / srcHeight));
  const scaledW = Math.max(1, Math.floor(srcWidth * scale));
  const scaledH = Math.max(1, Math.floor(srcHeight * scale));

  const pixelData: ArrayLike<number> = image.getPixelData?.() ?? image.pixelData;
  if (!pixelData) throw new Error(`${LOG_PREFIX} Sin datos de píxel para ${modality}`);

  // Normalize raw pixel data → RGBA ImageData
  const srcCanvas = new OffscreenCanvas(srcWidth, srcHeight);
  const srcCtx = srcCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  if (!srcCtx) throw new Error(`${LOG_PREFIX} No se pudo crear contexto 2d (src)`);

  const imgData = srcCtx.createImageData(srcWidth, srcHeight);
  const is16bit = pixelData instanceof Int16Array || pixelData instanceof Uint16Array;
  let wc = is16bit
    ? Array.isArray(image.windowCenter)
      ? image.windowCenter[0]
      : image.windowCenter
    : undefined;
  let ww = is16bit
    ? Array.isArray(image.windowWidth)
      ? image.windowWidth[0]
      : image.windowWidth
    : undefined;

  let minVal, maxVal;
  if (wc !== undefined && ww !== undefined) {
    minVal = wc - ww / 2;
    maxVal = wc + ww / 2;
  } else {
    minVal = is16bit ? (image.minPixelValue ?? 0) : 0;
    maxVal = is16bit ? (image.maxPixelValue ?? 65535) : 255;
  }
  const range = maxVal - minVal || 1;

  for (let i = 0; i < srcWidth * srcHeight; i++) {
    let v = Math.round(((pixelData[i] - minVal) / range) * 255);
    if (v < 0) v = 0;
    if (v > 255) v = 255;
    imgData.data[i * 4] = v;
    imgData.data[i * 4 + 1] = v;
    imgData.data[i * 4 + 2] = v;
    imgData.data[i * 4 + 3] = 255;
  }
  srcCtx.putImageData(imgData, 0, 0);

  // Scale down to fit within maxTextureSize
  const scaledCanvas = new OffscreenCanvas(scaledW, scaledH);
  const scaledCtx = scaledCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  if (!scaledCtx) throw new Error(`${LOG_PREFIX} No se pudo crear contexto 2d (scaled)`);
  scaledCtx.imageSmoothingEnabled = true;
  scaledCtx.imageSmoothingQuality = 'medium';
  scaledCtx.drawImage(srcCanvas, 0, 0, scaledW, scaledH);

  // Fit into THUMBNAIL_SIZE square with black letterbox bars
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = THUMBNAIL_SIZE;
  thumbCanvas.height = THUMBNAIL_SIZE;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (!thumbCtx) throw new Error(`${LOG_PREFIX} No se pudo crear contexto 2d (thumb)`);

  const fitScale = Math.min(THUMBNAIL_SIZE / scaledW, THUMBNAIL_SIZE / scaledH);
  const fitW = Math.round(scaledW * fitScale);
  const fitH = Math.round(scaledH * fitScale);
  const offsetX = Math.round((THUMBNAIL_SIZE - fitW) / 2);
  const offsetY = Math.round((THUMBNAIL_SIZE - fitH) / 2);

  thumbCtx.fillStyle = 'black';
  thumbCtx.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  thumbCtx.drawImage(scaledCanvas, offsetX, offsetY, fitW, fitH);

  console.warn(
    `${LOG_PREFIX} 🔍 Thumbnail downsample ${modality}: ${srcWidth}×${srcHeight} → ${scaledW}×${scaledH}` +
      ` (scale=${scale.toFixed(3)}, ${(performance.now() - t0).toFixed(0)}ms)`
  );

  return thumbCanvas.toDataURL('image/png');
}

// Threshold in pixels to distinguish tap from swipe
const SWIPE_THRESHOLD = 10;

// Mapping of DICOM modality codes to full Spanish names
const MODALITY_NAMES: Record<string, string> = {
  CT: 'Tomografía Computarizada',
  MR: 'Resonancia Magnética',
  DX: 'Rayos X Digital',
  CR: 'Radiografía Computarizada',
  US: 'Ultrasonido',
  NM: 'Medicina Nuclear',
  PT: 'Tomografía por Emisión de Positrones',
  XA: 'Angiografía',
  MG: 'Mamografía',
  RF: 'Fluoroscopia',
  OT: 'Otro',
  SC: 'Captura Secundaria',
  SR: 'Reporte Estructurado',
  SEG: 'Segmentación',
  RTSTRUCT: 'Estructura RT',
  RTPLAN: 'Plan RT',
  RTDOSE: 'Dosis RT',
  DOC: 'Documento',
  KO: 'Objeto Clave',
  PR: 'Estado de Presentación',
  SM: 'Microscopía de Diapositivas',
  ECG: 'Electrocardiograma',
  ES: 'Endoscopia',
  IO: 'Intraoral',
  PX: 'Panorámica',
};

// Helper function to format patient name
function formatPatientName(patientName: string | { Alphabetic?: string } | undefined): string {
  if (!patientName) return 'Paciente Desconocido';
  const name = typeof patientName === 'object' ? patientName.Alphabetic : patientName;
  if (!name) return 'Paciente Desconocido';
  // Replace ^ with space and clean up
  return name.replace(/\^/g, ' ').trim();
}

// Helper function to format date (YYYYMMDD -> DD/MM/YYYY)
function formatStudyDate(dateStr: string | undefined): string {
  if (!dateStr || dateStr.length !== 8) return '';
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${day}/${month}/${year}`;
}

const HorizontalThumbnailList = () => {
  const { servicesManager, commandsManager, extensionManager } = useSystem();
  const { displaySetService, customizationService } = servicesManager.services;

  // Get dataSource from extensionManager
  const [dataSource] = extensionManager.getActiveDataSource();

  const internalImageViewer = useImageViewer();

  const [{ activeViewportId, viewports, isHangingProtocolLayout }] = useViewportGrid();
  const [displaySets, setDisplaySets] = useState([]);
  const [thumbnailImageSrcMap, setThumbnailImageSrcMap] = useState({});
  const [hasLoadedViewports, setHasLoadedViewports] = useState(false);
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());
  const [selectedDisplaySetUID, setSelectedDisplaySetUID] = useState<string | null>(null);

  // Refs for touch handling - improved to detect swipe vs tap
  const lastTapRef = useRef<{ time: number; id: string | null }>({ time: 0, id: null });
  const touchStartRef = useRef<{ x: number; y: number; id: string | null }>({
    x: 0,
    y: 0,
    id: null,
  });
  const isSwipingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingSelectionRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide selection tooltip after delay
  useEffect(() => {
    if (selectedDisplaySetUID) {
      const timer = setTimeout(() => {
        setSelectedDisplaySetUID(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [selectedDisplaySetUID]);

  // Create getImageSrc function using cornerstone libraries
  const getImageSrc = useCallback(
    (imageId: string, modality: string) => {
      try {
        const utilities = extensionManager.getModuleEntry(
          '@ohif/extension-cornerstone.utilityModule.common'
        ) as any;
        const { cornerstone } = utilities.exports.getCornerstoneLibraries();
        return getImageSrcFromImageId(cornerstone, imageId, modality);
      } catch (error) {
        console.error(`${LOG_PREFIX} ✗ Error getting cornerstone libraries:`, error);
        return Promise.reject(error);
      }
    },
    [extensionManager]
  );

  // Thumbnail src for images that exceed the WebGL maxTextureSize limit (MG, DX, CR large formats)
  const getOversizedImageSrc = useCallback(
    (imageId: string, modality: string) => {
      try {
        const utilities = extensionManager.getModuleEntry(
          '@ohif/extension-cornerstone.utilityModule.common'
        ) as any;
        const { cornerstone } = utilities.exports.getCornerstoneLibraries();
        return getOversizedThumbnailFromImageId(cornerstone, imageId, modality);
      } catch (error) {
        console.error(`${LOG_PREFIX} ✗ Error getting oversized thumbnail libraries:`, error);
        return Promise.reject(error);
      }
    },
    [extensionManager]
  );

  // Wait for viewports to load
  useEffect(() => {
    if (!hasLoadedViewports && activeViewportId) {
      const delayMs = 250 + displaySetService.getActiveDisplaySets().length * 10;
      window.setTimeout(() => setHasLoadedViewports(true), delayMs);
    }
  }, [activeViewportId, displaySetService, hasLoadedViewports]);

  // Load display sets
  useEffect(() => {
    const currentDisplaySets = displaySetService.activeDisplaySets;
    if (currentDisplaySets.length > 0) {
      setDisplaySets(currentDisplaySets);
    }
  }, [displaySetService.activeDisplaySets]);

  // Subscribe to display set changes
  useEffect(() => {
    const subscription = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_CHANGED,
      changedDisplaySets => {
        setDisplaySets(changedDisplaySets);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [displaySetService]);

  // Load thumbnails
  useEffect(() => {
    DEBUG_THUMBNAILS && console.log(`${LOG_PREFIX} ========== THUMBNAIL LOAD EFFECT ==========`);
    DEBUG_THUMBNAILS &&
      console.log(
        `${LOG_PREFIX} hasLoadedViewports: ${hasLoadedViewports}, dataSource: ${!!dataSource}`
      );

    if (!hasLoadedViewports || !dataSource) {
      DEBUG_THUMBNAILS &&
        console.log(`${LOG_PREFIX} Skipping - waiting for viewports or dataSource`);
      return;
    }

    const thumbnailNoImageModalities = ['SR', 'SEG', 'RTSTRUCT', 'RTPLAN', 'RTDOSE', 'DOC', 'PMAP'];
    const allDisplaySets = displaySetService.activeDisplaySets;
    DEBUG_THUMBNAILS && console.log(`${LOG_PREFIX} Total displaySets: ${allDisplaySets.length}`);

    const currentDisplaySets = allDisplaySets.filter(
      (ds: any) => !thumbnailNoImageModalities.includes(ds.Modality)
    );
    DEBUG_THUMBNAILS &&
      console.log(`${LOG_PREFIX} Filtered displaySets (with images): ${currentDisplaySets.length}`);

    const maxTextureSize = getMaxTextureSize();
    DEBUG_THUMBNAILS && console.log(`${LOG_PREFIX} WebGL Max Texture Size: ${maxTextureSize}`);

    currentDisplaySets.forEach(async (dSet: any) => {
      const modality = dSet.Modality || 'UNKNOWN';
      const uid = dSet.displaySetInstanceUID;

      DEBUG_THUMBNAILS &&
        console.log(`${LOG_PREFIX} Processing ${modality} - UID: ${uid?.substring(0, 20)}...`);

      // Check image dimensions from instance metadata BEFORE loading
      let exceedsLimit = false;
      if (dSet.instances?.length > 0) {
        const firstInstance = dSet.instances[0];
        const rows = firstInstance?.Rows || firstInstance?.metadata?.Rows;
        const columns = firstInstance?.Columns || firstInstance?.metadata?.Columns;
        const bitsAllocated =
          firstInstance?.BitsAllocated || firstInstance?.metadata?.BitsAllocated;
        const transferSyntaxUID =
          firstInstance?.TransferSyntaxUID || firstInstance?.metadata?.TransferSyntaxUID;

        exceedsLimit = !!((rows && rows > maxTextureSize) || (columns && columns > maxTextureSize));

        DEBUG_THUMBNAILS &&
          console.log(`${LOG_PREFIX} 📋 ${modality} INSTANCE METADATA:`, {
            rows,
            columns,
            maxTextureSize,
            EXCEEDS_TEXTURE_LIMIT: exceedsLimit ? '⚠️ YES - downsample path' : '✓ No',
            bitsAllocated,
            transferSyntaxUID,
          });

        if (exceedsLimit) {
          DEBUG_THUMBNAILS &&
            console.log(
              `${LOG_PREFIX} 🔍 ${modality} ${columns}x${rows} > ${maxTextureSize}px → usando downsample`
            );
        }
      }

      const displaySet = displaySetService.getDisplaySetByUID(uid);
      if (displaySet?.unsupported) {
        DEBUG_THUMBNAILS && console.log(`${LOG_PREFIX} Skipping ${modality} - unsupported`);
        return;
      }

      if (thumbnailImageSrcMap[uid]) {
        DEBUG_THUMBNAILS && console.log(`${LOG_PREFIX} Skipping ${modality} - already loaded`);
        return;
      }
      if (loadingThumbnails.has(uid)) {
        DEBUG_THUMBNAILS && console.log(`${LOG_PREFIX} Skipping ${modality} - already loading`);
        return;
      }

      // Get imageIds
      DEBUG_THUMBNAILS && console.log(`${LOG_PREFIX} Getting imageIds for ${modality}...`);
      const imageIds = dataSource?.getImageIdsForDisplaySet?.(dSet);

      if (!imageIds?.length) {
        DEBUG_THUMBNAILS &&
          console.warn(`${LOG_PREFIX} ✗ No imageIds for ${modality}! DisplaySet:`, {
            displaySetInstanceUID: uid,
            numImageFrames: dSet.numImageFrames,
            instances: dSet.instances?.length,
            sopClassUIDs: dSet.sopClassUIDs,
          });
        return;
      }

      DEBUG_THUMBNAILS && console.log(`${LOG_PREFIX} ${modality} has ${imageIds.length} imageIds`);

      const imageId = imageIds[Math.floor(imageIds.length / 2)];
      DEBUG_THUMBNAILS &&
        console.log(
          `${LOG_PREFIX} Using middle imageId for ${modality}:`,
          imageId?.substring(0, 80)
        );

      setLoadingThumbnails(prev => new Set(prev).add(uid));

      try {
        // Always generate our own high-quality thumbnail instead of using cached ones.
        // For images that exceed the WebGL maxTextureSize, use the downsample path directly.
        // For the rest, try loadImageToCanvas first; if it fails (e.g. large DX with missing
        // metadata so exceedsLimit was false), fall back to the downsample path.
        DEBUG_THUMBNAILS &&
          console.log(
            `${LOG_PREFIX} Starting thumbnail generation for ${modality}` +
              (exceedsLimit ? ' [oversized → downsample]' : '') +
              '...'
          );
        let thumbnailSrc: string;
        if (exceedsLimit) {
          thumbnailSrc = await getOversizedImageSrc(imageId, modality);
        } else {
          try {
            thumbnailSrc = (await getImageSrc(imageId, modality)) as string;
          } catch (_loadErr) {
            console.warn(
              `${LOG_PREFIX} ⚠️ loadImageToCanvas falló para ${modality}, reintentando con downsample...`
            );
            thumbnailSrc = await getOversizedImageSrc(imageId, modality);
          }
        }

        if (thumbnailSrc) {
          DEBUG_THUMBNAILS && console.log(`${LOG_PREFIX} ✓ Thumbnail generated for ${modality}`);
          // Store in our map (don't override displaySet.thumbnailSrc to avoid affecting other parts)
          setThumbnailImageSrcMap(prev => ({
            ...prev,
            [uid]: thumbnailSrc,
          }));
        } else {
          DEBUG_THUMBNAILS && console.warn(`${LOG_PREFIX} ✗ Empty thumbnailSrc for ${modality}`);
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} ✗ FAILED to load thumbnail for ${modality}:`, error);
      } finally {
        setLoadingThumbnails(prev => {
          const next = new Set(prev);
          next.delete(uid);
          return next;
        });
      }
    });
  }, [
    displaySetService,
    dataSource,
    getImageSrc,
    getOversizedImageSrc,
    hasLoadedViewports,
    thumbnailImageSrcMap,
    loadingThumbnails,
  ]);

  // Load display set into viewport
  const loadDisplaySet = useCallback(
    async (displaySetInstanceUID: string) => {
      const customHandler = customizationService.getCustomization(
        'studyBrowser.thumbnailDoubleClickCallback'
      );

      const setupArgs = {
        activeViewportId,
        commandsManager,
        servicesManager,
        isHangingProtocolLayout,
        appConfig: extensionManager._appConfig,
      };

      if (customHandler?.callbacks) {
        const handlers = customHandler.callbacks.map(callback => callback(setupArgs));
        for (const handler of handlers) {
          await handler(displaySetInstanceUID);
        }
      }

      // After loading, activate appropriate tool based on number of frames
      const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
      setTimeout(() => {
        try {
          if (displaySet && displaySet.numImageFrames > 1) {
            // Multiple frames: activate StackScroll for navigation
            commandsManager.runCommand('setToolActive', { toolName: 'StackScroll' });
          } else {
            // Single frame: activate Pan since there's nothing to scroll
            commandsManager.runCommand('setToolActive', { toolName: 'Pan' });
          }
        } catch (error) {
          console.warn('Could not activate tool:', error);
        }
      }, 100);
    },
    [
      activeViewportId,
      commandsManager,
      servicesManager,
      isHangingProtocolLayout,
      customizationService,
      extensionManager,
      displaySetService,
    ]
  );

  // Handle touch start - record position
  const handleTouchStart = useCallback((displaySetInstanceUID: string, event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, id: displaySetInstanceUID };
    isSwipingRef.current = false;
  }, []);

  // Handle touch move - detect if swiping
  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    if (!touchStartRef.current.id) return;

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

    // If moved beyond threshold, it's a swipe not a tap
    if (deltaX > SWIPE_THRESHOLD || deltaY > SWIPE_THRESHOLD) {
      isSwipingRef.current = true;
    }
  }, []);

  // Handle touch end - only trigger action if it wasn't a swipe
  const handleTouchEnd = useCallback(
    (displaySetInstanceUID: string, event: React.TouchEvent) => {
      // If user was swiping, don't trigger tap action
      if (isSwipingRef.current) {
        touchStartRef.current = { x: 0, y: 0, id: null };
        isSwipingRef.current = false;
        return;
      }

      event.preventDefault();

      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300;

      if (
        lastTapRef.current.id === displaySetInstanceUID &&
        now - lastTapRef.current.time < DOUBLE_TAP_DELAY
      ) {
        // Double tap - cancel pending selection and load the display set
        if (pendingSelectionRef.current) {
          clearTimeout(pendingSelectionRef.current);
          pendingSelectionRef.current = null;
        }
        setSelectedDisplaySetUID(null);
        loadDisplaySet(displaySetInstanceUID);
        lastTapRef.current = { time: 0, id: null };
      } else {
        // Single tap - delay showing info to wait for possible double tap
        lastTapRef.current = { time: now, id: displaySetInstanceUID };

        // Cancel any existing pending selection
        if (pendingSelectionRef.current) {
          clearTimeout(pendingSelectionRef.current);
        }

        // Delay showing the tooltip until we're sure it's not a double tap
        pendingSelectionRef.current = setTimeout(() => {
          setSelectedDisplaySetUID(displaySetInstanceUID);
          pendingSelectionRef.current = null;
        }, DOUBLE_TAP_DELAY);
      }

      touchStartRef.current = { x: 0, y: 0, id: null };
    },
    [loadDisplaySet]
  );

  // Handle click (for desktop)
  const handleClick = useCallback(
    (displaySetInstanceUID: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300;

      if (
        lastTapRef.current.id === displaySetInstanceUID &&
        now - lastTapRef.current.time < DOUBLE_TAP_DELAY
      ) {
        // Double click - cancel pending selection and load the display set
        if (pendingSelectionRef.current) {
          clearTimeout(pendingSelectionRef.current);
          pendingSelectionRef.current = null;
        }
        setSelectedDisplaySetUID(null);
        loadDisplaySet(displaySetInstanceUID);
        lastTapRef.current = { time: 0, id: null };
      } else {
        // Single click - delay showing info to wait for possible double click
        lastTapRef.current = { time: now, id: displaySetInstanceUID };

        // Cancel any existing pending selection
        if (pendingSelectionRef.current) {
          clearTimeout(pendingSelectionRef.current);
        }

        // Delay showing the tooltip until we're sure it's not a double click
        pendingSelectionRef.current = setTimeout(() => {
          setSelectedDisplaySetUID(displaySetInstanceUID);
          pendingSelectionRef.current = null;
        }, DOUBLE_TAP_DELAY);
      }
    },
    [loadDisplaySet]
  );

  // Get selected display set info
  const selectedDisplaySet = selectedDisplaySetUID
    ? displaySets.find(ds => ds.displaySetInstanceUID === selectedDisplaySetUID)
    : null;

  const activeDisplaySetInstanceUIDs =
    viewports.get(activeViewportId)?.displaySetInstanceUIDs || [];

  if (!displaySets.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-white/50">
        Loading...
      </div>
    );
  }

  const filteredDisplaySets = displaySets.filter(ds => !ds.excludeFromThumbnailBrowser);

  // Get patient info from first instance of the first display set
  const firstDisplaySet = displaySets[0];
  const firstInstance = firstDisplaySet?.instances?.[0];
  const patientInfo = {
    patientName: formatPatientName(firstInstance?.PatientName),
    patientId: firstInstance?.PatientID || '',
    patientBirthDate: formatStudyDate(firstInstance?.PatientBirthDate),
    studyDate: formatStudyDate(firstInstance?.StudyDate),
    studyDescription: firstInstance?.StudyDescription || firstDisplaySet?.StudyDescription || '',
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col overflow-hidden bg-black"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Patient Info Header */}
      <div className="flex-shrink-0 border-b border-gray-700 bg-gray-900/95 px-2 py-1">
        {/* Line 1: Name */}
        <p className="truncate text-[11px] text-white">
          <span className="text-gray-500">Nombre: </span>
          <span className="font-medium">{patientInfo.patientName}</span>
        </p>
        {/* Line 2: ID and Birth Date */}
        <p className="truncate text-[10px] text-gray-300">
          {patientInfo.patientId && (
            <>
              <span className="text-gray-500">ID: </span>
              <span>{patientInfo.patientId}</span>
            </>
          )}
          {patientInfo.patientId && patientInfo.patientBirthDate && (
            <span className="text-gray-600"> · </span>
          )}
          {patientInfo.patientBirthDate && (
            <>
              <span className="text-gray-500">Fecha Nac: </span>
              <span>{patientInfo.patientBirthDate}</span>
            </>
          )}
        </p>
        {/* Line 3: Study Description */}
        {patientInfo.studyDescription && (
          <p className="truncate text-[10px] text-gray-300">
            <span className="text-gray-500">Estudio: </span>
            <span>{patientInfo.studyDescription}</span>
          </p>
        )}
      </div>
      {/* Single row horizontal scroll - takes remaining height */}
      <div
        className="flex min-h-0 w-full flex-1 items-center overflow-x-auto overflow-y-hidden"
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x proximity',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <style>{`
          .thumbnail-container::-webkit-scrollbar { display: none; }
        `}</style>

        <div
          id="thumbnail-list-container"
          data-cy="thumbnail-list-container"
          className="thumbnail-container flex h-full items-center gap-1 px-1"
        >
          {filteredDisplaySets.map((ds, index) => {
            const isActive = activeDisplaySetInstanceUIDs.includes(ds.displaySetInstanceUID);
            // Prioritize our high-quality thumbnails over cached ones
            const imageSrc = thumbnailImageSrcMap[ds.displaySetInstanceUID] || ds.thumbnailSrc;
            const isLoading = loadingThumbnails.has(ds.displaySetInstanceUID);
            const isSelected = selectedDisplaySetUID === ds.displaySetInstanceUID;

            return (
              <div
                key={ds.displaySetInstanceUID}
                className={`relative flex-shrink-0 overflow-hidden rounded transition-all duration-100 ${
                  isActive
                    ? 'ring-2 ring-blue-400'
                    : isSelected
                      ? 'ring-2 ring-yellow-400'
                      : 'ring-1 ring-gray-600'
                } active:scale-95`}
                style={{
                  // Dynamic size: height relative to container, width maintains square aspect
                  height: 'calc(100% - 12px)',
                  aspectRatio: '1 / 1',
                  scrollSnapAlign: 'start',
                  touchAction: 'pan-x',
                }}
                onClick={e => handleClick(ds.displaySetInstanceUID, e)}
                onTouchStart={e => handleTouchStart(ds.displaySetInstanceUID, e)}
                onTouchMove={handleTouchMove}
                onTouchEnd={e => handleTouchEnd(ds.displaySetInstanceUID, e)}
                data-cy={`thumbnail-item-${index}`}
                id={`thumbnail-item-${index}`}
              >
                {/* Thumbnail image */}
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={ds.SeriesDescription || 'Thumbnail'}
                    className="pointer-events-none h-full w-full object-cover"
                    draggable={false}
                    style={{
                      imageRendering: 'auto',
                      WebkitBackfaceVisibility: 'hidden',
                      backfaceVisibility: 'hidden',
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-800">
                    {isLoading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-white" />
                    ) : (
                      <span className="text-xs font-medium text-gray-500">{ds.Modality}</span>
                    )}
                  </div>
                )}

                {/* Minimal overlay - just series number and frame count */}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/80 px-1 py-0.5">
                  <span className="text-[7px] font-bold text-white">{index + 1}</span>
                  <span className="text-[7px] text-gray-400">{ds.numImageFrames}</span>
                </div>

                {/* Active check badge */}
                {isActive && (
                  <div className="absolute top-0.5 right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500">
                    <svg
                      className="h-2 w-2 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selection info tooltip - appears when a series is tapped (positioned below patient header) */}
      {selectedDisplaySet && (
        <div className="absolute top-[34px] left-0 right-0 border-b border-yellow-500/30 bg-yellow-900/90 px-2 py-1 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-medium text-yellow-100">
                {selectedDisplaySet.SeriesDescription || `Serie ${selectedDisplaySet.SeriesNumber}`}
              </p>
              <p className="text-[9px] text-yellow-200/70">
                {MODALITY_NAMES[selectedDisplaySet.Modality] || selectedDisplaySet.Modality} ·{' '}
                {selectedDisplaySet.numImageFrames} imágenes
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HorizontalThumbnailList;
