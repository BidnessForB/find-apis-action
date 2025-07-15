# Find APIs Action

A GitHub Action that finds files in the current commit which have changed since the previous commit and whose paths match any of the paths listed in the files property of the `[config.relations.apiDefinition]` section of API files in the `.postman` directory.

## Features

- Detects changed files between commits
- Parses Postman API definition files in INI format
- Matches changed files against API-defined file paths
- Outputs JSON array with API ID, file path, and root file status
- Can be used as a reusable action or standalone workflow

## Usage

### As a Reusable Action

```yaml
- name: Find API Changes
  uses: ./
  id: api-changes
  with:
    postman-directory: '.postman'  # Optional, defaults to '.postman'
    base-ref: 'HEAD~1'             # Optional, defaults to 'HEAD~1'
    output-format: 'json'          # Optional, defaults to 'github'

- name: Process results
  run: |
    echo "Has changes: ${{ steps.api-changes.outputs.has-changes }}"
    echo "Changes: ${{ steps.api-changes.outputs.api-changes }}"
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
| `output-format` | Output format (`json` or `github`) | No | `github` |

## Outputs

| Output | Description |
|--------|-------------|
| `api-changes` | JSON array of changed API files |
| `has-changes` | Whether any API changes were found (`true`/`false`) |

## Output Format

The action outputs a JSON array with the following structure:

```json
[
  {
    "apiId": "11ad5c34-13c2-43b7-a492-2bb349751285",
    "rootFile": "accounts.yaml",
    "changedFiles": ["accounts.yaml"]
  },
  {
    "apiId": "edd4253d-c264-4a49-b39b-d19fd52e49d4",
    "rootFile": "bar.yaml",
    "changedFiles": ["bar.yaml", "bar-schemas.yaml"]
  }
]
```

Where:
- `apiId`: The ID of the API from the config section
- `rootFile`: The primary root file for the API (first one if multiple exist)
- `changedFiles`: Array of all files that changed and are part of this API

Note: There is one array element per modified API, not per changed file.

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
