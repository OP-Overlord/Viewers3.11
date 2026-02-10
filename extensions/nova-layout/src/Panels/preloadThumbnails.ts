import {
  thumbnailCache,
  thumbnailNoImageModalities,
  getImageIdForThumbnail,
  getImageSrcFromImageId,
} from './NovaPanelStudyBrowser';

/**
 * Preloads thumbnails for all active display sets into the module-level cache.
 * This allows the NovaPanelStudyBrowser to show cached thumbnails instantly
 * when the side panel is opened for the first time.
 *
 * Returns an unsubscribe function to clean up event listeners.
 */
export function preloadThumbnails(
  servicesManager: AppTypes.ServicesManager,
  extensionManager: any
): { unsubscribe: () => void } {
  const { displaySetService } = servicesManager.services;
  const [dataSource] = extensionManager.getActiveDataSource();

  const getCornerstoneLibraries = () => {
    const utilities = extensionManager.getModuleEntry(
      '@ohif/extension-cornerstone.utilityModule.common'
    ) as any;
    return utilities.exports.getCornerstoneLibraries();
  };

  const getImageSrc = (imageId: string): Promise<string> => {
    const { cornerstone } = getCornerstoneLibraries();
    return getImageSrcFromImageId(cornerstone, imageId);
  };

  const loadThumbnailsForDisplaySets = (displaySets: any[]) => {
    const filtered = displaySets.filter(
      ds =>
        !ds.excludeFromThumbnailBrowser &&
        !thumbnailNoImageModalities.includes(ds.Modality) &&
        !ds.unsupported
    );

    filtered.forEach(async dSet => {
      const uid = dSet.displaySetInstanceUID;
      if (thumbnailCache.has(uid)) {
        return;
      }

      const imageIds = dataSource.getImageIdsForDisplaySet(dSet);
      const imageId = getImageIdForThumbnail(dSet, imageIds);
      if (!imageId) {
        return;
      }

      try {
        let { thumbnailSrc } = dSet;
        if (!thumbnailSrc && dSet.getThumbnailSrc) {
          thumbnailSrc = await dSet.getThumbnailSrc({ getImageSrc });
        }
        if (!thumbnailSrc && imageId) {
          thumbnailSrc = await getImageSrc(imageId);
          dSet.thumbnailSrc = thumbnailSrc;
        }

        if (thumbnailSrc) {
          thumbnailCache.set(uid, thumbnailSrc);
        }
      } catch (e) {
        // Silently skip failed thumbnails
      }
    });
  };

  // Preload existing display sets
  const existing = displaySetService.activeDisplaySets;
  if (existing.length > 0) {
    loadThumbnailsForDisplaySets(existing);
  }

  // Listen for new display sets being added
  const sub = displaySetService.subscribe(
    displaySetService.EVENTS.DISPLAY_SETS_ADDED,
    (data: any) => {
      const { displaySetsAdded } = data;
      loadThumbnailsForDisplaySets(displaySetsAdded);
    }
  );

  return { unsubscribe: () => sub.unsubscribe() };
}
