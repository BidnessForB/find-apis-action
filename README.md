# Find and Lint APIs Action

A GitHub Action that finds files in the current commit which have changed since the previous commit and which are parts of APIs which have been integrated with GitHub in Postman. Optionally, it can also lint the detected APIs using the Postman CLI.

## Features

- Detects changed files between commits
- Matches changed files against files managed by Postman in the `.postman` directory
- Outputs JSON array with API ID, root file path, and for multi-file APIs an array of any additional files which have changed and are part of the API
- **NEW**: Optionally lints detected APIs using Postman CLI
- Can be used as a reusable action or standalone workflow

## Usage

### As a Reusable Action

#### Basic Usage (Detection Only)
```yaml
- name: Find API Changes
  uses: bidnessforb/lint-modified-apis@v1
  id: api-changes
  with:
    postman-directory: '.postman'  # Optional, defaults to '.postman'
    base-ref: 'HEAD~1'             # Optional, defaults to 'HEAD~1'
    output-format: 'json'          # Optional, defaults to 'json'

- name: Process results
  run: |
    echo "Has changes: ${{ steps.api-changes.outputs.has-changes }}"
    echo "Changes: ${{ steps.api-changes.outputs.api-changes }}"
```

#### Advanced Usage (Detection + Linting)
```yaml
- name: Find and Lint API Changes
  uses: bidnessforb/lint-modified-apis@v1
  id: api-changes
  with:
    postman-directory: '.postman'  # Optional, defaults to '.postman'
    base-ref: 'HEAD~1'             # Optional, defaults to 'HEAD~1'
    run-lint: 'true'               # Enable linting
  env:
    POSTMAN_API_KEY: ${{ secrets.POSTMAN_API_KEY }}  # Required when run-lint is true

- name: Process results
  run: |
    echo "Has changes: ${{ steps.api-changes.outputs.has-changes }}"
    echo "Changes: ${{ steps.api-changes.outputs.api-changes }}"
    echo "Lint results: ${{ steps.api-changes.outputs.lint-results }}"
```

### As a Workflow Step

```yaml
- name: Find API changes
  run: node .github/scripts/find-api-changes.js
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `postman-directory` | Directory containing Postman API files | No | `.postman` |
| `base-ref` | Base reference for comparison | No | `HEAD~1` |
| `output-format` | Output format (`json` or `github`) | No | `json` |
| `run-lint` | Whether to run API linting after detecting changes | No | `false` |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `POSTMAN_API_KEY` | Postman API key for authentication | Yes, when `run-lint` is `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `api-changes` | JSON array of changed API files |
| `has-changes` | Whether any API changes were found (`true`/`false`) |
| `lint-results` | Results of API linting (if run-lint is enabled) |

## Output Format

### API Changes
The action outputs a JSON array with the following structure:

```json
[
  {
    "apiId": "11ad5c34-13c2-43b7-a492-2bb349751285",
    "rootFile": "accounts.yaml",
    "changedFiles": ["accounts.yaml"],
    "integrationId": "179207"
  },
  {
    "apiId": "edd4253d-c264-4a49-b39b-d19fd52e49d4",
    "rootFile": "bar.yaml",
    "changedFiles": ["bar.yaml", "bar-schemas.yaml"],
    "integrationId": "179208"
  }
]
```

Where:
- `apiId`: The ID of the API from the config section of the relevant `api_` file in the `postman` directory.
- `rootFile`: The primary root file for the API (first one if multiple exist)
- `changedFiles`: Array of all files that changed and are part of this API
- `integrationId`: The integration ID looked up from `integration-ids.csv`, or `null` if not found

Note: There is one array element per modified API, not per changed file.

### Lint Results (when run-lint is enabled)
When linting is enabled, the action also outputs a lint results array:

```json
[
  {
    "apiId": "11ad5c34-13c2-43b7-a492-2bb349751285",
    "integrationId": "179207",
    "success": true,
    "output": "API linting completed successfully",
    "error": ""
  },
  {
    "apiId": "edd4253d-c264-4a49-b39b-d19fd52e49d4",
    "integrationId": "179208",
    "success": false,
    "output": "",
    "error": "API validation failed: schema errors found"
  }
]
```

Where:
- `apiId`: The API ID that was linted
- `integrationId`: The integration ID used for linting (if any)
- `success`: Whether the linting passed (`true`) or failed (`false`)
- `output`: Standard output from the Postman CLI lint command
- `error`: Error output or error message if linting failed

## API File Format

The action expects Postman API files in the `.postman` directory with the following INI structure:

```ini
[config]
id = 11ad5c34-13c2-43b7-a492-2bb349751285

[config.relations.apiDefinition]
files[] = {"path":"accounts.yaml","metaData":{}}

[config.relations.apiDefinition.metaData]
type = openapi:3
rootFiles[] = accounts.yaml
```

## Integration IDs CSV File

The action looks for an `integration-ids.csv` file in the root directory to map API IDs to integration IDs. The CSV format should be:

```csv
api-id, integration-id
11ad5c34-13c2-43b7-a492-2bb349751285,179207
edd4253d-c264-4a49-b39b-d19fd52e49d4,179208
```

- If the CSV file doesn't exist, `integrationId` will be `null` for all APIs
- If an API ID is not found in the CSV, `integrationId` will be `null` for that API
- The CSV file should have a header row with `api-id, integration-id`

## Development

### Prerequisites

- Node.js 18+
- Git repository with commit history

### Setup

```bash
npm install
```

### Testing Locally

```bash
# Test the standalone script
node .github/scripts/find-api-changes.js

# Test the action (requires GitHub Actions environment)
node action.js
```

## License

MIT
