/**
 * Commands module for nova-layout extension
 * Provides mobile-specific commands like share functionality
 */

const getCommandsModule = ({ servicesManager, extensionManager }) => {
  const actions = {
    /**
     * Captures the current viewport and opens the native share dialog
     * Falls back to download if Web Share API is not available
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
        // Get the viewport element
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

        // Get the canvas from the viewport
        const canvas = viewport.getCanvas();
        if (!canvas) {
          console.warn('Canvas not found');
          return;
        }

        // Convert canvas to blob
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            blob => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create blob'));
              }
            },
            'image/jpeg',
            0.95
          );
        });

        // Create file from blob
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `imagen-medica-${timestamp}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });

        // Check if Web Share API is available and supports files
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Imagen Médica',
              text: 'Compartir imagen del estudio',
            });
            console.debug('Image shared successfully');
          } catch (error) {
            // User cancelled or share failed
            if (error.name !== 'AbortError') {
              console.warn('Share failed, falling back to download:', error);
              downloadImage(blob, fileName);
            }
          }
        } else {
          // Fallback to direct download
          console.debug('Web Share API not available, downloading instead');
          downloadImage(blob, fileName);
        }
      } catch (error) {
        console.error('Error capturing viewport:', error);
      }
    },
  };

  // Helper function to download the image
  function downloadImage(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
