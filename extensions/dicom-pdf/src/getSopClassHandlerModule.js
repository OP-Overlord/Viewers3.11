import { SOPClassHandlerId } from './id';
import { utils, Types as OhifTypes } from '@ohif/core';
import i18n from '@ohif/i18n';

const SOP_CLASS_UIDS = {
  ENCAPSULATED_PDF: '1.2.840.10008.5.1.4.1.1.104.1',
};

const sopClassUids = Object.values(SOP_CLASS_UIDS);

const _getDisplaySetsFromSeries = (instances, servicesManager, extensionManager) => {
  const dataSource = extensionManager.getActiveDataSource()[0];
  return instances.map(instance => {
    const { Modality, SOPInstanceUID } = instance;
    const { SeriesDescription = 'PDF', MIMETypeOfEncapsulatedDocument } = instance;
    const { SeriesNumber, SeriesDate, SeriesInstanceUID, StudyInstanceUID, SOPClassUID } = instance;
    const renderedUrl = dataSource.retrieve.directURL({
      instance,
      tag: 'EncapsulatedDocument',
      defaultType: MIMETypeOfEncapsulatedDocument || 'application/pdf',
      singlepart: 'pdf',
    });

    const displaySet = {
      //plugin: id,
      Modality,
      displaySetInstanceUID: utils.guid(),
      SeriesDescription,
      SeriesNumber,
      SeriesDate,
      SOPInstanceUID,
      SeriesInstanceUID,
      StudyInstanceUID,
      SOPClassHandlerId,
      SOPClassUID,
      referencedImages: null,
      measurements: null,
      renderedUrl: renderedUrl,
      instances: [instance],
      thumbnailSrc: null,
      isDerivedDisplaySet: true,
      isLoaded: false,
      sopClassUids,
      numImageFrames: 0,
      numInstances: 1,
      instance,
      supportsWindowLevel: true,
      label: SeriesDescription || `${i18n.t('Series')} ${SeriesNumber} - ${i18n.t(Modality)}`,
      /**
       * Renders the first page of the PDF to a canvas and returns a JPEG data URL.
       * Called by HorizontalThumbnailList when there are no imageIds (PDF has none).
       */
      getThumbnailSrc: async function () {
        try {
          const pdfjsLib = await import('pdfjs-dist');
          // Set worker only if not already configured (MobilePdfViewport may have set it already)
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || '/'}pdf.worker.js`;
          }

          const resolvedUrl = await renderedUrl;
          const response = await fetch(resolvedUrl, {
            credentials: 'include',
            headers: { Accept: 'application/pdf, application/octet-stream, */*' },
          });
          if (!response.ok) return null;

          const buffer = await response.arrayBuffer();
          const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
          const page = await pdfDoc.getPage(1);

          // Scale page to fit inside a 256×256 thumbnail
          const raw = page.getViewport({ scale: 1.0 });
          const size = 256;
          const scale = Math.min(size / raw.width, size / raw.height);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) { pdfDoc.destroy(); return null; }

          await page.render({ canvasContext: ctx, viewport }).promise;
          pdfDoc.destroy();
          return canvas.toDataURL('image/jpeg', 0.85);
        } catch (err) {
          console.warn('[DicomPdf] getThumbnailSrc failed:', err);
          return null;
        }
      },
    };
    return displaySet;
  });
};

export default function getSopClassHandlerModule(params) {
  const { servicesManager, extensionManager } = params;
  const getDisplaySetsFromSeries = instances => {
    return _getDisplaySetsFromSeries(instances, servicesManager, extensionManager);
  };

  return [
    {
      name: 'dicom-pdf',
      sopClassUids,
      getDisplaySetsFromSeries,
    },
  ];
}
