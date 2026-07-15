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

interface HilgenreinerData {
  handles: {
    hilgenreinerLine: [Types.Point3, Types.Point3]; // Línea de Hilgenreiner (orientación libre)
    leftAcetabularLine: [Types.Point3, Types.Point3]; // Línea acetabular izquierda
    rightAcetabularLine: [Types.Point3, Types.Point3]; // Línea acetabular derecha
    textBox: {
      hasMoved: boolean;
      worldPosition: Types.Point3;
    };
    activeHandleIndex: number | null;
    activeSegment: 'H' | 'L' | 'R' | null; // H=Hilgenreiner, L=Left, R=Right
  };
  cachedStats: {
    leftAngle?: number; // Ángulo acetabular izquierdo
    rightAngle?: number; // Ángulo acetabular derecho
    leftIntersection?: Types.Point3; // Punto de intersección izquierdo
    rightIntersection?: Types.Point3; // Punto de intersección derecho
  };
}

interface HilgenreinerAnnotation {
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
  data: HilgenreinerData;
}

export default class HilgenreinerAngleTool extends AnnotationTool {
  public static toolName = 'HilgenreinerAngle';

  private editData: {
    annotation: HilgenreinerAnnotation;
    viewportIdsToRender: string[];
    handleIndex: number;
    newAnnotation: boolean;
    currentSegment: 'H' | 'L' | 'R';
    clickCount: number;
    movingTextBox?: boolean;
    isEditingHandle?: boolean;
    hasDragged?: boolean;
  } | null = null;

  private _pendingHandleEdit: {
    annotation: HilgenreinerAnnotation;
    handleInfo: { point: Types.Point3; index: number; segment: 'H' | 'L' | 'R' | 'text' };
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
    annotation: HilgenreinerAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): { point: Types.Point3; index: number; segment: 'H' | 'L' | 'R' | 'text' } | null {
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) return null;

    const { viewport } = enabledElement;
    const data = annotation.data as HilgenreinerData;

    // Verificar área de texto
    if (data.handles.textBox && data.handles.textBox.worldPosition) {
      const canvasTextBox = viewport.worldToCanvas(data.handles.textBox.worldPosition);
      const textWidth = 200;
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

    // Verificar handles de la línea de Hilgenreiner
    for (let i = 0; i < data.handles.hilgenreinerLine.length; i++) {
      const point = data.handles.hilgenreinerLine[i];
      const canvasPoint = viewport.worldToCanvas(point);
      const distance = Math.hypot(
        canvasPoint[0] - canvasCoords[0],
        canvasPoint[1] - canvasCoords[1]
      );
      if (distance <= proximity) {
        return { point, index: i, segment: 'H' };
      }
    }

    // Verificar handles de la línea acetabular izquierda
    for (let i = 0; i < data.handles.leftAcetabularLine.length; i++) {
      const point = data.handles.leftAcetabularLine[i];
      const canvasPoint = viewport.worldToCanvas(point);
      const distance = Math.hypot(
        canvasPoint[0] - canvasCoords[0],
        canvasPoint[1] - canvasCoords[1]
      );
      if (distance <= proximity) {
        return { point, index: i, segment: 'L' };
      }
    }

    // Verificar handles de la línea acetabular derecha
    for (let i = 0; i < data.handles.rightAcetabularLine.length; i++) {
      const point = data.handles.rightAcetabularLine[i];
      const canvasPoint = viewport.worldToCanvas(point);
      const distance = Math.hypot(
        canvasPoint[0] - canvasCoords[0],
        canvasPoint[1] - canvasCoords[1]
      );
      if (distance <= proximity) {
        return { point, index: i, segment: 'R' };
      }
    }

    return null;
  }

  isPointNearTool = (
    element: HTMLDivElement,
    annotation: HilgenreinerAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    try {
      const enabledElement = getEnabledElement(element);
      if (!enabledElement) return false;

      const { viewport } = enabledElement;
      const data = annotation.data as HilgenreinerData;

      // Verificar área de texto
      const { textBox } = data.handles;
      if (textBox && textBox.worldPosition) {
        const canvasTextBox = viewport.worldToCanvas(textBox.worldPosition);
        const textWidth = 200;
        const textHeight = 50;

        const isInTextArea =
          canvasCoords[0] >= canvasTextBox[0] - 10 &&
          canvasCoords[0] <= canvasTextBox[0] + textWidth &&
          canvasCoords[1] >= canvasTextBox[1] - 10 &&
          canvasCoords[1] <= canvasTextBox[1] + textHeight;

        if (isInTextArea) return true;
      }

      // Verificar handles línea de Hilgenreiner
      for (const point of data.handles.hilgenreinerLine) {
        const canvasPoint = viewport.worldToCanvas(point);
        const distance = Math.hypot(
          canvasPoint[0] - canvasCoords[0],
          canvasPoint[1] - canvasCoords[1]
        );
        if (distance <= proximity) return true;
      }

      // Verificar handles línea acetabular izquierda
      for (const point of data.handles.leftAcetabularLine) {
        const canvasPoint = viewport.worldToCanvas(point);
        const distance = Math.hypot(
          canvasPoint[0] - canvasCoords[0],
          canvasPoint[1] - canvasCoords[1]
        );
        if (distance <= proximity) return true;
      }

      // Verificar handles línea acetabular derecha
      for (const point of data.handles.rightAcetabularLine) {
        const canvasPoint = viewport.worldToCanvas(point);
        const distance = Math.hypot(
          canvasPoint[0] - canvasCoords[0],
          canvasPoint[1] - canvasCoords[1]
        );
        if (distance <= proximity) return true;
      }

      // Verificar línea de Hilgenreiner
      const [h1, h2] = data.handles.hilgenreinerLine;
      const canvasH1 = viewport.worldToCanvas(h1);
      const canvasH2 = viewport.worldToCanvas(h2);
      if (this._isPointNearLine(canvasCoords, canvasH1, canvasH2, proximity)) return true;

      // Verificar línea acetabular izquierda
      const [l1, l2] = data.handles.leftAcetabularLine;
      const canvasL1 = viewport.worldToCanvas(l1);
      const canvasL2 = viewport.worldToCanvas(l2);
      if (this._isPointNearLine(canvasCoords, canvasL1, canvasL2, proximity)) return true;

      // Verificar línea acetabular derecha
      const [r1, r2] = data.handles.rightAcetabularLine;
      const canvasR1 = viewport.worldToCanvas(r1);
      const canvasR2 = viewport.worldToCanvas(r2);
      if (this._isPointNearLine(canvasCoords, canvasR1, canvasR2, proximity)) return true;
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
    annotation: HilgenreinerAnnotation,
    handle: any
  ): void => {
    const { element, currentPoints } = evt.detail;
    const data = annotation.data as HilgenreinerData;
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
      const textWidth = 200;
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
          currentSegment: 'H',
          clickCount: 6,
          movingTextBox: true,
          isEditingHandle: true,
        };
        this._activateDraw(element);
        this._triggerRender(element);
        return;
      }
    }

    if (handle) {
      // Buscar en línea de Hilgenreiner
      let handleIndex = data.handles.hilgenreinerLine.findIndex(
        p =>
          p === handle ||
          (Array.isArray(handle) && p[0] === handle[0] && p[1] === handle[1] && p[2] === handle[2])
      );

      if (handleIndex !== -1) {
        data.handles.activeHandleIndex = handleIndex;
        data.handles.activeSegment = 'H';
        this.editData = {
          annotation,
          viewportIdsToRender: [evt.detail.viewportId || ''],
          handleIndex,
          newAnnotation: false,
          currentSegment: 'H',
          clickCount: 6,
          isEditingHandle: true,
        };
        this._activateDraw(element);
      } else {
        // Buscar en línea acetabular izquierda
        handleIndex = data.handles.leftAcetabularLine.findIndex(
          p =>
            p === handle ||
            (Array.isArray(handle) &&
              p[0] === handle[0] &&
              p[1] === handle[1] &&
              p[2] === handle[2])
        );

        if (handleIndex !== -1) {
          data.handles.activeHandleIndex = handleIndex;
          data.handles.activeSegment = 'L';
          this.editData = {
            annotation,
            viewportIdsToRender: [evt.detail.viewportId || ''],
            handleIndex,
            newAnnotation: false,
            currentSegment: 'L',
            clickCount: 6,
            isEditingHandle: true,
          };
          this._activateDraw(element);
        } else {
          // Buscar en línea acetabular derecha
          handleIndex = data.handles.rightAcetabularLine.findIndex(
            p =>
              p === handle ||
              (Array.isArray(handle) &&
                p[0] === handle[0] &&
                p[1] === handle[1] &&
                p[2] === handle[2])
          );

          if (handleIndex !== -1) {
            data.handles.activeHandleIndex = handleIndex;
            data.handles.activeSegment = 'R';
            this.editData = {
              annotation,
              viewportIdsToRender: [evt.detail.viewportId || ''],
              handleIndex,
              newAnnotation: false,
              currentSegment: 'R',
              clickCount: 6,
              isEditingHandle: true,
            };
            this._activateDraw(element);
          }
        }
      }
    }
    this._triggerRender(element);
  };

  toolSelectedCallback = (
    evt: CstTypes.InteractionEventType,
    annotation: HilgenreinerAnnotation
  ): void => {
    const data = annotation.data as HilgenreinerData;
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

  addNewAnnotation = (evt: CstTypes.InteractionEventType): HilgenreinerAnnotation | undefined => {
    if (this.editData) return this.editData.annotation;

    const { element, currentPoints } = evt.detail;
    const canvasCoords = currentPoints.canvas as Types.Point2;

    const existingAnnotations = annotationState.getAnnotations(
      this.getToolName(),
      element
    ) as HilgenreinerAnnotation[];

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

    const newAnnotation: HilgenreinerAnnotation = {
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
          hilgenreinerLine: [[...worldPos] as Types.Point3, [...worldPos] as Types.Point3],
          leftAcetabularLine: [[...worldPos] as Types.Point3, [...worldPos] as Types.Point3],
          rightAcetabularLine: [[...worldPos] as Types.Point3, [...worldPos] as Types.Point3],
          textBox: { hasMoved: false, worldPosition: [...worldPos] as Types.Point3 },
          activeHandleIndex: 1,
          activeSegment: 'H',
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
      currentSegment: 'H',
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
    const data = annotation.data as HilgenreinerData;

    // Modo edición click-click
    if (isEditingHandle && !hasDragged) {
      const { activeSegment, activeHandleIndex } = data.handles;
      if (activeSegment === 'H' && activeHandleIndex !== null) {
        data.handles.hilgenreinerLine[activeHandleIndex] = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'L' && activeHandleIndex !== null) {
        data.handles.leftAcetabularLine[activeHandleIndex] = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'R' && activeHandleIndex !== null) {
        data.handles.rightAcetabularLine[activeHandleIndex] = [...worldPos] as Types.Point3;
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

    // Flujo de creación: 6 clicks
    // Click 1: primer punto de Hilgenreiner (ya hecho en addNewAnnotation)
    // Click 2: segundo punto de Hilgenreiner
    // Click 3: primer punto de línea acetabular izquierda
    // Click 4: segundo punto de línea acetabular izquierda
    // Click 5: primer punto de línea acetabular derecha
    // Click 6: segundo punto de línea acetabular derecha
    if (clickCount === 0) {
      // Segundo click: fija punto 2 de Hilgenreiner
      data.handles.hilgenreinerLine[1] = [...worldPos] as Types.Point3;
      this.editData.clickCount = 1;
      this.editData.currentSegment = 'L';
      data.handles.activeSegment = 'L';
      data.handles.activeHandleIndex = 0;
      annotation.invalidated = true;
      this._calculateStats(annotation);
    } else if (clickCount === 1) {
      // Tercer click: fija punto 1 de línea acetabular izquierda
      data.handles.leftAcetabularLine[0] = [...worldPos] as Types.Point3;
      data.handles.leftAcetabularLine[1] = [...worldPos] as Types.Point3;
      this.editData.clickCount = 2;
      data.handles.activeHandleIndex = 1;
      annotation.invalidated = true;
      this._calculateStats(annotation);
    } else if (clickCount === 2) {
      // Cuarto click: fija punto 2 de línea acetabular izquierda
      data.handles.leftAcetabularLine[1] = [...worldPos] as Types.Point3;
      this.editData.clickCount = 3;
      this.editData.currentSegment = 'R';
      data.handles.activeSegment = 'R';
      data.handles.activeHandleIndex = 0;
      annotation.invalidated = true;
      this._calculateStats(annotation);
    } else if (clickCount === 3) {
      // Quinto click: fija punto 1 de línea acetabular derecha
      data.handles.rightAcetabularLine[0] = [...worldPos] as Types.Point3;
      data.handles.rightAcetabularLine[1] = [...worldPos] as Types.Point3;
      this.editData.clickCount = 4;
      data.handles.activeHandleIndex = 1;
      annotation.invalidated = true;
      this._calculateStats(annotation);
    } else if (clickCount === 4) {
      // Sexto click: fija punto 2 de línea acetabular derecha y termina
      data.handles.rightAcetabularLine[1] = [...worldPos] as Types.Point3;
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
      const data = annotation.data as HilgenreinerData;
      annotation.highlighted = true;

      if (handleInfo.segment === 'text') {
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: -1,
          newAnnotation: false,
          currentSegment: 'H',
          clickCount: 6,
          movingTextBox: true,
          isEditingHandle: true,
          hasDragged: false,
        };
      } else {
        data.handles.activeHandleIndex = handleInfo.index;
        data.handles.activeSegment = handleInfo.segment as 'H' | 'L' | 'R';
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: handleInfo.index,
          newAnnotation: false,
          currentSegment: handleInfo.segment as 'H' | 'L' | 'R',
          clickCount: 6,
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
      const data = annotation.data as HilgenreinerData;
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
      const data = annotation.data as HilgenreinerData;
      annotation.highlighted = true;
      if (handleInfo.segment === 'text') {
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: -1,
          newAnnotation: false,
          currentSegment: 'H',
          clickCount: 6,
          movingTextBox: true,
          isEditingHandle: true,
          hasDragged: true,
        };
      } else {
        data.handles.activeHandleIndex = handleInfo.index;
        data.handles.activeSegment = handleInfo.segment as 'H' | 'L' | 'R';
        this.editData = {
          annotation,
          viewportIdsToRender: [viewportId],
          handleIndex: handleInfo.index,
          newAnnotation: false,
          currentSegment: handleInfo.segment as 'H' | 'L' | 'R',
          clickCount: 6,
          isEditingHandle: true,
          hasDragged: true,
        };
      }
      this._pendingHandleEdit = null;
      this._triggerRender(element);
    }

    if (!this.editData) return;
    const { annotation, clickCount, movingTextBox, isEditingHandle } = this.editData;
    const data = annotation.data as HilgenreinerData;

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
      if (activeSegment === 'H' && activeHandleIndex !== null) {
        data.handles.hilgenreinerLine[activeHandleIndex] = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'L' && activeHandleIndex !== null) {
        data.handles.leftAcetabularLine[activeHandleIndex] = [...worldPos] as Types.Point3;
      } else if (activeSegment === 'R' && activeHandleIndex !== null) {
        data.handles.rightAcetabularLine[activeHandleIndex] = [...worldPos] as Types.Point3;
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
      data.handles.hilgenreinerLine[1] = [...worldPos] as Types.Point3;
    } else if (clickCount === 1) {
      data.handles.leftAcetabularLine[0] = [...worldPos] as Types.Point3;
      data.handles.leftAcetabularLine[1] = [...worldPos] as Types.Point3;
    } else if (clickCount === 2) {
      data.handles.leftAcetabularLine[1] = [...worldPos] as Types.Point3;
    } else if (clickCount === 3) {
      data.handles.rightAcetabularLine[0] = [...worldPos] as Types.Point3;
      data.handles.rightAcetabularLine[1] = [...worldPos] as Types.Point3;
    } else if (clickCount === 4) {
      data.handles.rightAcetabularLine[1] = [...worldPos] as Types.Point3;
    }
    annotation.invalidated = true;
    this._calculateStats(annotation);
    if (!data.handles.textBox.hasMoved) this._updateTextBoxPosition(annotation);
    this._triggerRender(element);
    evt.preventDefault();
  };

  private _updateTextBoxPosition(annotation: HilgenreinerAnnotation) {
    const data = annotation.data as HilgenreinerData;
    const [h1, h2] = data.handles.hilgenreinerLine;

    // Colocar el texto debajo del punto medio de la línea de Hilgenreiner
    const midPoint = vec3.lerp(vec3.create(), h1, h2, 0.5);
    const offset = vec3.fromValues(0, 50, 0);
    data.handles.textBox.worldPosition = vec3.add(vec3.create(), midPoint, offset) as Types.Point3;
  }

  private _calculateStats(annotation: HilgenreinerAnnotation) {
    const data = annotation.data as HilgenreinerData;
    const [h1, h2] = data.handles.hilgenreinerLine;
    const [l1, l2] = data.handles.leftAcetabularLine;
    const [r1, r2] = data.handles.rightAcetabularLine;

    // Vector de la línea de Hilgenreiner
    const hilgenreinerVector = vec3.subtract(vec3.create(), h2, h1);
    const hilgenreinerLength = vec3.length(hilgenreinerVector);

    if (hilgenreinerLength === 0) {
      data.cachedStats = { leftAngle: 0, rightAngle: 0 };
      return;
    }

    // Normalizar vector de Hilgenreiner
    const hilgenreinerNorm = vec3.normalize(vec3.create(), hilgenreinerVector);

    // Calcular ángulo izquierdo
    const leftVector = vec3.subtract(vec3.create(), l2, l1);
    const leftLength = vec3.length(leftVector);
    let leftAngle = 0;
    let leftIntersection: Types.Point3 | undefined;

    if (leftLength > 0) {
      const leftNorm = vec3.normalize(vec3.create(), leftVector);
      const leftDot = vec3.dot(hilgenreinerNorm, leftNorm);
      const clampedLeftDot = Math.max(-1, Math.min(1, leftDot));
      const leftAngleRad = Math.acos(Math.abs(clampedLeftDot));
      leftAngle = (leftAngleRad * 180) / Math.PI;
      if (leftAngle > 90) {
        leftAngle = 180 - leftAngle;
      }
      leftIntersection = this._calculateLineIntersection(h1, h2, l1, l2);
    }

    // Calcular ángulo derecho
    const rightVector = vec3.subtract(vec3.create(), r2, r1);
    const rightLength = vec3.length(rightVector);
    let rightAngle = 0;
    let rightIntersection: Types.Point3 | undefined;

    if (rightLength > 0) {
      const rightNorm = vec3.normalize(vec3.create(), rightVector);
      const rightDot = vec3.dot(hilgenreinerNorm, rightNorm);
      const clampedRightDot = Math.max(-1, Math.min(1, rightDot));
      const rightAngleRad = Math.acos(Math.abs(clampedRightDot));
      rightAngle = (rightAngleRad * 180) / Math.PI;
      if (rightAngle > 90) {
        rightAngle = 180 - rightAngle;
      }
      rightIntersection = this._calculateLineIntersection(h1, h2, r1, r2);
    }

    data.cachedStats = {
      leftAngle,
      rightAngle,
      leftIntersection,
      rightIntersection,
    };
  }

  // Calcula el punto de intersección de dos líneas (extendidas infinitamente)
  private _calculateLineIntersection(
    p1: Types.Point3,
    p2: Types.Point3,
    p3: Types.Point3,
    p4: Types.Point3
  ): Types.Point3 | undefined {
    const x1 = p1[0],
      y1 = p1[1];
    const x2 = p2[0],
      y2 = p2[1];
    const x3 = p3[0],
      y3 = p3[1];
    const x4 = p4[0],
      y4 = p4[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    if (Math.abs(denom) < 1e-10) {
      return undefined;
    }

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

    const intersectX = x1 + t * (x2 - x1);
    const intersectY = y1 + t * (y2 - y1);
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
    ) as HilgenreinerAnnotation[];

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
    ) as HilgenreinerAnnotation[];
    if (!annotations?.length) return false;

    for (const ann of annotations) {
      // Verificar si la anotación pertenece a esta imagen/slice
      const referencedImageId = ann.metadata?.referencedImageId;
      if (referencedImageId && currentImageId && referencedImageId !== currentImageId) {
        continue;
      }

      const { annotationUID, data, highlighted } = ann;
      const d = data as HilgenreinerData;
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

      // ===== LÍNEA DE HILGENREINER (AMARILLO) =====
      const [h1, h2] = d.handles.hilgenreinerLine;
      const canvasH1 = viewport.worldToCanvas(h1);
      const canvasH2 = viewport.worldToCanvas(h2);
      const isHandleH0Active = d.handles.activeSegment === 'H' && d.handles.activeHandleIndex === 0;
      const isHandleH1Active = d.handles.activeSegment === 'H' && d.handles.activeHandleIndex === 1;

      if (isCursorNearPoint(canvasH1) || isHandleH0Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-H-0', [canvasH1], {
          color: isHandleH0Active ? 'lime' : 'yellow',
          handleRadius,
        });
      }
      if (isCursorNearPoint(canvasH2) || isHandleH1Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-H-1', [canvasH2], {
          color: isHandleH1Active ? 'lime' : 'yellow',
          handleRadius,
        });
      }
      drawLine(svgDrawingHelper, annotationUID!, 'hilgenreiner-line', canvasH1, canvasH2, {
        color: 'yellow',
        lineWidth: 1.5,
        lineDash: [5, 5],
      });

      // Etiqueta "Línea de Hilgenreiner" en el centro de la línea
      const hilgenreinerMidCanvas = [
        (canvasH1[0] + canvasH2[0]) / 2,
        (canvasH1[1] + canvasH2[1]) / 2 - 10,
      ];

      // ===== LÍNEA ACETABULAR IZQUIERDA (CYAN) =====
      const [l1, l2] = d.handles.leftAcetabularLine;
      const canvasL1 = viewport.worldToCanvas(l1);
      const canvasL2 = viewport.worldToCanvas(l2);
      const isHandleL0Active = d.handles.activeSegment === 'L' && d.handles.activeHandleIndex === 0;
      const isHandleL1Active = d.handles.activeSegment === 'L' && d.handles.activeHandleIndex === 1;

      if (isCursorNearPoint(canvasL1) || isHandleL0Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-L-0', [canvasL1], {
          color: isHandleL0Active ? 'lime' : 'cyan',
          handleRadius,
        });
      }
      if (isCursorNearPoint(canvasL2) || isHandleL1Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-L-1', [canvasL2], {
          color: isHandleL1Active ? 'lime' : 'cyan',
          handleRadius,
        });
      }
      drawLine(svgDrawingHelper, annotationUID!, 'left-acetabular-line', canvasL1, canvasL2, {
        color: 'cyan',
        lineWidth: 1.5,
        lineDash: [5, 5],
      });

      // ===== LÍNEA ACETABULAR DERECHA (MAGENTA) =====
      const [r1, r2] = d.handles.rightAcetabularLine;
      const canvasR1 = viewport.worldToCanvas(r1);
      const canvasR2 = viewport.worldToCanvas(r2);
      const isHandleR0Active = d.handles.activeSegment === 'R' && d.handles.activeHandleIndex === 0;
      const isHandleR1Active = d.handles.activeSegment === 'R' && d.handles.activeHandleIndex === 1;

      if (isCursorNearPoint(canvasR1) || isHandleR0Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-R-0', [canvasR1], {
          color: isHandleR0Active ? 'lime' : '#FF00FF',
          handleRadius,
        });
      }
      if (isCursorNearPoint(canvasR2) || isHandleR1Active || highlighted) {
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-R-1', [canvasR2], {
          color: isHandleR1Active ? 'lime' : '#FF00FF',
          handleRadius,
        });
      }
      drawLine(svgDrawingHelper, annotationUID!, 'right-acetabular-line', canvasR1, canvasR2, {
        color: '#FF00FF',
        lineWidth: 1.5,
        lineDash: [5, 5],
      });

      // ===== PUNTOS DE INTERSECCIÓN Y ARCOS =====
      const { leftAngle, rightAngle, leftIntersection, rightIntersection } = d.cachedStats || {};
      const svgns = 'http://www.w3.org/2000/svg';
      const arcRadius = 60; // Radio del arco en píxeles

      // Arco izquierdo - entre línea de Hilgenreiner y línea acetabular izquierda
      if (leftIntersection && leftAngle !== undefined && leftAngle > 0) {
        const canvasLeftInt = viewport.worldToCanvas(leftIntersection);
        drawHandles(svgDrawingHelper, annotationUID!, 'handle-left-intersection', [canvasLeftInt], {
          color: 'white',
          handleRadius: 4,
        });

        // Usar las direcciones de las líneas desde el punto de intersección
        // Dirección de Hilgenreiner (usar ambos lados para determinar la dirección correcta)
        const dirH1 = [canvasH1[0] - canvasLeftInt[0], canvasH1[1] - canvasLeftInt[1]];
        const dirH2 = [canvasH2[0] - canvasLeftInt[0], canvasH2[1] - canvasLeftInt[1]];

        // Dirección de la línea acetabular izquierda
        const dirL1 = [canvasL1[0] - canvasLeftInt[0], canvasL1[1] - canvasLeftInt[1]];
        const dirL2 = [canvasL2[0] - canvasLeftInt[0], canvasL2[1] - canvasLeftInt[1]];

        // Usar el lado de la línea de Hilgenreiner más cercano a la línea acetabular
        const angleH1 = Math.atan2(dirH1[1], dirH1[0]);
        const angleH2 = Math.atan2(dirH2[1], dirH2[0]);
        const angleL1 = Math.atan2(dirL1[1], dirL1[0]);
        const angleL2 = Math.atan2(dirL2[1], dirL2[0]);

        // Seleccionar el punto de la línea acetabular que está "abajo" (mayor Y en canvas = abajo)
        const canvasLRef = canvasL2[1] > canvasL1[1] ? canvasL2 : canvasL1;
        const angleLRef = Math.atan2(
          canvasLRef[1] - canvasLeftInt[1],
          canvasLRef[0] - canvasLeftInt[0]
        );

        // Seleccionar el lado de Hilgenreiner que forma el ángulo más pequeño con la línea acetabular
        const diffH1 = Math.abs(angleLRef - angleH1);
        const diffH2 = Math.abs(angleLRef - angleH2);
        const normalizedDiffH1 = diffH1 > Math.PI ? 2 * Math.PI - diffH1 : diffH1;
        const normalizedDiffH2 = diffH2 > Math.PI ? 2 * Math.PI - diffH2 : diffH2;
        const angleHRef = normalizedDiffH1 < normalizedDiffH2 ? angleH1 : angleH2;

        // Crear el arco
        const startX = canvasLeftInt[0] + arcRadius * Math.cos(angleHRef);
        const startY = canvasLeftInt[1] + arcRadius * Math.sin(angleHRef);
        const endX = canvasLeftInt[0] + arcRadius * Math.cos(angleLRef);
        const endY = canvasLeftInt[1] + arcRadius * Math.sin(angleLRef);

        // Calcular la diferencia angular normalizada
        let angleDiff = angleLRef - angleHRef;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;

        const sweepFlag = angleDiff > 0 ? 1 : 0;
        const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0;

        const arcPath = `M ${startX} ${startY} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;

        if (svgLayer) {
          svgLayer
            .querySelectorAll(`[data-annotation-uid="${annotationUID}"][data-arc-left]`)
            .forEach((el: Element) => el.remove());
        }

        const arcElement = document.createElementNS(svgns, 'path');
        arcElement.setAttribute('d', arcPath);
        arcElement.setAttribute('stroke', 'cyan');
        arcElement.setAttribute('stroke-width', '1.5');
        arcElement.setAttribute('fill', 'none');
        arcElement.setAttribute('data-annotation-uid', annotationUID!);
        arcElement.setAttribute('data-arc-left', 'true');
        svgLayer?.appendChild(arcElement);
      }

      // Arco derecho - entre línea de Hilgenreiner y línea acetabular derecha
      if (rightIntersection && rightAngle !== undefined && rightAngle > 0) {
        const canvasRightInt = viewport.worldToCanvas(rightIntersection);
        drawHandles(
          svgDrawingHelper,
          annotationUID!,
          'handle-right-intersection',
          [canvasRightInt],
          {
            color: 'white',
            handleRadius: 4,
          }
        );

        // Direcciones desde el punto de intersección
        const dirH1 = [canvasH1[0] - canvasRightInt[0], canvasH1[1] - canvasRightInt[1]];
        const dirH2 = [canvasH2[0] - canvasRightInt[0], canvasH2[1] - canvasRightInt[1]];
        const dirR1 = [canvasR1[0] - canvasRightInt[0], canvasR1[1] - canvasRightInt[1]];
        const dirR2 = [canvasR2[0] - canvasRightInt[0], canvasR2[1] - canvasRightInt[1]];

        const angleH1 = Math.atan2(dirH1[1], dirH1[0]);
        const angleH2 = Math.atan2(dirH2[1], dirH2[0]);

        // Seleccionar el punto de la línea acetabular que está "abajo"
        const canvasRRef = canvasR2[1] > canvasR1[1] ? canvasR2 : canvasR1;
        const angleRRef = Math.atan2(
          canvasRRef[1] - canvasRightInt[1],
          canvasRRef[0] - canvasRightInt[0]
        );

        // Seleccionar el lado de Hilgenreiner que forma el ángulo más pequeño
        const diffH1 = Math.abs(angleRRef - angleH1);
        const diffH2 = Math.abs(angleRRef - angleH2);
        const normalizedDiffH1 = diffH1 > Math.PI ? 2 * Math.PI - diffH1 : diffH1;
        const normalizedDiffH2 = diffH2 > Math.PI ? 2 * Math.PI - diffH2 : diffH2;
        const angleHRef = normalizedDiffH1 < normalizedDiffH2 ? angleH1 : angleH2;

        const startX = canvasRightInt[0] + arcRadius * Math.cos(angleHRef);
        const startY = canvasRightInt[1] + arcRadius * Math.sin(angleHRef);
        const endX = canvasRightInt[0] + arcRadius * Math.cos(angleRRef);
        const endY = canvasRightInt[1] + arcRadius * Math.sin(angleRRef);

        let angleDiff = angleRRef - angleHRef;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;

        const sweepFlag = angleDiff > 0 ? 1 : 0;
        const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0;

        const arcPath = `M ${startX} ${startY} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;

        if (svgLayer) {
          svgLayer
            .querySelectorAll(`[data-annotation-uid="${annotationUID}"][data-arc-right]`)
            .forEach((el: Element) => el.remove());
        }

        const arcElement = document.createElementNS(svgns, 'path');
        arcElement.setAttribute('d', arcPath);
        arcElement.setAttribute('stroke', '#FF00FF');
        arcElement.setAttribute('stroke-width', '1.5');
        arcElement.setAttribute('fill', 'none');
        arcElement.setAttribute('data-annotation-uid', annotationUID!);
        arcElement.setAttribute('data-arc-right', 'true');
        svgLayer?.appendChild(arcElement);
      }

      // ===== TEXTO =====
      const isNewAnnotation =
        this.editData?.newAnnotation && this.editData?.annotation?.annotationUID === annotationUID;
      if (!isNewAnnotation && leftAngle !== undefined && rightAngle !== undefined) {
        const svgns = 'http://www.w3.org/2000/svg';

        if (svgLayer) {
          svgLayer
            .querySelectorAll(`[data-annotation-uid="${annotationUID}"][data-text-line]`)
            .forEach((el: Element) => el.remove());
        }

        // Etiqueta de la línea de Hilgenreiner
        const hilgenreinerLabel = document.createElementNS(svgns, 'text');
        hilgenreinerLabel.setAttribute('x', String(hilgenreinerMidCanvas[0]));
        hilgenreinerLabel.setAttribute('y', String(hilgenreinerMidCanvas[1]));
        hilgenreinerLabel.setAttribute('fill', 'yellow');
        hilgenreinerLabel.setAttribute('font-size', '13px');
        hilgenreinerLabel.setAttribute(
          'font-family',
          'Helvetica Neue, Helvetica, Arial, sans-serif'
        );
        hilgenreinerLabel.setAttribute('text-anchor', 'middle');
        hilgenreinerLabel.setAttribute('data-annotation-uid', annotationUID!);
        hilgenreinerLabel.setAttribute('data-text-line', 'hilgenreiner-label');
        hilgenreinerLabel.setAttribute(
          'style',
          'text-shadow: 1px 1px 0px rgba(0,0,0,0.8), -1px -1px 0px rgba(0,0,0,0.8), 1px -1px 0px rgba(0,0,0,0.8), -1px 1px 0px rgba(0,0,0,0.8); pointer-events: none;'
        );
        hilgenreinerLabel.textContent = 'Línea de Hilgenreiner';
        svgLayer?.appendChild(hilgenreinerLabel);

        // Texto de resumen con los ángulos
        // Determinar automáticamente cuál es izquierda y derecha basándose en la posición X
        if (d.handles.textBox?.worldPosition) {
          const textCanvas = viewport.worldToCanvas(d.handles.textBox.worldPosition);

          // Obtener posición X de las intersecciones para determinar izq/der
          let actualLeftAngle = leftAngle;
          let actualRightAngle = rightAngle;

          if (leftIntersection && rightIntersection) {
            const canvasLeftInt = viewport.worldToCanvas(leftIntersection);
            const canvasRightInt = viewport.worldToCanvas(rightIntersection);

            // Si la "izquierda" está realmente a la derecha en la imagen, intercambiar
            if (canvasLeftInt[0] > canvasRightInt[0]) {
              actualLeftAngle = rightAngle;
              actualRightAngle = leftAngle;
            }
          }

          const textLines = [
            `Ángulo Acetabular Izq: ${actualLeftAngle.toFixed(1)}°`,
            `Ángulo Acetabular Der: ${actualRightAngle.toFixed(1)}°`,
          ];
          const lineHeight = 16;

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
