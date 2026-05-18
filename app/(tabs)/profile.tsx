import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shield, HardDrive, ChevronRight, Moon, Trash2, FileText, Cpu, Lock } from 'lucide-react-native';
import { Fonts } from '../../src/components/Typography';
import { clearAllData, getUploads, getUserProfile, UploadRecord } from '../../src/db/transactions';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../../src/components/ThemeContext';
import { BANK_LABELS, BankType } from '../../src/parsers/index';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function InitialsAvatar({ name, size = 72 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={[avatarStyles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[avatarStyles.initials, { fontSize: size * 0.35 }]}>
        {initials || '?'}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  circle: {
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: '#080808', fontFamily: Fonts.bold, letterSpacing: -0.5 },
});

function SettingsRow({
  icon, label, value, onPress, danger, isSwitch, switchValue, onToggle, border = true,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  isSwitch?: boolean;
  switchValue?: boolean;
  onToggle?: (v: boolean) => void;
  border?: boolean;
}) {
  const { colors, theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.65 : 1}
      style={[
        rowStyles.row,
        border && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <View style={[rowStyles.iconBox, { backgroundColor: danger ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)' }]}>
        {icon}
      </View>
      <Text style={[rowStyles.label, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
      <View style={rowStyles.right}>
        {value && <Text style={[rowStyles.value, { color: colors.textSecondary }]}>{value}</Text>}
        {isSwitch && (
          <Switch
            value={switchValue}
            onValueChange={onToggle}
            trackColor={{
              // light mode off: visible mid-grey; dark mode off: dark slate
              false: theme === 'light' ? '#C7CDD8' : '#374151',
              true:  '#3B82F6',
            }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={theme === 'light' ? '#C7CDD8' : '#374151'}
          />
        )}
        {onPress && !isSwitch && <ChevronRight color={colors.textSecondary} size={16} />}
      </View>
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  iconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  label: { flex: 1, fontSize: 15, fontFamily: Fonts.medium },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { fontSize: 13 },
});

export default function ProfileScreen() {
  const router = useRouter();
  const { theme, toggleTheme, colors } = useTheme();

  const cardStyle = theme === 'light' ? {
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 6,
  } : {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 5,
  };
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const load = async () => {
      const [recs, profile] = await Promise.all([getUploads(), getUserProfile()]);
      setUploads(recs);
      if (profile.name) setUserName(profile.name);
    };
    load();
  }, []);

  const handleClearData = () => {
    Alert.alert(
      'Clear Local Data',
      'This will delete all parsed transactions and insights from your device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Data',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Alert.alert('Data Cleared', 'All local data has been wiped.', [
              { text: 'OK', onPress: () => router.replace({ pathname: '/', params: { forceUpload: 'true' } }) }
            ]);
          },
        },
      ]
    );
  };

  const handleFactoryReset = () => {
    Alert.alert(
      'Factory Reset',
      'This will delete ALL data AND the 4.7GB local AI model. You will need to re-download the model.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Nuke Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllData();
              const modelPath = FileSystem.documentDirectory + 'clearmoney-q4km.gguf';
              const fileInfo = await FileSystem.getInfoAsync(modelPath);
              if (fileInfo.exists) await FileSystem.deleteAsync(modelPath);
              Alert.alert('Reset Complete', 'App returned to fresh install state.', [
                { text: 'OK', onPress: () => router.replace({ pathname: '/', params: { forceUpload: 'true' } }) }
              ]);
            } catch {
              Alert.alert('Error', 'Could not complete factory reset.');
            }
          },
        },
      ]
    );
  };

  const totalTransactions = uploads.reduce((s, u) => s + u.transaction_count, 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        </View>

        {/* Avatar + name */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }, cardStyle]}>
          <InitialsAvatar name={userName || 'Guest User'} size={72} />
          <View style={styles.profileInfo}>
            <Text style={[styles.name, { color: colors.text }]}>{userName || 'Guest User'}</Text>
            <Text style={[styles.subName, { color: colors.textSecondary }]}>Local account · offline only</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={[styles.statNum, { color: colors.primary }]}>{uploads.length}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>statements</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.stat}>
                <Text style={[styles.statNum, { color: colors.primary }]}>{totalTransactions}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>transactions</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Privacy banner */}
        <View style={[styles.privacyBanner, { backgroundColor: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.2)' }]}>
          <Lock size={14} color="#3B82F6" />
          <Text style={styles.privacyText}>All data stays on your device. Zero cloud. Zero tracking.</Text>
        </View>

        {/* Uploaded statements */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Uploaded Statements</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, cardStyle]}>
            {uploads.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No statements uploaded yet</Text>
              </View>
            ) : (
              uploads.map((up, i) => (
                <View
                  key={up.id}
                  style={[
                    styles.uploadRow,
                    i < uploads.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.uploadIcon, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                    <FileText size={15} color="#3B82F6" />
                  </View>
                  <View style={styles.uploadInfo}>
                    <Text style={[styles.uploadBank, { color: colors.text }]}>
                      {BANK_LABELS[up.bank as BankType] ?? up.bank}
                    </Text>
                    <Text style={[styles.uploadMeta, { color: colors.textSecondary }]}>
                      {up.transaction_count} transactions · {formatDate(up.uploaded_at)}
                    </Text>
                    <Text style={[styles.uploadFilename, { color: colors.textSecondary }]} numberOfLines={1}>
                      {up.filename}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Preferences</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, cardStyle]}>
            <SettingsRow
              icon={<Moon size={16} color={theme === 'dark' ? '#3B82F6' : '#6B7280'} />}
              label="Dark Mode"
              isSwitch
              switchValue={theme === 'dark'}
              onToggle={toggleTheme}
              border={false}
            />
          </View>
        </View>

        {/* Privacy & Data */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Privacy & Data</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, cardStyle]}>
            <SettingsRow
              icon={<Shield size={16} color="#3B82F6" />}
              label="100% Local Inference"
              value="On-device AI"
            />
            <SettingsRow
              icon={<Cpu size={16} color="#3B82F6" />}
              label="AI Model"
              value="Gemma 4 · 4.7 GB"
            />
            <SettingsRow
              icon={<HardDrive size={16} color="#3B82F6" />}
              label="Clear All Local Data"
              onPress={handleClearData}
              danger
            />
            <SettingsRow
              icon={<Trash2 size={16} color="#EF4444" />}
              label="Factory Reset"
              onPress={handleFactoryReset}
              danger
              border={false}
            />
          </View>
        </View>

        <Text style={[styles.footerText, { color: colors.textSecondary }]}>ClearMoney v1.0.0 · Built for privacy</Text>
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  headerTitle: { fontSize: 28, fontFamily: Fonts.serif, letterSpacing: -0.5 },
  profileCard: {
    marginHorizontal: 20, borderRadius: 24, borderWidth: 1,
    padding: 22, flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14,
  },
  profileInfo: { flex: 1 },
  name: { fontSize: 20, fontFamily: Fonts.bold, letterSpacing: -0.5, marginBottom: 2 },
  subName: { fontSize: 12, fontFamily: Fonts.regular, marginBottom: 14 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 20, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  statDivider: { width: 1, height: 30, borderRadius: 1 },
  privacyBanner: {
    marginHorizontal: 20, marginBottom: 28, borderRadius: 16, borderWidth: 1,
    paddingVertical: 13, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  privacyText: { fontSize: 13, color: '#3B82F6', fontFamily: Fonts.medium, flex: 1 },
  section: { paddingHorizontal: 20, marginBottom: 28 },
  sectionTitle: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.4, marginBottom: 12, textTransform: 'uppercase' },
  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  emptyRow: { paddingVertical: 20, paddingHorizontal: 16 },
  emptyText: { fontSize: 14, fontFamily: Fonts.regular, textAlign: 'center' },
  uploadRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  uploadIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  uploadInfo: { flex: 1 },
  uploadBank: { fontSize: 15, fontFamily: Fonts.semiBold, marginBottom: 2 },
  uploadMeta: { fontSize: 12, fontFamily: Fonts.regular, marginBottom: 1 },
  uploadFilename: { fontSize: 11, fontFamily: Fonts.regular },
  footerText: { fontSize: 12, fontFamily: Fonts.regular, textAlign: 'center', marginBottom: 12 },
});
