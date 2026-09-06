---
name: payroll-planner
description: Run Canadian payroll calculations (cra-payroll) and wish farm spending plans (wish-farm-planner) together. Manages config files, runs payroll simulations with different income/RRSP scenarios, and plans discretionary spending toward wish list items. Use when the user asks about payroll, take-home pay, RRSP contributions, wish farm, savings goals, or wants to add/edit wishes and expenses.
---

# Payroll & Wish Farm Planner

Combines **cra-payroll** (CRA payroll deduction calculator) and **wish-farm-planner** (discretionary spending allocator) into one workflow.

## Config File Locations

### cra-payroll
- Default config: `~/.cra-payroll.json` (does not currently exist — CLI args or piped JSON used instead)
- Cache directory: `~/.config/cra-payroll/cache/`
- Source code: `~/code/cra-payroll/`

Example config (`~/.cra-payroll.json`):
```json
{
  "province": "Ontario",
  "annualSalary": 150000,
  "payPeriod": "Semi-monthly (24 pay periods a year)",
  "year": 2026,
  "rrspMatchPercent": 4,
  "rrspUnmatchedPercent": 0,
  "cppMaxedOut": false,
  "eiMaxedOut": false
}
```

### wish-farm-planner
- **Primary config: `~/.config/wish-farm.json`**
- Fallback paths (checked in order): `./wish-farm.json`, `~/.config/wish-farm.json`, `~/.wish-farm.json`
- Source code: `~/code/wish-farm-planner/`

Current config structure:
```json
{
  "monthlyExpenses": 3000,
  "wishes": [
    { "name": "Item Name", "cost": 2999, "priority": 1 },
    { "name": "Timed Item", "cost": 12000, "priority": 2, "months": 12 },
    { "name": "Dependent Item", "cost": 5000, "priority": 3, "after": ["Item Name"] }
  ],
  "craPayrollArgs": {
    "salary": 150000,
    "province": "Ontario",
    "rrspMatch": 4,
    "rrspUnmatched": 0
  }
}
```

#### Wish item fields
| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name / YNAB category |
| `cost` | Yes | Total dollar amount |
| `priority` | Yes | 1 = highest priority |
| `months` | No | Spread cost over N months (timed wish) |
| `deferrable` | No | Timed only: if false, always pays fixed amount |
| `after` | No | Array of wish names that must be funded first |

## Common Workflows

### 1. Quick payroll check (single paycheck)
```bash
cra-payroll -s 150000 -p Ontario --rrsp-match 4
```

### 2. Full year paycheck table (tracks CPP/EI maxing out)
```bash
cra-payroll -s 150000 -p Ontario --rrsp-match 4 -t
```

### 3. Annual totals
```bash
cra-payroll -s 150000 -p Ontario --rrsp-match 4 -a
```

### 4. Monthly averages
```bash
cra-payroll -s 150000 -p Ontario --rrsp-match 4 -m
```

### 5. Pipe payroll into wish farm (per-paycheck plan)
```bash
cra-payroll -s 150000 -p Ontario --rrsp-match 4 --json -t | wish-farm-planner paychecks
```

### 6. Wish farm with config file (uses craPayrollArgs from config)
```bash
wish-farm-planner paychecks
wish-farm-planner plan
```

### 7. Wish farm with a fixed discretionary amount (skip payroll)
```bash
wish-farm-planner paychecks --discretionary 3500
wish-farm-planner plan --discretionary 3500
```

### 8. Compare scenarios (e.g. different RRSP contributions)
```bash
# Low RRSP
cra-payroll -s 150000 -p Ontario --rrsp-match 4 --rrsp-unmatched 0 --json -t | wish-farm-planner paychecks

# High RRSP
cra-payroll -s 150000 -p Ontario --rrsp-match 4 --rrsp-unmatched 6 --json -t | wish-farm-planner paychecks
```

### 9. JSON output for programmatic use
```bash
cra-payroll -s 150000 -p Ontario --rrsp-match 4 --json -m
cra-payroll -s 150000 -p Ontario --rrsp-match 4 --json -t
wish-farm-planner paychecks --json
wish-farm-planner plan --json
```

## cra-payroll CLI Reference

| Flag | Description |
|------|-------------|
| `-s, --salary <amount>` | Annual salary |
| `-p, --province <name>` | Province of employment |
| `-y, --year <year>` | Tax year (default: current year) |
| `--pay-period <type>` | Pay period string (default: "Semi-monthly (24 pay periods a year)") |
| `--rrsp-match <pct>` | RRSP match % (employee + employer both contribute this %, default: 4) |
| `--rrsp-unmatched <pct>` | Additional unmatched employee RRSP % (default: 0) |
| `--cpp-maxed` | CPP contributions already maxed for the year |
| `--ei-maxed` | EI premiums already maxed for the year |
| `-t, --table` | Per-paycheck table for full year |
| `-M, --month-table` | Monthly table for the year |
| `-a, --annual` | Annualized totals |
| `-m, --monthly` | Monthly averages |
| `--json` | JSON output |
| `--no-cache` | Skip cache, force fresh CRA lookup |

## wish-farm-planner CLI Reference

| Command | Description |
|---------|-------------|
| `paychecks` | Per-paycheck allocation table |
| `plan` | Monthly summary of allocations |

| Flag | Description |
|------|-------------|
| `-c, --config <path>` | Path to config file |
| `-d, --discretionary <amount>` | Fixed discretionary per pay period (skips cra-payroll) |
| `-p, --periods <n>` | Pay periods per year (default: 24) |
| `-s, --strategy sequential\|proportional` | Allocation strategy (plan command only) |
| `--json` | JSON output |

## Editing Configs

When the user asks to add/remove/edit wishes or change payroll settings:

1. Read the current config: `~/.config/wish-farm.json`
2. Parse the JSON, make the requested changes
3. Write back with proper formatting (2-space indent)
4. Re-run the appropriate command to show updated results

When changing payroll parameters (salary, province, RRSP), update the `craPayrollArgs` section in `~/.config/wish-farm.json` so both tools stay in sync.

For standalone cra-payroll config, edit or create `~/.cra-payroll.json`.
