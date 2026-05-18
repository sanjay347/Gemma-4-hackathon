import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  TextInput, Modal, ScrollView, Animated, TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Search, X, ChevronDown, SlidersHorizontal, ChevronRight, Check, Pencil } from 'lucide-react-native';
import { useTheme } from '../src/components/ThemeContext';
import { getTransactions, updateTransactionCategory } from '../src/db/transactions';
import { Transaction } from '../src/types';
import { Fonts } from '../src/components/Typography';
import { TransactionsSkeleton } from '../src/components/Skeleton';

// ─── Categories ───────────────────────────────────────────────────────────────
const ALL_CATEGORIES = [
  'Food & Dining','Groceries','Transportation','Entertainment',
  'Health & Fitness','Shopping','Travel','Bills & Utilities',
  'Subscriptions','Coffee','Alcohol','Income','Transfer','Other',
];

const CAT_EMOJI: Record<string, string> = {
  'Food & Dining':'🍔','Groceries':'🛒','Transportation':'🚗',
  'Entertainment':'🎬','Health & Fitness':'💪','Shopping':'🛍️',
  'Travel':'✈️','Bills & Utilities':'💡','Subscriptions':'📺',
  'Coffee':'☕','Alcohol':'🍺','Income':'💰','Transfer':'🔄','Other':'📌',
};
const catEmoji = (c: string) => CAT_EMOJI[c] ?? '📌';

const SORT_OPTIONS = ['Date (newest)', 'Date (oldest)', 'Amount (high)', 'Amount (low)'];
type SortOption = typeof SORT_OPTIONS[number];

interface DateGroup { date: string; txs: Transaction[]; total: number }

function groupByDate(txs: Transaction[]): DateGroup[] {
  const map: Record<string, Transaction[]> = {};
  for (const t of txs) (map[t.date] = map[t.date] || []).push(t);
  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({
      date, txs: list,
      total: list.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
    }));
}

function formatDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (dt.toDateString() === today.toDateString())     return 'Today';
  if (dt.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Transaction row ──────────────────────────────────────────────────────────
function TxRow({ tx, colors, onPress }: { tx: Transaction; colors: any; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const isCredit = tx.type === 'credit';
  const handlePress = () => {
    Haptics.selectionAsync();
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[styles.txRow, { borderBottomColor: colors.border, transform: [{ scale }] }]}>
        <View style={[styles.txAvatar, { backgroundColor: isCredit ? 'rgba(59,130,246,0.12)' : 'rgba(107,114,128,0.08)' }]}>
          <Text style={styles.txEmoji}>{catEmoji(tx.category)}</Text>
        </View>
        <View style={styles.txDetails}>
          <Text style={[styles.txMerchant, { color: colors.text }]} numberOfLines={1}>{tx.merchant}</Text>
          <View style={styles.txMeta}>
            <Text style={[styles.txCategory, { color: colors.textSecondary }]} numberOfLines={1}>{tx.category}</Text>
            {(tx.is_subscription || tx.is_recurring) && (
              <View style={styles.recurringBadge}><Text style={styles.recurringText}>↻</Text></View>
            )}
          </View>
        </View>
        <Text style={[styles.txAmount, { color: isCredit ? '#3B82F6' : colors.text }]}>
          {isCredit ? '+' : '-'}${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Category picker modal ────────────────────────────────────────────────────
function CategoryPickerModal({ visible, current, colors, onSelect, onClose }: {
  visible: boolean; current: string; colors: any;
  onSelect: (cat: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.catSheet, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
          <View style={styles.catSheetHandle} />
          <Text style={[styles.catSheetTitle, { color: colors.text }]}>Change Category</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {ALL_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.catOption, { borderBottomColor: colors.border }]}
                onPress={() => onSelect(cat)}
              >
                <Text style={styles.catOptionEmoji}>{catEmoji(cat)}</Text>
                <Text style={[styles.catOptionText, { color: colors.text }]}>{cat}</Text>
                {cat === current && <Check size={16} color="#3B82F6" strokeWidth={2.5} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Transaction detail modal ─────────────────────────────────────────────────
function TxDetailModal({ tx, visible, onClose, colors, onEditCategory }: {
  tx: Transaction | null; visible: boolean; onClose: () => void;
  colors: any; onEditCategory: () => void;
}) {
  if (!tx) return null;
  const isCredit = tx.type === 'credit';

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.detailSheet, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
          {/* Amount hero */}
          <View style={styles.detailHero}>
            <Text style={styles.detailEmoji}>{catEmoji(tx.category)}</Text>
            <Text style={[styles.detailAmount, { color: isCredit ? '#3B82F6' : colors.text }]}>
              {isCredit ? '+' : '-'}${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
            <Text
              style={[styles.detailMerchant, { color: colors.textSecondary }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {tx.merchant}
            </Text>
            {/* Show a second line for the raw description only when it differs meaningfully */}
            {tx.description && tx.description !== tx.merchant && tx.description.length <= 60 && (
              <Text style={[styles.detailDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                {tx.description}
              </Text>
            )}
          </View>

          {/* Detail rows */}
          <View style={[styles.detailRows, { borderColor: colors.border }]}>
            {[
              { label: 'Date', value: tx.date },
              { label: 'Bank', value: tx.bank?.toUpperCase() ?? '—' },
              { label: 'Type', value: isCredit ? 'Income / Credit' : 'Expense / Debit' },
              { label: 'Recurring', value: tx.is_recurring || tx.is_subscription ? 'Yes' : 'No' },
            ].map((r, i, arr) => (
              <View key={r.label} style={[styles.detailRow, {
                borderBottomColor: colors.border,
                borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0,
              }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{r.label}</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{r.value}</Text>
              </View>
            ))}

            {/* Editable category row */}
            <TouchableOpacity
              style={[styles.detailRow, styles.catRow, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}
              onPress={onEditCategory}
              activeOpacity={0.7}
            >
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Category</Text>
              <View style={styles.catEditRow}>
                <Text style={[styles.detailValue, { color: colors.text }]}>{tx.category}</Text>
                <View style={styles.editBadge}>
                  <Pencil size={11} color="#3B82F6" />
                  <Text style={styles.editBadgeText}>Edit</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          <Pressable style={[styles.closeBtn, { backgroundColor: colors.border }]} onPress={onClose}>
            <Text style={[styles.closeBtnText, { color: colors.text }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TransactionsScreen() {
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

  const [loading, setLoading]       = useState(true);
  const [allTxs, setAllTxs]         = useState<Transaction[]>([]);
  const [search, setSearch]         = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'all' | 'debit' | 'credit'>('all');
  const [sortBy, setSortBy]         = useState<SortOption>('Date (newest)');
  const [showSort, setShowSort]     = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [showCatPicker, setShowCatPicker] = useState(false);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    getTransactions()
      .then(setAllTxs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []));

  const categories = useMemo(
    () => [...new Set(allTxs.map(t => t.category))].sort(),
    [allTxs]
  );

  const filtered = useMemo(() => {
    let txs = allTxs;
    if (search.trim()) {
      const q = search.toLowerCase();
      txs = txs.filter(t =>
        t.merchant.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      );
    }
    if (activeCategory) txs = txs.filter(t => t.category === activeCategory);
    if (activeType !== 'all') txs = txs.filter(t => t.type === activeType);
    switch (sortBy) {
      case 'Date (newest)':  txs = [...txs].sort((a, b) => b.date.localeCompare(a.date)); break;
      case 'Date (oldest)':  txs = [...txs].sort((a, b) => a.date.localeCompare(b.date)); break;
      case 'Amount (high)':  txs = [...txs].sort((a, b) => b.amount - a.amount); break;
      case 'Amount (low)':   txs = [...txs].sort((a, b) => a.amount - b.amount); break;
    }
    return txs;
  }, [allTxs, search, activeCategory, activeType, sortBy]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);
  const totalSpent  = filtered.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const totalIncome = filtered.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);

  // ── Category change ─────────────────────────────────────────────────────────
  const handleCategoryChange = useCallback(async (txId: string, newCat: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await updateTransactionCategory(txId, newCat);
    setAllTxs(prev => prev.map(t => t.id === txId ? { ...t, category: newCat } : t));
    setSelectedTx(prev => prev?.id === txId ? { ...prev, category: newCat } : prev);
  }, []);

  type ListItem =
    | { kind: 'header'; date: string; total: number }
    | { kind: 'tx'; tx: Transaction };

  const listData: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    for (const g of groups) {
      items.push({ kind: 'header', date: g.date, total: g.total });
      for (const tx of g.txs) items.push({ kind: 'tx', tx });
    }
    return items;
  }, [groups]);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'header') {
      return (
        <View style={[styles.dateHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.dateText, { color: colors.text }]}>{formatDate(item.date)}</Text>
          {item.total > 0 && (
            <Text style={[styles.dateTotalText, { color: colors.textSecondary }]}>
              −${item.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          )}
        </View>
      );
    }
    return (
      <TxRow tx={item.tx} colors={colors} onPress={() => setSelectedTx(item.tx)} />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>

      {/* Sort modal */}
      <Modal visible={showSort} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowSort(false)}>
          <View style={[styles.sortSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sortTitle, { color: colors.text }]}>Sort by</Text>
            {SORT_OPTIONS.map(opt => (
              <Pressable key={opt} style={[styles.sortRow, { borderBottomColor: colors.border }]}
                onPress={() => { setSortBy(opt); setShowSort(false); }}>
                <Text style={[styles.sortRowText, { color: colors.text }]}>{opt}</Text>
                {sortBy === opt && <Check size={16} color="#3B82F6" strokeWidth={2.5} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Detail modal — hide when category picker is open (iOS can only show one modal at a time) */}
      <TxDetailModal
        tx={selectedTx}
        visible={!!selectedTx && !showCatPicker}
        onClose={() => setSelectedTx(null)}
        colors={colors}
        onEditCategory={() => setShowCatPicker(true)}
      />

      {/* Category picker — top-level, NOT nested inside detail modal */}
      <CategoryPickerModal
        visible={showCatPicker}
        current={selectedTx?.category ?? ''}
        colors={colors}
        onSelect={(cat) => {
          if (selectedTx) handleCategoryChange(selectedTx.id, cat);
          setShowCatPicker(false);
        }}
        onClose={() => setShowCatPicker(false)}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Transactions</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
            {filtered.length} of {allTxs.length}
          </Text>
        </View>
        {/* Search → dedicated search screen */}
        <Pressable onPress={() => router.push('/search' as any)} style={styles.iconBtn}>
          <Search size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => setShowSort(true)} style={styles.iconBtn}>
          <SlidersHorizontal size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Skeleton while loading */}
      {loading && <TransactionsSkeleton />}

      {/* Content — hidden until loaded */}
      {!loading && <>

      {/* Inline search bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Search size={16} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text, fontFamily: Fonts.regular }]}
          placeholder="Search merchant, category..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <X size={16} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Type filter */}
      <View style={styles.typeRow}>
        {(['all', 'debit', 'credit'] as const).map(type => (
          <Pressable key={type}
            style={[styles.typeChip, {
              backgroundColor: activeType === type ? '#3B82F6' : colors.card,
              borderColor: activeType === type ? '#3B82F6' : colors.border,
            }]}
            onPress={() => setActiveType(type)}>
            <Text style={[styles.typeChipText, { color: activeType === type ? '#FFFFFF' : colors.textSecondary }]}>
              {type === 'all' ? 'All' : type === 'debit' ? 'Expenses' : 'Income'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Category scroll */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catScrollContent}>
        {categories.map(cat => (
          <Pressable key={cat}
            style={[styles.catChip, {
              backgroundColor: activeCategory === cat ? '#3B82F6' : colors.card,
              borderColor: activeCategory === cat ? '#3B82F6' : colors.border,
            }]}
            onPress={() => setActiveCategory(cat === activeCategory ? null : cat)}>
            <Text style={styles.catEmoji}>{catEmoji(cat)}</Text>
            <Text style={[styles.catChipText, { color: activeCategory === cat ? '#FFFFFF' : colors.text }]}>
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Summary strip */}
      <View style={[styles.summaryStrip, { backgroundColor: colors.card, borderColor: colors.border }, cardShadow]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>SPENT</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>INCOME</Text>
          <Text style={[styles.summaryValue, { color: '#3B82F6' }]}>
            +${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>COUNT</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{filtered.length}</Text>
        </View>
      </View>

      {/* Transaction list */}
      <FlatList
        data={listData}
        keyExtractor={(item, i) =>
          item.kind === 'header' ? `h-${item.date}` : `tx-${item.tx.id}-${i}`
        }
        renderItem={renderItem}
        style={[styles.list, { backgroundColor: colors.card, borderColor: colors.border }, cardShadow]}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No transactions found</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>Try a different search or filter</Text>
          </View>
        }
      />
      </>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 20, fontFamily: Fonts.serifSemi, letterSpacing: -0.3 },
  headerSub:    { fontSize: 12, fontFamily: Fonts.regular, marginTop: 1 },
  iconBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  searchBar:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput:  { flex: 1, fontSize: 15 },

  typeRow:      { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  typeChip:     { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  typeChipText: { fontSize: 13, fontFamily: Fonts.semiBold },

  catScroll:        { maxHeight: 42 },
  catScrollContent: { paddingHorizontal: 20, gap: 8 },
  catChip:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 },
  catEmoji:         { fontSize: 13 },
  catChipText:      { fontSize: 12, fontFamily: Fonts.semiBold },

  summaryStrip:   { flexDirection: 'row', marginHorizontal: 20, marginVertical: 10, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  summaryItem:    { flex: 1, alignItems: 'center', paddingVertical: 10 },
  summaryLabel:   { fontSize: 9, fontFamily: Fonts.bold, letterSpacing: 0.8, marginBottom: 3 },
  summaryValue:   { fontSize: 13, fontFamily: Fonts.bold },
  summaryDivider: { width: 1 },

  list:         { flex: 1, marginHorizontal: 20, borderRadius: 16, borderWidth: 1 },
  listContent:  { paddingBottom: 20 },

  dateHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  dateText:      { fontSize: 13, fontFamily: Fonts.semiBold },
  dateTotalText: { fontSize: 12, fontFamily: Fonts.semiBold },

  txRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, gap: 12 },
  txAvatar:       { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txEmoji:        { fontSize: 18 },
  txDetails:      { flex: 1 },
  txMerchant:     { fontSize: 14, fontFamily: Fonts.semiBold, marginBottom: 3 },
  txMeta:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txCategory:     { fontSize: 12, fontFamily: Fonts.regular },
  txAmount:       { fontSize: 15, fontFamily: Fonts.bold, minWidth: 75, textAlign: 'right' },
  recurringBadge: { backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  recurringText:  { fontSize: 10, color: '#3B82F6', fontFamily: Fonts.bold },

  // Detail modal
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  detailSheet:    { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingBottom: 40 },
  detailHero:     { alignItems: 'center', paddingTop: 28, paddingBottom: 20, paddingHorizontal: 28 },
  detailEmoji:    { fontSize: 44, marginBottom: 8 },
  detailAmount:   { fontSize: 36, fontFamily: Fonts.serif, letterSpacing: -1 },
  detailMerchant: { fontSize: 15, fontFamily: Fonts.semiBold, marginTop: 6, textAlign: 'center' },
  detailDesc:     { fontSize: 12, fontFamily: Fonts.regular, marginTop: 3, textAlign: 'center', opacity: 0.7 },
  detailRows:     { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 24 },
  detailLabel:    { fontSize: 14, fontFamily: Fonts.regular },
  detailValue:    { fontSize: 14, fontFamily: Fonts.semiBold },

  catRow:         { alignItems: 'center' },
  catEditRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  editBadgeText:  { fontSize: 11, fontFamily: Fonts.semiBold, color: '#3B82F6' },

  closeBtn:       { marginHorizontal: 24, marginTop: 20, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  closeBtnText:   { fontSize: 16, fontFamily: Fonts.semiBold },

  // Category picker sheet
  catSheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingBottom: 40, maxHeight: '75%' },
  catSheetHandle:{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#E4E8F7', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  catSheetTitle: { fontSize: 18, fontFamily: Fonts.serifSemi, paddingHorizontal: 24, paddingVertical: 16 },
  catOption:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  catOptionEmoji:{ fontSize: 20 },
  catOptionText: { flex: 1, fontSize: 15, fontFamily: Fonts.medium },

  // Sort modal
  sortSheet:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingTop: 20, paddingBottom: 40, paddingHorizontal: 24 },
  sortTitle:    { fontSize: 18, fontFamily: Fonts.serifSemi, marginBottom: 16 },
  sortRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
  sortRowText:  { fontSize: 16, fontFamily: Fonts.medium },

  emptyState:   { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyEmoji:   { fontSize: 40, marginBottom: 12 },
  emptyTitle:   { fontSize: 17, fontFamily: Fonts.semiBold, marginBottom: 6 },
  emptyHint:    { fontSize: 14, fontFamily: Fonts.regular, textAlign: 'center', lineHeight: 20 },
});
