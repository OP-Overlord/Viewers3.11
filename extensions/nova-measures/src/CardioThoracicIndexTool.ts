import { vec3 } from 'gl-matrix';
import {
  AnnotationTool,
  annotation,
  drawing,
  Types as CstTypes,
  Enums as csToolsEnums,
} from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/core';
import { getEnabledElement } from '@cornerstonejs/core';

const { Events } = csToolsEnums;
const { drawHandles, drawLine } = drawing;
const { state: annotationState } = annotation;

interface CTIData {
  handles: {
    pointsC: [Types.Point3, Types.Point3]; // Diámetro torácico
    pointA: Types.Point3; // Punto externo del segmento A (borde izquierdo del corazón)
    pointB: Types.Point3; // Punto externo del segmento B (borde derecho del corazón)
    textBox: {
      hasMoved: boolean;
      worldPosition: Types.Point3;
    };
    activeHandleIndex: number | null;
    activeSegment: 'C' | 'A' | 'B' | null;
  };
  cachedStats: {
    C?: number;
    A?: number;
    B?: number;
    AB?: number;
    CTI?: number;
    midPoint?: Types.Point3;
    midLineTop?: Types.Point3;
    midLineBottom?: Types.Point3;
    projectionA?: Types.Point3; // Punto donde A intersecta la línea media
    projectionB?: Types.Point3; // Punto donde B intersecta la línea media
  };
}

interface CTIAnnotation {
  annotationUID?: string;
  highlighted: boolean;
  invalidated: boolean;
  metadata: {
    toolName: string;
    FrameOfReferenceUID: string;
    viewPlaneNormal: number[];
    viewUp: number[];
    [key: string]: any;
  };
  data: CTIData;
}

export default class CardioThoracicIndexTool extends AnnotationTool {
  public static toolName = 'CardioThoracicIndex';

  private editData: {
    annotation: CTIAnnotation;
    viewportIdsToRender: string[];
    handleIndex: number;
    newAnnotation: boolean;
    currentSegment: 'C' | 'A' | 'B';
    clickCount: number;
    movingTextBox?: boolean;
    isEditingHandle?: boolean;
    hasDragged?: boolean;
  } | null = null;

  private _pendingHandleEdit: {
    annotation: CTIAnnotation;
    handleInfo: { point: Types.Point3; index: number; segment: 'C' | 'A' | 'B' | 'text' };
    element: HTMLDivElement;
    viewportId: string;
  } | null = null;

  private _currentCursorPosition: Types.Point2 | null = null;

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
    annotation: CTIAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): { point: Types.Point3; index: number; segment: 'C' | 'A' | 'B' | 'text' } | null {
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) return null;

    const { viewport } = enabledElement;
    const data = annotation.data as CTIData;

    // Verificar área de texto
    if (data.handles.textBox && data.handles.textBox.worldPosition) {
      const canvasTextBox = viewport.worldToCanvas(data.handles.textBox.worldPosition);
      const textWidth = 180;
      const textHeight = 50;

      const isInTextArea =
        canvasCoords[0] >= canvasTextBox[0] - 10 &&
        canvasCoords[0] <= canvasTextBox[0] + textWidth &&
        canvasCoords[1] >= canvasTextBox[1] - 10 &&
        canvasCoords[1] <= canvasTextBox[1] + textHeight;

      if (isInTextArea) {
        return { point: data.handles.textBox.worldPosition, index: -1, segment: 'text' };
      }
    }

    // Verificar handles del segmento C
    for (let i = 0; i < data.handles.pointsC.length; i++) {
      const point = data.handles.pointsC[i];
      const canvasPoint = viewport.worldToCanvas(point);
      const distance = Math.hypot(
        canvasPoint[0] - canvasCoords[0],
        canvasPoint[1] - canvasCoords[1]
      );
      if (distance <= proximity) {
        return { point, index: i, segment: 'C' };
      }
    }

    // Verificar handle del punto A (externo izquierdo)
    if (data.handles.pointA) {
      const canvasPointA = viewport.worldToCanvas(data.handles.pointA);
      const distanceA = Math.hypot(
        canvasPointA[0] - canvasCoords[0],
        canvasPointA[1] - canvasCoords[1]
      );
      if (distanceA <= proximity) {
        return { point: data.handles.pointA, index: 0, segment: 'A' };
      }
    }

    // Verificar handle del punto B (externo derecho)
    if (data.handles.pointB) {
      const canvasPointB = viewport.worldToCanvas(data.handles.pointB);
      const distanceB = Math.hypot(
        canvasPointB[0] - canvasCoords[0],
        canvasPointB[1] - canvasCoords[1]
      );
      if (distanceB <= proximity) {
        return { point: data.handles.pointB, index: 0, segment: 'B' };
      }
    }

    return null;
  }

  isPointNearTool = (
    element: HTMLDivElement,
    annotation: CTIAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    try {
      const enabledElement = getEnabledElement(element);
      if (!enabledElement) return false;

      const { viewport } = enabledElement;
      const data = annotation.data as CTIData;

      // Verificar área de texto
      const { textBox } = data.handles;
      if (textBox && textBox.worldPosition) {
        const canvasTextBox = viewport.worldToCanvas(textBox.worldPosition);
        const textWidth = 180;
        const textHeight = 50;

        const isInTextArea =
          canvasCoords[0] >= canvasTextBox[0] - 10 &&
          canvasCoords[0] <= canvasTextBox[0] + textWidth &&
          canvasCoords[1] >= canvasTextBox[1] - 10 &&
          canvasCoords[1] <= canvasTextBox[1] + textHeight;

        if (isInTextArea) return true;
      }

      // Verificar handles C
      for (const point of data.handles.pointsC) {
        const canvasPoint = viewport.worldToCanvas(point);
        const distance = Math.hypot(
          canvasPoint[0] - canvasCoords[0],
          canvasPoint[1] - canvasCoords[1]
        );
        if (distance <= proximity) return true;
      }

      // Verificar handle A
      if (data.handles.pointA) {
        const canvasPointA = viewport.worldToCanvas(data.handles.pointA);
        const distanceA = Math.hypot(
          canvasPointA[0] - canvasCoords[0],
          canvasPointA[1] - canvasCoords[1]
        );
        if (distanceA <= proximity) return true;
      }

      // Verificar handle B
      if (data.handles.pointB) {
        const canvasPointB = viewport.worldToCanvas(data.handles.pointB);
        const distanceB = Math.hypot(
          canvasPointB[0] - canvasCoords[0],
          canvasPointB[1] - canvasCoords[1]
        );
        if (distanceB <= proximity) return true;
      }

      // Verificar líneas
      const [point1, point2] = data.handles.pointsC;
      const canvas1 = viewport.worldToCanvas(point1);
      const canvas2 = viewport.worldToCanvas(point2);
      if (this._isPointNearLine(canvasCoords, canvas1, canvas2, proximity)) return true;

      const { midLineTop, midLineBottom, projectionA, projectionB } = data.cachedStats || {};

      // Verificar línea media
      if (midLineTop && midLineBottom) {
        const topCanvas = viewport.worldToCanvas(midLineTop);
        const bottomCanvas = viewport.worldToCanvas(midLineBottom);
        if (this._isPointNearLine(canvasCoords, topCanvas, bottomCanvas, proximity)) return true;
      }

      // Verificar segmento A
      if (data.handles.pointA && projectionA) {
        const canvasA = viewport.worldToCanvas(data.handles.pointA);
        const canvasProjA = viewport.worldToCanvas(projectionA);
        if (this._isPointNearLine(canvasCoords, canvasA, canvasProjA, proximity)) return true;
      }

      // Verificar segmento B
      if (data.handles.pointB && projectionB) {
        const canvasB = viewport.worldToCanvas(data.handles.pointB);
        const canvasProjB = viewport.worldToCanvas(projectionB);
        if (this._isPointNearLine(canvasCoords, canvasB, canvasProjB, proximity)) return true;
      }
    } catch (e) {
      console.error('Error en isPointNearTool:', e);
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
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (length * length)
      )
    );
    const projX = lineStart[0] + t * dx;
    const projY = lineStart[1] + t * dy;
    const distance = Math.hypot(point[0] - projX, point[1] - projY);
    return distance <= proximity;
  }

  handleSelectedCallback = (
    evt: CstTypes.InteractionEventType,
    annotation: CTIAnnotation,
    handle: any
  ): void => {
    const { element, currentPoints } = evt.detail;
    const data = annotation.data as CTIData;
    const { viewport } = getEnabledElement(element);
    annotation.highlighted = true;

    // Verificar área de texto
    if (data.handles.textBox && data.handles.textBox.worldPosition) {
      const canvasClick = currentPoints.canvas;
      const canvasTextBox = viewport.worldToCanvas(data.handles.textBox.worldPosition);
      const textWidth = 180;
      const textHeight = 50;

      const isInTextArea =
        canvasClick[0] >= canvasTextBox[0] - 10 &&
        canvasClick[0] <= canvasTextBox[0] + textWidth &&
        canvasClick[1] >= canvasTextBox[1] - 10 &&
        canvasClick[1] <= canvasTextBox[1] + textHeight;

      if (isInTextArea) {
        this.editData = {
          annotation,
          viewportIdsToRender: [evt.detail.viewportId || ''],
          handleIndex: -1,
          newAnnotation: false,
          currentSegment: 'C',
          clickCount: 4,
          movingTextBox: true,
          isEditingHandle: true,
        };
        this._activateDraw(element);
        this._triggerRender(element);
        return;
      }
    }

    if (handle) {
      // Buscar en C
      let handleIndex = data.handles.pointsC.findIndex(
        p =>
          p === handle ||
          (Array.isArray(handle) && p[0] === handle[0] && p[1] === handle[1] && p[2] === handle[2])
      );

      if (handleIndex !== -1) {
        data.handles.activeHandleIndex = handleIndex;
        data.handles.activeSegment = 'C';
        this.editData = {
          annotation,
          viewportIdsToRender: [evt.detail.viewportId || ''],
          handleIndex,
          newAnnotation: false,
          currentSegment: 'C',
          clickCount: 4,
          isEditingHandle: true,
        };
        this._activateDraw(element);
      } else if (
        data.handles.pointA &&
        (data.handles.pointA === handle ||
          (Array.isArray(handle) &&
            data.handles.pointA[0] === handle[0] &&
            data.handles.pointA[1] === handle[1] &&
            data.handles.pointA[2] === handle[2]))
      ) {
        data.handles.activeHandleIndex = 0;
        data.handles.activeSegment = 'A';
        this.editData = {
          annotation,
          viewportIdsToRender: [evt.detail.viewportId || ''],
          handleIndex: 0,
          newAnnotation: false,
          currentSegment: 'A',
          clickCount: 4,
          isEditingHandle: true,
        };
        this._activateDraw(element);
      } else if (
        data.handles.pointB &&
        (data.handles.pointB === handle ||
          (Array.isArray(handle) &&
            data.handles.pointB[0] === handle[0] &&
            data.handles.pointB[1] === handle[1] &&
            data.handles.pointB[2] === handle[2]))
      ) {
        data.handles.activeHandleIndex = 0;
        data.handles.activeSegment = 'B';
        this.editData = {
          annotation,
          viewportIdsToRender: [evt.detail.viewportId || ''],
          handleIndex: 0,
          newAnnotation: false,
          currentSegment: 'B',
          clickCount: 4,
          isEditingHandle: true,
        };
        this._activateDraw(element);
      }
    }
    this._triggerRender(element);
  };

  toolSelectedCallback = (evt: CstTypes.InteractionEventType, annotation: CTIAnnotation): void => {
    const data = annotation.data as CTIData;
    this._calculateStats(annotation);
    data.handles.activeHandleIndex = null;
    data.handles.activeSegment = null;
    annotation.highlighted = false;
    if (this.editData && !this.editData.newAnnotation) {
      this._deactivateDraw(evt.detail.element);
      this.editData = null;
    }
    this._triggerRender(evt.detail.element);
  };

  addNewAnnotation = (evt: CstTypes.InteractionEventType): CTIAnnotation | undefined => {
    if (this.editData) return this.editData.annotation;

    const { element, currentPoints } = evt.detail;
    const canvasCoords = currentPoints.canvas as Types.Point2;

    const existingAnnotations = annotationState.getAnnotations(
      this.getToolName(),
      element
    ) as CTIAnnotation[];

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

    // Obtener el imageId actual para anclar la anotación a este slice
    const currentImageId = viewport.getCurrentImageId?.();

    const newAnnotation: CTIAnnotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        FrameOfReferenceUID,
        viewPlaneNormal: [...viewPlaneNormal] as number[],
        viewUp: [...viewUp] as number[],
        referencedImageId: currentImageId,
        ...viewport.getViewReference({ points: [worldPos] }),
      },
      data: {
        handles: {
          pointsC: [[...worldPos] as Types.Point3, [...worldPos] as Types.Point3],
          pointA: [...worldPos] as Types.Point3,
          pointB: [...worldPos] as Types.Point3,
          textBox: { hasMoved: false, worldPosition: [...worldPos] as Types.Point3 },
          activeHandleIndex: 1,
          activeSegment: 'C',
        },
        cachedStats: {},
      },
    };

    annotationState.addAnnotation(newAnnotation, element);
    this.editData = {
      annotation: newAnnotation,
      viewportIdsToRender: [viewport.id],
      handleIndex: 1,
      newAnnotation: true,
      currentSegment: 'C',
      clickCount: 0,
      isEditingHandle: false,
    };
    this._activateDraw(element);
    evt.preventDefault();
    return newAnnotation;
  };

  private _mouseDownCallback = (evt: any) => {
    if (!this.editData) return;
    const { annotation, clickCount, isEditingHandle, hasDragged } = this.editData;
    const { currentPoints, element } = evt.detail;
    const worldPos = currentPoints.world as Types.Point3;
    const data = annotation.data as CTIData;

    // Modo edición click-click
    if (isEditingHandle && !hasDragged) {
      const { activeSegment, activeHandleIndex } = data.handles;
      if (activeSegment === 'C' && activeHandleIndex !== null) {
        data.handles.pointsC[activeHandleIndex] = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'A') {
        data.handles.pointA = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'B') {
        data.handles.pointB = [...worldPos] as Types.Point3;
      } else if (this.editData.movingTextBox) {
        data.handles.textBox.worldPosition = [...worldPos] as Types.Point3;
        data.handles.textBox.hasMoved = true;
      }
      this._calculateStats(annotation);
      if (!this.editData.movingTextBox && !data.handles.textBox.hasMoved)
        this._updateTextBoxPosition(annotation);
      data.handles.activeHandleIndex = null;
      data.handles.activeSegment = null;
      annotation.highlighted = false;
      this._deactivateDraw(element);
      this._triggerRender(element);
      this.editData = null;
      evt.preventDefault();
      return;
    }

    if (isEditingHandle && hasDragged) {
      evt.preventDefault();
      return;
    }

    // Flujo de creación: 4 clicks
    // Click 1: primer punto de C (ya hecho en addNewAnnotation)
    // Click 2: segundo punto de C
    // Click 3: punto A (borde izquierdo del corazón)
    // Click 4: punto B (borde derecho del corazón)
    if (clickCount === 0) {
      // Segundo click: fija punto 2 de C
      data.handles.pointsC[1] = [...worldPos] as Types.Point3;
      this.editData.clickCount = 1;
      this.editData.currentSegment = 'A';
      data.handles.activeSegment = 'A';
      data.handles.activeHandleIndex = 0;
      annotation.invalidated = true;
      this._calculateStats(annotation);
      this._updateTextBoxPosition(annotation);
    } else if (clickCount === 1) {
      // Tercer click: fija punto A
      data.handles.pointA = [...worldPos] as Types.Point3;
      this.editData.clickCount = 2;
      this.editData.currentSegment = 'B';
      data.handles.activeSegment = 'B';
      data.handles.activeHandleIndex = 0;
      annotation.invalidated = true;
      this._calculateStats(annotation);
    } else if (clickCount === 2) {
      // Cuarto click: fija punto B y termina
      data.handles.pointB = [...worldPos] as Types.Point3;
      annotation.invalidated = true;
      this._calculateStats(annotation);
      this._updateTextBoxPosition(annotation);
      data.handles.activeHandleIndex = null;
      data.handles.activeSegment = null;
      this._endDrawing(evt);
    }
    evt.preventDefault();
  };

  private _mouseUpCallback = (evt: any) => {
    const { element } = evt.detail;

    if (this._pendingHandleEdit && !this.editData) {
      const { annotation, handleInfo, viewportId } = this._pendingHandleEdit;
      const data = annotation.data as CTIData;
      annotation.highlighted = true;

      if (handleInfo.segment === 'text') {
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: -1,
          newAnnotation: false,
          currentSegment: 'C',
          clickCount: 4,
          movingTextBox: true,
          isEditingHandle: true,
          hasDragged: false,
        };
      } else {
        data.handles.activeHandleIndex = handleInfo.index;
        data.handles.activeSegment = handleInfo.segment as 'C' | 'A' | 'B';
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: handleInfo.index,
          newAnnotation: false,
          currentSegment: handleInfo.segment as 'C' | 'A' | 'B',
          clickCount: 4,
          isEditingHandle: true,
          hasDragged: false,
        };
      }
      this._pendingHandleEdit = null;
      this._triggerRender(element);
      evt.preventDefault();
      return;
    }

    if (!this.editData) return;
    const { annotation, isEditingHandle, hasDragged, movingTextBox } = this.editData;

    if (isEditingHandle && hasDragged) {
      const data = annotation.data as CTIData;
      this._calculateStats(annotation);
      if (!movingTextBox && !data.handles.textBox.hasMoved) this._updateTextBoxPosition(annotation);
      data.handles.activeHandleIndex = null;
      data.handles.activeSegment = null;
      annotation.highlighted = false;
      this._deactivateDraw(element);
      this._triggerRender(element);
      this.editData = null;
    }
    evt.preventDefault();
  };

  private _dragCallback = (evt: any) => {
    const { currentPoints, element } = evt.detail;
    const worldPos = currentPoints.world as Types.Point3;
    const isDragging = evt.type === Events.MOUSE_DRAG;

    if (this._pendingHandleEdit && !this.editData && isDragging) {
      const { annotation, handleInfo, viewportId } = this._pendingHandleEdit;
      const data = annotation.data as CTIData;
      annotation.highlighted = true;
      if (handleInfo.segment === 'text') {
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: -1,
          newAnnotation: false,
          currentSegment: 'C',
          clickCount: 4,
          movingTextBox: true,
          isEditingHandle: true,
          hasDragged: true,
        };
      } else {
        data.handles.activeHandleIndex = handleInfo.index;
        data.handles.activeSegment = handleInfo.segment as 'C' | 'A' | 'B';
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: handleInfo.index,
          newAnnotation: false,
          currentSegment: handleInfo.segment as 'C' | 'A' | 'B',
          clickCount: 4,
          isEditingHandle: true,
          hasDragged: true,
        };
      }
      this._pendingHandleEdit = null;
      this._triggerRender(element);
    }

    if (!this.editData) return;
    const { annotation, clickCount, movingTextBox, isEditingHandle } = this.editData;
    const data = annotation.data as CTIData;

    if (movingTextBox) {
      if (isDragging) this.editData.hasDragged = true;
      data.handles.textBox.worldPosition = [...worldPos] as Types.Point3;
      data.handles.textBox.hasMoved = true;
      this._triggerRender(element);
      evt.preventDefault();
      return;
    }

    if (isEditingHandle && !this.editData.newAnnotation) {
      if (isDragging) this.editData.hasDragged = true;
      const { activeSegment, activeHandleIndex } = data.handles;
      if (activeSegment === 'C' && activeHandleIndex !== null) {
        data.handles.pointsC[activeHandleIndex] = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'A') {
        data.handles.pointA = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'B') {
        data.handles.pointB = [...worldPos] as Types.Point3;
      }
      annotation.invalidated = true;
      this._calculateStats(annotation);
      if (!data.handles.textBox.hasMoved) this._updateTextBoxPosition(annotation);
      this._triggerRender(element);
      evt.preventDefault();
      return;
    }

    // Flujo de creación
    if (clickCount === 0) {
      data.handles.pointsC[1] = [...worldPos] as Types.Point3;
    } else if (clickCount === 1) {
      data.handles.pointA = [...worldPos] as Types.Point3;
    } else if (clickCount === 2) {
      data.handles.pointB = [...worldPos] as Types.Point3;
    }
    annotation.invalidated = true;
    this._calculateStats(annotation);
    if (!data.handles.textBox.hasMoved) this._updateTextBoxPosition(annotation);
    this._triggerRender(element);
    evt.preventDefault();
  };

  private _updateTextBoxPosition(annotation: CTIAnnotation) {
    const data = annotation.data as CTIData;
    const { midPoint } = data.cachedStats || {};
    if (midPoint) {
      const offset = vec3.fromValues(20, -30, 0);
      data.handles.textBox.worldPosition = vec3.add(
        vec3.create(),
        midPoint,
        offset
      ) as Types.Point3;
    }
  }

  private _calculateStats(annotation: CTIAnnotation) {
    const data = annotation.data as CTIData;
    const [point1C, point2C] = data.handles.pointsC;
    const pointA = data.handles.pointA;
    const pointB = data.handles.pointB;

    // Longitud del diámetro torácico (C)
    const C = vec3.distance(point1C, point2C);
    if (C === 0) {
      data.cachedStats = { C, A: 0, B: 0, AB: 0, CTI: 0 };
      return;
    }

    // Punto medio de C
    const midPoint = vec3.lerp(vec3.create(), point1C, point2C, 0.5) as Types.Point3;

    // Vector del segmento C
    const segmentVector = vec3.subtract(vec3.create(), point2C, point1C);

    // Vector perpendicular (dirección de la línea media)
    let perpVector = vec3.fromValues(-segmentVector[1], segmentVector[0], segmentVector[2]);
    vec3.normalize(perpVector, perpVector);

    // Asegurar que la línea media siempre apunte hacia arriba (Y negativa en coordenadas de imagen)
    // En coordenadas de imagen, Y crece hacia abajo, así que "arriba" es Y negativa
    if (perpVector[1] > 0) {
      vec3.negate(perpVector, perpVector);
    }

    // Línea media (1.5 veces la longitud de C)
    const lineLength = C * 1.5;
    const topLength = lineLength / 2; // Parte superior: mitad de la longitud total
    const bottomLength = topLength / 4; // Parte inferior: 1/4 de la parte superior

    const midLineTop = vec3.add(
      vec3.create(),
      midPoint,
      vec3.scale(vec3.create(), perpVector, topLength)
    ) as Types.Point3;

    const midLineBottom = vec3.subtract(
      vec3.create(),
      midPoint,
      vec3.scale(vec3.create(), perpVector, bottomLength)
    ) as Types.Point3;

    // Calcular proyección de A sobre la línea media (perpendicular)
    const projectionA = this._projectPointOntoLine(pointA, midLineTop, midLineBottom);

    // Calcular proyección de B sobre la línea media (perpendicular)
    const projectionB = this._projectPointOntoLine(pointB, midLineTop, midLineBottom);

    // Longitud del segmento A (desde pointA hasta su proyección en la línea media)
    const A = vec3.distance(pointA, projectionA);

    // Longitud del segmento B (desde pointB hasta su proyección en la línea media)
    const B = vec3.distance(pointB, projectionB);

    // Sombra cardíaca = A + B
    const AB = A + B;

    // Índice cardiotorácico
    const CTI = C > 0 ? AB / C : 0;

    data.cachedStats = {
      C,
      A,
      B,
      AB,
      CTI,
      midPoint,
      midLineTop,
      midLineBottom,
      projectionA,
      projectionB,
    };
  }

  // Proyecta un punto sobre una línea (proyección perpendicular)
  private _projectPointOntoLine(
    point: Types.Point3,
    lineStart: Types.Point3,
    lineEnd: Types.Point3
  ): Types.Point3 {
    const lineVector = vec3.subtract(vec3.create(), lineEnd, lineStart);
    const lineLength = vec3.length(lineVector);

    if (lineLength === 0) {
      return [...lineStart] as Types.Point3;
    }

    const lineDir = vec3.normalize(vec3.create(), lineVector);
    const pointVector = vec3.subtract(vec3.create(), point, lineStart);
    const projection = vec3.dot(pointVector, lineDir);

    const projectedPoint = vec3.add(
      vec3.create(),
      lineStart,
      vec3.scale(vec3.create(), lineDir, projection)
    ) as Types.Point3;

    return projectedPoint;
  }

  private _endDrawing = (evt: any) => {
    if (!this.editData) return;
    const { element } = evt.detail;
    this._deactivateDraw(element);
    this.editData.annotation.highlighted = false;
    this._triggerRender(element);
    this.editData = null;
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
      const { viewport } = enabledElement;
      viewport.render();
    } catch (error) {
      console.error('Error al renderizar:', error);
    }
  }

  renderAnnotation = (enabledElement: any, svgDrawingHelper: any): boolean => {
    const { viewport } = enabledElement;
    const { element } = viewport;

    // Obtener TODAS las anotaciones para poder limpiar textos de las que no están en este slice
    const allAnnotations = annotationState.getAnnotations(
      this.getToolName(),
      element
    ) as CTIAnnotation[];

    // Obtener el imageId actual del viewport
    const currentImageId = viewport.getCurrentImageId?.();
    const svgLayer = svgDrawingHelper.svgLayerElement;

    // Limpiar textos de anotaciones que no pertenecen a este slice
    if (allAnnotations?.length && svgLayer) {
      for (const ann of allAnnotations) {
        const referencedImageId = ann.metadata?.referencedImageId;
        if (referencedImageId && currentImageId && referencedImageId !== currentImageId) {
          svgLayer
            .querySelectorAll(`[data-annotation-uid="${ann.annotationUID}"][data-text-line]`)
            .forEach((el: Element) => el.remove());
        }
      }
    }

    let annotations = allAnnotations;
    if (!annotations?.length) return false;
    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    ) as CTIAnnotation[];
    if (!annotations?.length) return false;

    for (const ann of annotations) {
      // Verificar si la anotación pertenece a esta imagen/slice
      const referencedImageId = ann.metadata?.referencedImageId;
      if (referencedImageId && currentImageId && referencedImageId !== currentImageId) {
        continue; // Saltar esta anotación si no pertenece al slice actual
      }

      const { annotationUID, data, highlighted } = ann;
      const d = data as CTIData;
      const handleRadius = this.configuration.handleRadius;
      const handleVisibilityDistance = this.configuration.handleVisibilityDistance || 20;

      const isCursorNearPoint = (canvasPoint: Types.Point2): boolean => {
        if (!this._currentCursorPosition) return false;
        return (
          Math.hypot(
            canvasPoint[0] - this._currentCursorPosition[0],
            canvasPoint[1] - this._currentCursorPosition[1]
          ) <= handleVisibilityDistance
        );
      };

      // ===== SEGMENTO C (CYAN) - Diámetro torácico =====
      const [point1C, point2C] = d.handles.pointsC;
      const canvasPoint1C = viewport.worldToCanvas(point1C);
      const canvasPoint2C = viewport.worldToCanvas(point2C);
      const isHandle1CActive = d.handles.activeSegment === 'C' && d.handles.activeHandleIndex === 0;
      const isHandle2CActive = d.handles.activeSegment === 'C' && d.handles.activeHandleIndex === 1;

      if (isCursorNearPoint(canvasPoint1C) || isHandle1CActive || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-C-0', [canvasPoint1C], {
          color: isHandle1CActive ? 'lime' : 'cyan',
          handleRadius,
        });
      }
      if (isCursorNearPoint(canvasPoint2C) || isHandle2CActive || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-C-1', [canvasPoint2C], {
          color: isHandle2CActive ? 'lime' : 'cyan',
          handleRadius,
        });
      }
      drawLine(svgDrawingHelper, annotationUID!, 'segment-C', canvasPoint1C, canvasPoint2C, {
        color: 'cyan',
        lineWidth: 1.5,
        lineDash: [5, 5],
      });

      // ===== LÍNEA MEDIA (AMARILLO) =====
      const { midLineTop, midLineBottom, midPoint, C, A, B, CTI, projectionA, projectionB } =
        d.cachedStats || {};
      if (midLineTop && midLineBottom) {
        const topCanvas = viewport.worldToCanvas(midLineTop);
        const bottomCanvas = viewport.worldToCanvas(midLineBottom);
        drawLine(svgDrawingHelper, annotationUID!, 'mid-line', topCanvas, bottomCanvas, {
          color: 'yellow',
          lineWidth: 1.5,
          lineDash: [5, 5],
        });
      }

      // ===== SEGMENTO A (MAGENTA) =====
      const canvasPointA = viewport.worldToCanvas(d.handles.pointA);
      const isHandleAActive = d.handles.activeSegment === 'A';

      if (isCursorNearPoint(canvasPointA) || isHandleAActive || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-A', [canvasPointA], {
          color: isHandleAActive ? 'lime' : '#FF00FF',
          handleRadius,
        });
      }

      if (projectionA) {
        const canvasProjA = viewport.worldToCanvas(projectionA);
        drawLine(svgDrawingHelper, annotationUID!, 'segment-A', canvasPointA, canvasProjA, {
          color: '#FF00FF',
          lineWidth: 1.5,
          lineDash: [5, 5],
        });
        // Handle en la proyección (sobre la línea media)
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-projA', [canvasProjA], {
          color: 'white',
          handleRadius: 3,
        });
      }

      // ===== SEGMENTO B (VERDE) =====
      const canvasPointB = viewport.worldToCanvas(d.handles.pointB);
      const isHandleBActive = d.handles.activeSegment === 'B';

      if (isCursorNearPoint(canvasPointB) || isHandleBActive || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-B', [canvasPointB], {
          color: isHandleBActive ? 'lime' : '#00FF00',
          handleRadius,
        });
      }

      if (projectionB) {
        const canvasProjB = viewport.worldToCanvas(projectionB);
        drawLine(svgDrawingHelper, annotationUID!, 'segment-B', canvasPointB, canvasProjB, {
          color: '#00FF00',
          lineWidth: 1.5,
          lineDash: [5, 5],
        });
        // Handle en la proyección (sobre la línea media)
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-projB', [canvasProjB], {
          color: 'white',
          handleRadius: 3,
        });
      }

      // ===== TEXTO =====
      const isNewAnnotation =
        this.editData?.newAnnotation && this.editData?.annotation?.annotationUID === annotationUID;
      if (
        !isNewAnnotation &&
        d.handles.textBox?.worldPosition &&
        C &&
        A !== undefined &&
        B !== undefined &&
        CTI !== undefined
      ) {
        const textCanvas = viewport.worldToCanvas(d.handles.textBox.worldPosition);

        const sombraCardiaca = A + B;

        const textLines = [
          `Diámetro Torácico: ${C.toFixed(1)} mm`,
          `Sombra Cardíaca: ${sombraCardiaca.toFixed(1)} mm`,
          `Índice Cardiotorácico: ${(CTI * 100).toFixed(1)}%`,
        ];
        const lineHeight = 14;
        const svgns = 'http://www.w3.org/2000/svg';

        if (svgLayer) {
          svgLayer
            .querySelectorAll(`[data-annotation-uid="${annotationUID}"][data-text-line]`)
            .forEach((el: Element) => el.remove());
        }

        textLines.forEach((line, index) => {
          const textElement = document.createElementNS(svgns, 'text');
          textElement.setAttribute('x', String(textCanvas[0]));
          textElement.setAttribute('y', String(textCanvas[1] + index * lineHeight));
          textElement.setAttribute('fill', 'rgb(0, 255, 0)');
          textElement.setAttribute('font-size', '12px');
          textElement.setAttribute('font-family', 'Helvetica Neue, Helvetica, Arial, sans-serif');
          textElement.setAttribute('text-anchor', 'start');
          textElement.setAttribute('data-annotation-uid', annotationUID!);
          textElement.setAttribute('data-text-line', String(index));
          textElement.setAttribute(
            'style',
            'text-shadow: 1px 1px 0px rgba(0,0,0,0.8), -1px -1px 0px rgba(0,0,0,0.8), 1px -1px 0px rgba(0,0,0,0.8), -1px 1px 0px rgba(0,0,0,0.8); pointer-events: none;'
          );
          textElement.textContent = line;
          svgLayer?.appendChild(textElement);
        });
      }
    }
    return true;
  };

  cancel = (element: HTMLDivElement) => {
    if (this.editData) {
      annotationState.removeAnnotation(this.editData.annotation.annotationUID!);
      this._deactivateDraw(element);
      this._triggerRender(element);
      this.editData = null;
    }
  };
}
