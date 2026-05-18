import { callGemmaBase } from '../client';
import { BehaviorAnalysisOutput } from '../../types';
import { BEHAVIORAL_ANALYSIS_PROMPT } from '../prompts';

function extractJSONObject(raw: string): string | null {
  // Strip markdown code fences
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fence) return fence[1].trim();
  // Find first { ... last }
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start !== -1 && end > start) return raw.substring(start, end + 1);
  return null;
}

// ─── Rule-based fallback (no model needed) ────────────────────────────────────
function ruleBasedInsights(data: any): BehaviorAnalysisOutput {
  const totals = (data.categoryTotals ?? {}) as Record<string, number>;
  const total  = Object.values(totals).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const patterns: any[] = [];

  for (const [cat, amount] of sorted.slice(0, 4)) {
    const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
    if (pct >= 20) {
      patterns.push({
        severity: pct > 45 ? 'danger' : pct > 30 ? 'warning' : 'info',
        type_label: 'Spending Pattern',
        title: `${pct}% spent on ${cat}`,
        description: `$${amount.toFixed(0)} on ${cat} this period — ${pct}% of total spending.`,
        impact_amount: amount,
        action_label: 'Review Budget',
      });
    }
  }

  // Flag subscriptions total if notable
  const subTotal = totals['Subscriptions'] ?? 0;
  if (subTotal > 0 && !patterns.find(p => p.title.includes('Subscriptions'))) {
    patterns.push({
      severity: 'info',
      type_label: 'Subscriptions',
      title: `$${subTotal.toFixed(0)}/mo in subscriptions`,
      description: `You have recurring subscription charges totalling $${subTotal.toFixed(0)} this period.`,
      impact_amount: subTotal,
      action_label: 'Review Subscriptions',
    });
  }

  if (patterns.length === 0 && sorted.length > 0) {
    const [topCat, topAmt] = sorted[0];
    patterns.push({
      severity: 'info',
      type_label: 'Top Category',
      title: `Top spend: ${topCat}`,
      description: `Your biggest expense category is ${topCat} at $${topAmt.toFixed(0)}.`,
      impact_amount: topAmt,
      action_label: null,
    });
  }

  return {
    patterns,
    biggest_problem: patterns[0] ? {
      title: patterns[0].title,
      description: patterns[0].description,
      action: patterns[0].action_label ?? 'Review your spending',
    } : null,
  };
}

export const analyzeBehavior = async (spendingData: any): Promise<BehaviorAnalysisOutput | null> => {
  // Send only category totals + count — topTransactions can overflow the 4k context
  const trimmedData = {
    categoryTotals: spendingData.categoryTotals,
    transactionCount: spendingData.transactionCount,
  };

  const prompt = `Spending data: ${JSON.stringify(trimmedData)}`;

  try {
    const rawResponse = await callGemmaBase(prompt, BEHAVIORAL_ANALYSIS_PROMPT, {
      temperature: 0.0,
      n_predict: 1024,
      prefill: '{',
    });

    const jsonStr = extractJSONObject(rawResponse);
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as BehaviorAnalysisOutput;
      // Validate it has the expected shape
      if (parsed && Array.isArray(parsed.patterns)) return parsed;
    }
    console.log('[Behavior] Model output unparseable, using rule-based fallback');
  } catch (error) {
    console.log('[Behavior] Model error, using rule-based fallback:', (error as any)?.message);
  }

  return ruleBasedInsights(spendingData);
};
