import { addTool, removeTool, ProbeTool } from '@cornerstonejs/tools';

/**
 * NovaProbeTool — Probe con el valor de píxel (HU) corregido para viewports STACK.
 *
 * ── El bug de cornerstone3D (4.x y 5.x) ──────────────────────────────────────
 * En `ProbeTool._calculateCachedStats`, para targets de imagen se reasigna el
 * índice de profundidad al índice de slice del stack:
 *
 *     ijk[2] = viewport.getCurrentImageIdIndex();   // p. ej. 181
 *     value  = voxelManager.getAtIJKPoint(ijk);
 *
 * Pero en un stack el `voxelManager` es 2D (dimensiones `[cols, rows, 1]`), con
 * indexado `i + j*width + k*(width*height)`. Con cualquier slice > 0 el índice
 * se sale del array de una sola frame → `getAtIJKPoint` devuelve `undefined`,
 * `value` queda `undefined` y NO se dibuja el HU (el círculo sí, es un handle
 * aparte). En viewports de VOLUMEN no ocurre (el voxelManager abarca todas las
 * slices y la reasignación solo corre para targets `imageId:`).
 *
 * ── El arreglo ───────────────────────────────────────────────────────────────
 * Mismo patrón que el PR #2723 de cornerstone3D (que corrigió el caso análogo en
 * `PlanarFreehandROITool`): clampear el índice a las dimensiones antes de leer el
 * vóxel. En un stack `dimensions[2] === 1`, así que `k` se clampa a 0 y se lee el
 * píxel en-plano correcto. Solo se re-lee cuando el valor quedó `undefined` (el
 * síntoma del bug) y el punto está dentro del plano de la imagen, para no
 * inventar valores en probes colocados fuera de la imagen.
 */

/**
 * Rellena el `value` que el ProbeTool base dejó `undefined` por el bug del stack.
 * Idempotente: si `value` ya está definido, no hace nada. Usa solo API pública
 * (`getTargetImageData` + `voxelManager.getAtIJKPoint`).
 */
function fixProbeStackValue(tool: any, cachedStats: any): void {
  if (!cachedStats) {
    return;
  }

  for (const targetId of Object.keys(cachedStats)) {
    const stat = cachedStats[targetId];
    if (!stat || stat.value !== undefined || !Array.isArray(stat.index)) {
      continue;
    }

    const image = tool.getTargetImageData?.(targetId);
    const voxelManager = image?.voxelManager;
    const dimensions = image?.dimensions;
    if (!voxelManager || !dimensions) {
      continue;
    }

    const [i, j, k] = stat.index;

    // El punto debe estar dentro del plano; si no, es un probe fuera de la
    // imagen y debe quedarse sin valor.
    const inPlane =
      i >= 0 && i <= dimensions[0] - 1 && j >= 0 && j <= dimensions[1] - 1;
    if (!inPlane) {
      continue;
    }

    // Clampeamos a las dimensiones (en un stack, k → 0) y re-leemos el vóxel.
    const value = voxelManager.getAtIJKPoint([
      Math.max(0, Math.min(dimensions[0] - 1, i)),
      Math.max(0, Math.min(dimensions[1] - 1, j)),
      Math.max(0, Math.min(dimensions[2] - 1, k)),
    ]);
    if (value !== undefined) {
      stat.value = value;
    }
  }
}

class NovaProbeTool extends ProbeTool {
  // Mismo toolName que el Probe original: reutiliza todo el cableado existente.
  static toolName = 'Probe';

  _calculateCachedStats(
    annotation: any,
    renderingEngine: any,
    enabledElement: any,
    changeType?: any
  ): any {
    const cachedStats = super._calculateCachedStats(
      annotation,
      renderingEngine,
      enabledElement,
      changeType
    );
    fixProbeStackValue(this, cachedStats);
    return cachedStats;
  }
}

/**
 * Activa el Probe corregido de nova. Idempotente; llamar en `onModeEnter`.
 *
 * Aplica DOS mecanismos complementarios para que el fix funcione con seguridad
 * independientemente de cuándo/ cómo se instancien las herramientas:
 *
 *  (1) PARCHE DEL PROTOTIPO base `ProbeTool.prototype._calculateCachedStats`.
 *      `renderAnnotation` (una arrow-prop del constructor base) invoca
 *      `this._calculateCachedStats` dinámicamente, por lo que parchear el
 *      prototipo afecta a CUALQUIER instancia de Probe ya creada o futura, en
 *      cualquier tool group. Es el mecanismo que garantiza el arreglo aunque el
 *      tool group ya tuviera instanciado el ProbeTool por defecto (persistencia
 *      de tool groups entre navegaciones, orden de registro, etc.).
 *
 *  (2) SUSTITUCIÓN EN EL REGISTRO por `NovaProbeTool` (misma `toolName`), para
 *      que los tool groups nuevos instancien la subclase de nova. Redundante con
 *      (1) pero idempotente (fixProbeStackValue omite si el value ya existe).
 */
export function registerNovaProbeTool(): void {
  const proto: any = ProbeTool.prototype;
  if (!proto.__novaStackValueFix) {
    const original = proto._calculateCachedStats;
    proto._calculateCachedStats = function (
      annotation: any,
      renderingEngine: any,
      enabledElement: any,
      changeType: any
    ) {
      const cachedStats = original.call(this, annotation, renderingEngine, enabledElement, changeType);
      fixProbeStackValue(this, cachedStats);
      return cachedStats;
    };
    proto.__novaStackValueFix = true;
  }

  try {
    removeTool(NovaProbeTool);
  } catch (e) {
    // 'Probe' aún no estaba registrado; addTool lo añade a continuación.
  }
  addTool(NovaProbeTool);
}

export default NovaProbeTool;
