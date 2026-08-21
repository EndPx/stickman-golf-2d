# Asset requests

Running list of every visual asset file and colour palette value the project would benefit from.
Required by R16.5 and R16.6: this file exists from the first implementation increment, accumulates
every request raised during the project, and **retains fulfilled entries with their status changed to
`SUPPLIED` rather than removing them**.

Nothing here blocks a task. R16.4 requires every task to complete and be verified against a
procedural placeholder, so an entry below is a request for a later batch, never a dependency.

## Convention

One entry per Asset_Key, appended before the task that raised it is recorded complete. Each entry
states:

| Field | Meaning |
|---|---|
| **Asset_Key** | The identifier the supplied item binds to. Spelling is frozen for the life of the project (R16.1). |
| **Subject or role** | What it depicts, for an asset file; or what it styles, for a colour palette value. |
| **Location of use** | Where it is drawn. |
| **Dimensions and format** | Pixel dimensions and file format. Stated as `n/a - colour palette value` for a palette entry, which has neither (R16.5 names both only for asset file requests). |
| **Status** | Exactly one of `REQUESTED`, `SUPPLIED`. No third value. |

The drawn size in world units and the anchor point are declared in the Asset_Registry, not here, and
they apply identically to the placeholder and to any file later bound to the same Asset_Key, so
adopting a supplied file changes neither drawn size nor drawn position (R16.9).

### Entry template

```
### <Asset_Key>

- **Subject or role:** <what it depicts, or what it styles>
- **Location of use:** <where it is drawn>
- **Dimensions and format:** <NNNxNNN PNG> | n/a - colour palette value
- **Status:** REQUESTED
```

## Entries

Task 8 appends the visual constants entries here. None raised yet.
