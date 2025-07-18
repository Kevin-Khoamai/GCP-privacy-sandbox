#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');
const chalk = require('chalk');

class ExtensionBuilder {
  constructor() {
    this.rootDir = path.resolve(__dirname, '..');
    this.distDir = path.join(this.rootDir, 'dist');
    this.packageDir = path.join(this.rootDir, 'packages');
    
    this.browsers = {
      chrome: {
        name: 'Chrome',
        manifestVersion: 3,
        packageFormat: 'zip',
        storeUrl: 'https://chrome.google.com/webstore'
      },
      firefox: {
        name: 'Firefox',
        manifestVersion: 2,
        packageFormat: 'zip',
        storeUrl: 'https://addons.mozilla.org'
      },
      safari: {
        name: 'Safari',
        manifestVersion: 2,
        packageFormat: 'zip',
        storeUrl: 'https://developer.apple.com/app-store'
      },
      edge: {
        name: 'Edge',
        manifestVersion: 3,
        packageFormat: 'zip',
        storeUrl: 'https://microsoftedge.microsoft.com/addons'
      }
    };
  }

  async build(targetBrowser = 'all') {
    console.log(chalk.blue('🚀 Building Privacy Cohort Tracker Extension'));
    console.log(chalk.gray('=====================================\n'));

    try {
      // Clean previous builds
      await this.clean();

      if (targetBrowser === 'all') {
        // Build for all browsers
        for (const browser of Object.keys(this.browsers)) {
          await this.buildForBrowser(browser);
        }
      } else if (this.browsers[targetBrowser]) {
        // Build for specific browser
        await this.buildForBrowser(targetBrowser);
      } else {
        throw new Error(`Unknown browser: ${targetBrowser}`);
      }

      console.log(chalk.green('\n✅ Build completed successfully!'));
      await this.generateBuildReport();

    } catch (error) {
      console.error(chalk.red('\n❌ Build failed:'), error.message);
      process.exit(1);
    }
  }

  async clean() {
    console.log(chalk.yellow('🧹 Cleaning previous builds...'));
    
    await fs.remove(this.distDir);
    await fs.remove(this.packageDir);
    
    await fs.ensureDir(this.distDir);
    await fs.ensureDir(this.packageDir);
  }

  async buildForBrowser(browser) {
    const browserInfo = this.browsers[browser];
    console.log(chalk.cyan(`\n📦 Building for ${browserInfo.name}...`));

    try {
      // Run webpack build
      const webpackCommand = `npx webpack --config webpack.production.js --env target=${browser}`;
      console.log(chalk.gray(`Running: ${webpackCommand}`));
      
      execSync(webpackCommand, {
        cwd: this.rootDir,
        stdio: 'pipe'
      });

      // Validate build
      await this.validateBuild(browser);

      // Create package
      await this.createPackage(browser);

      console.log(chalk.green(`✅ ${browserInfo.name} build completed`));

    } catch (error) {
      console.error(chalk.red(`❌ ${browserInfo.name} build failed:`), error.message);
      throw error;
    }
  }

  async validateBuild(browser) {
    const buildDir = path.join(this.distDir, browser);
    const manifestPath = path.join(buildDir, 'manifest.json');

    // Check if manifest exists
    if (!await fs.pathExists(manifestPath)) {
      throw new Error(`Manifest not found for ${browser}`);
    }

    // Validate manifest
    const manifest = await fs.readJson(manifestPath);
    
    if (!manifest.name || !manifest.version) {
      throw new Error(`Invalid manifest for ${browser}`);
    }

    // Check required files
    const requiredFiles = ['background.js', 'content.js', 'popup.html', 'popup.js'];
    
    for (const file of requiredFiles) {
      const filePath = path.join(buildDir, file);
      if (!await fs.pathExists(filePath)) {
        throw new Error(`Required file missing: ${file} for ${browser}`);
      }
    }

    // Check file sizes
    const stats = await this.getFileStats(buildDir);
    const totalSize = stats.reduce((sum, stat) => sum + stat.size, 0);
    
    if (totalSize > 10 * 1024 * 1024) { // 10MB limit
      console.warn(chalk.yellow(`⚠️  Large package size for ${browser}: ${(totalSize / 1024 / 1024).toFixed(2)}MB`));
    }

    console.log(chalk.gray(`   Validation passed for ${browser}`));
  }

  async createPackage(browser) {
    const browserInfo = this.browsers[browser];
    const buildDir = path.join(this.distDir, browser);
    const packagePath = path.join(this.packageDir, `privacy-cohort-tracker-${browser}-v${this.getVersion()}.zip`);

    console.log(chalk.gray(`   Creating package: ${path.basename(packagePath)}`));

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(packagePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        console.log(chalk.gray(`   Package created: ${sizeInMB}MB`));
        resolve();
      });

      archive.on('error', reject);
      archive.pipe(output);

      // Add all files from build directory
      archive.directory(buildDir, false);
      archive.finalize();
    });
  }

  async getFileStats(dir) {
    const stats = [];
    const files = await fs.readdir(dir, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dir, file.name);
      
      if (file.isDirectory()) {
        const subStats = await this.getFileStats(filePath);
        stats.push(...subStats);
      } else {
        const stat = await fs.stat(filePath);
        stats.push({
          name: file.name,
          path: filePath,
          size: stat.size
        });
      }
    }

    return stats;
  }

  async generateBuildReport() {
    console.log(chalk.blue('\n📊 Build Report'));
    console.log(chalk.gray('=============='));

    const report = {
      timestamp: new Date().toISOString(),
      version: this.getVersion(),
      builds: {}
    };

    for (const browser of Object.keys(this.browsers)) {
      const buildDir = path.join(this.distDir, browser);
      
      if (await fs.pathExists(buildDir)) {
        const stats = await this.getFileStats(buildDir);
        const totalSize = stats.reduce((sum, stat) => sum + stat.size, 0);
        
        report.builds[browser] = {
          fileCount: stats.length,
          totalSize: totalSize,
          totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
        };

        console.log(chalk.cyan(`${this.browsers[browser].name}:`));
        console.log(chalk.gray(`  Files: ${stats.length}`));
        console.log(chalk.gray(`  Size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`));
      }
    }

    // Save report
    const reportPath = path.join(this.packageDir, 'build-report.json');
    await fs.writeJson(reportPath, report, { spaces: 2 });

    console.log(chalk.green(`\n📄 Build report saved: ${reportPath}`));
  }

  getVersion() {
    const packageJson = require(path.join(this.rootDir, 'package.json'));
    return packageJson.version;
  }

  async generateStoreAssets() {
    console.log(chalk.blue('\n🎨 Generating store assets...'));

    const assetsDir = path.join(this.packageDir, 'store-assets');
    await fs.ensureDir(assetsDir);

    // Generate screenshots directory structure
    const screenshotsDir = path.join(assetsDir, 'screenshots');
    await fs.ensureDir(screenshotsDir);

    // Create placeholder files for store assets
    const assetFiles = [
      'icon-128.png',
      'icon-256.png',
      'icon-512.png',
      'promotional-tile-440x280.png',
      'screenshot-1-1280x800.png',
      'screenshot-2-1280x800.png',
      'screenshot-3-1280x800.png'
    ];

    for (const file of assetFiles) {
      const filePath = path.join(assetsDir, file);
      if (!await fs.pathExists(filePath)) {
        // Create placeholder file
        await fs.writeFile(filePath, `# Placeholder for ${file}\nGenerate actual asset file`);
      }
    }

    // Generate store descriptions
    await this.generateStoreDescriptions(assetsDir);

    console.log(chalk.green('✅ Store assets generated'));
  }

  async generateStoreDescriptions(assetsDir) {
    const descriptions = {
      chrome: {
        name: 'Privacy Cohort Tracker',
        shortDescription: 'Privacy-preserving interest cohort tracking with full user control',
        description: `Take control of your online privacy with Privacy Cohort Tracker - the transparent, user-controlled alternative to traditional tracking.

🔒 PRIVACY-FIRST DESIGN
• All processing happens locally on your device
• No data sent to external servers without your consent
• Full transparency into what data is collected and how it's used

🎯 SMART COHORT TRACKING
• Interest-based cohorts for relevant advertising
• Advanced privacy protection with k-anonymity
• Automatic expiration and data minimization

⚙️ FULL USER CONTROL
• Granular consent management
• Easy opt-out from any tracking
• Complete data export and deletion
• Real-time privacy dashboard

🛡️ ENTERPRISE-GRADE SECURITY
• AES-256 encryption for all sensitive data
• Regular security audits and updates
• GDPR and CCPA compliant

Perfect for privacy-conscious users who want the benefits of personalized web experiences without sacrificing their privacy.`,
        keywords: ['privacy', 'tracking', 'cohorts', 'GDPR', 'security', 'transparency']
      },
      firefox: {
        name: 'Privacy Cohort Tracker',
        summary: 'Privacy-preserving interest cohort tracking with full user control',
        description: `Privacy Cohort Tracker brings transparency and control to online tracking. Built with privacy-by-design principles, it processes all data locally while giving you complete control over your digital footprint.

Key Features:
• Local-only processing - your data stays on your device
• Transparent cohort assignment with full explanations
• Granular privacy controls and consent management
• GDPR/CCPA compliant with full data subject rights
• Enterprise-grade encryption and security
• Real-time privacy monitoring and alerts

Take back control of your online privacy without sacrificing functionality.`
      }
    };

    for (const [browser, desc] of Object.entries(descriptions)) {
      const descPath = path.join(assetsDir, `${browser}-store-description.json`);
      await fs.writeJson(descPath, desc, { spaces: 2 });
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'build';
  const target = args[1] || 'all';

  const builder = new ExtensionBuilder();

  switch (command) {
    case 'build':
      await builder.build(target);
      break;
    
    case 'assets':
      await builder.generateStoreAssets();
      break;
    
    case 'all':
      await builder.build(target);
      await builder.generateStoreAssets();
      break;
    
    default:
      console.log(chalk.red(`Unknown command: ${command}`));
      console.log(chalk.gray('Available commands: build, assets, all'));
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ExtensionBuilder;
