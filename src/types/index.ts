export interface Transaction {
  id: string;
  date: string; // ISO format YYYY-MM-DD
  amount: number;
  description: string;
  merchant: string;
  category: string;
  subcategory: string | null;
  is_subscription: boolean;
  is_recurring: boolean;
  type: 'debit' | 'credit';
  bank: string;
  tags?: string;
  notes?: string;
}

export interface Insight {
  id: string;
  severity: 'danger' | 'warning' | 'info';
  type_label: string;
  title: string;
  description: string;
  impact_amount: number | null;
  action_label: string | null;
  created_at: string; // ISO format
}

export interface MonthlySummary {
  id: string;
  month: string; // YYYY-MM
  total_spent: number;
  total_income: number;
  transaction_count: number;
  percentage_change: number;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface CategorizerOutput {
  category: string;
  merchant_clean: string;
  is_subscription: boolean;
  is_recurring: boolean;
}

export interface BiggestProblem {
  title: string;
  description: string;
  action: string;
}

export interface BehaviorPattern {
  severity: 'danger' | 'warning' | 'info';
  type_label: string;
  title: string;
  description: string;
  impact_amount: number;
  action_label: string;
}

export interface BehaviorAnalysisOutput {
  patterns: BehaviorPattern[];
  biggest_problem: BiggestProblem;
}

export interface CashFlowPredictionOutput {
  will_run_short: boolean;
  danger_date: string | null; // DD format or full date
  safe_to_spend: number;
  message: string;
}

export interface SubscriptionLeak {
  merchant: string;
  cost: number;
  unused_days: number;
}

export interface SubscriptionLeakOutput {
  leaks: SubscriptionLeak[];
  total_monthly_leaks: number;
}
