import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity,
  Alert, RefreshControl, ScrollView, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Clock, CheckCircle2, AlertCircle, Plus, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ReAnimated, { FadeIn } from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { COLORS, MS_PER_DAY } from '../../lib/constants';
import { RADII } from '../../lib/theme';
import { getCached, setCache } from '../../lib/cache';
import { cancelSolutionNotifications } from '../../lib/notifications';
import { SkeletonCard } from '../../components/Skeleton';
import {
  CONCENTRATE_PRODUCTS,
  PURPOSE_SHORT_LABELS,
  PRODUCT_PURPOSES,
  calculateSolution,
  type SolutionPurpose,
  type SolutionRecipe,
} from '../../lib/solutions-ai';

// ── Shared types ────────────────────────────────────────

interface SolutionRow { id: string; name: string; opened_at: string; expires_at: string; }
type Status = 'active' | 'warning' | 'expired';
type Tab = 'tracker' | 'calculator' | 'guides';

function getStatus(expiresAt: string): { status: Status; daysLeft: number } {
  const expires = new Date(expiresAt);
  if (isNaN(expires.getTime())) return { status: 'expired', daysLeft: 0 };
  const daysLeft = Math.ceil((expires.getTime() - Date.now()) / MS_PER_DAY);
  if (daysLeft <= 0) return { status: 'expired', daysLeft };
  if (daysLeft <= 3) return { status: 'warning', daysLeft };
  return { status: 'active', daysLeft };
}

function statusColor(status: Status) {
  if (status === 'expired') return COLORS.danger;
  if (status === 'warning') return COLORS.warning;
  return COLORS.success;
}

function statusText(status: Status, daysLeft: number) {
  if (status === 'expired') return 'Термін вийшов';
  if (status === 'warning') return `${daysLeft} дні до закінчення`;
  return `${daysLeft} днів залишилось`;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return iso; }
}

import { GUIDES } from '../../lib/guides-data';

// ── Main component ──────────────────────────────────────

export default function SolutionsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [tab, setTab] = useState<Tab>('tracker');

  // Tracker state
  const [solutions, setSolutions] = useState<SolutionRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Calculator state
  const [purpose, setPurpose] = useState<SolutionPurpose | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [speed, setSpeed] = useState<'standard' | 'fast'>('standard');
  const [volumeInput, setVolumeInput] = useState('1000');
  const [recipe, setRecipe] = useState<SolutionRecipe | null>(null);
  const [calculating, setCalculating] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!userId) return;
    if (isRefresh) setRefreshing(true);
    if (initialLoad) {
      const cached = await getCached<SolutionRow[]>(`solutions_${userId}`);
      if (cached) { setSolutions(cached); setInitialLoad(false); }
    }
    try {
      const { data } = await supabase.from('solutions').select('*').eq('user_id', userId).order('opened_at', { ascending: false });
      const result = data ?? [];
      setSolutions(result);
      setCache(`solutions_${userId}`, result);
    } catch (err) {
      console.warn('Solutions: failed to load:', err);
    } finally { setRefreshing(false); setInitialLoad(false); }
  }, [userId, initialLoad]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = (id: string) => {
    Alert.alert('Видалити розчин?', '', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: async () => {
        if (!userId) return;
        await supabase.from('solutions').delete().eq('id', id).eq('user_id', userId);
        cancelSolutionNotifications(id);
        load();
      }},
    ]);
  };

  const handleCalculate = async () => {
    if (!purpose || !productId) { Alert.alert('Оберіть призначення та продукт'); return; }
    const vol = parseInt(volumeInput, 10);
    if (!vol || vol < 100 || vol > 50000) { Alert.alert('Об\'єм: 100–50000 мл'); return; }
    setCalculating(true);
    try {
      const r = await calculateSolution({ purpose, productId, volumeMl: vol, speed });
      setRecipe(r);
    } catch (err: any) {
      Alert.alert('Помилка', err.message);
    } finally { setCalculating(false); }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Розчини</Text>
        {tab === 'tracker' && (
          <TouchableOpacity style={s.addBtn} onPress={() => router.push('/solution/add')} activeOpacity={0.8}>
            <Plus size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(['tracker', 'calculator', 'guides'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)} activeOpacity={0.7}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'tracker' ? 'Контроль' : t === 'calculator' ? 'Калькулятор' : 'Методички'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ═══ TAB: Tracker ═══ */}
      {tab === 'tracker' && (
        initialLoad && solutions.length === 0 ? (
          <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
            <SkeletonCard /><SkeletonCard />
          </View>
        ) : solutions.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="water-outline" size={48} color={COLORS.textSecondary} />
            <Text style={s.emptyTitle}>Розчинів поки немає</Text>
            <Text style={s.emptyText}>Додайте перший розчин для контролю термінів</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/solution/add')} activeOpacity={0.8}>
              <Plus size={16} color={COLORS.brand} />
              <Text style={s.emptyBtnText}>Додати розчин</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={solutions}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.brand} />}
            renderItem={({ item }) => {
              const { status, daysLeft } = getStatus(item.expires_at);
              const color = statusColor(status);
              const bg = color + '18';
              return (
                <TouchableOpacity style={s.card} activeOpacity={0.7} onPress={() => router.push(`/solution/${item.id}`)}>
                  <View style={s.cardTop}>
                    <Text style={s.cardName}>{item.name}</Text>
                    <View style={[s.cardStatusIcon, { backgroundColor: bg }]}>
                      {status === 'active' ? <CheckCircle2 size={20} color={color} /> : <AlertCircle size={20} color={color} />}
                    </View>
                  </View>
                  <View style={s.cardDates}>
                    <View style={s.cardDateRow}><Text style={s.cardDateLabel}>Приготовано:</Text><Text style={s.cardDateValue}>{formatDate(item.opened_at)}</Text></View>
                    <View style={s.cardDateRow}><Text style={s.cardDateLabel}>Дійсний до:</Text><Text style={s.cardDateValue}>{formatDate(item.expires_at)}</Text></View>
                  </View>
                  <View style={s.cardBottom}>
                    <View style={[s.cardBadge, { backgroundColor: bg }]}>
                      <Clock size={14} color={color} />
                      <Text style={[s.cardBadgeText, { color }]}>{statusText(status, daysLeft)}</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={COLORS.textTertiary} />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )
      )}

      {/* ═══ TAB: Calculator ═══ */}
      {tab === 'calculator' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.calcBody} keyboardShouldPersistTaps="handled">
          <ReAnimated.View entering={FadeIn.duration(200)}>
            {!recipe ? (
              <>
                {/* Product */}
                <Text style={s.fieldLabel}>Концентрат</Text>
                <View style={s.chips}>
                  {CONCENTRATE_PRODUCTS.map((p) => (
                    <TouchableOpacity key={p.id} style={[s.chip, productId === p.id && s.chipActive]} onPress={() => { setProductId(p.id); setPurpose(null); }} activeOpacity={0.8}>
                      <Text style={[s.chipText, productId === p.id && s.chipTextActive]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Purpose — filtered by selected product */}
                {productId && (
                  <>
                    <Text style={s.fieldLabel}>Призначення</Text>
                    <View style={s.chips}>
                      {(PRODUCT_PURPOSES[productId] || []).map((p) => (
                        <TouchableOpacity key={p} style={[s.chip, purpose === p && s.chipActive]} onPress={() => setPurpose(p)} activeOpacity={0.8}>
                          <Text style={[s.chipText, purpose === p && s.chipTextActive]}>{PURPOSE_SHORT_LABELS[p]}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Speed — only for disinfectants, not Instrum */}
                {productId && productId !== 'instrum' && (
                <>
                <Text style={s.fieldLabel}>Режим</Text>
                <View style={s.speedRow}>
                  <TouchableOpacity
                    style={[s.speedOption, speed === 'standard' && s.speedActive]}
                    onPress={() => setSpeed('standard')}
                    activeOpacity={0.8}
                  >
                    <Feather name="clock" size={14} color={speed === 'standard' ? '#fff' : COLORS.textSecondary} />
                    <View>
                      <Text style={[s.speedTitle, speed === 'standard' && s.speedTitleActive]}>Стандартний</Text>
                      <Text style={[s.speedDesc, speed === 'standard' && s.speedDescActive]}>Менше концентрату, довша експозиція</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.speedOption, speed === 'fast' && s.speedActiveFast]}
                    onPress={() => setSpeed('fast')}
                    activeOpacity={0.8}
                  >
                    <Feather name="zap" size={14} color={speed === 'fast' ? '#fff' : COLORS.textSecondary} />
                    <View>
                      <Text style={[s.speedTitle, speed === 'fast' && s.speedTitleActive]}>Швидкий</Text>
                      <Text style={[s.speedDesc, speed === 'fast' && s.speedDescActive]}>Більше концентрату, менше часу</Text>
                    </View>
                  </TouchableOpacity>
                </View>
                </>
                )}

                {/* Volume */}
                <Text style={s.fieldLabel}>Об'єм розчину (мл)</Text>
                <View style={s.volumeRow}>
                  {['500', '1000', '2000', '5000'].map((v) => (
                    <TouchableOpacity key={v} style={[s.volumeChip, volumeInput === v && s.chipActive]} onPress={() => setVolumeInput(v)} activeOpacity={0.8}>
                      <Text style={[s.volumeChipText, volumeInput === v && s.chipTextActive]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[s.calcBtn, (!purpose || !productId) && { opacity: 0.4 }]}
                  disabled={!purpose || !productId || calculating}
                  onPress={handleCalculate}
                  activeOpacity={0.85}
                >
                  <Feather name="zap" size={18} color="#fff" />
                  <Text style={s.calcBtnText}>{calculating ? 'Рахую...' : 'Розрахувати'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Header with back button */}
                <View style={s.recipeHeader}>
                  <TouchableOpacity style={s.recipeBackBtn} onPress={() => setRecipe(null)} activeOpacity={0.7}>
                    <Feather name="arrow-left" size={18} color={COLORS.brand} />
                  </TouchableOpacity>
                  <Text style={s.recipeTitle} numberOfLines={2}>{recipe.title}</Text>
                </View>

                <View style={s.recipeCard}>
                  <View style={s.recipeRow}>
                    <Text style={s.recipeLabel}>Вода</Text>
                    <Text style={s.recipeValue}>{recipe.waterMl} мл</Text>
                  </View>
                  <View style={s.recipeDivider} />
                  <View style={s.recipeRow}>
                    <Text style={s.recipeLabel}>Концентрат</Text>
                    <Text style={s.recipeValueBrand}>{recipe.concentrateMl} мл</Text>
                  </View>
                  <View style={s.recipeDivider} />
                  <View style={s.recipeRow}>
                    <Text style={s.recipeLabel}>Концентрація</Text>
                    <Text style={s.recipeValue}>{recipe.concentrationPercent}%</Text>
                  </View>
                  <View style={s.recipeDivider} />
                  <View style={s.recipeRow}>
                    <Text style={s.recipeLabel}>Час дії</Text>
                    <Text style={s.recipeValue}>{recipe.minContactTimeMin} хв</Text>
                  </View>
                  {recipe.shelfLifeDays > 0 && (
                    <>
                      <View style={s.recipeDivider} />
                      <View style={s.recipeRow}>
                        <Text style={s.recipeLabel}>Термін придатності</Text>
                        <Text style={s.recipeValue}>{recipe.shelfLifeDays} діб</Text>
                      </View>
                    </>
                  )}
                </View>

                {/* After note */}
                {recipe.afterNote && (
                  <View style={s.afterNoteRow}>
                    <Feather name="info" size={14} color={COLORS.brand} />
                    <Text style={s.afterNoteText}>{recipe.afterNote}</Text>
                  </View>
                )}

                {/* Steps */}
                <Text style={s.fieldLabel}>Покрокова інструкція</Text>
                <View style={s.stepsCard}>
                  {recipe.steps.map((step) => (
                    <View key={step.order} style={s.stepRow}>
                      <View style={s.stepNum}><Text style={s.stepNumText}>{step.order}</Text></View>
                      <Text style={s.stepText}>{step.text}</Text>
                    </View>
                  ))}
                </View>

                {/* Warnings */}
                {recipe.warnings.map((w, i) => (
                  <View key={i} style={s.warningRow}>
                    <Feather name="alert-triangle" size={14} color={COLORS.warning} />
                    <Text style={s.warningText}>{w}</Text>
                  </View>
                ))}
              </>
            )}
          </ReAnimated.View>
        </ScrollView>
      )}

      {/* ═══ TAB: Guides ═══ */}
      {tab === 'guides' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 100 }}>
          {/* AI Assistant card */}
          <TouchableOpacity style={s.aiCard} onPress={() => router.push('/ai-chat')} activeOpacity={0.8}>
            <View style={s.aiCardIcon}>
              <Sparkles size={22} color="#fff" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.aiCardTitle}>AI-Асистент</Text>
              <Text style={s.aiCardDesc}>Деланол та Біонол форте — розведення, режими, ДСО</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#fff" />
          </TouchableOpacity>

          {GUIDES.map((g) => (
            <TouchableOpacity key={g.id} style={s.guideCard} activeOpacity={0.7} onPress={() => router.push(`/guide/${g.id}` as any)}>
              <View style={s.guideIcon}>
                <Feather name={g.icon as any} size={20} color={COLORS.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.guideTitle}>{g.title}</Text>
                <Text style={s.guideDesc}>{g.desc}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={COLORS.textTertiary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {/* FAB — AI Assistant */}
      <TouchableOpacity style={s.aiFab} onPress={() => router.push('/ai-chat')} activeOpacity={0.85}>
        <LinearGradient colors={[COLORS.brand, COLORS.brandDark]} style={s.aiFabGradient}>
          <Sparkles size={20} color="#fff" strokeWidth={2} />
          <Text style={s.aiFabText}>AI-асистент по розчинам</Text>
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },

  // Tabs
  tabs: { flexDirection: 'row', paddingHorizontal: 24, gap: 6, marginBottom: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.pill, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  tabTextActive: { color: '#fff' },

  // Tracker cards (same as before)
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardName: { fontSize: 16, fontWeight: '600', color: COLORS.text, flex: 1 },
  cardStatusIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardDates: { gap: 8, marginBottom: 12 },
  cardDateRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardDateLabel: { fontSize: 12, color: COLORS.textSecondary },
  cardDateValue: { fontSize: 12, fontWeight: '500', color: COLORS.text },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  cardBadgeText: { fontSize: 12, fontWeight: '600' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 16, marginBottom: 6 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.brand, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },

  // Calculator
  calcBody: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 100 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADII.pill, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white },
  chipActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: '#fff' },

  volumeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  volumeChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADII.pill, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white },
  volumeChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  volumeInput: { width: 80, height: 40, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, textAlign: 'center' },

  calcBtn: { flexDirection: 'row', height: 52, borderRadius: RADII.lg, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 },
  calcBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Recipe result
  recipeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  recipeBackBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: COLORS.brandLight, alignItems: 'center', justifyContent: 'center',
  },
  recipeTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, flex: 1 },
  recipeCard: { backgroundColor: COLORS.white, borderRadius: RADII.lg, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  recipeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  recipeLabel: { fontSize: 14, color: COLORS.textSecondary },
  recipeValue: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  recipeValueBrand: { fontSize: 18, fontWeight: '800', color: COLORS.brand },
  recipeDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 2 },

  stepsCard: { backgroundColor: COLORS.white, borderRadius: RADII.lg, borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  stepText: { fontSize: 14, color: COLORS.text, flex: 1, lineHeight: 20 },

  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, paddingHorizontal: 4 },
  warningText: { fontSize: 12, color: COLORS.warning, flex: 1, lineHeight: 17 },

  // Speed toggle
  speedRow: { gap: 8 },
  speedOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: RADII.md, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  speedActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  speedActiveFast: { borderColor: COLORS.warning, backgroundColor: COLORS.warning },
  speedTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  speedTitleActive: { color: '#fff' },
  speedDesc: { fontSize: 11, fontWeight: '400', color: COLORS.textSecondary, marginTop: 1 },
  speedDescActive: { color: 'rgba(255,255,255,0.8)' },

  // After note
  afterNoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: 12, backgroundColor: COLORS.brandLight, borderRadius: RADII.md },
  afterNoteText: { fontSize: 13, fontWeight: '500', color: COLORS.brand, flex: 1, lineHeight: 18 },

  // (newCalcBtn removed — replaced by recipeBackBtn in header)

  // AI card
  aiCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.brand, borderRadius: 14, padding: 16, marginBottom: 14 },
  aiCardIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  aiCardTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  aiCardDesc: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  // Guides
  guideCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10 },
  guideIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.brandLight, alignItems: 'center', justifyContent: 'center' },
  guideTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  guideDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  guideFooter: { alignItems: 'center', paddingVertical: 20 },
  guideFooterText: { fontSize: 13, color: COLORS.textTertiary },

  // FAB
  aiFab: { position: 'absolute', bottom: 20, alignSelf: 'center', left: 24, right: 24, borderRadius: 16, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 10 },
  aiFabGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16 },
  aiFabText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
});
