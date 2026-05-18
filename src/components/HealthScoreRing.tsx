import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Transaction } from '../types';

// ─── Score computation ────────────────────────────────────────────────────────

function monthOf(d: string) { return d.slice(0, 7); }
function sum(txs: Transaction[]) { return txs.reduce((s, t) => s + t.amount, 0); }
function debits(txs: Transaction[]) { return txs.filter(t => t.type === 'debit'); }
function credits(txs: Transaction[]) { return txs.filter(t => t.type === 'credit'); }

export function computeHealthScore(txs: Transaction[]): {
  score: number;
  grade: string;
  label: string;
  color: string;
  breakdown: { label: string; pts: number; max: number; detail: string }[];
} {
  const empty = { score: 0, grade: '—', label: 'No data', color: '#6B7280', breakdown: [] };
  if (!txs.length) return empty;

  const months = [...new Set(txs.map(t => monthOf(t.date)))].sort().reverse().slice(0, 3);

  // ── 1. Savings rate — 40 pts ──────────────────────────────────────────────
  const inc   = sum(credits(txs));
  const spent = sum(debits(txs));
  const net   = inc - spent;
  const savingsRate = inc > 0 ? net / inc : 0;
  const savingsPts  = Math.round(Math.min(Math.max(savingsRate / 0.20, 0), 1) * 40);

  // ── 2. Spending stability — 25 pts ────────────────────────────────────────
  const monthlySpends = months.map(m =>
    sum(debits(txs.filter(t => monthOf(t.date) === m)))
  );
  const avgSpend = monthlySpends.reduce((s, v) => s + v, 0) / Math.max(monthlySpends.length, 1);
  const variance = avgSpend > 0
    ? monthlySpends.reduce((s, v) => s + Math.pow(v - avgSpend, 2), 0) / monthlySpends.length
    : 0;
  const cv = avgSpend > 0 ? Math.sqrt(variance) / avgSpend : 0;
  const stabilityPts = Math.round(Math.min(Math.max(1 - cv * 2, 0), 1) * 25);

  // ── 3. Subscription discipline — 20 pts ───────────────────────────────────
  const subSpend = sum(debits(txs).filter(t => t.is_subscription || t.is_recurring));
  const subRatio = spent > 0 ? subSpend / spent : 0;
  const subPts   = Math.round(Math.min(Math.max(1 - subRatio / 0.15, 0), 1) * 20);

  // ── 4. Spending trend — 15 pts ────────────────────────────────────────────
  let trendPts = 8; // neutral default
  if (months.length >= 2) {
    const curr = sum(debits(txs.filter(t => monthOf(t.date) === months[0])));
    const prev = sum(debits(txs.filter(t => monthOf(t.date) === months[1])));
    const trend = prev > 0 ? (prev - curr) / prev : 0;
    trendPts = Math.round(Math.min(Math.max((trend + 0.1) / 0.3, 0), 1) * 15);
  }

  const score = Math.min(savingsPts + stabilityPts + subPts + trendPts, 100);

  const grade = score >= 90 ? 'A+'
    : score >= 80 ? 'A'
    : score >= 70 ? 'B+'
    : score >= 60 ? 'B'
    : score >= 50 ? 'C'
    : 'D';

  const label = score >= 80 ? 'Excellent'
    : score >= 65 ? 'Good'
    : score >= 50 ? 'Fair'
    : 'Needs work';

  const color = score >= 75 ? '#3B82F6'
    : score >= 55 ? '#F59E0B'
    : '#EF4444';

  return {
    score,
    grade,
    label,
    color,
    breakdown: [
      { label: 'Savings',       pts: savingsPts,  max: 40, detail: `${Math.round(savingsRate * 100)}% rate` },
      { label: 'Consistency',   pts: stabilityPts, max: 25, detail: cv < 0.15 ? 'Stable' : 'Variable' },
      { label: 'Subscriptions', pts: subPts,       max: 20, detail: `${Math.round(subRatio * 100)}% of spend` },
      { label: 'Trend',         pts: trendPts,     max: 15, detail: trendPts >= 10 ? 'Improving' : trendPts >= 6 ? 'Stable' : 'Rising' },
    ],
  };
}

// ─── Animated SVG arc ────────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE   = 140;
const RADIUS = 56;
const STROKE = 13;
const CX     = SIZE / 2;
const CY     = SIZE / 2;
const CIRCUM = 2 * Math.PI * RADIUS;

interface Props {
  txs: Transaction[];
}

export default function HealthScoreRing({ txs }: Props) {
  const { score, grade, label, color, breakdown } = computeHealthScore(txs);

  const animProg   = useRef(new Animated.Value(0)).current;
  const animHandle = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    animProg.setValue(0);
    animHandle.current?.stop();
    const anim = Animated.timing(animProg, {
      toValue: score / 100,
      duration: 1400,
      useNativeDriver: false,
    });
    animHandle.current = anim;
    anim.start();
    return () => { animHandle.current?.stop(); animHandle.current = null; };
  }, [score]);

  const strokeDash = animProg.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, CIRCUM],
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.ringSection}>
        {/* SVG ring */}
        <Svg width={SIZE} height={SIZE}>
          <G rotation="-90" origin={`${CX},${CY}`}>
            {/* Background track */}
            <Circle
              cx={CX} cy={CY} r={RADIUS}
              fill="none"
              stroke="rgba(107,114,128,0.18)"
              strokeWidth={STROKE}
            />
            {/* Animated score arc */}
            <AnimatedCircle
              cx={CX} cy={CY} r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUM}
              strokeDashoffset={strokeDash.interpolate({
                inputRange:  [0, CIRCUM],
                outputRange: [CIRCUM, 0],
              })}
            />
          </G>
        </Svg>

        {/* Center text */}
        <View style={styles.center} pointerEvents="none">
          <Text style={[styles.scoreNum, { color }]}>{score}</Text>
          <Text style={[styles.grade, { color }]}>{grade}</Text>
        </View>
      </View>

      {/* Right side breakdown */}
      <View style={styles.breakdown}>
        <Text style={[styles.labelText, { color }]}>{label}</Text>
        {breakdown.map(b => (
          <View key={b.label} style={styles.bRow}>
            <View style={styles.bMeta}>
              <Text style={styles.bLabel}>{b.label}</Text>
              <Text style={styles.bDetail}>{b.detail}</Text>
            </View>
            <View style={styles.bBarTrack}>
              <View style={[styles.bBarFill, { width: `${(b.pts / b.max) * 100}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.bPts, { color }]}>{b.pts}<Text style={styles.bMax}>/{b.max}</Text></Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:      { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ringSection:  { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  center:       { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  scoreNum:     { fontSize: 32, fontWeight: '800', letterSpacing: -1, lineHeight: 34 },
  grade:        { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  breakdown:    { flex: 1, gap: 10 },
  labelText:    { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  bRow:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bMeta:        { width: 82 },
  bLabel:       { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  bDetail:      { fontSize: 10, color: '#6B7280' },
  bBarTrack:    { flex: 1, height: 4, backgroundColor: 'rgba(107,114,128,0.2)', borderRadius: 2, overflow: 'hidden' },
  bBarFill:     { height: 4, borderRadius: 2 },
  bPts:         { fontSize: 11, fontWeight: '700', color: '#9CA3AF', width: 34, textAlign: 'right' },
  bMax:         { fontSize: 10, color: '#6B7280', fontWeight: '400' },
});
