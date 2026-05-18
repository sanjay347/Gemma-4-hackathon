import React, { useRef, useCallback, useState } from 'react';
import { Tabs } from 'expo-router';
import { Home, PieChart, MessageSquare, Plus, User } from 'lucide-react-native';
import { Pressable, Text, View, StyleSheet, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/components/ThemeContext';
import { Fonts } from '../../src/components/Typography';
import { getUserProfile } from '../../src/db/transactions';
import { useFocusEffect } from '@react-navigation/native';

function TabItem({
  icon, label, active, onPress,
}: { icon: React.ReactNode; label: string; active: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start();
    onPress();
  }, [onPress]);

  return (
    <Pressable hitSlop={10} onPress={handlePress} style={styles.tabItem}>
      <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
        {icon}
        <Text style={[styles.tabLabel, { color: active ? '#3B82F6' : '#6B7280' }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function CenterButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.85, duration: 100, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 220, friction: 7, useNativeDriver: true }),
    ]).start();
    onPress();
  }, [onPress]);

  return (
    <View style={styles.centerWrapper}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={handlePress}
          style={styles.centerButton}
          hitSlop={8}
        >
          <Plus color="#080808" size={26} strokeWidth={2.5} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [aiName, setAiName] = useState('');

  useFocusEffect(useCallback(() => {
    getUserProfile().then(p => { if (p.ai_name) setAiName(p.ai_name); });
  }, []));

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => {
        const { state, navigation } = props;
        const current = state.routes[state.index]?.name ?? '';
        const goTo = (screen: string) => (navigation as any).navigate(screen);

        const barContent = (
          <View style={styles.tabBar}>
            <TabItem
              icon={<Home color={current === 'dashboard' ? '#3B82F6' : '#6B7280'} size={22} />}
              label="Home"
              active={current === 'dashboard'}
              onPress={() => goTo('dashboard')}
            />
            <TabItem
              icon={<PieChart color={current === 'insights' ? '#3B82F6' : '#6B7280'} size={22} />}
              label="Insights"
              active={current === 'insights'}
              onPress={() => goTo('insights')}
            />

            <CenterButton onPress={() => router.push('/upload')} />

            <TabItem
              icon={<MessageSquare color={current === 'chat' ? '#3B82F6' : '#6B7280'} size={22} />}
              label={aiName || 'Chat'}
              active={current === 'chat'}
              onPress={() => goTo('chat')}
            />
            <TabItem
              icon={<User color={current === 'profile' ? '#3B82F6' : '#6B7280'} size={22} />}
              label="Profile"
              active={current === 'profile'}
              onPress={() => goTo('profile')}
            />
          </View>
        );

        if (Platform.OS === 'ios') {
          return (
            <View style={styles.shadowWrapper}>
              <BlurView
                intensity={90}
                tint={theme === 'dark' ? 'dark' : 'light'}
                style={[styles.blurWrapper, { paddingBottom: insets.bottom, borderTopColor: colors.border }]}
              >
                {barContent}
              </BlurView>
            </View>
          );
        }

        return (
          <View style={[styles.solidWrapper, { backgroundColor: colors.card, paddingBottom: insets.bottom, borderTopColor: colors.border }]}>
            {barContent}
          </View>
        );
      }}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="insights" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  blurWrapper: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  solidWrapper: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'flex-end',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 4,
    fontFamily: Fonts.semiBold,
    letterSpacing: 0.2,
  },
  centerWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 12,
    elevation: 8,
  },
});
