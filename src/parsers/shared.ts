// Shared types and utilities for all bank parsers.
// Kept in a separate file so each parser can import from here
// without creating a cycle through index.ts.

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  merchant_clean: string;
}

export const cleanMerchantName = (description: string): string => {
  let clean = description.toUpperCase();

  const prefixes = [
    'SQ *', 'SQ*', 'TST*', 'POS ', 'ACH ',
    'PURCHASE AUTHORIZED ON ', 'ZELLE TO ', 'VENMO*',
    'CHECKCARD ', 'DEBIT CARD ', 'ONLINE TRANSFER TO ',
  ];
  for (const prefix of prefixes) {
    if (clean.startsWith(prefix)) {
      clean = clean.substring(prefix.length);
      break;
    }
  }

  // Remove trailing state+zip, trailing numbers, and reference codes
  clean = clean.replace(/\s+\w{2}\s+\d{5}(-\d{4})?$/, '');
  clean = clean.replace(/\s+#?\d{4,}$/, '');
  clean = clean.replace(/\s+\d{2}\/\d{2}$/, ''); // trailing date
  clean = clean.replace(/\s{2,}/g, ' ');

  return clean.trim();
};
