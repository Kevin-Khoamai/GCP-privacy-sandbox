#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

/**
 * Simple development server for Privacy Cohort Tracker
 * Serves static files and provides basic API endpoints for testing
 */
class DevServer {
  constructor(port = 3000) {
    this.port = port;
    this.server = null;
  }

  start() {
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.listen(this.port, () => {
      console.log(`🚀 Privacy Cohort Tracker Development Server`);
      console.log(`📡 Server running at http://localhost:${this.port}`);
      console.log(`📁 Serving files from: ${path.resolve('.')}`);
      console.log(`🔧 API endpoints available at /api/*`);
      console.log(`📊 Extension files at /dist/chrome/`);
      console.log('');
      console.log('Available endpoints:');
      console.log('- GET  /                    # Development dashboard');
      console.log('- GET  /api/health          # Health check');
      console.log('- GET  /api/cohorts         # Mock cohort data');
      console.log('- POST /api/cohorts/assign  # Mock cohort assignment');
      console.log('- GET  /dist/chrome/        # Chrome extension files');
      console.log('- GET  /dist/firefox/       # Firefox extension files');
      console.log('');
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${this.port} is already in use`);
        console.log(`💡 Try running: npm run dev:server -- --port ${this.port + 1}`);
      } else {
        console.error('❌ Server error:', err);
      }
      process.exit(1);
    });
  }

  handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Set CORS headers for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // API routes
    if (pathname.startsWith('/api/')) {
      this.handleApiRequest(req, res, pathname);
      return;
    }

    // Static file serving
    this.handleStaticFile(req, res, pathname);
  }

  handleApiRequest(req, res, pathname) {
    res.setHeader('Content-Type', 'application/json');

    switch (pathname) {
      case '/api/health':
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0-dev',
          environment: 'development'
        }));
        break;

      case '/api/cohorts':
        res.writeHead(200);
        res.end(JSON.stringify({
          cohorts: [
            { id: 'tech_001', name: 'Technology Enthusiasts', confidence: 0.85 },
            { id: 'health_002', name: 'Health & Wellness', confidence: 0.72 },
            { id: 'travel_003', name: 'Travel & Adventure', confidence: 0.68 }
          ],
          timestamp: new Date().toISOString(),
          userId: 'dev_user_001'
        }));
        break;

      case '/api/cohorts/assign':
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              res.writeHead(200);
              res.end(JSON.stringify({
                success: true,
                assignedCohorts: [
                  { id: 'dynamic_001', name: 'Dynamic Assignment', confidence: 0.90 }
                ],
                timestamp: new Date().toISOString(),
                requestData: data
              }));
            } catch (error) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
        } else {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        break;

      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'API endpoint not found' }));
    }
  }

  handleStaticFile(req, res, pathname) {
    // Default to index.html for root
    if (pathname === '/') {
      this.serveDevelopmentDashboard(res);
      return;
    }

    // Serve static files
    const filePath = path.join('.', pathname);
    
    // Security check - prevent directory traversal
    if (!filePath.startsWith(path.resolve('.'))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }

      // Determine content type
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      // Serve the file
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      
      stream.on('error', () => {
        res.writeHead(500);
        res.end('Internal server error');
      });
    });
  }

  serveDevelopmentDashboard(res) {
    const dashboard = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Cohort Tracker - Development Dashboard</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .card { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .status { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .status.running { background: #10b981; color: white; }
        .status.stopped { background: #ef4444; color: white; }
        .link { color: #2563eb; text-decoration: none; }
        .link:hover { text-decoration: underline; }
        .code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
        ul { padding-left: 20px; }
        li { margin-bottom: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Privacy Cohort Tracker</h1>
            <p>Development Dashboard - Local Environment</p>
            <span class="status running">Server Running</span>
        </div>

        <div class="grid">
            <div class="card">
                <h3>📊 Server Status</h3>
                <ul>
                    <li><strong>Port:</strong> ${this.port}</li>
                    <li><strong>Environment:</strong> Development</li>
                    <li><strong>Started:</strong> ${new Date().toLocaleString()}</li>
                    <li><strong>API Base:</strong> <a href="/api/health" class="link">/api/</a></li>
                </ul>
            </div>

            <div class="card">
                <h3>🌐 Browser Extensions</h3>
                <ul>
                    <li><a href="/dist/chrome/" class="link">Chrome Extension Files</a></li>
                    <li><a href="/dist/firefox/" class="link">Firefox Extension Files</a></li>
                    <li><a href="/dist/safari/" class="link">Safari Extension Files</a></li>
                </ul>
                <p><small>Load these in your browser's developer mode</small></p>
            </div>

            <div class="card">
                <h3>🧪 API Endpoints</h3>
                <ul>
                    <li><a href="/api/health" class="link">GET /api/health</a> - Health check</li>
                    <li><a href="/api/cohorts" class="link">GET /api/cohorts</a> - Mock cohort data</li>
                    <li><span class="code">POST /api/cohorts/assign</span> - Cohort assignment</li>
                </ul>
            </div>

            <div class="card">
                <h3>📚 Documentation</h3>
                <ul>
                    <li><a href="/docs/" class="link">API Documentation</a></li>
                    <li><a href="/LOCAL_DEVELOPMENT_GUIDE.md" class="link">Development Guide</a></li>
                    <li><a href="/README.md" class="link">Project README</a></li>
                    <li><a href="/PrivacyCohortTrackerSummary.md" class="link">Project Summary</a></li>
                </ul>
            </div>

            <div class="card">
                <h3>🔧 Development Tools</h3>
                <ul>
                    <li><strong>Build:</strong> <span class="code">npm run build</span></li>
                    <li><strong>Test:</strong> <span class="code">npm test</span></li>
                    <li><strong>Lint:</strong> <span class="code">npm run lint</span></li>
                    <li><strong>Type Check:</strong> <span class="code">npm run type-check</span></li>
                </ul>
            </div>

            <div class="card">
                <h3>📱 Mobile Development</h3>
                <ul>
                    <li><strong>Android:</strong> <span class="code">npm run android:emulator</span></li>
                    <li><strong>iOS:</strong> <span class="code">npm run ios:simulator</span></li>
                    <li><a href="/mobile/" class="link">Mobile Source Files</a></li>
                </ul>
            </div>
        </div>

        <div class="card">
            <h3>🚀 Quick Start Commands</h3>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 4px; font-family: monospace;">
                # Start development environment<br>
                npm run dev<br><br>
                
                # Build all components<br>
                npm run build<br><br>
                
                # Run tests<br>
                npm test<br><br>
                
                # Load browser extension<br>
                # Chrome: chrome://extensions/ -> Load unpacked -> dist/chrome<br>
                # Firefox: about:debugging -> Load Temporary Add-on -> dist/firefox/manifest.json
            </div>
        </div>
    </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(dashboard);
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('🛑 Development server stopped');
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const portArg = args.find(arg => arg.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1]) : 3000;

  const server = new DevServer(port);
  server.start();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down development server...');
    server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    server.stop();
    process.exit(0);
  });
}

module.exports = DevServer;
