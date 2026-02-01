import React, { useEffect, useState } from 'react';
import { Types, CommandsManager } from '@ohif/core';

export type BottomPanelWithServicesProps = {
  servicesManager: AppTypes.ServicesManager;
  commandsManager: CommandsManager;
  extensionManager: any;
  className?: string;
  onClose: () => void;
  onOpen: () => void;
  isExpanded: boolean;
};

const BottomPanelWithServices = ({
  servicesManager,
  commandsManager,
  extensionManager,
  isExpanded,
  onOpen,
  onClose,
  ...props
}: BottomPanelWithServicesProps) => {
  const panelService = servicesManager?.services?.panelService;

  const [tabs, setTabs] = useState([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // Fetch panels on mount and subscribe to changes
  useEffect(() => {
    // Function to fetch and update panels
    const fetchPanels = () => {
      const currentPanels = panelService.getPanels('bottom');
      if (currentPanels.length > 0) {
        setTabs(currentPanels);
        return true;
      }
      return false;
    };

    // Initial fetch
    fetchPanels();

    // Poll for panels in case they're registered after mount
    const intervalId = setInterval(() => {
      if (fetchPanels()) {
        clearInterval(intervalId);
      }
    }, 200);

    // Clear interval after 3 seconds max
    const timeoutId = setTimeout(() => clearInterval(intervalId), 3000);

    // Subscribe to panel changes
    const { unsubscribe } = panelService.subscribe(panelService.EVENTS.PANELS_CHANGED, () => {
      // Always check bottom panels on any panel change
      const updatedPanels = panelService.getPanels('bottom');
      setTabs(updatedPanels);
    });

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [panelService]);

  useEffect(() => {
    const activatePanelSubscription = panelService.subscribe(
      panelService.EVENTS.ACTIVATE_PANEL,
      (activatePanelEvent: Types.ActivatePanelEvent) => {
        const tabIndex = tabs.findIndex(tab => tab.id === activatePanelEvent.panelId);
        if (tabIndex !== -1) {
          setActiveTabIndex(tabIndex);
        }
      }
    );

    return () => {
      activatePanelSubscription.unsubscribe();
    };
  }, [tabs, panelService]);

  if (!tabs.length) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-white/50">
        Loading thumbnails...
      </div>
    );
  }

  const ActiveComponent = tabs[activeTabIndex]?.content;

  return (
    <div
      className="border-primary-dark flex h-full w-full flex-col border-t bg-black"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Tab headers - only show if multiple tabs */}
      {tabs.length > 1 && (
        <div className="border-primary-dark bg-primary-dark/50 flex border-b">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                index === activeTabIndex
                  ? 'text-primary-light border-primary-light bg-primary-dark border-b-2'
                  : 'text-primary-light/70 hover:text-primary-light hover:bg-primary-dark/70'
              }`}
              onClick={() => setActiveTabIndex(index)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Panel content */}
      <div className="flex-1 overflow-auto">
        {ActiveComponent && (
          <ActiveComponent
            {...props}
            servicesManager={servicesManager}
            commandsManager={commandsManager}
            extensionManager={extensionManager}
          />
        )}
      </div>
    </div>
  );
};

export default BottomPanelWithServices;
