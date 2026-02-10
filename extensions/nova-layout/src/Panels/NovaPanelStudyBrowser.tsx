import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSystem, utils } from '@ohif/core';
import { useNavigate } from 'react-router-dom';
import { useImageViewer, useViewportGrid, StudyBrowser } from '@ohif/ui-next';
import { requestDisplaySetCreationForStudy } from '@ohif/extension-default';
import { useTrackedMeasurements } from '@ohif/extension-measurement-tracking/src/getContextModule';

const { sortStudyInstances, formatDate, createStudyBrowserTabs } = utils;

const thumbnailNoImageModalities = ['SR', 'SEG', 'RTSTRUCT', 'RTPLAN', 'RTDOSE', 'DOC', 'PMAP'];

// ────────────────────────────────────────────────────────────────────────────
// Module-level cache: persists across mount/unmount cycles so that thumbnails
// are available instantly when the side panel is re-opened.
// ────────────────────────────────────────────────────────────────────────────
const thumbnailCache = new Map<string, string>();

/**
 * Build the initial thumbnailImageSrcMap from:
 *   1. The module-level cache (fastest)
 *   2. displaySet.thumbnailSrc values that were persisted by a previous mount
 */
function buildInitialThumbnailMap(displaySets: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  displaySets.forEach(ds => {
    const uid = ds.displaySetInstanceUID;
    if (thumbnailCache.has(uid)) {
      map[uid] = thumbnailCache.get(uid)!;
    } else if (ds.thumbnailSrc) {
      map[uid] = ds.thumbnailSrc;
      thumbnailCache.set(uid, ds.thumbnailSrc);
    }
  });
  return map;
}

// ────────────────────────────────────────────────────────────────────────────
// Image source helper – caches the result so re-mounts are instant
// ────────────────────────────────────────────────────────────────────────────
function getImageSrcFromImageId(cornerstone: any, imageId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    cornerstone.utilities
      .loadImageToCanvas({ canvas, imageId, thumbnail: true })
      .then(() => resolve(canvas.toDataURL()))
      .catch(reject);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

function NovaPanelStudyBrowser() {
  const { servicesManager, commandsManager, extensionManager } = useSystem();
  const { displaySetService, customizationService, uiModalService, measurementService, viewportGridService } =
    servicesManager.services;

  const navigate = useNavigate();
  const [dataSource] = extensionManager.getActiveDataSource();

  // Tracking support
  const [trackedMeasurements, sendTrackedMeasurementsEvent] = useTrackedMeasurements() as any;
  const { trackedSeries } = trackedMeasurements.context;

  const studyMode = (customizationService.getCustomization('studyBrowser.studyMode') as string) || 'all';
  const internalImageViewer = useImageViewer();
  const StudyInstanceUIDs = internalImageViewer.StudyInstanceUIDs;
  const fetchedStudiesRef = useRef(new Set());

  const [{ activeViewportId, viewports, isHangingProtocolLayout }] = useViewportGrid();
  const [activeTabName, setActiveTabName] = useState(studyMode);
  const [expandedStudyInstanceUIDs, setExpandedStudyInstanceUIDs] = useState([
    ...StudyInstanceUIDs,
  ]);
  const [studyDisplayList, setStudyDisplayList] = useState([]);
  const [displaySetsLoadingState, setDisplaySetsLoadingState] = useState({});
  const [jumpToDisplaySet, setJumpToDisplaySet] = useState(null);

  // ─── KEY FIX: initialize from cache so thumbnails appear instantly ───
  const initialDisplaySets = displaySetService.activeDisplaySets;
  const initialThumbnailMap = buildInitialThumbnailMap(initialDisplaySets);
  const hasCachedThumbnails = Object.keys(initialThumbnailMap).length > 0;

  const [hasLoadedViewports, setHasLoadedViewports] = useState(hasCachedThumbnails);
  const [thumbnailImageSrcMap, setThumbnailImageSrcMap] = useState(initialThumbnailMap);

  // Map display sets with tracking data (initial value computed eagerly)
  const mapDisplaySetsWithTracking = useCallback(
    (displaySetsToMap: any[], loadingState: any, thumbMap: any, _vps: any) => {
      const thumbnailDisplaySets: any[] = [];
      const thumbnailNoImageDisplaySets: any[] = [];

      displaySetsToMap
        .filter(ds => !ds.excludeFromThumbnailBrowser)
        .forEach(ds => {
          const { thumbnailSrc, displaySetInstanceUID } = ds;
          const isNoImage =
            thumbnailNoImageModalities.includes(ds.Modality) ||
            ds.unsupported ||
            ds.thumbnailSrc === null;
          const componentType = isNoImage ? 'thumbnailNoImage' : 'thumbnailTracked';
          const array = isNoImage ? thumbnailNoImageDisplaySets : thumbnailDisplaySets;

          array.push({
            displaySetInstanceUID,
            description: ds.SeriesDescription || '',
            seriesNumber: ds.SeriesNumber,
            modality: ds.Modality,
            seriesDate: ds.SeriesDate ? formatDate(ds.SeriesDate) : '',
            numInstances: ds.numImageFrames,
            loadingProgress: loadingState?.[displaySetInstanceUID],
            countIcon: ds.countIcon,
            messages: ds.messages,
            StudyInstanceUID: ds.StudyInstanceUID,
            componentType,
            imageSrc: thumbnailSrc || thumbMap[displaySetInstanceUID],
            dragData: { type: 'displayset', displaySetInstanceUID },
            isTracked: trackedSeries.includes(ds.SeriesInstanceUID),
            isHydratedForDerivedDisplaySet: ds.isHydrated,
          });
        });

      return [...thumbnailDisplaySets, ...thumbnailNoImageDisplaySets];
    },
    [trackedSeries]
  );

  // ─── Initialize displaySets eagerly from service (avoids empty first render) ───
  const [displaySets, setDisplaySets] = useState(() => {
    if (initialDisplaySets.length > 0) {
      const mapped = mapDisplaySetsWithTracking(
        initialDisplaySets,
        {},
        initialThumbnailMap,
        viewports
      );
      sortStudyInstances(mapped);
      return mapped;
    }
    return [];
  });

  // ─── getImageSrc with cache ───
  const getImageSrc = useCallback(
    (imageId: string): Promise<string> => {
      const utilities = extensionManager.getModuleEntry(
        '@ohif/extension-cornerstone.utilityModule.common'
      ) as any;
      const { cornerstone } = utilities.exports.getCornerstoneLibraries();
      return getImageSrcFromImageId(cornerstone, imageId);
    },
    [extensionManager]
  );

  // ─── Tracking helpers ───
  const checkDirtyMeasurements = useCallback(
    (displaySetInstanceUID: string) => {
      const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
      if (displaySet?.Modality === 'SR') {
        const activeVpId = viewportGridService.getActiveViewportId();
        sendTrackedMeasurementsEvent('CHECK_DIRTY', {
          viewportId: activeVpId,
          displaySetInstanceUID,
        });
      }
    },
    [displaySetService, viewportGridService, sendTrackedMeasurementsEvent]
  );

  useEffect(() => {
    const sub = viewportGridService.subscribe(
      viewportGridService.EVENTS.VIEWPORT_ONDROP_HANDLED,
      ({ eventData }) => checkDirtyMeasurements(eventData.displaySetInstanceUID)
    );
    return () => sub.unsubscribe();
  }, [viewportGridService, checkDirtyMeasurements]);

  const onClickUntrack = useCallback(
    (displaySetInstanceUID: string) => {
      const onConfirm = () => {
        const ds = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
        sendTrackedMeasurementsEvent('UNTRACK_SERIES', {
          SeriesInstanceUID: ds.SeriesInstanceUID,
        });
        measurementService.getMeasurements().forEach(m => {
          if (m.referenceSeriesUID === ds.SeriesInstanceUID) {
            measurementService.remove(m.uid);
          }
        });
      };
      uiModalService.show({
        title: 'Untrack Series',
        content: ({ onClose }) => (
          <div className="p-4 text-white">
            <p>Are you sure you want to untrack this series?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded bg-gray-600 px-3 py-1" onClick={onClose}>
                Cancel
              </button>
              <button
                className="rounded bg-red-600 px-3 py-1"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
              >
                Untrack
              </button>
            </div>
          </div>
        ),
      });
    },
    [displaySetService, measurementService, sendTrackedMeasurementsEvent, uiModalService]
  );

  // ─── Fetch studies for patient ───
  useEffect(() => {
    async function fetchStudiesForPatient(StudyInstanceUID: string) {
      if (fetchedStudiesRef.current.has(StudyInstanceUID)) return;
      fetchedStudiesRef.current.add(StudyInstanceUID);

      const qidoForStudyUID = await dataSource.query.studies.search({
        studyInstanceUid: StudyInstanceUID,
      });

      if (!qidoForStudyUID?.length) {
        navigate('/notfoundstudy');
        throw new Error('Invalid study URL');
      }

      let qidoStudiesForPatient = qidoForStudyUID;
      try {
        const utilityModule = extensionManager.getModuleEntry(
          '@ohif/extension-default.utilityModule.common'
        ) as any;
        const { getStudiesForPatientByMRN } = utilityModule.exports;
        qidoStudiesForPatient = await getStudiesForPatientByMRN(dataSource, qidoForStudyUID);
      } catch (error) {
        console.warn(error);
      }

      const mappedStudies = qidoStudiesForPatient.map((study: any) => ({
        studyInstanceUid: study.studyInstanceUid || study.StudyInstanceUID,
        date: formatDate(study.date || study.StudyDate) || '',
        description: study.description || study.StudyDescription,
        modalities: study.modalities || study.ModalitiesInStudy,
        numInstances: Number(study.instances || study.NumInstances),
      }));

      setStudyDisplayList(prev => {
        const ret = [...prev];
        for (const study of mappedStudies) {
          if (!prev.find(it => it.studyInstanceUid === study.studyInstanceUid)) {
            ret.push(study);
          }
        }
        return ret;
      });
    }

    StudyInstanceUIDs.forEach(sid => fetchStudiesForPatient(sid));
  }, [StudyInstanceUIDs, dataSource, extensionManager, navigate]);

  // ─── Wait for viewports (skip delay if thumbnails are already cached) ───
  useEffect(() => {
    if (!hasLoadedViewports && activeViewportId) {
      if (hasCachedThumbnails) {
        setHasLoadedViewports(true);
      } else {
        const delayMs = 250 + displaySetService.getActiveDisplaySets().length * 10;
        const timer = window.setTimeout(() => setHasLoadedViewports(true), delayMs);
        return () => clearTimeout(timer);
      }
    }
  }, [activeViewportId, displaySetService, hasLoadedViewports, hasCachedThumbnails]);

  // ─── Load thumbnails (with cache write-through) ───
  useEffect(() => {
    if (!hasLoadedViewports || !dataSource) return;

    let currentDisplaySets = displaySetService.activeDisplaySets;
    currentDisplaySets = currentDisplaySets.filter(
      (ds: any) => !thumbnailNoImageModalities.includes(ds.Modality) || ds.thumbnailSrc === null
    );

    if (!currentDisplaySets.length) return;

    currentDisplaySets.forEach(async (dSet: any) => {
      const uid = dSet.displaySetInstanceUID;
      const displaySet = displaySetService.getDisplaySetByUID(uid);
      if (displaySet?.unsupported) return;

      // Already cached → skip
      if (thumbnailCache.has(uid)) return;

      const imageIds = dataSource.getImageIdsForDisplaySet(dSet);
      const imageId = getImageIdForThumbnail(displaySet, imageIds);
      if (!imageId) return;

      let { thumbnailSrc } = displaySet;
      if (!thumbnailSrc && displaySet.getThumbnailSrc) {
        thumbnailSrc = await (displaySet as any).getThumbnailSrc({ getImageSrc });
      }
      if (!thumbnailSrc && imageId) {
        thumbnailSrc = await getImageSrc(imageId);
        displaySet.thumbnailSrc = thumbnailSrc;
      }

      if (thumbnailSrc) {
        // Write through to module-level cache
        thumbnailCache.set(uid, thumbnailSrc);

        setThumbnailImageSrcMap(prev => ({
          ...prev,
          [uid]: thumbnailSrc,
        }));
      }
    });
  }, [displaySetService, dataSource, getImageSrc, hasLoadedViewports]);

  // ─── Re-map displaySets when dependencies change ───
  useEffect(() => {
    const currentDisplaySets = displaySetService.activeDisplaySets;
    if (!currentDisplaySets.length) return;

    const mapped = mapDisplaySetsWithTracking(
      currentDisplaySets,
      displaySetsLoadingState,
      thumbnailImageSrcMap,
      viewports
    );
    sortStudyInstances(mapped);
    setDisplaySets(mapped);
  }, [
    displaySetService.activeDisplaySets,
    displaySetsLoadingState,
    viewports,
    thumbnailImageSrcMap,
    mapDisplaySetsWithTracking,
  ]);

  // ─── Subscribe to display set changes ───
  useEffect(() => {
    const sub1 = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_CHANGED,
      (changedDisplaySets: any[]) => {
        const mapped = mapDisplaySetsWithTracking(
          changedDisplaySets,
          displaySetsLoadingState,
          thumbnailImageSrcMap,
          viewports
        );
        sortStudyInstances(mapped);
        setDisplaySets(mapped);
      }
    );

    const sub2 = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SET_SERIES_METADATA_INVALIDATED,
      () => {
        const mapped = mapDisplaySetsWithTracking(
          displaySetService.getActiveDisplaySets(),
          displaySetsLoadingState,
          thumbnailImageSrcMap,
          viewports
        );
        sortStudyInstances(mapped);
        setDisplaySets(mapped);
      }
    );

    return () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
    };
  }, [
    displaySetsLoadingState,
    thumbnailImageSrcMap,
    viewports,
    displaySetService,
    mapDisplaySetsWithTracking,
  ]);

  // ─── Subscribe to new display sets for thumbnail loading ───
  useEffect(() => {
    const sub = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_ADDED,
      (data: any) => {
        if (!hasLoadedViewports) return;
        const { displaySetsAdded, options } = data;

        displaySetsAdded.forEach(async (dSet: any) => {
          const uid = dSet.displaySetInstanceUID;
          const displaySet = displaySetService.getDisplaySetByUID(uid);
          if (displaySet?.unsupported) return;
          if (options?.madeInClient) setJumpToDisplaySet(uid);
          if (thumbnailCache.has(uid)) return;

          const imageIds = dataSource.getImageIdsForDisplaySet(displaySet);
          const imageId = getImageIdForThumbnail(displaySet, imageIds);
          if (!imageId) return;

          let { thumbnailSrc } = displaySet;
          if (!thumbnailSrc && displaySet.getThumbnailSrc) {
            thumbnailSrc = await (displaySet as any).getThumbnailSrc({ getImageSrc });
          }
          if (!thumbnailSrc) {
            thumbnailSrc = await getImageSrc(imageId);
            displaySet.thumbnailSrc = thumbnailSrc;
          }

          if (thumbnailSrc) {
            thumbnailCache.set(uid, thumbnailSrc);
            setThumbnailImageSrcMap(prev => ({ ...prev, [uid]: thumbnailSrc }));
          }
        });
      }
    );
    return () => sub.unsubscribe();
  }, [displaySetService, dataSource, getImageSrc, hasLoadedViewports]);

  // ─── Double click handler ───
  const onDoubleClickThumbnailHandler = useCallback(
    async (displaySetInstanceUID: string) => {
      const customHandler = customizationService.getCustomization(
        'studyBrowser.thumbnailDoubleClickCallback'
      ) as any;

      const setupArgs = {
        activeViewportId,
        commandsManager,
        servicesManager,
        isHangingProtocolLayout,
        appConfig: (extensionManager as any)._appConfig,
      };

      if (customHandler?.callbacks) {
        const handlers = customHandler.callbacks.map((cb: any) => cb(setupArgs));
        for (const handler of handlers) {
          await handler(displaySetInstanceUID);
        }
      }

      checkDirtyMeasurements(displaySetInstanceUID);
    },
    [
      activeViewportId,
      commandsManager,
      servicesManager,
      isHangingProtocolLayout,
      customizationService,
      extensionManager,
      checkDirtyMeasurements,
    ]
  );

  // ─── Study click ───
  function handleStudyClick(StudyInstanceUID: string) {
    const shouldCollapse = expandedStudyInstanceUIDs.includes(StudyInstanceUID);
    const updated = shouldCollapse
      ? expandedStudyInstanceUIDs.filter(uid => uid !== StudyInstanceUID)
      : [...expandedStudyInstanceUIDs, StudyInstanceUID];

    setExpandedStudyInstanceUIDs(updated);

    if (!shouldCollapse) {
      requestDisplaySetCreationForStudy(dataSource, displaySetService, StudyInstanceUID, true);
    }
  }

  // ─── Jump to display set ───
  useEffect(() => {
    if (!jumpToDisplaySet) return;
    const element = document.getElementById(`thumbnail-${jumpToDisplaySet}`);
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ behavior: 'smooth' });
      setJumpToDisplaySet(null);
    }
  }, [jumpToDisplaySet, expandedStudyInstanceUIDs, activeTabName]);

  useEffect(() => {
    if (!jumpToDisplaySet) return;
    const thumbnailLocation = _findTabAndStudyOfDisplaySet(jumpToDisplaySet, tabs);
    if (!thumbnailLocation) return;

    const { tabName, StudyInstanceUID } = thumbnailLocation;
    setActiveTabName(tabName);
    if (!expandedStudyInstanceUIDs.includes(StudyInstanceUID)) {
      setExpandedStudyInstanceUIDs(prev => [...prev, StudyInstanceUID]);
    }
  }, [expandedStudyInstanceUIDs, jumpToDisplaySet]);

  // ─── Build tabs ───
  const tabs = createStudyBrowserTabs(StudyInstanceUIDs, studyDisplayList, displaySets);
  const activeDisplaySetInstanceUIDs = viewports.get(activeViewportId)?.displaySetInstanceUIDs;

  return (
    <StudyBrowser
      tabs={tabs}
      servicesManager={servicesManager}
      activeTabName={activeTabName}
      expandedStudyInstanceUIDs={expandedStudyInstanceUIDs}
      onClickStudy={handleStudyClick}
      onClickTab={setActiveTabName}
      onClickUntrack={onClickUntrack}
      onClickThumbnail={() => {}}
      onDoubleClickThumbnail={onDoubleClickThumbnailHandler}
      activeDisplaySetInstanceUIDs={activeDisplaySetInstanceUIDs}
    />
  );
}

// ─── Helpers ───

function getImageIdForThumbnail(displaySet: any, imageIds: any[]) {
  if (!imageIds?.length) return undefined;
  if (displaySet.isDynamicVolume) {
    const timePoints = displaySet.dynamicVolumeInfo.timePoints;
    const middleIndex = Math.floor(timePoints.length / 2);
    const middleTimePointImageIds = timePoints[middleIndex];
    return middleTimePointImageIds[Math.floor(middleTimePointImageIds.length / 2)];
  }
  return imageIds[Math.floor(imageIds.length / 2)];
}

function _findTabAndStudyOfDisplaySet(displaySetInstanceUID: string, tabs: any[]) {
  for (const tab of tabs) {
    for (const study of tab.studies) {
      for (const ds of study.displaySets) {
        if (ds.displaySetInstanceUID === displaySetInstanceUID) {
          return { tabName: tab.name, StudyInstanceUID: study.studyInstanceUid };
        }
      }
    }
  }
  return null;
}

export default NovaPanelStudyBrowser;
export { thumbnailCache, thumbnailNoImageModalities, getImageIdForThumbnail, getImageSrcFromImageId };
