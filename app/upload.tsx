import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Pressable, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { CheckCircle2, ArrowLeft, ChevronRight, Camera, FileText } from 'lucide-react-native';
import { PulsingOrb, StepList } from '../src/components/ProcessingView';
import { Fonts } from '../src/components/Typography';

import { HiddenPdfExtractor, ensurePdfJsReady } from '../src/parsers/pdfExtractor';
import { HiddenImageOCR, ensureOCRReady } from '../src/parsers/imageOCR';
import { parseBankStatement, BankType, BANK_LABELS } from '../src/parsers/index';
import { tryRuleCategorize } from '../src/gemma/rules';
import { batchCategorize } from '../src/gemma/batchCategorizer';
import { analyzeBehavior } from '../src/gemma/agents/behavior';
import { predictCashFlow } from '../src/gemma/agents/predictor';
import { detectInternalTransfers } from '../src/gemma/transferDetector';
import {
  getTransactions, insertTransactions, insertInsights, recordUpload,
} from '../src/db/transactions';
import { useTheme } from '../src/components/ThemeContext';
import * as Haptics from 'expo-haptics';

type ProcessingState = 'idle' | 'preparing' | 'reading' | 'categorizing' | 'analyzing' | 'done';
type InputMode = 'pdf' | 'photo';

const BANKS: BankType[] = ['chase', 'bofa', 'wellsfargo', 'citi'];

const PDF_STEPS = [
  'Initializing PDF engine',
  'Reading document pages',
  'Parsing statement data',
  'Extracting transactions',
  'Matching known merchants',
  'AI categorizing merchants',
  'Flagging subscriptions',
  'Detecting spending patterns',
  'Building financial insights',
  'Predicting cash flow',
  'Saving to secure storage',
  'Analysis complete',
];

const PHOTO_STEPS = [
  'Initializing OCR engine',
  'Reading statement image',
  'Parsing statement data',
  'Extracting transactions',
  'Matching known merchants',
  'AI categorizing merchants',
  'Flagging subscriptions',
  'Detecting spending patterns',
  'Building financial insights',
  'Predicting cash flow',
  'Saving to secure storage',
  'Analysis complete',
];

function stableId(date: string, description: string, amount: number): string {
  const key = `${date}_${description}_${amount.toFixed(2)}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h) ^ key.charCodeAt(i);
    h >>>= 0;
  }
  return `tx_${h.toString(36)}`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function UploadScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [pdfUri, setPdfUri]         = useState<string | null>(null);
  const [imageUri, setImageUri]     = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState<BankType | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [pendingMode, setPendingMode] = useState<InputMode>('pdf');
  const [steps, setSteps]           = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [stepDetail, setStepDetail] = useState('');

  const advanceStep = (i: number, detail = '') => {
    setCurrentStepIndex(i);
    setStepDetail(detail);
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/dashboard');
  };

  const handlePickMode = (mode: InputMode) => {
    setPendingMode(mode);
    setShowBankPicker(true);
  };

  const handleBankSelected = async (bank: BankType) => {
    setSelectedBank(bank);
    setShowBankPicker(false);

    const modeSteps = pendingMode === 'pdf' ? PDF_STEPS : PHOTO_STEPS;
    setSteps(modeSteps);
    setProcessingState('preparing');
    advanceStep(0);

    await new Promise(r => setTimeout(r, 420));

    try {
      if (pendingMode === 'pdf') {
        await ensurePdfJsReady();
        const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
        if (result.canceled) { setProcessingState('idle'); advanceStep(-1); return; }
        setProcessingState('reading');
        advanceStep(1);
        setPdfUri(result.assets[0].uri);

      } else {
        // ── Camera path ───────────────────────────────────────────────────────
        // 1. Permission check FIRST — before any heavy initialisation
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          setProcessingState('idle'); advanceStep(-1);
          Alert.alert(
            'Camera Access Required',
            'ClearMoney needs camera access to photograph your paper statement. Please enable it in Settings → Privacy → Camera.',
            [{ text: 'OK' }]
          );
          return;
        }

        // 2. Open the camera immediately — user should not wait for OCR init
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          quality: 0.92,
          allowsEditing: false,
        });

        if (result.canceled) { setProcessingState('idle'); advanceStep(-1); return; }

        // 3. NOW initialise the OCR engine (step 0 = "Initializing OCR engine")
        //    User sees the processing screen while this loads
        await ensureOCRReady();

        setProcessingState('reading');
        advanceStep(1);
        setImageUri(result.assets[0].uri);
      }
    } catch (e: any) {
      setProcessingState('idle'); advanceStep(-1);
      if (e?.message?.includes('network') || e?.message?.includes('fetch')) {
        Alert.alert('No internet', 'Internet connection required to set up the engine on first use.');
      } else {
        Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
      }
    }
  };

  const handleTextExtracted = async (text: string) => {
    if (!selectedBank) return;
    try {
      advanceStep(2);
      const transactions = await parseBankStatement(text, selectedBank);

      if (transactions.length === 0) {
        setProcessingState('idle'); setPdfUri(null); setImageUri(null); advanceStep(-1);
        alert(`No transactions found. Make sure you selected the right bank (${BANK_LABELS[selectedBank]}).`);
        return;
      }

      advanceStep(3);
      setProcessingState('categorizing');

      advanceStep(4);
      const ruleHits: Map<number, ReturnType<typeof tryRuleCategorize>> = new Map();
      const unknownIndexes: number[] = [];
      for (let i = 0; i < transactions.length; i++) {
        const hit = tryRuleCategorize(transactions[i].description);
        if (hit) ruleHits.set(i, hit);
        else unknownIndexes.push(i);
      }

      const aiResults: Map<number, any> = new Map();
      if (unknownIndexes.length > 0) {
        advanceStep(5, `0 / ${unknownIndexes.length} merchants`);
        const batchResults = await batchCategorize(
          unknownIndexes.map(i => transactions[i].description),
          (done, total) => advanceStep(5, `${done} / ${total} merchants`)
        );
        unknownIndexes.forEach((txIdx, j) => { if (batchResults[j]) aiResults.set(txIdx, batchResults[j]); });
      }

      advanceStep(6);
      const fullTransactions: any[] = transactions.map((t: any, i: number) => {
        const r = ruleHits.get(i) ?? aiResults.get(i);
        return {
          id: stableId(t.date, t.description, t.amount),
          date: t.date, amount: t.amount, description: t.description,
          merchant: r?.merchant_clean || t.merchant_clean || t.description,
          category: r?.category || 'Other',
          subcategory: null,
          is_subscription: !!r?.is_subscription,
          is_recurring: !!r?.is_recurring,
          type: t.type, bank: selectedBank,
        };
      });

      const existingTxs = await getTransactions();
      const merged = detectInternalTransfers([...existingTxs, ...fullTransactions]);
      const updatedBatch = merged.filter(t => fullTransactions.some((f: any) => f.id === t.id));
      await insertTransactions(updatedBatch);

      const filename = (pdfUri ?? imageUri)?.split('/').pop() ?? 'statement';
      await recordUpload({
        id: `upload_${Date.now()}`,
        bank: selectedBank, filename,
        transaction_count: fullTransactions.length,
        uploaded_at: new Date().toISOString(),
      });

      setProcessingState('analyzing');
      advanceStep(7);

      const debits = fullTransactions.filter((t: any) => t.type === 'debit');
      const categoryTotals = debits.reduce((acc: Record<string, number>, t: any) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount; return acc;
      }, {});

      const insights: any[] = [];
      try {
        advanceStep(8);
        const behavior = await analyzeBehavior({
          categoryTotals,
          transactionCount: fullTransactions.length,
          topTransactions: [...debits].sort((a: any, b: any) => b.amount - a.amount).slice(0, 10),
        });
        behavior?.patterns?.forEach((p: any, i: number) => insights.push({
          id: `insight_behavior_${Date.now()}_${i}`,
          severity: p.severity ?? 'info', type_label: p.type_label ?? 'Pattern',
          title: p.title ?? '', description: p.description ?? '',
          impact_amount: p.impact_amount ?? null, action_label: p.action_label ?? null,
          created_at: new Date().toISOString(),
        }));
      } catch (e) { console.warn('Behavior analysis failed:', e); }

      try {
        advanceStep(9);
        const currentMonth = new Date().toISOString().substring(0, 7);
        const prediction = await predictCashFlow(
          { transactions: fullTransactions.filter((t: any) => t.date.startsWith(currentMonth)), categoryTotals },
          { allTime: categoryTotals }
        );
        if (prediction?.will_run_short) insights.push({
          id: `insight_cashflow_${Date.now()}`,
          severity: 'danger', type_label: 'Cash Flow Warning',
          title: 'You may run short before payday',
          description: prediction.message ?? '',
          impact_amount: null, action_label: 'Review Budget',
          created_at: new Date().toISOString(),
        });
      } catch (e) { console.warn('Cash flow prediction failed:', e); }

      if (insights.length === 0 && debits.length > 0) {
        const biggest = debits.reduce((m: any, t: any) => t.amount > m.amount ? t : m, debits[0]);
        insights.push({
          id: `insight_fallback_${Date.now()}`,
          severity: 'warning', type_label: 'Large Expense',
          title: `High spend: ${biggest.merchant}`,
          description: `$${biggest.amount.toFixed(2)} at ${biggest.merchant} on ${biggest.date}.`,
          impact_amount: biggest.amount, action_label: 'Review Budget',
          created_at: new Date().toISOString(),
        });
      }

      advanceStep(10);
      if (insights.length > 0) await insertInsights(insights);

      advanceStep(11);
      setProcessingState('done');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPdfUri(null); setImageUri(null);
      await new Promise(r => setTimeout(r, 1400));
      router.replace('/(tabs)/dashboard');
    } catch (e) {
      console.error('Processing error:', e);
      setProcessingState('idle'); advanceStep(-1);
      setPdfUri(null); setImageUri(null);
    }
  };

  const handleExtractError = (err: string) => {
    console.error('Extract error:', err);
    setProcessingState('idle'); advanceStep(-1);
    setPdfUri(null); setImageUri(null);
  };

  const isProcessing = processingState !== 'idle';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>

      {/* ── Bank picker modal ── */}
      <Modal visible={showBankPicker} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowBankPicker(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Select your bank</Text>
            {BANKS.map(bank => (
              <TouchableOpacity
                key={bank}
                style={[styles.bankRow, { borderBottomColor: colors.border }]}
                onPress={() => handleBankSelected(bank)}
              >
                <Text style={[styles.bankRowLabel, { color: colors.text }]}>{BANK_LABELS[bank]}</Text>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.logoRow}>
          <CheckCircle2 size={18} color="#3B82F6" />
          <Text style={[styles.logoText, { color: colors.text }]}>Clear Money</Text>
        </View>
      </View>

      {isProcessing ? (
        <View style={styles.processingWrapper}>
          <PulsingOrb />
          <Text style={[styles.processingTitle, { color: colors.text }]}>Analyzing your finances</Text>
          <Text style={[styles.processingSubtitle, { color: colors.textSecondary }]}>
            On device · never uploaded
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StepList
            steps={steps}
            currentIndex={currentStepIndex}
            stepDetail={stepDetail}
            colors={colors}
          />
        </View>
      ) : (
        <View style={styles.idleWrapper}>
          <View style={styles.mainContent}>
            <Text style={[styles.titleMain, { color: colors.text }]}>Add a statement.</Text>
            <Text style={[styles.titleSub, { color: colors.textSecondary }]}>Analyzed locally. 🔐</Text>
            <View style={styles.privacyBadge}>
              <View style={styles.blueDot} />
              <Text style={styles.privacyText}>Your data never leaves your phone</Text>
            </View>
          </View>

          <View style={styles.bottomSection}>
            <TouchableOpacity style={styles.uploadButton} onPress={() => handlePickMode('pdf')}>
              <FileText size={20} color="#FFFFFF" style={styles.btnIcon} />
              <Text style={styles.uploadButtonText}>Upload PDF statement</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.uploadButton, styles.secondaryButton, { borderColor: colors.primary ?? '#3B82F6' }]}
              onPress={() => handlePickMode('photo')}
            >
              <Camera size={20} color={colors.primary ?? '#3B82F6'} style={styles.btnIcon} />
              <Text style={[styles.uploadButtonText, { color: colors.primary ?? '#3B82F6' }]}>
                Photo of paper statement
              </Text>
            </TouchableOpacity>

            <Text style={styles.supportedLabel}>SUPPORTED</Text>
            <Text style={[styles.supportedBanks, { color: colors.textSecondary }]}>
              Chase · Bank of America · Wells Fargo · Citi
            </Text>
            <View style={styles.offlineBadge}>
              <View style={styles.blueDot} />
              <Text style={styles.offlineText}>Gemma 4 · on device</Text>
            </View>
          </View>
        </View>
      )}

      {pdfUri   && <HiddenPdfExtractor uri={pdfUri}   onExtracted={handleTextExtracted} onError={handleExtractError} />}
      {imageUri && <HiddenImageOCR     uri={imageUri} onExtracted={handleTextExtracted} onError={handleExtractError} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  header:     { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 4 },
  backBtn:    { padding: 8, marginRight: 8, marginLeft: -8 },
  logoRow:    { flexDirection: 'row', alignItems: 'center' },
  logoText:   { fontSize: 18, fontFamily: Fonts.semiBold, marginLeft: 10 },

  // ── Processing ──
  processingWrapper:  { flex: 1, alignItems: 'center', paddingTop: 32 },
  processingTitle:    { fontSize: 24, fontFamily: Fonts.serif, letterSpacing: -0.3, marginTop: 28, marginBottom: 6 },
  processingSubtitle: { fontSize: 13, fontFamily: Fonts.regular, marginBottom: 28 },
  divider:            { width: '100%', height: StyleSheet.hairlineWidth, marginBottom: 8 },

  // ── Idle ──
  idleWrapper:  { flex: 1, justifyContent: 'space-between' },
  mainContent:  { flex: 1, justifyContent: 'flex-start', paddingTop: 60 },
  titleMain:    { fontSize: 46, fontFamily: Fonts.serif,     letterSpacing: -1.5, lineHeight: 54 },
  titleSub:     { fontSize: 46, fontFamily: Fonts.serifSemi, letterSpacing: -1.5, lineHeight: 54, marginBottom: 28 },
  privacyBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.07)',
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)', alignSelf: 'flex-start',
  },
  blueDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6', marginRight: 10 },
  privacyText:{ color: '#3B82F6', fontSize: 14, fontFamily: Fonts.medium },

  bottomSection:    { alignItems: 'center', paddingBottom: 32, width: '100%' },
  uploadButton: {
    backgroundColor: '#3B82F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: '100%', paddingVertical: 17, borderRadius: 16, marginBottom: 12,
    shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
  },
  secondaryButton:  { backgroundColor: 'transparent', borderWidth: 1.5, shadowOpacity: 0 },
  btnIcon:          { marginRight: 10 },
  uploadButtonText: { color: '#FFFFFF', fontSize: 16, fontFamily: Fonts.semiBold },
  supportedLabel:   { color: '#4B5563', fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 2, marginBottom: 6, marginTop: 20 },
  supportedBanks:   { fontSize: 13, fontFamily: Fonts.regular, marginBottom: 20 },
  offlineBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.05)',
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
  },
  offlineText: { color: '#3B82F6', fontSize: 12, fontFamily: Fonts.medium },

  // ── Modal ──
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 24, paddingBottom: 48, paddingHorizontal: 24, borderWidth: 1 },
  sheetTitle:   { fontSize: 20, fontFamily: Fonts.serifSemi, marginBottom: 20 },
  bankRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, borderBottomWidth: 1 },
  bankRowLabel: { fontSize: 17, fontFamily: Fonts.medium },
});
