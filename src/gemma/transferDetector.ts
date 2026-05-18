import { Transaction } from '../types';

// Matches a debit in one bank to a credit in another bank with same amount ±$0.01 within 3 days.
// Both sides are re-labeled as internal transfers so they don't skew spending stats.

const DAY_MS = 86_400_000;
const AMOUNT_TOLERANCE = 0.01;
const MAX_DAY_DIFF = 3;

function daysBetween(dateA: string, dateB: string): number {
  return Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime()) / DAY_MS;
}

export function detectInternalTransfers(transactions: Transaction[]): Transaction[] {
  const byBank: Record<string, Transaction[]> = {};
  for (const tx of transactions) {
    (byBank[tx.bank] ??= []).push(tx);
  }

  const banks = Object.keys(byBank);
  if (banks.length < 2) return transactions;

  const matched = new Set<string>();
  const result = transactions.map(t => ({ ...t }));

  const debits = result.filter(t => t.type === 'debit' && !matched.has(t.id));
  const credits = result.filter(t => t.type === 'credit' && !matched.has(t.id));

  for (const debit of debits) {
    for (const credit of credits) {
      if (debit.bank === credit.bank) continue;
      if (matched.has(debit.id) || matched.has(credit.id)) continue;
      if (Math.abs(debit.amount - credit.amount) > AMOUNT_TOLERANCE) continue;
      if (daysBetween(debit.date, credit.date) > MAX_DAY_DIFF) continue;

      matched.add(debit.id);
      matched.add(credit.id);

      const debitTx = result.find(t => t.id === debit.id)!;
      const creditTx = result.find(t => t.id === credit.id)!;

      debitTx.category = 'Transfer';
      debitTx.merchant = `Transfer to ${credit.bank}`;
      debitTx.is_recurring = false;
      debitTx.is_subscription = false;

      creditTx.category = 'Transfer';
      creditTx.merchant = `Transfer from ${debit.bank}`;
      creditTx.is_recurring = false;
      creditTx.is_subscription = false;
    }
  }

  return result;
}
