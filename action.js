const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs');
const path = require('path');

// Import the INI parser from the bin directory
const iniParser = require('./src/iniFileParser');

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
 * Load integration ID mappings from CSV file
 */
function loadIntegrationMappings() {
  const csvPath = 'integration-ids.csv';
  const mappings = new Map();
  
  try {
    if (!fs.existsSync(csvPath)) {
      core.info('integration-ids.csv file not found');
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
    
    core.info(`Loaded ${mappings.size} integration ID mappings from CSV`);
  } catch (error) {
    core.error('Error loading integration-ids.csv: ' + error.message);
  }
  
  return mappings;
}
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
 * Install Postman CLI
 */
async function installPostmanCli() {
  try {
    core.info('Installing Postman CLI...');
    
    // Check if postman CLI is already installed
    try {
      await exec.exec('postman', ['--version'], { silent: true });
      core.info('Postman CLI is already installed');
      return;
    } catch {
      // CLI not installed, proceed with installation
    }
    
    // Download and install Postman CLI
    await exec.exec('sh', ['-c', 'curl -o- "https://dl-cli.pstmn.io/install/linux64.sh" | sh']);
    
    // Add Postman CLI to PATH
    const postmanBinPath = `${process.env.HOME}/.postman/bin`;
    core.addPath(postmanBinPath);
    
    // Verify installation
    await exec.exec('postman', ['--version']);
    core.info('Postman CLI installed successfully');
  } catch (error) {
    throw new Error(`Failed to install Postman CLI: ${error.message}`);
  }
}

/**
 * Login to Postman using API key
 */
async function loginToPostman(apiKey) {
  try {
    core.info('Logging in to Postman...');
    await exec.exec('postman', ['login', '--with-api-key', apiKey], { silent: true });
    core.info('Successfully logged in to Postman');
  } catch (error) {
    throw new Error(`Failed to login to Postman: ${error.message}`);
  }
}

/**
 * Lint a single API
 */
async function lintApi(apiId, schemaFilePath, integrationId = null) {
  try {
    let output = '';
    let errorOutput = '';
    
    const options = {
      listeners: {
        stdout: (data) => {
          output += data.toString();
        },
        stderr: (data) => {
          errorOutput += data.toString();
        }
      }
    };
    
    const args = ['api', 'lint', apiId];
    if (integrationId && integrationId !== 'null') {
      args.push('--integration-id', integrationId);
    }
    
    core.info(`Linting API: ${apiId}${integrationId ? ` with integration ID: ${integrationId}` : ''}`);
    
    const exitCode = await exec.exec('postman', args, options);
    
    return {
      apiId,
      schemaFilePath,
      integrationId,
      success: exitCode === 0,
      output: output.trim(),
      error: errorOutput.trim()
    };
  } catch (error) {
    return {
      apiId,
      schemaFilePath,
      integrationId,
      success: false,
      output: '',
      error: error.message
    };
  }
}

/**
 * Run linting on all detected API changes
 */
async function runApiLinting(apiChanges, postmanApiKey) {
  if (!apiChanges || apiChanges.length === 0) {
    core.info('No API changes to lint');
    return [];
  }
  
  core.info(`Starting linting for ${apiChanges.length} APIs...`);
  
  // Install Postman CLI and login
  await installPostmanCli();
  await loginToPostman(postmanApiKey);
  
  const lintResults = [];
  
  for (const apiChange of apiChanges) {
    const result = await lintApi(apiChange.apiId, apiChange.schemaFilePath, apiChange.integrationId);
    lintResults.push(result);
    
    if (result.success) {
      core.info(`✅ ${result.schemaFilePath} (${result.apiId}) linting passed`);
    } else {
      core.error(`❌ ${result.schemaFilePath} (${result.apiId}) linting failed: ${result.error}`);
    }
  }
  
  const successCount = lintResults.filter(r => r.success).length;
  const failCount = lintResults.length - successCount;
  
  core.info(`Linting completed: ${successCount} passed, ${failCount} failed`);
  
  return lintResults;
}

/**
 * Main function to find API changes
 */
async function findApiChanges(postmanDir, baseRef) {
  const changedFiles = await getChangedFiles(baseRef);
  const apiFiles = getApiFiles(postmanDir);
  const integrationMappings = loadIntegrationMappings();
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
      
      // Look up integration ID
      const integrationId = integrationMappings.get(apiData.apiId) || null;
      
      results.push({
        apiId: apiData.apiId,
        schemaFilePath: rootFile,
        rootFile: rootFile,
        changedFiles: apiChangedFiles,
        integrationId: integrationId
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
    const outputFormat = 'json';
    //const runLint = core.getInput('run-lint') === 'true';
    const runLint = core.getBooleanInput('run-lint') === true;
    core.info(`run-lint: ${core.getBooleanInput('run-lint')}`);
    core.info(`runLint: ${runLint}`);
    
    
    const postmanApiKey = process.env.POSTMAN_API_KEY;
    
    core.info(`run-lint: ${core.getInput('run-lint')}`);  
    core.info(`runLint: ${runLint}`);
    core.info(`Searching for API changes in ${postmanDir}`);
    core.info(`Comparing against ${baseRef}`);
    
    // Find API changes
    const results = await findApiChanges(postmanDir, baseRef);
    const jsonOutput = JSON.stringify(results, null, 2);
    
    // Set outputs
    core.setOutput('api-changes', jsonOutput);
    core.setOutput('has-changes', results.length > 0 ? 'true' : 'false');
    
    // Run linting if enabled and changes were found
    let lintResults = [];
    if (runLint && results.length > 0) {
      if (!postmanApiKey) {
        core.setFailed('POSTMAN_API_KEY environment variable is required when run-lint is enabled');
        return;
      }
      
      core.info('Running API linting...');
      lintResults = await runApiLinting(results, postmanApiKey);
      
      // Check if any linting failed
      const failedLints = lintResults.filter(r => !r.success);
      if (failedLints.length > 0) {
        core.warning(`${failedLints.length} API(s) failed linting`);
        // Fail the action if any linting failed
        core.setFailed(`API linting failed for ${failedLints.length} API(s)`);
      }
    } else if (runLint && results.length === 0) {
      core.info('Linting skipped: no API changes detected');
    }
    
    // Set lint results output
    core.setOutput('lint-results', JSON.stringify(lintResults, null, 2));
    
    // Log results
    if (results.length > 0) {
      core.info(`Found ${results.length} API file changes:`);
      if (outputFormat === 'github') {
        core.startGroup('API Changes Found');
        for (const result of results) {
          core.info(`📄 API: ${result.apiId}, Root: ${result.rootFile}, Files: ${result.changedFiles.join(', ')}`);
        }
        core.endGroup();
        
        if (lintResults.length > 0) {
          core.startGroup('Linting Results');
          for (const lintResult of lintResults) {
            const status = lintResult.success ? '✅' : '❌';
            core.info(`${status} ${lintResult.apiId}: ${lintResult.success ? 'Passed' : lintResult.error}`);
          }
          core.endGroup();
        }
      } else {
        core.info(jsonOutput);
        if (lintResults.length > 0) {
          core.info('Lint results:');
          core.info(JSON.stringify(lintResults, null, 2));
        }
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
