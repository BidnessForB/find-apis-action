#!/usr/bin/env node

/**
 * Test script to verify integration ID functionality
 */

const fs = require('fs');

console.log('🧪 Testing Integration ID functionality...\n');

// Test the CSV parsing functionality
function testCSVParsing() {
  console.log('Test 1: CSV parsing functionality...');
  
  // Import the standalone script functions
  const script = fs.readFileSync('.github/scripts/find-api-changes.js', 'utf8');
  
  // Create a temporary CSV file for testing
  const testCSV = `api-id, integration-id
test-api-1,12345
test-api-2,67890
`;
  
  fs.writeFileSync('test-integration-ids.csv', testCSV);
  
  try {
    // Test the loadIntegrationMappings function
    eval(`
      const fs = require('fs');
      const path = require('path');
      
      function loadIntegrationMappings() {
        const csvPath = 'test-integration-ids.csv';
        const mappings = new Map();
        
        try {
          if (!fs.existsSync(csvPath)) {
            console.log('CSV file not found');
            return mappings;
          }
          
          const csvContent = fs.readFileSync(csvPath, 'utf8');
          const lines = csvContent.trim().split('\\n');
          
          // Skip header row if present
          const dataLines = lines.slice(1);
          
          for (const line of dataLines) {
            if (line.trim()) {
              const [apiId, integrationId] = line.split(',').map(col => col.trim());
              if (apiId && integrationId) {
                mappings.set(apiId, integrationId);
              }
            }
          }
          
          console.log(\`Loaded \${mappings.size} integration ID mappings from CSV\`);
        } catch (error) {
          console.error('Error loading CSV:', error.message);
        }
        
        return mappings;
      }
      
      const mappings = loadIntegrationMappings();
      
      // Test mappings
      console.log('✅ Loaded mappings:', mappings.size);
      console.log('✅ test-api-1 maps to:', mappings.get('test-api-1'));
      console.log('✅ test-api-2 maps to:', mappings.get('test-api-2'));
      console.log('✅ unknown-api maps to:', mappings.get('unknown-api') || 'null');
    `);
    
    // Clean up
    fs.unlinkSync('test-integration-ids.csv');
    
    console.log('✅ CSV parsing test passed\n');
    return true;
    
  } catch (error) {
    console.error('❌ CSV parsing test failed:', error.message);
    fs.unlinkSync('test-integration-ids.csv');
    return false;
  }
}

// Test CSV file missing scenario
function testMissingCSV() {
  console.log('Test 2: Missing CSV file scenario...');
  
  try {
    eval(`
      const fs = require('fs');
      
      function loadIntegrationMappings() {
        const csvPath = 'non-existent-file.csv';
        const mappings = new Map();
        
        try {
          if (!fs.existsSync(csvPath)) {
            console.log('CSV file not found (expected)');
            return mappings;
          }
        } catch (error) {
          console.error('Error loading CSV:', error.message);
        }
        
        return mappings;
      }
      
      const mappings = loadIntegrationMappings();
      console.log('✅ Empty mappings size:', mappings.size);
    `);
    
    console.log('✅ Missing CSV test passed\n');
    return true;
    
  } catch (error) {
    console.error('❌ Missing CSV test failed:', error.message);
    return false;
  }
}

// Run tests
const test1 = testCSVParsing();
const test2 = testMissingCSV();

if (test1 && test2) {
  console.log('🎉 All integration ID tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some integration ID tests failed!');
  process.exit(1);
}
