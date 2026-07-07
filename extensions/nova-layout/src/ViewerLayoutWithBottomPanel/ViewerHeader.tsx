import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { eventTarget } from '@cornerstonejs/core';
import { Enums as csToolsEnums } from '@cornerstonejs/tools';
import { Icons } from '@ohif/ui-next';
import { useSystem, useToolbar } from '@ohif/core';
import { preserveQueryParameters } from '@ohif/app';
import { mobileCineStore } from '../Viewport/mobileCineStore';

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
  const { extensionManager, servicesManager } = useSystem();
  const { toolbarService, toolGroupService, viewportGridService } = servicesManager.services;

  const navigate = useNavigate();
  const location = useLocation();

  // Get toolbar buttons using the hook
  const { toolbarButtons, onInteraction } = useToolbar({
    toolbarService,
    buttonSection: 'primary',
  });

  // Resaltado dirigido por la herramienta activa REAL de cornerstone, CAPTURADA en
  // estado. CLAVE: la fuente de verdad NO es el toolbarService (su `isActive` se
  // desfasa tras un toggle) ni un re-lectura manual en un instante elegido a mano
  // (frágil: si el comando lanza o el evento de toolbar no se emite, el botón se
  // queda "pegado" hasta cambiar de escena). En su lugar escuchamos el evento
  // AUTORITATIVO de cornerstone: TOOL_ACTIVATED se dispara SÍNCRONAMENTE dentro de
  // `setToolActive`, para CUALQUIER vía (tap de toolbar, toggle-off, herramienta
  // por defecto del viewport, tap de miniatura). Así el resaltado siempre refleja
  // el estado real, incluido el apagado al re-tocar.
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [cineActive, setCineActive] = useState<boolean>(mobileCineStore.isVisible());

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

  // Mantener el resaltado en sincronía con cambios de herramienta/escena/cine.
  useEffect(() => {
    const sync = () => {
      setActiveToolName(readActiveTool());
      setCineActive(mobileCineStore.isVisible());
    };
    sync();
    // Evento autoritativo, DIRECTO del eventTarget de cornerstone. NO usar el relay
    // PRIMARY_TOOL_ACTIVATED de toolGroupService: su listener se elimina en
    // onModeExit (destroy()) y NUNCA se re-suscribe (_init solo corre en el
    // constructor del singleton) → al volver del listado al mismo estudio el header
    // dejaba de enterarse de los cambios de herramienta y el resaltado quedaba
    // congelado en "Desplazar".
    eventTarget.addEventListener(csToolsEnums.Events.TOOL_ACTIVATED, sync);
    const subs = [
      // Canal redundante: TOOL_BAR_MODIFIED se emite síncrono al final de cada
      // recordInteraction (refreshToolbarState) → segunda vía en el momento del tap.
      toolbarService.subscribe(toolbarService.EVENTS.TOOL_BAR_MODIFIED, sync),
      // Respaldos para cambios de escena (no siempre reactivan una herramienta).
      viewportGridService.subscribe(viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED, sync),
      viewportGridService.subscribe(viewportGridService.EVENTS.VIEWPORTS_READY, sync),
    ];
    const unsubCine = mobileCineStore.subscribe(sync);
    return () => {
      eventTarget.removeEventListener(csToolsEnums.Events.TOOL_ACTIVATED, sync);
      subs.forEach(s => s.unsubscribe());
      unsubCine();
    };
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
      // onInteraction corre el comando SÍNCRONO (setToolActive/toggle de cine
      // incluido). El evento TOOL_ACTIVATED de cornerstone y el store de cine ya
      // disparan `sync` dentro de esta misma llamada; la re-lectura directa de abajo
      // es un tercer canal (cinturón y tirantes para navegadores móviles reales):
      // al volver de onInteraction el estado de cornerstone YA está actualizado.
      onInteraction({
        itemId: button.id,
        commands: button.componentProps?.commands,
      });
      setActiveToolName(readActiveTool());
      setCineActive(mobileCineStore.isVisible());
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
            // Cine es una ACCIÓN (toggle) → su estado activo viene del store de cine,
            // no de una herramienta de cornerstone. El resto de tool buttons se
            // resaltan SOLO si su herramienta es la activa (sin fallback al isActive
            // del toolbarService, que se quedaba "pegado" tras un toggle).
            const isActive =
              button.id === 'Cine'
                ? cineActive
                : getToolName(button) === activeToolName;
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
