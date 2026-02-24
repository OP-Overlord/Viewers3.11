import onboardingCustomization from './customizations/onboardingCustomization';
import NovaLocalUpload from './LocalUpload/NovaLocalUpload';

export default function getCustomizationModule({ servicesManager, extensionManager }) {
  return [
    {
      name: 'default',
      value: {
        ...onboardingCustomization,
        // Sobrescribe la ruta /local del core para mostrar barra de progreso real
        // y navegar directamente al visor tras la carga.
        // Funciona porque customRoutes se inserta ANTES de bakedInRoutes en el router.
        'routes.customRoutes': {
          routes: [{ path: '/local', children: NovaLocalUpload }],
          notFoundRoute: null,
        },
      },
    },
  ];
}
