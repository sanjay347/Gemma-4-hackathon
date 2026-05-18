import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  Modal, KeyboardAvoidingView, Platform, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, X, Check, Pencil } from 'lucide-react-native';
import { useTheme } from '../src/components/ThemeContext';
import { searchTransactions, updateTransactionMeta, updateTransactionCategory } from '../src/db/transactions';
import { Transaction } from '../src/types';
import { Fonts } from '../src/components/Typography';

const ALL_CATEGORIES = [
  'Food & Dining', 'Shopping', 'Transport', 'Entertainment',
  'Health & Fitness', 'Travel', 'Utilities', 'Housing',
  'Personal Care', 'Education', 'Subscriptions', 'Income',
  'Transfer', 'Other',
];

function catEmoji(cat: string): string {
  const map: Record<string, string> = {
    'Food & Dining': '🍽️', 'Shopping': '🛍️', 'Transport': '🚗',
    'Entertainment': '🎬', 'Health & Fitness': '💪', 'Travel': '✈️',
    'Utilities': '⚡', 'Housing': '🏠', 'Personal Care': '💆',
    'Education': '📚', 'Subscriptions': '🔄', 'Income': '💰',
    'Transfer': '↔️', 'Other': '📦',
  };
  return map[cat] ?? '📦';
}

function CategoryPickerModal({ visible, current, colors, onSelect, onClose }: {
  visible: boolean;
  current: string;
  colors: any;
  onSelect: (cat: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.catSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
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
                {cat === current && <Check size={16} color="#3B82F6" />}
              </TouchableOpacity>
            ))}
            <View style={{ height: 20 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Transaction[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState('');
  const [showCatPicker, setShowCatPicker] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  const runSearch = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); return; }
    searchTransactions(q).then(setResults).catch(console.error);
  }, []);

  const handleChangeText = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 300);
  };

  const openDetail = (tx: Transaction) => {
    setSelectedTx(tx);
    setEditNotes(tx.notes || '');
    setEditTags(tx.tags || '');
    setShowCatPicker(false);
  };

  const handleSave = async () => {
    if (!selectedTx) return;
    await updateTransactionMeta(selectedTx.id, editTags, editNotes);
    setResults(prev => prev.map(t => t.id === selectedTx.id ? { ...t, notes: editNotes, tags: editTags } : t));
    setSelectedTx(null);
  };

  const handleCategoryChange = async (cat: string) => {
    if (!selectedTx) return;
    await updateTransactionCategory(selectedTx.id, cat);
    const updated = { ...selectedTx, category: cat };
    setSelectedTx(updated);
    setResults(prev => prev.map(t => t.id === selectedTx.id ? updated : t));
    setShowCatPicker(false);
  };

  const renderItem = ({ item }: { item: Transaction }) => (
    <Pressable
      style={[styles.resultRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => openDetail(item)}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowLeft}>
          <Text style={[styles.merchant, { color: colors.text }]} numberOfLines={1}>{item.merchant}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.catBadge, { backgroundColor: colors.border }]}>
              <Text style={[styles.catBadgeText, { color: colors.textSecondary }]}>{item.category}</Text>
            </View>
            <Text style={[styles.bank, { color: colors.textSecondary }]}>{item.bank}</Text>
          </View>
        </View>
        <View style={styles.rowRight}>
          <Text style={[styles.amount, { color: item.type === 'credit' ? colors.primary : colors.text }]}>
            {item.type === 'credit' ? '+' : '-'}${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Text>
          <Text style={[styles.date, { color: colors.textSecondary }]}>{item.date}</Text>
        </View>
      </View>
      {item.notes ? (
        <Text style={[styles.notePreview, { color: colors.textSecondary }]} numberOfLines={1}>
          Note: {item.notes}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header / Search bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: colors.text, fontFamily: Fonts.regular }]}
          placeholder="Search transactions…"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={handleChangeText}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => { setQuery(''); setResults([]); }}>
            <X size={18} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {results.length === 0 && query.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Search your transactions</Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
            Search by merchant, category, description, notes, or tags
          </Text>
        </View>
      )}

      {results.length === 0 && query.length > 0 && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No results</Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>Try a different search term</Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      />

      {/* Detail / Edit Modal */}
      <Modal visible={selectedTx !== null} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.overlay} onPress={() => setSelectedTx(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {selectedTx && (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={[styles.sheetMerchant, { color: colors.text }]}>{selectedTx.merchant}</Text>
                  <Pressable onPress={() => setSelectedTx(null)}>
                    <X size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>

                <View style={styles.detailGrid}>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Amount</Text>
                    <Text style={[styles.detailValue, { color: selectedTx.type === 'credit' ? colors.primary : colors.text }]}>
                      {selectedTx.type === 'credit' ? '+' : '-'}${selectedTx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Date</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{selectedTx.date}</Text>
                  </View>
                  {/* Tappable category row */}
                  <TouchableOpacity style={styles.detailItem} onPress={() => setShowCatPicker(true)}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Category</Text>
                    <View style={styles.catEditRow}>
                      <Text style={[styles.detailValue, { color: colors.text, flex: 1 }]}>{selectedTx.category}</Text>
                      <View style={[styles.editBadge, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
                        <Pencil size={10} color="#3B82F6" />
                        <Text style={styles.editBadgeText}>Edit</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Bank</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{selectedTx.bank}</Text>
                  </View>
                </View>

                <Text style={[styles.editLabel, { color: colors.textSecondary }]}>NOTES</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border, fontFamily: Fonts.regular }]}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="Add notes…"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />

                <Text style={[styles.editLabel, { color: colors.textSecondary }]}>TAGS (comma-separated)</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border, fontFamily: Fonts.regular }]}
                  value={editTags}
                  onChangeText={setEditTags}
                  placeholder="e.g. work, reimbursable, travel"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                />

                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Category picker */}
      {selectedTx && (
        <CategoryPickerModal
          visible={showCatPicker}
          current={selectedTx.category}
          colors={colors}
          onSelect={handleCategoryChange}
          onClose={() => setShowCatPicker(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 12, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  backBtn: { padding: 4 },
  input: { flex: 1, fontSize: 16 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  resultRow: { borderRadius: 12, borderWidth: 1, marginBottom: 10, padding: 14 },
  rowMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowLeft: { flex: 1, marginRight: 12 },
  rowRight: { alignItems: 'flex-end' },
  merchant: { fontSize: 15, fontFamily: Fonts.semiBold, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  catBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold },
  bank: { fontSize: 12, fontFamily: Fonts.regular },
  amount: { fontSize: 15, fontFamily: Fonts.bold, marginBottom: 2 },
  date: { fontSize: 12, fontFamily: Fonts.regular },
  notePreview: { fontSize: 12, fontFamily: Fonts.regular, marginTop: 6 },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontFamily: Fonts.semiBold, marginBottom: 8 },
  emptyHint: { fontSize: 14, fontFamily: Fonts.regular, textAlign: 'center', lineHeight: 20 },
  modalContainer: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderWidth: 1 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetMerchant: { fontSize: 20, fontFamily: Fonts.bold },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  detailItem: { width: '45%' },
  detailLabel: { fontSize: 11, fontFamily: Fonts.semiBold, letterSpacing: 0.5, marginBottom: 4 },
  detailValue: { fontSize: 15, fontFamily: Fonts.semiBold },
  catEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  editBadgeText: { fontSize: 10, fontFamily: Fonts.semiBold, color: '#3B82F6' },
  editLabel: { fontSize: 11, fontFamily: Fonts.semiBold, letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  editInput: { borderRadius: 10, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, fontSize: 15, marginBottom: 12 },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontFamily: Fonts.bold },
  // Category picker sheet
  catSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 20, maxHeight: '70%' },
  catSheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 16 },
  catSheetTitle: { fontSize: 17, fontFamily: Fonts.semiBold, marginBottom: 12 },
  catOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  catOptionEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  catOptionText: { flex: 1, fontSize: 15, fontFamily: Fonts.medium },
});
