# Jira

- Read/write Jira via the `jira` CLI, never the Atlassian MCP.
- Default project IA (the DEVX board is closed).
- When starting work the user asked for, assign the ticket to them and move it to In Progress.
- The jira-link skill ensures a ticket + PR exist and are linked from any starting state.
- Never curl the Jira API or pass env-var secrets; the `jira` CLI only.
- After creating a Jira ticket/PR, `open` each new URL in the browser.

## What a Jira ticket is FOR (why the mapping must be exact)

A Jira ticket is not bookkeeping. Two audiences consume it downstream and both read it through the commits attached to it:

- **QA** reads the ticket to know what to test. If the ticket says something other than what the commits did, QA tests the wrong thing or skips a real change.
- **The release meeting** reads the tickets attached to the commits in a release to know what is going out. A commit carrying a ticket key that does not describe that commit makes the release list lie.

Rules that follow from that:

- **One ticket per unit of work that a human would describe in one sentence.** Never reuse a ticket that already shipped, and never attach new work to a ticket whose description covers different work. If the work is not what the ticket says, make a new ticket.
- **The ticket key in every commit message and the PR title must be the ticket that describes THAT change.** When a PR is branched from earlier work, check what its commit messages say before pushing; retitling later means rewriting commit messages (`git filter-branch --msg-filter` on `origin/main..HEAD`, verify the tree is byte-identical, then `--force-with-lease`).
- **The ticket description states what changed and what to test**, in the terms QA would use, not internal refactor vocabulary. List any behaviour change explicitly, including error-path status codes.
- **Mark `no-qa` (the label) when there is genuinely nothing for QA to exercise**, and say why in the description: no user-facing behaviour change, no deployed consumer, changes covered by tests. Do not use it to skip the conversation.
- **Move the ticket to In Code Review when the PR goes up**, and assign it to whoever owns the work.
