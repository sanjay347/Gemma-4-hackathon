import React, { useEffect, useState, useCallback } from 'react';
import { Fonts } from '../../src/components/Typography';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity,
  RefreshControl, Dimensions, FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  TrendingUp, TrendingDown, AlertTriangle, Zap,
  BarChart3, RefreshCw, CreditCard, ShoppingBag,
  Calendar, PieChart, Sparkles, GitCompareArrows,
} from 'lucide-react-native';
import Svg, { Rect, G } from 'react-native-svg';
import { getTransactions } from '../../src/db/transactions';
import { Transaction } from '../../src/types';
import { useTheme } from '../../src/components/ThemeContext';
import OfflineIndicator from '../../src/components/OfflineIndicator';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function sum(arr: number[]) { return arr.reduce((s, v) => s + v, 0); }
function monthOf(d: string) { return d.slice(0, 7); }

function fmt(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function shortMonth(yyyyMM: string) {
  const m = parseInt(yyyyMM.split('-')[1], 10) - 1;
  return MONTH_NAMES[m] ?? yyyyMM;
}

// ─── Analytics engine ─────────────────────────────────────────────────────────

interface Analytics {
  // Overview
  totalSpent: number;
  totalIncome: number;
  savingsRate: number;
  avgDailySpend: number;
  txnCount: number;

  // Category breakdown
  categories: { name: string; amount: number; pct: number; count: number }[];

  // Monthly trend
  monthlySpend: { month: string; amount: number }[];
  momChange: number;        // % change current vs previous month
  currentMonth: string;

  // Subscriptions
  subTotal: number;
  subPct: number;
  topSubs: { merchant: string; amount: number }[];

  // Habits
  weekdayAvg: number;
  weekendAvg: number;
  biggestTx: Transaction | null;
  busiestDOW: string;

  // Alerts
  alerts: { type: 'warning' | 'danger' | 'info'; message: string; detail: string }[];
}

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function computeAnalytics(allTxs: Transaction[], selectedMonth: string): Analytics {
  // For overview/categories/habits: only selected month
  const txs = allTxs.filter(t => monthOf(t.date) === selectedMonth);
  const debits = txs.filter(t => t.type === 'debit');
  const credits = txs.filter(t => t.type === 'credit');
  const totalSpent = sum(debits.map(t => t.amount));
  const totalIncome = sum(credits.map(t => t.amount));
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalSpent) / totalIncome) * 100 : 0;

  // Daily average — days in selected month
  const [y, mo] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const avgDailySpend = daysInMonth > 0 ? totalSpent / daysInMonth : 0;

  // Category breakdown
  const catMap: Record<string, { amount: number; count: number }> = {};
  for (const t of debits) {
    const c = t.category || 'Other';
    if (!catMap[c]) catMap[c] = { amount: 0, count: 0 };
    catMap[c].amount += t.amount;
    catMap[c].count++;
  }
  const categories = Object.entries(catMap)
    .map(([name, v]) => ({ name, amount: v.amount, pct: totalSpent > 0 ? (v.amount / totalSpent) * 100 : 0, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 7);

  // Monthly spending — use ALL transactions for trend chart
  const allDebits = allTxs.filter(t => t.type === 'debit');
  const allMonths = [...new Set(allDebits.map(t => monthOf(t.date)))].sort().reverse().slice(0, 6).reverse();
  const monthlySpend = allMonths.map(m => ({
    month: m,
    amount: sum(allDebits.filter(t => monthOf(t.date) === m).map(t => t.amount)),
  }));

  // MoM: selectedMonth vs previous month
  const prevMonthKey = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
  const thisMonthAmt = totalSpent;
  const lastMonthAmt = sum(allDebits.filter(t => monthOf(t.date) === prevMonthKey).map(t => t.amount));
  const momChange = lastMonthAmt > 0 ? ((thisMonthAmt - lastMonthAmt) / lastMonthAmt) * 100 : 0;

  // Subscriptions
  const subs = debits.filter(t => t.is_subscription || t.is_recurring);
  const subTotal = sum(subs.map(t => t.amount));
  const subPct = totalSpent > 0 ? (subTotal / totalSpent) * 100 : 0;
  const subByMerchant: Record<string, number> = {};
  for (const t of subs) {
    subByMerchant[t.merchant] = (subByMerchant[t.merchant] || 0) + t.amount;
  }
  const topSubs = Object.entries(subByMerchant)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([merchant, amount]) => ({ merchant, amount }));

  // Habits — weekend vs weekday (selected month)
  let weekendSum = 0, weekendCount = 0;
  let weekdaySum = 0, weekdayCount = 0;
  const dowSums: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const t of debits) {
    const d = new Date(t.date + 'T12:00:00').getDay();
    if (d === 0 || d === 6) { weekendSum += t.amount; weekendCount++; }
    else { weekdaySum += t.amount; weekdayCount++; }
    dowSums[d] += t.amount;
  }
  const weekendAvg = weekendCount > 0 ? weekendSum / weekendCount : 0;
  const weekdayAvg = weekdayCount > 0 ? weekdaySum / weekdayCount : 0;
  const busiestDOWIdx = dowSums.indexOf(Math.max(...dowSums));
  const busiestDOW = DOW[busiestDOWIdx] ?? 'N/A';

  // Biggest transaction
  const biggestTx = debits.length > 0 ? debits.reduce((a, b) => b.amount > a.amount ? b : a) : null;

  // Alerts
  const alerts: Analytics['alerts'] = [];

  if (momChange > 20) {
    alerts.push({
      type: 'danger',
      message: `Spending spike: ${pct(momChange)} vs last month`,
      detail: `You spent ${fmt(thisMonthAmt)} this month vs ${fmt(lastMonthAmt)} last month.`,
    });
  } else if (momChange > 10) {
    alerts.push({
      type: 'warning',
      message: `Spending up ${pct(momChange)} this month`,
      detail: `Monitor your ${categories[0]?.name ?? 'top'} category — it's your biggest driver.`,
    });
  } else if (momChange < -10) {
    alerts.push({
      type: 'info',
      message: `Great job! Spending down ${pct(Math.abs(momChange))}`,
      detail: `You saved ${fmt(lastMonthAmt - thisMonthAmt)} compared to last month.`,
    });
  }

  if (subPct > 20) {
    alerts.push({
      type: 'warning',
      message: `Subscriptions eat ${subPct.toFixed(0)}% of spending`,
      detail: `${fmt(subTotal)} in recurring charges. Review if all are still needed.`,
    });
  }

  if (savingsRate < 10 && totalIncome > 0) {
    alerts.push({
      type: 'danger',
      message: 'Savings rate is below 10%',
      detail: `You're saving only ${savingsRate.toFixed(1)}% of income. Aim for at least 20%.`,
    });
  } else if (savingsRate >= 20 && totalIncome > 0) {
    alerts.push({
      type: 'info',
      message: `Solid savings rate: ${savingsRate.toFixed(1)}%`,
      detail: 'You\'re on track. Consider putting excess into an index fund.',
    });
  }

  if (weekendAvg > weekdayAvg * 2 && weekendCount > 0) {
    alerts.push({
      type: 'warning',
      message: 'Weekend spending is 2× your weekday average',
      detail: `Weekend avg: ${fmt(weekendAvg)}/txn vs ${fmt(weekdayAvg)}/txn on weekdays.`,
    });
  }

  return {
    totalSpent, totalIncome, savingsRate, avgDailySpend, txnCount: debits.length,
    categories, monthlySpend, momChange, currentMonth: selectedMonth,
    subTotal, subPct, topSubs,
    weekdayAvg, weekendAvg, biggestTx, busiestDOW,
    alerts,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const CAT_COLORS = [
  '#3B82F6','#8B5CF6','#EC4899','#F59E0B',
  '#06B6D4','#EF4444','#F97316',
];

function AlertBanner({ alert }: { alert: Analytics['alerts'][0] }) {
  const bgMap = {
    danger:  { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  color: '#EF4444' },
    warning: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#F59E0B' },
    info:    { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', color: '#3B82F6' },
  }[alert.type];

  const Icon = alert.type === 'danger' ? AlertTriangle
    : alert.type === 'warning' ? AlertTriangle
    : Sparkles;

  return (
    <View style={[alertStyles.card, { backgroundColor: bgMap.bg, borderColor: bgMap.border }]}>
      <Icon size={14} color={bgMap.color} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[alertStyles.msg, { color: bgMap.color }]}>{alert.message}</Text>
        <Text style={alertStyles.detail}>{alert.detail}</Text>
      </View>
    </View>
  );
}

const alertStyles = StyleSheet.create({
  card:   { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'flex-start', marginBottom: 10 },
  msg:    { fontSize: 13, fontFamily: Fonts.semiBold },
  detail: { fontSize: 12, fontFamily: Fonts.regular, color: '#9CA3AF', lineHeight: 17 },
});

function CategoryBars({ categories, total, colors }: {
  categories: Analytics['categories'];
  total: number;
  colors: any;
}) {
  return (
    <View style={{ gap: 11 }}>
      {categories.map((c, i) => (
        <View key={c.name} style={{ gap: 5 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={1}>{c.name}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>{c.pct.toFixed(1)}%</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, minWidth: 60, textAlign: 'right' }}>{fmt(c.amount)}</Text>
            </View>
          </View>
          <View style={{ height: 6, backgroundColor: 'rgba(107,114,128,0.14)', borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ height: 6, width: `${Math.min(c.pct, 100)}%`, backgroundColor: CAT_COLORS[i % CAT_COLORS.length], borderRadius: 3 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function MiniBarChart({ data, currentMonth }: { data: Analytics['monthlySpend']; currentMonth: string }) {
  // Always render 6 slots — pad with empty months on the left if needed
  const SLOTS   = 6;
  const Y_AXIS  = 36; // y-axis column width
  const BAR_W   = 28;
  const chartH  = 80;
  const padded  = Array.from({ length: SLOTS }, (_, i) => {
    return data[i - (SLOTS - data.length)] ?? { month: `pad-${i}`, amount: 0 };
  });
  const maxAmt = Math.max(...padded.map(d => d.amount), 1);
  // gap adjusted to leave room for y-axis column
  const gap = Math.max((SCREEN_W - 88 - Y_AXIS - 8 - BAR_W * SLOTS) / (SLOTS - 1), 4);

  function fmtY(n: number) {
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
    return `$${Math.round(n)}`;
  }

  return (
    <View>
      {/* Chart row: y-axis labels + bars */}
      <View style={{ flexDirection: 'row' }}>
        {/* Y-axis labels */}
        <View style={{ width: Y_AXIS, height: chartH, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, paddingBottom: 2 }}>
          <Text style={{ fontSize: 9, color: '#9CA3AF', fontFamily: Fonts.regular }}>{fmtY(maxAmt)}</Text>
          <Text style={{ fontSize: 9, color: '#9CA3AF', fontFamily: Fonts.regular }}>{fmtY(maxAmt / 2)}</Text>
          <Text style={{ fontSize: 9, color: '#9CA3AF', fontFamily: Fonts.regular }}>$0</Text>
        </View>

        {/* Bars row */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap, height: chartH }}>
          {padded.map((d, i) => {
            const h = d.amount > 0 ? Math.max((d.amount / maxAmt) * chartH, 6) : 3;
            const isCurr = d.month === currentMonth;
            const isPad  = d.month.startsWith('pad-');
            return (
              <View
                key={d.month + i}
                style={{
                  width: BAR_W,
                  height: h,
                  borderRadius: 8,
                  backgroundColor: isPad
                    ? 'rgba(107,114,128,0.1)'
                    : isCurr ? '#3B82F6' : 'rgba(59,130,246,0.28)',
                }}
              />
            );
          })}
        </View>
      </View>

      {/* X-axis labels — aligned to bars, offset by y-axis width */}
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        <View style={{ width: Y_AXIS }} />
        <View style={{ flex: 1, flexDirection: 'row', gap }}>
          {padded.map((d, i) => {
            const isCurr = d.month === currentMonth;
            const isPad  = d.month.startsWith('pad-');
            return (
              <Text
                key={d.month + i}
                style={{
                  width: BAR_W,
                  fontSize: 10,
                  textAlign: 'center',
                  fontFamily: isCurr ? Fonts.bold : Fonts.regular,
                  color: isPad ? 'transparent' : isCurr ? '#3B82F6' : '#9CA3AF',
                }}
              >
                {isPad ? '' : shortMonth(d.month)}
              </Text>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, colors, isLight }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; colors: any; isLight?: boolean;
}) {
  const lightShadow = isLight ? {
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 6,
  } : {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 5,
  };

  return (
    <View style={[cardStyles.card, {
      backgroundColor: colors.card,
      borderColor: colors.border,
    }, lightShadow]}>
      <View style={cardStyles.header}>
        <View style={[cardStyles.iconBox, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>{icon}</View>
        <Text style={[cardStyles.title, { color: colors.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  iconBox: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 16, fontFamily: Fonts.serifSemi, letterSpacing: -0.1 },
});

export default function InsightsScreen() {
  const { colors, theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [allTxs, setAllTxs] = useState<Transaction[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  const loadData = useCallback(async () => {
    try {
      const txs = await getTransactions();
      setAllTxs(txs);
      // Build sorted month list (most recent first)
      const months = [...new Set(txs.map(t => monthOf(t.date)))].sort().reverse();
      setAvailableMonths(months);
      // Default to most recent month that has data, or current month
      const defaultMonth = months[0] ?? new Date().toISOString().slice(0, 7);
      setSelectedMonth(prev => {
        const m = months.includes(prev) ? prev : defaultMonth;
        setAnalytics(computeAnalytics(txs, m));
        return m;
      });
    } catch (e) { console.error(e); }
  }, []);

  // Recompute when month selection changes
  const handleSelectMonth = useCallback((month: string) => {
    setSelectedMonth(month);
    setAnalytics(computeAnalytics(allTxs, month));
  }, [allTxs]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const isDark = theme === 'dark';
  const a = analytics;
  const router = useRouter();

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={[s.title, { color: colors.text }]}>Insights</Text>
          <Text style={[s.subtitle, { color: colors.textSecondary }]}>
            {a ? `${a.txnCount} transactions analyzed` : 'Analyzing your data...'}
          </Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity
            style={[s.compareBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/compare')}
            activeOpacity={0.75}
          >
            <GitCompareArrows size={14} color={colors.primary} />
            <Text style={[s.compareBtnText, { color: colors.primary }]}>Compare</Text>
          </TouchableOpacity>
          <OfflineIndicator text="on‑device" />
        </View>
      </View>

      {/* Month picker */}
      {availableMonths.length > 0 && (
        <FlatList
          data={availableMonths}
          keyExtractor={m => m}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.monthBarList}
          contentContainerStyle={s.monthBar}
          renderItem={({ item: m }) => {
            const isSelected = m === selectedMonth;
            return (
              <Pressable
                onPress={() => handleSelectMonth(m)}
                style={[
                  s.monthChip,
                  isSelected
                    ? { backgroundColor: '#3B82F6' }
                    : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[
                  s.monthChipText,
                  { color: isSelected ? '#FFFFFF' : colors.textSecondary },
                ]}>
                  {shortMonth(m)} {m.slice(0, 4)}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {!a ? (
          <View style={s.empty}>
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>Upload a bank statement to see insights.</Text>
          </View>
        ) : (
          <>
            {/* ── Snapshot strip ── */}
            <View style={s.snapshotRow}>
              {[
                {
                  label: 'Savings Rate',
                  value: `${a.savingsRate.toFixed(1)}%`,
                  sub: a.savingsRate >= 20 ? '🎯 On track' : a.savingsRate >= 10 ? '⚠️ Low' : '🔴 Critical',
                  color: a.savingsRate >= 20 ? '#3B82F6' : a.savingsRate >= 10 ? '#F59E0B' : '#EF4444',
                },
                {
                  label: 'Daily Avg',
                  value: fmt(a.avgDailySpend),
                  sub: 'per day',
                  color: '#8B5CF6',
                },
                {
                  label: 'Subscriptions',
                  value: fmt(a.subTotal),
                  sub: `${a.subPct.toFixed(0)}% of spend`,
                  color: '#F59E0B',
                },
              ].map(item => (
                <View key={item.label} style={[s.snapCard, {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }, theme === 'light' ? {
                  borderWidth: 0,
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 5 },
                  shadowOpacity: 0.09,
                  shadowRadius: 18,
                  elevation: 5,
                } : {
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.10,
                  shadowRadius: 10,
                  elevation: 4,
                }]}>
                  <Text style={[s.snapValue, { color: item.color }]}>{item.value}</Text>
                  <Text style={[s.snapLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                  <Text style={[s.snapSub, { color: colors.textSecondary }]}>{item.sub}</Text>
                </View>
              ))}
            </View>

            {/* ── Alerts ── */}
            {a.alerts.length > 0 && (
              <SectionCard isLight={theme === 'light'} title="Smart Alerts" icon={<Zap size={16} color="#3B82F6" />} colors={colors}>
                {a.alerts.map((alert, i) => <AlertBanner key={i} alert={alert} />)}
              </SectionCard>
            )}

            {/* ── Month over month ── */}
            {a.monthlySpend.length >= 2 && (
              <SectionCard isLight={theme === 'light'} title="Monthly Trend" icon={<BarChart3 size={16} color="#3B82F6" />} colors={colors}>
                <MiniBarChart data={a.monthlySpend} currentMonth={a.currentMonth} />
                <View style={[s.momBadge, {
                  backgroundColor: a.momChange > 5 ? 'rgba(239,68,68,0.1)' : a.momChange < -5 ? 'rgba(59,130,246,0.1)' : 'rgba(107,114,128,0.1)',
                  borderColor: a.momChange > 5 ? 'rgba(239,68,68,0.25)' : a.momChange < -5 ? 'rgba(59,130,246,0.25)' : 'rgba(107,114,128,0.2)',
                }]}>
                  {a.momChange > 0
                    ? <TrendingUp size={13} color={a.momChange > 5 ? '#EF4444' : '#F59E0B'} />
                    : <TrendingDown size={13} color="#3B82F6" />}
                  <Text style={[s.momText, {
                    color: a.momChange > 5 ? '#EF4444' : a.momChange < -5 ? '#3B82F6' : '#9CA3AF',
                  }]}>
                    {a.momChange >= 0 ? '+' : ''}{a.momChange.toFixed(1)}% vs last month
                  </Text>
                </View>
              </SectionCard>
            )}

            {/* ── Category breakdown ── */}
            {a.categories.length > 0 && (
              <SectionCard isLight={theme === 'light'} title="Spending Breakdown" icon={<PieChart size={16} color="#3B82F6" />} colors={colors}>
                <CategoryBars categories={a.categories} total={a.totalSpent} colors={colors} />
              </SectionCard>
            )}

            {/* ── Habits ── */}
            <SectionCard isLight={theme === 'light'} title="Habits & Patterns" icon={<Calendar size={16} color="#3B82F6" />} colors={colors}>
              <View style={s.habitsGrid}>
                {/* Weekend vs weekday */}
                <View style={[s.habitCard, { backgroundColor: isDark ? 'rgba(59,130,246,0.07)' : colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={[s.habitLabel, { color: colors.textSecondary }]}>Weekday avg</Text>
                  <Text style={[s.habitValue, { color: colors.text }]}>{fmt(a.weekdayAvg)}</Text>
                  <Text style={[s.habitSub, { color: colors.textSecondary }]}>per transaction</Text>
                </View>
                <View style={[s.habitCard, { backgroundColor: isDark ? 'rgba(139,92,246,0.07)' : colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={[s.habitLabel, { color: colors.textSecondary }]}>Weekend avg</Text>
                  <Text style={[s.habitValue, { color: colors.text }]}>{fmt(a.weekendAvg)}</Text>
                  <Text style={[s.habitSub, { color: colors.textSecondary }]}>per transaction</Text>
                </View>
                <View style={[s.habitCard, { backgroundColor: isDark ? 'rgba(245,158,11,0.07)' : colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={[s.habitLabel, { color: colors.textSecondary }]}>Busiest day</Text>
                  <Text style={[s.habitValue, { color: colors.text }]}>{a.busiestDOW}</Text>
                  <Text style={[s.habitSub, { color: colors.textSecondary }]}>most spending</Text>
                </View>
                <View style={[s.habitCard, { backgroundColor: isDark ? 'rgba(239,68,68,0.07)' : colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={[s.habitLabel, { color: colors.textSecondary }]}>Biggest txn</Text>
                  <Text style={[s.habitValue, { color: colors.text }]} numberOfLines={1}>
                    {a.biggestTx ? fmt(a.biggestTx.amount) : '—'}
                  </Text>
                  <Text style={[s.habitSub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {a.biggestTx?.merchant ?? ''}
                  </Text>
                </View>
              </View>
            </SectionCard>

            {/* ── Subscriptions ── */}
            {a.topSubs.length > 0 && (
              <SectionCard isLight={theme === 'light'} title="Recurring Charges" icon={<RefreshCw size={16} color="#3B82F6" />} colors={colors}>
                <View style={s.subHeader}>
                  <Text style={[s.subTotal, { color: '#3B82F6' }]}>{fmt(a.subTotal)}</Text>
                  <Text style={[s.subLabel, { color: colors.textSecondary }]}>/ month in subscriptions</Text>
                </View>
                <View style={{ gap: 10, marginTop: 12 }}>
                  {a.topSubs.map((sub, i) => (
                    <View key={sub.merchant} style={[s.subRow, { borderBottomColor: colors.border }]}>
                      <View style={[s.subIcon, { backgroundColor: `${CAT_COLORS[i % CAT_COLORS.length]}18` }]}>
                        <CreditCard size={13} color={CAT_COLORS[i % CAT_COLORS.length]} />
                      </View>
                      <Text style={[s.subName, { color: colors.text }]} numberOfLines={1}>{sub.merchant}</Text>
                      <Text style={[s.subAmt, { color: colors.text }]}>{fmt(sub.amount)}</Text>
                    </View>
                  ))}
                </View>
              </SectionCard>
            )}

            {/* ── Income vs Spend ── */}
            {a.totalIncome > 0 && (
              <SectionCard isLight={theme === 'light'} title="Income vs Spending" icon={<TrendingUp size={16} color="#3B82F6" />} colors={colors}>
                <View style={s.incomeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.incomeLabel, { color: colors.textSecondary }]}>Income</Text>
                    <Text style={[s.incomeValue, { color: '#10B981' }]}>{fmt(a.totalIncome)}</Text>
                  </View>
                  <View style={[s.incomeDivider, { backgroundColor: colors.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={[s.incomeLabel, { color: colors.textSecondary }]}>Spent</Text>
                    <Text style={[s.incomeValue, { color: '#EF4444' }]}>{fmt(a.totalSpent)}</Text>
                  </View>
                </View>
                {/* Net bar */}
                <View style={[s.netBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.cardAlt }]}>
                  <View style={[s.netFill, {
                    width: `${Math.min((a.totalIncome / Math.max(a.totalIncome, a.totalSpent)) * 100, 100)}%`,
                    backgroundColor: a.totalIncome >= a.totalSpent ? '#10B981' : '#EF4444',
                  }]} />
                </View>
                <Text style={[s.netLabel, { color: a.totalIncome >= a.totalSpent ? '#10B981' : '#EF4444' }]}>
                  {a.totalIncome >= a.totalSpent
                    ? `Net +${fmt(a.totalIncome - a.totalSpent)} saved`
                    : `Net −${fmt(a.totalSpent - a.totalIncome)} overspent`}
                </Text>
              </SectionCard>
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20,
  },
  title:       { fontSize: 28, fontFamily: Fonts.serif, letterSpacing: -0.5 },
  subtitle:    { fontSize: 13, marginTop: 4, fontFamily: Fonts.medium },
  headerRight: { alignItems: 'flex-end', gap: 8 },
  compareBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1,
  },
  compareBtnText: { fontSize: 12, fontFamily: Fonts.semiBold },
  scroll:   { flex: 1 },
  content:  { paddingHorizontal: 20 },

  // Month picker
  monthBarList:  { flexGrow: 0, height: 44 },
  monthBar:      { paddingHorizontal: 20, paddingBottom: 6, gap: 8, alignItems: 'center' },
  monthChip:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, alignSelf: 'flex-start' },
  monthChipText: { fontSize: 13, fontFamily: Fonts.semiBold },

  // Empty
  empty:     { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, fontFamily: Fonts.regular, textAlign: 'center', lineHeight: 22 },

  // Snapshot
  snapshotRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  snapCard: {
    flex: 1, borderRadius: 20, padding: 16, borderWidth: 1, gap: 4,
  },
  snapValue:  { fontSize: 20, fontFamily: Fonts.serif, letterSpacing: -0.3 },
  snapLabel:  { fontSize: 11, fontFamily: Fonts.semiBold, letterSpacing: 0.2 },
  snapSub:    { fontSize: 11, fontFamily: Fonts.regular, marginTop: 2 },

  // Mom badge
  momBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginTop: 14 },
  momText:  { fontSize: 13, fontFamily: Fonts.semiBold },

  // Habits
  habitsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  habitCard:   { width: '47%', borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  habitLabel:  { fontSize: 12, fontFamily: Fonts.semiBold },
  habitValue:  { fontSize: 22, fontFamily: Fonts.serif, letterSpacing: -0.3 },
  habitSub:    { fontSize: 11, fontFamily: Fonts.regular },

  // Subscriptions
  subHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  subTotal:  { fontSize: 30, fontFamily: Fonts.serif, letterSpacing: -0.5 },
  subLabel:  { fontSize: 13, fontFamily: Fonts.regular },
  subRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  subIcon:   { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  subName:   { flex: 1, fontSize: 13, fontFamily: Fonts.semiBold },
  subAmt:    { fontSize: 13, fontFamily: Fonts.semiBold },

  // Income
  incomeRow:     { flexDirection: 'row', alignItems: 'center' },
  incomeLabel:   { fontSize: 12, fontFamily: Fonts.medium, marginBottom: 3 },
  incomeValue:   { fontSize: 22, fontFamily: Fonts.serif, letterSpacing: -0.3 },
  incomeDivider: { width: 1, height: 44, marginHorizontal: 16 },
  netBar:        { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 16 },
  netFill:       { height: 8, borderRadius: 4 },
  netLabel:      { fontSize: 12, fontFamily: Fonts.semiBold, marginTop: 8, textAlign: 'center' },
});
