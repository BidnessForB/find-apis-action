# Output Format Examples

## Example 1: Single API with Multiple Changed Files

When both `accounts.yaml` and `accounts-schemas.yaml` are modified:

```json
[
  {
    "apiId": "11ad5c34-13c2-43b7-a492-2bb349751285",
    "rootFile": "accounts.yaml",
    "changedFiles": [
      "accounts-schemas.yaml",
      "accounts.yaml"
    ]
  }
]
```

## Example 2: Multiple APIs with Changed Files

When files from different APIs are modified:

```json
[
  {
    "apiId": "11ad5c34-13c2-43b7-a492-2bb349751285",
    "rootFile": "accounts.yaml",
    "changedFiles": [
      "accounts.yaml"
    ]
  },
  {
    "apiId": "edd4253d-c264-4a49-b39b-d19fd52e49d4",
    "rootFile": "bar.yaml",
    "changedFiles": [
      "bar.yaml"
    ]
  }
]
```

## Key Changes Made

1. ✅ **One array element per modified API** - No longer one element per changed file
2. ✅ **Removed `isRootFile` property** - No longer needed
3. ✅ **Added `rootFile` property** - Shows the primary root file for each API
4. ✅ **Added `changedFiles` property** - Array of all files changed for each API

This format is much more useful for processing API changes as it groups all changes by API rather than having separate entries for each file.
