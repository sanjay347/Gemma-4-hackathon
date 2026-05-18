import { ParsedTransaction, cleanMerchantName } from './shared';

// Citi credit card statement format:
//   "01/02/2026  01/03/2026  STARBUCKS #12345  $5.50"  (trans date, post date, desc, amount)
//   "01/15/2026  01/16/2026  PAYMENT THANK YOU  -$500.00"

const SKIP_PATTERN =
  /^(date|description|amount|balance|total|beginning|ending|account|subtotal|payment due|statement|period|previous|minimum|credit limit|available|interest|apr|fee|thank you|opening|closing|purchases|new balance|account summary|transaction)/i;

function parseAmount(raw: string): number | null {
  const s = raw.replace(/[$,]/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function mmddyyyyToIso(date: string): string | null {
  const parts = date.split('/');
  if (parts.length !== 3) return null;
  const [mm, dd, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

export const parseCitiStatement = (text: string): ParsedTransaction[] => {
  const transactions: ParsedTransaction[] = [];
  const seen = new Set<string>();

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Citi: two dates then description then amount (with optional $ sign)
  const re = /^(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(.+?)\s+(\$?-?[\d,]+\.\d{2})$/;

  // Simpler single-date fallback
  const reFallback = /^(\d{2}\/\d{2}\/\d{4})\s{2,}(.+?)\s{2,}(\$?-?[\d,]+\.\d{2})$/;

  for (const line of lines) {
    const m = line.match(re) ?? line.match(reFallback);
    if (!m) continue;

    const description = m[2].trim();
    if (SKIP_PATTERN.test(description) || description.length < 3) continue;

    const rawAmount = parseAmount(m[3]);
    if (rawAmount === null) continue;

    const isoDate = mmddyyyyToIso(m[1]);
    if (!isoDate) continue;

    const key = `${isoDate}|${description}|${m[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Citi credit card: positive = charge (debit), negative = payment/credit
    transactions.push({
      date: isoDate,
      description,
      amount: Math.abs(rawAmount),
      type: rawAmount > 0 ? 'debit' : 'credit',
      merchant_clean: cleanMerchantName(description),
    });
  }

  console.log(`[Citi Parser] Parsed ${transactions.length} transactions.`);
  return transactions;
};
