import { getDB } from './transactions';

// Uses the shared DB instance from transactions.ts so there is only one connection.
export const initDB = async (): Promise<void> => {
  const db = await getDB();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      merchant TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      is_subscription INTEGER NOT NULL DEFAULT 0,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      bank TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY,
      severity TEXT NOT NULL,
      type_label TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      impact_amount REAL,
      action_label TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monthly_summary (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      total_spent REAL NOT NULL DEFAULT 0,
      total_income REAL NOT NULL DEFAULT 0,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      percentage_change REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      bank TEXT NOT NULL,
      filename TEXT NOT NULL,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL UNIQUE,
      monthly_limit REAL NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#22C55E'
    );

    CREATE TABLE IF NOT EXISTS budget_rollovers (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      month TEXT NOT NULL,
      budgeted REAL NOT NULL,
      spent REAL NOT NULL,
      rollover REAL NOT NULL,
      UNIQUE(category, month)
    );
  `);

  // Migrate: add tags/notes columns if not present
  for (const col of ['tags TEXT', 'notes TEXT']) {
    try {
      await db.execAsync(`ALTER TABLE transactions ADD COLUMN ${col}`);
    } catch { /* column already exists */ }
  }
};
