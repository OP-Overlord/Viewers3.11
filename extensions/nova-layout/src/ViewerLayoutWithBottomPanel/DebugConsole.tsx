import { useEffect, useState } from 'react';

/**
 * DebugConsole - Loads eruda mobile console when debug=true is in URL
 * eruda provides: Console, Elements, Network, Resources, Sources, Info panels
 * https://github.com/liriliri/eruda
 */
function DebugConsole(): null {
  const [isDebugMode, setIsDebugMode] = useState(false);

  // Check if debug mode is enabled via URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get('debug');
    setIsDebugMode(debugParam === 'true');
  }, []);

  // Load and initialize eruda when debug mode is enabled
  useEffect(() => {
    if (!isDebugMode) return;

    // Check if eruda is already loaded
    if ((window as any).eruda) {
      (window as any).eruda.init();
      console.log('[Debug Console] eruda initialized');
      return;
    }

    // Dynamically load eruda from CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/eruda';
    script.async = true;

    script.onload = () => {
      if ((window as any).eruda) {
        (window as any).eruda.init();
        console.log('[Debug Console] eruda loaded and initialized');

        // Mostrar información del dispositivo si está disponible
        setTimeout(() => {
          const deviceCaps = (window as any).__novaMobileDeviceCaps;

          console.log('==========================================');
          console.log('[Nova Mobile] DEVICE CAPABILITIES:');
          if (deviceCaps) {
            console.log('  - WebGL2:', deviceCaps.hasWebGL2 ? 'Yes' : 'No');
            console.log('  - Max Texture Size:', deviceCaps.maxTextureSize);
            console.log('  - Low-end Device:', deviceCaps.isLowEndDevice ? 'Yes' : 'No');
            console.log('  - Available Memory:', deviceCaps.availableMemory || 'Unknown', 'GB');
            console.log('  - CPU Rendering:', deviceCaps.useCPURendering ? 'Enabled' : 'Disabled');
          } else {
            console.log('  (Device caps not available yet)');
          }
          console.log('==========================================');
          console.log('[Nova Mobile] Tip: Access window.__novaMobileDeviceCaps for full details');
        }, 500);
      }
    };

    script.onerror = () => {
      console.error('[Debug Console] Failed to load eruda from CDN');
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup: destroy eruda when component unmounts
      if ((window as any).eruda) {
        (window as any).eruda.destroy();
      }
    };
  }, [isDebugMode]);

  // This component doesn't render anything - eruda handles its own UI
  return null;
}

export default DebugConsole;
