import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fonts } from '../src/components/Typography';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../src/components/ThemeContext';
import { getSubscriptions, SubscriptionItem } from '../src/db/transactions';

export default function SubscriptionsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [subs, setSubs] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getSubscriptions().then(setSubs).catch(console.error).finally(() => setLoading(false));
    }, [])
  );

  const totalMonthly = subs.reduce((s, sub) => s + sub.monthly_cost, 0);
  const totalAnnual = totalMonthly * 12;

  const today = new Date();
  const thisMonth = today.toISOString().substring(0, 7);

  const isPossiblyCancelled = (sub: SubscriptionItem) => {
    const last = new Date(sub.last_charged);
    const diffDays = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 45;
  };

  const isDuplicateCharge = (sub: SubscriptionItem) => {
    // charge_count is total; we approximate this month via last_charged being this month
    return sub.last_charged.startsWith(thisMonth) && sub.charge_count >= 2;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Subscriptions</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Totals card */}
        <View style={[styles.totalsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.totalItem}>
            <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>MONTHLY</Text>
            <Text style={[styles.totalAmount, { color: colors.text }]}>
              ${totalMonthly.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={[styles.totalDivider, { backgroundColor: colors.border }]} />
          <View style={styles.totalItem}>
            <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>ANNUALLY</Text>
            <Text style={[styles.totalAmount, { color: colors.danger }]}>
              ${totalAnnual.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : subs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No subscriptions found</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              Upload bank statements and let the AI detect recurring charges
            </Text>
          </View>
        ) : (
          subs.map((sub, i) => {
            const cancelled = isPossiblyCancelled(sub);
            const duplicate = isDuplicateCharge(sub);
            return (
              <View key={i} style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.subTop}>
                  <View style={styles.subLeft}>
                    <Text style={[styles.merchantName, { color: colors.text }]}>{sub.merchant}</Text>
                    <Text style={[styles.categoryText, { color: colors.textSecondary }]}>{sub.category}</Text>
                  </View>
                  <View style={styles.subRight}>
                    <Text style={[styles.monthlyCost, { color: colors.text }]}>
                      ${sub.monthly_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      <Text style={[styles.perMonth, { color: colors.textSecondary }]}>/mo</Text>
                    </Text>
                    <Text style={[styles.annualCost, { color: colors.textSecondary }]}>
                      ${(sub.monthly_cost * 12).toLocaleString('en-US', { minimumFractionDigits: 2 })}/yr
                    </Text>
                  </View>
                </View>

                <View style={[styles.subBottom, { borderTopColor: colors.border }]}>
                  <View style={[styles.bankBadge, { backgroundColor: colors.border }]}>
                    <Text style={[styles.bankBadgeText, { color: colors.textSecondary }]}>{sub.bank}</Text>
                  </View>
                  <Text style={[styles.lastCharged, { color: colors.textSecondary }]}>
                    Last: {sub.last_charged}
                  </Text>
                  {duplicate && (
                    <View style={[styles.badge, { backgroundColor: '#EF44441A', borderColor: colors.danger }]}>
                      <Text style={[styles.badgeText, { color: colors.danger }]}>Duplicate Charge!</Text>
                    </View>
                  )}
                  {cancelled && !duplicate && (
                    <View style={[styles.badge, { backgroundColor: '#F59E0B1A', borderColor: '#F59E0B' }]}>
                      <Text style={[styles.badgeText, { color: '#F59E0B' }]}>Possibly Cancelled</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontFamily: Fonts.bold },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  totalsCard: { borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginBottom: 20, overflow: 'hidden' },
  totalItem: { flex: 1, alignItems: 'center', paddingVertical: 20 },
  totalLabel: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 0.8, marginBottom: 6 },
  totalAmount: { fontSize: 26, fontFamily: Fonts.serif, letterSpacing: -1 },
  totalDivider: { width: 1 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontFamily: Fonts.semiBold, marginBottom: 8 },
  emptyHint: { fontSize: 14, fontFamily: Fonts.regular, textAlign: 'center', lineHeight: 20 },
  subCard: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  subTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16 },
  subLeft: { flex: 1 },
  subRight: { alignItems: 'flex-end' },
  merchantName: { fontSize: 16, fontFamily: Fonts.semiBold, marginBottom: 2 },
  categoryText: { fontSize: 13, fontFamily: Fonts.regular },
  monthlyCost: { fontSize: 18, fontFamily: Fonts.bold },
  perMonth: { fontSize: 13, fontFamily: Fonts.regular },
  annualCost: { fontSize: 12, fontFamily: Fonts.regular, marginTop: 2 },
  subBottom: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  bankBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  bankBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold },
  lastCharged: { fontSize: 12, fontFamily: Fonts.regular },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: Fonts.bold },
});
