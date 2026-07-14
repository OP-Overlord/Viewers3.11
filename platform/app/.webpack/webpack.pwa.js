// https://developers.google.com/web/tools/workbox/guides/codelabs/webpack
// ~~ WebPack
const path = require('path');
const { merge } = require('webpack-merge');
const webpack = require('webpack');
const webpackBase = require('./../../../.webpack/webpack.base.js');
// ~~ Plugins
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
// ~~ Directories
const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');
const PUBLIC_DIR = path.join(__dirname, '../public');
// ~~ Env Vars
const HTML_TEMPLATE = process.env.HTML_TEMPLATE || 'index.html';
const PUBLIC_URL = process.env.PUBLIC_URL || '/';
const APP_CONFIG = process.env.APP_CONFIG || 'config/default.js';

// proxy settings
const PROXY_TARGET = process.env.PROXY_TARGET;
const PROXY_DOMAIN = process.env.PROXY_DOMAIN;
const PROXY_PATH_REWRITE_FROM = process.env.PROXY_PATH_REWRITE_FROM;
const PROXY_PATH_REWRITE_TO = process.env.PROXY_PATH_REWRITE_TO;

const OHIF_PORT = Number(process.env.OHIF_PORT || 3000);
const ENTRY_TARGET = process.env.ENTRY_TARGET || `${SRC_DIR}/index.js`;
const Dotenv = require('dotenv-webpack');
const writePluginImportFile = require('./writePluginImportsFile.js');
// const MillionLint = require('@million/lint');
const open = process.env.OHIF_OPEN !== 'false';

const copyPluginFromExtensions = writePluginImportFile(SRC_DIR, DIST_DIR);

const setHeaders = (res, path) => {
  if (path.indexOf('.gz') !== -1) {
    res.setHeader('Content-Encoding', 'gzip');
  } else if (path.indexOf('.br') !== -1) {
    res.setHeader('Content-Encoding', 'br');
  }
  if (path.indexOf('.pdf') !== -1) {
    res.setHeader('Content-Type', 'application/pdf');
  } else if (path.indexOf('mp4') !== -1) {
    res.setHeader('Content-Type', 'video/mp4');
  } else if (path.indexOf('frames') !== -1) {
    res.setHeader('Content-Type', 'multipart/related');
  } else {
    res.setHeader('Content-Type', 'application/json');
  }
};

module.exports = (env, argv) => {
  const baseConfig = webpackBase(env, argv, { SRC_DIR, DIST_DIR });
  const isProdBuild = process.env.NODE_ENV === 'production';
  const hasProxy = PROXY_TARGET && PROXY_DOMAIN;

  const mergedConfig = merge(baseConfig, {
    entry: {
      app: ENTRY_TARGET,
    },
    output: {
      path: DIST_DIR,
      filename: isProdBuild ? '[name].bundle.[chunkhash].js' : '[name].js',
      publicPath: PUBLIC_URL, // Used by HtmlWebPackPlugin for asset prefix
      devtoolModuleFilenameTemplate: function (info) {
        if (isProdBuild) {
          return `webpack:///${info.resourcePath}`;
        } else {
          return 'file:///' + encodeURI(info.absoluteResourcePath);
        }
      },
    },
    resolve: {
      modules: [
        // Modules specific to this package
        path.resolve(__dirname, '../node_modules'),
        // Hoisted Yarn Workspace Modules
        path.resolve(__dirname, '../../../node_modules'),
        SRC_DIR,
        path.resolve(__dirname, 'modes/nova-desktop/node_modules'),
        path.resolve(__dirname, 'extensions/nova-measures/node_modules'),
      ],
      alias: {
        // Replace onnxruntime-web (pulled in by @cornerstonejs/ai for SAM AI
        // auto-segmentation) with an inert stub. Its emscripten Node.js branch
        // throws "__filename is not defined" when the WASM backend initializes
        // on a page reload with degraded WebGPU, which aborts the cornerstone
        // extension boot and leaves the viewer gray. AI segmentation is not used
        // in this deployment. See ./onnxruntime-web.stub.js.
        'onnxruntime-web/webgpu$': path.resolve(__dirname, 'onnxruntime-web.stub.js'),
      },
    },
    plugins: [
      // For debugging re-renders
      // MillionLint.webpack(),
      new Dotenv(),
      // Clean output.path
      new CleanWebpackPlugin(),
      // Copy "Public" Folder to Dist
      new CopyWebpackPlugin({
        patterns: [
          ...copyPluginFromExtensions,
          {
            from: PUBLIC_DIR,
            to: DIST_DIR,
            toType: 'dir',
            globOptions: {
              // Ignore our HtmlWebpackPlugin template file
              // Ignore our configuration files
              ignore: ['**/config/**', '**/html-templates/**', '.DS_Store'],
            },
          },
          {
            from: '../../../node_modules/onnxruntime-web/dist',
            to: `${DIST_DIR}/ort`,
          },
          // Short term solution to make sure GCloud config is available in output
          // for our docker implementation
          {
            from: `${PUBLIC_DIR}/config/google.js`,
            to: `${DIST_DIR}/google.js`,
          },
          // Copy over and rename our target app config file
          {
            from: `${PUBLIC_DIR}/${APP_CONFIG}`,
            to: `${DIST_DIR}/app-config.js`,
          },
        ],
      }),
      // Generate "index.html" w/ correct includes/imports
      new HtmlWebpackPlugin({
        template: `${PUBLIC_DIR}/html-templates/${HTML_TEMPLATE}`,
        filename: 'index.html',
        templateParameters: {
          PUBLIC_URL: PUBLIC_URL,
        },
      }),
      // NOTE: The PWA service worker was intentionally removed. Its
      // StaleWhileRevalidate strategy served stale JS chunks after each deploy,
      // producing a gray screen until a hard reload. A static kill-switch
      // `sw.js` (in public/) is copied to dist instead so any previously
      // installed service worker self-destructs. See public/sw.js and
      // public/init-service-worker.js.
    ],
    // https://webpack.js.org/configuration/dev-server/
    devServer: {
      // gzip compression of everything served
      // Causes Cypress: `wait-on` issue in CI
      // compress: true,
      // http2: true,
      // https: true,
      open,
      port: OHIF_PORT,
      client: {
        overlay: { errors: true, warnings: false },
      },
      proxy: [
        {
          '/dicomweb': 'http://localhost:5000',
        },
      ],
      static: [
        {
          directory: '../../testdata',
          staticOptions: {
            extensions: ['gz', 'br', 'mht'],
            index: ['index.json.gz', 'index.mht.gz'],
            redirect: true,
            setHeaders,
          },
          publicPath: '/viewer-testdata',
        },
      ],
      //public: 'http://localhost:' + 3000,
      //writeToDisk: true,
      historyApiFallback: {
        disableDotRule: true,
        index: PUBLIC_URL + 'index.html',
      },
      devMiddleware: {
        writeToDisk: true,
      },
    },
  });

  if (hasProxy) {
    mergedConfig.devServer.proxy = mergedConfig.devServer.proxy || {};
    mergedConfig.devServer.proxy = [
      {
        context: [PROXY_PATH_REWRITE_FROM || '/dicomweb'],
        target: PROXY_DOMAIN,
        changeOrigin: true,
        pathRewrite: {
          [`^${PROXY_PATH_REWRITE_FROM}`]: PROXY_PATH_REWRITE_TO,
        },
      },
    ];
  }

  if (isProdBuild) {
    mergedConfig.plugins.push(
      new MiniCssExtractPlugin({
        filename: '[name].bundle.css',
        chunkFilename: '[id].css',
      })
    );
  }

  mergedConfig.watchOptions = {
    ignored: /node_modules\/@cornerstonejs/,
  };

  return mergedConfig;
};
