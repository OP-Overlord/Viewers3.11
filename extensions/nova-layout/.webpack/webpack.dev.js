const webpack = require('webpack');
const { merge } = require('webpack-merge');
const path = require('path');
const webpackCommon = require('./../../../.webpack/webpack.base.js');

const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');
const ENTRY = {
  app: `${SRC_DIR}/index.ts`,
};

module.exports = (env, argv) => {
  const commonConfig = webpackCommon(env, argv, { SRC_DIR, DIST_DIR, ENTRY });

  return merge(commonConfig, {
    mode: 'development',
    devtool: 'source-map',
    stats: {
      colors: true,
    },
    optimization: {
      minimize: false,
      sideEffects: true,
    },
    output: {
      path: DIST_DIR,
      library: 'nova-extension-layout',
      libraryTarget: 'umd',
      filename: '[name].bundle.js',
    },
    externals: [/\b(vtk.js)/, /\b(dcmjs)/, /\b(gl-matrix)/, /^@ohif/, /^@cornerstonejs/],
  });
};
