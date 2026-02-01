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
const MINIMUM_SPLASH_TIME = 1500; // 1 segundo minimo
const splashStartTime = Date.now();

// Crear splash screen inmediatamente
function createSplashScreen() {
  const splash = document.createElement('div');
  splash.id = 'splash-screen';
  splash.innerHTML = `
    <style>
      #splash-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        transition: opacity 0.3s ease-out;
      }
      #splash-screen.fade-out {
        opacity: 0;
        pointer-events: none;
      }
      .splash-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2rem;
      }
      .splash-logo {
        width: 200px;
        height: auto;
        animation: logoFadeIn 0.8s ease-out forwards;
        opacity: 0;
      }
      .splash-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(255, 255, 255, 0.1);
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: spin 1s linear infinite, loaderFadeIn 0.5s ease-out 0.5s forwards;
        opacity: 0;
      }
      @keyframes logoFadeIn {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
      @keyframes loaderFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
    <div class="splash-content">
      <img src="./nova-dark.svg" alt="Logo" class="splash-logo" />
      <div class="splash-spinner"></div>
    </div>
  `;
  document.body.appendChild(splash);
  return splash;
}

function hideSplashScreen(splash) {
  const elapsedTime = Date.now() - splashStartTime;
  const remainingTime = Math.max(0, MINIMUM_SPLASH_TIME - elapsedTime);

  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.remove();
    }, 300);
  }, remainingTime);
}

// Mostrar splash inmediatamente
const splash = createSplashScreen();
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
  hideSplashScreen(splash);
});
