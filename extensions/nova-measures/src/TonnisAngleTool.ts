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

interface TonnisAngleData {
  handles: {
    segment1: [Types.Point3, Types.Point3]; // Primer segmento (línea de referencia, orientación libre)
    segment2: [Types.Point3, Types.Point3]; // Segundo segmento (línea tangencial al techo acetabular)
    textBox: {
      hasMoved: boolean;
      worldPosition: Types.Point3;
    };
    activeHandleIndex: number | null;
    activeSegment: 1 | 2 | null;
  };
  cachedStats: {
    angle?: number; // Ángulo de Tonnis en grados
    intersection?: Types.Point3; // Punto de intersección (si existe)
  };
}

interface TonnisAngleAnnotation {
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
  data: TonnisAngleData;
}

export default class TonnisAngleTool extends AnnotationTool {
  public static toolName = 'TonnisAngle';

  private editData: {
    annotation: TonnisAngleAnnotation;
    viewportIdsToRender: string[];
    handleIndex: number;
    newAnnotation: boolean;
    currentSegment: 1 | 2;
    clickCount: number;
    movingTextBox?: boolean;
    isEditingHandle?: boolean;
    hasDragged?: boolean;
  } | null = null;

  private _pendingHandleEdit: {
    annotation: TonnisAngleAnnotation;
    handleInfo: { point: Types.Point3; index: number; segment: 1 | 2 | 'text' };
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
    annotation: TonnisAngleAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): { point: Types.Point3; index: number; segment: 1 | 2 | 'text' } | null {
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) return null;

    const { viewport } = enabledElement;
    const data = annotation.data as TonnisAngleData;

    // Verificar área de texto
    if (data.handles.textBox && data.handles.textBox.worldPosition) {
      const canvasTextBox = viewport.worldToCanvas(data.handles.textBox.worldPosition);
      const textWidth = 150;
      const textHeight = 30;

      const isInTextArea =
        canvasCoords[0] >= canvasTextBox[0] - 10 &&
        canvasCoords[0] <= canvasTextBox[0] + textWidth &&
        canvasCoords[1] >= canvasTextBox[1] - 10 &&
        canvasCoords[1] <= canvasTextBox[1] + textHeight;

      if (isInTextArea) {
        return { point: data.handles.textBox.worldPosition, index: -1, segment: 'text' };
      }
    }

    // Verificar handles del segmento 1
    for (let i = 0; i < data.handles.segment1.length; i++) {
      const point = data.handles.segment1[i];
      const canvasPoint = viewport.worldToCanvas(point);
      const distance = Math.hypot(
        canvasPoint[0] - canvasCoords[0],
        canvasPoint[1] - canvasCoords[1]
      );
      if (distance <= proximity) {
        return { point, index: i, segment: 1 };
      }
    }

    // Verificar handles del segmento 2
    for (let i = 0; i < data.handles.segment2.length; i++) {
      const point = data.handles.segment2[i];
      const canvasPoint = viewport.worldToCanvas(point);
      const distance = Math.hypot(
        canvasPoint[0] - canvasCoords[0],
        canvasPoint[1] - canvasCoords[1]
      );
      if (distance <= proximity) {
        return { point, index: i, segment: 2 };
      }
    }

    return null;
  }

  isPointNearTool = (
    element: HTMLDivElement,
    annotation: TonnisAngleAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    try {
      const enabledElement = getEnabledElement(element);
      if (!enabledElement) return false;

      const { viewport } = enabledElement;
      const data = annotation.data as TonnisAngleData;

      // Verificar área de texto
      const { textBox } = data.handles;
      if (textBox && textBox.worldPosition) {
        const canvasTextBox = viewport.worldToCanvas(textBox.worldPosition);
        const textWidth = 150;
        const textHeight = 30;

        const isInTextArea =
          canvasCoords[0] >= canvasTextBox[0] - 10 &&
          canvasCoords[0] <= canvasTextBox[0] + textWidth &&
          canvasCoords[1] >= canvasTextBox[1] - 10 &&
          canvasCoords[1] <= canvasTextBox[1] + textHeight;

        if (isInTextArea) return true;
      }

      // Verificar handles segmento 1
      for (const point of data.handles.segment1) {
        const canvasPoint = viewport.worldToCanvas(point);
        const distance = Math.hypot(
          canvasPoint[0] - canvasCoords[0],
          canvasPoint[1] - canvasCoords[1]
        );
        if (distance <= proximity) return true;
      }

      // Verificar handles segmento 2
      for (const point of data.handles.segment2) {
        const canvasPoint = viewport.worldToCanvas(point);
        const distance = Math.hypot(
          canvasPoint[0] - canvasCoords[0],
          canvasPoint[1] - canvasCoords[1]
        );
        if (distance <= proximity) return true;
      }

      // Verificar línea del segmento 1
      const [p1s1, p2s1] = data.handles.segment1;
      const canvas1s1 = viewport.worldToCanvas(p1s1);
      const canvas2s1 = viewport.worldToCanvas(p2s1);
      if (this._isPointNearLine(canvasCoords, canvas1s1, canvas2s1, proximity)) return true;

      // Verificar línea del segmento 2
      const [p1s2, p2s2] = data.handles.segment2;
      const canvas1s2 = viewport.worldToCanvas(p1s2);
      const canvas2s2 = viewport.worldToCanvas(p2s2);
      if (this._isPointNearLine(canvasCoords, canvas1s2, canvas2s2, proximity)) return true;
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
    annotation: TonnisAngleAnnotation,
    handle: any
  ): void => {
    const { element, currentPoints } = evt.detail;
    const data = annotation.data as TonnisAngleData;
    const { viewport } = getEnabledElement(element);
    annotation.highlighted = true;

    // Si estamos creando una nueva anotación, ignorar selección de handles para evitar conflictos
    if (this.editData?.newAnnotation && this.editData.annotation === annotation) {
      return;
    }

    // Verificar área de texto
    if (data.handles.textBox && data.handles.textBox.worldPosition) {
      const canvasClick = currentPoints.canvas;
      const canvasTextBox = viewport.worldToCanvas(data.handles.textBox.worldPosition);
      const textWidth = 150;
      const textHeight = 30;

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
          currentSegment: 1,
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
      // Buscar en segmento 1
      let handleIndex = data.handles.segment1.findIndex(
        p =>
          p === handle ||
          (Array.isArray(handle) && p[0] === handle[0] && p[1] === handle[1] && p[2] === handle[2])
      );

      if (handleIndex !== -1) {
        data.handles.activeHandleIndex = handleIndex;
        data.handles.activeSegment = 1;
        this.editData = {
          annotation,
          viewportIdsToRender: [evt.detail.viewportId || ''],
          handleIndex,
          newAnnotation: false,
          currentSegment: 1,
          clickCount: 4,
          isEditingHandle: true,
        };
        this._activateDraw(element);
      } else {
        // Buscar en segmento 2
        handleIndex = data.handles.segment2.findIndex(
          p =>
            p === handle ||
            (Array.isArray(handle) &&
              p[0] === handle[0] &&
              p[1] === handle[1] &&
              p[2] === handle[2])
        );

        if (handleIndex !== -1) {
          data.handles.activeHandleIndex = handleIndex;
          data.handles.activeSegment = 2;
          this.editData = {
            annotation,
            viewportIdsToRender: [evt.detail.viewportId || ''],
            handleIndex,
            newAnnotation: false,
            currentSegment: 2,
            clickCount: 4,
            isEditingHandle: true,
          };
          this._activateDraw(element);
        }
      }
    }
    this._triggerRender(element);
  };

  toolSelectedCallback = (
    evt: CstTypes.InteractionEventType,
    annotation: TonnisAngleAnnotation
  ): void => {
    const data = annotation.data as TonnisAngleData;
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

  addNewAnnotation = (evt: CstTypes.InteractionEventType): TonnisAngleAnnotation | undefined => {
    if (this.editData) return this.editData.annotation;

    const { element, currentPoints } = evt.detail;
    const canvasCoords = currentPoints.canvas as Types.Point2;

    const existingAnnotations = annotationState.getAnnotations(
      this.getToolName(),
      element
    ) as TonnisAngleAnnotation[];

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

    const newAnnotation: TonnisAngleAnnotation = {
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
          segment1: [[...worldPos] as Types.Point3, [...worldPos] as Types.Point3],
          segment2: [[...worldPos] as Types.Point3, [...worldPos] as Types.Point3],
          textBox: { hasMoved: false, worldPosition: [...worldPos] as Types.Point3 },
          activeHandleIndex: 1,
          activeSegment: 1,
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
      currentSegment: 1,
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
    const data = annotation.data as TonnisAngleData;

    // Modo edición click-click
    if (isEditingHandle && !hasDragged) {
      const { activeSegment, activeHandleIndex } = data.handles;
      if (activeSegment === 1 && activeHandleIndex !== null) {
        data.handles.segment1[activeHandleIndex] = [...worldPos] as Types.Point3;
      } else if (activeSegment === 2 && activeHandleIndex !== null) {
        data.handles.segment2[activeHandleIndex] = [...worldPos] as Types.Point3;
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
    // Click 1: primer punto del segmento 1 (ya hecho en addNewAnnotation)
    // Click 2: segundo punto del segmento 1
    // Click 3: primer punto del segmento 2
    // Click 4: segundo punto del segmento 2
    if (clickCount === 0) {
      // Segundo click: fija punto 2 del segmento 1
      data.handles.segment1[1] = [...worldPos] as Types.Point3;
      this.editData.clickCount = 1;
      this.editData.currentSegment = 2;
      data.handles.activeSegment = 2;
      data.handles.activeHandleIndex = 0;
      annotation.invalidated = true;
      this._calculateStats(annotation);
    } else if (clickCount === 1) {
      // Tercer click: fija punto 1 del segmento 2
      data.handles.segment2[0] = [...worldPos] as Types.Point3;
      data.handles.segment2[1] = [...worldPos] as Types.Point3;
      this.editData.clickCount = 2;
      data.handles.activeHandleIndex = 1;
      annotation.invalidated = true;
      this._calculateStats(annotation);
    } else if (clickCount === 2) {
      // Cuarto click: fija punto 2 del segmento 2 y termina
      data.handles.segment2[1] = [...worldPos] as Types.Point3;
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
      const data = annotation.data as TonnisAngleData;
      annotation.highlighted = true;

      if (handleInfo.segment === 'text') {
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: -1,
          newAnnotation: false,
          currentSegment: 1,
          clickCount: 4,
          movingTextBox: true,
          isEditingHandle: true,
          hasDragged: false,
        };
      } else {
        data.handles.activeHandleIndex = handleInfo.index;
        data.handles.activeSegment = handleInfo.segment as 1 | 2;
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: handleInfo.index,
          newAnnotation: false,
          currentSegment: handleInfo.segment as 1 | 2,
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
      const data = annotation.data as TonnisAngleData;
      this._calculateStats(annotation);
      if (!movingTextBox && !data.handles.textBox.hasMoved) this._updateTextBoxPosition(annotation);
      data.handles.activeHandleIndex = null;
      data.handles.activeSegment = null;
      annotation.highlighted = false;
      this._deactivateDraw(element);
      this._triggerRender(element);
      this.editData = null;
      this._textBoxDragOffset = null;
    }
    evt.preventDefault();
  };

  private _dragCallback = (evt: any) => {
    const { currentPoints, element } = evt.detail;
    const worldPos = currentPoints.world as Types.Point3;
    const isDragging = evt.type === Events.MOUSE_DRAG;

    if (this._pendingHandleEdit && !this.editData && isDragging) {
      const { annotation, handleInfo, viewportId } = this._pendingHandleEdit;
      const data = annotation.data as TonnisAngleData;
      annotation.highlighted = true;
      if (handleInfo.segment === 'text') {
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: -1,
          newAnnotation: false,
          currentSegment: 1,
          clickCount: 4,
          movingTextBox: true,
          isEditingHandle: true,
          hasDragged: true,
        };
      } else {
        data.handles.activeHandleIndex = handleInfo.index;
        data.handles.activeSegment = handleInfo.segment as 1 | 2;
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: handleInfo.index,
          newAnnotation: false,
          currentSegment: handleInfo.segment as 1 | 2,
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
    const data = annotation.data as TonnisAngleData;

    if (movingTextBox) {
      if (isDragging) this.editData.hasDragged = true;

      // Calcular offset inicial si no existe
      if (!this._textBoxDragOffset) {
        const currentTextPos = data.handles.textBox.worldPosition;
        this._textBoxDragOffset = [
          currentTextPos[0] - worldPos[0],
          currentTextPos[1] - worldPos[1],
          currentTextPos[2] - worldPos[2],
        ] as Types.Point3;
      }

      // Aplicar el offset para mantener la posición relativa del click
      data.handles.textBox.worldPosition = [
        worldPos[0] + this._textBoxDragOffset[0],
        worldPos[1] + this._textBoxDragOffset[1],
        worldPos[2] + this._textBoxDragOffset[2],
      ] as Types.Point3;

      data.handles.textBox.hasMoved = true;
      this._triggerRender(element);
      evt.preventDefault();
      return;
    }

    if (isEditingHandle && !this.editData.newAnnotation) {
      if (isDragging) this.editData.hasDragged = true;
      const { activeSegment, activeHandleIndex } = data.handles;
      if (activeSegment === 1 && activeHandleIndex !== null) {
        data.handles.segment1[activeHandleIndex] = [...worldPos] as Types.Point3;
      } else if (activeSegment === 2 && activeHandleIndex !== null) {
        data.handles.segment2[activeHandleIndex] = [...worldPos] as Types.Point3;
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
      data.handles.segment1[1] = [...worldPos] as Types.Point3;
    } else if (clickCount === 1) {
      data.handles.segment2[0] = [...worldPos] as Types.Point3;
      data.handles.segment2[1] = [...worldPos] as Types.Point3;
    } else if (clickCount === 2) {
      data.handles.segment2[1] = [...worldPos] as Types.Point3;
    }
    annotation.invalidated = true;
    this._calculateStats(annotation);
    if (!data.handles.textBox.hasMoved) this._updateTextBoxPosition(annotation);
    this._triggerRender(element);
    evt.preventDefault();
  };

  private _updateTextBoxPosition(annotation: TonnisAngleAnnotation) {
    const data = annotation.data as TonnisAngleData;
    const { intersection } = data.cachedStats || {};

    // Si hay intersección, colocar el texto cerca de ella
    if (intersection) {
      const offset = vec3.fromValues(20, -20, 0);
      data.handles.textBox.worldPosition = vec3.add(
        vec3.create(),
        intersection,
        offset
      ) as Types.Point3;
    } else {
      // Si no hay intersección, colocar en el punto medio entre los dos segmentos
      const mid1 = vec3.lerp(
        vec3.create(),
        data.handles.segment1[0],
        data.handles.segment1[1],
        0.5
      );
      const mid2 = vec3.lerp(
        vec3.create(),
        data.handles.segment2[0],
        data.handles.segment2[1],
        0.5
      );
      const midPoint = vec3.lerp(vec3.create(), mid1, mid2, 0.5);
      const offset = vec3.fromValues(20, -20, 0);
      data.handles.textBox.worldPosition = vec3.add(
        vec3.create(),
        midPoint,
        offset
      ) as Types.Point3;
    }
  }

  private _calculateStats(annotation: TonnisAngleAnnotation) {
    const data = annotation.data as TonnisAngleData;
    const [p1s1, p2s1] = data.handles.segment1;
    const [p1s2, p2s2] = data.handles.segment2;

    // Vectores de dirección de cada segmento
    const dir1 = vec3.subtract(vec3.create(), p2s1, p1s1);
    const dir2 = vec3.subtract(vec3.create(), p2s2, p1s2);

    const len1 = vec3.length(dir1);
    const len2 = vec3.length(dir2);

    if (len1 === 0 || len2 === 0) {
      data.cachedStats = { angle: 0 };
      return;
    }

    // Normalizar vectores
    const norm1 = vec3.normalize(vec3.create(), dir1);
    const norm2 = vec3.normalize(vec3.create(), dir2);

    // Calcular el ángulo entre los vectores usando producto punto
    const dotProduct = vec3.dot(norm1, norm2);
    // Clampear para evitar errores numéricos con acos
    const clampedDot = Math.max(-1, Math.min(1, dotProduct));
    const angleRadians = Math.acos(Math.abs(clampedDot));
    // Siempre el ángulo menor (entre 0° y 90°)
    let angleDegrees = (angleRadians * 180) / Math.PI;
    if (angleDegrees > 90) {
      angleDegrees = 180 - angleDegrees;
    }

    // Calcular punto de intersección (extensión de líneas)
    const intersection = this._calculateLineIntersection(p1s1, p2s1, p1s2, p2s2);

    data.cachedStats = {
      angle: angleDegrees,
      intersection,
    };
  }

  // Calcula el punto de intersección de dos líneas (extendidas infinitamente)
  private _calculateLineIntersection(
    p1: Types.Point3,
    p2: Types.Point3,
    p3: Types.Point3,
    p4: Types.Point3
  ): Types.Point3 | undefined {
    // Usando coordenadas 2D (x, y) para calcular intersección en el plano
    const x1 = p1[0],
      y1 = p1[1];
    const x2 = p2[0],
      y2 = p2[1];
    const x3 = p3[0],
      y3 = p3[1];
    const x4 = p4[0],
      y4 = p4[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    // Líneas paralelas
    if (Math.abs(denom) < 1e-10) {
      return undefined;
    }

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

    const intersectX = x1 + t * (x2 - x1);
    const intersectY = y1 + t * (y2 - y1);
    // Mantener el mismo Z que el primer punto
    const intersectZ = p1[2];

    return [intersectX, intersectY, intersectZ] as Types.Point3;
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
    ) as TonnisAngleAnnotation[];

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
    ) as TonnisAngleAnnotation[];
    if (!annotations?.length) return false;

    for (const ann of annotations) {
      // Verificar si la anotación pertenece a esta imagen/slice
      const referencedImageId = ann.metadata?.referencedImageId;
      if (referencedImageId && currentImageId && referencedImageId !== currentImageId) {
        continue; // Saltar esta anotación si no pertenece al slice actual
      }
      const { annotationUID, data, highlighted } = ann;
      const d = data as TonnisAngleData;
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

      // ===== SEGMENTO 1 - LÍNEA HORIZONTAL (CYAN) =====
      const [p1s1, p2s1] = d.handles.segment1;
      const canvasP1S1 = viewport.worldToCanvas(p1s1);
      const canvasP2S1 = viewport.worldToCanvas(p2s1);
      const isHandle1S1Active = d.handles.activeSegment === 1 && d.handles.activeHandleIndex === 0;
      const isHandle2S1Active = d.handles.activeSegment === 1 && d.handles.activeHandleIndex === 1;

      if (isCursorNearPoint(canvasP1S1) || isHandle1S1Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-S1-0', [canvasP1S1], {
          color: isHandle1S1Active ? 'lime' : 'cyan',
          handleRadius,
        });
      }
      if (isCursorNearPoint(canvasP2S1) || isHandle2S1Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-S1-1', [canvasP2S1], {
          color: isHandle2S1Active ? 'lime' : 'cyan',
          handleRadius,
        });
      }
      drawLine(svgDrawingHelper, annotationUID!, 'segment-1', canvasP1S1, canvasP2S1, {
        color: 'cyan',
        lineWidth: 1.5,
        lineDash: [5, 5],
      });

      // ===== SEGMENTO 2 - LÍNEA TANGENCIAL AL TECHO ACETABULAR (MAGENTA) =====
      const [p1s2, p2s2] = d.handles.segment2;
      const canvasP1S2 = viewport.worldToCanvas(p1s2);
      const canvasP2S2 = viewport.worldToCanvas(p2s2);
      const isHandle1S2Active = d.handles.activeSegment === 2 && d.handles.activeHandleIndex === 0;
      const isHandle2S2Active = d.handles.activeSegment === 2 && d.handles.activeHandleIndex === 1;

      if (isCursorNearPoint(canvasP1S2) || isHandle1S2Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-S2-0', [canvasP1S2], {
          color: isHandle1S2Active ? 'lime' : '#FF00FF',
          handleRadius,
        });
      }
      if (isCursorNearPoint(canvasP2S2) || isHandle2S2Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-S2-1', [canvasP2S2], {
          color: isHandle2S2Active ? 'lime' : '#FF00FF',
          handleRadius,
        });
      }
      drawLine(svgDrawingHelper, annotationUID!, 'segment-2', canvasP1S2, canvasP2S2, {
        color: '#FF00FF',
        lineWidth: 1.5,
        lineDash: [5, 5],
      });

      // ===== PUNTO DE INTERSECCIÓN Y ARCO (si existe) =====
      const { angle, intersection } = d.cachedStats || {};
      if (intersection) {
        const canvasIntersection = viewport.worldToCanvas(intersection);
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-intersection', [canvasIntersection], {
          color: 'yellow',
          handleRadius: 4,
        });

        // Dibujar arco para visualizar el ángulo
        if (angle !== undefined && angle > 0) {
          // --- DETERMINAR RADIO DEL ARCO ---
          // "Cuando no se intercepten los dos segmentos... el arco debe estar ubicado antes de las proyecciones"
          // "se calcula la distancia más larga entre los extremos mas cercanos de ambos segmentos... y agregamos 5 pixeles"

          // 1. Verificar si los segmentos se interceptan físicamente en el canvas
          let arcRadius = 60; // Default

          // Distancias de los extremos de los segmentos al punto de intersección
          const d1Start = vec3.distance(p1s1, intersection);
          const d1End = vec3.distance(p2s1, intersection);
          const d2Start = vec3.distance(p1s2, intersection);
          const d2End = vec3.distance(p2s2, intersection);

          const len1 = vec3.distance(p1s1, p2s1);
          const len2 = vec3.distance(p1s2, p2s2);

          // Si la distancia de intersección a cualquier extremo es mayor que la longitud del segmento (aproximadamente),
          // significa que la intersección está fuera del segmento.
          // Comprobamos con cierta tolerancia.
          const isIntersectionOnSeg1 = Math.abs(d1Start + d1End - len1) < 0.1;
          const isIntersectionOnSeg2 = Math.abs(d2Start + d2End - len2) < 0.1;

          if (!isIntersectionOnSeg1 || !isIntersectionOnSeg2) {
            // No se interceptan físicamente ambos
            // Buscar extremos más cercanos de cada segmento
            const minDist1 = Math.min(d1Start, d1End);
            const minDist2 = Math.min(d2Start, d2End);

            // Convertir distancias de mundo a píxeles (aprox, asumiendo scale uniforme o usando un punto de referencia)
            // Mejor hacerlo en canvas space directamente para precisión en pixeles
            const d1StartCanvas = Math.hypot(
              canvasP1S1[0] - canvasIntersection[0],
              canvasP1S1[1] - canvasIntersection[1]
            );
            const d1EndCanvas = Math.hypot(
              canvasP2S1[0] - canvasIntersection[0],
              canvasP2S1[1] - canvasIntersection[1]
            );
            const d2StartCanvas = Math.hypot(
              canvasP1S2[0] - canvasIntersection[0],
              canvasP1S2[1] - canvasIntersection[1]
            );
            const d2EndCanvas = Math.hypot(
              canvasP2S2[0] - canvasIntersection[0],
              canvasP2S2[1] - canvasIntersection[1]
            );

            const minCanvasDist1 = Math.min(d1StartCanvas, d1EndCanvas);
            const minCanvasDist2 = Math.min(d2StartCanvas, d2EndCanvas);

            // "distancia más larga entre los extremos mas cercanos"
            const maxOfMins = Math.max(minCanvasDist1, minCanvasDist2);

            arcRadius = maxOfMins + 5;
          }

          const svgns = 'http://www.w3.org/2000/svg';
          const svgLayer = svgDrawingHelper.svgLayerElement;

          // Calcular los ángulos de los segmentos respecto al eje X
          const dir1X = canvasP2S1[0] - canvasP1S1[0];
          const dir1Y = canvasP2S1[1] - canvasP1S1[1];
          const dir2X = canvasP2S2[0] - canvasP1S2[0];
          const dir2Y = canvasP2S2[1] - canvasP1S2[1];

          // Ángulos en radianes
          let angle1 = Math.atan2(dir1Y, dir1X);
          let angle2 = Math.atan2(dir2Y, dir2X);

          // Asegurar que el arco dibujado corresponda al ángulo agudo (< 90)
          // Si el ángulo entre los vectores originales es obtuso, invertimos uno
          const angleDiff = angle2 - angle1;
          // Normalizar diferencia a [-PI, PI]
          const normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

          if (Math.abs(normalizedDiff) > Math.PI / 2) {
            angle2 += Math.PI;
          }

          // Recalcular diferencia para el barrido
          let startAngle = angle1;
          let endAngle = angle2;

          // Asegurar orden correcto para el sweep
          if (endAngle < startAngle) {
            [startAngle, endAngle] = [endAngle, startAngle];
          }

          // Si la diferencia es > PI, tomamos el camino corto cruzando el eje
          if (endAngle - startAngle > Math.PI) {
            [startAngle, endAngle] = [endAngle, startAngle + 2 * Math.PI];
          }

          // --- LOGICA DE ORIENTACIÓN DEL ARCO ---
          // "El arco debe estar ubicado antes de las proyecciones"
          // Verificamos si el arco actual "mira" hacia los segmentos reales o hacia el vacío.
          // Calculamos el vector promedio hacia los puntos medios de los segmentos desde la intersección.

          const mid1 = vec3.lerp(vec3.create(), p1s1, p2s1, 0.5);
          const mid2 = vec3.lerp(vec3.create(), p1s2, p2s2, 0.5);

          const canvasMid1 = viewport.worldToCanvas(mid1);
          const canvasMid2 = viewport.worldToCanvas(mid2);

          const v1x = canvasMid1[0] - canvasIntersection[0];
          const v1y = canvasMid1[1] - canvasIntersection[1];
          const v2x = canvasMid2[0] - canvasIntersection[0];
          const v2y = canvasMid2[1] - canvasIntersection[1];

          const avgDirX = v1x + v2x;
          const avgDirY = v1y + v2y;

          // Angulo medio del arco actual
          const midArcAngle = startAngle + (endAngle - startAngle) / 2;
          const bisectorX = Math.cos(midArcAngle);
          const bisectorY = Math.sin(midArcAngle);

          // Producto punto para ver alineación
          const dot = avgDirX * bisectorX + avgDirY * bisectorY;

          // Si el producto punto es negativo, el arco está en el lado opuesto a los segmentos
          if (dot < 0) {
            startAngle += Math.PI;
            endAngle += Math.PI;
          }
          // --------------------------------------

          // Calcular puntos de inicio y fin del arco
          const startX = canvasIntersection[0] + arcRadius * Math.cos(startAngle);
          const startY = canvasIntersection[1] + arcRadius * Math.sin(startAngle);
          const endX = canvasIntersection[0] + arcRadius * Math.cos(endAngle);
          const endY = canvasIntersection[1] + arcRadius * Math.sin(endAngle);

          // Crear el path del arco (siempre arc pequeño < 180)
          const arcPath = `M ${startX} ${startY} A ${arcRadius} ${arcRadius} 0 0 1 ${endX} ${endY}`;

          // Remover arco anterior si existe
          if (svgLayer) {
            svgLayer
              .querySelectorAll(`[data-annotation-uid="${annotationUID}"][data-arc]`)
              .forEach((el: Element) => el.remove());
          }

          // Crear elemento path para el arco
          const arcElement = document.createElementNS(svgns, 'path');
          arcElement.setAttribute('d', arcPath);
          arcElement.setAttribute('stroke', 'yellow');
          arcElement.setAttribute('stroke-width', '1.5');
          arcElement.setAttribute('fill', 'none');
          arcElement.setAttribute('data-annotation-uid', annotationUID!);
          arcElement.setAttribute('data-arc', 'true');
          svgLayer?.appendChild(arcElement);
        }
      }

      // ===== TEXTO =====
      const isNewAnnotation =
        this.editData?.newAnnotation && this.editData?.annotation?.annotationUID === annotationUID;
      if (!isNewAnnotation && d.handles.textBox?.worldPosition && angle !== undefined) {
        const textCanvas = viewport.worldToCanvas(d.handles.textBox.worldPosition);

        const textLines = [`Ángulo de Tonnis: ${angle.toFixed(1)}°`];
        const lineHeight = 16;
        const svgns = 'http://www.w3.org/2000/svg';
        const svgLayer = svgDrawingHelper.svgLayerElement;

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
          textElement.setAttribute('font-size', '14px');
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
