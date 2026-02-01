import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { HangingProtocolService, CommandsManager } from '@ohif/core';
import { useAppConfig } from '@state';
import ViewerHeader from './ViewerHeader';
import BottomPanelWithServices from './BottomPanelWithServices';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle, Onboarding } from '@ohif/ui-next';
import onboardingCustomization from '../customizations/onboardingCustomization';

const DEFAULT_BOTTOM_PANEL_HEIGHT = 150;

function ViewerLayoutWithBottomPanel({
  extensionManager,
  servicesManager,
  hotkeysManager,
  commandsManager,
  viewports,
  ViewportGridComp,
  bottomPanels = [],
  bottomPanelClosed = false,
  bottomPanelHeight = DEFAULT_BOTTOM_PANEL_HEIGHT,
}: withAppTypes): React.FunctionComponent {
  const [appConfig] = useAppConfig();

  const { panelService, hangingProtocolService, customizationService } = servicesManager.services;
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(appConfig.showLoadingIndicator);
  const [bottomPanelClosedState, setBottomPanelClosed] = useState(bottomPanelClosed);

  // Register bottom panels - need to do this after Mode.tsx calls panelService.reset()
  // Mode.tsx only handles leftPanels and rightPanels, so we need to register bottom panels ourselves
  useEffect(() => {
    if (bottomPanels.length === 0) return;

    // Function to register panels
    const registerBottomPanels = () => {
      const currentPanels = panelService.getPanels('bottom');
      if (currentPanels.length === 0) {
        panelService.addPanels(panelService.PanelPosition.Bottom, bottomPanels);
      }
    };

    // Register after a small delay to ensure Mode.tsx has completed its reset
    const timeoutId = setTimeout(registerBottomPanels, 100);

    // Also listen for panel changes to re-register if they get cleared
    const { unsubscribe } = panelService.subscribe(panelService.EVENTS.PANELS_CHANGED, () => {
      const currentPanels = panelService.getPanels('bottom');
      if (currentPanels.length === 0 && bottomPanels.length > 0) {
        // Panels were cleared, re-register
        setTimeout(() => {
          panelService.addPanels(panelService.PanelPosition.Bottom, bottomPanels);
        }, 50);
      }
    });

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [panelService, bottomPanels]);

  // Show bottom panel if we have bottomPanels prop
  const showBottomPanel = bottomPanels.length > 0 && !bottomPanelClosedState;

  const handleMouseEnter = () => {
    (document.activeElement as HTMLElement)?.blur();
  };

  const LoadingIndicatorProgress = customizationService.getCustomization(
    'ui.loadingIndicatorProgress'
  );

  useEffect(() => {
    document.body.classList.add('bg-black');
    document.body.classList.add('overflow-hidden');

    return () => {
      document.body.classList.remove('bg-black');
      document.body.classList.remove('overflow-hidden');
    };
  }, []);

  const getComponent = id => {
    const entry = extensionManager.getModuleEntry(id);

    if (!entry || !entry.component) {
      throw new Error(
        `${id} is not valid for an extension module or no component found from extension ${id}.`
      );
    }

    return { entry };
  };

  useEffect(() => {
    const { unsubscribe } = hangingProtocolService.subscribe(
      HangingProtocolService.EVENTS.PROTOCOL_CHANGED,
      () => {
        setShowLoadingIndicator(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [hangingProtocolService]);

  const getViewportComponentData = viewportComponent => {
    const { entry } = getComponent(viewportComponent.namespace);

    return {
      component: entry.component,
      isReferenceViewable: entry.isReferenceViewable,
      displaySetsToDisplay: viewportComponent.displaySetsToDisplay,
    };
  };

  // Listen for panel closed state changes from service
  useEffect(() => {
    const { unsubscribe } = panelService.subscribe(
      panelService.EVENTS.PANELS_CHANGED,
      ({ options }) => {
        if (options?.bottomPanelClosed !== undefined) {
          setBottomPanelClosed(options.bottomPanelClosed);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [panelService]);

  const viewportComponents = viewports.map(getViewportComponentData);

  // Calculate panel sizes as percentages
  const totalHeight = typeof window !== 'undefined' ? window.innerHeight - 52 : 800;
  const bottomPanelPercentage = (bottomPanelHeight / totalHeight) * 100;
  const viewportPercentage = showBottomPanel ? 100 - bottomPanelPercentage : 100;

  return (
    <div
      className="flex flex-col bg-black"
      style={{
        // Use dvh (dynamic viewport height) which excludes mobile browser bars
        // Fallback to vh for older browsers
        height: '100dvh',
        minHeight: '-webkit-fill-available', // iOS Safari fallback
      }}
    >
      <ViewerHeader appConfig={appConfig} />
      <div
        className="relative flex w-full flex-1 flex-col overflow-hidden bg-black"
        style={{
          // Add bottom padding for Android navigation bar (typically 48-56px)
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
        }}
      >
        {showLoadingIndicator && <LoadingIndicatorProgress className="h-full w-full bg-black" />}

        <ResizablePanelGroup direction="vertical">
          {/* VIEWPORT GRID */}
          <ResizablePanel
            defaultSize={viewportPercentage}
            minSize={30}
            order={0}
          >
            <div
              className="relative flex h-full flex-1 items-center justify-center overflow-hidden bg-black"
              onMouseEnter={handleMouseEnter}
            >
              <ViewportGridComp
                servicesManager={servicesManager}
                viewportComponents={viewportComponents}
                commandsManager={commandsManager}
              />
            </div>
          </ResizablePanel>

          {/* BOTTOM PANEL */}
          {showBottomPanel && (
            <>
              <ResizableHandle className="hover:bg-primary h-1 cursor-row-resize bg-black" />
              <ResizablePanel
                defaultSize={bottomPanelPercentage}
                minSize={10}
                maxSize={50}
                order={1}
              >
                <BottomPanelWithServices
                  servicesManager={servicesManager}
                  commandsManager={commandsManager}
                  extensionManager={extensionManager}
                  isExpanded={!bottomPanelClosedState}
                  onClose={() => setBottomPanelClosed(true)}
                  onOpen={() => setBottomPanelClosed(false)}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      {/* Manually merge system tours with our local mobile tour to ensure it's available */}
      {(() => {
        const systemTours = customizationService.getCustomization('ohif.tours') || [];
        const mobileTours = onboardingCustomization['ohif.tours'] || [];
        // Combined tours, prioritizing mobile tours if IDs conflict (though they shouldn't)
        const combinedTours = [...systemTours, ...mobileTours];

        return <Onboarding tours={combinedTours} />;
      })()}
    </div>
  );
}

ViewerLayoutWithBottomPanel.propTypes = {
  extensionManager: PropTypes.shape({
    getModuleEntry: PropTypes.func.isRequired,
  }).isRequired,
  commandsManager: PropTypes.instanceOf(CommandsManager),
  servicesManager: PropTypes.object.isRequired,
  bottomPanels: PropTypes.array,
  bottomPanelClosed: PropTypes.bool,
  bottomPanelHeight: PropTypes.number,
  viewports: PropTypes.array,
};

export default ViewerLayoutWithBottomPanel;
