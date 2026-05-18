import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Transaction } from '../types';
import { Calendar } from 'lucide-react-native';
import { useTheme } from './ThemeContext';
import { Fonts } from './Typography';

export interface UpcomingBill {
  merchant: string;
  amount: number;
  daysUntil: number;
  dayOfMonth: number;
}

function monthOf(d: string) { return d.slice(0, 7); }
function sum(arr: number[]) { return arr.reduce((s, v) => s + v, 0); }

export function predictUpcomingBills(txs: Transaction[]): UpcomingBill[] {
  const recurring = txs.filter(t => t.type === 'debit' && (t.is_subscription || t.is_recurring));
  if (!recurring.length) return [];

  const byMerchant: Record<string, Transaction[]> = {};
  for (const t of recurring) {
    (byMerchant[t.merchant] = byMerchant[t.merchant] || []).push(t);
  }

  const today     = new Date();
  const todayDay  = today.getDate();
  const results: UpcomingBill[] = [];

  for (const [merchant, mTxs] of Object.entries(byMerchant)) {
    if (mTxs.length < 1) continue;

    // Find most common day of month
    const dayCounts: Record<number, number> = {};
    for (const t of mTxs) {
      const d = parseInt(t.date.slice(8, 10), 10);
      dayCounts[d] = (dayCounts[d] || 0) + 1;
    }
    const dayOfMonth = parseInt(
      Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0][0],
      10
    );

    // Average amount
    const avgAmount = sum(mTxs.map(t => t.amount)) / mTxs.length;

    // Days until next charge
    let daysUntil = dayOfMonth - todayDay;
    if (daysUntil <= 0) daysUntil += 30;

    results.push({ merchant, amount: avgAmount, daysUntil, dayOfMonth });
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 6);
}

function urgencyColor(days: number): string {
  if (days <= 2)  return '#EF4444';
  if (days <= 7)  return '#F59E0B';
  return '#3B82F6';
}

interface Props {
  txs: Transaction[];
}

export default function BillPredictor({ txs }: Props) {
  const { colors, theme } = useTheme();
  const cardShadow = theme === 'light' ? {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  } : {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  };
  const bills = predictUpcomingBills(txs);
  if (!bills.length) return null;

  return (
    <View>
      <View style={styles.header}>
        <Calendar size={14} color="#3B82F6" />
        <Text style={styles.title}>Upcoming Bills</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {bills.map((bill, i) => {
          const color = urgencyColor(bill.daysUntil);
          return (
            <View key={i} style={[styles.card, { borderColor: `${color}40`, backgroundColor: colors.card }, cardShadow]}>
              {/* Days countdown badge */}
              <View style={[styles.badge, { backgroundColor: `${color}18` }]}>
                <Text style={[styles.badgeDays, { color }]}>{bill.daysUntil}</Text>
                <Text style={[styles.badgeLabel, { color }]}>days</Text>
              </View>
              <Text style={[styles.merchant, { color: colors.text }]} numberOfLines={1}>{bill.merchant}</Text>
              <Text style={[styles.amount, { color: colors.text }]}>${bill.amount.toFixed(2)}</Text>
              <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>on the {bill.dayOfMonth}{ordinal(bill.dayOfMonth)}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  title:       { fontSize: 13, fontFamily: Fonts.bold, color: '#3B82F6', letterSpacing: 0.3 },
  scroll:      { gap: 10, paddingRight: 4 },
  card: {
    width: 116,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  badge:       { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center', marginBottom: 2 },
  badgeDays:   { fontSize: 20, fontFamily: Fonts.bold, lineHeight: 22 },
  badgeLabel:  { fontSize: 9, fontFamily: Fonts.semiBold, letterSpacing: 0.5 },
  merchant:    { fontSize: 11, fontFamily: Fonts.semiBold, textAlign: 'center' },
  amount:      { fontSize: 13, fontFamily: Fonts.bold },
  dateLabel:   { fontSize: 10, fontFamily: Fonts.regular },
});
