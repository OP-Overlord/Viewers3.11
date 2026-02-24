import { vec3 } from 'gl-matrix';
import {
  AnnotationTool,
  annotation,
  drawing,
  Enums as csToolsEnums,
} from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/core';
import { getEnabledElement } from '@cornerstonejs/core';

const { Events } = csToolsEnums;
const { drawHandles, drawLine } = drawing;
const { state: annotationState } = annotation;

// Tipos internos (solo se usan dentro de los métodos vía casting)
interface ISIData {
  handles: {
    pointsRotula: [Types.Point3, Types.Point3];
    tendonStart: Types.Point3;
    tendonEnd: Types.Point3;
    textBox: {
      hasMoved: boolean;
      worldPosition: Types.Point3;
    };
    activeHandleIndex: number | null;
    activeSegment: 'rotula' | 'tendonStart' | 'tendonEnd' | null;
    [key: string]: unknown;
  };
  cachedStats: {
    lengthRotula?: number;
    lengthTendon?: number;
    index?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export default class InsallSalvatiIndexTool extends AnnotationTool {
  public static toolName = 'InsallSalvatiIndex';

  // Usamos 'any' para evitar conflictos con el tipo editData del base class
  private _editData: {
    annotation: any;
    viewportIdsToRender: string[];
    handleIndex: number;
    newAnnotation: boolean;
    currentSegment: 'rotula' | 'tendonStart' | 'tendonEnd';
    clickCount: number;
    movingTextBox?: boolean;
    isEditingHandle?: boolean;
    hasDragged?: boolean;
  } | null = null;

  private _pendingHandleEdit: {
    annotation: any;
    handleInfo: {
      point: Types.Point3;
      index: number;
      segment: 'rotula' | 'tendonStart' | 'tendonEnd' | 'text';
    };
    element: HTMLDivElement;
    viewportId: string;
  } | null = null;

  private _currentCursorPosition: Types.Point2 | null = null;
  private _textBoxDragOffset: Types.Point3 | null = null;

  constructor(toolProps = {}, defaultToolProps = {}) {
    super(toolProps, {
      supportedInteractionTypes: ['Mouse'],
      configuration: {
        preventHandleOutsideImage: false,
        handleRadius: 6,
        handleVisibilityDistance: 20,
      },
      ...defaultToolProps,
    });
  }

  mouseMoveCallback = (evt: any) => {
    const { currentPoints, element } = evt.detail;
    this._currentCursorPosition = currentPoints.canvas as Types.Point2;
    this._triggerRender(element);
    return false;
  };

  getHandleNearImagePoint(
    element: HTMLDivElement,
    annotation: any,
    canvasCoords: Types.Point2,
    proximity: number
  ): any {
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) return null;

    const { viewport } = enabledElement;
    const d = annotation.data as ISIData;

    // Verificar área de texto
    if (d.handles.textBox?.worldPosition) {
      const canvasTextBox = viewport.worldToCanvas(d.handles.textBox.worldPosition);
      if (
        canvasCoords[0] >= canvasTextBox[0] - 10 &&
        canvasCoords[0] <= canvasTextBox[0] + 200 &&
        canvasCoords[1] >= canvasTextBox[1] - 10 &&
        canvasCoords[1] <= canvasTextBox[1] + 50
      ) {
        return { point: d.handles.textBox.worldPosition, index: -1, segment: 'text' };
      }
    }

    // Handles de la rótula (segmento 1)
    for (let i = 0; i < d.handles.pointsRotula.length; i++) {
      const point = d.handles.pointsRotula[i];
      const canvasPoint = viewport.worldToCanvas(point);
      if (Math.hypot(canvasPoint[0] - canvasCoords[0], canvasPoint[1] - canvasCoords[1]) <= proximity) {
        return { point, index: i, segment: 'rotula' };
      }
    }

    // Handle inicio del tendón
    if (d.handles.tendonStart) {
      const canvasPt = viewport.worldToCanvas(d.handles.tendonStart);
      if (Math.hypot(canvasPt[0] - canvasCoords[0], canvasPt[1] - canvasCoords[1]) <= proximity) {
        return { point: d.handles.tendonStart, index: 0, segment: 'tendonStart' };
      }
    }

    // Handle fin del tendón
    if (d.handles.tendonEnd) {
      const canvasPt = viewport.worldToCanvas(d.handles.tendonEnd);
      if (Math.hypot(canvasPt[0] - canvasCoords[0], canvasPt[1] - canvasCoords[1]) <= proximity) {
        return { point: d.handles.tendonEnd, index: 0, segment: 'tendonEnd' };
      }
    }

    return null;
  }

  isPointNearTool = (
    element: HTMLDivElement,
    annotation: any,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    try {
      const enabledElement = getEnabledElement(element);
      if (!enabledElement) return false;
      const { viewport } = enabledElement;
      const d = annotation.data as ISIData;

      // Área de texto
      if (d.handles.textBox?.worldPosition) {
        const canvasTextBox = viewport.worldToCanvas(d.handles.textBox.worldPosition);
        if (
          canvasCoords[0] >= canvasTextBox[0] - 10 &&
          canvasCoords[0] <= canvasTextBox[0] + 200 &&
          canvasCoords[1] >= canvasTextBox[1] - 10 &&
          canvasCoords[1] <= canvasTextBox[1] + 50
        ) return true;
      }

      // Handles de rótula
      for (const point of d.handles.pointsRotula) {
        const canvasPoint = viewport.worldToCanvas(point);
        if (Math.hypot(canvasPoint[0] - canvasCoords[0], canvasPoint[1] - canvasCoords[1]) <= proximity) return true;
      }

      // Handles del tendón
      for (const point of [d.handles.tendonStart, d.handles.tendonEnd]) {
        if (point) {
          const canvasPt = viewport.worldToCanvas(point);
          if (Math.hypot(canvasPt[0] - canvasCoords[0], canvasPt[1] - canvasCoords[1]) <= proximity) return true;
        }
      }

      // Línea de rótula
      const [r0, r1] = d.handles.pointsRotula;
      if (this._isPointNearLine(canvasCoords, viewport.worldToCanvas(r0), viewport.worldToCanvas(r1), proximity)) return true;

      // Línea del tendón
      if (d.handles.tendonStart && d.handles.tendonEnd) {
        if (this._isPointNearLine(
          canvasCoords,
          viewport.worldToCanvas(d.handles.tendonStart),
          viewport.worldToCanvas(d.handles.tendonEnd),
          proximity
        )) return true;
      }
    } catch (e) {
      console.error('Error en isPointNearTool InsallSalvati:', e);
    }
    return false;
  };

  private _isPointNearLine(
    point: Types.Point2,
    lineStart: Types.Point2,
    lineEnd: Types.Point2,
    proximity: number
  ): boolean {
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) return false;
    const t = Math.max(0, Math.min(1,
      ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (length * length)
    ));
    const projX = lineStart[0] + t * dx;
    const projY = lineStart[1] + t * dy;
    return Math.hypot(point[0] - projX, point[1] - projY) <= proximity;
  }

  handleSelectedCallback = (evt: any, annotation: any, handle: any): void => {
    const { element, currentPoints } = evt.detail;
    const d = annotation.data as ISIData;
    const { viewport } = getEnabledElement(element);
    annotation.highlighted = true;

    if (this._editData?.newAnnotation && this._editData.annotation === annotation) return;

    // Área de texto
    if (d.handles.textBox?.worldPosition) {
      const canvasClick = currentPoints.canvas;
      const canvasTextBox = viewport.worldToCanvas(d.handles.textBox.worldPosition);
      if (
        canvasClick[0] >= canvasTextBox[0] - 10 &&
        canvasClick[0] <= canvasTextBox[0] + 200 &&
        canvasClick[1] >= canvasTextBox[1] - 10 &&
        canvasClick[1] <= canvasTextBox[1] + 50
      ) {
        this._editData = {
          annotation,
          viewportIdsToRender: [evt.detail.viewportId || ''],
          handleIndex: -1,
          newAnnotation: false,
          currentSegment: 'rotula',
          clickCount: 3,
          movingTextBox: true,
          isEditingHandle: true,
        };
        this._activateDraw(element);
        this._triggerRender(element);
        return;
      }
    }

    if (handle) {
      const rotulaIdx = d.handles.pointsRotula.findIndex(p =>
        p === handle || (Array.isArray(handle) && p[0] === handle[0] && p[1] === handle[1] && p[2] === handle[2])
      );
      if (rotulaIdx !== -1) {
        d.handles.activeHandleIndex = rotulaIdx;
        d.handles.activeSegment = 'rotula';
        this._editData = {
          annotation,
          viewportIdsToRender: [evt.detail.viewportId || ''],
          handleIndex: rotulaIdx,
          newAnnotation: false,
          currentSegment: 'rotula',
          clickCount: 3,
          isEditingHandle: true,
        };
        this._activateDraw(element);
      } else if (d.handles.tendonStart && (
        d.handles.tendonStart === handle ||
        (Array.isArray(handle) && d.handles.tendonStart[0] === handle[0] && d.handles.tendonStart[1] === handle[1] && d.handles.tendonStart[2] === handle[2])
      )) {
        d.handles.activeHandleIndex = 0;
        d.handles.activeSegment = 'tendonStart';
        this._editData = {
          annotation,
          viewportIdsToRender: [evt.detail.viewportId || ''],
          handleIndex: 0,
          newAnnotation: false,
          currentSegment: 'tendonStart',
          clickCount: 3,
          isEditingHandle: true,
        };
        this._activateDraw(element);
      } else if (d.handles.tendonEnd && (
        d.handles.tendonEnd === handle ||
        (Array.isArray(handle) && d.handles.tendonEnd[0] === handle[0] && d.handles.tendonEnd[1] === handle[1] && d.handles.tendonEnd[2] === handle[2])
      )) {
        d.handles.activeHandleIndex = 0;
        d.handles.activeSegment = 'tendonEnd';
        this._editData = {
          annotation,
          viewportIdsToRender: [evt.detail.viewportId || ''],
          handleIndex: 0,
          newAnnotation: false,
          currentSegment: 'tendonEnd',
          clickCount: 3,
          isEditingHandle: true,
        };
        this._activateDraw(element);
      }
    }
    this._triggerRender(element);
  };

  toolSelectedCallback = (evt: any, annotation: any): void => {
    const d = annotation.data as ISIData;
    this._calculateStats(annotation);
    d.handles.activeHandleIndex = null;
    d.handles.activeSegment = null;
    annotation.highlighted = false;
    if (this._editData && !this._editData.newAnnotation) {
      this._deactivateDraw(evt.detail.element);
      this._editData = null;
    }
    this._triggerRender(evt.detail.element);
  };

  addNewAnnotation = (evt: any): any => {
    if (this._editData) return this._editData.annotation;

    const { element, currentPoints } = evt.detail;
    const canvasCoords = currentPoints.canvas as Types.Point2;

    const existingAnnotations = annotationState.getAnnotations(this.getToolName(), element);

    if (existingAnnotations?.length) {
      for (const existingAnnotation of existingAnnotations) {
        const handleInfo = this.getHandleNearImagePoint(
          element,
          existingAnnotation,
          canvasCoords,
          this.configuration.handleRadius + 5
        );
        if (handleInfo) {
          this._pendingHandleEdit = {
            annotation: existingAnnotation,
            handleInfo,
            element,
            viewportId: evt.detail.viewportId || '',
          };
          this._activateDraw(element);
          evt.preventDefault();
          return existingAnnotation;
        }
      }
    }

    const worldPos = currentPoints.world as Types.Point3;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();
    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;
    const currentImageId = viewport.getCurrentImageId?.();

    const newAnnotation: any = {
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        FrameOfReferenceUID,
        viewPlaneNormal: [...viewPlaneNormal] as Types.Point3,
        viewUp: [...viewUp] as Types.Point3,
        referencedImageId: currentImageId,
        ...viewport.getViewReference({ points: [worldPos] }),
      },
      data: {
        handles: {
          pointsRotula: [[...worldPos] as Types.Point3, [...worldPos] as Types.Point3],
          tendonStart: [...worldPos] as Types.Point3,
          tendonEnd: [...worldPos] as Types.Point3,
          textBox: { hasMoved: false, worldPosition: [...worldPos] as Types.Point3 },
          activeHandleIndex: 1,
          activeSegment: 'rotula',
        },
        cachedStats: {},
      },
    };

    annotationState.addAnnotation(newAnnotation, element);
    this._editData = {
      annotation: newAnnotation,
      viewportIdsToRender: [viewport.id],
      handleIndex: 1,
      newAnnotation: true,
      currentSegment: 'rotula',
      clickCount: 0,
      isEditingHandle: false,
    };
    this._activateDraw(element);
    evt.preventDefault();
    return newAnnotation;
  };

  private _mouseDownCallback = (evt: any) => {
    if (!this._editData) return;
    const { annotation, clickCount, isEditingHandle, hasDragged } = this._editData;
    const { currentPoints, element } = evt.detail;
    const worldPos = currentPoints.world as Types.Point3;
    const d = annotation.data as ISIData;

    // Modo edición handle
    if (isEditingHandle && !hasDragged) {
      const { activeSegment, activeHandleIndex } = d.handles;
      if (activeSegment === 'rotula' && activeHandleIndex !== null) {
        d.handles.pointsRotula[activeHandleIndex as number] = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'tendonStart') {
        d.handles.tendonStart = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'tendonEnd') {
        d.handles.tendonEnd = [...worldPos] as Types.Point3;
      } else if (this._editData.movingTextBox) {
        d.handles.textBox.worldPosition = [...worldPos] as Types.Point3;
        d.handles.textBox.hasMoved = true;
      }
      this._calculateStats(annotation);
      if (!this._editData.movingTextBox && !d.handles.textBox.hasMoved) {
        this._updateTextBoxPosition(annotation);
      }
      d.handles.activeHandleIndex = null;
      d.handles.activeSegment = null;
      annotation.highlighted = false;
      this._deactivateDraw(element);
      this._triggerRender(element);
      this._editData = null;
      evt.preventDefault();
      return;
    }

    if (isEditingHandle && hasDragged) {
      evt.preventDefault();
      return;
    }

    // Flujo de creación (4 clicks)
    // Click 1 (addNewAnnotation): fija pointsRotula[0]
    // Click 2 (clickCount=0):      fija pointsRotula[1]
    // Click 3 (clickCount=1):      fija tendonStart
    // Click 4 (clickCount=2):      fija tendonEnd → finaliza
    if (clickCount === 0) {
      d.handles.pointsRotula[1] = [...worldPos] as Types.Point3;
      this._editData.clickCount = 1;
      this._editData.currentSegment = 'tendonStart';
      d.handles.activeSegment = 'tendonStart';
      d.handles.activeHandleIndex = 0;
      d.handles.tendonStart = [...worldPos] as Types.Point3;
      d.handles.tendonEnd = [...worldPos] as Types.Point3;
      annotation.invalidated = true;
      this._calculateStats(annotation);
      this._updateTextBoxPosition(annotation);
    } else if (clickCount === 1) {
      d.handles.tendonStart = [...worldPos] as Types.Point3;
      d.handles.tendonEnd = [...worldPos] as Types.Point3;
      this._editData.clickCount = 2;
      this._editData.currentSegment = 'tendonEnd';
      d.handles.activeSegment = 'tendonEnd';
      d.handles.activeHandleIndex = 0;
      annotation.invalidated = true;
      this._calculateStats(annotation);
    } else if (clickCount === 2) {
      d.handles.tendonEnd = [...worldPos] as Types.Point3;
      annotation.invalidated = true;
      this._calculateStats(annotation);
      this._updateTextBoxPosition(annotation);
      d.handles.activeHandleIndex = null;
      d.handles.activeSegment = null;
      this._endDrawing(evt);
    }
    evt.preventDefault();
  };

  private _mouseUpCallback = (evt: any) => {
    const { element } = evt.detail;

    if (this._pendingHandleEdit && !this._editData) {
      const { annotation, handleInfo, viewportId } = this._pendingHandleEdit;
      const d = annotation.data as ISIData;
      annotation.highlighted = true;

      if (handleInfo.segment === 'text') {
        this._editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: -1,
          newAnnotation: false,
          currentSegment: 'rotula',
          clickCount: 3,
          movingTextBox: true,
          isEditingHandle: true,
          hasDragged: false,
        };
      } else {
        if (handleInfo.segment === 'rotula') {
          d.handles.activeHandleIndex = handleInfo.index;
          d.handles.activeSegment = 'rotula';
        } else {
          d.handles.activeHandleIndex = 0;
          d.handles.activeSegment = handleInfo.segment as 'tendonStart' | 'tendonEnd';
        }
        this._editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: handleInfo.index,
          newAnnotation: false,
          currentSegment: handleInfo.segment as 'rotula' | 'tendonStart' | 'tendonEnd',
          clickCount: 3,
          isEditingHandle: true,
          hasDragged: false,
        };
      }
      this._pendingHandleEdit = null;
      this._triggerRender(element);
      evt.preventDefault();
      return;
    }

    if (!this._editData) return;
    const { annotation, isEditingHandle, hasDragged, movingTextBox } = this._editData;

    if (isEditingHandle && hasDragged) {
      const d = annotation.data as ISIData;
      this._calculateStats(annotation);
      if (!movingTextBox && !d.handles.textBox.hasMoved) this._updateTextBoxPosition(annotation);
      d.handles.activeHandleIndex = null;
      d.handles.activeSegment = null;
      annotation.highlighted = false;
      this._deactivateDraw(element);
      this._triggerRender(element);
      this._editData = null;
      this._textBoxDragOffset = null;
    }
    evt.preventDefault();
  };

  private _dragCallback = (evt: any) => {
    const { currentPoints, element } = evt.detail;
    const worldPos = currentPoints.world as Types.Point3;
    const isDragging = evt.type === Events.MOUSE_DRAG;

    if (this._pendingHandleEdit && !this._editData && isDragging) {
      const { annotation, handleInfo, viewportId } = this._pendingHandleEdit;
      const d = annotation.data as ISIData;
      annotation.highlighted = true;

      if (handleInfo.segment === 'text') {
        this._editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: -1,
          newAnnotation: false,
          currentSegment: 'rotula',
          clickCount: 3,
          movingTextBox: true,
          isEditingHandle: true,
          hasDragged: true,
        };
      } else {
        if (handleInfo.segment === 'rotula') {
          d.handles.activeHandleIndex = handleInfo.index;
          d.handles.activeSegment = 'rotula';
        } else {
          d.handles.activeHandleIndex = 0;
          d.handles.activeSegment = handleInfo.segment as 'tendonStart' | 'tendonEnd';
        }
        this._editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: handleInfo.index,
          newAnnotation: false,
          currentSegment: handleInfo.segment as 'rotula' | 'tendonStart' | 'tendonEnd',
          clickCount: 3,
          isEditingHandle: true,
          hasDragged: true,
        };
      }
      this._pendingHandleEdit = null;
      this._triggerRender(element);
    }

    if (!this._editData) return;
    const { annotation, clickCount, movingTextBox, isEditingHandle } = this._editData;
    const d = annotation.data as ISIData;

    if (movingTextBox) {
      if (isDragging) this._editData.hasDragged = true;
      if (!this._textBoxDragOffset) {
        const currentTextPos = d.handles.textBox.worldPosition;
        this._textBoxDragOffset = [
          currentTextPos[0] - worldPos[0],
          currentTextPos[1] - worldPos[1],
          currentTextPos[2] - worldPos[2],
        ] as Types.Point3;
      }
      d.handles.textBox.worldPosition = [
        worldPos[0] + this._textBoxDragOffset[0],
        worldPos[1] + this._textBoxDragOffset[1],
        worldPos[2] + this._textBoxDragOffset[2],
      ] as Types.Point3;
      d.handles.textBox.hasMoved = true;
      this._triggerRender(element);
      evt.preventDefault();
      return;
    }

    if (isEditingHandle && !this._editData.newAnnotation) {
      if (isDragging) this._editData.hasDragged = true;
      const { activeSegment, activeHandleIndex } = d.handles;
      if (activeSegment === 'rotula' && activeHandleIndex !== null) {
        d.handles.pointsRotula[activeHandleIndex as number] = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'tendonStart') {
        d.handles.tendonStart = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'tendonEnd') {
        d.handles.tendonEnd = [...worldPos] as Types.Point3;
      }
      annotation.invalidated = true;
      this._calculateStats(annotation);
      if (!d.handles.textBox.hasMoved) this._updateTextBoxPosition(annotation);
      this._triggerRender(element);
      evt.preventDefault();
      return;
    }

    // Flujo de creación
    if (clickCount === 0) {
      d.handles.pointsRotula[1] = [...worldPos] as Types.Point3;
    } else if (clickCount === 1) {
      d.handles.tendonStart = [...worldPos] as Types.Point3;
      d.handles.tendonEnd = [...worldPos] as Types.Point3;
    } else if (clickCount === 2) {
      d.handles.tendonEnd = [...worldPos] as Types.Point3;
    }
    annotation.invalidated = true;
    this._calculateStats(annotation);
    if (!d.handles.textBox.hasMoved) this._updateTextBoxPosition(annotation);
    this._triggerRender(element);
    evt.preventDefault();
  };

  private _updateTextBoxPosition(annotation: any) {
    const d = annotation.data as ISIData;
    const midRotula = vec3.lerp(
      vec3.create(),
      d.handles.pointsRotula[0],
      d.handles.pointsRotula[1],
      0.5
    ) as Types.Point3;
    const offset = vec3.fromValues(20, -30, 0);
    d.handles.textBox.worldPosition = vec3.add(vec3.create(), midRotula, offset) as Types.Point3;
  }

  private _calculateStats(annotation: any) {
    const d = annotation.data as ISIData;
    const [r0, r1] = d.handles.pointsRotula;
    const lengthRotula = vec3.distance(r0, r1);
    const lengthTendon = vec3.distance(d.handles.tendonStart, d.handles.tendonEnd);
    const index = lengthRotula > 0 ? lengthTendon / lengthRotula : 0;
    d.cachedStats = { lengthRotula, lengthTendon, index };
  }

  private _endDrawing = (evt: any) => {
    if (!this._editData) return;
    const { element } = evt.detail;
    this._deactivateDraw(element);
    this._editData.annotation.highlighted = false;
    this._triggerRender(element);
    this._editData = null;
  };

  private _activateDraw(element: HTMLDivElement) {
    element.addEventListener(Events.MOUSE_DOWN, this._mouseDownCallback);
    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.addEventListener(Events.MOUSE_MOVE, this._dragCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragCallback);
  }

  private _deactivateDraw(element: HTMLDivElement) {
    element.removeEventListener(Events.MOUSE_DOWN, this._mouseDownCallback);
    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.removeEventListener(Events.MOUSE_MOVE, this._dragCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragCallback);
  }

  private _triggerRender(element: HTMLDivElement) {
    try {
      const enabledElement = getEnabledElement(element);
      enabledElement.viewport.render();
    } catch (error) {
      console.error('Error al renderizar InsallSalvati:', error);
    }
  }

  renderAnnotation = (enabledElement: any, svgDrawingHelper: any): boolean => {
    const { viewport } = enabledElement;
    const { element } = viewport;

    const allAnnotations = annotationState.getAnnotations(this.getToolName(), element);
    const currentImageId = viewport.getCurrentImageId?.();
    const svgLayer = svgDrawingHelper.svgLayerElement;

    // Limpiar textos de anotaciones de otros slices
    if (allAnnotations?.length && svgLayer) {
      for (const ann of allAnnotations) {
        const referencedImageId = (ann as any).metadata?.referencedImageId;
        if (referencedImageId && currentImageId && referencedImageId !== currentImageId) {
          svgLayer
            .querySelectorAll(`[data-annotation-uid="${(ann as any).annotationUID}"][data-text-line]`)
            .forEach((el: Element) => el.remove());
        }
      }
    }

    if (!allAnnotations?.length) return false;
    const annotations = this.filterInteractableAnnotationsForElement(element, allAnnotations);
    if (!annotations?.length) return false;

    for (const ann of annotations) {
      const referencedImageId = (ann as any).metadata?.referencedImageId;
      if (referencedImageId && currentImageId && referencedImageId !== currentImageId) continue;

      const annotationUID = (ann as any).annotationUID as string;
      const d = (ann as any).data as ISIData;
      const highlighted = (ann as any).highlighted;
      const handleRadius = this.configuration.handleRadius;
      const handleVisibilityDistance = this.configuration.handleVisibilityDistance || 20;

      const isCursorNearPoint = (canvasPoint: Types.Point2): boolean => {
        if (!this._currentCursorPosition) return false;
        return Math.hypot(
          canvasPoint[0] - this._currentCursorPosition[0],
          canvasPoint[1] - this._currentCursorPosition[1]
        ) <= handleVisibilityDistance;
      };

      // Determinar estado de creación y paso actual
      const isNewAnnotation =
        this._editData?.newAnnotation && this._editData?.annotation?.annotationUID === annotationUID;
      const creationClickCount = isNewAnnotation ? (this._editData?.clickCount ?? 0) : 999;

      // ===== SEGMENTO 1: RÓTULA (CYAN) =====
      const [r0, r1] = d.handles.pointsRotula;
      const canvasR0 = viewport.worldToCanvas(r0);
      const canvasR1 = viewport.worldToCanvas(r1);
      const isR0Active = d.handles.activeSegment === 'rotula' && d.handles.activeHandleIndex === 0;
      const isR1Active = d.handles.activeSegment === 'rotula' && d.handles.activeHandleIndex === 1;

      if (isCursorNearPoint(canvasR0) || isR0Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID, 'handle-rotula-0', [canvasR0], {
          color: isR0Active ? 'lime' : 'cyan',
          handleRadius,
        });
      }
      if (isCursorNearPoint(canvasR1) || isR1Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID, 'handle-rotula-1', [canvasR1], {
          color: isR1Active ? 'lime' : 'cyan',
          handleRadius,
        });
      }
      drawLine(svgDrawingHelper, annotationUID, 'segment-rotula', canvasR0, canvasR1, {
        color: 'cyan',
        lineWidth: 1.5,
        lineDash: [5, 5],
      });

      // Etiqueta segmento rótula (siempre visible cuando el segmento existe)
      const midRotulaCanvas = [
        (canvasR0[0] + canvasR1[0]) / 2,
        (canvasR0[1] + canvasR1[1]) / 2,
      ] as Types.Point2;
      this._drawSegmentLabel(svgDrawingHelper, annotationUID, 'label-rotula', 'Rótula', midRotulaCanvas, 'cyan');

      // ===== SEGMENTO 2: TENDÓN ROTULIANO (MAGENTA) =====
      // Solo se renderiza a partir del tercer click (clickCount >= 2) durante la creación
      if (d.handles.tendonStart && d.handles.tendonEnd && creationClickCount >= 2) {
        const canvasTS = viewport.worldToCanvas(d.handles.tendonStart);
        const canvasTE = viewport.worldToCanvas(d.handles.tendonEnd);
        const isTSActive = d.handles.activeSegment === 'tendonStart';
        const isTEActive = d.handles.activeSegment === 'tendonEnd';

        if (isCursorNearPoint(canvasTS) || isTSActive || highlighted) {
          drawHandles(svgDrawingHelper, annotationUID, 'handle-tendon-start', [canvasTS], {
            color: isTSActive ? 'lime' : '#FF00FF',
            handleRadius,
          });
        }
        if (isCursorNearPoint(canvasTE) || isTEActive || highlighted) {
          drawHandles(svgDrawingHelper, annotationUID, 'handle-tendon-end', [canvasTE], {
            color: isTEActive ? 'lime' : '#FF00FF',
            handleRadius,
          });
        }
        drawLine(svgDrawingHelper, annotationUID, 'segment-tendon', canvasTS, canvasTE, {
          color: '#FF00FF',
          lineWidth: 1.5,
          lineDash: [5, 5],
        });

        const midTendonCanvas = [
          (canvasTS[0] + canvasTE[0]) / 2,
          (canvasTS[1] + canvasTE[1]) / 2,
        ] as Types.Point2;
        this._drawSegmentLabel(svgDrawingHelper, annotationUID, 'label-tendon', 'Tendón', midTendonCanvas, '#FF00FF');
      }

      // ===== TEXTO DE RESULTADO =====
      const { lengthRotula, lengthTendon, index } = d.cachedStats || {};

      if (
        !isNewAnnotation &&
        d.handles.textBox?.worldPosition &&
        lengthRotula !== undefined &&
        lengthTendon !== undefined &&
        index !== undefined
      ) {
        const textCanvas = viewport.worldToCanvas(d.handles.textBox.worldPosition);
        const textLines = [
          `Rótula: ${(lengthRotula as number).toFixed(1)} mm`,
          `Tendón: ${(lengthTendon as number).toFixed(1)} mm`,
          `I. Insall-Salvati: ${(index as number).toFixed(2)}`,
        ];
        const lineHeight = 14;
        const svgns = 'http://www.w3.org/2000/svg';

        if (svgLayer) {
          svgLayer
            .querySelectorAll(`[data-annotation-uid="${annotationUID}"][data-text-line]`)
            .forEach((el: Element) => el.remove());
        }

        textLines.forEach((line, idx) => {
          const textEl = document.createElementNS(svgns, 'text');
          textEl.setAttribute('x', String(textCanvas[0]));
          textEl.setAttribute('y', String(textCanvas[1] + idx * lineHeight));
          textEl.setAttribute('fill', 'rgb(0, 255, 0)');
          textEl.setAttribute('font-size', '14px');
          textEl.setAttribute('font-family', 'Helvetica Neue, Helvetica, Arial, sans-serif');
          textEl.setAttribute('text-anchor', 'start');
          textEl.setAttribute('data-annotation-uid', annotationUID);
          textEl.setAttribute('data-text-line', String(idx));
          textEl.setAttribute(
            'style',
            'text-shadow: 1px 1px 0px rgba(0,0,0,0.8), -1px -1px 0px rgba(0,0,0,0.8), 1px -1px 0px rgba(0,0,0,0.8), -1px 1px 0px rgba(0,0,0,0.8); pointer-events: none;'
          );
          textEl.textContent = line;
          svgLayer?.appendChild(textEl);
        });
      }
    }
    return true;
  };

  private _drawSegmentLabel(
    svgDrawingHelper: any,
    annotationUID: string,
    key: string,
    text: string,
    canvasPos: Types.Point2,
    color: string
  ) {
    const svgLayer = svgDrawingHelper.svgLayerElement;
    if (!svgLayer) return;

    svgLayer
      .querySelectorAll(`[data-annotation-uid="${annotationUID}"][data-segment-label="${key}"]`)
      .forEach((el: Element) => el.remove());

    const svgns = 'http://www.w3.org/2000/svg';
    const textEl = document.createElementNS(svgns, 'text');
    textEl.setAttribute('x', String(canvasPos[0] + 6));
    textEl.setAttribute('y', String(canvasPos[1] - 6));
    textEl.setAttribute('fill', color);
    textEl.setAttribute('font-size', '12px');
    textEl.setAttribute('font-family', 'Helvetica Neue, Helvetica, Arial, sans-serif');
    textEl.setAttribute('text-anchor', 'start');
    textEl.setAttribute('data-annotation-uid', annotationUID);
    textEl.setAttribute('data-segment-label', key);
    textEl.setAttribute(
      'style',
      'text-shadow: 1px 1px 0px rgba(0,0,0,0.8), -1px -1px 0px rgba(0,0,0,0.8), 1px -1px 0px rgba(0,0,0,0.8), -1px 1px 0px rgba(0,0,0,0.8); pointer-events: none;'
    );
    textEl.textContent = text;
    svgLayer.appendChild(textEl);
  }

  cancel = (element: HTMLDivElement) => {
    if (this._editData) {
      annotationState.removeAnnotation(this._editData.annotation.annotationUID);
      this._deactivateDraw(element);
      this._triggerRender(element);
      this._editData = null;
    }
  };
}
