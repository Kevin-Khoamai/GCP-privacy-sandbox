#!/usr/bin/env node

/**
 * Build script for cross-browser extension
 * Generates appropriate manifest files and builds for Chrome, Firefox, and Safari
 */

const fs = require('fs');
const path = require('path');

const EXTENSION_DIR = __dirname;
const BUILD_DIR = path.join(EXTENSION_DIR, 'build');

/**
 * Browser-specific configurations
 */
const BROWSER_CONFIGS = {
  chrome: {
    manifestFile: 'manifest.json',
    outputDir: path.join(BUILD_DIR, 'chrome'),
    manifestVersion: 3
  },
  firefox: {
    manifestFile: 'manifest-firefox.json',
    outputDir: path.join(BUILD_DIR, 'firefox'),
    manifestVersion: 2
  },
  safari: {
    manifestFile: 'manifest-safari.json',
    outputDir: path.join(BUILD_DIR, 'safari'),
    manifestVersion: 2
  }
};

/**
 * Files to copy to each browser build
 */
const FILES_TO_COPY = [
  'background.js',
  'content.js',
  'popup.html',
  'popup.js',
  'popup.css',
  'storage.js',
  'browsing-history-monitor.js',
  'browser-compatibility.js'
];

/**
 * Create directory if it doesn't exist
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Copy file from source to destination
 */
function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${path.basename(src)} -> ${path.relative(EXTENSION_DIR, dest)}`);
  } else {
    console.warn(`Warning: Source file not found: ${src}`);
  }
}

/**
 * Build extension for specific browser
 */
function buildForBrowser(browserName, config) {
  console.log(`\nBuilding for ${browserName}...`);
  
  // Create output directory
  ensureDir(config.outputDir);
  
  // Copy manifest file
  const manifestSrc = path.join(EXTENSION_DIR, config.manifestFile);
  const manifestDest = path.join(config.outputDir, 'manifest.json');
  copyFile(manifestSrc, manifestDest);
  
  // Copy other files
  FILES_TO_COPY.forEach(file => {
    const src = path.join(EXTENSION_DIR, file);
    const dest = path.join(config.outputDir, file);
    copyFile(src, dest);
  });
  
  console.log(`✓ ${browserName} build completed in ${path.relative(EXTENSION_DIR, config.outputDir)}`);
}

/**
 * Clean build directory
 */
function cleanBuild() {
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
  console.log('Cleaned build directory');
}

/**
 * Main build function
 */
function build() {
  console.log('Building cross-browser extension...\n');
  
  // Clean previous builds
  cleanBuild();
  
  // Build for each browser
  Object.entries(BROWSER_CONFIGS).forEach(([browserName, config]) => {
    buildForBrowser(browserName, config);
  });
  
  console.log('\n✓ All browser builds completed successfully!');
  console.log('\nBuild outputs:');
  Object.entries(BROWSER_CONFIGS).forEach(([browserName, config]) => {
    console.log(`  ${browserName}: ${path.relative(process.cwd(), config.outputDir)}`);
  });
}

/**
 * Package extension for distribution
 */
function package() {
  console.log('\nPackaging extensions...');
  
  // This would typically create zip files for distribution
  // For now, just log the locations
  Object.entries(BROWSER_CONFIGS).forEach(([browserName, config]) => {
    if (fs.existsSync(config.outputDir)) {
      console.log(`${browserName} extension ready for packaging: ${config.outputDir}`);
    }
  });
}

// Command line interface
const command = process.argv[2];

switch (command) {
  case 'build':
    build();
    break;
  case 'package':
    build();
    package();
    break;
  case 'clean':
    cleanBuild();
    break;
  default:
    console.log('Usage: node build-extension.js [build|package|clean]');
    console.log('  build   - Build extensions for all browsers');
    console.log('  package - Build and package extensions');
    console.log('  clean   - Clean build directory');
}
