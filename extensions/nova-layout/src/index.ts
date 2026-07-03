import getLayoutTemplateModule from './getLayoutTemplateModule';
import getPanelModule from './getPanelModule';
import getCustomizationModule from './getCustomizationModule';
import getViewportModule from './getViewportModule';
import getCommandsModule from './getCommandsModule';
import getToolbarModule from './getToolbarModule';
import preRegistration from './preRegistration';
import { id } from './id';

const novaLayoutExtension = {
  id,
  // Compuerta preventiva central MPR/3D (intercepta toggleHangingProtocol/setHangingProtocol).
  preRegistration,
  getLayoutTemplateModule,
  getPanelModule,
  getCustomizationModule,
  getViewportModule,
  getCommandsModule,
  getToolbarModule,
};

export default novaLayoutExtension;
