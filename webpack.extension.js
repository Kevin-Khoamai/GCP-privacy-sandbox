const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    background: './src/browser-extension/background.ts',
    content: './src/browser-extension/content.ts',
    popup: './src/browser-extension/popup.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist/browser-extension'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@browser': path.resolve(__dirname, 'src/browser-extension')
    }
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/browser-extension/manifest.json', to: 'manifest.json' },
        { from: 'src/browser-extension/popup.html', to: 'popup.html' },
        { from: 'src/browser-extension/popup.css', to: 'popup.css' }
      ]
    })
  ]
};