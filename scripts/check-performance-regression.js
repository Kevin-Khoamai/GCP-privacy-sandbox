#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Performance baseline thresholds (in milliseconds or MB)
const PERFORMANCE_BASELINES = {
  cohortAssignmentSmall: 50,
  cohortAssignmentMedium: 200,
  cohortAssignmentLarge: 1000,
  encryptionSmall: 10,
  encryptionMedium: 50,
  privacyControlsRetrieval: 5,
  storageOperations: 20,
  memoryUsageIncrease: 50
};

// Regression thresholds (percentage increase that triggers a warning/failure)
const REGRESSION_THRESHOLDS = {
  warning: 10, // 10% increase triggers warning
  failure: 25  // 25% increase triggers failure
};

class PerformanceRegressionChecker {
  constructor() {
    this.resultsDir = path.join(process.cwd(), 'test-results', 'performance');
    this.currentResults = null;
    this.historicalResults = [];
    this.regressions = [];
    this.warnings = [];
  }

  async loadCurrentResults() {
    const currentResultsPath = path.join(this.resultsDir, 'current-results.json');
    
    if (!fs.existsSync(currentResultsPath)) {
      throw new Error('Current performance results not found. Run performance tests first.');
    }

    this.currentResults = JSON.parse(fs.readFileSync(currentResultsPath, 'utf8'));
    console.log('✓ Loaded current performance results');
  }

  async loadHistoricalResults() {
    const historicalResultsPath = path.join(this.resultsDir, 'historical-results.json');
    
    if (fs.existsSync(historicalResultsPath)) {
      this.historicalResults = JSON.parse(fs.readFileSync(historicalResultsPath, 'utf8'));
      console.log(`✓ Loaded ${this.historicalResults.length} historical performance results`);
    } else {
      console.log('! No historical results found. This will be the baseline.');
      this.historicalResults = [];
    }
  }

  calculateBaseline() {
    if (this.historicalResults.length === 0) {
      return PERFORMANCE_BASELINES;
    }

    // Calculate baseline from recent historical results (last 10 runs)
    const recentResults = this.historicalResults.slice(-10);
    const baseline = {};

    for (const metric in PERFORMANCE_BASELINES) {
      const values = recentResults
        .map(result => result.metrics[metric])
        .filter(value => value !== undefined && value !== null);

      if (values.length > 0) {
        // Use median as baseline to reduce impact of outliers
        values.sort((a, b) => a - b);
        const median = values.length % 2 === 0
          ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
          : values[Math.floor(values.length / 2)];
        
        baseline[metric] = median;
      } else {
        baseline[metric] = PERFORMANCE_BASELINES[metric];
      }
    }

    return baseline;
  }

  checkForRegressions() {
    const baseline = this.calculateBaseline();
    
    console.log('\n📊 Performance Regression Analysis');
    console.log('=====================================');

    for (const metric in baseline) {
      const currentValue = this.currentResults.metrics[metric];
      const baselineValue = baseline[metric];

      if (currentValue === undefined || baselineValue === undefined) {
        console.log(`⚠️  ${metric}: Missing data`);
        continue;
      }

      const percentageChange = ((currentValue - baselineValue) / baselineValue) * 100;
      const isRegression = percentageChange > 0; // Increase is bad for performance metrics

      if (isRegression && percentageChange >= REGRESSION_THRESHOLDS.failure) {
        this.regressions.push({
          metric,
          current: currentValue,
          baseline: baselineValue,
          change: percentageChange,
          severity: 'failure'
        });
        console.log(`❌ ${metric}: ${currentValue.toFixed(2)} vs ${baselineValue.toFixed(2)} (${percentageChange.toFixed(1)}% worse)`);
      } else if (isRegression && percentageChange >= REGRESSION_THRESHOLDS.warning) {
        this.warnings.push({
          metric,
          current: currentValue,
          baseline: baselineValue,
          change: percentageChange,
          severity: 'warning'
        });
        console.log(`⚠️  ${metric}: ${currentValue.toFixed(2)} vs ${baselineValue.toFixed(2)} (${percentageChange.toFixed(1)}% worse)`);
      } else if (percentageChange < 0) {
        console.log(`✅ ${metric}: ${currentValue.toFixed(2)} vs ${baselineValue.toFixed(2)} (${Math.abs(percentageChange).toFixed(1)}% better)`);
      } else {
        console.log(`✓  ${metric}: ${currentValue.toFixed(2)} vs ${baselineValue.toFixed(2)} (${percentageChange.toFixed(1)}% change)`);
      }
    }

    return { baseline, regressions: this.regressions, warnings: this.warnings };
  }

  generateReport() {
    const baseline = this.calculateBaseline();
    
    const report = {
      timestamp: new Date().toISOString(),
      version: this.currentResults.version || 'unknown',
      testEnvironment: this.currentResults.testEnvironment || 'unknown',
      baseline,
      current: this.currentResults.metrics,
      regressions: this.regressions,
      warnings: this.warnings,
      changes: {},
      summary: {
        totalMetrics: Object.keys(baseline).length,
        regressionCount: this.regressions.length,
        warningCount: this.warnings.length,
        status: this.regressions.length > 0 ? 'FAILED' : this.warnings.length > 0 ? 'WARNING' : 'PASSED'
      }
    };

    // Calculate changes for each metric
    for (const metric in baseline) {
      const currentValue = this.currentResults.metrics[metric];
      const baselineValue = baseline[metric];
      
      if (currentValue !== undefined && baselineValue !== undefined) {
        const percentageChange = ((currentValue - baselineValue) / baselineValue) * 100;
        report.changes[metric] = percentageChange > 0 ? `+${percentageChange.toFixed(1)}%` : `${percentageChange.toFixed(1)}%`;
      }
    }

    return report;
  }

  saveReport(report) {
    // Save detailed report
    const reportPath = path.join(this.resultsDir, 'regression-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Save summary for CI
    const summaryPath = path.join(this.resultsDir, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
      ...report.current,
      baseline: report.baseline,
      changes: report.changes,
      regressions: report.regressions,
      status: report.summary.status
    }, null, 2));

    // Update historical results
    this.historicalResults.push({
      timestamp: report.timestamp,
      version: report.version,
      metrics: this.currentResults.metrics
    });

    // Keep only last 50 results to prevent file from growing too large
    if (this.historicalResults.length > 50) {
      this.historicalResults = this.historicalResults.slice(-50);
    }

    const historicalPath = path.join(this.resultsDir, 'historical-results.json');
    fs.writeFileSync(historicalPath, JSON.stringify(this.historicalResults, null, 2));

    console.log(`\n📄 Reports saved:`);
    console.log(`   - Detailed: ${reportPath}`);
    console.log(`   - Summary: ${summaryPath}`);
    console.log(`   - Historical: ${historicalPath}`);
  }

  printSummary(report) {
    console.log('\n📋 Performance Summary');
    console.log('======================');
    console.log(`Status: ${report.summary.status}`);
    console.log(`Total Metrics: ${report.summary.totalMetrics}`);
    console.log(`Regressions: ${report.summary.regressionCount}`);
    console.log(`Warnings: ${report.summary.warningCount}`);

    if (report.regressions.length > 0) {
      console.log('\n❌ Performance Regressions:');
      report.regressions.forEach(regression => {
        console.log(`   - ${regression.metric}: ${regression.change.toFixed(1)}% worse`);
      });
    }

    if (report.warnings.length > 0) {
      console.log('\n⚠️  Performance Warnings:');
      report.warnings.forEach(warning => {
        console.log(`   - ${warning.metric}: ${warning.change.toFixed(1)}% worse`);
      });
    }

    if (report.regressions.length === 0 && report.warnings.length === 0) {
      console.log('\n✅ No performance regressions detected!');
    }
  }

  async run() {
    try {
      console.log('🔍 Checking for performance regressions...\n');

      // Ensure results directory exists
      if (!fs.existsSync(this.resultsDir)) {
        fs.mkdirSync(this.resultsDir, { recursive: true });
      }

      await this.loadCurrentResults();
      await this.loadHistoricalResults();
      
      this.checkForRegressions();
      
      const report = this.generateReport();
      this.saveReport(report);
      this.printSummary(report);

      // Exit with appropriate code
      if (report.summary.status === 'FAILED') {
        console.log('\n💥 Performance regression check FAILED');
        process.exit(1);
      } else if (report.summary.status === 'WARNING') {
        console.log('\n⚠️  Performance regression check completed with WARNINGS');
        process.exit(0); // Don't fail CI for warnings
      } else {
        console.log('\n✅ Performance regression check PASSED');
        process.exit(0);
      }

    } catch (error) {
      console.error('❌ Error during performance regression check:', error.message);
      process.exit(1);
    }
  }
}

// Run the checker if this script is executed directly
if (require.main === module) {
  const checker = new PerformanceRegressionChecker();
  checker.run();
}

module.exports = PerformanceRegressionChecker;
