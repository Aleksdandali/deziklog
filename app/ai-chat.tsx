import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
  ActivityIndicator, Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { X, Send, Sparkles, Bot, ArrowDown } from 'lucide-react-native';
import ReAnimated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { COLORS, RADIUS, FONT } from '../lib/constants';
import { RADII, SHADOWS } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

// ── Types ───────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ── Quick suggestions ───────────────────────────────────

const SUGGESTIONS = [
  'Як розвести Деланол для замочування інструментів?',
  'Як приготувати розчин Біонол форте?',
  'Скільки мл засобу на 1 літр води?',
  'Що робити після замочування інструментів?',
];

// ── Main component ──────────────────────────────────────

export default function AIChatScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages.length]);

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput('');
    Keyboard.dismiss();

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { message: msg, history },
      });

      if (error) throw error;

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data?.reply ?? 'Не вдалося отримати відповідь.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Вибачте, сталася помилка. Спробуйте ще раз.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // ── Render message bubble ─────────────────────────────

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isUser = item.role === 'user';

    return (
      <ReAnimated.View
        entering={FadeInDown.duration(300).delay(50)}
        style={[styles.msgRow, isUser && styles.msgRowUser]}
      >
        {!isUser && (
          <View style={styles.avatar}>
            <Bot size={18} color={COLORS.brand} strokeWidth={2} />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAssistant,
          ]}
        >
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
      <ReAnimated.View
        entering={FadeIn.duration(300)}
        style={[styles.msgRow]}
      >
        <View style={styles.avatar}>
          <Bot size={18} color={COLORS.brand} strokeWidth={2} />
        </View>
        <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
          <View style={styles.typingDots}>
            <ReAnimated.View
              entering={FadeIn.duration(400).delay(0)}
              style={[styles.dot]}
            />
            <ReAnimated.View
              entering={FadeIn.duration(400).delay(200)}
              style={[styles.dot]}
            />
            <ReAnimated.View
              entering={FadeIn.duration(400).delay(400)}
              style={[styles.dot]}
            />
          </View>
        </View>
      </ReAnimated.View>
    );
  };

  // ── Empty state ───────────────────────────────────────

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <LinearGradient
          colors={[COLORS.brand, COLORS.brandDark]}
          style={styles.emptyIcon}
        >
          <Sparkles size={32} color="#fff" strokeWidth={1.8} />
        </LinearGradient>
      </View>

      <Text style={styles.emptyTitle}>AI-Асистент</Text>
      <Text style={styles.emptySubtitle}>
        Підкажу як правильно розвести Деланол або Біонол форте, скільки тримати інструменти та які режими використовувати
      </Text>

      <View style={styles.suggestionsWrap}>
        <Text style={styles.suggestionsLabel}>Спробуйте запитати:</Text>
        {SUGGESTIONS.map((s, i) => (
          <TouchableOpacity
            key={i}
            style={styles.suggestionChip}
            activeOpacity={0.7}
            onPress={() => sendMessage(s)}
          >
            <Text style={styles.suggestionText}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ── Scroll handler ────────────────────────────────────

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    setShowScrollDown(distanceFromBottom > 100);
  };

  // ── Main render ───────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <Sparkles size={18} color={COLORS.brand} strokeWidth={2} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI-Асистент</Text>
            <Text style={styles.headerSubtitle}>Деланол · Біонол форте</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <X size={20} color={COLORS.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Divider */}
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

          {/* Scroll to bottom FAB */}
          {showScrollDown && (
            <TouchableOpacity
              style={styles.scrollDownBtn}
              onPress={scrollToBottom}
              activeOpacity={0.8}
            >
              <ArrowDown size={18} color={COLORS.brand} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>

        {/* Input area */}
        <View style={styles.inputContainer}>
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Запитайте про Деланол..."
              placeholderTextColor={COLORS.textTertiary}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              editable={!loading}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (input.trim() && !loading) ? styles.sendBtnActive : styles.sendBtnDisabled,
              ]}
              onPress={() => sendMessage()}
              disabled={!input.trim() || loading}
              activeOpacity={0.7}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Send size={18} color="#fff" strokeWidth={2.5} />
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
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: 'Inter_700Bold',
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
  },

  // Messages list
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },

  // Message row
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
    maxWidth: '85%',
  },
  msgRowUser: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },

  // Avatar
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  // Bubbles
  bubble: {
    borderRadius: 18,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
    padding: 14,
    ...SHADOWS.card,
  },
  bubbleGradient: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  msgTextUser: {
    fontSize: 15,
    lineHeight: 22,
    color: '#fff',
    fontFamily: 'Inter_400Regular',
  },
  msgTextAssistant: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    fontFamily: 'Inter_400Regular',
  },

  // Typing indicator
  typingBubble: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.textTertiary,
    opacity: 0.5,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  emptyIconWrap: {
    marginBottom: 20,
    ...SHADOWS.button,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: 'Inter_700Bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textSecondary,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginBottom: 28,
  },
  suggestionsWrap: {
    width: '100%',
    gap: 8,
  },
  suggestionsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
  },
  suggestionChip: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...SHADOWS.card,
  },
  suggestionText: {
    fontSize: 14,
    color: COLORS.brand,
    fontFamily: 'Inter_500Medium',
  },

  // Scroll down button
  scrollDownBtn: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },

  // Input area
  inputContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    fontFamily: 'Inter_400Regular',
    maxHeight: 100,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: Platform.OS === 'ios' ? 8 : 6,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: COLORS.brand,
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.textTertiary,
    opacity: 0.4,
  },
  disclaimer: {
    fontSize: 11,
    color: COLORS.textTertiary,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 8,
  },
});
