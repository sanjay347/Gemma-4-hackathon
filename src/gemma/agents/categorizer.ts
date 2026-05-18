import { callHFCategorizer } from '../client';
import { CategorizerOutput } from '../../types';
import { CATEGORIZATION_SYSTEM_PROMPT } from '../prompts';

export const categorizeTransaction = async (description: string, amount: number): Promise<CategorizerOutput> => {
  const prompt = `System: ${CATEGORIZATION_SYSTEM_PROMPT}\n\nUser: Transaction description: ${description}, Amount: ${amount}`;
  
  try {
    const result = await callHFCategorizer(prompt);
    
    // Validate output type or apply fallback
    if (result && typeof result === 'object' && 'category' in result) {
      return {
        category: result.category || 'Uncategorized',
        merchant_clean: result.merchant_clean || description,
        is_subscription: !!result.is_subscription,
        is_recurring: !!result.is_recurring,
      };
    }
    
    throw new Error('Invalid JSON output from Categorizer');
  } catch (error) {
    console.error('Categorizer Agent Error:', error);
    // Fallback classification if model fails
    return {
      category: 'Uncategorized',
      merchant_clean: description,
      is_subscription: false,
      is_recurring: false,
    };
  }
};
