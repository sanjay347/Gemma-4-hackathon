import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Transaction } from '../types';
import { Fonts } from './Typography';

const CHART_H  = 120;
const BAR_GAP  = 8;
const Y_AXIS_W = 40; // width of the y-axis label column

function monthOf(d: string) { return d.slice(0, 7); }
function sum(txs: Transaction[]) { return txs.reduce((s, t) => s + t.amount, 0); }

function shortMonth(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

function fmt(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

interface Props {
  txs: Transaction[];
  color?: string;
}

export default function SpendingBarChart({ txs, color = '#3B82F6' }: Props) {
  const allMonths = [...new Set(txs.map(t => monthOf(t.date)))]
    .sort().reverse().slice(0, 6).reverse();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const data = allMonths.map(m => ({
    month: m,
    spent: sum(txs.filter(t => t.type === 'debit' && monthOf(t.date) === m)),
    isCurrent: m === currentMonth,
  }));

  const maxSpent = Math.max(...data.map(d => d.spent), 1);

  // Pre-allocate 12 values so the array never grows between renders (avoids undefined on anims[i])
  const anims      = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;
  const animHandle = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Reset only the slots we'll actually use
    anims.slice(0, data.length).forEach(a => a.setValue(0));
    animHandle.current?.stop();
    const anim = Animated.stagger(
      80,
      anims.slice(0, data.length).map(a =>
        Animated.timing(a, { toValue: 1, duration: 550, useNativeDriver: false })
      )
    );
    animHandle.current = anim;
    anim.start();
    return () => { animHandle.current?.stop(); animHandle.current = null; };
  }, [txs.length]);

  if (!data.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No spending data yet</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Chart row: y-axis labels + bars */}
      <View style={{ flexDirection: 'row' }}>

        {/* Y-axis labels column */}
        <View style={styles.yAxisCol}>
          <Text style={styles.yLabel}>{fmt(maxSpent)}</Text>
          <Text style={styles.yLabel}>{fmt(maxSpent / 2)}</Text>
          <Text style={styles.yLabel}>$0</Text>
        </View>

        {/* Bars area — fills remaining width */}
        <View style={{ flex: 1, height: CHART_H, flexDirection: 'row', alignItems: 'flex-end', gap: BAR_GAP }}>
          {data.map((d, i) => {
            const fullH = Math.max((d.spent / maxSpent) * CHART_H, 2);
            const animH = anims[i].interpolate({
              inputRange:  [0, 1],
              outputRange: [0, fullH],
            });
            const barColor = d.isCurrent ? color : 'rgba(59,130,246,0.28)';

            return (
              <View key={d.month} style={{ flex: 1, height: CHART_H, justifyContent: 'flex-end', alignItems: 'center' }}>
                {/* Amount label on highest or current bar */}
                {(d.isCurrent || d.spent === maxSpent) && d.spent > 0 && (
                  <Text style={[styles.barLabel, { color }]} numberOfLines={1}>
                    {fmt(d.spent)}
                  </Text>
                )}
                <Animated.View
                  style={{
                    width: '100%',
                    height: animH,
                    borderRadius: 6,
                    backgroundColor: barColor,
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* X-axis labels — same flex layout as bars, offset by y-axis width */}
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        <View style={{ width: Y_AXIS_W }} />
        <View style={{ flex: 1, flexDirection: 'row', gap: BAR_GAP }}>
          {data.map((d) => (
            <Text
              key={d.month}
              style={[
                styles.xLabel,
                {
                  flex: 1,
                  color: d.isCurrent ? color : '#9CA3AF',
                  fontFamily: d.isCurrent ? Fonts.bold : Fonts.regular,
                },
              ]}
            >
              {shortMonth(d.month)}
            </Text>
          ))}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: color }]} />
          <Text style={styles.legendText}>This month</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: 'rgba(59,130,246,0.3)' }]} />
          <Text style={styles.legendText}>Previous months</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty:       { height: CHART_H, alignItems: 'center', justifyContent: 'center' },
  emptyText:   { color: '#6B7280', fontSize: 13, fontFamily: Fonts.regular },
  yAxisCol:    { width: Y_AXIS_W, height: CHART_H, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, paddingBottom: 2 },
  yLabel:      { fontSize: 9, color: '#9CA3AF', fontFamily: Fonts.regular },
  barLabel:    { fontSize: 9, fontFamily: Fonts.bold, textAlign: 'center', marginBottom: 3 },
  xLabel:      { fontSize: 10, textAlign: 'center' },
  legend:      { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendText:  { fontSize: 11, color: '#9CA3AF', fontFamily: Fonts.regular },
});
