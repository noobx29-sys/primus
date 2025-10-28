#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import config from '../utils/config.js';

/**
 * Validation utility for analysis results
 * Checks screenshots, reports, and output quality
 */

class Validator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate screenshot file
   * @param {string} screenshotPath - Path to screenshot
   * @returns {boolean} Is valid
   */
  validateScreenshot(screenshotPath) {
    if (!fs.existsSync(screenshotPath)) {
      this.errors.push(`Screenshot not found: ${screenshotPath}`);
      return false;
    }

    const stats = fs.statSync(screenshotPath);
    
    // Check file size
    if (stats.size < 10000) {
      this.warnings.push(`Screenshot too small: ${screenshotPath} (${stats.size} bytes)`);
      return false;
    }

    if (stats.size > 10000000) {
      this.warnings.push(`Screenshot very large: ${screenshotPath} (${stats.size} bytes)`);
    }

    return true;
  }

  /**
   * Validate analysis report
   * @param {Object} report - Analysis report
   * @returns {boolean} Is valid
   */
  validateReport(report) {
    const required = ['pair', 'strategy', 'signal', 'confidence', 'valid'];
    
    for (const field of required) {
      if (!report[field] && report[field] !== false) {
        this.errors.push(`Missing required field: ${field}`);
        return false;
      }
    }

    // Validate confidence
    if (report.confidence < 0 || report.confidence > 1) {
      this.errors.push(`Invalid confidence: ${report.confidence}`);
      return false;
    }

    // Check if zones exist
    if (report.valid) {
      const hasZones = report.daily_zone || report.primary_zone;
      if (!hasZones) {
        this.warnings.push('Valid analysis but no zones found');
      }
    }

    return true;
  }

  /**
   * Validate all outputs in directory
   * @param {string} dir - Directory to validate
   */
  validateDirectory(dir) {
    if (!fs.existsSync(dir)) {
      console.log(`Directory not found: ${dir}`);
      return;
    }

    const files = fs.readdirSync(dir);
    console.log(`\nValidating ${files.length} files in ${dir}...`);

    files.forEach(file => {
      const filePath = path.join(dir, file);
      
      if (file.endsWith('.png')) {
        this.validateScreenshot(filePath);
      } else if (file.endsWith('.json')) {
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          this.validateReport(content);
        } catch (error) {
          this.errors.push(`Invalid JSON in ${file}: ${error.message}`);
        }
      }
    });
  }

  /**
   * Run full validation
   */
  runValidation() {
    console.log('🔍 Running validation...\n');

    // Validate output directory
    this.validateDirectory(config.directories.output);

    // Validate reports directory
    this.validateDirectory(config.directories.reports);

    // Print results
    this.printResults();
  }

  /**
   * Print validation results
   */
  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(60));

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✓ All validations passed!');
    } else {
      if (this.errors.length > 0) {
        console.log(`\n✗ Errors (${this.errors.length}):`);
        this.errors.forEach(e => console.log(`  - ${e}`));
      }

      if (this.warnings.length > 0) {
        console.log(`\n⚠ Warnings (${this.warnings.length}):`);
        this.warnings.forEach(w => console.log(`  - ${w}`));
      }
    }

    console.log('='.repeat(60));
  }
}

// Run validator
const validator = new Validator();
validator.runValidation();
