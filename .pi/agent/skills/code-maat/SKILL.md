---
name: code-maat
description: Analyze git repositories using Code Maat to mine VCS data for hotspots, coupling, churn, ownership, and code age. Use when the user wants to understand code evolution, find change hotspots, detect logical coupling, measure code ownership, or analyze churn patterns in a git repo.
---

# Code Maat - Git Repository Analysis

Analyzes git repositories using the `code-maat` Docker image to surface insights about code evolution, hotspots, coupling, ownership, and churn.

## Prerequisites

- Docker with the `code-maat` image built (`docker build -t code-maat .` from `~/code/code-maat`)
- A git repository to analyze

## Workflow

### 1. Generate the git log

Generate a git log from the target repo. Use the `git2` format (faster, more tolerant).

Pick a sensible `--after` date. Default to 1 year ago unless the user specifies otherwise. For smaller repos with less history, go further back.

```bash
cd <REPO_PATH>
git log --all --numstat --date=short --pretty=format:'--%h--%ad--%aN' --no-renames --after=<YYYY-MM-DD> > /tmp/code-maat-log.log
```

To exclude noisy paths (vendor, node_modules, test fixtures, lock files, etc.), append pathspecs:

```bash
git log --all --numstat --date=short --pretty=format:'--%h--%ad--%aN' --no-renames --after=<YYYY-MM-DD> \
  -- . ":(exclude)node_modules" ":(exclude)vendor" ":(exclude)*.lock" ":(exclude)package-lock.json" \
  > /tmp/code-maat-log.log
```

### 2. Run analyses

Run Code Maat via Docker, mounting `/tmp` as `/data`:

```bash
docker run --rm -v /tmp:/data code-maat -l /data/code-maat-log.log -c git2 -a <ANALYSIS>
```

### 3. Available analyses

Run these in a logical order. Start with **summary** to understand scope, then pick analyses based on what the user wants to learn.

| Analysis | Flag | What it reveals |
|----------|------|-----------------|
| **summary** | `-a summary` | Overview: commit count, entity count, author count |
| **revisions** | `-a revisions` | Most frequently changed files (hotspots) |
| **authors** | `-a authors` | Number of authors per file (coordination cost) |
| **coupling** | `-a coupling` | Files that change together (hidden dependencies). Tune with `-n`, `-m`, `-i`, `-s` |
| **soc** | `-a soc` | Sum of coupling per entity |
| **age** | `-a age` | Code age in months (stability measure) |
| **abs-churn** | `-a abs-churn` | Lines added/deleted per date |
| **author-churn** | `-a author-churn` | Lines added/deleted per author |
| **entity-churn** | `-a entity-churn` | Lines added/deleted per file |
| **entity-ownership** | `-a entity-ownership` | Who wrote what (added/deleted per author per file) |
| **entity-effort** | `-a entity-effort` | Revision share per author per file |
| **main-dev** | `-a main-dev` | Primary developer per file (by added lines) |
| **main-dev-by-revs** | `-a main-dev-by-revs` | Primary developer per file (by commits) |
| **fragmentation** | `-a fragmentation` | How fragmented ownership is per file |
| **communication** | `-a communication` | Implied communication needs between authors |
| **refactoring-main-dev** | `-a refactoring-main-dev` | Who is refactoring what |
| **messages** | `-a messages` | Commit message analysis (use with `-e` regex) |
| **identity** | `-a identity` | Raw parsed VCS data (debug/export) |

### 4. Useful option flags

| Flag | Default | Purpose |
|------|---------|---------|
| `-n, --min-revs` | 5 | Min revisions to include a file |
| `-m, --min-shared-revs` | 5 | Min shared revisions for coupling |
| `-i, --min-coupling` | 30 | Min coupling percentage to show |
| `-s, --max-changeset-size` | 30 | Max files in a changeset for coupling |
| `-r, --rows` | all | Limit output rows |
| `-g, --group` | none | Group file mapping files to architectural components |
| `-d, --age-time-now` | today | Reference date for age analysis (YYYY-MM-dd) |
| `--verbose-results` | off | Extra detail in coupling output |

### 5. Architectural grouping

To analyze at the component/module level instead of individual files, create a group file with regex mappings:

```
src/features/core => Core
src/features/auth => Auth
^.*\.test\..+$   => Tests
```

Then pass it: `-g /data/groups.txt`

### 6. Presenting results

- Parse CSV output and present key findings in clear tables or ranked lists
- Highlight the top 10-15 items for each analysis
- Cross-reference hotspots (high revisions) with coupling and ownership data for deeper insights
- When the user asks for a "full analysis", run: summary → revisions → authors → coupling → entity-churn → age, then synthesize findings

### 7. Recommended default analysis flow

When the user just says "analyze this repo":

1. **summary** - get the lay of the land
2. **revisions** - find hotspots (most changed files)
3. **authors** - find coordination bottlenecks
4. **coupling** - find hidden dependencies (lower `-m` to 3 and `-i` to 20 for smaller repos)
5. **entity-churn** - find high-churn files
6. **age** - find code that won't stabilize

Synthesize: files that are both hotspots AND have many authors AND high churn are the highest-risk targets. Present a prioritized summary.
