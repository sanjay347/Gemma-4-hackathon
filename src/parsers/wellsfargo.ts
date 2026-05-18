import { ParsedTransaction, cleanMerchantName } from './shared';

// Wells Fargo checking format:
//   "1/2/2026  STARBUCKS #12345  -5.50  1,234.56"  (last col = running balance)
// Wells Fargo credit card:
//   "01/02  STARBUCKS #12345  5.50"

const SKIP_PATTERN =
  /^(date|description|amount|balance|total|beginning|ending|account|subtotal|payment|statement|period|previous|minimum|credit limit|available|interest|apr|fee|thank you|opening|closing|deposits|withdrawals|purchases|new balance|account summary)/i;

function parseAmount(raw: string): number | null {
  const s = raw.replace(/,/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export const parseWellsFargoStatement = (text: string): ParsedTransaction[] => {
  const transactions: ParsedTransaction[] = [];
  const seen = new Set<string>();

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Format 1: M/D/YYYY  description  amount  [balance]
  const re1 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s{2,}(.+?)\s{2,}(-?[\d,]+\.\d{2})(?:\s+-?[\d,]+\.\d{2})?$/;

  // Format 2: MM/DD  description  amount
  const re2 = /^(\d{1,2})\/(\d{1,2})\s{2,}(.+?)\s{2,}(-?[\d,]+\.\d{2})(?:\s+-?[\d,]+\.\d{2})?$/;

  const year = new Date().getFullYear().toString();

  for (const line of lines) {
    let m = line.match(re1);
    if (m) {
      const description = m[4].trim();
      if (SKIP_PATTERN.test(description) || description.length < 3) continue;
      const rawAmount = parseAmount(m[5]);
      if (rawAmount === null) continue;
      const isoDate = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      const key = `${isoDate}|${description}|${m[5]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      transactions.push({
        date: isoDate,
        description,
        amount: Math.abs(rawAmount),
        type: rawAmount < 0 ? 'debit' : 'credit',
        merchant_clean: cleanMerchantName(description),
      });
      continue;
    }

    m = line.match(re2);
    if (m) {
      const description = m[3].trim();
      if (SKIP_PATTERN.test(description) || description.length < 3) continue;
      const rawAmount = parseAmount(m[4]);
      if (rawAmount === null) continue;
      const isoDate = `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      const key = `${isoDate}|${description}|${m[4]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      transactions.push({
        date: isoDate,
        description,
        amount: Math.abs(rawAmount),
        type: rawAmount < 0 ? 'debit' : 'credit',
        merchant_clean: cleanMerchantName(description),
      });
    }
  }

  console.log(`[WellsFargo Parser] Parsed ${transactions.length} transactions.`);
  return transactions;
};
