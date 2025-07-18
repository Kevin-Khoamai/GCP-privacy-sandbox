# 🔒 Privacy Cohort Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://chrome.google.com/webstore)
[![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-orange.svg)](https://addons.mozilla.org/)
[![Privacy First](https://img.shields.io/badge/Privacy-First-blue.svg)](#privacy-guarantees)
[![GDPR Compliant](https://img.shields.io/badge/GDPR-Compliant-success.svg)](#legal-compliance)

A privacy-preserving, interest-based cohort tracking system that replaces third-party cookies while maintaining complete user privacy and control. Processes **real Chrome browsing data** locally on your device with zero external data transmission.

## 🌟 **Key Features**

- 🔒 **100% Local Processing** - All data analysis happens on your device
- 📊 **Real Chrome Data** - Uses actual browsing history for cohort assignment
- 🛡️ **Privacy by Design** - Built from ground up with privacy as core principle
- ⚖️ **GDPR/CCPA Compliant** - Full legal compliance with data protection regulations
- 📥 **One-Click Data Export** - Complete data portability with privacy-compliant format
- 🌐 **Cross-Platform** - Browser extensions + mobile apps
- 🔄 **Real-Time Updates** - Dynamic cohort assignment as browsing patterns change

## Project Structure

```
src/
├── shared/                 # Shared components and interfaces
│   ├── interfaces/         # TypeScript interfaces
│   └── core/              # Core business logic
├── browser-extension/      # Browser extension implementation
│   ├── manifest.json      # Extension manifest
│   ├── background.ts      # Service worker
│   ├── content.ts         # Content script
│   ├── popup.html         # Extension popup
│   ├── popup.css          # Popup styles
│   └── popup.ts           # Popup logic
└── mobile/                # Mobile app implementations
    ├── android/           # Android-specific code
    └── ios/               # iOS-specific code
```

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
npm install
```

### Build
```bash
npm run build          # Build all components
npm run build:shared   # Build shared components only
npm run build:extension # Build browser extension only
```

### Testing
```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
```

### Development
```bash
npm run dev:extension # Watch mode for extension development
```

## Architecture

The system follows a modular architecture with clear separation between:
- **Shared Core**: Common interfaces and business logic
- **Browser Extension**: Cross-browser extension implementation
- **Mobile Apps**: Platform-specific mobile implementations

All components share the same TypeScript interfaces ensuring consistency across platforms.