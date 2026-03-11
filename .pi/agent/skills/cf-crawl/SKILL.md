---
name: cf-crawl
description: Crawl websites using Cloudflare Browser Rendering /crawl API. Starts an async crawl job, polls for completion, and returns pages as markdown, HTML, or JSON. Use when the user wants to crawl a site, scrape documentation, build a knowledge base, or extract content from multiple pages.
---

# Cloudflare Browser Rendering — /crawl

Crawl entire websites with a single API call. Submits a URL, polls for results, returns content as HTML, Markdown, or JSON.

## Prerequisites

Environment variables (must be set before use):

- `CF_ACCOUNT_ID` — Cloudflare account ID
- `CF_API_TOKEN` — Cloudflare API token with Browser Rendering permissions

## Usage

```bash
cf-crawl <url> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--format <html\|markdown\|json>` | Output format | `markdown` |
| `--limit <n>` | Max pages to crawl (max 100000) | `10` |
| `--depth <n>` | Max link depth from start URL | `100000` |
| `--render` / `--no-render` | Use headless browser (JS execution) | `true` |
| `--include <pattern>` | Only visit URLs matching pattern (repeatable) | — |
| `--exclude <pattern>` | Skip URLs matching pattern (repeatable) | — |
| `--external` | Follow links to external domains | `false` |
| `--subdomains` | Follow links to subdomains | `false` |
| `--source <all\|sitemaps\|links>` | URL discovery source | `all` |
| `--max-age <seconds>` | Cache TTL (max 604800) | `86400` |
| `--poll <seconds>` | Poll interval | `5` |
| `--timeout <seconds>` | Max wait time | `300` |
| `--output <file>` | Write results to file instead of stdout | — |
| `--raw` | Output raw JSON response (no formatting) | `false` |

### Pattern syntax

- `*` matches any characters except `/`
- `**` matches any characters including `/`

### Examples

```bash
# Crawl docs site as markdown
cf-crawl https://docs.example.com --limit 50 --depth 3

# Crawl only API docs, skip changelog
cf-crawl https://example.com/docs \
  --include "https://example.com/docs/api/**" \
  --exclude "*/changelog/*" \
  --format markdown --limit 100

# Fast static fetch (no JS rendering)
cf-crawl https://blog.example.com --no-render --limit 20

# Save full output to file
cf-crawl https://example.com --limit 200 --output crawl-results.json --raw
```

## API Reference

### Start crawl (POST)

```
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/browser-rendering/crawl
```

Body: `{ "url": "...", "limit": 50, "depth": 2, "formats": ["markdown"], ... }`

Returns: `{ "success": true, "result": "<job_id>" }`

### Get results (GET)

```
GET https://api.cloudflare.com/client/v4/accounts/{account_id}/browser-rendering/crawl/{job_id}
```

Query params: `limit`, `cursor`, `status` (queued/completed/disallowed/skipped/errored/cancelled)

### Cancel (DELETE)

```
DELETE https://api.cloudflare.com/client/v4/accounts/{account_id}/browser-rendering/crawl/{job_id}
```

### Job statuses

- `running` — in progress
- `completed` — finished successfully
- `cancelled_by_user` — manually cancelled
- `cancelled_due_to_timeout` — exceeded 7-day max
- `cancelled_due_to_limits` — hit account limits
- `errored` — encountered an error

### Response shape

```json
{
  "result": {
    "id": "job-id",
    "status": "completed",
    "browserSecondsUsed": 134.7,
    "total": 50,
    "finished": 50,
    "records": [
      {
        "url": "https://example.com/page",
        "status": "completed",
        "markdown": "# Page Title\nContent...",
        "metadata": { "status": 200, "title": "Page Title", "url": "..." }
      }
    ],
    "cursor": null
  }
}
```

Results paginate at 10 MB — use `cursor` query param to get next page.
