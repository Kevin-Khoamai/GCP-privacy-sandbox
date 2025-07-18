#!/bin/bash

# Privacy Cohort Tracker - Development Environment Setup Script
# This script automates the initial setup process for local development

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check Node.js version
check_node_version() {
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        REQUIRED_VERSION="18.0.0"
        
        if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
            print_success "Node.js version $NODE_VERSION is compatible"
            return 0
        else
            print_error "Node.js version $NODE_VERSION is too old. Required: $REQUIRED_VERSION or higher"
            return 1
        fi
    else
        print_error "Node.js is not installed"
        return 1
    fi
}

# Function to check npm version
check_npm_version() {
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        print_success "npm version $NPM_VERSION is available"
        return 0
    else
        print_error "npm is not installed"
        return 1
    fi
}

# Function to install Node.js (if needed)
install_nodejs() {
    print_status "Node.js installation required..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command_exists brew; then
            print_status "Installing Node.js via Homebrew..."
            brew install node
        else
            print_warning "Homebrew not found. Please install Node.js manually from https://nodejs.org/"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        print_status "Installing Node.js via package manager..."
        if command_exists apt-get; then
            curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command_exists yum; then
            curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
            sudo yum install -y nodejs
        else
            print_warning "Package manager not supported. Please install Node.js manually from https://nodejs.org/"
            exit 1
        fi
    else
        print_warning "OS not supported for automatic installation. Please install Node.js manually from https://nodejs.org/"
        exit 1
    fi
}

# Function to create environment file
create_env_file() {
    print_status "Creating environment configuration..."
    
    if [ ! -f ".env.local" ]; then
        cat > .env.local << EOF
# Privacy Cohort Tracker - Development Environment Configuration
# Generated on $(date)

# Development Environment
NODE_ENV=development
LOG_LEVEL=debug

# Privacy Settings
DATA_RETENTION_DAYS=21
K_ANONYMITY_THRESHOLD=100
DIFFERENTIAL_PRIVACY_EPSILON=0.1

# Security Settings
ENCRYPTION_ALGORITHM=AES-256-GCM
SECURE_STORAGE_ENABLED=true

# API Configuration (for testing)
API_BASE_URL=http://localhost:3000/api/v1
API_TIMEOUT=30000

# Feature Flags
ENABLE_ADVANCED_PRIVACY_CONTROLS=true
ENABLE_EXPERIMENTAL_FEATURES=false
ENABLE_DEBUG_MODE=true

# Browser Extension Settings
EXTENSION_ID=privacy-cohort-tracker-dev
EXTENSION_VERSION=1.0.0-dev

# Mobile App Settings
MOBILE_APP_ID=com.privacycohorttracker.dev
MOBILE_VERSION=1.0.0

# Testing Configuration
TEST_TIMEOUT=30000
TEST_USER_ID=test_user_dev
TEST_SESSION_ID=test_session_dev
EOF
        print_success "Environment file created: .env.local"
    else
        print_warning "Environment file already exists: .env.local"
    fi
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing project dependencies..."
    
    # Clear npm cache to avoid potential issues
    npm cache clean --force
    
    # Install dependencies
    npm install
    
    print_success "Dependencies installed successfully"
}

# Function to build project
build_project() {
    print_status "Building project components..."
    
    # Build shared core
    print_status "Building shared core library..."
    npm run build:shared
    
    # Build browser extension
    print_status "Building browser extension..."
    npm run build:extension
    
    print_success "Project built successfully"
}

# Function to run initial tests
run_initial_tests() {
    print_status "Running initial test suite..."
    
    # Run unit tests
    npm run test:unit
    
    print_success "Initial tests passed"
}

# Function to setup development tools
setup_dev_tools() {
    print_status "Setting up development tools..."
    
    # Create VS Code settings if not exists
    if [ ! -d ".vscode" ]; then
        mkdir -p .vscode
        
        # Create VS Code settings
        cat > .vscode/settings.json << EOF
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.git": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true
  }
}
EOF
        
        # Create VS Code extensions recommendations
        cat > .vscode/extensions.json << EOF
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json"
  ]
}
EOF
        
        print_success "VS Code configuration created"
    fi
}

# Function to create development scripts
create_dev_scripts() {
    print_status "Creating development helper scripts..."
    
    # Create quick start script
    cat > quick-start.sh << 'EOF'
#!/bin/bash
echo "🚀 Privacy Cohort Tracker - Quick Start"
echo "======================================"
echo ""
echo "Starting development environment..."
echo ""

# Start development server in background
npm run dev &
DEV_PID=$!

echo "Development server started (PID: $DEV_PID)"
echo ""
echo "Available at:"
echo "- Browser Extension: Load dist/chrome in Chrome extensions"
echo "- Development Server: http://localhost:3000"
echo "- API Server: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap "kill $DEV_PID 2>/dev/null; exit" INT
wait
EOF
    
    chmod +x quick-start.sh
    
    # Create test script
    cat > run-tests.sh << 'EOF'
#!/bin/bash
echo "🧪 Privacy Cohort Tracker - Test Suite"
echo "======================================"
echo ""

echo "Running unit tests..."
npm run test:unit

echo ""
echo "Running integration tests..."
npm run test:integration

echo ""
echo "Running privacy compliance tests..."
npm run test:privacy

echo ""
echo "Generating coverage report..."
npm run test:coverage

echo ""
echo "✅ All tests completed!"
echo "Coverage report available at: coverage/index.html"
EOF
    
    chmod +x run-tests.sh
    
    print_success "Development scripts created"
}

# Function to display final instructions
display_final_instructions() {
    print_success "🎉 Development environment setup completed!"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo "1. Review the configuration in .env.local"
    echo "2. Start development: ./quick-start.sh"
    echo "3. Load browser extension:"
    echo "   - Chrome: chrome://extensions/ -> Load unpacked -> dist/chrome"
    echo "   - Firefox: about:debugging -> Load Temporary Add-on -> dist/firefox/manifest.json"
    echo ""
    echo -e "${BLUE}Available Commands:${NC}"
    echo "- npm run dev          # Start development server"
    echo "- npm test             # Run all tests"
    echo "- npm run build        # Build all components"
    echo "- ./quick-start.sh     # Quick development start"
    echo "- ./run-tests.sh       # Run comprehensive tests"
    echo ""
    echo -e "${BLUE}Documentation:${NC}"
    echo "- LOCAL_DEVELOPMENT_GUIDE.md  # Detailed development guide"
    echo "- docs/                       # Complete documentation"
    echo "- README.md                   # Project overview"
    echo ""
    echo -e "${GREEN}Happy coding! 🚀${NC}"
}

# Main setup function
main() {
    echo -e "${BLUE}"
    echo "🔒 Privacy Cohort Tracker"
    echo "Development Environment Setup"
    echo "============================="
    echo -e "${NC}"
    echo ""
    
    # Check prerequisites
    print_status "Checking prerequisites..."
    
    if ! check_node_version; then
        print_status "Installing Node.js..."
        install_nodejs
        
        # Verify installation
        if ! check_node_version; then
            print_error "Node.js installation failed"
            exit 1
        fi
    fi
    
    if ! check_npm_version; then
        print_error "npm installation failed"
        exit 1
    fi
    
    # Setup project
    create_env_file
    install_dependencies
    build_project
    setup_dev_tools
    create_dev_scripts
    
    # Run initial tests (optional)
    read -p "Run initial tests? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        run_initial_tests
    fi
    
    # Display final instructions
    display_final_instructions
}

# Run main function
main "$@"
