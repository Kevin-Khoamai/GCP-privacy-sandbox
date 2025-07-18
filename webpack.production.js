const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = (env) => {
  const target = env.target || 'chrome'; // chrome, firefox, safari, edge
  
  return {
    mode: 'production',
    
    entry: {
      background: './src/browser-extension/background/background.ts',
      content: './src/browser-extension/content/content.ts',
      popup: './src/browser-extension/popup/popup.ts',
      options: './src/browser-extension/options/options.ts'
    },
    
    output: {
      path: path.resolve(__dirname, `dist/${target}`),
      filename: '[name].js',
      clean: true
    },
    
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@extension': path.resolve(__dirname, 'src/browser-extension')
      }
    },
    
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                configFile: 'tsconfig.extension.json',
                transpileOnly: false,
                compilerOptions: {
                  sourceMap: false,
                  declaration: false
                }
              }
            }
          ],
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            {
              loader: 'css-loader',
              options: {
                sourceMap: false,
                importLoaders: 1
              }
            },
            {
              loader: 'postcss-loader',
              options: {
                sourceMap: false,
                postcssOptions: {
                  plugins: [
                    ['autoprefixer'],
                    ['cssnano', { preset: 'default' }]
                  ]
                }
              }
            }
          ]
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|ico)$/,
          type: 'asset/resource',
          generator: {
            filename: 'images/[name][ext]'
          }
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/,
          type: 'asset/resource',
          generator: {
            filename: 'fonts/[name][ext]'
          }
        }
      ]
    },
    
    plugins: [
      new CleanWebpackPlugin(),
      
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env.TARGET_BROWSER': JSON.stringify(target),
        'process.env.VERSION': JSON.stringify(require('./package.json').version)
      }),
      
      new MiniCssExtractPlugin({
        filename: '[name].css'
      }),
      
      new CopyWebpackPlugin({
        patterns: [
          {
            from: `src/browser-extension/manifests/manifest.${target}.json`,
            to: 'manifest.json',
            transform(content) {
              const manifest = JSON.parse(content.toString());
              
              // Update version from package.json
              manifest.version = require('./package.json').version;
              
              // Add production-specific configurations
              if (target === 'chrome') {
                manifest.content_security_policy = {
                  extension_pages: "script-src 'self'; object-src 'self'"
                };
              } else if (target === 'firefox') {
                manifest.content_security_policy = "script-src 'self'; object-src 'self'";
              }
              
              return JSON.stringify(manifest, null, 2);
            }
          },
          {
            from: 'src/browser-extension/popup/popup.html',
            to: 'popup.html'
          },
          {
            from: 'src/browser-extension/options/options.html',
            to: 'options.html'
          },
          {
            from: 'src/browser-extension/icons',
            to: 'icons'
          },
          {
            from: 'src/browser-extension/_locales',
            to: '_locales'
          },
          {
            from: 'LICENSE',
            to: 'LICENSE'
          },
          {
            from: 'PRIVACY_POLICY.md',
            to: 'PRIVACY_POLICY.md'
          }
        ]
      })
    ],
    
    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: true,
              drop_debugger: true,
              pure_funcs: ['console.log', 'console.info', 'console.debug']
            },
            mangle: {
              safari10: true
            },
            format: {
              comments: false
            }
          },
          extractComments: false
        }),
        new CssMinimizerPlugin()
      ],
      
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            chunks: 'all',
            enforce: true
          },
          shared: {
            test: /[\\/]src[\\/]shared[\\/]/,
            name: 'shared',
            chunks: 'all',
            enforce: true
          }
        }
      }
    },
    
    performance: {
      hints: 'warning',
      maxEntrypointSize: 512000, // 500KB
      maxAssetSize: 512000
    },
    
    stats: {
      colors: true,
      modules: false,
      chunks: false,
      chunkModules: false,
      entrypoints: false,
      assets: true,
      assetsSort: 'size',
      warnings: true,
      errors: true,
      errorDetails: true
    }
  };
};
