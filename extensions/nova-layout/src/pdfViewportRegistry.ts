/**
 * Registry that maps viewportId → blob URL for PDF viewports.
 * Allows getCommandsModule to access the already-fetched PDF blob
 * without re-downloading it.
 */
const blobUrls = new Map<string, string>();

export const pdfViewportRegistry = {
  set: (viewportId: string, blobUrl: string) => blobUrls.set(viewportId, blobUrl),
  get: (viewportId: string) => blobUrls.get(viewportId),
  delete: (viewportId: string) => blobUrls.delete(viewportId),
};
