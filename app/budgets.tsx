import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  TextInput, TouchableOpacity, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Fonts } from '../src/components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { useTheme } from '../src/components/ThemeContext';
import {
  getBudgets, upsertBudget, deleteBudget, getRollover, Budget,
  getTransactions,
} from '../src/db/transactions';

const BUDGET_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4', '#EF4444', '#F97316', '#10B981'];

export default function BudgetsScreen() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const cardShadow = theme === 'light' ? {
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

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spendByCategory, setSpendByCategory] = useState<Record<string, number>>({});
  const [rolloverByCategory, setRolloverByCategory] = useState<Record<string, number>>({});
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const warnedBudgets = useRef(new Set<string>());
  const [newCategory, setNewCategory] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [newColor, setNewColor] = useState(BUDGET_COLORS[0]);

  const currentMonth = new Date().toISOString().substring(0, 7);

  const load = useCallback(async () => {
    try {
      const [allBudgets, allTx] = await Promise.all([getBudgets(), getTransactions()]);

      // Spend this month per category
      const monthTx = allTx.filter(t => t.date.startsWith(currentMonth) && t.type === 'debit');
      const spend: Record<string, number> = {};
      for (const t of monthTx) {
        spend[t.category] = (spend[t.category] || 0) + t.amount;
      }

      // Rollovers
      const rollovers: Record<string, number> = {};
      await Promise.all(
        allBudgets.map(async b => {
          rollovers[b.category] = await getRollover(b.category, currentMonth);
        })
      );

      // Available categories (from transactions, not yet budgeted)
      const txCategories = [...new Set(allTx.map(t => t.category))].sort();
      const budgetedCats = new Set(allBudgets.map(b => b.category));
      setAvailableCategories(txCategories.filter(c => !budgetedCats.has(c)));

      setBudgets(allBudgets);
      setSpendByCategory(spend);
      setRolloverByCategory(rollovers);
    } catch (e) { console.error(e); }
  }, [currentMonth]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    const limit = parseFloat(newLimit);
    if (!newCategory || isNaN(limit) || limit <= 0) {
      Alert.alert('Invalid input', 'Please select a category and enter a valid amount.');
      return;
    }
    const budget: Budget = {
      id: `budget_${newCategory}`,
      category: newCategory,
      monthly_limit: limit,
      color: newColor,
    };
    await upsertBudget(budget);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAddModal(false);
    setNewCategory('');
    setNewLimit('');
    setNewColor(BUDGET_COLORS[0]);
    load();
  };

  const handleDelete = (budget: Budget) => {
    Alert.alert('Delete Budget', `Remove budget for "${budget.category}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          await deleteBudget(budget.id);
          load();
        }
      },
    ]);
  };

  const totalBudgeted = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + (spendByCategory[b.category] || 0), 0);

  const barColor = (pct: number) => {
    if (pct >= 0.9) return colors.danger;
    if (pct >= 0.7) return '#F59E0B';
    return colors.primary;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Budgets</Text>
        <Pressable onPress={() => setShowAddModal(true)} style={styles.addBtn}>
          <Plus size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Summary card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }, cardShadow]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>BUDGETED</Text>
            <Text style={[styles.summaryAmount, { color: colors.text }]}>
              ${totalBudgeted.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>SPENT</Text>
            <Text style={[styles.summaryAmount, { color: totalSpent > totalBudgeted ? colors.danger : colors.text }]}>
              ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {budgets.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No budgets yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              Tap + to add your first budget category
            </Text>
          </View>
        ) : (
          budgets.map((budget, i) => {
            const spent = spendByCategory[budget.category] || 0;
            const rollover = rolloverByCategory[budget.category] || 0;
            const effective = budget.monthly_limit + rollover;
            const pct = effective > 0 ? Math.min(spent / effective, 1) : 0;
            const bc = barColor(pct);
            // Haptic warning once per budget when it hits 90%+
            if (pct >= 0.9 && !warnedBudgets.current.has(budget.id)) {
              warnedBudgets.current.add(budget.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            return (
              <Pressable
                key={i}
                style={[styles.budgetCard, { backgroundColor: colors.card, borderColor: colors.border }, cardShadow]}
                onLongPress={() => handleDelete(budget)}
                delayLongPress={600}
              >
                <View style={styles.budgetTop}>
                  <View style={styles.budgetTitleRow}>
                    <View style={[styles.colorDot, { backgroundColor: budget.color }]} />
                    <Text style={[styles.budgetCategory, { color: colors.text }]}>{budget.category}</Text>
                  </View>
                  <Text style={[styles.budgetPct, { color: bc }]}>{Math.round(pct * 100)}%</Text>
                </View>

                <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: bc }]} />
                </View>

                <View style={styles.budgetBottom}>
                  <Text style={[styles.budgetSpentLabel, { color: colors.textSecondary }]}>
                    ${spent.toLocaleString('en-US', { minimumFractionDigits: 2 })} spent of ${effective.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                  {rollover > 0 && (
                    <Text style={[styles.rolloverLabel, { color: colors.primary }]}>
                      +${rollover.toLocaleString('en-US', { minimumFractionDigits: 2 })} rolled over
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })
        )}

        {budgets.length > 0 && (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>Long press a budget to delete it</Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Budget Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowAddModal(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Add Budget</Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Category</Text>
            {availableCategories.length === 0 ? (
              <Text style={[styles.noCats, { color: colors.textSecondary }]}>
                All transaction categories already have budgets
              </Text>
            ) : (
              <ScrollView style={styles.catPicker} nestedScrollEnabled>
                {availableCategories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.catOption,
                      { borderColor: colors.border },
                      newCategory === cat && { backgroundColor: colors.primary + '22', borderColor: colors.primary },
                    ]}
                    onPress={() => setNewCategory(cat)}
                  >
                    <Text style={[styles.catOptionText, { color: newCategory === cat ? colors.primary : colors.text }]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Monthly Limit ($)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              value={newLimit}
              onChangeText={setNewLimit}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Color</Text>
            <View style={styles.colorRow}>
              {BUDGET_COLORS.map(c => (
                <Pressable
                  key={c}
                  style={[styles.colorSwatch, { backgroundColor: c }, newColor === c && styles.colorSwatchSelected]}
                  onPress={() => setNewColor(c)}
                />
              ))}
            </View>

            <Pressable
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleAdd}
            >
              <Text style={styles.saveBtnText}>Add Budget</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontFamily: Fonts.bold },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  summaryCard: { borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginBottom: 20, overflow: 'hidden' },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 20 },
  summaryLabel: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 0.8, marginBottom: 6 },
  summaryAmount: { fontSize: 22, fontFamily: Fonts.serif, letterSpacing: -0.5 },
  summaryDivider: { width: 1 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontFamily: Fonts.semiBold, marginBottom: 8 },
  emptyHint: { fontSize: 14, fontFamily: Fonts.regular, textAlign: 'center', lineHeight: 20 },
  budgetCard: { borderRadius: 14, borderWidth: 1, marginBottom: 12, padding: 16 },
  budgetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  budgetTitleRow: { flexDirection: 'row', alignItems: 'center' },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  budgetCategory: { fontSize: 16, fontFamily: Fonts.semiBold },
  budgetPct: { fontSize: 14, fontFamily: Fonts.bold },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: 6, borderRadius: 3 },
  budgetBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetSpentLabel: { fontSize: 13, fontFamily: Fonts.regular },
  rolloverLabel: { fontSize: 12, fontFamily: Fonts.semiBold },
  hint: { textAlign: 'center', fontSize: 12, fontFamily: Fonts.regular, marginTop: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderWidth: 1 },
  sheetTitle: { fontSize: 20, fontFamily: Fonts.bold, marginBottom: 20 },
  inputLabel: { fontSize: 12, fontFamily: Fonts.semiBold, letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  catPicker: { maxHeight: 150, marginBottom: 4 },
  catOption: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  catOptionText: { fontSize: 15, fontFamily: Fonts.medium },
  noCats: { fontSize: 14, fontFamily: Fonts.regular, marginBottom: 8 },
  input: { borderRadius: 10, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, fontSize: 16, fontFamily: Fonts.regular },
  colorRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  colorSwatch: { width: 28, height: 28, borderRadius: 14 },
  colorSwatchSelected: { borderWidth: 3, borderColor: '#FFFFFF' },
  saveBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontFamily: Fonts.bold },
});
