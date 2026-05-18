import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from './ThemeContext';

// ─── Single skeleton box ───────────────────────────────────────────────────────

interface SkeletonBoxProps {
  width?: number | string;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonBox({ width = '100%', height, borderRadius = 10, style }: SkeletonBoxProps) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;
  const anim    = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    anim.current = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.75, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.current.start();
    return () => { anim.current?.stop(); anim.current = null; };
  }, []);

  const bg = theme === 'dark' ? '#1C2333' : '#DDE3F0';

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: bg },
        { opacity },
        style as ViewStyle,
      ]}
    />
  );
}

// ─── Dashboard skeleton ────────────────────────────────────────────────────────

export function DashboardSkeleton() {
  return (
    <View style={sk.container}>
      {/* Health score ring card */}
      <SkeletonBox height={180} borderRadius={24} style={sk.card} />
      {/* Two stat cards */}
      <View style={sk.row}>
        <SkeletonBox width="47%" height={110} borderRadius={20} />
        <SkeletonBox width="47%" height={110} borderRadius={20} />
      </View>
      {/* Bar chart card */}
      <SkeletonBox height={210} borderRadius={20} style={sk.card} />
      {/* Donut / category card */}
      <SkeletonBox height={240} borderRadius={20} style={sk.card} />
      {/* Daily budget */}
      <SkeletonBox height={130} borderRadius={20} style={sk.card} />
    </View>
  );
}

// ─── Transactions skeleton ────────────────────────────────────────────────────

export function TransactionsSkeleton() {
  const rows = Array.from({ length: 8 });
  return (
    <View style={sk.container}>
      {/* Search bar */}
      <SkeletonBox height={44} borderRadius={14} style={sk.card} />
      {/* Filter chips */}
      <View style={sk.chipRow}>
        {[80, 100, 70, 90].map((w, i) => (
          <SkeletonBox key={i} width={w} height={32} borderRadius={16} />
        ))}
      </View>
      {/* Date header */}
      <SkeletonBox width={120} height={16} borderRadius={8} style={{ marginBottom: 12, marginTop: 4 }} />
      {/* Transaction rows */}
      {rows.map((_, i) => (
        <View key={i} style={sk.txRow}>
          <SkeletonBox width={40} height={40} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
            <SkeletonBox width="60%" height={14} borderRadius={7} />
            <SkeletonBox width="35%" height={11} borderRadius={6} />
          </View>
          <SkeletonBox width={60} height={14} borderRadius={7} />
        </View>
      ))}
    </View>
  );
}

// ─── Insights skeleton ────────────────────────────────────────────────────────

export function InsightsSkeleton() {
  return (
    <View style={sk.container}>
      {/* Month selector */}
      <SkeletonBox height={44} borderRadius={14} style={sk.card} />
      {/* Overview stats row */}
      <View style={sk.row}>
        <SkeletonBox width="30%" height={80} borderRadius={16} />
        <SkeletonBox width="30%" height={80} borderRadius={16} />
        <SkeletonBox width="30%" height={80} borderRadius={16} />
      </View>
      {/* Bar chart */}
      <SkeletonBox height={200} borderRadius={20} style={sk.card} />
      {/* Category list items */}
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={sk.catRow}>
          <SkeletonBox width={36} height={36} borderRadius={10} />
          <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
            <SkeletonBox width="50%" height={13} borderRadius={7} />
            <SkeletonBox width="80%" height={6} borderRadius={3} />
          </View>
          <SkeletonBox width={55} height={13} borderRadius={7} />
        </View>
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sk = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 8 },
  card:      { marginBottom: 14 },
  row:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  chipRow:   { flexDirection: 'row', gap: 8, marginBottom: 16 },
  txRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  catRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
});
