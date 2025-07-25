// CardioThoracicRatioTool.js
import { BaseTool } from '@cornerstonejs/tools';
import { getEnabledElement } from '@cornerstonejs/core';
import { drawHandles, drawTextBox } from '@cornerstonejs/tools/dist/esm/drawing';
import { state } from '@ohif/viewer-default';

export default class CardioThoracicRatioTool extends BaseTool {
  static toolName = 'CardioThoracicRatioTool';

  constructor(props = {}) {
    super({
      name: CardioThoracicRatioTool.toolName,
      supportedInteractionTypes: ['Mouse'],
      configuration: {},
      ...props,
    });

    this._drawing = false;
    this._lines = [];
  }

  mouseDownCallback(evt) {
    const { element, currentPoints } = evt.detail;
    const { world } = currentPoints;

    if (this._lines.length === 2) {
      this._lines = []; // Reset after two lines
    }

    this._lines.push({ start: world, end: null });
    this._drawing = true;
  }

  mouseDragCallback(evt) {
    if (!this._drawing) return;
    const { world } = evt.detail.currentPoints;
    this._lines[this._lines.length - 1].end = world;
  }

  mouseUpCallback(evt) {
    this._drawing = false;
    const { element } = evt.detail;
    const enabledElement = getEnabledElement(element);
    enabledElement.invalidate();
  }

  renderAnnotation(enabledElementCtx) {
    const context = enabledElementCtx.canvasContext;
    const { viewport } = enabledElementCtx;

    context.save();
    this._lines.forEach((line, index) => {
      if (line.start && line.end) {
        drawHandles(context, viewport, [line.start, line.end], {
          color: index === 0 ? 'red' : 'blue',
          handleRadius: 3,
        });

        const distance = Math.sqrt(
          Math.pow(line.start.x - line.end.x, 2) +
          Math.pow(line.start.y - line.end.y, 2)
        );

        const midX = (line.start.x + line.end.x) / 2;
        const midY = (line.start.y + line.end.y) / 2;

        const text = index === 0 ? `Cardiac Width: ${distance.toFixed(1)} mm` : `Thoracic Width: ${distance.toFixed(1)} mm`;
        drawTextBox(context, viewport, text, { x: midX, y: midY });
      }
    });

    if (this._lines.length === 2 && this._lines[0].end && this._lines[1].end) {
      const len1 = this._getLength(this._lines[0]);
      const len2 = this._getLength(this._lines[1]);
      const ratio = len1 / len2;
      const center = viewport.getImageCenter();
      drawTextBox(context, viewport, `CTR: ${ratio.toFixed(2)}`, center);
    }

    context.restore();
  }

  _getLength(line) {
    return Math.sqrt(
      Math.pow(line.start.x - line.end.x, 2) +
      Math.pow(line.start.y - line.end.y, 2)
    );
  }
}
