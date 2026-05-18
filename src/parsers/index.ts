import { parseChaseStatement } from './chase';
import { parseBofaStatement } from './bofa';
import { parseWellsFargoStatement } from './wellsfargo';
import { parseCitiStatement } from './citi';

// Re-export shared types so consumers only need to import from './index'
export type { ParsedTransaction } from './shared';
export { cleanMerchantName } from './shared';

export type BankType = 'chase' | 'bofa' | 'wellsfargo' | 'citi';

export const BANK_LABELS: Record<BankType, string> = {
  chase: 'Chase',
  bofa: 'Bank of America',
  wellsfargo: 'Wells Fargo',
  citi: 'Citi',
};

export const parseBankStatement = async (
  pdfText: string,
  bankType: BankType
): Promise<import('./shared').ParsedTransaction[]> => {
  switch (bankType) {
    case 'chase':      return parseChaseStatement(pdfText);
    case 'bofa':       return parseBofaStatement(pdfText);
    case 'wellsfargo': return parseWellsFargoStatement(pdfText);
    case 'citi':       return parseCitiStatement(pdfText);
  }
};
