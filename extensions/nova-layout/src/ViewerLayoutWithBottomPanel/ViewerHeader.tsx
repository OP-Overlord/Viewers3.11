import React, { useCallback, useEffect, useState } from 'react';
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
  const { toolbarService, toolGroupService, viewportGridService } = servicesManager.services;

  const navigate = useNavigate();
  const location = useLocation();

  // Get toolbar buttons using the hook
  const { toolbarButtons, onInteraction } = useToolbar({
    toolbarService,
    buttonSection: 'primary',
  });

  // Resaltado dirigido por la herramienta activa REAL de cornerstone, leída de
  // forma SÍNCRONA. El `isActive` que entrega el toolbarService solo se recalcula
  // cuando `refreshToolbarState` corre con un viewportId que resuelve el toolGroup;
  // tras un toggle ese valor queda desfasado y solo se corrige cuando un evento
  // posterior (interacción con el viewport) re-evalúa → el botón "se quedaba activo
  // hasta que cambiaba la escena". Leyendo el toolGroup aquí, el cambio es inmediato.
  const [activeToolName, setActiveToolName] = useState<string | null>(null);

  const readActiveTool = useCallback((): string | null => {
    try {
      const viewportId = viewportGridService.getActiveViewportId();
      const toolGroup: any =
        (viewportId && toolGroupService.getToolGroupForViewport(viewportId)) ||
        toolGroupService.getToolGroup('default');
      return toolGroup?.getActivePrimaryMouseButtonTool?.() ?? null;
    } catch {
      return null;
    }
  }, [toolGroupService, viewportGridService]);

  // Mantener el resaltado en sincronía con cambios de escena (cambio de viewport
  // activo, series listas, o cualquier re-evaluación del toolbar).
  useEffect(() => {
    const sync = () => setActiveToolName(readActiveTool());
    sync();
    const subs = [
      toolbarService.subscribe(toolbarService.EVENTS.TOOL_BAR_MODIFIED, sync),
      toolbarService.subscribe(toolbarService.EVENTS.TOOL_BAR_STATE_MODIFIED, sync),
      viewportGridService.subscribe(viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED, sync),
      viewportGridService.subscribe(viewportGridService.EVENTS.VIEWPORTS_READY, sync),
    ];
    return () => subs.forEach(s => s.unsubscribe());
  }, [toolbarService, viewportGridService, readActiveTool]);

  // Nombre de la herramienta asociada a un botón (= commandOptions.toolName de los
  // tool buttons; para acciones como Cine/Share cae al id, que nunca coincide con
  // una herramienta de cornerstone → nunca se resaltan).
  const getToolName = (button: any): string => {
    const cmds = button.componentProps?.commands;
    const arr = Array.isArray(cmds) ? cmds : [cmds];
    const first = arr.find(Boolean);
    return first?.commandOptions?.toolName ?? button.id;
  };

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
      // El comando ya corrió de forma SÍNCRONA (setToolActive incluido) → leer ahora
      // la herramienta activa refleja el toggle de inmediato, sin esperar al
      // re-evaluado del toolbarService. React agrupa este setState con el del hook.
      setActiveToolName(readActiveTool());
    },
    [onInteraction, readActiveTool]
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
        {showReturnButton && <Icons.ArrowLeft className="text-primary h-5 w-5" />}
        {/* Logo dimensionado por ALTURA del SVG (no por transform: scale, que no
            reduce el ancho reservado en el layout). max-w + overflow acotan el
            ancho del contenedor → libera espacio horizontal para que las etiquetas
            de los botones de la toolbar se vean completas. */}
        <div className="ml-0.5 flex max-w-[40px] items-center overflow-hidden [&_svg]:h-3.5 [&_svg]:w-auto">
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
        <div className="mobile-toolbar-scroll flex items-center justify-start gap-0.5">
          {toolbarButtons.map((button: any) => {
            // Resaltado por la herramienta activa real (inmediato). Si no hay
            // herramienta activa legible, se cae al isActive del toolbarService.
            const isActive = activeToolName
              ? getToolName(button) === activeToolName
              : !!button.componentProps?.isActive;
            const isDisabled = button.componentProps?.disabled;
            const iconName = button.componentProps?.icon || toolIconMap[button.id];
            const label = button.componentProps?.label || button.id;

            // Get the icon component
            const IconComponent = iconName ? Icons.ByName : null;

            return (
              <button
                key={button.id}
                // grow + shrink-0 + basis auto: cada botón mide AL MENOS su contenido
                // (el texto nunca se trunca) y crece para repartir el espacio sobrante.
                // Con el logo reducido, los 5 caben en pantallas de móvil normales; en
                // pantallas muy estrechas el contenedor permite scroll como respaldo.

                className={`flex h-[46px] shrink-0 grow basis-auto select-none flex-col items-center justify-center rounded px-1.5 transition-colors duration-150 focus:outline-none ${
                  // `active:` (presión) en vez de `hover:`: en táctil el `:hover` queda
                  // "pegado" tras el tap → el botón parece seguir activo aunque la
                  // herramienta ya cambió. La feedback de pulsación no se queda pegada.
                  isActive ? 'bg-primary text-black' : 'text-white active:bg-white/10'
                } ${isDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'} `}
                onClick={e => {
                  // Quita el foco para que no quede resaltado tras el tap.
                  (e.currentTarget as HTMLButtonElement).blur();
                  if (!isDisabled) handleButtonClick(button);
                }}
                disabled={isDisabled}
                data-cy={`toolbar-button-${button.id}`}
                id={`toolbar-button-${button.id}`}
              >
                {IconComponent && (
                  <Icons.ByName
                    name={iconName}
                    className={`h-5 w-5 shrink-0 ${isActive ? 'text-black' : 'text-white'}`}
                  />
                )}
                <span
                  className={`mt-0.5 whitespace-nowrap text-[9px] leading-tight ${isActive ? 'text-black' : 'text-gray-300'}`}
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
