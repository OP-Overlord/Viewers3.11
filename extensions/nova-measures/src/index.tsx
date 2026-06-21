import { id } from './id';
import CardioThoracicIndexTool from './CardioThoracicIndexTool';
import KiteAngleTool from './KiteAngleTool';
import HilgenreinerAngleTool from './HilgenreinerAngleTool';
import TonnisAngleTool from './TonnisAngleTool';
import InsallSalvatiIndexTool from './InsallSalvatiIndexTool';
import { addTool, annotation } from '@cornerstonejs/tools';

const NOVA_TOOL_NAMES = [
  CardioThoracicIndexTool.toolName,
  KiteAngleTool.toolName,
  HilgenreinerAngleTool.toolName,
  TonnisAngleTool.toolName,
  InsallSalvatiIndexTool.toolName,
];

/**
 * You can remove any of the following modules if you don't need them.
 */
export default {
  /**
   * Only required property. Should be a unique value across all extensions.
   * You ID can be anything you want, but it should be unique.
   */
  id,

  /**
   * Perform any pre-registration tasks here. This is called before the extension
   * is registered. Usually we run tasks such as: configuring the libraries
   * (e.g. cornerstone, cornerstoneTools, ...) or registering any services that
   * this extension is providing.
   */
  preRegistration: ({ servicesManager, commandsManager, configuration = {} }) => {
    addTool(CardioThoracicIndexTool);
    addTool(KiteAngleTool);
    addTool(HilgenreinerAngleTool);
    addTool(TonnisAngleTool);
    addTool(InsallSalvatiIndexTool);
  },
  /**
   * PanelModule should provide a list of panels that will be available in OHIF
   * for Modes to consume and render. Each panel is defined by a {name,
   * iconName, iconLabel, label, component} object. Example of a panel module
   * is the StudyBrowserPanel that is provided by the default extension in OHIF.
   */
  getPanelModule: ({ servicesManager, commandsManager, extensionManager }) => {},
  /**
   * ViewportModule should provide a list of viewports that will be available in OHIF
   * for Modes to consume and use in the viewports. Each viewport is defined by
   * {name, component} object. Example of a viewport module is the CornerstoneViewport
   * that is provided by the Cornerstone extension in OHIF.
   */
  getViewportModule: ({ servicesManager, commandsManager, extensionManager }) => {},
  /**
   * ToolbarModule should provide a list of tool buttons that will be available in OHIF
   * for Modes to consume and use in the toolbar. Each tool button is defined by
   * {name, defaultComponent, clickHandler }. Examples include radioGroupIcons and
   * splitButton toolButton that the default extension is providing.
   */
  getToolbarModule: ({ servicesManager, commandsManager, extensionManager }) => {},
  /**
   * LayoutTemplateMOdule should provide a list of layout templates that will be
   * available in OHIF for Modes to consume and use to layout the viewer.
   * Each layout template is defined by a { name, id, component}. Examples include
   * the default layout template provided by the default extension which renders
   * a Header, left and right sidebars, and a viewport section in the middle
   * of the viewer.
   */
  getLayoutTemplateModule: ({ servicesManager, commandsManager, extensionManager }) => {},
  /**
   * SopClassHandlerModule should provide a list of sop class handlers that will be
   * available in OHIF for Modes to consume and use to create displaySets from Series.
   * Each sop class handler is defined by a { name, sopClassUids, getDisplaySetsFromSeries}.
   * Examples include the default sop class handler provided by the default extension
   */
  getSopClassHandlerModule: ({ servicesManager, commandsManager, extensionManager }) => {},
  /**
   * HangingProtocolModule should provide a list of hanging protocols that will be
   * available in OHIF for Modes to use to decide on the structure of the viewports
   * and also the series that hung in the viewports. Each hanging protocol is defined by
   * { name, protocols}. Examples include the default hanging protocol provided by
   * the default extension that shows 2x2 viewports.
   */
  getHangingProtocolModule: ({ servicesManager, commandsManager, extensionManager }) => {},
  /**
   * CommandsModule should provide a list of commands that will be available in OHIF
   * for Modes to consume and use in the viewports. Each command is defined by
   * an object of { actions, definitions, defaultContext } where actions is an
   * object of functions, definitions is an object of available commands, their
   * options, and defaultContext is the default context for the command to run against.
   */
  getCommandsModule: ({ servicesManager }) => {
    const { cornerstoneViewportService } = servicesManager.services;
    const removeNovaAnnotation = ({ uid }) => {
      annotation.state.removeAnnotation(uid);
      // Remove all SVG elements manually added by nova tools.
      // Cornerstone does not manage these and won't clean them up on render.
      // Selectors cover all custom attributes used across nova-measures tools:
      //   data-text-line  → CardioThoracicIndex, KiteAngle, TonnisAngle, HilgenreinerAngle, InsallSalvati
      //   data-arc        → KiteAngle, TonnisAngle
      //   data-arc-left / data-arc-right → HilgenreinerAngle
      //   data-segment-label → InsallSalvati
      const baseAttr = `[data-annotation-uid="${uid}"]`;
      document
        .querySelectorAll(
          `${baseAttr}[data-text-line],${baseAttr}[data-arc],${baseAttr}[data-arc-left],${baseAttr}[data-arc-right],${baseAttr}[data-segment-label]`
        )
        .forEach(el => el.remove());
      cornerstoneViewportService.getRenderingEngine()?.render();
    };
    return {
      definitions: {
        removeNovaAnnotation: { commandFn: removeNovaAnnotation },
      },
      defaultContext: 'CORNERSTONE',
    };
  },
  getCustomizationModule: () => [
    {
      name: 'default',
      value: {
        measurementsContextMenu: {
          $set: {
            inheritsFrom: 'ohif.contextMenu',
            menus: [
              {
                id: 'forNovaAnnotation',
                selector: ({ nearbyToolData, toolName }) =>
                  !!nearbyToolData && NOVA_TOOL_NAMES.includes(toolName),
                items: [
                  {
                    label: 'Delete',
                    commands: 'removeNovaAnnotation',
                  },
                ],
              },
              {
                id: 'forExistingMeasurement',
                selector: ({ nearbyToolData, toolName }) =>
                  !!nearbyToolData && !NOVA_TOOL_NAMES.includes(toolName),
                items: [
                  {
                    label: 'Delete measurement',
                    commands: 'removeMeasurement',
                  },
                  {
                    label: 'Add Label',
                    commands: 'setMeasurementLabel',
                  },
                ],
              },
            ],
          },
        },
      },
    },
  ],
  /**
   * ContextModule should provide a list of context that will be available in OHIF
   * and will be provided to the Modes. A context is a state that is shared OHIF.
   * Context is defined by an object of { name, context, provider }. Examples include
   * the measurementTracking context provided by the measurementTracking extension.
   */
  getContextModule: ({ servicesManager, commandsManager, extensionManager }) => {},
  /**
   * DataSourceModule should provide a list of data sources to be used in OHIF.
   * DataSources can be used to map the external data formats to the OHIF's
   * native format. DataSources are defined by an object of { name, type, createDataSource }.
   */
  getDataSourcesModule: ({ servicesManager, commandsManager, extensionManager }) => {},
};
