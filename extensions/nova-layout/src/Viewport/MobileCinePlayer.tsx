import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Enums, utilities as csUtils, VolumeViewport3D } from '@cornerstonejs/core';
import { utilities as csToolsUtils } from '@cornerstonejs/tools';
import { Button, Icons, Numeric, Popover, PopoverContent, PopoverTrigger, cn } from '@ohif/ui-next';
import { mobileCineStore } from './mobileCineStore';

/**
 * MobileCinePlayer — réplica del `AudioCinePlayer` (extensión nova-cine, desktop)
 * adaptada al modo móvil.
 *
 * A diferencia del desktop, el modo móvil usa `MobileViewportV2` (no envuelve
 * `OHIFCornerstoneViewport`), por lo que NO existe el contenedor `WrappedCinePlayer`
 * de la extensión cornerstone que orquesta la reproducción. Este componente es
 * SELF-CONTAINED: recibe `viewportId`/`servicesManager` por props, resuelve el
 * elemento cornerstone y dispara él mismo `cineService.playClip/stopClip`.
 *
 * Visibilidad y arranque:
 *  - Auto-reproduce en US/RF/XA (prop `autoPlay`): al montar para esa serie, abre
 *    la barra y empieza a reproducir.
 *  - On-demand para el resto: el botón "Cine" de la toolbar alterna la barra vía
 *    `mobileCineStore` (comando `novaMobileToggleCine`).
 * Solo se monta cuando la serie es multiframe (`MobileViewportV2` lo decide).
 */

interface MobileCinePlayerProps {
  viewportId: string;
  servicesManager: any;
  /** FPS inicial (derivado de displaySet.FrameRate por MobileViewportV2). */
  frameRate?: number;
  /** Modalidades de cine (US/RF/XA) → arranca solo. */
  autoPlay?: boolean;
}

const MIN_FPS = 1;
const MAX_FPS = 60;

const MobileCinePlayer: React.FC<MobileCinePlayerProps> = ({
  viewportId,
  servicesManager,
  frameRate: frameRateProp = 24,
  autoPlay = false,
}) => {
  const { cineService, cornerstoneViewportService } = servicesManager?.services ?? {};

  // Visibilidad gobernada por el store compartido (toolbar + autoplay).
  const [visible, setVisible] = useState<boolean>(() => mobileCineStore.isVisible());
  const [isPlaying, setIsPlaying] = useState(false);
  const [frameRate, setFrameRate] = useState(frameRateProp);
  const [loop, setLoop] = useState(true);
  const [sliceData, setSliceData] = useState({ index: 0, total: 0 });
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [resolveTick, setResolveTick] = useState(0);

  const loopRef = useRef(loop);
  loopRef.current = loop;

  useEffect(() => {
    setFrameRate(frameRateProp);
  }, [frameRateProp]);

  // ── Suscripción al store de visibilidad (PRIMERO, para no perder el emit del
  //    autoplay que ocurre en el efecto de montaje de abajo). sync() lee el valor
  //    actual del store al montar, así que el orden de los efectos no importa.
  useEffect(() => {
    const sync = () => setVisible(mobileCineStore.isVisible());
    const unsub = mobileCineStore.subscribe(sync);
    sync();
    return unsub;
  }, []);

  // ── Reset por serie: autoplay en US/RF/XA, oculto en el resto. Al desmontar
  //    (cambio de serie) se cierra para no arrastrar estado.
  useEffect(() => {
    mobileCineStore.set(autoPlay);
    return () => mobileCineStore.set(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resolver el viewport cornerstone → elemento + datos de slice. El viewport
  //    puede no estar listo en el primer render: reintento acotado.
  useEffect(() => {
    if (!cornerstoneViewportService) {
      return;
    }
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!viewport || viewport instanceof VolumeViewport3D) {
      if (resolveTick < 10) {
        const t = setTimeout(() => setResolveTick(v => v + 1), 150);
        return () => clearTimeout(t);
      }
      return;
    }

    const el = viewport.element as HTMLDivElement;
    setElement(el);

    const readSlice = () => {
      try {
        setSliceData({
          index: viewport.getCurrentImageIdIndex(),
          total: viewport.getNumberOfSlices(),
        });
      } catch (_e) {
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

    el.addEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);
    return () => el.removeEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);
  }, [cornerstoneViewportService, viewportId, resolveTick]);

  // ── Abrir la barra ⇒ reproducir; cerrarla ⇒ pausar. El play/pausa interno
  //    (botón) no cambia `visible`, solo `isPlaying`.
  useEffect(() => {
    setIsPlaying(visible);
  }, [visible]);

  // ── Reproducción real: playClip/stopClip sobre el elemento cornerstone. El
  //    loop se pasa al crear el clip y se mantiene vivo en el efecto de abajo.
  useEffect(() => {
    if (!element || !cineService) {
      return;
    }
    if (visible && isPlaying) {
      const fps = Math.min(Math.max(frameRate, MIN_FPS), MAX_FPS);
      cineService.playClip(element, { framesPerSecond: fps, loop: loopRef.current, viewportId });
    } else {
      cineService.stopClip(element, { viewportId });
    }
    return () => {
      try {
        cineService.stopClip(element, { viewportId });
      } catch (_e) {
        // ignore
      }
    };
  }, [element, visible, isPlaying, frameRate, cineService, viewportId]);

  // ── Loop "en vivo": cornerstone NO actualiza la opción `loop` al re-llamar
  //    playClip si el clip ya existe (solo la fija al crearlo). Mutamos el campo
  //    del toolState de cine directamente (mismo que lee el bucle en cada tick).
  useEffect(() => {
    if (!element || !isPlaying) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      const toolState = csToolsUtils?.cine?.getToolState?.(element);
      if (toolState) {
        toolState.loop = loop;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [element, isPlaying, loop]);

  // ── Con loop desactivado, cornerstone detiene el clip al llegar al final
  //    (CLIP_STOPPED, que NO se dispara en pausas/cierres manuales). Sincronizamos
  //    el botón play/pausa a "play".
  useEffect(() => {
    if (!element || !isPlaying) {
      return;
    }
    const clipStopped =
      csToolsUtils?.cine?.Events?.CLIP_STOPPED ?? 'CORNERSTONE_CINE_TOOL_STOPPED';
    const onClipStopped = () => setIsPlaying(false);
    element.addEventListener(clipStopped, onClipStopped);
    return () => element.removeEventListener(clipStopped, onClipStopped);
  }, [element, isPlaying]);

  const handleFrameRate = (value: number) => {
    setFrameRate(Math.min(Math.max(value, MIN_FPS), MAX_FPS));
  };

  const handleScrub = (value: number) => {
    if (isPlaying) {
      setIsPlaying(false);
    }
    if (element) {
      csUtils.jumpToSlice(element, { imageIndex: value, debounceLoading: true });
    }
  };

  const handleClose = useCallback(() => {
    mobileCineStore.set(false);
  }, []);

  const sliderMax = Math.max(sliceData.total - 1, 0);
  const sliderValue = Math.min(sliceData.index, sliderMax);
  const counterText = `${sliceData.total ? sliceData.index + 1 : 0} / ${sliceData.total}`;
  const hasTimeline = sliceData.total > 1;

  if (!visible) {
    return null;
  }

  return (
    // Contenedor a lo ancho del borde inferior; pointer-events-none deja pasar los
    // toques por los márgenes transparentes hacia la imagen.
    <div className="pointer-events-none absolute bottom-0 left-0 z-50 w-full px-2 pb-2">
      <div className="bg-muted/95 text-foreground border-input/50 pointer-events-auto mx-auto flex w-full max-w-xl select-none items-center gap-2 rounded-lg border px-2 py-1 shadow-lg backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 [&_svg]:size-5"
          onClick={() => setIsPlaying(p => !p)}
          data-cy="mobile-cine-play-pause"
        >
          <Icons.ByName name={isPlaying ? 'icon-pause' : 'icon-play'} />
        </Button>

        <span className="text-muted-foreground w-14 shrink-0 whitespace-nowrap text-center font-mono text-[9px] leading-none tabular-nums">
          {counterText}
        </span>

        <input
          type="range"
          min={0}
          max={sliderMax}
          step={1}
          value={sliderValue}
          disabled={!hasTimeline}
          onChange={e => handleScrub(Number(e.target.value))}
          className="accent-primary h-2 flex-1 cursor-pointer disabled:cursor-default disabled:opacity-40"
          data-cy="mobile-cine-scrubber"
          aria-label="Posición del cine"
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-8 shrink-0 px-2 font-mono text-xs"
              data-cy="mobile-cine-fps"
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
              min={MIN_FPS}
              max={MAX_FPS}
              step={1}
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
            'h-8 w-8 shrink-0 [&_svg]:size-5',
            loop ? 'text-primary' : 'text-muted-foreground/50'
          )}
          onClick={() => setLoop(prev => !prev)}
          aria-pressed={loop}
          title={loop ? 'Loop activado' : 'Loop desactivado'}
          data-cy="mobile-cine-loop"
        >
          <Icons.Refresh />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 [&_svg]:size-5"
          onClick={handleClose}
          data-cy="mobile-cine-close"
        >
          <Icons.Close />
        </Button>
      </div>
    </div>
  );
};

export default MobileCinePlayer;
