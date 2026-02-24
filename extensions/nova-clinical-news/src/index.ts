import { id } from './id';
import ClinicalNewsService from './services/ClinicalNewsService';
import NotificationBellButton from './components/NotificationBellButton';

const novaClinicalNewsExtension = {
  id,

  preRegistration({ servicesManager }: withAppTypes) {
    servicesManager.registerService(ClinicalNewsService.REGISTRATION);
  },

  getToolbarModule() {
    return [
      {
        name: 'nova.clinicalNewsBell',
        defaultComponent: NotificationBellButton,
      },
    ];
  },
};

export default novaClinicalNewsExtension;
