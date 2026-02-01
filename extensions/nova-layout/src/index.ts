import getLayoutTemplateModule from './getLayoutTemplateModule';
import getPanelModule from './getPanelModule';
import getCustomizationModule from './getCustomizationModule';
import getViewportModule from './getViewportModule';
import getCommandsModule from './getCommandsModule';
import { id } from './id';

const novaLayoutExtension = {
  id,
  getLayoutTemplateModule,
  getPanelModule,
  getCustomizationModule,
  getViewportModule,
  getCommandsModule,
};

export default novaLayoutExtension;
