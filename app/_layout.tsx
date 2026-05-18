import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { initDB } from '../src/db/schema';
import { View, Text, StyleSheet, StatusBar, Animated } from 'react-native';
import { ThemeProvider, useTheme } from '../src/components/ThemeContext';
import { BiometricLockProvider } from '../src/components/BiometricLock';
import { useFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  DMSerifDisplay_400Regular,
} from '@expo-google-fonts/dm-serif-display';

function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.75)).current;
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.6)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.4)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Logo springs in
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();

    // Pulsing rings
    const pulseRing = (scaleAnim: Animated.Value, opacityAnim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scaleAnim, { toValue: 1.7, duration: 1100, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0, duration: 1100, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scaleAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: delay === 0 ? 0.5 : 0.35, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );

    const r1 = pulseRing(ring1Scale, ring1Opacity, 0);
    const r2 = pulseRing(ring2Scale, ring2Opacity, 550);
    r1.start();
    r2.start();

    // Fade out the splash after 1.6s
    const timer = setTimeout(() => {
      Animated.timing(screenOpacity, { toValue: 0, duration: 380, useNativeDriver: true }).start(() => {
        // Stop loops BEFORE calling onDone so no animated updates fire after unmount
        r1.stop();
        r2.stop();
        logoOpacity.stopAnimation();
        logoScale.stopAnimation();
        onDone();
      });
    }, 1600);

    // Cleanup in case the component unmounts early (e.g. fast refresh)
    return () => {
      clearTimeout(timer);
      r1.stop();
      r2.stop();
      logoOpacity.stopAnimation();
      logoScale.stopAnimation();
      ring1Scale.stopAnimation();
      ring1Opacity.stopAnimation();
      ring2Scale.stopAnimation();
      ring2Opacity.stopAnimation();
      screenOpacity.stopAnimation();
    };
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, styles.splash, { opacity: screenOpacity }]}>
      {/* Pulsing rings */}
      <View style={styles.ringContainer}>
        <Animated.View style={[styles.ring, { transform: [{ scale: ring1Scale }], opacity: ring1Opacity }]} />
        <Animated.View style={[styles.ring, styles.ring2, { transform: [{ scale: ring2Scale }], opacity: ring2Opacity }]} />
        <Animated.View style={[styles.logoCircle, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <Text style={styles.logoIcon}>$</Text>
        </Animated.View>
      </View>
      <Animated.View style={{ opacity: logoOpacity, marginTop: 32, alignItems: 'center' }}>
        <Text style={styles.logoName}>ClearMoney</Text>
        <Text style={styles.logoTagline}>Your finances, on your device</Text>
      </Animated.View>
    </Animated.View>
  );
}

function RootLayoutNav() {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { colors, theme } = useTheme();

  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMSerifDisplay_400Regular,
  });

  useEffect(() => {
    async function setupDB() {
      try {
        await initDB();
        setDbInitialized(true);
      } catch (e) {
        console.error('Failed to initialize database', e);
        setError(e as Error);
      }
    }
    setupDB();
  }, []);

  const appReady = dbInitialized && splashDone && fontsLoaded;

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>Error initializing app: {error.message}</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      {appReady ? (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="upload" />
          <Stack.Screen name="subscriptions" />
          <Stack.Screen name="budgets" />
          <Stack.Screen name="search" />
          <Stack.Screen name="calendar" />
          <Stack.Screen name="transactions" />
          <Stack.Screen name="compare" />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      ) : (
        <View style={[styles.center, { backgroundColor: colors.background }]} />
      )}
      {!splashDone && (
        <AnimatedSplash onDone={() => setSplashDone(true)} />
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <BiometricLockProvider>
        <RootLayoutNav />
      </BiometricLockProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, textAlign: 'center', paddingHorizontal: 24 },
  splash: {
    backgroundColor: '#F2F5FF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  ringContainer: { alignItems: 'center', justifyContent: 'center', width: 160, height: 160 },
  ring: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.45)',
  },
  ring2: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  logoIcon: { fontSize: 36, fontWeight: '800', color: '#FFFFFF' },
  logoName: { fontSize: 28, color: '#0F172A', letterSpacing: -0.3, marginBottom: 6 },
  logoTagline: { fontSize: 13, color: '#5B6A8A' },
});
