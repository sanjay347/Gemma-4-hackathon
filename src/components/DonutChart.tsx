import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from './ThemeContext';
import { Fonts } from './Typography';

export interface DonutSlice {
  label: string;
  amount: number;
  color: string;
  percentage: number;
}

interface Props {
  slices: DonutSlice[];
  total: number;
  size?: number;
  strokeWidth?: number;
}

// Animate strokeOpacity — a numeric prop that works with useNativeDriver: false
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function DonutChart({
  slices,
  total,
  size = 140,
  strokeWidth = 22,
}: Props) {
  const { colors } = useTheme();
  const radius  = (size - strokeWidth) / 2;
  const cx      = size / 2;
  const cy      = size / 2;
  const circumf = 2 * Math.PI * radius;

  // Pre-allocate 8 values — more than the 6 we display; prevents undefined on anims[i]
  const anims      = useRef(Array.from({ length: 8 }, () => new Animated.Value(0))).current;
  const animHandle = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    anims.slice(0, slices.length).forEach(a => a.setValue(0));
    animHandle.current?.stop();
    const anim = Animated.stagger(
      60,
      anims.slice(0, slices.length).map(a =>
        Animated.timing(a, { toValue: 1, duration: 500, useNativeDriver: false })
      )
    );
    animHandle.current = anim;
    anim.start();
    return () => { animHandle.current?.stop(); animHandle.current = null; };
  }, [slices.length]);

  // Build cumulative arc offset
  let cumulativeOffset = 0;

  return (
    <View style={styles.wrapper}>
      {/* Donut SVG */}
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${cx},${cy}`}>
            {/* Background track */}
            <Circle
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke="rgba(107,114,128,0.15)"
              strokeWidth={strokeWidth}
            />
            {slices.map((slice, i) => {
              // Correct partial-arc formula:
              //   dash  = the arc length this slice occupies
              //   gap   = the remaining circumference (must be non-zero to close the arc)
              //   offset = how far along the circle this slice starts
              const dash        = (slice.percentage / 100) * circumf;
              const gap         = Math.max(circumf - dash, 0.001); // avoid zero gap
              const arcOffset   = cumulativeOffset;
              cumulativeOffset += dash;

              return (
                <AnimatedCircle
                  key={slice.label + i}
                  cx={cx} cy={cy} r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={strokeWidth - 2}
                  strokeLinecap="butt"
                  // ← the fix: explicit dash + gap so each slice is only its own arc
                  strokeDasharray={`${dash} ${gap}`}
                  // position: circumf - arcOffset rotates the start of this slice into place
                  strokeDashoffset={circumf - arcOffset}
                  // animate opacity in so the chart "appears" nicely
                  strokeOpacity={anims[i]}
                />
              );
            })}
          </G>
        </Svg>

        {/* Center label — sits on top of SVG */}
        <View style={[styles.centerLabel, { width: size, height: size }]} pointerEvents="none">
          <Text style={[styles.centerAmount, { color: colors.text }]}>
            {total >= 1000 ? `$${(total / 1000).toFixed(1)}k` : `$${Math.round(total)}`}
          </Text>
          <Text style={[styles.centerSub, { color: colors.textSecondary }]}>spent</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {slices.slice(0, 6).map(s => (
          <View key={s.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <View style={styles.legendMeta}>
              <Text style={[styles.legendLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                {s.label}
              </Text>
              <Text style={[styles.legendPct, { color: colors.textSecondary }]}>
                {Math.round(s.percentage)}%
              </Text>
            </View>
            <Text style={[styles.legendAmt, { color: colors.text }]}>
              ${s.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:      { flexDirection: 'row', alignItems: 'center', gap: 20 },
  centerLabel:  { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  centerAmount: { fontSize: 18, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  centerSub:    { fontSize: 11, fontFamily: Fonts.regular },
  legend:       { flex: 1, gap: 8 },
  legendRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:          { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  legendMeta:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendLabel:  { fontSize: 12, fontFamily: Fonts.regular, flex: 1 },
  legendPct:    { fontSize: 11, fontFamily: Fonts.regular, marginLeft: 4 },
  legendAmt:    { fontSize: 12, fontFamily: Fonts.bold, minWidth: 56, textAlign: 'right' },
});
