/**
 * compare.tsx — Month-over-Month Comparison screen
 *
 * Shows two months side-by-side with per-category deltas.
 * Reached from the Insights tab via "Compare Months" button.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TouchableOpacity, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown, TrendingUp, TrendingDown, Minus } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getTransactions } from '../src/db/transactions';
import { Transaction } from '../src/types';
import { useTheme } from '../src/components/ThemeContext';
import { Fonts } from '../src/components/Typography';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CategoryRow {
  category:  string;
  amountA:   number;  // left month
  amountB:   number;  // right month
  delta:     number;  // B - A
  deltaPct:  number;  // (B - A) / A * 100
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function shortMonth(ym: string): string {
  const [, m] = ym.split('-').map(Number);
  return MONTH_NAMES[m - 1].slice(0, 3);
}

function fmt(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtDelta(d: number): string {
  const sign = d >= 0 ? '+' : '−';
  const abs  = Math.abs(d);
  return `${sign}${abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`}`;
}

const CAT_EMOJI: Record<string, string> = {
  'Food & Dining':'🍔','Groceries':'🛒','Transportation':'🚗',
  'Entertainment':'🎬','Health & Fitness':'💪','Shopping':'🛍️',
  'Travel':'✈️','Bills & Utilities':'💡','Subscriptions':'📺',
  'Coffee':'☕','Alcohol':'🍺','Income':'💰','Transfer':'🔄','Other':'📌',
};
const catEmoji = (c: string) => CAT_EMOJI[c] ?? '📌';

function buildCategoryTotals(txs: Transaction[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const t of txs) {
    if (t.type !== 'debit') continue;
    map[t.category] = (map[t.category] || 0) + t.amount;
  }
  return map;
}

function buildRows(
  totalsA: Record<string, number>,
  totalsB: Record<string, number>,
): CategoryRow[] {
  const allCats = new Set([...Object.keys(totalsA), ...Object.keys(totalsB)]);
  const rows: CategoryRow[] = [];
  for (const cat of allCats) {
    const a = totalsA[cat] || 0;
    const b = totalsB[cat] || 0;
    const delta = b - a;
    const deltaPct = a > 0 ? (delta / a) * 100 : b > 0 ? 100 : 0;
    rows.push({ category: cat, amountA: a, amountB: b, delta, deltaPct });
  }
  return rows.sort((a, b) => Math.max(b.amountA, b.amountB) - Math.max(a.amountA, a.amountB));
}

// ─── Month Picker Modal ────────────────────────────────────────────────────────

function MonthPickerModal({
  visible, months, selected, onSelect, onClose, colors,
}: {
  visible: boolean;
  months: string[];
  selected: string;
  onSelect: (m: string) => void;
  onClose: () => void;
  colors: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={mp.overlay} onPress={onClose}>
        <Pressable style={[mp.sheet, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
          <View style={mp.handle} />
          <Text style={[mp.title, { color: colors.text }]}>Select Month</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {months.map(m => (
              <TouchableOpacity
                key={m}
                style={[mp.row, { borderBottomColor: colors.border }, m === selected && { backgroundColor: colors.primary + '15' }]}
                onPress={() => { onSelect(m); onClose(); }}
              >
                <Text style={[mp.rowText, { color: m === selected ? colors.primary : colors.text }]}>
                  {formatMonth(m)}
                </Text>
                {m === selected && <Text style={{ color: colors.primary }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const mp = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 44, borderWidth: 1, maxHeight: '65%' },
  handle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: '#6B7280', alignSelf: 'center', marginBottom: 16 },
  title:    { fontSize: 18, fontFamily: Fonts.bold, marginBottom: 12 },
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText:  { fontSize: 16, fontFamily: Fonts.medium },
});

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function CompareScreen() {
  const router = useRouter();
  const { colors, theme } = useTheme();

  const cardShadow = theme === 'light' ? {
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09, shadowRadius: 22, elevation: 6, borderWidth: 0,
  } : {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10, shadowRadius: 14, elevation: 5,
  };

  const [allTxs,   setAllTxs]   = useState<Transaction[]>([]);
  const [monthA,   setMonthA]   = useState('');
  const [monthB,   setMonthB]   = useState('');
  const [pickerFor, setPickerFor] = useState<'A' | 'B' | null>(null);

  const availableMonths = useMemo(() => {
    const set = new Set(allTxs.map(t => t.date.slice(0, 7)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [allTxs]);

  useFocusEffect(useCallback(() => {
    getTransactions().then(txs => {
      setAllTxs(txs);
      const months = [...new Set(txs.map(t => t.date.slice(0, 7)))].sort((a, b) => b.localeCompare(a));
      if (months.length >= 1 && !monthA) setMonthA(months[0]);
      if (months.length >= 2 && !monthB) setMonthB(months[1]);
    }).catch(console.error);
  }, []));

  // ── Compute per-month data ───────────────────────────────────────────────────

  const txsA = useMemo(() => allTxs.filter(t => t.date.startsWith(monthA)), [allTxs, monthA]);
  const txsB = useMemo(() => allTxs.filter(t => t.date.startsWith(monthB)), [allTxs, monthB]);

  const totalsA = useMemo(() => buildCategoryTotals(txsA), [txsA]);
  const totalsB = useMemo(() => buildCategoryTotals(txsB), [txsB]);

  const totalSpentA = Object.values(totalsA).reduce((s, v) => s + v, 0);
  const totalSpentB = Object.values(totalsB).reduce((s, v) => s + v, 0);
  const totalIncomeA = txsA.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const totalIncomeB = txsB.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);

  const rows = useMemo(() => buildRows(totalsA, totalsB), [totalsA, totalsB]);

  const totalDelta = totalSpentB - totalSpentA;
  const totalDeltaPct = totalSpentA > 0 ? (totalDelta / totalSpentA) * 100 : 0;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const deltaColor = (d: number) =>
    d > 0 ? '#EF4444' : d < 0 ? '#10B981' : colors.textSecondary;

  const DeltaBadge = ({ delta, deltaPct }: { delta: number; deltaPct: number }) => {
    if (Math.abs(delta) < 0.5) {
      return <Minus size={12} color={colors.textSecondary} />;
    }
    const color = deltaColor(delta);
    const Icon  = delta > 0 ? TrendingUp : TrendingDown;
    return (
      <View style={[cmp.deltaBadge, { backgroundColor: color + '15' }]}>
        <Icon size={11} color={color} />
        <Text style={[cmp.deltaText, { color }]}>
          {fmtDelta(delta)}
        </Text>
      </View>
    );
  };

  const hasData = monthA && monthB && (txsA.length > 0 || txsB.length > 0);

  return (
    <SafeAreaView style={[cmp.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={cmp.header}>
        <Pressable onPress={() => router.back()} style={cmp.backBtn}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={[cmp.headerTitle, { color: colors.text }]}>Compare</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Month selectors */}
      <View style={cmp.selectors}>
        {(['A', 'B'] as const).map(side => {
          const month = side === 'A' ? monthA : monthB;
          return (
            <TouchableOpacity
              key={side}
              style={[cmp.selector, { backgroundColor: colors.card, borderColor: colors.border }, cardShadow]}
              onPress={() => setPickerFor(side)}
            >
              <View style={[cmp.selectorDot, { backgroundColor: side === 'A' ? '#3B82F6' : '#8B5CF6' }]} />
              <Text style={[cmp.selectorMonth, { color: colors.text }]} numberOfLines={1}>
                {month ? formatMonth(month) : 'Select month'}
              </Text>
              <ChevronDown size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </View>

      {!hasData ? (
        <View style={cmp.emptyState}>
          <Text style={cmp.emptyIcon}>📊</Text>
          <Text style={[cmp.emptyTitle, { color: colors.text }]}>No data to compare</Text>
          <Text style={[cmp.emptyHint, { color: colors.textSecondary }]}>
            Upload at least two months of statements to enable comparison.
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Summary totals */}
          <View style={[cmp.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }, cardShadow]}>
            <View style={cmp.summaryHeader}>
              <Text style={[cmp.summaryTitle, { color: colors.text }]}>Total Spending</Text>
              <DeltaBadge delta={totalDelta} deltaPct={totalDeltaPct} />
            </View>
            <View style={cmp.summaryRow}>
              <View style={cmp.summaryCol}>
                <View style={cmp.colLabel}>
                  <View style={[cmp.colDot, { backgroundColor: '#3B82F6' }]} />
                  <Text style={[cmp.colMonthLabel, { color: colors.textSecondary }]}>
                    {monthA ? shortMonth(monthA) : '—'}
                  </Text>
                </View>
                <Text style={[cmp.summaryAmt, { color: colors.text }]}>{fmt(totalSpentA)}</Text>
                <Text style={[cmp.incomeLabel, { color: '#10B981' }]}>↑ {fmt(totalIncomeA)} in</Text>
              </View>
              <View style={[cmp.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={cmp.summaryCol}>
                <View style={cmp.colLabel}>
                  <View style={[cmp.colDot, { backgroundColor: '#8B5CF6' }]} />
                  <Text style={[cmp.colMonthLabel, { color: colors.textSecondary }]}>
                    {monthB ? shortMonth(monthB) : '—'}
                  </Text>
                </View>
                <Text style={[cmp.summaryAmt, { color: colors.text }]}>{fmt(totalSpentB)}</Text>
                <Text style={[cmp.incomeLabel, { color: '#10B981' }]}>↑ {fmt(totalIncomeB)} in</Text>
              </View>
            </View>
          </View>

          {/* Section header */}
          <Text style={[cmp.sectionTitle, { color: colors.textSecondary }]}>By Category</Text>

          {/* Category rows */}
          <View style={[cmp.catCard, { backgroundColor: colors.card, borderColor: colors.border }, cardShadow]}>
            {rows.map((row, i) => {
              const maxAmt = Math.max(totalSpentA, totalSpentB, 1);
              const barA   = (row.amountA / maxAmt) * 100;
              const barB   = (row.amountB / maxAmt) * 100;

              return (
                <View
                  key={row.category}
                  style={[
                    cmp.catRow,
                    i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                >
                  {/* Icon + name */}
                  <View style={cmp.catLeft}>
                    <Text style={cmp.catEmoji}>{catEmoji(row.category)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[cmp.catName, { color: colors.text }]} numberOfLines={1}>
                        {row.category}
                      </Text>
                      {/* Mini dual bar */}
                      <View style={cmp.miniBarGroup}>
                        <View style={cmp.miniBarTrack}>
                          <View style={[cmp.miniBarFill, { width: `${barA}%`, backgroundColor: '#3B82F6' }]} />
                        </View>
                        <View style={cmp.miniBarTrack}>
                          <View style={[cmp.miniBarFill, { width: `${barB}%`, backgroundColor: '#8B5CF6' }]} />
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Amounts + delta */}
                  <View style={cmp.catRight}>
                    <View style={cmp.amtPair}>
                      <Text style={[cmp.amtA, { color: colors.text }]}>{fmt(row.amountA)}</Text>
                      <Text style={[cmp.amtSep, { color: colors.border }]}>→</Text>
                      <Text style={[cmp.amtB, { color: colors.text }]}>{fmt(row.amountB)}</Text>
                    </View>
                    <DeltaBadge delta={row.delta} deltaPct={row.deltaPct} />
                  </View>
                </View>
              );
            })}
          </View>

          {/* Net savings comparison */}
          <View style={[cmp.savingsCard, { backgroundColor: colors.card, borderColor: colors.border }, cardShadow]}>
            <Text style={[cmp.savingsTitle, { color: colors.text }]}>Net Savings</Text>
            <View style={cmp.savingsRow}>
              {[
                { label: monthA ? shortMonth(monthA) : '—', income: totalIncomeA, spent: totalSpentA, color: '#3B82F6' },
                { label: monthB ? shortMonth(monthB) : '—', income: totalIncomeB, spent: totalSpentB, color: '#8B5CF6' },
              ].map(item => {
                const savings = item.income - item.spent;
                const pctSaved = item.income > 0 ? (savings / item.income) * 100 : 0;
                return (
                  <View key={item.label} style={cmp.savingsItem}>
                    <View style={cmp.colLabel}>
                      <View style={[cmp.colDot, { backgroundColor: item.color }]} />
                      <Text style={[cmp.colMonthLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                    </View>
                    <Text style={[cmp.savingsAmt, { color: savings >= 0 ? '#10B981' : '#EF4444' }]}>
                      {savings >= 0 ? '+' : '−'}{fmt(Math.abs(savings))}
                    </Text>
                    <Text style={[cmp.savingsPct, { color: colors.textSecondary }]}>
                      {pctSaved.toFixed(1)}% saved
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Month picker modals */}
      <MonthPickerModal
        visible={pickerFor === 'A'}
        months={availableMonths}
        selected={monthA}
        onSelect={setMonthA}
        onClose={() => setPickerFor(null)}
        colors={colors}
      />
      <MonthPickerModal
        visible={pickerFor === 'B'}
        months={availableMonths}
        selected={monthB}
        onSelect={setMonthB}
        onClose={() => setPickerFor(null)}
        colors={colors}
      />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const cmp = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 22, fontFamily: Fonts.serif, letterSpacing: -0.4 },

  // Month selectors
  selectors:    { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 20 },
  selector:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  selectorDot:  { width: 8, height: 8, borderRadius: 4 },
  selectorMonth:{ flex: 1, fontSize: 13, fontFamily: Fonts.semiBold },

  // Empty state
  emptyState:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 },
  emptyIcon:    { fontSize: 48, marginBottom: 16 },
  emptyTitle:   { fontSize: 18, fontFamily: Fonts.semiBold, marginBottom: 8, textAlign: 'center' },
  emptyHint:    { fontSize: 14, fontFamily: Fonts.regular, textAlign: 'center', lineHeight: 20 },

  // Summary card
  summaryCard:    { marginHorizontal: 20, marginBottom: 8, borderRadius: 20, borderWidth: 1, padding: 18 },
  summaryHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  summaryTitle:   { fontSize: 13, fontFamily: Fonts.bold, letterSpacing: 0.5 },
  summaryRow:     { flexDirection: 'row' },
  summaryCol:     { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, marginHorizontal: 8 },
  colLabel:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  colDot:         { width: 8, height: 8, borderRadius: 4 },
  colMonthLabel:  { fontSize: 12, fontFamily: Fonts.medium },
  summaryAmt:     { fontSize: 22, fontFamily: Fonts.bold, letterSpacing: -0.5, marginBottom: 4 },
  incomeLabel:    { fontSize: 11, fontFamily: Fonts.medium },

  // Section header
  sectionTitle:   { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.4, textTransform: 'uppercase', marginHorizontal: 20, marginTop: 16, marginBottom: 10 },

  // Category card
  catCard:        { marginHorizontal: 20, borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  catRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14 },
  catLeft:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 10 },
  catEmoji:       { fontSize: 22, width: 32, textAlign: 'center' },
  catName:        { fontSize: 13, fontFamily: Fonts.semiBold, marginBottom: 6 },
  miniBarGroup:   { gap: 3 },
  miniBarTrack:   { height: 4, borderRadius: 2, backgroundColor: 'rgba(107,114,128,0.15)', overflow: 'hidden', width: '100%' },
  miniBarFill:    { height: 4, borderRadius: 2 },
  catRight:       { alignItems: 'flex-end', gap: 5 },
  amtPair:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amtA:           { fontSize: 12, fontFamily: Fonts.medium },
  amtSep:         { fontSize: 10 },
  amtB:           { fontSize: 12, fontFamily: Fonts.medium },

  // Delta badge
  deltaBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  deltaText:      { fontSize: 11, fontFamily: Fonts.bold },

  // Savings card
  savingsCard:    { marginHorizontal: 20, borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 14 },
  savingsTitle:   { fontSize: 13, fontFamily: Fonts.bold, letterSpacing: 0.5, marginBottom: 16 },
  savingsRow:     { flexDirection: 'row', justifyContent: 'space-around' },
  savingsItem:    { alignItems: 'center', gap: 4 },
  savingsAmt:     { fontSize: 22, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  savingsPct:     { fontSize: 12, fontFamily: Fonts.medium },
});
