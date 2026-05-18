import { ParsedTransaction, cleanMerchantName } from './shared';

// BofA checking/savings format after pdf.js extraction:
//   "01/02/2026  STARBUCKS #12345  SEATTLE WA  -5.50"
//   "01/04/2026  DIRECT DEPOSIT  2,500.00"
//
// BofA credit card format:
//   "01/02  01/03  STARBUCKS #12345  5.50"  (post date, trans date, desc, amount)

const SKIP_PATTERN =
  /^(date|description|amount|balance|total|beginning|ending|account|subtotal|payment|statement|period|previous|minimum|credit limit|available|interest|apr|fee|thank you|opening|closing|deposits|withdrawals|purchases|new balance|account summary)/i;

function parseAmount(raw: string): number | null {
  const s = raw.replace(/,/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function toIsoDate(m: string, d: string, y: string): string {
  return `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export const parseBofaStatement = (text: string): ParsedTransaction[] => {
  const transactions: ParsedTransaction[] = [];
  const seen = new Set<string>();

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Format 1: MM/DD/YYYY  description  amount  [balance]
  const re1 = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s{2,}(.+?)\s{2,}(-?[\d,]+\.\d{2})(?:\s+-?[\d,]+\.\d{2})?$/;

  // Format 2 (credit card): MM/DD  MM/DD  description  amount
  const re2 = /^\d{1,2}\/\d{1,2}\s+(\d{1,2})\/(\d{1,2})\s+(.+?)\s+(-?[\d,]+\.\d{2})$/;

  for (const line of lines) {
    let m = line.match(re1);
    if (m) {
      const description = m[4].trim();
      if (SKIP_PATTERN.test(description) || description.length < 3) continue;
      const rawAmount = parseAmount(m[5]);
      if (rawAmount === null) continue;
      const key = `${m[1]}/${m[2]}/${m[3]}|${description}|${m[5]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      transactions.push({
        date: toIsoDate(m[1], m[2], m[3]),
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
      const year = new Date().getFullYear().toString();
      const key = `${m[1]}/${m[2]}/${year}|${description}|${m[4]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // BofA credit card: positive = charge (debit)
      transactions.push({
        date: toIsoDate(m[1], m[2], year),
        description,
        amount: Math.abs(rawAmount),
        type: rawAmount > 0 ? 'debit' : 'credit',
        merchant_clean: cleanMerchantName(description),
      });
    }
  }

  console.log(`[BofA Parser] Parsed ${transactions.length} transactions.`);
  return transactions;
};
