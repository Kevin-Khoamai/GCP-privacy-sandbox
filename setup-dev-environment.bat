@echo off
REM Privacy Cohort Tracker - Development Environment Setup Script (Windows)
REM This script automates the initial setup process for local development on Windows

setlocal enabledelayedexpansion

echo.
echo 🔒 Privacy Cohort Tracker
echo Development Environment Setup (Windows)
echo ========================================
echo.

REM Check if Node.js is installed
echo [INFO] Checking prerequisites...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    echo Minimum required version: 18.0.0
    pause
    exit /b 1
) else (
    echo [SUCCESS] Node.js is installed
)

REM Check npm
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed
    pause
    exit /b 1
) else (
    echo [SUCCESS] npm is available
)

REM Create environment file
echo [INFO] Creating environment configuration...
if not exist ".env.local" (
    (
        echo # Privacy Cohort Tracker - Development Environment Configuration
        echo # Generated on %date% %time%
        echo.
        echo # Development Environment
        echo NODE_ENV=development
        echo LOG_LEVEL=debug
        echo.
        echo # Privacy Settings
        echo DATA_RETENTION_DAYS=21
        echo K_ANONYMITY_THRESHOLD=100
        echo DIFFERENTIAL_PRIVACY_EPSILON=0.1
        echo.
        echo # Security Settings
        echo ENCRYPTION_ALGORITHM=AES-256-GCM
        echo SECURE_STORAGE_ENABLED=true
        echo.
        echo # API Configuration (for testing^)
        echo API_BASE_URL=http://localhost:3000/api/v1
        echo API_TIMEOUT=30000
        echo.
        echo # Feature Flags
        echo ENABLE_ADVANCED_PRIVACY_CONTROLS=true
        echo ENABLE_EXPERIMENTAL_FEATURES=false
        echo ENABLE_DEBUG_MODE=true
        echo.
        echo # Browser Extension Settings
        echo EXTENSION_ID=privacy-cohort-tracker-dev
        echo EXTENSION_VERSION=1.0.0-dev
        echo.
        echo # Mobile App Settings
        echo MOBILE_APP_ID=com.privacycohorttracker.dev
        echo MOBILE_VERSION=1.0.0
        echo.
        echo # Testing Configuration
        echo TEST_TIMEOUT=30000
        echo TEST_USER_ID=test_user_dev
        echo TEST_SESSION_ID=test_session_dev
    ) > .env.local
    echo [SUCCESS] Environment file created: .env.local
) else (
    echo [WARNING] Environment file already exists: .env.local
)

REM Install dependencies
echo [INFO] Installing project dependencies...
echo This may take a few minutes...
npm cache clean --force
npm install
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [SUCCESS] Dependencies installed successfully

REM Build project
echo [INFO] Building project components...
echo Building shared core library...
npm run build:shared
if errorlevel 1 (
    echo [ERROR] Failed to build shared core
    pause
    exit /b 1
)

echo Building browser extension...
npm run build:extension
if errorlevel 1 (
    echo [ERROR] Failed to build browser extension
    pause
    exit /b 1
)
echo [SUCCESS] Project built successfully

REM Setup development tools
echo [INFO] Setting up development tools...
if not exist ".vscode" mkdir .vscode

REM Create VS Code settings
if not exist ".vscode\settings.json" (
    (
        echo {
        echo   "typescript.preferences.importModuleSpecifier": "relative",
        echo   "editor.formatOnSave": true,
        echo   "editor.codeActionsOnSave": {
        echo     "source.fixAll.eslint": true
        echo   },
        echo   "files.exclude": {
        echo     "**/node_modules": true,
        echo     "**/dist": true,
        echo     "**/.git": true
        echo   },
        echo   "search.exclude": {
        echo     "**/node_modules": true,
        echo     "**/dist": true
        echo   }
        echo }
    ) > .vscode\settings.json
)

REM Create VS Code extensions recommendations
if not exist ".vscode\extensions.json" (
    (
        echo {
        echo   "recommendations": [
        echo     "ms-vscode.vscode-typescript-next",
        echo     "dbaeumer.vscode-eslint",
        echo     "esbenp.prettier-vscode",
        echo     "bradlc.vscode-tailwindcss",
        echo     "ms-vscode.vscode-json"
        echo   ]
        echo }
    ) > .vscode\extensions.json
)
echo [SUCCESS] VS Code configuration created

REM Create development helper scripts
echo [INFO] Creating development helper scripts...

REM Create quick start script
(
    echo @echo off
    echo echo 🚀 Privacy Cohort Tracker - Quick Start
    echo echo ======================================
    echo echo.
    echo echo Starting development environment...
    echo echo.
    echo start /b npm run dev
    echo echo Development server started
    echo echo.
    echo echo Available at:
    echo echo - Browser Extension: Load dist\chrome in Chrome extensions
    echo echo - Development Server: http://localhost:3000
    echo echo - API Server: http://localhost:3001
    echo echo.
    echo echo Press any key to stop development server...
    echo pause ^>nul
    echo taskkill /f /im node.exe 2^>nul
) > quick-start.bat

REM Create test script
(
    echo @echo off
    echo echo 🧪 Privacy Cohort Tracker - Test Suite
    echo echo ======================================
    echo echo.
    echo echo Running unit tests...
    echo npm run test:unit
    echo echo.
    echo echo Running integration tests...
    echo npm run test:integration
    echo echo.
    echo echo Running privacy compliance tests...
    echo npm run test:privacy
    echo echo.
    echo echo Generating coverage report...
    echo npm run test:coverage
    echo echo.
    echo echo ✅ All tests completed!
    echo echo Coverage report available at: coverage\index.html
    echo pause
) > run-tests.bat

echo [SUCCESS] Development scripts created

REM Ask about running initial tests
echo.
set /p run_tests="Run initial tests? (y/N): "
if /i "!run_tests!"=="y" (
    echo [INFO] Running initial test suite...
    npm run test:unit
    if errorlevel 1 (
        echo [WARNING] Some tests failed, but setup continues...
    ) else (
        echo [SUCCESS] Initial tests passed
    )
)

REM Display final instructions
echo.
echo [SUCCESS] 🎉 Development environment setup completed!
echo.
echo Next Steps:
echo 1. Review the configuration in .env.local
echo 2. Start development: quick-start.bat
echo 3. Load browser extension:
echo    - Chrome: chrome://extensions/ -^> Load unpacked -^> dist\chrome
echo    - Firefox: about:debugging -^> Load Temporary Add-on -^> dist\firefox\manifest.json
echo.
echo Available Commands:
echo - npm run dev          # Start development server
echo - npm test             # Run all tests
echo - npm run build        # Build all components
echo - quick-start.bat      # Quick development start
echo - run-tests.bat        # Run comprehensive tests
echo.
echo Documentation:
echo - LOCAL_DEVELOPMENT_GUIDE.md  # Detailed development guide
echo - docs\                       # Complete documentation
echo - README.md                   # Project overview
echo.
echo Happy coding! 🚀
echo.
pause
