/**
 * renderingCapability — punto de entrada del núcleo de validación preventiva
 * para funcionalidades volumétricas pesadas (MPR / Volume Rendering / 3D).
 */

export * from './detectDeviceCapabilities';
export * from './thresholds';
export * from './assessHeavyRendering';
export * from './assessViewport';
export * from './runCapabilityGuard';
export { default as RenderingCapabilityModal } from './RenderingCapabilityModal';
