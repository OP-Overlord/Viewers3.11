/**
 * Commands module for nova-layout extension
 * Provides mobile-specific commands like share functionality
 */

import { pdfViewportRegistry } from './pdfViewportRegistry';

const getCommandsModule = ({ servicesManager, extensionManager }) => {
  const actions = {
    /**
     * Captures the current viewport and opens the native share dialog.
     * If the active viewport is a PDF, shares the PDF file instead of a canvas image.
     * Falls back to download if Web Share API is not available.
     */
    shareViewportImage: async ({ viewportId }) => {
      const { cornerstoneViewportService, viewportGridService } = servicesManager.services;

      // Get the active viewport if not specified
      const activeViewportId = viewportId || viewportGridService.getState().activeViewportId;

      if (!activeViewportId) {
        console.warn('No active viewport to share');
        return;
      }

      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // ── PDF viewport path ─────────────────────────────────────────────────
        const pdfBlobUrl = pdfViewportRegistry.get(activeViewportId);
        if (pdfBlobUrl) {
          const pdfBlob = await fetch(pdfBlobUrl).then(r => r.blob());
          const fileName = `documento-medico-${timestamp}.pdf`;
          const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: 'Documento Médico' });
            } catch (error: any) {
              if (error.name !== 'AbortError') {
                console.warn('PDF share failed, falling back to download:', error);
                downloadFile(pdfBlobUrl, fileName);
              }
            }
          } else {
            downloadFile(pdfBlobUrl, fileName);
          }
          return;
        }

        // ── Image viewport path ───────────────────────────────────────────────
        const viewportInfo = cornerstoneViewportService.getViewportInfo(activeViewportId);
        if (!viewportInfo) {
          console.warn('Viewport info not found');
          return;
        }

        const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
        if (!viewport) {
          console.warn('Cornerstone viewport not found');
          return;
        }

        const canvas = viewport.getCanvas();
        if (!canvas) {
          console.warn('Canvas not found');
          return;
        }

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b: Blob | null) => {
              if (b) resolve(b);
              else reject(new Error('Failed to create blob'));
            },
            'image/jpeg',
            0.95
          );
        });

        const fileName = `imagen-medica-${timestamp}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: 'Imagen Médica', text: 'Compartir imagen del estudio' });
          } catch (error: any) {
            if (error.name !== 'AbortError') {
              console.warn('Share failed, falling back to download:', error);
              const url = URL.createObjectURL(blob);
              downloadFile(url, fileName);
              URL.revokeObjectURL(url);
            }
          }
        } else {
          const url = URL.createObjectURL(blob);
          downloadFile(url, fileName);
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.error('Error sharing viewport:', error);
      }
    },
  };

  function downloadFile(url: string, fileName: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const definitions = {
    shareViewportImage: {
      commandFn: actions.shareViewportImage,
    },
  };

  return {
    actions,
    definitions,
    defaultContext: 'NOVA_MOBILE',
  };
};

export default getCommandsModule;
