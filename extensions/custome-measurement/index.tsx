import CardioThoracicRatioTool from './src/Tools/CardioThoracicRatioTool';

export default function CTRToolExtension({ servicesManager, commandsManager }) {
  return {
    name: 'ctr',
    id: 'ctr',
    getToolbarModule() {
      return {
        definitions: [
          {
            id: 'CardioThoracicRatio',
            label: 'CTR',
            icon: 'length',
            type: 'setToolActive',
            commandOptions: {
              toolName: 'CardioThoracicRatioTool',
            },
          },
        ],
        defaultContext: 'ACTIVE_VIEWPORT::CORNERSTONE',
        buttonSections: [
          {
            id: 'measurementTools',
            label: 'Mediciones',
            buttons: ['CardioThoracicRatio'],
          },
        ],
      };
    },
    preRegistration({ toolGroupService }) {
      toolGroupService.addTool({
        name: 'CardioThoracicRatioTool',
        tool: CardioThoracicRatioTool,
      });
    },
  };
}
