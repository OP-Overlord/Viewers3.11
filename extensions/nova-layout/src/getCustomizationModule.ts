import onboardingCustomization from './customizations/onboardingCustomization';

export default function getCustomizationModule({ servicesManager, extensionManager }) {
  return [
    {
      name: 'novaCustomization',
      value: {
        ...onboardingCustomization,
      },
    },
  ];
}
