#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import the INI parser from the bin directory
const iniParser = require('./../src/iniFileParser');

/**
 * Get the list of changed files between current commit and previous commit
 */
function getChangedFiles() {
  try {
    // Get changed files in the current commit
    const output = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf8' });
    return output.trim().split('\n').filter(file => file.length > 0);
  } catch (error) {
    console.error('Error getting changed files:', error.message);
    // Fallback: get all modified files in working directory
    try {
      const output = execSync('git diff --name-only HEAD', { encoding: 'utf8' });
      return output.trim().split('\n').filter(file => file.length > 0);
    } catch (fallbackError) {
      console.error('Fallback failed:', fallbackError.message);
      return [];
    }
  }
}

/**
 * Load integration ID mappings from CSV file
 */
function loadIntegrationMappings() {
  const csvPath = 'integration-ids.csv';
  const mappings = new Map();
  
  try {
    if (!fs.existsSync(csvPath)) {
      console.log('integration-ids.csv file not found');
      return mappings;
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.trim().split('\n');
    
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
    
    console.log(`Loaded ${mappings.size} integration ID mappings from CSV`);
  } catch (error) {
    console.error('Error loading integration-ids.csv:', error.message);
  }
  
  return mappings;
}
function getApiFiles() {
  const postmanDir = '.postman';
  const apiFiles = [];
  
  if (!fs.existsSync(postmanDir)) {
    console.log('No .postman directory found');
    return apiFiles;
  }
  
  const files = fs.readdirSync(postmanDir);
  
  for (const file of files) {
    const filePath = path.join(postmanDir, file);
    const stat = fs.statSync(filePath);
    
    // Skip the main 'api' file and only process individual API files
    if (stat.isFile() && file.startsWith('api_')) {
      apiFiles.push(filePath);
    }
  }
  
  return apiFiles;
}

/**
 * Parse an API file and extract file paths and root files
 */
function parseApiFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = iniParser.decode(content);
    
    const apiId = parsed.config?.id;
    const apiDefinition = parsed.config?.relations?.apiDefinition;
    
    if (!apiId || !apiDefinition) {
      console.log(`Skipping ${filePath}: missing required sections`);
      return null;
    }
    
    const files = apiDefinition.files || [];
    const rootFiles = apiDefinition.metaData?.rootFiles || [];
    
    // Extract file paths from the files array
    const filePaths = files.map(fileEntry => {
      if (typeof fileEntry === 'string') {
        try {
          const parsed = JSON.parse(fileEntry);
          return parsed.path;
        } catch {
          return fileEntry;
        }
      } else if (fileEntry && fileEntry.path) {
        return fileEntry.path;
      }
      return null;
    }).filter(path => path !== null);
    
    return {
      apiId,
      filePaths,
      rootFiles: Array.isArray(rootFiles) ? rootFiles : []
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Main function to find API changes
 */
function findApiChanges() {
  const changedFiles = getChangedFiles();
  const apiFiles = getApiFiles();
  const integrationMappings = loadIntegrationMappings();
  const results = [];
  
  console.log(`Found ${changedFiles.length} changed files`);
  console.log(`Found ${apiFiles.length} API definition files`);
  
  if (changedFiles.length === 0) {
    console.log('No changed files found');
    return results;
  }
  
  for (const apiFile of apiFiles) {
    const apiData = parseApiFile(apiFile);
    
    if (!apiData) {
      continue;
    }
    
    console.log(`Processing API ${apiData.apiId} with ${apiData.filePaths.length} defined files`);
    
    const apiChangedFiles = [];
    
    // Check which changed files match this API's file paths
    for (const changedFile of changedFiles) {
      for (const apiFilePath of apiData.filePaths) {
        // Check if the changed file matches any of the API file paths
        // Support both exact matches and relative path matches
        if (changedFile === apiFilePath || 
            changedFile.endsWith('/' + apiFilePath) ||
            path.resolve(changedFile) === path.resolve(apiFilePath)) {
          
          // Avoid duplicates
          if (!apiChangedFiles.includes(changedFile)) {
            apiChangedFiles.push(changedFile);
            console.log(`Match found: ${changedFile} for API ${apiData.apiId}`);
          }
        }
      }
    }
    
    // If this API has changed files, add it to results
    if (apiChangedFiles.length > 0) {
      // Get the root file (first one if multiple exist)
      const rootFile = apiData.rootFiles.length > 0 ? apiData.rootFiles[0] : null;
      
      // Look up integration ID
      const integrationId = integrationMappings.get(apiData.apiId) || null;
      
      results.push({
        apiId: apiData.apiId,
        rootFile: rootFile,
        changedFiles: apiChangedFiles,
        integrationId: integrationId
      });
    }
  }
  
  return results;
}

// Main execution
try {
  const results = findApiChanges();
  const jsonOutput = JSON.stringify(results, null, 2);
  
  console.log('\n=== RESULTS ===');
  console.log(jsonOutput);
  
  // Set GitHub Actions output
  if (process.env.GITHUB_ACTIONS) {
    const fs = require('fs');
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
      // Escape newlines for GitHub Actions output
      const escapedJson = jsonOutput.replace(/\n/g, '%0A').replace(/\r/g, '%0D');
      fs.appendFileSync(outputFile, `api-changes=${escapedJson}\n`);
    }
  }
  
  // Exit with success
  process.exit(0);
} catch (error) {
  console.error('Script failed:', error.message);
  process.exit(1);
}
