/**
 * BiometricLock — Face ID / Touch ID gate for ClearMoney.
 *
 * Usage:
 *   wrap your app root with <BiometricLockProvider>, then use
 *   useBiometricLock() to read { locked } state.  The provider
 *   renders a full-screen lock overlay whenever locked === true.
 */

import React, {
  createContext, useContext, useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, Pressable, AppState, AppStateStatus, Animated,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Fonts } from './Typography';
import { useTheme } from './ThemeContext';

// ─── Context ──────────────────────────────────────────────────────────────────

interface LockCtx {
  locked: boolean;
  supported: boolean;
}

const LockContext = createContext<LockCtx>({ locked: false, supported: false });

export const useBiometricLock = () => useContext(LockContext);

// ─── Lock screen UI ───────────────────────────────────────────────────────────

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { theme } = useTheme();
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const scale  = useRef(new Animated.Value(1)).current;

  const pulse = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 100, useNativeDriver: true }),
      Animated.spring(scale,  { toValue: 1,    tension: 200, friction: 8, useNativeDriver: true }),
    ]).start();
  };

  const authenticate = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    pulse();

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock ClearMoney',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        onUnlock();
      } else {
        const err = result.error as string;
        const msg =
          err === 'user_cancel'     ? '' :
          err === 'user_fallback'   ? '' :
          err === 'lockout'         ? 'Too many attempts. Try again later.' :
          err === 'lockout_permanent' ? 'Biometrics locked. Use device passcode.' :
          'Authentication failed. Tap to retry.';
        setError(msg);
      }
    } catch {
      setError('Biometrics unavailable. Tap to retry.');
    } finally {
      setLoading(false);
    }
  }, [loading, onUnlock]);

  // Auto-prompt on mount
  useEffect(() => { authenticate(); }, []);

  const isDark = theme === 'dark';

  return (
    <View style={[lock.container, { backgroundColor: isDark ? '#06080F' : '#F2F5FF' }]}>
      <View style={lock.content}>
        {/* App icon */}
        <Animated.View style={[lock.iconCircle, { transform: [{ scale }] }]}>
          <Text style={lock.iconText}>$</Text>
        </Animated.View>

        <Text style={[lock.appName, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>ClearMoney</Text>
        <Text style={[lock.subtitle, { color: isDark ? '#6B7280' : '#5B6A8A' }]}>
          Your finances are locked
        </Text>

        <Pressable
          style={[lock.btn, { backgroundColor: isDark ? '#1C2333' : '#FFFFFF', borderColor: isDark ? '#2A3550' : '#E4E8F7' }]}
          onPress={authenticate}
          disabled={loading}
        >
          <Text style={lock.btnIcon}>{loading ? '⏳' : '🔒'}</Text>
          <Text style={[lock.btnText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
            {loading ? 'Authenticating…' : 'Unlock with Face ID'}
          </Text>
        </Pressable>

        {!!error && (
          <Text style={lock.error}>{error}</Text>
        )}

        <View style={[lock.badge, { borderColor: 'rgba(59,130,246,0.2)', backgroundColor: 'rgba(59,130,246,0.07)' }]}>
          <View style={lock.dot} />
          <Text style={lock.badgeText}>All data stays on your device</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BiometricLockProvider({ children }: { children: React.ReactNode }) {
  const [supported, setSupported] = useState(false);
  const [locked,    setLocked]    = useState(false);

  const appState    = useRef<AppStateStatus>(AppState.currentState);
  const lastUnlock  = useRef<number>(0);
  const LOCK_AFTER  = 60_000; // re-lock after 60 s in background

  // Check hardware + enrollment once on mount
  useEffect(() => {
    (async () => {
      const has = await LocalAuthentication.hasHardwareAsync();
      if (!has) return;
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) return;
      setSupported(true);
      setLocked(true); // lock immediately on first open
    })();
  }, []);

  // Re-lock when app returns from background
  useEffect(() => {
    if (!supported) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = appState.current.match(/inactive|background/);
      const isActive      = next === 'active';
      if (wasBackground && isActive) {
        const elapsed = Date.now() - lastUnlock.current;
        if (elapsed > LOCK_AFTER) setLocked(true);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [supported]);

  const handleUnlock = useCallback(() => {
    lastUnlock.current = Date.now();
    setLocked(false);
  }, []);

  return (
    <LockContext.Provider value={{ locked, supported }}>
      {children}
      {supported && locked && <LockScreen onUnlock={handleUnlock} />}
    </LockContext.Provider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const lock = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  iconText:  { fontSize: 40, fontFamily: Fonts.bold, color: '#FFFFFF' },
  appName:   { fontSize: 28, fontFamily: Fonts.serif, letterSpacing: -0.5, marginBottom: 8 },
  subtitle:  { fontSize: 14, fontFamily: Fonts.regular, marginBottom: 40 },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  btnIcon:   { fontSize: 20 },
  btnText:   { fontSize: 16, fontFamily: Fonts.semiBold },
  error:     { fontSize: 13, fontFamily: Fonts.regular, color: '#EF4444', textAlign: 'center', marginBottom: 24 },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    marginTop: 8,
  },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6' },
  badgeText: { fontSize: 12, fontFamily: Fonts.medium, color: '#3B82F6' },
});
