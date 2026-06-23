import React, { useCallback, useEffect, useRef, useState } from 'react';
import debounce from 'lodash.debounce';
import { Enums, utilities as csUtils, VolumeViewport3D } from '@cornerstonejs/core';
import { utilities as csToolsUtils } from '@cornerstonejs/tools';
import { useSystem } from '@ohif/core';
import {
  Button,
  Icons,
  Numeric,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from '@ohif/ui-next';
import { cineViewportStore } from './cineViewportStore';

type DynamicInfo = {
  dimensionGroupNumber: number;
  numDimensionGroups: number;
  label?: string;
};

/**
 * Props que entrega el contenedor de cine de la extensión cornerstone
 * (`RenderCinePlayer`). No recibe `viewportId` ni `servicesManager`, por lo que
 * este componente resuelve el viewport al que pertenece a partir del DOM
 * circundante y obtiene los servicios vía `useSystem()`.
 */
export type AudioCinePlayerProps = {
  className?: string;
  isPlaying?: boolean;
  frameRate?: number;
  minFrameRate?: number;
  maxFrameRate?: number;
  stepFrameRate?: number;
  onPlayPauseChange?: (isPlaying: boolean) => void;
  onFrameRateChange?: (frameRate: number) => void;
  onClose?: () => void;
  dynamicInfo?: DynamicInfo;
  updateDynamicInfo?: (info: DynamicInfo) => void;
};

const AudioCinePlayer: React.FC<AudioCinePlayerProps> = ({
  isPlaying = false,
  frameRate: frameRateProp = 24,
  minFrameRate = 1,
  maxFrameRate = 90,
  stepFrameRate = 1,
  onPlayPauseChange = () => {},
  onFrameRateChange = () => {},
  onClose = () => {},
  dynamicInfo,
  updateDynamicInfo,
}) => {
  const { servicesManager } = useSystem();
  const { cineService, cornerstoneViewportService, viewportGridService } =
    servicesManager?.services ?? {};

  const rootRef = useRef<HTMLDivElement>(null);
  const viewportIdRef = useRef<string | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const [viewportId, setViewportId] = useState<string | null>(null);
  // Visibilidad por-viewport: la barra solo se muestra si este viewport está
  // "abierto" en el store de nova (ver cineViewportStore). Así, habilitar/cerrar
  // el cine afecta a un viewport sin arrastrar a los demás.
  const [isOpen, setIsOpen] = useState(false);
  const [sliceData, setSliceData] = useState({ index: 0, total: 0 });
  const [frameRate, setFrameRate] = useState(frameRateProp);
  const [loop, setLoop] = useState(true);
  const [resolveTick, setResolveTick] = useState(0);

  const isDynamic = !!dynamicInfo?.numDimensionGroups;

  // Mantener el FPS local sincronizado con el que entrega el contenedor.
  useEffect(() => {
    setFrameRate(frameRateProp);
  }, [frameRateProp]);

  // Resolver el viewport al que pertenece esta barra a partir del DOM
  // (.viewport-wrapper contiene el elemento cornerstone con data-viewportid).
  useEffect(() => {
    if (!cornerstoneViewportService) {
      return;
    }

    const wrapper = rootRef.current?.closest('.viewport-wrapper');
    const vpEl = wrapper?.querySelector('[data-viewportid]') as HTMLElement | null;
    const viewportId = vpEl?.getAttribute('data-viewportid') ?? null;
    viewportIdRef.current = viewportId;
    setViewportId(viewportId);

    if (!viewportId) {
      return;
    }

    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

    // El viewport puede no estar listo en el primer render: reintentar un poco.
    if (!viewport || viewport instanceof VolumeViewport3D) {
      if (resolveTick < 10) {
        const t = setTimeout(() => setResolveTick(v => v + 1), 150);
        return () => clearTimeout(t);
      }
      return;
    }

    const element = viewport.element as HTMLElement;
    elementRef.current = element;

    const readSlice = () => {
      try {
        setSliceData({
          index: viewport.getCurrentImageIdIndex(),
          total: viewport.getNumberOfSlices(),
        });
      } catch (e) {
        // viewport aún no listo
      }
    };
    readSlice();

    const onNewImage = (evt: any) => {
      const vp = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (!vp || vp instanceof VolumeViewport3D) {
        return;
      }
      const { imageIndex, newImageIdIndex = imageIndex, imageIdIndex } = evt.detail ?? {};
      const index = newImageIdIndex ?? imageIdIndex ?? vp.getCurrentImageIdIndex();
      setSliceData({ index, total: vp.getNumberOfSlices() });
    };

    element.addEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);

    return () => {
      element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);
    };
  }, [cornerstoneViewportService, dynamicInfo, resolveTick]);

  // Suscribirse al store por-viewport para saber si esta barra debe mostrarse.
  useEffect(() => {
    if (!viewportId) {
      return;
    }
    const sync = () => setIsOpen(cineViewportStore.isOpen(viewportId));
    sync();
    return cineViewportStore.subscribe(sync);
  }, [viewportId]);

  // Cualquier reproducción (autoPlayCine o disparo programático del contenedor
  // de OHIF) abre la barra de este viewport, de modo que el cine automático
  // siga mostrando la barra aunque no se haya activado con el atajo de nova.
  useEffect(() => {
    if (isPlaying && viewportId) {
      cineViewportStore.open(viewportId);
    }
  }, [isPlaying, viewportId]);

  // Botón de loop. Cornerstone NO actualiza la opción `loop` al re-llamar
  // playClip si el clip ya tiene estado (solo la fija al crearlo), y stopClip no
  // borra ese estado. Por eso mutamos directamente el `loop` del toolState de
  // cine (mismo campo que lee el bucle interno en cada tick). Se usa rAF para
  // correr después de que el contenedor de OHIF haya creado el toolState.
  useEffect(() => {
    const element = elementRef.current;
    if (!isPlaying || isDynamic || !element) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      const toolState = csToolsUtils?.cine?.getToolState?.(element);
      if (toolState) {
        toolState.loop = loop;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, loop, isDynamic]);

  // Con el loop desactivado, cornerstone detiene el clip al llegar al final
  // (evento CLIP_STOPPED, que NO se dispara en pausas/cierres manuales).
  // Sincronizamos el botón play/pausa para que vuelva a "play".
  useEffect(() => {
    const element = elementRef.current;
    if (!isPlaying || !element) {
      return;
    }
    const clipStopped = csToolsUtils?.cine?.Events?.CLIP_STOPPED ?? 'CORNERSTONE_CINE_TOOL_STOPPED';
    const onClipStopped = () => onPlayPauseChange(false);
    element.addEventListener(clipStopped, onClipStopped);
    return () => element.removeEventListener(clipStopped, onClipStopped);
  }, [isPlaying, onPlayPauseChange]);

  const debouncedFrameRateChange = useCallback(debounce(onFrameRateChange, 100), [
    onFrameRateChange,
  ]);

  const handleFrameRate = (value: number) => {
    const clamped = Math.min(Math.max(value, minFrameRate), maxFrameRate);
    setFrameRate(clamped);
    debouncedFrameRateChange(clamped);
  };

  // Timeline: para stack usamos índice/total de frames; para 4D dinámico usamos
  // el número de grupo dimensional.
  const sliderMin = isDynamic ? 1 : 0;
  const sliderMax = isDynamic
    ? Math.max(dynamicInfo?.numDimensionGroups ?? 1, 1)
    : Math.max(sliceData.total - 1, 0);
  const sliderValue = isDynamic
    ? dynamicInfo?.dimensionGroupNumber ?? 1
    : Math.min(sliceData.index, sliderMax);

  const counterText = isDynamic
    ? `${sliderValue} / ${sliderMax}`
    : `${sliceData.total ? sliceData.index + 1 : 0} / ${sliceData.total}`;

  const handleScrub = (value: number) => {
    if (isDynamic && dynamicInfo) {
      updateDynamicInfo?.({ ...dynamicInfo, dimensionGroupNumber: value });
      return;
    }
    // Al arrastrar el timeline pausamos el cine (igual que el scrollbar de stack).
    if (isPlaying) {
      onPlayPauseChange(false);
    }
    const element = elementRef.current;
    if (element) {
      csUtils.jumpToSlice(element, { imageIndex: value, debounceLoading: true });
    }
  };

  const handleLoopToggle = () => {
    setLoop(prev => !prev);
  };

  // Cierre por-viewport. NO usamos el `onClose` heredado del contenedor de OHIF
  // porque hace `setIsCineEnabled(false)` global y cualquier otro viewport en
  // reproducción lo vuelve a activar (la barra "no se cierra"). Aquí cerramos
  // únicamente este viewport y solo apagamos el flag global cuando ya no queda
  // ninguna barra abierta.
  const handleClose = useCallback(() => {
    const vpId = viewportIdRef.current;
    const element = elementRef.current;

    if (element && cineService) {
      cineService.stopClip(element, { viewportId: vpId });
    }
    if (vpId && cineService) {
      cineService.setCine({ id: vpId, isPlaying: false });
      cineService.setViewportCineClosed?.(vpId);
    }
    if (vpId) {
      cineViewportStore.close(vpId);
    }
    if (cineViewportStore.size() === 0) {
      cineService?.setIsCineEnabled(false);
    }
  }, [cineService]);

  // Atajos cuando la barra de cine está visible:
  //  - Space: pausar / reanudar la reproducción de este viewport.
  //  - Esc:   ocultar la barra de cine.
  // Se usa la fase de captura + stopPropagation en Space para "ganarle" al
  // hotkey global (mousetrap) y evitar que se procese dos veces.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // Solo el viewport activo responde a los atajos (puede haber varias barras
      // visibles a la vez).
      if (viewportGridService?.getActiveViewportId?.() !== viewportIdRef.current) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || !!target?.isContentEditable;

      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        if (isTyping) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onPlayPauseChange(!isPlaying);
      } else if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        handleClose();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, isPlaying, onPlayPauseChange, handleClose, viewportGridService]);

  const hasTimeline = isDynamic ? sliderMax > 1 : sliceData.total > 1;

  return (
    // Contenedor a lo ancho del borde inferior; pointer-events-none deja pasar
    // los clics por los márgenes transparentes hacia la imagen.
    <div
      ref={rootRef}
      // pb-10 sube la barra por encima de la fila de controles del viewport
      // (ViewportActionCorners en bottom-[3px], p. ej. el botón de ajustes de
      // ventana), evitando el solape sin importar el tamaño del viewport, y la
      // despega del borde inferior.
      className="pointer-events-none absolute bottom-0 left-0 z-50 w-full px-2 pb-10"
    >
      {/* El contenedor raíz se mantiene montado siempre (necesario para resolver
          el viewportId desde el DOM); la barra solo se muestra si este viewport
          está abierto en el store por-viewport. */}
      {isOpen && (
      <div className="bg-muted/95 text-foreground border-input/50 pointer-events-auto mx-auto flex w-full max-w-3xl select-none items-center gap-1.5 rounded-lg border px-2 py-0.5 shadow-lg backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 [&_svg]:size-4"
          onClick={() => onPlayPauseChange(!isPlaying)}
          data-cy="cine-player-play-pause"
        >
          <Icons.ByName name={isPlaying ? 'icon-pause' : 'icon-play'} />
        </Button>

        <span className="text-muted-foreground w-16 shrink-0 text-center font-mono text-xs tabular-nums">
          {counterText}
        </span>

        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={1}
          value={sliderValue}
          disabled={!hasTimeline}
          onChange={e => handleScrub(Number(e.target.value))}
          className="accent-primary h-1.5 flex-1 cursor-pointer disabled:cursor-default disabled:opacity-40"
          data-cy="cine-player-scrubber"
          aria-label="Posición del cine"
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-6 shrink-0 px-1.5 font-mono text-xs"
              data-cy="cine-player-fps"
            >
              {frameRate} FPS
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="center"
            sideOffset={8}
            className="w-48 p-3"
          >
            <Numeric.Container
              mode="singleRange"
              min={minFrameRate}
              max={maxFrameRate}
              step={stepFrameRate}
              value={frameRate}
              onChange={val => handleFrameRate(val as number)}
            >
              <Numeric.SingleRange showNumberInput={true} />
            </Numeric.Container>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-6 w-6 shrink-0 [&_svg]:size-4',
            loop ? 'text-primary' : 'text-muted-foreground/50'
          )}
          onClick={handleLoopToggle}
          aria-pressed={loop}
          title={loop ? 'Loop activado' : 'Loop desactivado'}
          data-cy="cine-player-loop"
        >
          <Icons.Refresh />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 [&_svg]:size-4"
          onClick={handleClose}
          data-cy="cine-player-close"
        >
          <Icons.Close />
        </Button>
      </div>
      )}
    </div>
  );
};

export default AudioCinePlayer;
