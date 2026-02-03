/**
 * Entry point for development and production PWA builds.
 */
import 'regenerator-runtime/runtime';
import { createRoot } from 'react-dom/client';
import App from './App';
import React from 'react';

/**
 * EXTENSIONS AND MODES
 * =================
 * pluginImports.js is dynamically generated from extension and mode
 * configuration at build time.
 *
 * pluginImports.js imports all of the modes and extensions and adds them
 * to the window for processing.
 */
import { modes as defaultModes, extensions as defaultExtensions } from './pluginImports';
import loadDynamicConfig from './loadDynamicConfig';
import { publicUrl } from './utils/publicUrl';
export { history } from './utils/history';
export { preserveQueryParameters, preserveQueryStrings } from './utils/preserveQueryParameters';

// ============== SPLASH SCREEN ==============
// The splash screen is now defined in index.html for instant display
// This code only handles hiding it when the app is ready
const MINIMUM_SPLASH_TIME = 1200; // Tiempo mínimo de visualización
const splashStartTime = Date.now();

function hideSplashScreen() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;

  const elapsedTime = Date.now() - splashStartTime;
  const remainingTime = Math.max(0, MINIMUM_SPLASH_TIME - elapsedTime);

  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.remove();
    }, 400); // Match the CSS transition duration
  }, remainingTime);
}
// ============================================

loadDynamicConfig(window.config).then(config_json => {
  // Reset Dynamic config if defined
  if (config_json !== null) {
    window.config = config_json;
  }
  window.config.routerBasename ||= publicUrl;

  /**
   * Combine our appConfiguration with installed extensions and modes.
   * In the future appConfiguration may contain modes added at runtime.
   *  */
  const appProps = {
    config: window ? window.config : {},
    defaultExtensions,
    defaultModes,
  };

  const container = document.getElementById('root');

  const root = createRoot(container);
  root.render(React.createElement(App, appProps));

  // Ocultar splash despues de que React monte (respetando tiempo minimo)
  hideSplashScreen();
});
