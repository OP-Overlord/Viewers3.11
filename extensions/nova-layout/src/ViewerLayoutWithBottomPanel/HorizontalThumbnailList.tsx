import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSystem } from '@ohif/core';
import { useImageViewer, useViewportGrid } from '@ohif/ui-next';

// Higher quality thumbnail size (larger = better quality when scaled down)
const THUMBNAIL_SIZE = 512;

// Helper function to get image src from imageId using cornerstone utilities
function getImageSrcFromImageId(cornerstone, imageId) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    // Set explicit dimensions for better quality
    canvas.width = THUMBNAIL_SIZE;
    canvas.height = THUMBNAIL_SIZE;

    cornerstone.utilities
      .loadImageToCanvas({
        canvas,
        imageId,
        thumbnail: true, // Use thumbnail mode for efficient rendering
        // Don't specify renderingEngineId - let cornerstone use the default
      })
      .then(() => {
        // Export with maximum quality (PNG for lossless)
        resolve(canvas.toDataURL('image/png'));
      })
      .catch(reject);
  });
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
    imageId => {
      try {
        const utilities = extensionManager.getModuleEntry(
          '@ohif/extension-cornerstone.utilityModule.common'
        );
        const { cornerstone } = utilities.exports.getCornerstoneLibraries();
        return getImageSrcFromImageId(cornerstone, imageId);
      } catch (error) {
        console.warn('Error getting cornerstone libraries:', error);
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
    if (!hasLoadedViewports || !dataSource) return;

    const thumbnailNoImageModalities = ['SR', 'SEG', 'RTSTRUCT', 'RTPLAN', 'RTDOSE', 'DOC', 'PMAP'];
    const currentDisplaySets = displaySetService.activeDisplaySets.filter(
      ds => !thumbnailNoImageModalities.includes(ds.Modality)
    );

    currentDisplaySets.forEach(async dSet => {
      const displaySet = displaySetService.getDisplaySetByUID(dSet.displaySetInstanceUID);
      if (displaySet?.unsupported) return;

      if (thumbnailImageSrcMap[dSet.displaySetInstanceUID]) return;
      if (loadingThumbnails.has(dSet.displaySetInstanceUID)) return;

      const imageIds = dataSource?.getImageIdsForDisplaySet?.(dSet);
      if (!imageIds?.length) return;

      const imageId = imageIds[Math.floor(imageIds.length / 2)];

      setLoadingThumbnails(prev => new Set(prev).add(dSet.displaySetInstanceUID));

      try {
        // Always generate our own high-quality thumbnail instead of using cached ones
        // The cached thumbnailSrc from OHIF core is often low quality
        const thumbnailSrc = await getImageSrc(imageId);

        if (thumbnailSrc) {
          // Store in our map (don't override displaySet.thumbnailSrc to avoid affecting other parts)
          setThumbnailImageSrcMap(prev => ({
            ...prev,
            [dSet.displaySetInstanceUID]: thumbnailSrc,
          }));
        }
      } catch (error) {
        console.warn('Error loading thumbnail for', dSet.displaySetInstanceUID, error);
      } finally {
        setLoadingThumbnails(prev => {
          const next = new Set(prev);
          next.delete(dSet.displaySetInstanceUID);
          return next;
        });
      }
    });
  }, [
    displaySetService,
    dataSource,
    getImageSrc,
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
        className="flex min-h-0 flex-1 w-full items-center overflow-x-auto overflow-y-hidden"
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
