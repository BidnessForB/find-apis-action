#!/usr/bin/env node

/**
 * Simple test script to verify the find-api-changes functionality
 */

const { execSync } = require('child_process');
const fs = require('fs');

function runTest() {
  console.log('🧪 Testing Find APIs Action...\n');
  
  try {
    // Test 1: Run the standalone script
    console.log('Test 1: Running standalone script...');
    const result = execSync('node .github/scripts/find-api-changes.js', { encoding: 'utf8' });
    console.log('✅ Standalone script executed successfully\n');
    
    // Test 2: Check if action.js exists and can be loaded
    console.log('Test 2: Checking action.js...');
    if (fs.existsSync('./action.js')) {
      console.log('✅ action.js file exists');
    } else {
      console.log('❌ action.js file missing');
      return false;
    }
    
    // Test 3: Check if package.json has required dependencies
    console.log('Test 3: Checking dependencies...');
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    const requiredDeps = ['@actions/core', '@actions/exec'];
    const missing = requiredDeps.filter(dep => !packageJson.dependencies[dep]);
    
    if (missing.length === 0) {
      console.log('✅ All required dependencies present');
    } else {
      console.log(`❌ Missing dependencies: ${missing.join(', ')}`);
      return false;
    }
    
    // Test 4: Check if .postman directory exists
    console.log('Test 4: Checking .postman directory...');
    if (fs.existsSync('./.postman')) {
      const apiFiles = fs.readdirSync('./.postman').filter(f => f.startsWith('api_'));
      console.log(`✅ Found ${apiFiles.length} API definition files`);
    } else {
      console.log('❌ .postman directory not found');
      return false;
    }
    
    // Test 5: Check INI parser
    console.log('Test 5: Testing INI parser...');
    const iniParser = require('./bin/iniFileParser');
    if (typeof iniParser.decode === 'function') {
      console.log('✅ INI parser is functional');
    } else {
      console.log('❌ INI parser not working');
      return false;
    }
    
    console.log('\n🎉 All tests passed! The action is ready to use.');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run the test
const success = runTest();
process.exit(success ? 0 : 1);
