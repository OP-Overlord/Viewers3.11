import React, { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icons } from '@ohif/ui-next';
import { useSystem, useToolbar } from '@ohif/core';
import { preserveQueryParameters } from '@ohif/app';

// Map of tool IDs to their icon names
const toolIconMap: Record<string, string> = {
  Zoom: 'tool-zoom',
  Pan: 'tool-move',
  StackScroll: 'tool-stack-scroll',
  Length: 'tool-length',
  WindowLevel: 'tool-window-level',
  Capture: 'tool-capture',
};

function ViewerHeader({ appConfig }: withAppTypes<{ appConfig: AppTypes.Config }>) {
  const { extensionManager, servicesManager, commandsManager } = useSystem();
  const { toolbarService } = servicesManager.services;

  const navigate = useNavigate();
  const location = useLocation();

  // Get toolbar buttons using the hook
  const { toolbarButtons, onInteraction } = useToolbar({
    toolbarService,
    buttonSection: 'primary',
  });

  const onClickReturnButton = () => {
    const { pathname } = location;
    const dataSourceIdx = pathname.indexOf('/', 1);

    const dataSourceName = pathname.substring(dataSourceIdx + 1);
    const existingDataSource = extensionManager.getDataSources(dataSourceName);

    const searchQuery = new URLSearchParams();
    if (dataSourceIdx !== -1 && existingDataSource) {
      searchQuery.append('datasources', pathname.substring(dataSourceIdx + 1));
    }
    preserveQueryParameters(searchQuery);

    navigate({
      pathname: '/',
      search: decodeURIComponent(searchQuery.toString()),
    });
  };

  const handleButtonClick = useCallback(
    (button: any) => {
      onInteraction({
        itemId: button.id,
        commands: button.componentProps?.commands,
      });
    },
    [onInteraction]
  );

  const showReturnButton = !!appConfig.showStudyList;

  // Render logo component
  const renderLogo = () => {
    if (appConfig.whiteLabeling?.createLogoComponentFn) {
      return appConfig.whiteLabeling.createLogoComponentFn(React, {});
    }
    return <Icons.OHIFLogo />;
  };

  return (
    <nav className="bg-primary-dark flex h-[52px] w-full items-center px-2">
      {/* Left section: Back button + Logo */}
      <div
        className="flex flex-shrink-0 cursor-pointer items-center"
        onClick={showReturnButton ? onClickReturnButton : undefined}
      >
        {showReturnButton && <Icons.ArrowLeft className="text-primary h-6 w-6" />}
        <div
          className="ml-1"
          style={{ transform: 'scale(0.7)', transformOrigin: 'left center' }}
        >
          {renderLogo()}
        </div>
      </div>

      {/* Center section: Custom Toolbar with labels */}
      <div
        className="mx-2 flex-1 overflow-x-auto overflow-y-hidden"
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <style>{`
          .mobile-toolbar-scroll::-webkit-scrollbar { display: none; }
        `}</style>
        <div className="mobile-toolbar-scroll flex items-center justify-start gap-1">
          {toolbarButtons.map((button: any) => {
            const isActive = button.componentProps?.isActive;
            const isDisabled = button.componentProps?.disabled;
            const iconName = button.componentProps?.icon || toolIconMap[button.id];
            const label = button.componentProps?.label || button.id;

            // Get the icon component
            const IconComponent = iconName ? Icons.ByName : null;

            return (
              <button
                key={button.id}
                className={`flex h-[46px] min-w-[48px] flex-col items-center justify-center rounded px-1 transition-colors duration-150 ${
                  isActive ? 'bg-primary text-black' : 'text-white hover:bg-white/10'
                } ${isDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'} `}
                onClick={() => !isDisabled && handleButtonClick(button)}
                disabled={isDisabled}
                data-cy={`toolbar-button-${button.id}`}
                id={`toolbar-button-${button.id}`}
              >
                {IconComponent && (
                  <Icons.ByName
                    name={iconName}
                    className={`h-5 w-5 ${isActive ? 'text-black' : 'text-white'}`}
                  />
                )}
                <span
                  className={`mt-0.5 text-[9px] leading-tight ${isActive ? 'text-black' : 'text-gray-300'}`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export default ViewerHeader;
