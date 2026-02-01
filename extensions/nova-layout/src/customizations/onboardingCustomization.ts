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
          title: 'Bienvenido a Nova Mobile',
          text: 'Toca una miniatura en la barra inferior para ver información detallada de la serie antes de cargarla.',
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
          title: 'Cargar Serie',
          text: 'Haz doble tap sobre una miniatura para cargar la serie en el visor principal.',
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
          title: 'Navegación',
          text: 'Desliza tu dedo verticalmente sobre la imagen para navegar entre las diferentes imágenes de la serie.',
          attachTo: {
            element: '.viewport-element',
            on: 'bottom',
          },
          advanceOn: {
            selector: '.cornerstone-viewport-element',
            event: 'touchmove',
          },
          beforeShowPromise: () => waitForElement('.viewport-element'),
        },
        {
          id: 'zoom',
          title: 'Zoom y Pan',
          text: 'Selecciona la herramienta de Zoom para pellizcar y acercar, o Pan para mover la imagen.',
          attachTo: {
            element: '#toolbar-button-Zoom',
            on: 'bottom',
          },
          advanceOn: {
            selector: '#toolbar-button-Zoom',
            event: 'click',
          },
          beforeShowPromise: () => waitForElement('#toolbar-button-Zoom'),
        },
        {
          id: 'download',
          title: 'Descargar',
          text: 'Usa el botón de descarga en la barra superior para guardar la imagen que estás viendo.',
          attachTo: {
            element: '#toolbar-button-Capture',
            on: 'bottom',
          },
          advanceOn: {
            selector: '#toolbar-button-Capture',
            event: 'click',
          },
          beforeShowPromise: () => waitForElement('#toolbar-button-Capture'),
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
