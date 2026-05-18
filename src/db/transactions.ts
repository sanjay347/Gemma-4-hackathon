import * as SQLite from 'expo-sqlite';
import { Transaction, Insight, MonthlySummary } from '../types';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export const getDB = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('clearmoney.db');
  }
  return dbInstance;
};

export const insertTransactions = async (transactions: Transaction[]): Promise<void> => {
  const db = await getDB();
  const statement = await db.prepareAsync(
    `INSERT OR REPLACE INTO transactions 
    (id, date, amount, description, merchant, category, subcategory, is_subscription, is_recurring, type, bank) 
    VALUES ($id, $date, $amount, $description, $merchant, $category, $subcategory, $is_subscription, $is_recurring, $type, $bank)`
  );

  try {
    for (const t of transactions) {
      await statement.executeAsync({
        $id: t.id,
        $date: t.date,
        $amount: t.amount,
        $description: t.description,
        $merchant: t.merchant,
        $category: t.category,
        $subcategory: t.subcategory || null,
        $is_subscription: t.is_subscription ? 1 : 0,
        $is_recurring: t.is_recurring ? 1 : 0,
        $type: t.type,
        $bank: t.bank
      });
    }
  } finally {
    await statement.finalizeAsync();
  }
};

export const getTransactions = async (): Promise<Transaction[]> => {
  const db = await getDB();
  const result = await db.getAllAsync<any>('SELECT * FROM transactions ORDER BY date DESC');
  
  return result.map(r => ({
    ...r,
    is_subscription: Boolean(r.is_subscription),
    is_recurring: Boolean(r.is_recurring)
  }));
};

export const getTransactionsByMonth = async (monthPrefix: string): Promise<Transaction[]> => {
  const db = await getDB();
  const result = await db.getAllAsync<any>(
    'SELECT * FROM transactions WHERE date LIKE ? ORDER BY date DESC', 
    [`${monthPrefix}%`]
  );
  
  return result.map(r => ({
    ...r,
    is_subscription: Boolean(r.is_subscription),
    is_recurring: Boolean(r.is_recurring)
  }));
};

export const insertInsights = async (insights: Insight[]): Promise<void> => {
  const db = await getDB();
  const statement = await db.prepareAsync(
    `INSERT OR REPLACE INTO insights 
    (id, severity, type_label, title, description, impact_amount, action_label, created_at) 
    VALUES ($id, $severity, $type_label, $title, $description, $impact_amount, $action_label, $created_at)`
  );

  try {
    for (const i of insights) {
      await statement.executeAsync({
        $id: i.id,
        $severity: i.severity,
        $type_label: i.type_label,
        $title: i.title,
        $description: i.description,
        $impact_amount: i.impact_amount || null,
        $action_label: i.action_label || null,
        $created_at: i.created_at
      });
    }
  } finally {
    await statement.finalizeAsync();
  }
};

export const getInsights = async (): Promise<Insight[]> => {
  const db = await getDB();
  return db.getAllAsync<Insight>('SELECT * FROM insights ORDER BY created_at DESC');
};

export const upsertMonthlySummary = async (summary: MonthlySummary): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO monthly_summary 
    (id, month, total_spent, total_income, transaction_count, percentage_change) 
    VALUES (?, ?, ?, ?, ?, ?)`,
    [summary.id, summary.month, summary.total_spent, summary.total_income, summary.transaction_count, summary.percentage_change]
  );
};

export const getMonthlySummary = async (month: string): Promise<MonthlySummary | null> => {
  const db = await getDB();
  const result = await db.getFirstAsync<MonthlySummary>('SELECT * FROM monthly_summary WHERE month = ?', [month]);
  return result || null;
};

export const clearAllData = async (): Promise<void> => {
  const db = await getDB();
  await db.execAsync(`
    DELETE FROM transactions;
    DELETE FROM insights;
    DELETE FROM monthly_summary;
    DELETE FROM uploads;
  `);
};

export interface UploadRecord {
  id: string;
  bank: string;
  filename: string;
  transaction_count: number;
  uploaded_at: string;
}

export const recordUpload = async (record: UploadRecord): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO uploads (id, bank, filename, transaction_count, uploaded_at) VALUES (?, ?, ?, ?, ?)`,
    [record.id, record.bank, record.filename, record.transaction_count, record.uploaded_at]
  );
};

export const getUploads = async (): Promise<UploadRecord[]> => {
  const db = await getDB();
  return db.getAllAsync<UploadRecord>('SELECT * FROM uploads ORDER BY uploaded_at DESC');
};

export const getUserProfile = async (): Promise<Record<string, string>> => {
  const db = await getDB();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM user_profile');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
};

export const saveUserProfile = async (data: Record<string, string>): Promise<void> => {
  const db = await getDB();
  for (const [key, value] of Object.entries(data)) {
    await db.runAsync(
      `INSERT OR REPLACE INTO user_profile (key, value) VALUES (?, ?)`,
      [key, value]
    );
  }
};

// ── Category edit ─────────────────────────────────────────────────────────────
export const updateTransactionCategory = async (id: string, category: string): Promise<void> => {
  const db = await getDB();
  await db.runAsync('UPDATE transactions SET category = ? WHERE id = ?', [category, id]);
};

// ── Tags & Notes ─────────────────────────────────────────────────────────────
export const updateTransactionMeta = async (id: string, tags: string, notes: string): Promise<void> => {
  const db = await getDB();
  await db.runAsync('UPDATE transactions SET tags = ?, notes = ? WHERE id = ?', [tags, notes, id]);
};

// ── Subscriptions ────────────────────────────────────────────────────────────
export interface SubscriptionItem {
  merchant: string;
  category: string;
  monthly_cost: number;
  last_charged: string;
  bank: string;
  charge_count: number;
}

export const getSubscriptions = async (): Promise<SubscriptionItem[]> => {
  const db = await getDB();
  return db.getAllAsync<SubscriptionItem>(`
    SELECT
      merchant,
      category,
      MAX(date) as last_charged,
      bank,
      COUNT(*) as charge_count,
      AVG(amount) as monthly_cost
    FROM transactions
    WHERE is_subscription = 1 AND type = 'debit'
    GROUP BY merchant
    ORDER BY monthly_cost DESC
  `);
};

// ── Budgets ───────────────────────────────────────────────────────────────────
export interface Budget {
  id: string;
  category: string;
  monthly_limit: number;
  color: string;
}

export const getBudgets = async (): Promise<Budget[]> => {
  const db = await getDB();
  return db.getAllAsync<Budget>('SELECT * FROM budgets ORDER BY monthly_limit DESC');
};

export const upsertBudget = async (budget: Budget): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    'INSERT OR REPLACE INTO budgets (id, category, monthly_limit, color) VALUES (?, ?, ?, ?)',
    [budget.id, budget.category, budget.monthly_limit, budget.color]
  );
};

export const deleteBudget = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM budgets WHERE id = ?', [id]);
};

export const saveRollover = async (category: string, month: string, budgeted: number, spent: number): Promise<void> => {
  const db = await getDB();
  const rollover = Math.max(0, budgeted - spent); // only positive rollover
  await db.runAsync(
    `INSERT OR REPLACE INTO budget_rollovers (id, category, month, budgeted, spent, rollover) VALUES (?, ?, ?, ?, ?, ?)`,
    [`ro_${category}_${month}`, category, month, budgeted, spent, rollover]
  );
};

export const getRollover = async (category: string, month: string): Promise<number> => {
  const db = await getDB();
  const prevMonth = (() => {
    const [y, m] = month.split('-').map(Number);
    if (m === 1) return `${y - 1}-12`;
    return `${y}-${String(m - 1).padStart(2, '0')}`;
  })();
  const row = await db.getFirstAsync<{ rollover: number }>(
    'SELECT rollover FROM budget_rollovers WHERE category = ? AND month = ?',
    [category, prevMonth]
  );
  return row?.rollover ?? 0;
};

// ── Search ────────────────────────────────────────────────────────────────────
export const searchTransactions = async (query: string): Promise<Transaction[]> => {
  const db = await getDB();
  const q = `%${query}%`;
  const result = await db.getAllAsync<any>(
    `SELECT * FROM transactions
     WHERE merchant LIKE ? OR description LIKE ? OR category LIKE ? OR notes LIKE ? OR tags LIKE ?
     ORDER BY date DESC LIMIT 200`,
    [q, q, q, q, q]
  );
  return result.map(r => ({
    ...r,
    is_subscription: Boolean(r.is_subscription),
    is_recurring: Boolean(r.is_recurring),
  }));
};

// ── Calendar ──────────────────────────────────────────────────────────────────
export interface DaySpend { date: string; spent: number; income: number; count: number; }

export const getMonthSpendByDay = async (month: string): Promise<DaySpend[]> => {
  const db = await getDB();
  return db.getAllAsync<DaySpend>(`
    SELECT
      date,
      SUM(CASE WHEN type='debit' THEN amount ELSE 0 END) as spent,
      SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) as income,
      COUNT(*) as count
    FROM transactions
    WHERE date LIKE ?
    GROUP BY date
    ORDER BY date
  `, [`${month}%`]);
};

export const getTransactionsByDate = async (date: string): Promise<Transaction[]> => {
  const db = await getDB();
  const result = await db.getAllAsync<any>('SELECT * FROM transactions WHERE date = ? ORDER BY amount DESC', [date]);
  return result.map(r => ({
    ...r,
    is_subscription: Boolean(r.is_subscription),
    is_recurring: Boolean(r.is_recurring),
  }));
};
