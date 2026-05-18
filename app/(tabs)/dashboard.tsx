import React, { useState, useCallback } from 'react';
import { Fonts } from '../../src/components/Typography';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  Pressable, Modal, TouchableOpacity, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  TrendingUp, TrendingDown, ChevronDown, Check,
  ChevronRight, Search, CalendarDays, CreditCard,
  BarChart3, List, Target, Wallet, Info,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import OfflineIndicator from '../../src/components/OfflineIndicator';
import { DashboardSkeleton } from '../../src/components/Skeleton';
import InsightCard from '../../src/components/InsightCard';
import AnimatedNumber from '../../src/components/AnimatedNumber';
import HealthScoreRing, { computeHealthScore } from '../../src/components/HealthScoreRing';
import SpendingBarChart from '../../src/components/SpendingBarChart';
import DonutChart, { DonutSlice } from '../../src/components/DonutChart';
import BillPredictor from '../../src/components/BillPredictor';

import { getInsights, getTransactions, getBudgets, getRollover, getUserProfile, Budget } from '../../src/db/transactions';
import { Insight, Transaction } from '../../src/types';
import { useTheme } from '../../src/components/ThemeContext';
import { BANK_LABELS, BankType } from '../../src/parsers/index';

interface BudgetWithSpend extends Budget { spent: number; rollover: number }

const CATEGORY_COLORS = [
  '#3B82F6','#8B5CF6','#EC4899','#F59E0B',
  '#06B6D4','#EF4444','#F97316','#10B981',
];

function prevMonthPrefix(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={sh.row}>
      <Text style={[sh.title, { color: colors.text }]}>{title}</Text>
      {action && onAction && (
        <Pressable onPress={onAction} style={sh.btn}>
          <Text style={[sh.btnText, { color: colors.primary }]}>{action}</Text>
          <ChevronRight size={14} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  row:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title:   { fontSize: 17, fontFamily: Fonts.serifSemi, letterSpacing: -0.1 },
  btn:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  btnText: { fontSize: 13, fontFamily: Fonts.semiBold },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [allTxs, setAllTxs]                   = useState<Transaction[]>([]);
  const [filteredTxs, setFilteredTxs]         = useState<Transaction[]>([]);
  const [topInsight, setTopInsight]           = useState<Insight | null>(null);
  const [availableBanks, setAvailableBanks]   = useState<string[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [bankFilter, setBankFilter]           = useState('all');
  const [monthFilter, setMonthFilter]         = useState('latest');
  const [showBankPicker, setShowBankPicker]   = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [budgetsWithSpend, setBudgetsWithSpend] = useState<BudgetWithSpend[]>([]);
  const [aiName, setAiName]                   = useState('');

  // Derived from filteredTxs
  const [latestMonth, setLatestMonth] = useState('');

  const currentMonth = new Date().toISOString().substring(0, 7);

  const card = theme === 'light' ? {
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

  const chipShadow = theme === 'light' ? {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  } : {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  };

  const reload = useCallback(async (bank = bankFilter, month = monthFilter) => {
    try {
      const [txs, insights, allBudgets] = await Promise.all([
        getTransactions(),
        getInsights(),
        getBudgets(),
      ]);
      setAllTxs(txs);
      setTopInsight(insights[0] ?? null);

      const banks  = [...new Set(txs.map(t => t.bank))];
      const months = [...new Set(txs.map(t => t.date.substring(0, 7)))].sort().reverse();
      setAvailableBanks(banks);
      setAvailableMonths(months);

      const bankFiltered = bank === 'all' ? txs : txs.filter(t => t.bank === bank);
      const latest = month !== 'latest'
        ? month
        : (bankFiltered.length > 0 ? bankFiltered : txs)
            .map(t => t.date).sort().reverse()[0]?.substring(0, 7) ?? currentMonth;
      setLatestMonth(latest);

      const monthTxs = bankFiltered.filter(t => t.date.startsWith(latest));
      setFilteredTxs(monthTxs);

      // Budgets
      if (allBudgets.length > 0) {
        const monthDebits = txs.filter(t => t.date.startsWith(currentMonth) && t.type === 'debit');
        const spendMap: Record<string, number> = {};
        for (const t of monthDebits) spendMap[t.category] = (spendMap[t.category] || 0) + t.amount;
        const withSpend = await Promise.all(
          allBudgets.map(async b => ({
            ...b,
            spent:    spendMap[b.category] || 0,
            rollover: await getRollover(b.category, currentMonth),
          }))
        );
        setBudgetsWithSpend(withSpend);
      } else {
        setBudgetsWithSpend([]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [currentMonth]);

  useFocusEffect(useCallback(() => {
    reload();
    getUserProfile().then(p => { if (p.ai_name) setAiName(p.ai_name); });
  }, [reload]));

  // ── Derived metrics ────────────────────────────────────────────────────────
  const debits  = filteredTxs.filter(t => t.type === 'debit');
  const credits = filteredTxs.filter(t => t.type === 'credit');
  const totalSpent  = debits.reduce((s, t) => s + t.amount, 0);
  const totalIncome = credits.reduce((s, t) => s + t.amount, 0);

  const prevMonth = latestMonth ? prevMonthPrefix(latestMonth) : '';
  const prevTxs   = allTxs.filter(t =>
    t.date.startsWith(prevMonth) && (bankFilter === 'all' || t.bank === bankFilter)
  );
  const prevSpent = prevTxs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const pctChange = prevSpent > 0 ? ((totalSpent - prevSpent) / prevSpent) * 100 : 0;

  // Month label
  const displayMonth = latestMonth
    ? new Date(latestMonth + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  // Donut slices
  const catMap: Record<string, number> = {};
  debits.forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
  const donutSlices: DonutSlice[] = Object.entries(catMap)
    .sort(([, a], [, b]) => b - a)
    .map(([label, amount], i) => ({
      label, amount,
      percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));

  // Daily budget — respect the displayed month, not always "today"
  const now = new Date();
  const isCurrentMonth = !latestMonth || latestMonth === currentMonth;

  const daysInMonth = (() => {
    if (!latestMonth) return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const [y, m] = latestMonth.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  })();

  // For the current month: days still to go. For a past month: 0 (complete).
  const daysRemaining = isCurrentMonth
    ? Math.max(daysInMonth - now.getDate(), 1)
    : 0;

  // Days that have actually passed (used for avg-daily-spend on past months)
  const daysPassed = isCurrentMonth ? now.getDate() : daysInMonth;

  const remaining    = totalIncome - totalSpent;
  // $/day remaining (only meaningful for current month with income data)
  const dailyBudget  = totalIncome > 0 && daysRemaining > 0
    ? remaining / daysRemaining
    : 0;
  // Avg $/day spent (shown for past months)
  const avgDailySpend = daysPassed > 0 ? totalSpent / daysPassed : 0;
  const spentPct      = totalIncome > 0 ? Math.min(totalSpent / totalIncome, 1) : 0;
  const isHealthy     = remaining >= 0;

  const bankLabel = bankFilter === 'all' ? 'All Banks' : (BANK_LABELS[bankFilter as BankType] ?? bankFilter);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Bank picker modal ─────────────────────────────────────────────── */}
      <Modal visible={showBankPicker} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowBankPicker(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>View by bank</Text>
            {['all', ...availableBanks].map(bank => (
              <TouchableOpacity key={bank}
                style={[styles.sheetRow, { borderBottomColor: colors.border }]}
                onPress={() => { setBankFilter(bank); setShowBankPicker(false); reload(bank, monthFilter); }}>
                <Text style={[styles.sheetRowLabel, { color: colors.text }]}>
                  {bank === 'all' ? 'All Banks (Combined)' : BANK_LABELS[bank as BankType] ?? bank}
                </Text>
                {bankFilter === bank && <Check size={16} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Month picker modal ────────────────────────────────────────────── */}
      <Modal visible={showMonthPicker} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowMonthPicker(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Select month</Text>
            {['latest', ...availableMonths].map(m => {
              const lbl = m === 'latest' ? 'Latest' : (() => {
                const [y, mo] = m.split('-').map(Number);
                return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              })();
              return (
                <TouchableOpacity key={m}
                  style={[styles.sheetRow, { borderBottomColor: colors.border }]}
                  onPress={() => { setMonthFilter(m); setShowMonthPicker(false); reload(bankFilter, m); }}>
                  <Text style={[styles.sheetRowLabel, { color: colors.text }]}>{lbl}</Text>
                  {monthFilter === m && <Check size={16} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Dashboard</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>{displayMonth}</Text>
        </View>
        <OfflineIndicator text="on device" />
      </View>

      {/* ── Filter chips ──────────────────────────────────────────────────── */}
      <View style={styles.filterRow}>
        <Pressable style={[styles.filterChip, { backgroundColor: colors.card, borderColor: theme === 'light' ? 'transparent' : colors.border }, chipShadow]}
          onPress={() => setShowBankPicker(true)}>
          <Text style={[styles.filterChipText, { color: colors.text }]}>{bankLabel}</Text>
          <ChevronDown size={14} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={[styles.filterChip, { backgroundColor: colors.card, borderColor: theme === 'light' ? 'transparent' : colors.border }, chipShadow]}
          onPress={() => setShowMonthPicker(true)}>
          <Text style={[styles.filterChipText, { color: colors.text }]}>{displayMonth}</Text>
          <ChevronDown size={14} color={colors.textSecondary} />
        </Pressable>
      </View>

      {loading ? (
        <DashboardSkeleton />
      ) : (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={colors.primary}
            onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />
        }
      >
        {/* ── 1. Financial Health Score ──────────────────────────────────── */}
        {allTxs.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: 'rgba(59,130,246,0.25)' }, card, styles.section]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitleWhite}>Financial Health</Text>
              <View style={styles.liveTag}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
              <HealthScoreRing txs={allTxs} />
            </View>
          </View>
        )}

        {/* ── 2. Spent this period (animated) — inside a card ──────────── */}
        <View style={[styles.spentCard, { backgroundColor: colors.card, borderColor: colors.border }, card, styles.section]}>
          <View style={styles.spentRow}>
            <View style={styles.spentLeft}>
              <Text style={[styles.spentLabel, { color: colors.textSecondary }]}>Spent this period</Text>
              <AnimatedNumber
                value={totalSpent}
                prefix="$"
                decimals={2}
                duration={1000}
                style={[styles.amountText, { color: colors.text }]}
              />
              <View style={styles.changeRow}>
                {pctChange > 0
                  ? <TrendingUp size={14} color={colors.danger} />
                  : <TrendingDown size={14} color={colors.primary} />}
                <Text style={[styles.changeText, { color: pctChange > 0 ? colors.danger : colors.primary }]}>
                  {Math.abs(pctChange).toFixed(1)}% vs last month
                </Text>
              </View>
            </View>
            <View style={styles.spentRight}>
              <View style={[styles.miniStat, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.miniStatLabel, { color: colors.textSecondary }]}>Income</Text>
                <AnimatedNumber
                  value={totalIncome}
                  prefix="$"
                  decimals={0}
                  duration={900}
                  style={[styles.miniStatValue, { color: colors.primary }]}
                />
              </View>
              <View style={[styles.miniStat, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.miniStatLabel, { color: colors.textSecondary }]}>Txns</Text>
                <Text style={[styles.miniStatValue, { color: colors.text }]}>{filteredTxs.length}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 3. Spending Card ───────────────────────────────────────────── */}
        <View style={[styles.spendingCard, { backgroundColor: colors.card, borderColor: colors.border }, card, styles.section]}>
          {/* Top row: wallet icon/label + daily pill */}
          <View style={styles.spendingTop}>
            <View style={styles.spendingIconLabel}>
              <Wallet size={20} color={colors.textSecondary} />
              <Text style={[styles.spendingWordLabel, { color: colors.textSecondary }]}>Spending</Text>
            </View>
            {/* Daily rate pill — green when healthy, red when over budget, grey for past months */}
            {(isCurrentMonth && totalIncome > 0) ? (
              <View style={[styles.dailyPill, {
                backgroundColor: isHealthy ? 'rgba(16,185,129,0.13)' : 'rgba(239,68,68,0.1)',
                borderColor: isHealthy ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.3)',
              }]}>
                <Text style={[styles.dailyPillText, { color: isHealthy ? '#10B981' : colors.danger }]}>
                  ${Math.abs(dailyBudget).toFixed(0)}/day for {daysRemaining}d
                </Text>
                <Info size={13} color={isHealthy ? '#10B981' : colors.danger} />
              </View>
            ) : !isCurrentMonth ? (
              <View style={[styles.dailyPill, { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' }]}>
                <Text style={[styles.dailyPillText, { color: '#10B981' }]}>
                  ${avgDailySpend.toFixed(0)}/day avg
                </Text>
              </View>
            ) : null}
          </View>

          {/* Main headline */}
          {totalIncome > 0 ? (
            <AnimatedNumber
              value={Math.max(remaining, 0)}
              prefix="$"
              decimals={0}
              duration={1100}
              suffix=" left to spend"
              style={[styles.spendingHeadline, {
                color: isHealthy ? colors.text : colors.danger,
              }]}
            />
          ) : (
            <AnimatedNumber
              value={totalSpent}
              prefix="$"
              decimals={0}
              duration={1100}
              suffix=" spent"
              style={[styles.spendingHeadline, { color: colors.text }]}
            />
          )}

          {/* Progress bar */}
          <View style={[styles.spendingTrack, { backgroundColor: theme === 'dark' ? '#1C2333' : '#E4E8F7' }]}>
            <View style={[styles.spendingFill, {
              width: `${Math.min(spentPct, 1) * 100}%`,
              backgroundColor: spentPct > 0.9 ? colors.danger : spentPct > 0.7 ? '#F59E0B' : '#3B82F6',
            }]} />
          </View>

          {/* Bottom: spent | budgeted */}
          <View style={styles.spendingBottom}>
            <Text style={[styles.spendingBottomLabel, { color: colors.textSecondary }]}>
              ${totalSpent.toLocaleString('en-US', { maximumFractionDigits: 0 })} spent
            </Text>
            {totalIncome > 0 && (
              <Text style={[styles.spendingBottomLabel, { color: colors.textSecondary }]}>
                ${totalIncome.toLocaleString('en-US', { maximumFractionDigits: 0 })} budgeted
              </Text>
            )}
          </View>
        </View>

        {/* ── 4. Quick Actions — grouped Revolut-style ──────────────────── */}
        {(() => {
          const actions = [
            { icon: <Search size={17} color="#3B82F6" />, label: 'Search', route: '/search', bg: 'rgba(59,130,246,0.1)' },
            { icon: <List size={17} color="#3B82F6" />, label: 'Transactions', route: '/transactions', bg: 'rgba(59,130,246,0.1)' },
            { icon: <CreditCard size={17} color="#8B5CF6" />, label: 'Subscriptions', route: '/subscriptions', bg: 'rgba(139,92,246,0.1)' },
            { icon: <Target size={17} color="#F59E0B" />, label: 'Budgets', route: '/budgets', bg: 'rgba(245,158,11,0.1)' },
            { icon: <CalendarDays size={17} color="#EC4899" />, label: 'Calendar', route: '/calendar', bg: 'rgba(236,72,153,0.1)' },
            { icon: <BarChart3 size={17} color="#06B6D4" />, label: aiName ? `Ask ${aiName}` : 'Ask AI', route: '/(tabs)/chat', bg: 'rgba(6,182,212,0.1)' },
          ];
          return (
            <View style={[styles.quickActionCard, styles.section, { backgroundColor: colors.card, borderColor: colors.border }, card]}>
              {actions.map(({ icon, label, route, bg }, idx) => (
                <View key={route}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.quickAction,
                      pressed && { backgroundColor: colors.background },
                    ]}
                    onPress={() => router.push(route as any)}>
                    <View style={[styles.quickIcon, { backgroundColor: bg }]}>{icon}</View>
                    <Text style={[styles.quickLabel, { color: colors.text }]}>{label}</Text>
                    <ChevronRight size={14} color={colors.textSecondary} />
                  </Pressable>
                  {idx < actions.length - 1 && (
                    <View style={[styles.quickActionDivider, { backgroundColor: colors.border }]} />
                  )}
                </View>
              ))}
            </View>
          );
        })()}

        {/* ── 5. Bill Predictor ──────────────────────────────────────────── */}
        {allTxs.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: 'rgba(139,92,246,0.25)' }, card, styles.section]}>
            <BillPredictor txs={allTxs} />
          </View>
        )}

        {/* ── 6. Monthly Spending Trend ──────────────────────────────────── */}
        {allTxs.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Spending Trend" />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }, card]}>
              <SpendingBarChart txs={allTxs} color={colors.primary} />
            </View>
          </View>
        )}

        {/* ── 7. Insight ────────────────────────────────────────────────── */}
        {topInsight && (
          <View style={styles.section}>
            <InsightCard
              insight={topInsight}
              onPressAction={() => router.push('/budgets' as any)}
            />
          </View>
        )}

        {/* ── 8. Budgets ────────────────────────────────────────────────── */}
        {budgetsWithSpend.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Budgets" action="See all" onAction={() => router.push('/budgets' as any)} />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, card]}>
              {budgetsWithSpend.slice(0, 3).map((b, i) => {
                const eff = b.monthly_limit + b.rollover;
                const pct = eff > 0 ? Math.min(b.spent / eff, 1) : 0;
                const bc  = pct >= 0.9 ? colors.danger : pct >= 0.7 ? '#F59E0B' : colors.primary;
                return (
                  <View key={b.id} style={[styles.budgetRow, {
                    borderBottomColor: colors.border,
                    borderBottomWidth: i < Math.min(budgetsWithSpend.length, 3) - 1 ? 1 : 0,
                  }]}>
                    <View style={styles.budgetTop}>
                      <View style={styles.rowLeft}>
                        <View style={[styles.colorDot, { backgroundColor: b.color }]} />
                        <Text style={[styles.catName, { color: colors.text }]}>{b.category}</Text>
                      </View>
                      <Text style={[styles.catPct, { color: bc }]}>{Math.round(pct * 100)}%</Text>
                    </View>
                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: bc }]} />
                    </View>
                    <Text style={[styles.budgetMeta, { color: colors.textSecondary }]}>
                      ${b.spent.toFixed(2)} of ${eff.toFixed(2)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── 9. Category Donut Chart ────────────────────────────────────── */}
        {donutSlices.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Categories"
              action="All transactions"
              onAction={() => router.push('/transactions' as any)}
            />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }, card]}>
              {/* Segmented bar */}
              <View style={styles.segBar}>
                {donutSlices.map((s, i) => (
                  <View key={i} style={[styles.segSlice, {
                    flex: s.percentage,
                    backgroundColor: s.color,
                    borderTopLeftRadius:     i === 0 ? 6 : 0,
                    borderBottomLeftRadius:  i === 0 ? 6 : 0,
                    borderTopRightRadius:    i === donutSlices.length - 1 ? 6 : 0,
                    borderBottomRightRadius: i === donutSlices.length - 1 ? 6 : 0,
                  }]} />
                ))}
              </View>
              <DonutChart slices={donutSlices} total={totalSpent} size={130} strokeWidth={20} />
            </View>
          </View>
        )}

        {/* ── 10. Overview summary ───────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Overview" />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, card]}>
            {[
              { label: 'Total Income',  value: `+$${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: colors.primary },
              { label: 'Total Spent',   value: `$${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,  color: colors.text },
              { label: 'Net',           value: `${remaining >= 0 ? '+' : '-'}$${Math.abs(remaining).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: remaining >= 0 ? colors.primary : colors.danger },
              { label: 'Transactions',  value: `${filteredTxs.length}`, color: colors.text },
            ].map((row, i, arr) => (
              <View key={row.label} style={[styles.overviewRow, {
                borderBottomColor: colors.border,
                borderBottomWidth: i < arr.length - 1 ? 1 : 0,
              }]}>
                <Text style={[styles.overviewLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                <Text style={[styles.overviewValue, { color: row.color }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 10 },
  headerTitle: { fontSize: 28, fontFamily: Fonts.serif, letterSpacing: -0.5 },
  headerSub:   { fontSize: 13, fontFamily: Fonts.regular, marginTop: 2 },
  filterRow:   { flexDirection: 'row', paddingHorizontal: 24, marginBottom: 20, gap: 10 },
  filterChip:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1, gap: 6 },
  filterChipText: { fontSize: 14, fontFamily: Fonts.semiBold },
  scroll:      { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  section:     { marginBottom: 28 },

  // Cards
  card:        { borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 10 },
  cardTitleWhite: { fontSize: 15, fontFamily: Fonts.semiBold, color: '#3B82F6' },
  liveTag:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  liveDot:     { width: 5, height: 5, borderRadius: 3, backgroundColor: '#3B82F6' },
  liveText:    { fontSize: 9, fontFamily: Fonts.bold, color: '#3B82F6', letterSpacing: 1 },

  // Spent section — now inside a card
  spentCard:   { borderRadius: 24, borderWidth: 1, padding: 20, marginBottom: 0 },
  spentRow:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  spentLeft:   { flex: 1 },
  spentRight:  { gap: 10 },
  spentLabel:  { fontSize: 13, fontFamily: Fonts.medium, marginBottom: 6 },
  amountText:  { fontSize: 46, fontFamily: Fonts.serif, letterSpacing: -1, lineHeight: 52, marginBottom: 8 },
  changeRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changeText:  { fontSize: 13, fontFamily: Fonts.semiBold },
  miniStat:    { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, minWidth: 86, alignItems: 'center' },
  miniStatLabel: { fontSize: 10, fontFamily: Fonts.semiBold, letterSpacing: 0.5, marginBottom: 3 },
  miniStatValue: { fontSize: 16, fontFamily: Fonts.serif },

  // Spending card
  spendingCard:       { borderRadius: 24, borderWidth: 1, padding: 20 },
  spendingTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  spendingIconLabel:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spendingWordLabel:  { fontSize: 14, fontFamily: Fonts.medium },
  dailyPill:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1 },
  dailyPillText:      { fontSize: 13, fontFamily: Fonts.semiBold },
  spendingHeadline:   { fontSize: 34, fontFamily: Fonts.bold, letterSpacing: -1, marginBottom: 20 },
  spendingTrack:      { height: 8, borderRadius: 6, overflow: 'hidden', marginBottom: 14 },
  spendingFill:       { height: 8, borderRadius: 6 },
  spendingBottom:     { flexDirection: 'row', justifyContent: 'space-between' },
  spendingBottomLabel:{ fontSize: 13, fontFamily: Fonts.medium },

  // Progress bar (used in budget section further down)
  progressTrack: { height: 6, borderRadius: 4, overflow: 'hidden', marginHorizontal: 20, marginBottom: 12 },
  progressFill:  { height: 6, borderRadius: 4 },

  // Quick actions — grouped in one card
  quickActionCard: { borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  quickAction:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 18 },
  quickActionDivider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  quickIcon:    { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  quickLabel:   { flex: 1, fontSize: 15, fontFamily: Fonts.semiBold },

  // Budget rows
  budgetRow:    { paddingVertical: 14, paddingHorizontal: 20 },
  budgetTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  budgetMeta:   { fontSize: 12, fontFamily: Fonts.regular },
  rowLeft:      { flexDirection: 'row', alignItems: 'center' },
  colorDot:     { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  catName:      { fontSize: 14, fontFamily: Fonts.medium },
  catPct:       { fontSize: 13, fontFamily: Fonts.semiBold },

  // Segmented bar
  segBar:       { flexDirection: 'row', height: 8, borderRadius: 6, overflow: 'hidden', marginBottom: 16 },
  segSlice:     { height: '100%' },

  // Overview
  overviewRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  overviewLabel: { fontSize: 14, fontFamily: Fonts.regular },
  overviewValue: { fontSize: 14, fontFamily: Fonts.semiBold },

  // Modals
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingBottom: 48, paddingHorizontal: 24, borderWidth: 1, maxHeight: '65%' },
  sheetTitle:   { fontSize: 18, fontFamily: Fonts.serif, marginBottom: 16 },
  sheetRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1 },
  sheetRowLabel: { fontSize: 16, fontFamily: Fonts.regular },
});
