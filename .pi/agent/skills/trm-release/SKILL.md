---
name: trm-release
description: Interactive release workflow for Topstep. Guides through cutting, retagging, and promoting releases using trm-rls. Shows what's changed, release notes, and status at every step. Use when the user wants to do a release, cut a release, retag staging, or promote to prod.
---

# Topstep Release Workflow

Interactive release manager. Replaces the GitHub web UI entirely.

## Prerequisites

- `trm-rls` CLI at `~/.local/bin/trm-rls`
- `gh` CLI authenticated
- Must be in the Topstep monorepo working directory

## Workflow

When the user invokes this skill, walk them through the release process step by step.

### Step 1: Status Check

Start by showing the current state:

```bash
trm-rls status
```

Show the user:
- What the latest prod release is
- Whether there's an active release branch
- Whether staging/prod tags exist for it

### Step 2: Determine Intent

Ask the user what they want to do:

1. **Cut a new release** — create branch + staging tag from main
2. **Retag staging** — they've cherry-picked/reverted on the release branch and need fresh staging
3. **Promote to prod** — staging looks good, tag it for production

### Step 3: Show What's Changed

Before any action, show the user what's in the release. This is the most important part — replaces the GitHub UI changelog view.

**For cutting a new release:**
```bash
# Show commits that will be in this release (since last prod tag)
git log --oneline --no-merges <latest_prod_tag>..origin/main
```

```bash
# Show merged PRs (more useful for Slack comms)
git log --oneline --merges <latest_prod_tag>..origin/main | head -30
```

**For retagging:**
```bash
# Show what changed on the release branch since the staging tag
git log --oneline <staging_tag>..origin/<release_branch>
```

**For promoting:**
```bash
# Show what's in staging (confirm it matches expectations)
gh release view <staging_tag> --json body --jq '.body'
```

```bash
# Show if the branch has diverged from the staging tag
git log --oneline <staging_tag>..origin/<release_branch>
```

Present this clearly to the user. Ask them to confirm before proceeding.

### Step 4: Execute

Run the appropriate `trm-rls` command. Since `trm-rls` has its own confirmation prompts, pipe `y` to auto-confirm (the user already confirmed with you).

If the user asked for a dry run, or wants to test, append `--dry-run` to every command. This prints what would happen without making changes.

**Cut:**
```bash
echo "y" | trm-rls cut [--dry-run]
```

**Retag:**
```bash
echo "y" | trm-rls retag [--dry-run]
```

**Promote:**
```bash
echo "y" | trm-rls promote [--dry-run]
```

### Step 5: Show Release Notes

After the action completes, fetch and display the release notes so the user can copy them for Slack:

```bash
# Get the tag that was just created
gh release view <tag> --json body --jq '.body'
```

Format the output cleanly. This is what they'll paste into Slack.

### Step 6: Next Steps

After each action, remind the user what comes next:

- **After cut:** "Staging is live. Monitor it. When ready, come back and run `/skill:trm-release` to promote. If you need to revert/cherry-pick, push to the release branch and retag."
- **After retag:** "Staging has been retagged. The release notes now reflect the changes. Deploy and monitor."
- **After promote:** "Production release is out. You're done. 🎉"

## Important Notes

- **Never run git commands without asking first** (per agent rules). But `trm-rls` handles git internally, so running `trm-rls cut/retag/promote` is fine — it's a release tool, not a raw git command.
- Always show the changelog/diff BEFORE executing. The user needs to see what they're releasing.
- If anything looks wrong (wrong commits, missing PRs), stop and discuss before proceeding.
- The auto-generated release notes from GitHub are the primary communication artifact — make sure they display correctly.
