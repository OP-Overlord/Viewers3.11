/**
 * detectDeviceCapabilities
 * ------------------------------------------------------------------------------
 * Sonda SÍNCRONA y MEMOIZADA de la capacidad gráfica del equipo. Se usa para
 * decidir si el visor puede ejecutar con seguridad funcionalidades volumétricas
 * pesadas (MPR, Volume Rendering, viewports 3D) o si, por el contrario, deben
 * deshabilitarse / avisarse para evitar el crash del visor (pérdida de contexto
 * WebGL, "volumen no inicializado", agotamiento de GPU).
 *
 * La detección crea UNA sola vez un contexto WebGL desechable y lee:
 *   - UNMASKED_RENDERER_WEBGL / UNMASKED_VENDOR_WEBGL (string real de la GPU)
 *   - MAX_TEXTURE_SIZE (límite de textura 2D)
 *   - MAX_3D_TEXTURE_SIZE (límite de textura 3D, solo WebGL2 → clave para volúmenes)
 *   - navigator.deviceMemory / navigator.hardwareConcurrency
 *
 * Es síncrona a propósito: el evaluador de toolbar de OHIF es síncrono.
 */

export type DeviceTier =
  | 'software'
  | 'integrated'
  /** Integrada moderna sobre equipo con recursos de estación de trabajo. */
  | 'integratedHigh'
  | 'dedicated'
  | 'unknown';

export interface DeviceCapabilities {
  /** Clasificación gruesa de la GPU. */
  tier: DeviceTier;
  /** Cadena cruda del renderizador (p.ej. "ANGLE (Intel, Intel(R) UHD Graphics ...)"). */
  renderer: string;
  /** Cadena cruda del fabricante. */
  vendor: string;
  /** Límite de textura 2D (px por lado). */
  maxTextureSize: number;
  /** Límite de textura 3D (px por lado). 0 si no hay WebGL2. */
  max3DTextureSize: number;
  /** Si el contexto obtenido fue WebGL2. */
  webgl2: boolean;
  /** RAM aproximada en GB expuesta por el navegador (puede ser undefined). */
  deviceMemoryGB?: number;
  /** Núcleos lógicos (puede ser undefined). */
  logicalCores?: number;
}

let cached: DeviceCapabilities | null = null;
let override: Partial<DeviceCapabilities> | null = null;

const SOFTWARE_HINTS = [
  'swiftshader',
  'llvmpipe',
  'software',
  'microsoft basic render',
  'basic render driver',
];

const INTEGRATED_HINTS = [
  'intel hd',
  'intel(r) hd',
  'intel uhd',
  'intel(r) uhd',
  'iris',
  'intel(r) iris',
  'uhd graphics',
  'hd graphics',
  'mali',
  'adreno',
  'powervr',
  'apple gpu', // viewers móviles antiguos
  'vega 3',
  'vega 6',
  'vega 8',
  'radeon(tm) graphics', // iGPU de APUs AMD
];

const DEDICATED_HINTS = [
  'nvidia',
  'geforce',
  'rtx',
  'gtx',
  'quadro',
  'tesla',
  'radeon rx',
  'radeon pro',
  'firepro',
  'apple m', // Apple Silicon (M1/M2/M3...): GPU potente
  'arc a', // Intel Arc dedicada
];

// GPU "dedicadas" de gama de ENTRADA (portátiles Optimus, low-end): aunque sean
// discretas, no tienen músculo para volúmenes grandes y crashean igual que una
// integrada. Se detectan ANTES que DEDICATED_HINTS y se tratan como 'integrated'.
// Ojo con los espacios: 'geforce gt ' NO debe capturar 'geforce gtx'.
const WEAK_DEDICATED_HINTS = [
  'geforce mx', // MX110..MX570 (entrada de portátil)
  '910m',
  '920m',
  '930m',
  '940m',
  '945m',
  '910mx',
  '920mx',
  '930mx', // <- caso reportado: GeForce 930MX
  '940mx',
  'geforce gt ', // GT 1030 / 710 / 720 / 730 / 740 (entrada)
  'radeon r5',
  'radeon r7 m',
  'radeon 520',
  'radeon 530',
  'radeon 535',
  'radeon 540',
  'radeon 610',
  'radeon 620',
  'radeon 625',
  'radeon hd', // generaciones antiguas
];

// ---------------------------------------------------------------------------
// Sub-tier "integrada moderna" (integratedHigh)
// ---------------------------------------------------------------------------
// En una GPU integrada la VRAM es RAM del sistema compartida, así que el techo
// real de un volumen depende de la RAM del equipo, no solo del modelo de iGPU.
// Un Iris Xe sobre una estación de 32 GB tiene mucho más margen que un Intel UHD
// sobre un portátil de 8 GB, y hasta ahora ambos caían en el mismo tier.
//
// Cuando el equipo tiene recursos de estación de trabajo, la integrada se
// promueve a 'integratedHigh', que usa umbrales intermedios (ver thresholds.ts).
//
// OJO: esto NO aplica a las dedicadas de gama de entrada (WEAK_DEDICATED_HINTS).
// Esas tienen su propia VRAM, pequeña y fija; la RAM del sistema no las ayuda.
//
// Limitación conocida: `navigator.deviceMemory` solo existe en navegadores
// Chromium y está topado en 8 (32 GB reporta 8). En Firefox/Safari es undefined
// y no se promueve: se queda en el tier conservador.
const WORKSTATION_MIN_MEMORY_GB = 8;
const WORKSTATION_MIN_CORES = 12;
const WORKSTATION_MIN_3D_TEXTURE = 2048;

function hasWorkstationResources(
  deviceMemoryGB: number | undefined,
  logicalCores: number | undefined,
  max3DTextureSize: number
): boolean {
  return (
    typeof deviceMemoryGB === 'number' &&
    deviceMemoryGB >= WORKSTATION_MIN_MEMORY_GB &&
    typeof logicalCores === 'number' &&
    logicalCores >= WORKSTATION_MIN_CORES &&
    max3DTextureSize >= WORKSTATION_MIN_3D_TEXTURE
  );
}

interface ClassifyInput {
  renderer: string;
  vendor: string;
  hasContext: boolean;
  deviceMemoryGB?: number;
  logicalCores?: number;
  max3DTextureSize: number;
}

function classifyTier({
  renderer,
  vendor,
  hasContext,
  deviceMemoryGB,
  logicalCores,
  max3DTextureSize,
}: ClassifyInput): DeviceTier {
  if (!hasContext) {
    return 'software';
  }

  const haystack = `${renderer} ${vendor}`.toLowerCase();

  if (SOFTWARE_HINTS.some(h => haystack.includes(h))) {
    return 'software';
  }
  // Las dedicadas de gama de entrada (930MX, MX150, GT 1030...) se tratan como
  // integradas: tienen el mismo riesgo de crash con volúmenes grandes. No se
  // promueven a 'integratedHigh': su VRAM es propia y limitada.
  if (WEAK_DEDICATED_HINTS.some(h => haystack.includes(h))) {
    return 'integrated';
  }
  if (DEDICATED_HINTS.some(h => haystack.includes(h))) {
    return 'dedicated';
  }

  const isWorkstation = hasWorkstationResources(deviceMemoryGB, logicalCores, max3DTextureSize);

  if (INTEGRATED_HINTS.some(h => haystack.includes(h))) {
    return isWorkstation ? 'integratedHigh' : 'integrated';
  }
  // Sin pistas claras: si el navegador reporta poca RAM, asumir integrada;
  // si el equipo es una estación de trabajo, tratarla como integrada moderna;
  // si no hay info, 'unknown' (se trata conservador aguas arriba).
  if (typeof deviceMemoryGB === 'number' && deviceMemoryGB <= 4) {
    return 'integrated';
  }
  if (isWorkstation) {
    return 'integratedHigh';
  }
  return 'unknown';
}

function probe(): DeviceCapabilities {
  const deviceMemoryGB =
    typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined;
  const logicalCores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;

  let renderer = '';
  let vendor = '';
  let maxTextureSize = 0;
  let max3DTextureSize = 0;
  let webgl2 = false;
  let hasContext = false;

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;

    try {
      gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
      if (gl) {
        webgl2 = true;
      } else {
        gl = (canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      }
    } catch {
      gl = null;
    }

    if (gl) {
      hasContext = true;
      try {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
          vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '');
        }
        if (!renderer) {
          renderer = String(gl.getParameter(gl.RENDERER) || '');
        }
        if (!vendor) {
          vendor = String(gl.getParameter(gl.VENDOR) || '');
        }
        maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
        if (webgl2) {
          max3DTextureSize =
            Number(
              (gl as WebGL2RenderingContext).getParameter(
                (gl as WebGL2RenderingContext).MAX_3D_TEXTURE_SIZE
              )
            ) || 0;
        }
      } catch {
        // dejar valores por defecto
      }

      // Liberar el contexto desechable lo antes posible.
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        /* noop */
      }
    }
  }

  const tier = classifyTier({
    renderer,
    vendor,
    hasContext,
    deviceMemoryGB,
    logicalCores,
    max3DTextureSize,
  });

  return {
    tier,
    renderer: renderer || 'Desconocido',
    vendor: vendor || 'Desconocido',
    maxTextureSize,
    max3DTextureSize,
    webgl2,
    deviceMemoryGB,
    logicalCores,
  };
}

/**
 * Devuelve las capacidades del equipo (memoizadas). Aplica cualquier override de
 * pruebas establecido con `setDeviceCapabilitiesOverride`.
 */
export function getDeviceCapabilities(): DeviceCapabilities {
  if (!cached) {
    cached = probe();
  }
  return override ? { ...cached, ...override } : cached;
}

/**
 * Fuerza (parcialmente) las capacidades detectadas. Pensado SOLO para pruebas:
 * permite simular una GPU integrada en un equipo potente, etc.
 * Ejemplo en consola:
 *   window.__novaSetDeviceCaps({ tier: 'integrated', max3DTextureSize: 2048 });
 */
export function setDeviceCapabilitiesOverride(partial: Partial<DeviceCapabilities> | null): void {
  override = partial;
}

// Exponer el override en window para depuración en campo (no intrusivo).
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__novaSetDeviceCaps =
    setDeviceCapabilitiesOverride;
  (window as unknown as Record<string, unknown>).__novaGetDeviceCaps = getDeviceCapabilities;
}
