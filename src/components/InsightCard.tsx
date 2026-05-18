import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AlertCircle, AlertTriangle, Info, TrendingUp } from 'lucide-react-native';
import { Insight } from '../types';
import { useTheme } from './ThemeContext';
import { Fonts } from './Typography';

interface InsightCardProps {
  insight: Insight;
  onPressAction?: () => void;
}

export default function InsightCard({ insight, onPressAction }: InsightCardProps) {
  const { colors, theme } = useTheme();

  const cardShadow = theme === 'light' ? {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 5,
  } : {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 4,
  };

  const severity = (() => {
    switch (insight.severity) {
      case 'danger':  return { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.2)',  icon: AlertCircle };
      case 'warning': return { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', icon: AlertTriangle };
      case 'info':
      default:        return { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', icon: Info };
    }
  })();

  const Icon = severity.icon;

  return (
    <View style={[
      styles.card,
      { backgroundColor: colors.card, borderColor: severity.border },
      cardShadow,
    ]}>
      {/* Top stripe */}
      <View style={[styles.stripe, { backgroundColor: severity.color }]} />

      <View style={styles.body}>
        {/* Badge */}
        <View style={[styles.badge, { backgroundColor: severity.bg }]}>
          <Icon size={12} color={severity.color} />
          <Text style={[styles.badgeText, { color: severity.color }]}>
            {insight.type_label}
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{insight.title}</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>{insight.description}</Text>

        {insight.impact_amount !== null && (
          <View style={[styles.impactPill, { backgroundColor: severity.bg }]}>
            <TrendingUp size={11} color={severity.color} />
            <Text style={[styles.impactText, { color: severity.color }]}>
              Impact: ${insight.impact_amount.toFixed(2)}/mo
            </Text>
          </View>
        )}

        {insight.action_label && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: severity.bg, borderColor: severity.border }]}
            onPress={onPressAction}
            activeOpacity={0.7}
          >
            <Text style={[styles.buttonText, { color: severity.color }]}>{insight.action_label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  stripe: {
    height: 3,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  body: {
    padding: 16,
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    lineHeight: 22,
  },
  description: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    lineHeight: 20,
  },
  impactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  impactText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
  },
  button: {
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: 2,
  },
  buttonText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
  },
});
