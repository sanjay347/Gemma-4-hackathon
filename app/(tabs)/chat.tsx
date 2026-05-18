import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Fonts } from '../../src/components/Typography';
import {
  View, Text, StyleSheet, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, Animated, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Send, Sparkles, Zap } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { chatAgentStream } from '../../src/gemma/agents/chat';
import { getTransactions, getUserProfile } from '../../src/db/transactions';
import { useTheme } from '../../src/components/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  streaming?: boolean;
  suggestions?: string[];
}

const STARTER_QUESTIONS = [
  "Why am I always broke by the 20th?",
  "Where am I wasting the most money?",
  "What subscriptions should I cancel?",
  "How much did I spend on food last month?",
  "Am I saving money?",
  "Show my last 10 transactions",
];

// ─── Contextual follow-up suggestions ────────────────────────────────────────

function getSuggestions(userMessage: string, aiResponse: string): string[] {
  const q = userMessage.toLowerCase();
  const a = aiResponse.toLowerCase();

  // After subscription answer
  if (q.includes('subscription') || q.includes('recurring') || a.includes('recurring charge')) {
    return ['How much am I paying annually?', 'Which haven\'t I used recently?', 'What\'s my total spending?'];
  }
  // After food/dining
  if (q.includes('food') || q.includes('dining') || q.includes('restaurant')) {
    return ['Compare to last month', 'What\'s my top food merchant?', 'Show my spending trend'];
  }
  // After income
  if (q.includes('income') || q.includes('earn') || q.includes('salary')) {
    return ['What\'s my savings rate?', 'How much did I spend?', 'Show monthly overview'];
  }
  // After savings
  if (q.includes('sav') || a.includes('savings rate')) {
    return ['How can I improve?', 'What\'s my biggest expense?', 'Show budget recommendations'];
  }
  // After overview / summary
  if (q.includes('overview') || q.includes('summary') || q.includes('everything')) {
    return ['What are my top merchants?', 'Do I have any subscriptions?', 'Show spending trend'];
  }
  // After transactions
  if (q.includes('transaction') || q.includes('recent') || q.includes('last')) {
    return ['What\'s my biggest purchase?', 'Show by category', 'Any unusual spending?'];
  }
  // After spending/category
  if (q.includes('spend') || q.includes('spent') || q.includes('categor')) {
    return ['Compare to last month', 'What\'s the trend?', 'Show top merchants'];
  }
  // After trend
  if (q.includes('trend') || a.includes('trend')) {
    return ['Am I on track this month?', 'What\'s my best month?', 'Show budget advice'];
  }
  // After broke/pattern
  if (q.includes('broke') || q.includes('payday') || q.includes('run out')) {
    return ['Show my daily average', 'What\'s my biggest expense?', 'Budget recommendations'];
  }
  // After month summary
  if (q.includes('last month') || q.includes('this month') || q.includes('month')) {
    return ['Compare to previous month', 'What\'s my savings rate?', 'Show spending by category'];
  }
  // Generic follow-ups
  return ['Show full overview', 'What should I cut back on?', 'Am I on track this month?'];
}

// ─── Animated typing dots ─────────────────────────────────────────────────────

function TypingDots() {
  const d0 = useRef(new Animated.Value(0)).current;
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeDotAnim = (dot: Animated.Value, i: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(dot, { toValue: -5, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.delay(560 - i * 140),
        ])
      );
    const a0 = makeDotAnim(d0, 0);
    const a1 = makeDotAnim(d1, 1);
    const a2 = makeDotAnim(d2, 2);
    a0.start(); a1.start(); a2.start();
    return () => { a0.stop(); a1.stop(); a2.stop(); };
  }, []);

  return (
    <View style={dotStyles.row}>
      {[d0, d1, d2].map((d, i) => (
        <Animated.View key={i} style={[dotStyles.dot, { transform: [{ translateY: d }] }]} />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#3B82F6', marginHorizontal: 3 },
});

// ─── Rich text renderer ───────────────────────────────────────────────────────

function RichText({ text, color }: { text: string; color: string }) {
  const lines = text.split('\n').filter((_, i, arr) => !(arr[i - 1] === '' && arr[i] === ''));
  return (
    <Text style={{ fontSize: 15, lineHeight: 23, color }}>
      {lines.map((line, li) => {
        const parts = line.split(/(\$[\d,]+(?:\.\d{1,2})?)/g);
        return (
          <Text key={li}>
            {li > 0 && '\n'}
            {parts.map((part, pi) =>
              /^\$[\d,]+(?:\.\d{1,2})?$/.test(part)
                ? <Text key={pi} style={{ color: '#3B82F6', fontWeight: '700' }}>{part}</Text>
                : part
            )}
          </Text>
        );
      })}
    </Text>
  );
}

// ─── Streaming cursor ─────────────────────────────────────────────────────────

function Cursor() {
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
    return () => blink.stopAnimation();
  }, []);
  return (
    <Animated.Text style={{ opacity: blink, color: '#3B82F6', fontWeight: '700', fontSize: 16 }}>▋</Animated.Text>
  );
}

// ─── Suggestion chips ─────────────────────────────────────────────────────────

function SuggestionChips({
  suggestions,
  onPress,
  colors,
  chipShadow,
}: { suggestions: string[]; onPress: (s: string) => void; colors: any; chipShadow?: object }) {
  return (
    <View style={chipStyles.container}>
      {suggestions.map((s, i) => (
        <Pressable
          key={i}
          style={({ pressed }) => [
            chipStyles.chip,
            { backgroundColor: colors.card, borderColor: 'rgba(59,130,246,0.3)' },
            chipShadow,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => onPress(s)}
        >
          <Text style={[chipStyles.text, { color: colors.text }]}>{s}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, paddingHorizontal: 4 },
  chip:      { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 20, borderWidth: 1 },
  text:      { fontSize: 13, fontWeight: '500' },
});

// ─── Message bubble ───────────────────────────────────────────────────────────

const MessageBubble = memo(({
  msg, colors, isLast, onSuggestion, chipShadow,
}: { msg: Message; colors: any; isLast: boolean; onSuggestion: (s: string) => void; chipShadow?: object }) => {
  const progress = useRef(new Animated.Value(0)).current;
  const isUser = msg.sender === 'user';

  useEffect(() => {
    Animated.spring(progress, { toValue: 1, tension: 120, friction: 12, useNativeDriver: true }).start();
  }, []);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [isUser ? 40 : -40, 0] });
  const scale      = progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const opacity    = progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.7, 1] });

  const showTyping = msg.sender === 'ai' && msg.streaming && msg.text === '';

  return (
    <Animated.View
      style={[
        styles.msgWrapper,
        isUser ? styles.msgRight : styles.msgLeft,
        { opacity, transform: [{ translateX }, { scale }] },
      ]}
    >
      {!isUser && (
        <View style={[styles.smallAvatar, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
          <Sparkles size={10} color="#3B82F6" />
        </View>
      )}

      <View style={styles.bubbleCol}>
        {showTyping ? (
          <View style={[styles.bubble, styles.aiBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TypingDots />
          </View>
        ) : isUser ? (
          <LinearGradient
            colors={['#3B82F6', '#1D4ED8']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.bubble, styles.userBubble]}
          >
            <Text style={styles.userText}>{msg.text}</Text>
          </LinearGradient>
        ) : (
          <View style={[styles.bubble, styles.aiBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <RichText text={msg.text} color={colors.text} />
            {msg.streaming && isLast && msg.text.length > 0 && <Cursor />}
          </View>
        )}

        {/* Follow-up suggestions — show on last completed AI message */}
        {!isUser && !msg.streaming && isLast && msg.suggestions && msg.suggestions.length > 0 && (
          <SuggestionChips suggestions={msg.suggestions} onPress={onSuggestion} colors={colors} chipShadow={chipShadow} />
        )}
      </View>
    </Animated.View>
  );
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { colors, theme } = useTheme();
  const isLight = theme === 'light';

  const chipShadow = isLight ? {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 3,
  } : {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 2,
  };

  const inputBarShadow = isLight ? {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 6,
  } : {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  };
  const insets = useSafeAreaInsets();
  const [aiName, setAiName]         = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      text: "Hey! I've analyzed your statements on this device. Ask me anything — nothing leaves your phone.",
      sender: 'ai',
      suggestions: STARTER_QUESTIONS.slice(0, 3),
    },
  ]);
  const [inputText, setInputText]   = useState('');
  const [isLoading, setIsLoading]   = useState(false);
  const scrollRef                   = useRef<ScrollView>(null);
  const streamingIdRef              = useRef('');
  const lastUserMsgRef              = useRef('');

  useFocusEffect(useCallback(() => {
    getUserProfile().then(p => { if (p.ai_name) setAiName(p.ai_name); });
  }, []));

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsgId = Date.now().toString();
    const aiMsgId   = (Date.now() + 1).toString();
    streamingIdRef.current  = aiMsgId;
    lastUserMsgRef.current  = text;

    setMessages(prev => [
      ...prev.map(m => ({ ...m, suggestions: undefined })), // clear old suggestions
      { id: userMsgId, text, sender: 'user' },
      { id: aiMsgId, text: '', sender: 'ai', streaming: true },
    ]);
    setInputText('');
    setIsLoading(true);
    scrollToBottom();

    try {
      const txs = await getTransactions();
      if (txs.length === 0) {
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId
            ? { ...m, text: "I can't see any transactions yet. Upload a bank statement from the home screen first.", streaming: false }
            : m
        ));
        return;
      }

      let finalAnswer = '';
      await chatAgentStream(text, txs, (partial) => {
        finalAnswer = partial;
        setMessages(prev => prev.map(m =>
          m.id === streamingIdRef.current ? { ...m, text: partial } : m
        ));
        scrollToBottom();
      });

      // Attach follow-up suggestions to the completed AI message
      const suggestions = getSuggestions(lastUserMsgRef.current, finalAnswer);
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? { ...m, streaming: false, suggestions }
          : m
      ));
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? { ...m, text: "Something went wrong. Please try again.", streaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };

  const canSend = inputText.trim().length > 0 && !isLoading;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom + 8 : 20}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <View style={[styles.aiAvatarLarge, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
          <Sparkles size={18} color="#3B82F6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {aiName ? `Ask ${aiName}` : 'Ask ClearMoney'}
          </Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>On-device AI · instant & private</Text>
          </View>
        </View>
        <View style={[styles.onDeviceBadge, { borderColor: 'rgba(59,130,246,0.3)', backgroundColor: 'rgba(59,130,246,0.08)' }]}>
          <Zap size={10} color="#3B82F6" />
          <Text style={styles.onDeviceText}>Private</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {/* Starter chips — only when no user message yet */}
        {messages.length === 1 && (
          <View style={styles.suggestions}>
            <Text style={[styles.suggestLabel, { color: colors.textSecondary }]}>ASK ME ANYTHING</Text>
            {STARTER_QUESTIONS.map((q, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  chipShadow,
                  pressed && { opacity: 0.65, transform: [{ scale: 0.97 }] },
                ]}
                onPress={() => sendMessage(q)}
              >
                <Text style={[styles.chipText, { color: colors.text }]}>{q}</Text>
                <Text style={styles.chipArrow}>→</Text>
              </Pressable>
            ))}
          </View>
        )}

        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            colors={colors}
            isLast={i === messages.length - 1}
            onSuggestion={sendMessage}
            chipShadow={chipShadow}
          />
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Input bar */}
      <View style={[
        styles.inputBar,
        { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: 12 },
        inputBarShadow,
      ]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
          placeholder="Ask about your finances..."
          placeholderTextColor={colors.textSecondary}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
          returnKeyType="default"
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: canSend ? '#3B82F6' : colors.border },
            pressed && canSend && { transform: [{ scale: 0.88 }], opacity: 0.9 },
          ]}
          onPress={() => sendMessage(inputText)}
          disabled={!canSend}
        >
          {isLoading
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Send size={17} color={canSend ? '#FFFFFF' : colors.textSecondary} />
          }
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  aiAvatarLarge:{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 18, fontFamily: Fonts.serifSemi, letterSpacing: -0.2 },
  statusRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 5 },
  statusDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6' },
  statusText:   { fontSize: 12, fontFamily: Fonts.medium, color: '#3B82F6' },
  onDeviceBadge:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  onDeviceText: { fontSize: 11, fontFamily: Fonts.semiBold, color: '#3B82F6', letterSpacing: 0.3 },

  chat:         { flex: 1 },
  chatContent:  { paddingHorizontal: 16, paddingTop: 24 },

  suggestions:  { marginBottom: 32, gap: 10 },
  suggestLabel: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.5, marginBottom: 6 },
  chip:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 18 },
  chipText:     { fontSize: 15, fontFamily: Fonts.regular, flex: 1, lineHeight: 21 },
  chipArrow:    { fontSize: 18, color: '#3B82F6', marginLeft: 10 },

  msgWrapper:   { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
  msgLeft:      { justifyContent: 'flex-start' },
  msgRight:     { justifyContent: 'flex-end' },
  bubbleCol:    { flex: 1 },
  smallAvatar:  { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginBottom: 2, flexShrink: 0 },
  bubble:       { maxWidth: '100%', paddingVertical: 13, paddingHorizontal: 17, borderRadius: 22 },
  userBubble:   { borderBottomRightRadius: 6, alignSelf: 'flex-end', maxWidth: '78%', shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10, elevation: 4 },
  aiBubble:     { borderBottomLeftRadius: 6, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 },
  userText:     { color: '#FFFFFF', fontSize: 15, fontFamily: Fonts.regular, lineHeight: 23 },

  inputBar:     { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end', gap: 10 },
  input:        { flex: 1, borderRadius: 24, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 13, fontSize: 15, fontFamily: Fonts.regular, maxHeight: 110, borderWidth: 1 },
  sendBtn:      { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
