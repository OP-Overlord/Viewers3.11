function waitForElement(selector, maxAttempts = 20, interval = 25) {
  return new Promise(resolve => {
    let attempts = 0;

    const checkForElement = setInterval(() => {
      const element = document.querySelector(selector);

      if (element || attempts >= maxAttempts) {
        clearInterval(checkForElement);
        resolve();
      }

      attempts++;
    }, interval);
  });
}

export default {
  'ohif.tours': [
    {
      id: 'novaMobileTour',
      route: '/mobile',
      steps: [
        {
          id: 'welcome',
          title: 'Explora las series',
          text: 'Toca una miniatura de la barra inferior para ver la modalidad y el número de imágenes de la serie antes de abrirla.',
          attachTo: {
            element: '#thumbnail-list-container',
            on: 'top',
          },
          advanceOn: {
            selector: '#thumbnail-list-container',
            event: 'touchstart',
          },
          beforeShowPromise: () => waitForElement('#thumbnail-list-container'),
        },
        {
          id: 'loadSeries',
          title: 'Abre una serie',
          text: 'Haz doble toque sobre una miniatura para cargarla en el visor principal.',
          attachTo: {
            element: '#thumbnail-item-0',
            on: 'top',
          },
          advanceOn: {
            selector: '#thumbnail-item-0',
            event: 'dblclick',
          },
          beforeShowPromise: () => waitForElement('#thumbnail-item-0'),
        },
        {
          id: 'navigation',
          title: 'Navega y haz zoom',
          text: 'Desliza un dedo hacia arriba o abajo para recorrer las imágenes de la serie. Pellizca con dos dedos para acercar o alejar la imagen.',
          attachTo: {
            // El viewport móvil (MobileViewportV2) NO envuelve OHIFCornerstoneViewport:
            // su elemento es `.mobile-v2-element`, no `.viewport-element`.
            element: '.mobile-v2-element',
            on: 'top',
          },
          advanceOn: {
            selector: '.mobile-v2-element',
            event: 'touchmove',
          },
          beforeShowPromise: () => waitForElement('.mobile-v2-element'),
        },
        {
          id: 'tools',
          title: 'Herramientas de imagen',
          text: 'Ajusta el Contraste, activa Medir para calcular distancias o Cine para reproducir la serie como video. Toca de nuevo el botón activo para volver a la navegación.',
          attachTo: {
            element: '#toolbar-button-WindowLevel',
            on: 'bottom',
          },
          advanceOn: {
            selector: '#toolbar-button-WindowLevel',
            event: 'click',
          },
          beforeShowPromise: () => waitForElement('#toolbar-button-WindowLevel'),
        },
        {
          id: 'share',
          title: 'Comparte o descarga',
          text: 'Usa Compartir en la barra superior para guardar o enviar la imagen que estás viendo.',
          attachTo: {
            element: '#toolbar-button-Share',
            on: 'bottom',
          },
          advanceOn: {
            selector: '#toolbar-button-Share',
            event: 'click',
          },
          beforeShowPromise: () => waitForElement('#toolbar-button-Share'),
          buttons: [
            {
              text: 'Finalizar',
              action() {
                this.complete();
              },
            },
          ],
        },
      ],
      tourOptions: {
        useModalOverlay: true,
        defaultStepOptions: {
          buttons: [
            {
              text: 'Omitir',
              action() {
                this.complete();
              },
              secondary: true,
            },
            {
              text: 'Siguiente',
              action() {
                this.next();
              },
            },
          ],
        },
      },
    },
  ],
};
