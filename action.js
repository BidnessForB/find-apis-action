const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs');
const path = require('path');

// Import the INI parser from the bin directory
const iniParser = require('./bin/iniFileParser');

/**
 * Get the list of changed files between commits
 */
async function getChangedFiles(baseRef = 'HEAD~1') {
  try {
    let output = '';
    const options = {
      listeners: {
        stdout: (data) => {
          output += data.toString();
        }
      },
      silent: true
    };
    
    await exec.exec('git', ['diff', '--name-only', baseRef, 'HEAD'], options);
    return output.trim().split('\n').filter(file => file.length > 0);
  } catch (error) {
    core.warning(`Error getting changed files: ${error.message}`);
    // Fallback: get all modified files in working directory
    try {
      let output = '';
      const options = {
        listeners: {
          stdout: (data) => {
            output += data.toString();
          }
        },
        silent: true
      };
      
      await exec.exec('git', ['diff', '--name-only', 'HEAD'], options);
      return output.trim().split('\n').filter(file => file.length > 0);
    } catch (fallbackError) {
      core.error(`Fallback failed: ${fallbackError.message}`);
      return [];
    }
  }
}

/**
 * Get all API definition files from .postman directory
 */
function getApiFiles(postmanDir) {
  const apiFiles = [];
  
  if (!fs.existsSync(postmanDir)) {
    core.info(`No ${postmanDir} directory found`);
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
      core.info(`Skipping ${filePath}: missing required sections`);
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
    core.error(`Error parsing ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Main function to find API changes
 */
async function findApiChanges(postmanDir, baseRef) {
  const changedFiles = await getChangedFiles(baseRef);
  const apiFiles = getApiFiles(postmanDir);
  const results = [];
  
  core.info(`Found ${changedFiles.length} changed files`);
  core.info(`Found ${apiFiles.length} API definition files`);
  
  if (changedFiles.length === 0) {
    core.info('No changed files found');
    return results;
  }
  
  for (const apiFile of apiFiles) {
    const apiData = parseApiFile(apiFile);
    
    if (!apiData) {
      continue;
    }
    
    core.info(`Processing API ${apiData.apiId} with ${apiData.filePaths.length} defined files`);
    
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
            core.info(`Match found: ${changedFile} for API ${apiData.apiId}`);
          }
        }
      }
    }
    
    // If this API has changed files, add it to results
    if (apiChangedFiles.length > 0) {
      // Get the root file (first one if multiple exist)
      const rootFile = apiData.rootFiles.length > 0 ? apiData.rootFiles[0] : null;
      
      results.push({
        apiId: apiData.apiId,
        rootFile: rootFile,
        changedFiles: apiChangedFiles
      });
    }
  }
  
  return results;
}

/**
 * Main execution
 */
async function run() {
  try {
    // Get inputs
    const postmanDir = core.getInput('postman-directory') || '.postman';
    const baseRef = core.getInput('base-ref') || 'HEAD~1';
    const outputFormat = core.getInput('output-format') || 'github';
    
    core.info(`Searching for API changes in ${postmanDir}`);
    core.info(`Comparing against ${baseRef}`);
    
    // Find API changes
    const results = await findApiChanges(postmanDir, baseRef);
    const jsonOutput = JSON.stringify(results, null, 2);
    
    // Set outputs
    core.setOutput('api-changes', jsonOutput);
    core.setOutput('has-changes', results.length > 0 ? 'true' : 'false');
    
    // Log results
    if (results.length > 0) {
      core.info(`Found ${results.length} API file changes:`);
      if (outputFormat === 'github') {
        core.startGroup('API Changes Found');
        for (const result of results) {
          core.info(`📄 ${result.filePath} (API: ${result.apiId}, Root: ${result.isRootFile})`);
        }
        core.endGroup();
      } else {
        core.info(jsonOutput);
      }
    } else {
      core.info('No API file changes found');
    }
    
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

// Run the action
run();
