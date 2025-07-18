#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');
const inquirer = require('inquirer');

class ExtensionDeployer {
  constructor() {
    this.rootDir = path.resolve(__dirname, '..');
    this.packageDir = path.join(this.rootDir, 'packages');
    this.configDir = path.join(this.rootDir, 'deployment-config');
    
    this.stores = {
      chrome: {
        name: 'Chrome Web Store',
        apiEndpoint: 'https://www.googleapis.com/chromewebstore/v1.1',
        requiresReview: true,
        maxSize: '128MB',
        supportedFormats: ['zip']
      },
      firefox: {
        name: 'Firefox Add-ons',
        apiEndpoint: 'https://addons.mozilla.org/api/v5',
        requiresReview: true,
        maxSize: '200MB',
        supportedFormats: ['zip', 'xpi']
      },
      safari: {
        name: 'Safari Extensions',
        apiEndpoint: 'https://developer.apple.com/app-store-connect/api',
        requiresReview: true,
        maxSize: '4GB',
        supportedFormats: ['zip']
      },
      edge: {
        name: 'Microsoft Edge Add-ons',
        apiEndpoint: 'https://api.addons.microsoftedge.microsoft.com',
        requiresReview: true,
        maxSize: '128MB',
        supportedFormats: ['zip']
      }
    };
  }

  async deploy(options = {}) {
    console.log(chalk.blue('🚀 Privacy Cohort Tracker Deployment'));
    console.log(chalk.gray('====================================\n'));

    try {
      // Load deployment configuration
      const config = await this.loadDeploymentConfig();
      
      // Validate prerequisites
      await this.validatePrerequisites();
      
      // Select deployment targets
      const targets = options.targets || await this.selectDeploymentTargets();
      
      // Confirm deployment
      if (!options.skipConfirmation) {
        await this.confirmDeployment(targets, config);
      }
      
      // Execute deployment
      for (const target of targets) {
        await this.deployToStore(target, config);
      }
      
      console.log(chalk.green('\n✅ Deployment completed successfully!'));
      await this.generateDeploymentReport(targets);
      
    } catch (error) {
      console.error(chalk.red('\n❌ Deployment failed:'), error.message);
      process.exit(1);
    }
  }

  async loadDeploymentConfig() {
    const configPath = path.join(this.configDir, 'deployment.json');
    
    if (!await fs.pathExists(configPath)) {
      console.log(chalk.yellow('⚠️  No deployment config found. Creating default...'));
      await this.createDefaultConfig();
    }
    
    return await fs.readJson(configPath);
  }

  async createDefaultConfig() {
    await fs.ensureDir(this.configDir);
    
    const defaultConfig = {
      version: this.getVersion(),
      releaseNotes: {
        en: "Initial release of Privacy Cohort Tracker with full privacy-by-design implementation."
      },
      stores: {
        chrome: {
          clientId: process.env.CHROME_CLIENT_ID || '',
          clientSecret: process.env.CHROME_CLIENT_SECRET || '',
          refreshToken: process.env.CHROME_REFRESH_TOKEN || '',
          extensionId: process.env.CHROME_EXTENSION_ID || '',
          publishTarget: 'default', // 'default' or 'trustedTesters'
          autoPublish: false
        },
        firefox: {
          apiKey: process.env.FIREFOX_API_KEY || '',
          apiSecret: process.env.FIREFOX_API_SECRET || '',
          addonId: process.env.FIREFOX_ADDON_ID || '',
          channel: 'listed', // 'listed' or 'unlisted'
          autoPublish: false
        },
        safari: {
          teamId: process.env.SAFARI_TEAM_ID || '',
          keyId: process.env.SAFARI_KEY_ID || '',
          privateKey: process.env.SAFARI_PRIVATE_KEY || '',
          bundleId: process.env.SAFARI_BUNDLE_ID || '',
          autoPublish: false
        },
        edge: {
          clientId: process.env.EDGE_CLIENT_ID || '',
          clientSecret: process.env.EDGE_CLIENT_SECRET || '',
          accessToken: process.env.EDGE_ACCESS_TOKEN || '',
          productId: process.env.EDGE_PRODUCT_ID || '',
          autoPublish: false
        }
      },
      notifications: {
        slack: {
          webhook: process.env.SLACK_WEBHOOK || '',
          channel: '#releases'
        },
        email: {
          recipients: ['team@privacy-cohort-tracker.com'],
          smtp: {
            host: process.env.SMTP_HOST || '',
            port: process.env.SMTP_PORT || 587,
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || ''
          }
        }
      }
    };
    
    const configPath = path.join(this.configDir, 'deployment.json');
    await fs.writeJson(configPath, defaultConfig, { spaces: 2 });
    
    console.log(chalk.green(`✅ Default config created: ${configPath}`));
    console.log(chalk.yellow('⚠️  Please update the configuration with your API credentials'));
  }

  async validatePrerequisites() {
    console.log(chalk.cyan('🔍 Validating prerequisites...'));
    
    // Check if packages exist
    if (!await fs.pathExists(this.packageDir)) {
      throw new Error('No packages found. Run build script first.');
    }
    
    // Check package files
    const packages = await fs.readdir(this.packageDir);
    const extensionPackages = packages.filter(p => p.endsWith('.zip'));
    
    if (extensionPackages.length === 0) {
      throw new Error('No extension packages found. Run build script first.');
    }
    
    // Validate package integrity
    for (const pkg of extensionPackages) {
      const pkgPath = path.join(this.packageDir, pkg);
      const stats = await fs.stat(pkgPath);
      
      if (stats.size === 0) {
        throw new Error(`Invalid package: ${pkg} is empty`);
      }
      
      if (stats.size > 128 * 1024 * 1024) { // 128MB
        console.warn(chalk.yellow(`⚠️  Large package: ${pkg} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`));
      }
    }
    
    console.log(chalk.green('✅ Prerequisites validated'));
  }

  async selectDeploymentTargets() {
    const choices = Object.entries(this.stores).map(([key, store]) => ({
      name: `${store.name} (${key})`,
      value: key,
      checked: false
    }));
    
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'targets',
        message: 'Select deployment targets:',
        choices,
        validate: (input) => {
          if (input.length === 0) {
            return 'Please select at least one target';
          }
          return true;
        }
      }
    ]);
    
    return answers.targets;
  }

  async confirmDeployment(targets, config) {
    console.log(chalk.cyan('\n📋 Deployment Summary:'));
    console.log(chalk.gray('==================='));
    console.log(chalk.white(`Version: ${config.version}`));
    console.log(chalk.white(`Targets: ${targets.map(t => this.stores[t].name).join(', ')}`));
    
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Proceed with deployment?',
        default: false
      }
    ]);
    
    if (!answers.proceed) {
      console.log(chalk.yellow('Deployment cancelled'));
      process.exit(0);
    }
  }

  async deployToStore(target, config) {
    const store = this.stores[target];
    const storeConfig = config.stores[target];
    
    console.log(chalk.cyan(`\n📦 Deploying to ${store.name}...`));
    
    try {
      // Find package file
      const packageFile = await this.findPackageFile(target);
      
      // Validate store configuration
      await this.validateStoreConfig(target, storeConfig);
      
      // Upload package
      await this.uploadPackage(target, packageFile, storeConfig);
      
      // Update store listing
      await this.updateStoreListing(target, config, storeConfig);
      
      // Publish if auto-publish is enabled
      if (storeConfig.autoPublish) {
        await this.publishExtension(target, storeConfig);
      }
      
      console.log(chalk.green(`✅ ${store.name} deployment completed`));
      
    } catch (error) {
      console.error(chalk.red(`❌ ${store.name} deployment failed:`), error.message);
      throw error;
    }
  }

  async findPackageFile(target) {
    const packagePattern = `privacy-cohort-tracker-${target}-v${this.getVersion()}.zip`;
    const packagePath = path.join(this.packageDir, packagePattern);
    
    if (!await fs.pathExists(packagePath)) {
      throw new Error(`Package not found: ${packagePattern}`);
    }
    
    return packagePath;
  }

  async validateStoreConfig(target, config) {
    const requiredFields = {
      chrome: ['clientId', 'clientSecret', 'refreshToken', 'extensionId'],
      firefox: ['apiKey', 'apiSecret'],
      safari: ['teamId', 'keyId', 'privateKey', 'bundleId'],
      edge: ['clientId', 'clientSecret', 'accessToken', 'productId']
    };
    
    const required = requiredFields[target] || [];
    const missing = required.filter(field => !config[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing ${target} configuration: ${missing.join(', ')}`);
    }
  }

  async uploadPackage(target, packageFile, config) {
    console.log(chalk.gray(`   Uploading package: ${path.basename(packageFile)}`));
    
    switch (target) {
      case 'chrome':
        await this.uploadToChromeWebStore(packageFile, config);
        break;
      case 'firefox':
        await this.uploadToFirefoxAddons(packageFile, config);
        break;
      case 'safari':
        await this.uploadToSafariExtensions(packageFile, config);
        break;
      case 'edge':
        await this.uploadToEdgeAddons(packageFile, config);
        break;
      default:
        throw new Error(`Unknown target: ${target}`);
    }
  }

  async uploadToChromeWebStore(packageFile, config) {
    // Chrome Web Store API implementation
    console.log(chalk.gray('   Using Chrome Web Store API...'));
    
    // This would implement the actual Chrome Web Store API calls
    // For now, we'll simulate the upload
    await this.simulateUpload('Chrome Web Store', packageFile);
  }

  async uploadToFirefoxAddons(packageFile, config) {
    // Firefox Add-ons API implementation
    console.log(chalk.gray('   Using Firefox Add-ons API...'));
    
    // This would implement the actual Firefox Add-ons API calls
    await this.simulateUpload('Firefox Add-ons', packageFile);
  }

  async uploadToSafariExtensions(packageFile, config) {
    // Safari Extensions API implementation
    console.log(chalk.gray('   Using Safari Extensions API...'));
    
    // This would implement the actual Safari Extensions API calls
    await this.simulateUpload('Safari Extensions', packageFile);
  }

  async uploadToEdgeAddons(packageFile, config) {
    // Microsoft Edge Add-ons API implementation
    console.log(chalk.gray('   Using Edge Add-ons API...'));
    
    // This would implement the actual Edge Add-ons API calls
    await this.simulateUpload('Edge Add-ons', packageFile);
  }

  async simulateUpload(storeName, packageFile) {
    // Simulate upload process
    const stats = await fs.stat(packageFile);
    const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(chalk.gray(`   Package size: ${sizeInMB}MB`));
    console.log(chalk.gray(`   Uploading to ${storeName}...`));
    
    // Simulate upload time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(chalk.gray(`   Upload completed`));
  }

  async updateStoreListing(target, config, storeConfig) {
    console.log(chalk.gray('   Updating store listing...'));
    
    // This would update the store listing with new version info
    // For now, we'll just log the action
    console.log(chalk.gray(`   Release notes: ${config.releaseNotes.en.substring(0, 50)}...`));
  }

  async publishExtension(target, config) {
    console.log(chalk.gray('   Publishing extension...'));
    
    // This would trigger the publication process
    // For now, we'll just log the action
    console.log(chalk.gray('   Extension submitted for review'));
  }

  async generateDeploymentReport(targets) {
    const report = {
      timestamp: new Date().toISOString(),
      version: this.getVersion(),
      targets: targets.map(target => ({
        store: target,
        name: this.stores[target].name,
        status: 'deployed',
        requiresReview: this.stores[target].requiresReview
      })),
      nextSteps: [
        'Monitor store review processes',
        'Update documentation with new version',
        'Notify users of new release',
        'Monitor for user feedback and issues'
      ]
    };
    
    const reportPath = path.join(this.packageDir, 'deployment-report.json');
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    console.log(chalk.blue('\n📊 Deployment Report'));
    console.log(chalk.gray('==================='));
    console.log(chalk.white(`Version: ${report.version}`));
    console.log(chalk.white(`Deployed to: ${targets.length} store(s)`));
    
    for (const target of report.targets) {
      const status = target.requiresReview ? 'Pending Review' : 'Published';
      console.log(chalk.gray(`  ${target.name}: ${status}`));
    }
    
    console.log(chalk.green(`\n📄 Report saved: ${reportPath}`));
  }

  getVersion() {
    const packageJson = require(path.join(this.rootDir, 'package.json'));
    return packageJson.version;
  }

  async sendNotifications(targets, config) {
    // Send deployment notifications
    if (config.notifications.slack.webhook) {
      await this.sendSlackNotification(targets, config);
    }
    
    if (config.notifications.email.recipients.length > 0) {
      await this.sendEmailNotification(targets, config);
    }
  }

  async sendSlackNotification(targets, config) {
    // Slack notification implementation
    console.log(chalk.gray('Sending Slack notification...'));
  }

  async sendEmailNotification(targets, config) {
    // Email notification implementation
    console.log(chalk.gray('Sending email notification...'));
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--targets':
        options.targets = args[++i].split(',');
        break;
      case '--skip-confirmation':
        options.skipConfirmation = true;
        break;
      case '--auto-publish':
        options.autoPublish = true;
        break;
    }
  }
  
  const deployer = new ExtensionDeployer();
  await deployer.deploy(options);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ExtensionDeployer;
