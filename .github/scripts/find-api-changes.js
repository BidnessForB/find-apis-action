#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import the INI parser from the bin directory
const iniParser = require('../../bin/iniFileParser');

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
 * Get all API definition files from .postman directory
 */
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
    
    // Check which changed files match this API's file paths
    for (const changedFile of changedFiles) {
      for (const apiFilePath of apiData.filePaths) {
        // Check if the changed file matches any of the API file paths
        // Support both exact matches and relative path matches
        if (changedFile === apiFilePath || 
            changedFile.endsWith('/' + apiFilePath) ||
            path.resolve(changedFile) === path.resolve(apiFilePath)) {
          
          const isRootFile = apiData.rootFiles.includes(apiFilePath);
          
          results.push({
            apiId: apiData.apiId,
            filePath: changedFile,
            isRootFile: isRootFile
          });
          
          console.log(`Match found: ${changedFile} for API ${apiData.apiId} (root: ${isRootFile})`);
        }
      }
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
