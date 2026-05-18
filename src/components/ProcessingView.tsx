import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Animated, ScrollView,
} from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';

export interface StepColors {
  text: string;
  textSecondary: string;
  border: string;
}

// ─── Pulsing radar orb ────────────────────────────────────────────────────────

export function PulsingOrb() {
  const a0 = useRef(new Animated.Value(0)).current;
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeLoop = (anim: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 2400, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const l0 = makeLoop(a0);
    const l1 = makeLoop(a1);
    const l2 = makeLoop(a2);
    l0.start();
    const t1 = setTimeout(() => l1.start(), 800);
    const t2 = setTimeout(() => l2.start(), 1600);
    return () => { l0.stop(); l1.stop(); l2.stop(); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const makeRingStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 0.55, 0.1, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.95] }) }],
  });

  return (
    <View style={orbStyles.container}>
      {[a0, a1, a2].map((a, i) => (
        <Animated.View key={i} style={[orbStyles.ring, makeRingStyle(a)]} />
      ))}
      <View style={orbStyles.center}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    </View>
  );
}

const orbStyles = StyleSheet.create({
  container: { width: 148, height: 148, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    borderWidth: 1.5, borderColor: '#3B82F6',
  },
  center: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 2, borderColor: 'rgba(59,130,246,0.45)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
  },
});

// ─── Step timeline list ───────────────────────────────────────────────────────

const ITEM_H = 64;

interface StepListProps {
  steps: string[];
  currentIndex: number;
  stepDetail: string;
  colors: StepColors;
}

export function StepList({ steps, currentIndex, stepDetail, colors }: StepListProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (currentIndex >= 0) {
      const offset = Math.max(0, currentIndex * ITEM_H - 100);
      setTimeout(() => scrollRef.current?.scrollTo({ y: offset, animated: true }), 80);
    }
  }, [currentIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, width: '100%' }}
      contentContainerStyle={listStyles.content}
      showsVerticalScrollIndicator={false}
    >
      {steps.map((step, i) => {
        const isDone    = i < currentIndex;
        const isActive  = i === currentIndex;
        const isPending = i > currentIndex;
        const isLast    = i === steps.length - 1;

        return (
          <View key={i} style={listStyles.row}>
            {/* Timeline column */}
            <View style={listStyles.timelineCol}>
              <View style={listStyles.iconWrap}>
                {isDone && <CheckCircle2 size={22} color="#3B82F6" />}
                {isActive && (
                  <View style={listStyles.activeDot}>
                    <View style={listStyles.activeDotInner} />
                  </View>
                )}
                {isPending && (
                  <View style={[listStyles.pendingDot, { borderColor: colors.border }]} />
                )}
              </View>
              {!isLast && (
                <View style={[
                  listStyles.connector,
                  { backgroundColor: isDone ? '#3B82F6' : colors.border, opacity: isDone ? 0.45 : 0.22 },
                ]} />
              )}
            </View>

            {/* Label column */}
            <View style={listStyles.labelCol}>
              <Text style={[
                listStyles.label,
                isActive  && [listStyles.labelActive, { color: colors.text }],
                isDone    && listStyles.labelDone,
                isPending && { color: colors.textSecondary },
              ]}>
                {step}
              </Text>
              {isActive && stepDetail ? (
                <Text style={[listStyles.detail, { color: colors.textSecondary }]}>{stepDetail}</Text>
              ) : null}
              {isDone && (
                <Text style={listStyles.doneTag}>done</Text>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const listStyles = StyleSheet.create({
  content:      { paddingHorizontal: 6, paddingBottom: 48, paddingTop: 4 },
  row:          { flexDirection: 'row', minHeight: ITEM_H },
  timelineCol:  { width: 32, alignItems: 'center' },
  iconWrap:     { marginTop: 20, zIndex: 1 },
  activeDot:    {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 2, borderColor: '#3B82F6',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  activeDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' },
  pendingDot:   { width: 10, height: 10, borderRadius: 5, marginTop: 6, borderWidth: 1.5 },
  connector:    { width: 2, flex: 1, marginTop: 4 },
  labelCol:     { flex: 1, paddingLeft: 16, paddingVertical: 14, justifyContent: 'center' },
  label:        { fontSize: 15, fontWeight: '400', lineHeight: 22, color: '#6B7280' },
  labelActive:  { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  labelDone:    { fontSize: 15, fontWeight: '500', color: '#3B82F6' },
  detail:       { fontSize: 12, marginTop: 3, fontWeight: '500' },
  doneTag:      { fontSize: 11, color: '#3B82F6', fontWeight: '600', marginTop: 2, opacity: 0.7, letterSpacing: 0.3 },
});
