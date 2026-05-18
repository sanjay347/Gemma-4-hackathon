import { Transaction } from '../../types';
import { isAIAvailable } from '../client';

const EXPO_GO_MSG =
  "The AI chat requires a native build — it can't run in Expo Go.\n\nRun `npx expo run:ios --device` to enable it. Everything else (PDF upload, dashboard, budgets) works fine right now.";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt    = (n: number) => `$${n.toFixed(2)}`;
const pct    = (a: number, b: number) => b === 0 ? '0%' : `${Math.round((a / b) * 100)}%`;
const debits  = (txs: Transaction[]) => txs.filter(t => t.type === 'debit');
const credits = (txs: Transaction[]) => txs.filter(t => t.type === 'credit');
const sum    = (txs: Transaction[]) => txs.reduce((s, t) => s + t.amount, 0);
const avg    = (txs: Transaction[]) => txs.length ? sum(txs) / txs.length : 0;
const monthOf = (d: string) => d.slice(0, 7);
const dayOf  = (d: string) => parseInt(d.slice(8, 10), 10);
const has    = (q: string, ...words: string[]) => words.some(w => q.includes(w));

const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function dowOf(dateStr: string): number {
  // Parse YYYY-MM-DD safely without timezone shift
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function groupBy(txs: Transaction[], key: (t: Transaction) => string) {
  return txs.reduce((acc, t) => {
    const k = key(t);
    (acc[k] = acc[k] || []).push(t);
    return acc;
  }, {} as Record<string, Transaction[]>);
}

function topN(map: Record<string, Transaction[]>, n = 5) {
  return Object.entries(map).sort((a, b) => sum(b[1]) - sum(a[1])).slice(0, n);
}

function prevMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 7);
}

function currentMonth() { return new Date().toISOString().slice(0, 7); }

function monthLabel(m: string) {
  return new Date(m + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function monthsAvailable(txs: Transaction[]): string[] {
  return [...new Set(txs.map(t => monthOf(t.date)))].sort().reverse();
}

function currentYear() { return new Date().getFullYear().toString(); }

// ─── Response builders ────────────────────────────────────────────────────────

function recentTransactions(txs: Transaction[], count: number): string {
  const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, count);
  if (!recent.length) return "No transactions found yet.";
  const lines = recent.map(t =>
    `• ${t.date}  ${t.type === 'debit' ? '-' : '+'}${fmt(t.amount)}  ${t.merchant}  (${t.category})`
  );
  return `Your last ${recent.length} transaction${recent.length !== 1 ? 's' : ''}:\n\n${lines.join('\n')}`;
}

function spendingInCategory(txs: Transaction[], cat: string, month: string | null): string {
  let filtered = debits(txs).filter(t =>
    t.category.toLowerCase().includes(cat) || t.merchant.toLowerCase().includes(cat)
  );
  if (month) filtered = filtered.filter(t => monthOf(t.date) === month);
  if (!filtered.length)
    return month
      ? `No ${cat} spending found in ${monthLabel(month)}.`
      : `No transactions matching "${cat}" found.`;
  const total = sum(filtered);
  const top = topN(groupBy(filtered, t => t.merchant), 4).map(([m, ts]) => `• ${m}: ${fmt(sum(ts))}`);
  const prefix = month ? `In ${monthLabel(month)}` : 'Overall';
  return `${prefix} you spent ${fmt(total)} on ${cat} across ${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}:\n\n${top.join('\n')}`;
}

function monthSummary(txs: Transaction[], month: string): string {
  const mt = txs.filter(t => monthOf(t.date) === month);
  if (!mt.length) return `No data for ${monthLabel(month)} yet.`;
  const inc = sum(credits(mt)), spent = sum(debits(mt)), net = inc - spent;
  const top3 = topN(groupBy(debits(mt), t => t.category), 3)
    .map(([c, ts]) => `• ${c}: ${fmt(sum(ts))} (${pct(sum(ts), spent)})`).join('\n');
  const savingsRate = inc > 0 ? Math.round(((inc - spent) / inc) * 100) : 0;
  return `${monthLabel(month)}:\n\n• Income: ${fmt(inc)}\n• Spent: ${fmt(spent)}\n• Net: ${net >= 0 ? '+' : ''}${fmt(net)}\n• Savings rate: ${savingsRate}%\n\nTop categories:\n${top3 || 'N/A'}\n\n${net < 0 ? '⚠️ You spent more than you earned.' : '✅ You stayed within your income.'}`;
}

function subscriptions(txs: Transaction[]): string {
  const subs = debits(txs).filter(t => t.is_subscription || t.is_recurring);
  if (!subs.length) return "No subscriptions or recurring charges found.";
  const byM = groupBy(subs, t => t.merchant);
  const sorted = Object.entries(byM).map(([m, ts]) => ({
    merchant: m,
    monthly: sum(ts) / Math.max(new Set(ts.map(t => monthOf(t.date))).size, 1),
  })).sort((a, b) => b.monthly - a.monthly);
  const total = sorted.reduce((s, r) => s + r.monthly, 0);
  const lines = sorted.map(r => `• ${r.merchant} — ~${fmt(r.monthly)}/mo`);
  return `${sorted.length} recurring charge${sorted.length !== 1 ? 's' : ''} (~${fmt(total)}/month):\n\n${lines.join('\n')}\n\n💡 That's ~${fmt(total * 12)}/year. Cancel anything you haven't used this month.`;
}

function brokeAnalysis(txs: Transaction[]): string {
  const exp = debits(txs);
  if (!exp.length) return "Upload more statements to analyse spending patterns.";
  const byMonth = groupBy(exp, t => monthOf(t.date));
  let earlyTotal = 0, lateTotal = 0, count = 0;
  for (const ts of Object.values(byMonth)) {
    earlyTotal += sum(ts.filter(t => dayOf(t.date) <= 15));
    lateTotal  += sum(ts.filter(t => dayOf(t.date) > 15));
    count++;
  }
  const avgE = earlyTotal / count, avgL = lateTotal / count;
  const heavier = avgE > avgL ? 'first half' : 'second half';
  const pct1H = Math.round((avgE / (avgE + avgL)) * 100);
  return `Your monthly spending pattern:\n\n• First half (1st–15th): ${fmt(avgE)} (${pct1H}%)\n• Second half (16th–end): ${fmt(avgL)} (${100 - pct1H}%)\n\nYou spend heavier in the ${heavier} of the month.\n\n💡 Set a weekly cap of ${fmt((avgE + avgL) / 4)} instead of a monthly one — it's much easier to stick to.`;
}

function overview(txs: Transaction[]): string {
  const inc = sum(credits(txs)), spent = sum(debits(txs)), net = inc - spent;
  const months = new Set(txs.map(t => monthOf(t.date))).size;
  const top3 = topN(groupBy(debits(txs), t => t.category), 3)
    .map(([c, ts]) => `• ${c}: ${fmt(sum(ts))}`);
  const subCount = debits(txs).filter(t => t.is_subscription).length;
  const savingsRate = inc > 0 ? Math.round(((inc - spent) / inc) * 100) : 0;
  return `Financial overview (${months} month${months !== 1 ? 's' : ''}):\n\n• Total income: ${fmt(inc)}\n• Total spent: ${fmt(spent)}\n• Net: ${net >= 0 ? '+' : ''}${fmt(net)}\n• Savings rate: ${savingsRate}%\n\nTop categories:\n${top3.join('\n')}\n\nSubscriptions: ${subCount}\n\nAsk me about a specific category, month, or merchant for more detail.`;
}

function incomeBreakdown(txs: Transaction[]): string {
  const cr = credits(txs);
  if (!cr.length) return "No income found in your transactions.";
  const total = sum(cr);
  const byM = groupBy(cr, t => monthOf(t.date));
  const months = Object.keys(byM).sort().reverse().slice(0, 4);
  const lines = months.map(m => `• ${monthLabel(m)}: ${fmt(sum(byM[m]))}`);
  const avgMonthly = total / Object.keys(byM).length;
  return `Your income:\n\n${lines.join('\n')}\n\n• Total: ${fmt(total)}\n• Monthly average: ${fmt(avgMonthly)}`;
}

function topSpendingCategories(txs: Transaction[], month: string | null): string {
  let pool = debits(txs);
  if (month) pool = pool.filter(t => monthOf(t.date) === month);
  if (!pool.length) return month ? `No spending in ${monthLabel(month)}.` : "No spending data found.";
  const total = sum(pool);
  const top5 = topN(groupBy(pool, t => t.category), 5);
  const lines = top5.map(([c, ts], i) =>
    `${i + 1}. ${c} — ${fmt(sum(ts))} (${pct(sum(ts), total)})`
  );
  const prefix = month ? `In ${monthLabel(month)}, your` : 'Your';
  return `${prefix} top spending categories:\n\n${lines.join('\n')}\n\nTotal: ${fmt(total)}`;
}

function topMerchants(txs: Transaction[], month: string | null): string {
  let pool = debits(txs);
  if (month) pool = pool.filter(t => monthOf(t.date) === month);
  if (!pool.length) return month ? `No spending in ${monthLabel(month)}.` : "No spending data.";
  const top5 = topN(groupBy(pool, t => t.merchant), 5);
  const total = sum(pool);
  const lines = top5.map(([m, ts], i) =>
    `${i + 1}. ${m} — ${fmt(sum(ts))} (${ts.length}×, ${pct(sum(ts), total)})`
  );
  const prefix = month ? `In ${monthLabel(month)}, your` : 'Your';
  return `${prefix} top merchants:\n\n${lines.join('\n')}`;
}

function largestTransactions(txs: Transaction[], count: number, month: string | null): string {
  let pool = debits(txs);
  if (month) pool = pool.filter(t => monthOf(t.date) === month);
  const sorted = [...pool].sort((a, b) => b.amount - a.amount).slice(0, count);
  if (!sorted.length) return month ? `No spending in ${monthLabel(month)}.` : "No spending data.";
  const lines = sorted.map((t, i) =>
    `${i + 1}. ${fmt(t.amount)}  ${t.merchant}  ${t.date}  (${t.category})`
  );
  const prefix = month ? `In ${monthLabel(month)}, your` : 'Your';
  return `${prefix} ${count} largest purchase${count !== 1 ? 's' : ''}:\n\n${lines.join('\n')}`;
}

function savingsAnalysis(txs: Transaction[]): string {
  const inc = sum(credits(txs)), spent = sum(debits(txs)), net = inc - spent;
  if (inc === 0) return "No income data found. Upload a bank statement that includes your income deposits.";
  const savingsRate = Math.round((net / inc) * 100);
  const months = monthsAvailable(txs).slice(0, 3);
  const monthLines = months.map(m => {
    const mInc  = sum(credits(txs).filter(t => monthOf(t.date) === m));
    const mSpent = sum(debits(txs).filter(t => monthOf(t.date) === m));
    const mNet  = mInc - mSpent;
    const mRate = mInc > 0 ? Math.round((mNet / mInc) * 100) : 0;
    return `• ${monthLabel(m)}: ${mRate >= 0 ? '+' : ''}${fmt(mNet)} (${mRate}% saved)`;
  });
  const verdict = savingsRate >= 20 ? '🟢 Excellent — above the 20% benchmark.'
    : savingsRate >= 10 ? '🟡 Decent — aim for 20% to build a solid emergency fund.'
    : savingsRate >= 0  ? '🟠 Low — try cutting your top spending category.'
    : '🔴 Spending exceeds income — review subscriptions and discretionary spend.';
  return `Savings analysis:\n\n${monthLines.join('\n')}\n\nOverall savings rate: ${savingsRate}%\n\n${verdict}`;
}

function merchantSearch(txs: Transaction[], merchantQuery: string, month: string | null): string {
  const mq = merchantQuery.toLowerCase();
  let pool = debits(txs).filter(t => t.merchant.toLowerCase().includes(mq));
  if (month) pool = pool.filter(t => monthOf(t.date) === month);
  if (!pool.length) return `No transactions found for "${merchantQuery}"${month ? ` in ${monthLabel(month)}` : ''}.`;
  const total = sum(pool);
  const byM = groupBy(pool, t => monthOf(t.date));
  const monthLines = Object.keys(byM).sort().reverse().slice(0, 3)
    .map(m => `• ${monthLabel(m)}: ${fmt(sum(byM[m]))} (${byM[m].length}×)`);
  const recent = [...pool].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const recentLines = recent.map(t => `• ${t.date}  ${fmt(t.amount)}`);
  return `${pool.length} visit${pool.length !== 1 ? 's' : ''} to ${merchantQuery}${month ? ` in ${monthLabel(month)}` : ''}:\n\nTotal: ${fmt(total)}\nAvg per visit: ${fmt(total / pool.length)}\n\nBy month:\n${monthLines.join('\n')}\n\nRecent:\n${recentLines.join('\n')}`;
}

function compareMonths(txs: Transaction[]): string {
  const months = monthsAvailable(txs);
  if (months.length < 2) return "I need at least two months of data to compare. Upload another statement.";
  const [curr, prev] = months;
  const currSpent = sum(debits(txs).filter(t => monthOf(t.date) === curr));
  const prevSpent = sum(debits(txs).filter(t => monthOf(t.date) === prev));
  const diff = currSpent - prevSpent;
  const change = prevSpent > 0 ? Math.round((Math.abs(diff) / prevSpent) * 100) : 0;
  // Category breakdown comparison
  const currCats = groupBy(debits(txs).filter(t => monthOf(t.date) === curr), t => t.category);
  const prevCats = groupBy(debits(txs).filter(t => monthOf(t.date) === prev), t => t.category);
  const allCats = [...new Set([...Object.keys(currCats), ...Object.keys(prevCats)])];
  const changes = allCats.map(c => ({
    cat: c,
    curr: sum(currCats[c] || []),
    prev: sum(prevCats[c] || []),
    delta: sum(currCats[c] || []) - sum(prevCats[c] || []),
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
  const catLines = changes.map(c =>
    `• ${c.cat}: ${c.delta > 0 ? '+' : ''}${fmt(c.delta)}`
  );
  const arrow = diff > 0 ? '▲' : '▼';
  const word  = diff > 0 ? 'more' : 'less';
  return `Month comparison:\n\n• ${monthLabel(prev)}: ${fmt(prevSpent)}\n• ${monthLabel(curr)}: ${fmt(currSpent)}\n\n${arrow} ${fmt(Math.abs(diff))} ${word} (${change}%)\n\nBiggest changes:\n${catLines.join('\n')}\n\n${diff > 0 ? '⚠️ Spending went up.' : '✅ Spending went down — great work!'}`;
}

function dailyAverage(txs: Transaction[], month: string | null): string {
  let pool = debits(txs);
  if (month) pool = pool.filter(t => monthOf(t.date) === month);
  if (!pool.length) return month ? `No spending in ${monthLabel(month)}.` : "No spending data.";
  const days = new Set(pool.map(t => t.date)).size;
  const total = sum(pool);
  const avgPerDay = total / days;
  const prefix = month ? `In ${monthLabel(month)}` : 'Overall';
  return `${prefix}:\n\n• Total spent: ${fmt(total)}\n• Days with spending: ${days}\n• Daily average: ${fmt(avgPerDay)}\n• Weekly equivalent: ${fmt(avgPerDay * 7)}\n• Monthly equivalent: ${fmt(avgPerDay * 30)}`;
}

function budgetAdvice(txs: Transaction[]): string {
  const months = monthsAvailable(txs);
  if (!months.length) return "Upload a bank statement first so I can suggest a budget.";
  const recentMonths = months.slice(0, 3);
  const avgSpent = recentMonths.reduce((s, m) =>
    s + sum(debits(txs).filter(t => monthOf(t.date) === m)), 0
  ) / recentMonths.length;
  const top3 = topN(groupBy(debits(txs).filter(t => recentMonths.includes(monthOf(t.date))), t => t.category), 3);
  const lines = top3.map(([c, ts]) => {
    const monthly = sum(ts) / recentMonths.length;
    const suggested = monthly * 0.85;
    return `• ${c}: currently ${fmt(monthly)}/mo → target ${fmt(suggested)}/mo (save ${fmt(monthly - suggested)})`;
  });
  return `Based on your last ${recentMonths.length} month${recentMonths.length !== 1 ? 's' : ''}, you average ${fmt(avgSpent)}/month.\n\nSuggested cuts (15% on top categories):\n\n${lines.join('\n')}\n\n💡 Cutting just your top 3 categories saves the most.`;
}

// ── NEW: Spending trend ──────────────────────────────────────────────────────

function spendingTrend(txs: Transaction[]): string {
  const months = monthsAvailable(txs).reverse(); // oldest → newest
  if (months.length < 2) return "I need at least two months of data to show a trend.";
  const data = months.map(m => ({ m, spent: sum(debits(txs).filter(t => monthOf(t.date) === m)) }));
  const lines = data.map(({ m, spent }) => `• ${monthLabel(m)}: ${fmt(spent)}`);
  const first = data[0].spent, last = data[data.length - 1].spent;
  const diff = last - first;
  const changePct = first > 0 ? Math.round((Math.abs(diff) / first) * 100) : 0;
  const trend = diff > 50 ? `📈 Spending is up ${changePct}% over this period.`
    : diff < -50         ? `📉 Spending is down ${changePct}% — great progress!`
    : '↔️ Spending is roughly flat across this period.';
  return `Spending trend:\n\n${lines.join('\n')}\n\n${trend}`;
}

// ── NEW: Day-of-week analysis ────────────────────────────────────────────────

function dowAnalysis(txs: Transaction[]): string {
  const pool = debits(txs);
  if (!pool.length) return "No spending data found.";
  const byDow = groupBy(pool, t => dowOf(t.date).toString());
  const dowData = DOW_NAMES.map((name, i) => ({
    name,
    total: sum(byDow[i.toString()] || []),
    count: (byDow[i.toString()] || []).length,
  }));
  const sorted = [...dowData].sort((a, b) => b.total - a.total);
  const lines = sorted.map((d, i) =>
    `${i + 1}. ${d.name}: ${fmt(d.total)} (${d.count} transactions)`
  );
  const weekdayTotal   = sum(pool.filter(t => { const d = dowOf(t.date); return d >= 1 && d <= 5; }));
  const weekendTotal   = sum(pool.filter(t => { const d = dowOf(t.date); return d === 0 || d === 6; }));
  const weekendPct     = pct(weekendTotal, weekdayTotal + weekendTotal);
  return `Spending by day of week:\n\n${lines.join('\n')}\n\n• Weekdays: ${fmt(weekdayTotal)}\n• Weekends: ${fmt(weekendTotal)} (${weekendPct} of total)\n\n💡 Your heaviest day is ${sorted[0].name}.`;
}

// ── NEW: On-track forecast ───────────────────────────────────────────────────

function onTrackForecast(txs: Transaction[]): string {
  const cm = currentMonth();
  const cmTxs = debits(txs).filter(t => monthOf(t.date) === cm);
  if (!cmTxs.length) return "No spending recorded yet this month.";

  const today = new Date();
  const daysSoFar = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const spentSoFar = sum(cmTxs);
  const projected  = (spentSoFar / daysSoFar) * daysInMonth;

  // Compare to last month
  const pm = prevMonth();
  const lastMonthSpent = sum(debits(txs).filter(t => monthOf(t.date) === pm));
  const diff = projected - lastMonthSpent;
  const word = diff > 0 ? 'more' : 'less';

  const verdict = projected > lastMonthSpent * 1.1
    ? `⚠️ You're on track to spend ${fmt(Math.abs(diff))} more than last month.`
    : projected < lastMonthSpent * 0.9
    ? `✅ You're on track to spend ${fmt(Math.abs(diff))} less than last month.`
    : `↔️ On track to spend roughly the same as last month.`;

  return `This month so far (${daysSoFar} of ${daysInMonth} days):\n\n• Spent: ${fmt(spentSoFar)}\n• Daily rate: ${fmt(spentSoFar / daysSoFar)}\n• Projected total: ${fmt(projected)}\n• Last month total: ${fmt(lastMonthSpent)}\n\n${verdict}`;
}

// ── NEW: Category trend (month-on-month for one category) ────────────────────

function categoryTrend(txs: Transaction[], cat: string): string {
  const months = monthsAvailable(txs).slice(0, 4).reverse();
  if (months.length < 2) return "Need at least two months of data to show a trend.";
  const data = months.map(m => {
    const pool = debits(txs).filter(t =>
      monthOf(t.date) === m &&
      (t.category.toLowerCase().includes(cat) || t.merchant.toLowerCase().includes(cat))
    );
    return { m, spent: sum(pool), count: pool.length };
  });
  const lines = data.map(({ m, spent, count }) =>
    `• ${monthLabel(m)}: ${fmt(spent)} (${count}×)`
  );
  const first = data[0].spent, last = data[data.length - 1].spent;
  const diff = last - first;
  const trend = diff > 5  ? `📈 Up ${fmt(diff)} since ${monthLabel(months[0])}.`
    : diff < -5            ? `📉 Down ${fmt(Math.abs(diff))} since ${monthLabel(months[0])}.`
    : `↔️ Roughly flat.`;
  return `${cat} spending trend:\n\n${lines.join('\n')}\n\n${trend}`;
}

// ── NEW: Best and worst months ───────────────────────────────────────────────

function bestWorstMonths(txs: Transaction[]): string {
  const months = monthsAvailable(txs);
  if (months.length < 2) return "Need at least two months of data.";
  const data = months.map(m => ({
    m,
    spent: sum(debits(txs).filter(t => monthOf(t.date) === m)),
    inc:   sum(credits(txs).filter(t => monthOf(t.date) === m)),
  })).map(d => ({ ...d, net: d.inc - d.spent }));
  const byNet   = [...data].sort((a, b) => b.net - a.net);
  const bySpend = [...data].sort((a, b) => a.spent - b.spent);
  const best   = byNet[0], worst = byNet[byNet.length - 1];
  const lowest = bySpend[0], highest = bySpend[bySpend.length - 1];
  return `Best & worst months:\n\n🏆 Best savings: ${monthLabel(best.m)} (+${fmt(best.net)})\n💸 Worst savings: ${monthLabel(worst.m)} (${fmt(worst.net)})\n\n✅ Lowest spend: ${monthLabel(lowest.m)} (${fmt(lowest.spent)})\n⚠️ Highest spend: ${monthLabel(highest.m)} (${fmt(highest.spent)})`;
}

// ── NEW: Year-to-date summary ────────────────────────────────────────────────

function yearToDate(txs: Transaction[]): string {
  const year = currentYear();
  const ytdTxs = txs.filter(t => t.date.startsWith(year));
  if (!ytdTxs.length) return `No transactions found for ${year} yet.`;
  const inc = sum(credits(ytdTxs)), spent = sum(debits(ytdTxs)), net = inc - spent;
  const months = new Set(ytdTxs.map(t => monthOf(t.date))).size;
  const top3 = topN(groupBy(debits(ytdTxs), t => t.category), 3)
    .map(([c, ts]) => `• ${c}: ${fmt(sum(ts))}`);
  const savingsRate = inc > 0 ? Math.round((net / inc) * 100) : 0;
  return `Year to date (${year}):\n\n• Income: ${fmt(inc)}\n• Spent: ${fmt(spent)}\n• Net: ${net >= 0 ? '+' : ''}${fmt(net)}\n• Savings rate: ${savingsRate}%\n• Months tracked: ${months}\n\nTop categories:\n${top3.join('\n')}`;
}

// ── NEW: Transactions on a specific date ─────────────────────────────────────

function transactionsOnDate(txs: Transaction[], dateStr: string): string {
  const matches = txs.filter(t => t.date === dateStr);
  if (!matches.length) return `No transactions found on ${dateStr}.`;
  const lines = matches.map(t =>
    `• ${t.type === 'debit' ? '-' : '+'}${fmt(t.amount)}  ${t.merchant}  (${t.category})`
  );
  const total = sum(debits(matches));
  return `Transactions on ${dateStr}:\n\n${lines.join('\n')}\n\nTotal spent: ${fmt(total)}`;
}

// ── NEW: Anomaly detection ────────────────────────────────────────────────────

function unusualSpending(txs: Transaction[]): string {
  const pool = debits(txs);
  if (pool.length < 5) return "Not enough data yet to detect unusual spending. Upload more statements.";
  const byMerchant = groupBy(pool, t => t.merchant);
  const anomalies: { merchant: string; amount: number; date: string; avgAmount: number }[] = [];
  for (const [merchant, mTxs] of Object.entries(byMerchant)) {
    if (mTxs.length < 2) continue;
    const amounts = mTxs.map(t => t.amount);
    const meanAmt = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const stdDev  = Math.sqrt(amounts.reduce((s, a) => s + Math.pow(a - meanAmt, 2), 0) / amounts.length);
    for (const t of mTxs) {
      if (stdDev > 0 && (t.amount - meanAmt) / stdDev > 2) {
        anomalies.push({ merchant, amount: t.amount, date: t.date, avgAmount: meanAmt });
      }
    }
  }
  // Also flag one-off large transactions overall
  const overallAvg  = avg(pool);
  const overallStd  = Math.sqrt(pool.reduce((s, t) => s + Math.pow(t.amount - overallAvg, 2), 0) / pool.length);
  const bigOnes = pool.filter(t => overallStd > 0 && (t.amount - overallAvg) / overallStd > 2.5 && !anomalies.find(a => a.date === t.date && a.merchant === t.merchant));
  if (!anomalies.length && !bigOnes.length) return "No unusual transactions detected — your spending looks consistent.";
  const lines: string[] = [];
  for (const a of anomalies.slice(0, 4))
    lines.push(`• ${a.date}  ${fmt(a.amount)} at ${a.merchant}  (avg: ${fmt(a.avgAmount)})`);
  for (const t of bigOnes.slice(0, 3))
    lines.push(`• ${t.date}  ${fmt(t.amount)} at ${t.merchant}  (${t.category})`);
  return `Unusual transactions detected:\n\n${lines.join('\n')}\n\n💡 These are significantly higher than your normal spending at these merchants.`;
}

// ── NEW: Frequency / visit count ─────────────────────────────────────────────

function visitCount(txs: Transaction[], merchantQuery: string): string {
  const mq  = merchantQuery.toLowerCase();
  const pool = debits(txs).filter(t => t.merchant.toLowerCase().includes(mq));
  if (!pool.length) return `No transactions found for "${merchantQuery}".`;
  const byM = groupBy(pool, t => monthOf(t.date));
  const monthLines = Object.keys(byM).sort().reverse().slice(0, 4)
    .map(m => `• ${monthLabel(m)}: ${byM[m].length} visit${byM[m].length !== 1 ? 's' : ''}, ${fmt(sum(byM[m]))}`);
  const last = [...pool].sort((a, b) => b.date.localeCompare(a.date))[0];
  return `${pool.length} total visits to ${merchantQuery}:\n\n${monthLines.join('\n')}\n\nLast visit: ${last.date} (${fmt(last.amount)})\nAvg per visit: ${fmt(sum(pool) / pool.length)}`;
}

// ── NEW: Last time at merchant ────────────────────────────────────────────────

function lastVisit(txs: Transaction[], merchantQuery: string): string {
  const mq  = merchantQuery.toLowerCase();
  const pool = debits(txs)
    .filter(t => t.merchant.toLowerCase().includes(mq))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!pool.length) return `No transactions found for "${merchantQuery}".`;
  const last = pool[0];
  const daysSince = Math.round((Date.now() - new Date(last.date).getTime()) / 86400000);
  const totalVisits = pool.length;
  const totalSpent  = sum(pool);
  return `Last visit to ${merchantQuery}:\n\n• Date: ${last.date} (${daysSince} days ago)\n• Amount: ${fmt(last.amount)}\n\nTotal visits: ${totalVisits}\nTotal spent there: ${fmt(totalSpent)}`;
}

// ── NEW: Weekend vs weekday spending ─────────────────────────────────────────

function weekendVsWeekday(txs: Transaction[]): string {
  const pool = debits(txs);
  if (!pool.length) return "No spending data found.";
  const weekend  = pool.filter(t => { const d = dowOf(t.date); return d === 0 || d === 6; });
  const weekday  = pool.filter(t => { const d = dowOf(t.date); return d >= 1 && d <= 5; });
  const wkndAvgDay = weekend.length ? sum(weekend) / new Set(weekend.map(t => t.date)).size : 0;
  const wkdyAvgDay = weekday.length ? sum(weekday)  / new Set(weekday.map(t => t.date)).size  : 0;
  const heavier = wkndAvgDay > wkdyAvgDay ? 'weekends' : 'weekdays';
  return `Weekend vs weekday spending:\n\n• Weekdays: ${fmt(sum(weekday))} total (avg ${fmt(wkdyAvgDay)}/day)\n• Weekends: ${fmt(sum(weekend))} total (avg ${fmt(wkndAvgDay)}/day)\n\n💡 You spend more on ${heavier} on average.`;
}

// ── NEW: Category comparison between two months ──────────────────────────────

function categoryMonthCompare(txs: Transaction[], cat: string): string {
  const cm = currentMonth(), pm = prevMonth();
  const thisM = sum(debits(txs).filter(t => monthOf(t.date) === cm && (t.category.toLowerCase().includes(cat) || t.merchant.toLowerCase().includes(cat))));
  const lastM = sum(debits(txs).filter(t => monthOf(t.date) === pm && (t.category.toLowerCase().includes(cat) || t.merchant.toLowerCase().includes(cat))));
  if (!thisM && !lastM) return `No ${cat} spending found in the last two months.`;
  const diff = thisM - lastM;
  const arrow = diff > 0 ? '▲' : '▼';
  const word  = diff > 0 ? 'more' : 'less';
  return `${cat} — month comparison:\n\n• ${monthLabel(pm)}: ${fmt(lastM)}\n• ${monthLabel(cm)}: ${fmt(thisM)}\n\n${arrow} ${fmt(Math.abs(diff))} ${word} this month${diff > 0 ? ' ⚠️' : ' ✅'}`;
}

// ─── Category keyword map ─────────────────────────────────────────────────────

const CATEGORIES: Record<string, string[]> = {
  'food & dining': ['food', 'dining', 'restaurant', 'eat', 'lunch', 'dinner', 'meal', 'takeout', 'takeaway', 'brunch', 'snack', 'pizza', 'burger', 'sushi'],
  'groceries':     ['grocery', 'groceries', 'supermarket', 'walmart', 'costco', 'trader joe', 'whole foods', 'safeway', 'kroger', 'aldi', 'publix'],
  'coffee':        ['coffee', 'starbucks', 'cafe', 'latte', 'cappuccino', 'espresso', 'dunkin'],
  'transportation':['transport', 'uber', 'lyft', 'taxi', 'gas', 'fuel', 'transit', 'parking', 'metro', 'bus', 'train', 'commute', 'toll'],
  'entertainment': ['entertainment', 'movie', 'cinema', 'netflix', 'spotify', 'hulu', 'disney', 'apple tv', 'youtube', 'game', 'concert', 'stream'],
  'health & fitness':['health', 'gym', 'fitness', 'doctor', 'pharmacy', 'medical', 'dental', 'hospital', 'workout', 'peloton', 'cvs', 'walgreens'],
  'shopping':      ['shopping', 'amazon', 'clothing', 'clothes', 'shoes', 'apparel', 'fashion', 'target', 'ebay', 'etsy'],
  'travel':        ['travel', 'flight', 'hotel', 'airbnb', 'vacation', 'airline', 'booking', 'expedia', 'trip', 'resort'],
  'bills & utilities':['bill', 'utility', 'electric', 'internet', 'phone', 'rent', 'mortgage', 'insurance', 'water', 'cable'],
  'alcohol':       ['bar', 'beer', 'wine', 'liquor', 'alcohol', 'pub', 'brewery', 'cocktail'],
};

// ─── Extract merchant name from natural language ──────────────────────────────

function extractMerchant(q: string, txs: Transaction[]): string | null {
  // Try matching against actual merchant names in the data (case-insensitive)
  const merchantNames = [...new Set(debits(txs).map(t => t.merchant.toLowerCase()))];
  for (const name of merchantNames) {
    if (q.includes(name) && name.length > 2) return name;
  }
  // Try common patterns: "at X", "from X", "on X", "to X", "for X"
  const patterns = [
    /(?:at|from|for|to|on|spent at|visit(?:ed)?|go(?:ing)? to|buy(?:ing)? (?:from|at)?)\s+([a-z0-9&'\- ]{2,30}?)(?:\?|\.|\s*$|\s+(?:this|last|in|how|when|much|often))/,
    /(?:how (?:much|many|often).*?(?:at|from|to|on|spend at|spent at))\s+([a-z0-9&'\- ]{2,30})(?:\?|\.|\s*$)/,
  ];
  for (const p of patterns) {
    const m = q.match(p);
    if (m?.[1]) {
      const candidate = m[1].trim();
      if (candidate.length > 2 && !['the', 'my', 'i ', 'in ', 'on '].some(s => candidate === s.trim()))
        return candidate;
    }
  }
  return null;
}

// ─── Extract date (YYYY-MM-DD) from natural language ─────────────────────────

function extractDate(q: string): string | null {
  // "on 2024-03-15" or "on march 15" or "on the 15th" etc.
  const isoMatch = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];
  const today = new Date();
  // "yesterday"
  if (q.includes('yesterday')) {
    const d = new Date(today); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  // "today"
  if (/\btoday\b/.test(q)) return today.toISOString().slice(0, 10);
  return null;
}

// ─── Main router ──────────────────────────────────────────────────────────────

function analyticsRoute(question: string, txs: Transaction[]): string {
  const q = question.toLowerCase().trim();

  // ── Greetings ──────────────────────────────────────────────────────────────
  if (/^(hi|hello|hey|howdy|sup|what'?s up|good morning|good evening|yo|hiya|greetings)[\s!?.]*$/.test(q)) {
    return "Hey! I'm your ClearMoney AI — all analysis runs on this device, zero cloud. 👋\n\nHere's what you can ask:\n• \"How much did I spend last month?\"\n• \"What are my top expenses?\"\n• \"Show my last 10 transactions\"\n• \"Do I have any subscriptions?\"\n• \"How much did I spend on food?\"\n• \"Am I saving money?\"\n• \"Compare this month vs last month\"\n• \"Am I on track this month?\"\n• \"What's my spending trend?\"\n• \"Any unusual transactions?\"";
  }

  // ── Casual / compliments ────────────────────────────────────────────────────
  const isCasual = ['thank', 'great', 'wow', 'amazing', 'awesome', 'fast', "you're", 'perfect', 'nice', 'cool', 'good job', 'helpful'].some(w => q.includes(w));
  if (isCasual && !has(q, 'spend', 'money', 'transaction', 'sav', 'budget', 'subscri', 'categor', 'merchant')) {
    const responses = [
      "Happy to help! Everything runs locally — no servers, instant answers. 🚀\n\nWhat else would you like to know?",
      "Thanks! 100% private, 100% on-device. What financial question can I dig into?",
      "Glad that helped! What else can I analyse for you?",
    ];
    return responses[Math.floor(Date.now() / 1000) % responses.length];
  }

  // ── What can you do? ───────────────────────────────────────────────────────
  if (has(q, 'what can you', 'what do you', 'help me', 'capabilities', 'features', 'how do you work', 'what questions')) {
    return "I can answer any question about your finances using your uploaded statements:\n\n📊 Spending — by category, merchant, month, or date\n📅 Trends — month-over-month, category trends over time\n💰 Savings — rate, best/worst months, year-to-date\n🔄 Subscriptions — recurring charges, total annual cost\n🎯 On-track — projected spend vs last month\n📍 Merchants — visit count, last visit, avg spend\n⚠️ Anomalies — unusual or one-off large transactions\n📆 Patterns — day of week, weekend vs weekday, mid-month drops\n\nAll processed on-device — nothing leaves your phone.";
  }

  // ── Specific date query ────────────────────────────────────────────────────
  const dateStr = extractDate(q);
  if (dateStr && has(q, 'on ', 'yesterday', 'today', 'that day', 'that date'))
    return transactionsOnDate(txs, dateStr);

  // ── Recent transactions ────────────────────────────────────────────────────
  const recM = q.match(/(?:last|recent|latest|show|give me|past|list)\s*(\d+)?\s*transactions?/);
  if (recM || has(q, 'recent transaction', 'last transaction', 'show transaction', 'my transaction', 'transaction history'))
    return recentTransactions(txs, Math.min(recM?.[1] ? parseInt(recM[1]) : 5, 20));

  // ── Subscriptions ──────────────────────────────────────────────────────────
  if (has(q, 'subscription', 'recurring', 'cancel', 'membership', 'monthly charge'))
    return subscriptions(txs);

  // ── Broke / mid-month pattern ──────────────────────────────────────────────
  if (has(q, 'broke', 'run out', 'run low', '20th', '25th', 'payday', 'end of month', 'out of money', 'no money', 'always broke'))
    return brokeAnalysis(txs);

  // ── Largest purchases ──────────────────────────────────────────────────────
  const bigM = q.match(/(?:biggest|largest|most expensive|highest|top)\s*(\d+)?\s*(?:purchase|transaction|expense|charge|spend)/);
  if (bigM || has(q, 'biggest purchase', 'largest expense', 'most expensive', 'biggest transaction', 'highest charge')) {
    const count = bigM?.[1] ? parseInt(bigM[1]) : 5;
    const month = has(q, 'last month', 'previous month') ? prevMonth()
      : has(q, 'this month', 'current month') ? currentMonth() : null;
    return largestTransactions(txs, count, month);
  }

  // ── Anomalies / unusual ────────────────────────────────────────────────────
  if (has(q, 'unusual', 'anomaly', 'anomalies', 'weird', 'strange', 'unexpected', 'odd transaction', 'spike'))
    return unusualSpending(txs);

  // ── Spending trend ─────────────────────────────────────────────────────────
  if (has(q, 'trend', 'over time', 'going up', 'going down', 'increasing', 'decreasing', 'month by month', 'each month')) {
    // Category-specific trend?
    for (const [cat, keywords] of Object.entries(CATEGORIES))
      if (keywords.some(kw => q.includes(kw)))
        return categoryTrend(txs, cat);
    return spendingTrend(txs);
  }

  // ── On-track / forecast ────────────────────────────────────────────────────
  if (has(q, 'on track', 'on pace', 'forecast', 'project', 'will i spend', 'this month so far', 'pace'))
    return onTrackForecast(txs);

  // ── Best / worst months ────────────────────────────────────────────────────
  if (has(q, 'best month', 'worst month', 'highest month', 'lowest month', 'which month', 'most expensive month'))
    return bestWorstMonths(txs);

  // ── Year to date ───────────────────────────────────────────────────────────
  if (has(q, 'year to date', 'ytd', 'this year', 'since january', 'so far this year'))
    return yearToDate(txs);

  // ── Day of week ────────────────────────────────────────────────────────────
  if (has(q, 'day of week', 'which day', 'what day', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'))
    return dowAnalysis(txs);

  // ── Weekend vs weekday ─────────────────────────────────────────────────────
  if (has(q, 'weekend', 'weekday', 'weekends', 'weekdays'))
    return weekendVsWeekday(txs);

  // ── Compare months ─────────────────────────────────────────────────────────
  if (has(q, 'compare', 'month over month', 'vs last month', 'versus', 'difference between month'))
    return compareMonths(txs);

  // ── Daily / weekly averages ────────────────────────────────────────────────
  if (has(q, 'daily', 'per day', 'average spend', 'weekly', 'per week', 'average per')) {
    const month = has(q, 'last month', 'previous month') ? prevMonth()
      : has(q, 'this month', 'current month') ? currentMonth() : null;
    return dailyAverage(txs, month);
  }

  // ── Savings ────────────────────────────────────────────────────────────────
  if (has(q, 'saving', 'savings rate', 'am i saving', 'save money', 'net income', 'how much left'))
    return savingsAnalysis(txs);

  // ── Budget ─────────────────────────────────────────────────────────────────
  if (has(q, 'budget', 'suggestion', 'recommend', 'advice', 'how to save', 'reduce spending', 'cut back', 'spend less'))
    return budgetAdvice(txs);

  // ── Time detection ─────────────────────────────────────────────────────────
  const lastMonthQ = has(q, 'last month', 'previous month');
  const thisMonthQ = has(q, 'this month', 'current month', 'so far');
  const targetMonth = lastMonthQ ? prevMonth() : thisMonthQ ? currentMonth() : null;

  // ── Top merchants ──────────────────────────────────────────────────────────
  if (has(q, 'top merchant', 'where do i spend', 'which merchant', 'most at', 'biggest merchant'))
    return topMerchants(txs, targetMonth);

  // ── Frequency / visit count ────────────────────────────────────────────────
  const freqM = q.match(/how (?:many|often|frequently).*?(?:times?|visits?|go|been|spent).*?(?:at|to|from|on)\s+([a-z0-9 &'\-]{2,25})/);
  if (freqM || has(q, 'how many times', 'how often', 'how frequently', 'number of times', 'how many visits')) {
    const mName = freqM?.[1]?.trim() ?? extractMerchant(q, txs);
    if (mName) return visitCount(txs, mName);
  }

  // ── Last visit ─────────────────────────────────────────────────────────────
  if (has(q, 'last time', 'last visit', 'last went', 'when did i', 'when was i', 'last purchase at')) {
    const mName = extractMerchant(q, txs);
    if (mName) return lastVisit(txs, mName);
  }

  // ── Category month comparison ──────────────────────────────────────────────
  if ((lastMonthQ || thisMonthQ) && has(q, 'more', 'less', 'increase', 'decrease', 'change', 'compare')) {
    for (const [cat, keywords] of Object.entries(CATEGORIES))
      if (keywords.some(kw => q.includes(kw)))
        return categoryMonthCompare(txs, cat);
  }

  // ── Category + optional time ───────────────────────────────────────────────
  for (const [cat, keywords] of Object.entries(CATEGORIES))
    if (keywords.some(kw => q.includes(kw)))
      return spendingInCategory(txs, cat, targetMonth);

  // ── Merchant search (any merchant in data) ─────────────────────────────────
  const merchantName = extractMerchant(q, txs);
  if (merchantName) return merchantSearch(txs, merchantName, targetMonth);

  // ── Month summary ──────────────────────────────────────────────────────────
  if (lastMonthQ) return monthSummary(txs, prevMonth());
  if (thisMonthQ) return monthSummary(txs, currentMonth());

  // ── Income ─────────────────────────────────────────────────────────────────
  if (has(q, 'income', 'earn', 'salary', 'how much do i make', 'how much i make', 'paycheck', 'deposited', 'credit'))
    return incomeBreakdown(txs);

  // ── Top categories ─────────────────────────────────────────────────────────
  if (has(q, 'top categor', 'spending categor', 'where is my money', 'where does my money', 'wasting', 'waste', 'how much', 'spending', 'spent'))
    return topSpendingCategories(txs, targetMonth);

  // ── Overview / catch-all ───────────────────────────────────────────────────
  return overview(txs);
}

// ─── Stream helper ────────────────────────────────────────────────────────────

async function streamWords(text: string, onToken: (partial: string) => void): Promise<void> {
  const words = text.split(' ');
  let built = '';
  for (let i = 0; i < words.length; i++) {
    built += (i === 0 ? '' : ' ') + words[i];
    onToken(built);
    await new Promise(r => setTimeout(r, 16));
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const chatAgentStream = async (
  userMessage: string,
  txs: Transaction[],
  onToken: (partial: string) => void
): Promise<string> => {
  if (!isAIAvailable()) { onToken(EXPO_GO_MSG); return EXPO_GO_MSG; }
  const answer = analyticsRoute(userMessage, txs);
  await streamWords(answer, onToken);
  return answer;
};

export const chatAgent = async (userMessage: string, txs: Transaction[]): Promise<string> => {
  if (!isAIAvailable()) return EXPO_GO_MSG;
  return analyticsRoute(userMessage, txs);
};
