import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Fonts } from '../src/components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../src/components/ThemeContext';
import { getMonthSpendByDay, getTransactionsByDate, DaySpend } from '../src/db/transactions';
import { Transaction } from '../src/types';

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toMonthString(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function CalendarScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [dayData, setDayData] = useState<Record<string, DaySpend>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTxs, setSelectedTxs] = useState<Transaction[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  const currentMonthStr = toMonthString(year, month);

  const load = useCallback(async () => {
    const data = await getMonthSpendByDay(currentMonthStr);
    const map: Record<string, DaySpend> = {};
    for (const d of data) map[d.date] = d;
    setDayData(map);
    setSelectedDate(null);
    setSelectedTxs([]);
  }, [currentMonthStr]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDayPress = async (dateStr: string) => {
    setSelectedDate(dateStr);
    setDayLoading(true);
    try {
      const txs = await getTransactionsByDate(dateStr);
      setSelectedTxs(txs);
    } finally {
      setDayLoading(false);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  // Summary totals
  const totalSpent = Object.values(dayData).reduce((s, d) => s + d.spent, 0);
  const totalIncome = Object.values(dayData).reduce((s, d) => s + d.income, 0);
  const net = totalIncome - totalSpent;

  // Max spend for intensity scaling
  const maxSpend = Math.max(...Object.values(dayData).map(d => d.spent), 1);

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = today.toISOString().substring(0, 10);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const getDayBg = (dateStr: string): string => {
    const d = dayData[dateStr];
    if (!d) return 'transparent';
    if (d.income > d.spent) {
      // Use max of income values across month for proper scaling
      const maxIncome = Math.max(...Object.values(dayData).map(x => x.income), 1);
      const intensity = Math.min(d.income / maxIncome, 1);
      return `rgba(59,130,246,${(intensity * 0.5).toFixed(2)})`;
    }
    const intensity = Math.min(d.spent / maxSpend, 1);
    return `rgba(239,68,68,${(intensity * 0.6).toFixed(2)})`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Cash Flow</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Summary row */}
        <View style={[styles.summaryRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>SPENT</Text>
            <Text style={[styles.summaryValue, { color: colors.danger }]}>
              ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>INCOME</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              ${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>NET</Text>
            <Text style={[styles.summaryValue, { color: net >= 0 ? colors.primary : colors.danger }]}>
              {net >= 0 ? '+' : ''}${net.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* Month navigation */}
        <View style={styles.monthNav}>
          <Pressable onPress={prevMonth} style={styles.navBtn}>
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel(year, month)}</Text>
          <Pressable onPress={nextMonth} style={styles.navBtn}>
            <ChevronRight size={22} color={colors.text} />
          </Pressable>
        </View>

        {/* Day headers */}
        <View style={styles.dayHeaderRow}>
          {DAY_HEADERS.map(h => (
            <Text key={h} style={[styles.dayHeader, { color: colors.textSecondary }]}>{h}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.grid}>
          {cells.map((day, i) => {
            if (day === null) {
              return <View key={`empty-${i}`} style={styles.cell} />;
            }
            const dateStr = `${currentMonthStr}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const bg = getDayBg(dateStr);
            const dayD = dayData[dateStr];
            return (
              <Pressable
                key={dateStr}
                style={[
                  styles.cell,
                  { backgroundColor: bg },
                  isToday && { borderWidth: 2, borderColor: colors.primary, borderRadius: 8 },
                  isSelected && { borderWidth: 2, borderColor: colors.text, borderRadius: 8 },
                ]}
                onPress={() => handleDayPress(dateStr)}
              >
                <Text style={[
                  styles.dayNum,
                  { color: isToday ? colors.primary : colors.text },
                  isSelected && { fontWeight: '700' },
                ]}>
                  {day}
                </Text>
                {dayD && dayD.count > 0 && (
                  <View style={[styles.dot, { backgroundColor: dayD.income > dayD.spent ? colors.primary : colors.danger }]} />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Selected day transactions */}
        {selectedDate && (
          <View style={[styles.txSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.txSectionTitle, { color: colors.text }]}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
            {dayLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : selectedTxs.length === 0 ? (
              <Text style={[styles.noTxText, { color: colors.textSecondary }]}>No transactions on this day</Text>
            ) : (
              selectedTxs.map((tx, i) => (
                <View key={tx.id} style={[styles.txRow, { borderBottomColor: colors.border, borderBottomWidth: i < selectedTxs.length - 1 ? StyleSheet.hairlineWidth : 0 }]}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[styles.txMerchant, { color: colors.text }]} numberOfLines={1}>{tx.merchant}</Text>
                    <Text style={[styles.txCategory, { color: colors.textSecondary }]}>{tx.category}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: tx.type === 'credit' ? colors.primary : colors.text }]}>
                    {tx.type === 'credit' ? '+' : '-'}${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontFamily: Fonts.bold },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  summaryRow: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  summaryLabel: { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 0.8, marginBottom: 4 },
  summaryValue: { fontSize: 14, fontFamily: Fonts.bold },
  summaryDivider: { width: 1 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { padding: 8 },
  monthLabel: { fontSize: 18, fontFamily: Fonts.serif },
  dayHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  dayHeader: { flex: 1, textAlign: 'center', fontSize: 12, fontFamily: Fonts.semiBold },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayNum: { fontSize: 14, fontFamily: Fonts.medium },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  txSection: { marginTop: 20, borderRadius: 16, borderWidth: 1, padding: 16 },
  txSectionTitle: { fontSize: 16, fontFamily: Fonts.semiBold, marginBottom: 12 },
  noTxText: { fontSize: 14, fontFamily: Fonts.regular },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  txMerchant: { fontSize: 15, fontFamily: Fonts.semiBold, marginBottom: 2 },
  txCategory: { fontSize: 13, fontFamily: Fonts.regular },
  txAmount: { fontSize: 15, fontFamily: Fonts.bold },
});
