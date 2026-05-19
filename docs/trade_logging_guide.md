---
name: Trade Logging Guide
description: Step-by-step reference for logging trades from broker screenshots into TradeMirror SQLite database
type: reference
originSessionId: ae3128ce-ea69-4bcf-852b-eccc3749dd53
---
# Trade Logging Guide

Use this whenever Geoff uploads a broker screenshot and asks to log trades.

---

## Database Location

```
C:/Users/Geoff/AppData/Roaming/com.geoff.trademirror/trademirror.db
```

Use Python's built-in `sqlite3` — no other tool available on this machine.

---

## Active Account

Always check `app_settings.selected_account_id` first — do not assume:

```python
cur.execute("SELECT selected_account_id FROM app_settings WHERE id=1")
account_id = cur.fetchone()[0]
```

Then verify the account name matches what's in the screenshot (e.g., "E8 DEMO" badge → E8 Funded 2).

---

## Time Zone Conversion

Screenshots from E8/OANDA show times in **EET** (which is EEST = UTC+3 in summer, EET = UTC+2 in winter).

TradeMirror stores times in **EST (UTC-5)**. No daylight saving adjustment — always UTC-5.

| Season | Broker TZ | Offset to EST |
|--------|-----------|---------------|
| Summer (Mar–Oct) | EEST = UTC+3 | **−8 hours** |
| Winter (Nov–Feb) | EET = UTC+2 | **−7 hours** |

Apply the offset to both entry and exit times. Watch for **date rollovers** (e.g., 07:30 EET summer → 23:30 previous day EST).

---

## P&L Value

Always use the **Net P&L** column (after fees), NOT the gross P&L column.

The `fees` column should store the fee as a **negative number** (e.g., -5.00).

```
pnl   = Net P&L from screenshot   ← what gets stored
fees  = Fee from screenshot (negative number)
```

---

## Field Mapping (screenshot → DB)

| Screenshot Column | DB Column | Notes |
|---|---|---|
| Instrument | `instrument` | Strip ".C" suffix → e.g., CADCHF |
| Side: BUY | `side = 'long'` | |
| Side: SELL | `side = 'short'` | |
| Amount | `size` | Lot size |
| Entry Price | `entry_price` | |
| SL Price | `stop_price` | NULL if "-" |
| TP Price | `target_price` | NULL if "-" |
| Exit Price | `exit_price` | |
| Entry Time (converted) | `opened_at` | `YYYY-MM-DDTHH:MM:SS` |
| Exit Time (converted) | `closed_at` | `YYYY-MM-DDTHH:MM:SS` |
| Fee | `fees` | Negative number e.g. -5.00 |
| Net P&L | `pnl` | Net value after fees |
| Position ID | `id` | Use as primary key |
| Order ID | `trade_ref` | Store here |

---

## Duplicate Check

Before inserting, always check if Position IDs already exist:

```python
placeholders = ','.join('?' for _ in ids)
cur.execute(f"SELECT id FROM trades WHERE id IN ({placeholders})", ids)
existing = [r[0] for r in cur.fetchall()]
```

Skip any that already exist.

---

## After Inserting — Required Follow-up Steps

These two steps are MANDATORY after every insert/update. Without them:
- Calendar won't show the trading day
- Trade Log panel won't show trades
- Account balance panels will be wrong

### 1. Recalculate daily_stats for each affected date

The calendar reads from `daily_stats`, not `trades` directly. Must upsert for every unique `closedAt` date:

```python
day = '2026-05-15'  # repeat for each unique closed date
stats_id = f'ds-{account_id}-{day}'

cur.execute("SELECT pnl FROM trades WHERE account_id=? AND closed_at >= ? AND closed_at <= ?",
    (account_id, day + 'T00:00:00', day + 'T23:59:59'))
rows = cur.fetchall()
pnls = [r[0] for r in rows if r[0] is not None]

trade_count = len(pnls)
wins = [p for p in pnls if p > 0]
losses = [p for p in pnls if p < 0]
win_count = len(wins)
loss_count = len(losses)
total_pnl = sum(pnls)
avg_win = sum(wins)/win_count if win_count else 0
avg_loss = abs(sum(losses)/loss_count) if loss_count else 0
win_rate = (win_count/trade_count*100) if trade_count else 0
profit_factor = (sum(wins)/abs(sum(losses))) if losses else (sum(wins) if wins else 0)

# Max drawdown
peak, max_dd, running = 0, 0, 0
for p in pnls:
    running += p
    if running > peak: peak = running
    dd = peak - running
    if dd > max_dd: max_dd = dd

cur.execute("DELETE FROM daily_stats WHERE id=?", (stats_id,))
cur.execute("""
    INSERT INTO daily_stats
      (id, account_id, day, total_pnl, trade_count, win_count, loss_count,
       avg_win, avg_loss, win_rate, profit_factor, max_drawdown)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
""", (stats_id, account_id, day, total_pnl, trade_count, win_count, loss_count,
      avg_win, avg_loss, win_rate, profit_factor, max_dd))
```

### 2. Update account currentBalance

```python
cur.execute("SELECT starting_balance FROM accounts WHERE id=?", (account_id,))
start_bal = cur.fetchone()[0]
cur.execute("SELECT COALESCE(SUM(pnl),0) FROM trades WHERE account_id=?", (account_id,))
total_all = cur.fetchone()[0]
cur.execute("UPDATE accounts SET current_balance=? WHERE id=?",
    (start_bal + total_all, account_id))
```

---

## Calendar & Trade Log — How They Work

- **Calendar** reads `daily_stats` table filtered by `account_id` and `day >= 365 days ago`
- **Clicking a day** runs `getTradesByDate()` which filters `trades.closed_at` between `YYYY-MM-DDT00:00:00` and `YYYY-MM-DDT23:59:59`
- **Balance panels** read `accounts.current_balance` directly

All three depend on the two follow-up steps above being done correctly.

---

## Schema Quick Reference

```
trades:       id, account_id, opened_at, closed_at, instrument, side,
              entry_price, stop_price, target_price, exit_price,
              size, fees, pnl, trade_ref

daily_stats:  id (ds-{accountId}-{YYYY-MM-DD}), account_id, day,
              total_pnl, trade_count, win_count, loss_count,
              avg_win, avg_loss, win_rate, profit_factor, max_drawdown

accounts:     id, starting_balance, current_balance, ...
app_settings: id=1, selected_account_id, ...
```
