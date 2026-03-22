import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
  ActivityIndicator, Keyboard, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X, Send, Sparkles, Bot, ArrowDown, Plus, Trash2, MessageCircle, ChevronLeft } from 'lucide-react-native';
import ReAnimated, { FadeInDown, FadeIn, FadeInUp } from 'react-native-reanimated';
import { COLORS } from '../lib/constants';
import { RADII, SHADOWS } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

// ── Types ───────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'ai_chat_sessions';

// ── Quick suggestions ───────────────────────────────────

const SUGGESTIONS = [
  'Як розвести Деланол для інструментів?',
  'Як приготувати Біонол форте?',
  'Скільки мл засобу на 1 літр?',
  'Що робити після замочування?',
];

// ── Storage helpers ─────────────────────────────────────

async function loadSessions(): Promise<ChatSession[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveSessions(sessions: ChatSession[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.slice(0, 40);
  return trimmed.length < firstMessage.length ? trimmed + '…' : trimmed;
}

// ── Main component ──────────────────────────────────────

export default function AIChatScreen() {
  const router = useRouter();
  const { session: authSession } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    loadSessions().then((loaded) => {
      setSessions(loaded);
      // If there are sessions, open the most recent
      if (loaded.length > 0) {
        const latest = loaded[0];
        setActiveSessionId(latest.id);
        setMessages(latest.messages);
      }
    });
  }, []);

  // Persist messages when they change
  useEffect(() => {
    if (!activeSessionId || messages.length === 0) return;
    setSessions((prev) => {
      const updated = prev.map((s) =>
        s.id === activeSessionId
          ? { ...s, messages, updatedAt: new Date().toISOString(), title: s.title || generateTitle(messages[0]?.content ?? '') }
          : s
      );
      saveSessions(updated);
      return updated;
    });
  }, [messages, activeSessionId]);

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  useEffect(() => { scrollToBottom(); }, [messages.length]);

  // ── Session management ────────────────────────────────

  const startNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: '',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSessions((prev) => {
      const updated = [newSession, ...prev];
      saveSessions(updated);
      return updated;
    });
    setActiveSessionId(newSession.id);
    setMessages([]);
    setShowHistory(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openSession = (session: ChatSession) => {
    setActiveSessionId(session.id);
    setMessages(session.messages);
    setShowHistory(false);
  };

  const deleteSession = (id: string) => {
    Alert.alert('Видалити чат?', '', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => {
        setSessions((prev) => {
          const updated = prev.filter((s) => s.id !== id);
          saveSessions(updated);
          if (activeSessionId === id) {
            if (updated.length > 0) {
              setActiveSessionId(updated[0].id);
              setMessages(updated[0].messages);
            } else {
              setActiveSessionId(null);
              setMessages([]);
            }
          }
          return updated;
        });
      }},
    ]);
  };

  // ── Send message ──────────────────────────────────────

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput('');
    Keyboard.dismiss();

    // Create session if none active
    let sessionId = activeSessionId;
    if (!sessionId) {
      const newSession: ChatSession = {
        id: Date.now().toString(),
        title: generateTitle(msg),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      sessionId = newSession.id;
      setActiveSessionId(sessionId);
      setSessions((prev) => {
        const updated = [newSession, ...prev];
        saveSessions(updated);
        return updated;
      });
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      // Use fetch directly to avoid supabase.functions.invoke throwing on non-2xx
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: msg, history }),
      });

      const data = await res.json();
      const replyText = data?.reply ?? data?.error ?? 'Не вдалося отримати відповідь.';

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: replyText,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (res.ok && !data?.error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      console.error('[AI Assistant]', err);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Помилка з'єднання. Перевірте інтернет та спробуйте ще раз.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // ── Render message bubble ─────────────────────────────

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <ReAnimated.View
        entering={FadeInDown.duration(250).delay(30)}
        style={[styles.msgRow, isUser && styles.msgRowUser]}
      >
        {!isUser && (
          <View style={styles.avatar}>
            <Bot size={16} color={COLORS.brand} strokeWidth={2} />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          {isUser ? (
            <LinearGradient
              colors={[COLORS.brand, COLORS.brandDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bubbleGradient}
            >
              <Text style={styles.msgTextUser}>{item.content}</Text>
            </LinearGradient>
          ) : (
            <Text style={styles.msgTextAssistant}>{item.content}</Text>
          )}
        </View>
      </ReAnimated.View>
    );
  };

  // ── Typing indicator ──────────────────────────────────

  const renderTypingIndicator = () => {
    if (!loading) return null;
    return (
      <ReAnimated.View entering={FadeIn.duration(300)} style={styles.msgRow}>
        <View style={styles.avatar}>
          <Bot size={16} color={COLORS.brand} strokeWidth={2} />
        </View>
        <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
          <ActivityIndicator size="small" color={COLORS.brand} />
        </View>
      </ReAnimated.View>
    );
  };

  // ── Empty state ───────────────────────────────────────

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <LinearGradient colors={[COLORS.brand, COLORS.brandDark]} style={styles.emptyIcon}>
          <Sparkles size={32} color="#fff" strokeWidth={1.8} />
        </LinearGradient>
      </View>

      <Text style={styles.emptyTitle}>AI-асистент по розчинам</Text>
      <Text style={styles.emptySubtitle}>
        Підкажу як правильно розвести Деланол або Біонол форте, скільки тримати інструменти та які режими використовувати
      </Text>

      <View style={styles.suggestionsWrap}>
        <Text style={styles.suggestionsLabel}>Спробуйте запитати:</Text>
        {SUGGESTIONS.map((s, i) => (
          <TouchableOpacity key={i} style={styles.suggestionChip} activeOpacity={0.7} onPress={() => sendMessage(s)}>
            <Text style={styles.suggestionText}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ── History panel ─────────────────────────────────────

  const renderHistoryPanel = () => (
    <ReAnimated.View entering={FadeIn.duration(200)} style={styles.historyPanel}>
      <View style={styles.historyHeader}>
        <TouchableOpacity onPress={() => setShowHistory(false)} activeOpacity={0.7} style={styles.historyBackBtn}>
          <ChevronLeft size={20} color={COLORS.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.historyTitle}>Історія чатів</Text>
        <TouchableOpacity onPress={startNewChat} activeOpacity={0.7} style={styles.historyNewBtn}>
          <Plus size={20} color={COLORS.brand} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.historyEmpty}>
          <MessageCircle size={40} color={COLORS.textTertiary} strokeWidth={1.5} />
          <Text style={styles.historyEmptyText}>Чатів поки немає</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const isActive = item.id === activeSessionId;
            const date = new Date(item.updatedAt);
            const dateStr = date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
            const msgCount = item.messages.length;
            return (
              <TouchableOpacity
                style={[styles.historyCard, isActive && styles.historyCardActive]}
                onPress={() => openSession(item)}
                activeOpacity={0.7}
              >
                <View style={styles.historyCardContent}>
                  <Text style={[styles.historyCardTitle, isActive && styles.historyCardTitleActive]} numberOfLines={1}>
                    {item.title || 'Новий чат'}
                  </Text>
                  <Text style={styles.historyCardMeta}>
                    {dateStr} · {msgCount} {msgCount === 1 ? 'повідомлення' : 'повідомлень'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => deleteSession(item.id)} hitSlop={12} style={styles.historyDeleteBtn}>
                  <Trash2 size={14} color={COLORS.textTertiary} strokeWidth={2} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </ReAnimated.View>
  );

  // ── Scroll handler ────────────────────────────────────

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    setShowScrollDown(distanceFromBottom > 100);
  };

  // ── Main render ───────────────────────────────────────

  if (showHistory) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHistoryPanel()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerIconWrap} onPress={() => setShowHistory(true)} activeOpacity={0.7}>
            <MessageCircle size={18} color={COLORS.brand} strokeWidth={2} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>AI-асистент по розчинам</Text>
            <Text style={styles.headerSubtitle}>Деланол · Біонол форте</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.headerBtn} onPress={startNewChat} activeOpacity={0.7}>
            <Plus size={18} color={COLORS.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <X size={18} color={COLORS.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.flex}>
          {messages.length === 0 ? (
            renderEmptyState()
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={100}
              ListFooterComponent={renderTypingIndicator}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {showScrollDown && (
            <TouchableOpacity style={styles.scrollDownBtn} onPress={scrollToBottom} activeOpacity={0.8}>
              <ArrowDown size={16} color={COLORS.brand} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>

        {/* Input area */}
        <View style={styles.inputContainer}>
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Запитайте про розчини..."
              placeholderTextColor={COLORS.textTertiary}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              editable={!loading}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (input.trim() && !loading) ? styles.sendBtnActive : styles.sendBtnDisabled]}
              onPress={() => sendMessage()}
              disabled={!input.trim() || loading}
              activeOpacity={0.7}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Send size={16} color="#fff" strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.disclaimer}>
            Довідкова інформація. Звіряйтеся з інструкцією виробника.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerIconWrap: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, fontFamily: 'Inter_700Bold' },
  headerSubtitle: { fontSize: 11, color: COLORS.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 1 },
  headerBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: COLORS.borderLight },

  // Messages
  messagesList: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, maxWidth: '85%' },
  msgRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.brandLight,
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  bubble: { borderRadius: 16, overflow: 'hidden', maxWidth: '100%' },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAssistant: {
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
    borderBottomLeftRadius: 4, padding: 12, ...SHADOWS.card,
  },
  bubbleGradient: { paddingHorizontal: 14, paddingVertical: 10 },
  msgTextUser: { fontSize: 14, lineHeight: 21, color: '#fff', fontFamily: 'Inter_400Regular' },
  msgTextAssistant: { fontSize: 14, lineHeight: 21, color: COLORS.text, fontFamily: 'Inter_400Regular' },
  typingBubble: { paddingVertical: 12, paddingHorizontal: 16 },

  // Empty state
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 40 },
  emptyIconWrap: { marginBottom: 16, ...SHADOWS.button },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  emptySubtitle: {
    fontSize: 13, lineHeight: 20, color: COLORS.textSecondary,
    fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 24,
  },
  suggestionsWrap: { width: '100%', gap: 6 },
  suggestionsLabel: {
    fontSize: 10, fontWeight: '600', color: COLORS.textTertiary, textTransform: 'uppercase',
    letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold', marginBottom: 2,
  },
  suggestionChip: {
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, ...SHADOWS.card,
  },
  suggestionText: { fontSize: 13, color: COLORS.brand, fontFamily: 'Inter_500Medium' },

  // Scroll down
  scrollDownBtn: {
    position: 'absolute', bottom: 8, alignSelf: 'center',
    width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', ...SHADOWS.card,
  },

  // Input
  inputContainer: {
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: Platform.OS === 'ios' ? 6 : 12,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.white,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'flex-end', backgroundColor: COLORS.bg,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    paddingLeft: 14, paddingRight: 5, paddingVertical: 4, minHeight: 44,
  },
  input: {
    flex: 1, fontSize: 14, color: COLORS.text, fontFamily: 'Inter_400Regular',
    maxHeight: 80, paddingTop: Platform.OS === 'ios' ? 8 : 6, paddingBottom: Platform.OS === 'ios' ? 8 : 6,
  },
  sendBtn: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { backgroundColor: COLORS.brand },
  sendBtnDisabled: { backgroundColor: COLORS.textTertiary, opacity: 0.3 },
  disclaimer: {
    fontSize: 10, color: COLORS.textTertiary, fontFamily: 'Inter_400Regular',
    textAlign: 'center', marginTop: 6,
  },

  // History panel
  historyPanel: { flex: 1 },
  historyHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  historyBackBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center',
  },
  historyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, fontFamily: 'Inter_700Bold' },
  historyNewBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  historyEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  historyEmptyText: { fontSize: 14, color: COLORS.textTertiary, fontFamily: 'Inter_400Regular' },
  historyCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginBottom: 8, ...SHADOWS.card,
  },
  historyCardActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brandLight },
  historyCardContent: { flex: 1 },
  historyCardTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, fontFamily: 'Inter_600SemiBold' },
  historyCardTitleActive: { color: COLORS.brand },
  historyCardMeta: { fontSize: 11, color: COLORS.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 3 },
  historyDeleteBtn: { padding: 8 },
});
