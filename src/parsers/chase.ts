import { ParsedTransaction, cleanMerchantName } from './shared';

// Header/summary lines common in real Chase PDFs — skip these
const SKIP_PATTERN = /^(date|description|amount|balance|total|beginning|ending|account|subtotal|payment due|statement|period|previous|minimum|credit limit|available|rewards|points|interest|apr|annual|fee|thank you|opening|closing|deposits|withdrawals|purchases|payments|other credits|new balance)/i;

function parseAmount(raw: string): number | null {
  // Chase uses trailing minus for debits in some formats: "25.00-" → -25
  let s = raw.replace(/,/g, '').trim();
  if (s.endsWith('-')) s = '-' + s.slice(0, -1);
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function toIsoDate(datePart: string): string {
  const parts = datePart.split('/');
  const mm = parts[0].padStart(2, '0');
  const dd = parts[1].padStart(2, '0');
  const yyyy = parts[2]
    ? parts[2].length === 2 ? `20${parts[2]}` : parts[2]
    : new Date().getFullYear().toString();
  return `${yyyy}-${mm}-${dd}`;
}

export const parseChaseStatement = (text: string): ParsedTransaction[] => {
  const transactions: ParsedTransaction[] = [];
  const seen = new Set<string>();

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Real Chase PDFs come in two shapes after pdf.js extraction:
  //
  //   Checking/savings — last column is running balance (ignored):
  //     "01/15  STARBUCKS #12345   -5.50   1,229.06"
  //
  //   Credit card — charges positive, payments negative:
  //     "01/15  TST* DOORDASH   25.00"
  //     "01/20  PAYMENT THANK YOU   -500.00"
  //
  // We match: date  description  first-amount  [optional running-balance]

  // Strict: requires 2+ spaces between columns (most Chase PDFs)
  const strictRe =
    /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s{2,}(.+?)\s{2,}(-?[\d,]+\.\d{2}-?)(?:\s+-?[\d,]+\.\d{2})?$/;

  // Loose fallback: single-space separation (some PDFs after text extraction)
  const looseRe =
    /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?[\d,]+\.\d{2}-?)(?:\s+-?[\d,]+\.\d{2})?$/;

  for (const line of lines) {
    const match = line.match(strictRe) ?? line.match(looseRe);
    if (!match) continue;

    const description = match[2].trim();
    if (SKIP_PATTERN.test(description) || description.length < 3) continue;

    const rawAmount = parseAmount(match[3]);
    if (rawAmount === null) continue;

    // Deduplicate same transaction appearing in multiple PDF sections
    const key = `${match[1]}|${description}|${match[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const type: 'debit' | 'credit' = rawAmount < 0 ? 'debit' : 'credit';

    transactions.push({
      date: toIsoDate(match[1]),
      description,
      amount: Math.abs(rawAmount),
      type,
      merchant_clean: cleanMerchantName(description),
    });
  }

  if (transactions.length === 0) {
    console.log('[Chase Parser] No transactions matched. Text preview:', text.substring(0, 800));
  } else {
    console.log(`[Chase Parser] Parsed ${transactions.length} transactions.`);
  }

  return transactions;
};
