import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Dimensions, Pressable,
  TextInput, TouchableOpacity, Animated, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ShieldCheck, Zap, Bell, ChevronRight, Check, ArrowRight,
} from 'lucide-react-native';
import { createModelDownload } from '../src/gemma/downloadManager';
import { saveUserProfile } from '../src/db/transactions';
import { Fonts } from '../src/components/Typography';
import { BankType, BANK_LABELS } from '../src/parsers/index';

const { width: W, height: H } = Dimensions.get('window');
const BANKS: BankType[] = ['chase', 'bofa', 'wellsfargo', 'citi'];

const BANK_COLORS: Record<BankType, { bg: string; text: string; border: string }> = {
  chase:      { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  bofa:       { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
  wellsfargo: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  citi:       { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
};

// ─── Notification helpers (lazy — won't crash if native module not linked) ─────

async function requestNotifPermission(): Promise<boolean> {
  try {
    const N = await import('expo-notifications');
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
      }),
    });
    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

async function sendReadyNotification(aiName: string): Promise<void> {
  try {
    const N = await import('expo-notifications');
    await N.scheduleNotificationAsync({
      content: {
        title: `${aiName || 'Your AI'} is ready! 🎉`,
        body: 'Open ClearMoney — your AI is set up and ready to simplify your finances.',
      },
      trigger: null,
    });
  } catch { /* silently skip */ }
}

// ─── Slide illustrations ───────────────────────────────────────────────────────

function PrivacyIllustration() {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const lockFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeRing = (anim: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
    const r1 = makeRing(ring1, 0);
    const r2 = makeRing(ring2, 600);
    const r3 = makeRing(ring3, 1200);
    r1.start(); r2.start(); r3.start();
    const float = Animated.loop(Animated.sequence([
      Animated.timing(lockFloat, { toValue: -10, duration: 1600, useNativeDriver: true }),
      Animated.timing(lockFloat, { toValue: 0, duration: 1600, useNativeDriver: true }),
    ]));
    float.start();
    return () => { r1.stop(); r2.stop(); r3.stop(); float.stop(); };
  }, []);

  const ringStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.35, 0.08, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] }) }],
  });

  const BADGES = [
    { label: 'ENCRYPTED', top: '18%', left: '5%', angle: '-8deg' },
    { label: 'ON-DEVICE', top: '22%', right: '4%', angle: '6deg' },
    { label: 'ZERO UPLOAD', bottom: '24%', left: '2%', angle: '5deg' },
    { label: 'PRIVATE', bottom: '20%', right: '6%', angle: '-7deg' },
  ];

  return (
    <View style={ill.container}>
      <View style={ill.ringWrap}>
        {[ring1, ring2, ring3].map((r, i) => (
          <Animated.View key={i} style={[ill.ring, { borderColor: '#3B82F6' }, ringStyle(r)]} />
        ))}
        <Animated.View style={[ill.orb, { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.35)' }, { transform: [{ translateY: lockFloat }] }]}>
          <ShieldCheck size={52} color="#3B82F6" strokeWidth={1.5} />
        </Animated.View>
      </View>
      {BADGES.map((b, i) => (
        <View key={i} style={[ill.badge, { top: b.top as any, left: b.left as any, right: b.right as any, bottom: b.bottom as any, transform: [{ rotate: b.angle }] }]}>
          <Text style={[ill.badgeText, { color: '#3B82F6' }]}>{b.label}</Text>
        </View>
      ))}
    </View>
  );
}

function CategorizeIllustration() {
  const BARS = [
    { label: 'Food', color: '#10B981', targetH: 90 },
    { label: 'Shop', color: '#8B5CF6', targetH: 120 },
    { label: 'Bills', color: '#F59E0B', targetH: 65 },
    { label: 'Travel', color: '#3B82F6', targetH: 150 },
    { label: 'Subs', color: '#EC4899', targetH: 80 },
  ];
  const anims = useRef(BARS.map(() => new Animated.Value(0))).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    BARS.forEach((_, i) => {
      Animated.timing(anims[i], { toValue: 1, duration: 700, delay: 200 + i * 120, useNativeDriver: false }).start();
    });
  }, []);

  return (
    <Animated.View style={[ill.container, { opacity: fade }]}>
      <View style={ill.chartCard}>
        <Text style={ill.chartLabel}>Your spending breakdown</Text>
        <View style={ill.barsRow}>
          {BARS.map((bar, i) => (
            <View key={i} style={ill.barCol}>
              <View style={[ill.barTrack, { height: 160 }]}>
                <Animated.View style={[ill.bar, {
                  backgroundColor: bar.color,
                  height: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, bar.targetH] }),
                }]} />
              </View>
              <Text style={ill.barLabel}>{bar.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={ill.aiTag}>
        <Zap size={11} color="#3B82F6" fill="#3B82F6" />
        <Text style={ill.aiTagText}>AI-categorized automatically</Text>
      </View>
    </Animated.View>
  );
}

function SubscriptionIllustration() {
  const SUBS = [
    { letter: 'N', color: '#EF4444', name: 'Netflix', price: '$15.99' },
    { letter: 'S', color: '#1DB954', name: 'Spotify', price: '$9.99' },
    { letter: 'A', color: '#FF9900', name: 'Amazon', price: '$14.99' },
    { letter: 'Y', color: '#0F9D58', name: 'YouTube', price: '$13.99' },
    { letter: 'H', color: '#1CE783', name: 'Hulu', price: '$7.99' },
    { letter: 'D', color: '#00A8E0', name: 'Disney+', price: '$10.99' },
  ];
  const anims = useRef(SUBS.map(() => new Animated.Value(1))).current;
  const savings = useRef(new Animated.Value(0)).current;
  const counter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const strikes = [1, 3, 4];
    strikes.forEach((idx, i) => {
      Animated.timing(anims[idx], { toValue: 0.35, duration: 400, delay: 1000 + i * 600, useNativeDriver: true }).start();
    });
    Animated.timing(savings, { toValue: 1, duration: 400, delay: 800, useNativeDriver: true }).start();
    Animated.timing(counter, { toValue: 38.97, duration: 1800, delay: 900, useNativeDriver: false }).start();
  }, []);

  return (
    <View style={ill.container}>
      <View style={ill.subGrid}>
        {SUBS.map((sub, i) => (
          <Animated.View key={i} style={[ill.subIcon, { backgroundColor: sub.color, opacity: anims[i] }]}>
            <Text style={ill.subLetter}>{sub.letter}</Text>
            <Text style={ill.subPrice}>{sub.price}</Text>
          </Animated.View>
        ))}
      </View>
      <Animated.View style={[ill.savingsBadge, { opacity: savings }]}>
        <Text style={ill.savingsLabel}>Potential savings</Text>
        <Animated.Text style={ill.savingsValue}>
          {counter.interpolate({ inputRange: [0, 38.97], outputRange: ['$0.00', '$38.97'] })}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

function CashFlowIllustration() {
  const POINTS = [0.6, 0.45, 0.7, 0.3, 0.55, 0.2, 0.5];
  const lineAnim = useRef(new Animated.Value(0)).current;
  const warnAnim = useRef(new Animated.Value(0)).current;
  const dotBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(lineAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
      Animated.timing(warnAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    Animated.loop(Animated.sequence([
      Animated.timing(dotBounce, { toValue: -8, duration: 500, useNativeDriver: true }),
      Animated.timing(dotBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
    ])).start();
  }, []);

  const chartH = 130;
  const chartW = W * 0.72;
  const segW = chartW / (POINTS.length - 1);

  return (
    <View style={ill.container}>
      <View style={ill.cashCard}>
        <Text style={ill.chartLabel}>30-day cash flow</Text>
        <View style={{ height: chartH, width: chartW, position: 'relative' }}>
          <View style={[ill.dangerZone, { height: chartH * 0.28, bottom: 0, width: chartW }]} />
          {POINTS.slice(0, -1).map((pt, i) => {
            const x1 = i * segW, y1 = chartH * (1 - pt);
            const x2 = (i + 1) * segW, y2 = chartH * (1 - POINTS[i + 1]);
            const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
            return (
              <Animated.View key={i} style={{
                position: 'absolute', left: x1, top: y1,
                width: lineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, len] }),
                height: 2.5, backgroundColor: POINTS[i + 1] < 0.28 ? '#EF4444' : '#3B82F6',
                borderRadius: 2,
                transform: [{ rotate: `${angle}deg` }],
              }} />
            );
          })}
          {POINTS.map((pt, i) => (
            <View key={i} style={[ill.cashDot, { left: i * segW - 4, top: chartH * (1 - pt) - 4, backgroundColor: pt < 0.28 ? '#EF4444' : '#3B82F6' }]} />
          ))}
          <Animated.View style={[ill.warnBadge, { opacity: warnAnim, transform: [{ translateY: dotBounce }] }]}>
            <Text style={ill.warnText}>⚠ Low on day 6</Text>
          </Animated.View>
        </View>
        <View style={ill.paydayRow}>
          <View style={ill.paydayBadge}><Text style={ill.paydayText}>💰 Payday</Text></View>
          <Text style={ill.paydayDate}>in 8 days</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Setup looping illustration ────────────────────────────────────────────────

function SetupIllustration() {
  const orbit0 = useRef(new Animated.Value(0)).current;
  const orbit1 = useRef(new Animated.Value(0)).current;
  const orbit2 = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Orbiting particles at different speeds
    Animated.loop(Animated.timing(orbit0, { toValue: 1, duration: 2200, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(orbit1, { toValue: 1, duration: 3600, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(orbit2, { toValue: -1, duration: 5000, useNativeDriver: true })).start();

    // Center orb gentle pulse
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.12, duration: 1100, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1.0, duration: 1100, useNativeDriver: true }),
    ])).start();

    // Ring ripples
    const makeRing = (anim: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
    makeRing(ring1, 0).start();
    makeRing(ring2, 900).start();
  }, []);

  const toRot = (anim: Animated.Value) =>
    anim.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-360deg', '0deg', '360deg'] });

  const ringStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 0.2, 0.7, 1], outputRange: [0, 0.45, 0.1, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.1] }) }],
  });

  return (
    <View style={setupIll.wrap}>
      {/* Ring pulses */}
      <Animated.View style={[setupIll.ring, { borderColor: '#3B82F6' }, ringStyle(ring1)]} />
      <Animated.View style={[setupIll.ring, { borderColor: '#8B5CF6' }, ringStyle(ring2)]} />

      {/* Orbit 0: blue dot, inner */}
      <View style={setupIll.orbitAnchor}>
        <Animated.View style={{ transform: [{ rotate: toRot(orbit0) }, { translateX: 54 }] }}>
          <View style={[setupIll.orbitDot, { backgroundColor: '#3B82F6', width: 10, height: 10, borderRadius: 5 }]} />
        </Animated.View>
      </View>

      {/* Orbit 1: purple dot, middle */}
      <View style={setupIll.orbitAnchor}>
        <Animated.View style={{ transform: [{ rotate: toRot(orbit1) }, { translateX: 78 }] }}>
          <View style={[setupIll.orbitDot, { backgroundColor: '#8B5CF6', width: 8, height: 8, borderRadius: 4 }]} />
        </Animated.View>
      </View>

      {/* Orbit 2: green dot, outer (counter-clockwise) */}
      <View style={setupIll.orbitAnchor}>
        <Animated.View style={{ transform: [{ rotate: toRot(orbit2) }, { translateX: 100 }] }}>
          <View style={[setupIll.orbitDot, { backgroundColor: '#10B981', width: 7, height: 7, borderRadius: 3.5 }]} />
        </Animated.View>
      </View>

      {/* Center orb */}
      <Animated.View style={[setupIll.centerOrb, { transform: [{ scale: pulse }] }]}>
        <Zap size={34} color="#3B82F6" fill="rgba(59,130,246,0.18)" />
      </Animated.View>
    </View>
  );
}

// ─── Slide data ────────────────────────────────────────────────────────────────

const SLIDES = [
  { id: 'privacy',       headline: 'Your money.\nYour phone.\nPeriod.',       sub: 'Zero servers. Zero uploads.\nEverything stays on this device.',                  accent: '#3B82F6', Illustration: PrivacyIllustration },
  { id: 'categorize',    headline: 'Every dollar,\nexplained.',                sub: 'AI reads your bank statement and\ncategorizes spending automatically.',          accent: '#8B5CF6', Illustration: CategorizeIllustration },
  { id: 'subscriptions', headline: 'Stop the\nsilent drain.',                  sub: 'Find subscriptions quietly taking\nmoney from your account each month.',         accent: '#F59E0B', Illustration: SubscriptionIllustration },
  { id: 'cashflow',      headline: 'See it\ncoming.',                          sub: 'Know your cash position before\nyou run short before payday.',                   accent: '#10B981', Illustration: CashFlowIllustration },
];

// ─── Confetti ──────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#3B82F6', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4'];

function Confetti() {
  const particles = useRef(
    Array.from({ length: 44 }, (_, i) => ({
      x: (W / 44) * i + Math.random() * (W / 44),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 8,
      isSquare: Math.random() > 0.5,
      anim: new Animated.Value(0),
      drift: (Math.random() - 0.5) * 100,
      delay: Math.random() * 500,
      speed: 1000 + Math.random() * 800,
    }))
  ).current;

  useEffect(() => {
    particles.forEach(p => {
      Animated.timing(p.anim, { toValue: 1, duration: p.speed, delay: p.delay, useNativeDriver: true }).start();
    });
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', left: p.x, top: H + 40,
          width: p.size, height: p.size * (p.isSquare ? 1 : 1.5),
          borderRadius: p.isSquare ? 2 : p.size / 2,
          backgroundColor: p.color,
          opacity: p.anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.9, 0] }),
          transform: [
            { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -(H + 220)] }) },
            { translateX: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
            { rotate: p.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${Math.random() > 0.5 ? '' : '-'}${360 + Math.random() * 360}deg`] }) },
          ],
        }} />
      ))}
    </View>
  );
}

// ─── Main onboarding screen ────────────────────────────────────────────────────

type Step = 'slides' | 'questions' | 'setup' | 'complete';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep]                         = useState<Step>('slides');
  const [slideIndex, setSlideIndex]             = useState(0);
  const [downloadStarted, setDownloadStarted]   = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadDone, setDownloadDone]         = useState(false);

  // Questions state
  const [qIndex, setQIndex]                     = useState(0);  // 0=name, 1=aiName, 2=bank, 3=income
  const [userName, setUserName]                 = useState('');
  const [aiName, setAiName]                     = useState('');
  const [selectedBank, setSelectedBank]         = useState<BankType | null>(null);
  const [monthlyIncome, setMonthlyIncome]       = useState('');
  const [notifGranted, setNotifGranted]         = useState(false);
  const [notifAsked, setNotifAsked]             = useState(false);

  const flatRef = useRef<FlatList>(null);
  const downloadRef = useRef<any>(null);
  // Refs so the download callback always reads the latest values (no stale closures)
  const notifGrantedRef = useRef(false);
  const aiNameRef       = useRef('');

  // Slide entrance / transition animations
  const slideIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    slideIn.setValue(0);
    Animated.spring(slideIn, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }).start();
  }, [step]);

  // Question card transition animation
  const qSlide = useRef(new Animated.Value(0)).current;
  const qFade  = useRef(new Animated.Value(1)).current;

  const transitionQuestion = useCallback((nextIndex: number, dir: 1 | -1) => {
    const outX = dir * -W * 0.3;
    const inX  = dir * W * 0.35;
    Animated.parallel([
      Animated.timing(qSlide, { toValue: outX, duration: 180, useNativeDriver: true }),
      Animated.timing(qFade,  { toValue: 0,    duration: 150, useNativeDriver: true }),
    ]).start(() => {
      qSlide.setValue(inX);
      setQIndex(nextIndex);
      Animated.parallel([
        Animated.spring(qSlide, { toValue: 0, tension: 70, friction: 11, useNativeDriver: true }),
        Animated.timing(qFade,  { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  // Keep refs in sync so download callback always reads latest values
  useEffect(() => { aiNameRef.current = aiName; }, [aiName]);
  useEffect(() => { notifGrantedRef.current = notifGranted; }, [notifGranted]);

  // ── Start download silently on first Next press ──
  const startDownload = useCallback(() => {
    if (downloadStarted) return;
    setDownloadStarted(true);
    const dl = createModelDownload((progress) => setDownloadProgress(progress));
    downloadRef.current = dl;
    dl.downloadAsync()
      .then(() => {
        setDownloadDone(true);
        // Use refs — these are always current even inside this old closure
        if (notifGrantedRef.current) {
          sendReadyNotification(aiNameRef.current || 'Your AI');
        }
      })
      .catch((e) => console.log('[Download] Error:', e?.message));
  }, [downloadStarted]); // intentionally no aiName/notifGranted deps — use refs

  // ── Auto-advance to complete once download finishes (while on setup screen) ──
  useEffect(() => {
    if (step !== 'setup' || !downloadDone) return;
    const t = setTimeout(() => setStep('complete'), 700);
    return () => clearTimeout(t);
  }, [downloadDone, step]);

  // ── Navigate through intro slides ──
  const handleNext = useCallback(() => {
    if (slideIndex === 0) startDownload();
    if (slideIndex < SLIDES.length - 1) {
      const next = slideIndex + 1;
      setSlideIndex(next);
      flatRef.current?.scrollToIndex({ index: next, animated: true });
    } else {
      setStep('questions');
    }
  }, [slideIndex, startDownload]);

  const handleBack = useCallback(() => {
    if (slideIndex > 0) {
      const prev = slideIndex - 1;
      setSlideIndex(prev);
      flatRef.current?.scrollToIndex({ index: prev, animated: true });
    }
  }, [slideIndex]);

  // ── Question navigation ──
  const handleQNext = useCallback(() => {
    if (qIndex < 3) {
      transitionQuestion(qIndex + 1, 1);
    } else {
      handleQuestionsSubmit();
    }
  }, [qIndex, transitionQuestion]);

  const handleQBack = useCallback(() => {
    if (qIndex > 0) transitionQuestion(qIndex - 1, -1);
    else setStep('slides');
  }, [qIndex, transitionQuestion]);

  // ── Submit questions → setup ──
  const handleQuestionsSubmit = useCallback(async () => {
    const data: Record<string, string> = { onboarding_complete: '1' };
    if (userName.trim())     data.name           = userName.trim();
    if (aiName.trim())       data.ai_name        = aiName.trim();
    if (selectedBank)        data.bank           = selectedBank;
    if (monthlyIncome.trim()) data.monthly_income = monthlyIncome.trim();
    await saveUserProfile(data);
    setStep('setup');
  }, [userName, aiName, selectedBank, monthlyIncome]);

  // ── Notification request — just record permission, download drives the transition ──
  const requestNotifications = useCallback(async () => {
    const granted = await requestNotifPermission();
    notifGrantedRef.current = granted;
    setNotifGranted(granted);
    setNotifAsked(true);
    // If download already finished while user was on this screen, advance now
    if (downloadDone) {
      if (granted) sendReadyNotification(aiNameRef.current || 'Your AI');
      setTimeout(() => setStep('complete'), 700);
    }
    // Otherwise, the downloadDone useEffect above will fire when it's ready
  }, [downloadDone]);

  const skipNotif = useCallback(() => {
    setNotifAsked(true);
    // Same: only advance if download is already done
    if (downloadDone) setTimeout(() => setStep('complete'), 400);
  }, [downloadDone]);

  // ── After complete, go to index (which routes correctly) ──
  const handleEnterApp = useCallback(() => {
    router.replace('/');
  }, [router]);

  // ─── RENDER: Slides ──────────────────────────────────────────────────────────
  if (step === 'slides') {
    return (
      <View style={{ flex: 1, backgroundColor: '#F2F5FF' }}>
        <FlatList
          ref={flatRef}
          data={SLIDES}
          horizontal pagingEnabled scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const { Illustration, headline, sub } = item;
            return (
              <View style={{ width: W, height: H, backgroundColor: '#F2F5FF' }}>
                <View style={{ height: H * 0.56, alignItems: 'center', justifyContent: 'center' }}>
                  <Illustration />
                </View>
                <View style={s.slideTextArea}>
                  <Text style={s.headline}>{headline}</Text>
                  <Text style={s.sub}>{sub}</Text>
                </View>
              </View>
            );
          }}
        />
        <View style={[s.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.dotsRow}>
            {SLIDES.map((sl, i) => (
              <View key={i} style={[s.slideDot, {
                backgroundColor: i === slideIndex ? SLIDES[slideIndex].accent : 'rgba(0,0,0,0.12)',
                width: i === slideIndex ? 24 : 7,
              }]} />
            ))}
          </View>
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: SLIDES[slideIndex].accent }]} onPress={handleNext} activeOpacity={0.85}>
            <Text style={s.nextBtnText}>{slideIndex === SLIDES.length - 1 ? 'Get started' : 'Next'}</Text>
            <ChevronRight size={18} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
          {slideIndex > 0 && (
            <TouchableOpacity onPress={handleBack} style={s.backLink}>
              <Text style={s.backLinkText}>Back</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ─── RENDER: Questions (conversational, one at a time) ───────────────────────
  if (step === 'questions') {
    const Q_LABELS   = ['Your name', 'Name your AI', 'Your primary bank', 'Monthly income'];
    const Q_PROMPTS  = [
      'What should\nwe call you?',
      'Give your AI\na name.',
      'Which bank\ndo you use?',
      'Monthly\ntake-home?',
    ];
    const Q_SUBS = [
      'So we can personalize\neverything just for you.',
      `Something personal — like "Penny",\n"Max", "Aria", or anything you like.`,
      'So we know how to read\nyour bank statements.',
      'Optional — helps us give smarter\nbudget recommendations.',
    ];

    const canContinue = [
      !!userName.trim(),
      !!aiName.trim(),
      !!selectedBank,
      true, // income is optional
    ][qIndex];

    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#F2F5FF' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Progress bar */}
          <View style={q.progressRow}>
            <TouchableOpacity onPress={handleQBack} hitSlop={12} style={q.backBtn}>
              <Text style={q.backBtnText}>‹ Back</Text>
            </TouchableOpacity>
            <View style={q.dots}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={[q.dot, { backgroundColor: i <= qIndex ? '#3B82F6' : '#E4E8F7', width: i === qIndex ? 20 : 8 }]} />
              ))}
            </View>
            <Text style={q.stepLabel}>{qIndex + 1} / 4</Text>
          </View>

          {/* Previous answer recap */}
          {qIndex > 0 && (
            <View style={q.recapRow}>
              {qIndex >= 1 && userName.trim() ? <View style={q.recapChip}><Text style={q.recapText}>👋 {userName.trim()}</Text></View> : null}
              {qIndex >= 2 && aiName.trim()   ? <View style={q.recapChip}><Text style={q.recapText}>🤖 {aiName.trim()}</Text></View>   : null}
              {qIndex >= 3 && selectedBank    ? <View style={q.recapChip}><Text style={q.recapText}>🏦 {BANK_LABELS[selectedBank]}</Text></View> : null}
            </View>
          )}

          <ScrollView contentContainerStyle={[q.scroll, { paddingBottom: insets.bottom + 100 }]} keyboardShouldPersistTaps="handled">
            <Animated.View style={{ transform: [{ translateX: qSlide }], opacity: qFade }}>

              {/* Question */}
              <Text style={q.prompt}>{Q_PROMPTS[qIndex]}</Text>
              <Text style={q.promptSub}>{Q_SUBS[qIndex]}</Text>

              {/* Q0: Name input */}
              {qIndex === 0 && (
                <TextInput
                  style={q.bigInput}
                  placeholder="First name"
                  placeholderTextColor="#C4CCDA"
                  value={userName}
                  onChangeText={setUserName}
                  autoCapitalize="words"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={canContinue ? handleQNext : undefined}
                />
              )}

              {/* Q1: AI Name input + live preview */}
              {qIndex === 1 && (
                <View>
                  <TextInput
                    style={q.bigInput}
                    placeholder="e.g. Penny, Max, Aria…"
                    placeholderTextColor="#C4CCDA"
                    value={aiName}
                    onChangeText={setAiName}
                    autoCapitalize="words"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={canContinue ? handleQNext : undefined}
                  />
                  {aiName.trim() ? (
                    <View style={q.previewCard}>
                      <Text style={q.previewEmoji}>✨</Text>
                      <Text style={q.previewText}>
                        <Text style={{ fontFamily: Fonts.semiBold, color: '#3B82F6' }}>"{aiName.trim()}"</Text>
                        {userName.trim() ? ` is ready, ${userName.trim()}!` : ' is ready to simplify your finances.'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={q.inputHint}>Give it a name — it'll feel much more personal</Text>
                  )}
                </View>
              )}

              {/* Q2: Bank cards */}
              {qIndex === 2 && (
                <View style={q.bankGrid}>
                  {BANKS.map(bank => {
                    const active = selectedBank === bank;
                    const col = BANK_COLORS[bank];
                    return (
                      <TouchableOpacity
                        key={bank}
                        style={[q.bankCard, { backgroundColor: active ? col.bg : '#FFFFFF', borderColor: active ? col.border : '#E4E8F7' }]}
                        onPress={() => {
                          setSelectedBank(bank);
                          // Auto-advance after a tiny beat
                          setTimeout(() => transitionQuestion(3, 1), 400);
                        }}
                        activeOpacity={0.75}
                      >
                        {active && (
                          <View style={[q.bankCheck, { backgroundColor: col.text }]}>
                            <Check size={11} color="#FFFFFF" strokeWidth={3} />
                          </View>
                        )}
                        <Text style={[q.bankCardText, { color: active ? col.text : '#374151' }]}>
                          {BANK_LABELS[bank]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Q3: Income input + skip */}
              {qIndex === 3 && (
                <View>
                  <View style={q.incomeRow}>
                    <View style={q.incomePrefix}>
                      <Text style={q.incomePrefixText}>$</Text>
                    </View>
                    <TextInput
                      style={[q.bigInput, { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftWidth: 0 }]}
                      placeholder="5,000"
                      placeholderTextColor="#C4CCDA"
                      value={monthlyIncome}
                      onChangeText={setMonthlyIncome}
                      keyboardType="decimal-pad"
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleQNext}
                    />
                  </View>
                  <Text style={q.inputHint}>Helps us give smarter budget recommendations</Text>
                </View>
              )}

            </Animated.View>
          </ScrollView>

          {/* Continue / Submit button (fixed bottom) */}
          {qIndex !== 2 && (
            <View style={[q.footer, { paddingBottom: insets.bottom + 16 }]}>
              {qIndex === 3 && (
                <TouchableOpacity onPress={handleQNext} style={q.skipBtn}>
                  <Text style={q.skipBtnText}>Skip</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[q.continueBtn, !canContinue && { opacity: 0.4 }]}
                onPress={canContinue ? handleQNext : undefined}
                activeOpacity={0.85}
              >
                <Text style={q.continueBtnText}>
                  {qIndex === 3 ? (aiName.trim() ? `Set up ${aiName.trim()} →` : 'Finish setup →') : 'Continue'}
                </Text>
                {qIndex < 3 && <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.5} />}
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  // ─── RENDER: Setup (looping animation + notification permission) ─────────────
  if (step === 'setup') {
    const name = aiName.trim() || 'your AI';
    return (
      <SafeAreaView style={s.setupContainer} edges={['top', 'bottom']}>
        <Animated.View style={[s.setupContent, {
          opacity: slideIn,
          transform: [{ translateY: slideIn.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
        }]}>

          {/* Looping orbital illustration */}
          <SetupIllustration />

          <Text style={s.setupTitle}>Setting up {name}</Text>
          <Text style={s.setupSub}>
            Personalizing your AI assistant.{'\n'}This only happens once — sit tight.
          </Text>

          {/* Notification permission card */}
          {!notifAsked ? (
            <View style={s.notifSection}>
              <Text style={s.notifPrompt}>Want a ping when {name} is ready?</Text>
              <TouchableOpacity style={s.notifCard} onPress={requestNotifications} activeOpacity={0.85}>
                <View style={s.notifIconWrap}>
                  <Bell size={20} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.notifTitle}>Yes, notify me</Text>
                  <Text style={s.notifSub}>Close the app — we'll ping you when {name} is ready</Text>
                </View>
                <ChevronRight size={16} color="#9CA3AF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={skipNotif} style={s.notifSkip}>
                <Text style={s.notifSkipText}>I'll wait here</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.notifSection}>
              <View style={[s.notifCard, { borderColor: '#10B981' }]}>
                <View style={[s.notifIconWrap, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
                  <Check size={20} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.notifTitle, { color: '#10B981' }]}>
                    {notifGranted ? "You'll be notified!" : 'Waiting for download…'}
                  </Text>
                  <Text style={s.notifSub}>
                    {notifGranted
                      ? 'Feel free to close the app — we\'ll ping you when done'
                      : 'Almost there, hang tight'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <Text style={s.setupNote}>
            Everything runs 100% on your phone.{'\n'}Your data never leaves your device.
          </Text>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // ─── RENDER: Complete 🎉 ─────────────────────────────────────────────────────
  if (step === 'complete') {
    const name = aiName.trim() || 'Your AI';
    const uName = userName.trim();
    return (
      <View style={s.completeContainer}>
        <Confetti />
        <Animated.View style={[s.completeContent, {
          opacity: slideIn,
          transform: [{ scale: slideIn.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
        }]}>
          <Text style={s.completeEmoji}>🎉</Text>
          <Text style={s.completeTitle}>
            {uName ? `${name} is ready,\n${uName}!` : `${name} is\nready!`}
          </Text>
          <Text style={s.completeSub}>
            Your personal AI is all set up and{'\n'}ready to simplify your finances.
          </Text>
          <TouchableOpacity style={s.enterBtn} onPress={handleEnterApp} activeOpacity={0.85}>
            <Text style={s.enterBtnText}>Open {name} →</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return null;
}

// ─── Illustration shared styles ────────────────────────────────────────────────

const ill = StyleSheet.create({
  container:  { flex: 1, width: W, alignItems: 'center', justifyContent: 'center' },
  ringWrap:   { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  ring:       { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1.5 },
  orb:        {
    width: 110, height: 110, borderRadius: 55,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  badge:      {
    position: 'absolute', paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.18)',
  },
  badgeText:  { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 1 },
  chartCard:  {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 4,
    width: W * 0.78,
  },
  chartLabel: { fontSize: 11, fontFamily: Fonts.semiBold, color: '#5B6A8A', letterSpacing: 0.5, marginBottom: 14, textTransform: 'uppercase' },
  barsRow:    { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 10 },
  barCol:     { flex: 1, alignItems: 'center' },
  barTrack:   { width: '100%', justifyContent: 'flex-end' },
  bar:        { width: '100%', borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barLabel:   { fontSize: 9, fontFamily: Fonts.medium, color: '#9CA3AF', marginTop: 5 },
  aiTag:      {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14,
    backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'center',
  },
  aiTagText:  { fontSize: 11, fontFamily: Fonts.semiBold, color: '#3B82F6' },
  subGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', maxWidth: W * 0.72 },
  subIcon:    {
    width: 78, height: 78, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
  },
  subLetter:  { fontSize: 28, fontFamily: Fonts.bold, color: '#FFFFFF' },
  subPrice:   { fontSize: 10, fontFamily: Fonts.semiBold, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  savingsBadge: {
    marginTop: 18, paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: '#FFFFFF', borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    alignItems: 'center',
  },
  savingsLabel: { fontSize: 11, fontFamily: Fonts.semiBold, color: '#5B6A8A', marginBottom: 3 },
  savingsValue: { fontSize: 26, fontFamily: Fonts.serif, color: '#10B981' },
  cashCard:   {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 4,
    width: W * 0.78,
  },
  dangerZone: { position: 'absolute', backgroundColor: 'rgba(239,68,68,0.07)', left: 0, right: 0 },
  cashDot:    { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  warnBadge:  {
    position: 'absolute', right: 0, top: 10,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  warnText:   { fontSize: 10, fontFamily: Fonts.semiBold, color: '#EF4444' },
  paydayRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  paydayBadge:{ backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  paydayText: { fontSize: 11, fontFamily: Fonts.semiBold, color: '#10B981' },
  paydayDate: { fontSize: 12, fontFamily: Fonts.medium, color: '#5B6A8A' },
});

// ─── Setup illustration styles ─────────────────────────────────────────────────

const setupIll = StyleSheet.create({
  wrap: {
    width: 240, height: 240, alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  ring: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 1.5,
  },
  orbitAnchor: {
    position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center',
  },
  orbitDot: {
    position: 'absolute',
    marginLeft: -5, marginTop: -5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2,
  },
  centerOrb: {
    width: 82, height: 82, borderRadius: 41,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1.5, borderColor: 'rgba(59,130,246,0.3)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 5,
  },
});

// ─── Question step styles ──────────────────────────────────────────────────────

const q = StyleSheet.create({
  progressRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8,
  },
  backBtn:     { paddingVertical: 6, paddingRight: 12 },
  backBtnText: { fontSize: 15, fontFamily: Fonts.medium, color: '#9CA3AF' },
  dots:        { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot:         { height: 8, borderRadius: 4 },
  stepLabel:   { fontSize: 13, fontFamily: Fonts.semiBold, color: '#9CA3AF', minWidth: 32, textAlign: 'right' },

  recapRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 24, paddingBottom: 4 },
  recapChip:   {
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: 'rgba(59,130,246,0.07)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)',
  },
  recapText:   { fontSize: 12, fontFamily: Fonts.semiBold, color: '#3B82F6' },

  scroll:      { paddingHorizontal: 24, paddingTop: 28 },
  prompt:      { fontSize: 40, fontFamily: Fonts.serif, color: '#0F172A', letterSpacing: -0.8, lineHeight: 46, marginBottom: 10 },
  promptSub:   { fontSize: 15, fontFamily: Fonts.regular, color: '#5B6A8A', lineHeight: 22, marginBottom: 32 },

  bigInput:    {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 20,
    fontSize: 22, fontFamily: Fonts.serifRegular, color: '#0F172A',
    borderWidth: 1.5, borderColor: '#E4E8F7',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  inputHint:   { fontSize: 13, fontFamily: Fonts.regular, color: '#B0BAD0', marginTop: 10, lineHeight: 18 },

  previewCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14,
    backgroundColor: 'rgba(59,130,246,0.06)', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)',
  },
  previewEmoji: { fontSize: 18 },
  previewText:  { fontSize: 14, fontFamily: Fonts.regular, color: '#374151', lineHeight: 20, flex: 1 },

  bankGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  bankCard:    {
    width: (W - 48 - 12) / 2, paddingVertical: 22, paddingHorizontal: 18,
    borderRadius: 18, borderWidth: 1.5,
    alignItems: 'flex-start', justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  bankCardText: { fontSize: 16, fontFamily: Fonts.semiBold, marginTop: 4 },
  bankCheck:    {
    position: 'absolute', top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },

  incomeRow:   { flexDirection: 'row' },
  incomePrefix: {
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E4E8F7', borderRightWidth: 0,
    borderTopLeftRadius: 16, borderBottomLeftRadius: 16,
    paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center',
  },
  incomePrefixText: { fontSize: 22, fontFamily: Fonts.serifSemi, color: '#5B6A8A' },

  footer:      { paddingHorizontal: 24, paddingTop: 12, gap: 10, backgroundColor: '#F2F5FF' },
  skipBtn:     { alignItems: 'center', paddingVertical: 6 },
  skipBtnText: { fontSize: 15, fontFamily: Fonts.medium, color: '#9CA3AF' },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#3B82F6', borderRadius: 18, paddingVertical: 18, gap: 8,
    shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  continueBtnText: { fontSize: 17, fontFamily: Fonts.semiBold, color: '#FFFFFF' },
});

// ─── Screen styles ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Slides
  slideTextArea:  { paddingHorizontal: 32, paddingTop: 8 },
  headline:       { fontSize: 44, fontFamily: Fonts.serif, color: '#0F172A', letterSpacing: -1, lineHeight: 50, marginBottom: 14 },
  sub:            { fontSize: 16, fontFamily: Fonts.regular, color: '#5B6A8A', lineHeight: 24 },
  bottomBar:      { paddingHorizontal: 28, paddingTop: 16, gap: 16, backgroundColor: '#F2F5FF' },
  dotsRow:        { flexDirection: 'row', gap: 6, alignItems: 'center', height: 7 },
  slideDot:       { height: 7, borderRadius: 3.5 },
  nextBtn:        {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, borderRadius: 18, gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
  },
  nextBtnText:    { fontSize: 17, fontFamily: Fonts.semiBold, color: '#FFFFFF' },
  backLink:       { alignItems: 'center', paddingVertical: 4 },
  backLinkText:   { fontSize: 14, fontFamily: Fonts.medium, color: '#9CA3AF' },

  // Setup
  setupContainer: { flex: 1, backgroundColor: '#F2F5FF', alignItems: 'center', justifyContent: 'center' },
  setupContent:   { width: '100%', alignItems: 'center', paddingHorizontal: 28 },
  setupTitle:     { fontSize: 30, fontFamily: Fonts.serif, color: '#0F172A', letterSpacing: -0.5, textAlign: 'center', marginBottom: 10, marginTop: 4 },
  setupSub:       { fontSize: 15, fontFamily: Fonts.regular, color: '#5B6A8A', textAlign: 'center', lineHeight: 22, marginBottom: 32 },

  notifSection:   { width: '100%', marginBottom: 24, gap: 0 },
  notifPrompt:    { fontSize: 14, fontFamily: Fonts.semiBold, color: '#5B6A8A', marginBottom: 10, textAlign: 'center', letterSpacing: 0.1 },
  notifCard:      {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#E4E8F7',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  notifIconWrap:  { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(59,130,246,0.1)', alignItems: 'center', justifyContent: 'center' },
  notifTitle:     { fontSize: 15, fontFamily: Fonts.semiBold, color: '#0F172A', marginBottom: 3 },
  notifSub:       { fontSize: 12, fontFamily: Fonts.regular, color: '#9CA3AF', lineHeight: 16 },
  notifSkip:      { alignItems: 'center', paddingVertical: 12 },
  notifSkipText:  { fontSize: 13, fontFamily: Fonts.medium, color: '#B0BAD0' },

  setupNote:      { fontSize: 12, fontFamily: Fonts.regular, color: '#C4CCDA', textAlign: 'center', lineHeight: 18 },

  // Complete
  completeContainer: { flex: 1, backgroundColor: '#F2F5FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  completeContent:   { alignItems: 'center', paddingHorizontal: 36 },
  completeEmoji:     { fontSize: 64, marginBottom: 20 },
  completeTitle:     { fontSize: 40, fontFamily: Fonts.serif, color: '#0F172A', textAlign: 'center', letterSpacing: -0.8, lineHeight: 46, marginBottom: 16 },
  completeSub:       { fontSize: 16, fontFamily: Fonts.regular, color: '#5B6A8A', textAlign: 'center', lineHeight: 24, marginBottom: 40 },
  enterBtn:          {
    backgroundColor: '#3B82F6', borderRadius: 18, paddingVertical: 18, paddingHorizontal: 40,
    shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  enterBtnText:      { fontSize: 18, fontFamily: Fonts.semiBold, color: '#FFFFFF' },
});
