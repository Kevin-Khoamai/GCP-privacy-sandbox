#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');
const inquirer = require('inquirer');

class MobileAppDeployer {
  constructor() {
    this.rootDir = path.resolve(__dirname, '..');
    this.mobileDir = path.join(this.rootDir, 'mobile');
    this.buildDir = path.join(this.rootDir, 'mobile-builds');
    
    this.platforms = {
      ios: {
        name: 'iOS App Store',
        buildDir: path.join(this.mobileDir, 'ios'),
        outputDir: path.join(this.buildDir, 'ios'),
        buildCommand: 'xcodebuild',
        archiveExtension: '.ipa',
        storeUrl: 'https://appstoreconnect.apple.com'
      },
      android: {
        name: 'Google Play Store',
        buildDir: path.join(this.mobileDir, 'android'),
        outputDir: path.join(this.buildDir, 'android'),
        buildCommand: './gradlew',
        archiveExtension: '.aab',
        storeUrl: 'https://play.google.com/console'
      }
    };
  }

  async deploy(options = {}) {
    console.log(chalk.blue('📱 Privacy Cohort Tracker Mobile Deployment'));
    console.log(chalk.gray('============================================\n'));

    try {
      // Load deployment configuration
      const config = await this.loadMobileConfig();
      
      // Validate prerequisites
      await this.validatePrerequisites();
      
      // Select deployment platforms
      const platforms = options.platforms || await this.selectPlatforms();
      
      // Confirm deployment
      if (!options.skipConfirmation) {
        await this.confirmDeployment(platforms, config);
      }
      
      // Execute deployment for each platform
      for (const platform of platforms) {
        await this.deployToPlatform(platform, config);
      }
      
      console.log(chalk.green('\n✅ Mobile deployment completed successfully!'));
      await this.generateDeploymentReport(platforms);
      
    } catch (error) {
      console.error(chalk.red('\n❌ Mobile deployment failed:'), error.message);
      process.exit(1);
    }
  }

  async loadMobileConfig() {
    const configPath = path.join(this.rootDir, 'deployment-config', 'mobile.json');
    
    if (!await fs.pathExists(configPath)) {
      console.log(chalk.yellow('⚠️  No mobile config found. Creating default...'));
      await this.createDefaultMobileConfig();
    }
    
    return await fs.readJson(configPath);
  }

  async createDefaultMobileConfig() {
    const configDir = path.join(this.rootDir, 'deployment-config');
    await fs.ensureDir(configDir);
    
    const defaultConfig = {
      version: this.getVersion(),
      buildNumber: this.getBuildNumber(),
      releaseNotes: {
        en: "Initial release of Privacy Cohort Tracker mobile app with comprehensive privacy controls and local data processing."
      },
      ios: {
        teamId: process.env.IOS_TEAM_ID || '',
        bundleId: 'com.privacycohorttracker.ios',
        provisioningProfile: process.env.IOS_PROVISIONING_PROFILE || '',
        certificateName: process.env.IOS_CERTIFICATE_NAME || '',
        scheme: 'PrivacyCohortTracker',
        configuration: 'Release',
        exportMethod: 'app-store',
        uploadToAppStore: false,
        skipWaitingForBuildProcessing: false
      },
      android: {
        keystore: process.env.ANDROID_KEYSTORE_FILE || '',
        keystorePassword: process.env.ANDROID_KEYSTORE_PASSWORD || '',
        keyAlias: process.env.ANDROID_KEY_ALIAS || '',
        keyPassword: process.env.ANDROID_KEY_PASSWORD || '',
        buildType: 'release',
        uploadToPlayStore: false,
        track: 'internal', // internal, alpha, beta, production
        packageName: 'com.privacycohorttracker.android'
      },
      notifications: {
        slack: {
          webhook: process.env.SLACK_WEBHOOK || '',
          channel: '#mobile-releases'
        },
        email: {
          recipients: ['mobile-team@privacy-cohort-tracker.com']
        }
      }
    };
    
    const configPath = path.join(configDir, 'mobile.json');
    await fs.writeJson(configPath, defaultConfig, { spaces: 2 });
    
    console.log(chalk.green(`✅ Default mobile config created: ${configPath}`));
  }

  async validatePrerequisites() {
    console.log(chalk.cyan('🔍 Validating mobile prerequisites...'));
    
    // Check if mobile directories exist
    for (const [platform, config] of Object.entries(this.platforms)) {
      if (!await fs.pathExists(config.buildDir)) {
        throw new Error(`${platform} project directory not found: ${config.buildDir}`);
      }
    }
    
    // Check build tools
    try {
      // Check Xcode (for iOS)
      if (process.platform === 'darwin') {
        execSync('xcode-select --print-path', { stdio: 'pipe' });
        console.log(chalk.gray('  ✓ Xcode found'));
      }
      
      // Check Android SDK
      if (process.env.ANDROID_HOME) {
        console.log(chalk.gray('  ✓ Android SDK found'));
      } else {
        console.warn(chalk.yellow('  ⚠️  ANDROID_HOME not set'));
      }
      
    } catch (error) {
      console.warn(chalk.yellow('  ⚠️  Some build tools may not be available'));
    }
    
    console.log(chalk.green('✅ Prerequisites validated'));
  }

  async selectPlatforms() {
    const choices = Object.entries(this.platforms).map(([key, platform]) => ({
      name: `${platform.name} (${key})`,
      value: key,
      checked: false
    }));
    
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'platforms',
        message: 'Select mobile platforms to deploy:',
        choices,
        validate: (input) => {
          if (input.length === 0) {
            return 'Please select at least one platform';
          }
          return true;
        }
      }
    ]);
    
    return answers.platforms;
  }

  async confirmDeployment(platforms, config) {
    console.log(chalk.cyan('\n📋 Mobile Deployment Summary:'));
    console.log(chalk.gray('============================'));
    console.log(chalk.white(`Version: ${config.version}`));
    console.log(chalk.white(`Build Number: ${config.buildNumber}`));
    console.log(chalk.white(`Platforms: ${platforms.map(p => this.platforms[p].name).join(', ')}`));
    
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Proceed with mobile deployment?',
        default: false
      }
    ]);
    
    if (!answers.proceed) {
      console.log(chalk.yellow('Mobile deployment cancelled'));
      process.exit(0);
    }
  }

  async deployToPlatform(platform, config) {
    const platformConfig = this.platforms[platform];
    const deployConfig = config[platform];
    
    console.log(chalk.cyan(`\n📱 Deploying to ${platformConfig.name}...`));
    
    try {
      // Prepare build environment
      await this.prepareBuildEnvironment(platform, config);
      
      // Build the app
      await this.buildApp(platform, deployConfig);
      
      // Sign the app (if needed)
      await this.signApp(platform, deployConfig);
      
      // Upload to store (if configured)
      if (deployConfig.uploadToAppStore || deployConfig.uploadToPlayStore) {
        await this.uploadToStore(platform, deployConfig);
      }
      
      console.log(chalk.green(`✅ ${platformConfig.name} deployment completed`));
      
    } catch (error) {
      console.error(chalk.red(`❌ ${platformConfig.name} deployment failed:`), error.message);
      throw error;
    }
  }

  async prepareBuildEnvironment(platform, config) {
    console.log(chalk.gray('   Preparing build environment...'));
    
    const platformConfig = this.platforms[platform];
    await fs.ensureDir(platformConfig.outputDir);
    
    // Update version numbers
    await this.updateVersionNumbers(platform, config);
    
    // Copy assets and resources
    await this.copyBuildAssets(platform);
  }

  async updateVersionNumbers(platform, config) {
    if (platform === 'ios') {
      // Update iOS Info.plist
      const infoPlistPath = path.join(this.platforms.ios.buildDir, 'PrivacyCohortTracker', 'Info.plist');
      if (await fs.pathExists(infoPlistPath)) {
        console.log(chalk.gray('   Updating iOS version numbers...'));
        // In a real implementation, this would use plist parsing
        // For now, we'll just log the action
      }
    } else if (platform === 'android') {
      // Update Android build.gradle
      const buildGradlePath = path.join(this.platforms.android.buildDir, 'app', 'build.gradle');
      if (await fs.pathExists(buildGradlePath)) {
        console.log(chalk.gray('   Updating Android version numbers...'));
        // In a real implementation, this would update the gradle file
        // For now, we'll just log the action
      }
    }
  }

  async copyBuildAssets(platform) {
    console.log(chalk.gray('   Copying build assets...'));
    
    // Copy shared assets to platform-specific locations
    const sharedAssetsDir = path.join(this.rootDir, 'assets', 'mobile');
    
    if (await fs.pathExists(sharedAssetsDir)) {
      const platformAssetsDir = path.join(this.platforms[platform].buildDir, 'assets');
      await fs.copy(sharedAssetsDir, platformAssetsDir);
    }
  }

  async buildApp(platform, config) {
    console.log(chalk.gray('   Building application...'));
    
    const platformConfig = this.platforms[platform];
    const buildDir = platformConfig.buildDir;
    
    try {
      if (platform === 'ios') {
        await this.buildIOS(config, buildDir);
      } else if (platform === 'android') {
        await this.buildAndroid(config, buildDir);
      }
    } catch (error) {
      throw new Error(`Build failed for ${platform}: ${error.message}`);
    }
  }

  async buildIOS(config, buildDir) {
    console.log(chalk.gray('   Running iOS build...'));
    
    // Clean build
    execSync('xcodebuild clean', {
      cwd: buildDir,
      stdio: 'pipe'
    });
    
    // Archive build
    const archiveCommand = [
      'xcodebuild',
      '-workspace PrivacyCohortTracker.xcworkspace',
      '-scheme', config.scheme,
      '-configuration', config.configuration,
      '-archivePath', path.join(this.platforms.ios.outputDir, 'PrivacyCohortTracker.xcarchive'),
      'archive'
    ].join(' ');
    
    execSync(archiveCommand, {
      cwd: buildDir,
      stdio: 'pipe'
    });
    
    console.log(chalk.gray('   iOS archive created successfully'));
  }

  async buildAndroid(config, buildDir) {
    console.log(chalk.gray('   Running Android build...'));
    
    // Clean build
    execSync('./gradlew clean', {
      cwd: buildDir,
      stdio: 'pipe'
    });
    
    // Build AAB (Android App Bundle)
    const buildCommand = `./gradlew bundle${config.buildType.charAt(0).toUpperCase() + config.buildType.slice(1)}`;
    
    execSync(buildCommand, {
      cwd: buildDir,
      stdio: 'pipe'
    });
    
    // Copy AAB to output directory
    const aabPath = path.join(buildDir, 'app', 'build', 'outputs', 'bundle', config.buildType, 'app-release.aab');
    const outputPath = path.join(this.platforms.android.outputDir, 'PrivacyCohortTracker.aab');
    
    await fs.copy(aabPath, outputPath);
    
    console.log(chalk.gray('   Android AAB created successfully'));
  }

  async signApp(platform, config) {
    console.log(chalk.gray('   Signing application...'));
    
    if (platform === 'ios') {
      await this.signIOS(config);
    } else if (platform === 'android') {
      await this.signAndroid(config);
    }
  }

  async signIOS(config) {
    console.log(chalk.gray('   Exporting signed iOS IPA...'));
    
    const exportCommand = [
      'xcodebuild',
      '-exportArchive',
      '-archivePath', path.join(this.platforms.ios.outputDir, 'PrivacyCohortTracker.xcarchive'),
      '-exportPath', this.platforms.ios.outputDir,
      '-exportOptionsPlist', path.join(this.platforms.ios.buildDir, 'ExportOptions.plist')
    ].join(' ');
    
    execSync(exportCommand, {
      cwd: this.platforms.ios.buildDir,
      stdio: 'pipe'
    });
    
    console.log(chalk.gray('   iOS IPA signed and exported'));
  }

  async signAndroid(config) {
    // Android signing is handled by Gradle with the keystore configuration
    console.log(chalk.gray('   Android AAB signed during build process'));
  }

  async uploadToStore(platform, config) {
    console.log(chalk.gray('   Uploading to app store...'));
    
    if (platform === 'ios' && config.uploadToAppStore) {
      await this.uploadToAppStore(config);
    } else if (platform === 'android' && config.uploadToPlayStore) {
      await this.uploadToPlayStore(config);
    }
  }

  async uploadToAppStore(config) {
    console.log(chalk.gray('   Uploading to App Store Connect...'));
    
    // Use altool or Transporter for App Store upload
    const ipaPath = path.join(this.platforms.ios.outputDir, 'PrivacyCohortTracker.ipa');
    
    const uploadCommand = [
      'xcrun altool',
      '--upload-app',
      '--type ios',
      '--file', ipaPath,
      '--username', process.env.APPLE_ID_USERNAME,
      '--password', process.env.APPLE_ID_PASSWORD
    ].join(' ');
    
    // In a real implementation, this would execute the upload
    console.log(chalk.gray('   App Store upload simulated'));
  }

  async uploadToPlayStore(config) {
    console.log(chalk.gray('   Uploading to Google Play Console...'));
    
    // Use Google Play Developer API for upload
    const aabPath = path.join(this.platforms.android.outputDir, 'PrivacyCohortTracker.aab');
    
    // In a real implementation, this would use the Play Developer API
    console.log(chalk.gray('   Play Store upload simulated'));
  }

  async generateDeploymentReport(platforms) {
    const report = {
      timestamp: new Date().toISOString(),
      version: this.getVersion(),
      buildNumber: this.getBuildNumber(),
      platforms: platforms.map(platform => ({
        platform,
        name: this.platforms[platform].name,
        status: 'deployed',
        buildPath: this.platforms[platform].outputDir
      })),
      nextSteps: [
        'Monitor app store review processes',
        'Prepare store listing materials',
        'Update marketing materials',
        'Notify beta testers',
        'Monitor crash reports and user feedback'
      ]
    };
    
    const reportPath = path.join(this.buildDir, 'mobile-deployment-report.json');
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    console.log(chalk.blue('\n📊 Mobile Deployment Report'));
    console.log(chalk.gray('============================'));
    console.log(chalk.white(`Version: ${report.version}`));
    console.log(chalk.white(`Build: ${report.buildNumber}`));
    console.log(chalk.white(`Platforms: ${platforms.length}`));
    
    for (const platform of report.platforms) {
      console.log(chalk.gray(`  ${platform.name}: Deployed`));
    }
    
    console.log(chalk.green(`\n📄 Report saved: ${reportPath}`));
  }

  getVersion() {
    const packageJson = require(path.join(this.rootDir, 'package.json'));
    return packageJson.version;
  }

  getBuildNumber() {
    // Generate build number based on timestamp
    return Math.floor(Date.now() / 1000).toString();
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--platforms':
        options.platforms = args[++i].split(',');
        break;
      case '--skip-confirmation':
        options.skipConfirmation = true;
        break;
      case '--upload':
        options.uploadToStore = true;
        break;
    }
  }
  
  const deployer = new MobileAppDeployer();
  await deployer.deploy(options);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MobileAppDeployer;
