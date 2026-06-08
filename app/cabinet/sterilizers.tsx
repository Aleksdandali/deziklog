import React, { useState, useCallback, useEffect } from 'react';
import { View, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../../components/AppText';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { COLORS } from '../../lib/constants';
import { uploadSterilizerPhoto, getPhotoUrl } from '../../lib/api';
import CameraCapture from '../../components/CameraCapture';

const TYPE_OPTIONS = [
  { value: 'dry_heat', label: 'Сухожар', color: '#E65100', bg: '#FFF3E0' },
  { value: 'autoclave', label: 'Автоклав', color: '#0277BD', bg: '#E1F5FE' },
] as const;

interface SterilizerRow {
  id: string;
  name: string;
  type: string | null;
  brand: string | null;
  image_path: string | null;
  created_at: string;
  is_archived: boolean;
}

export default function SterilizersScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [items, setItems] = useState<SterilizerRow[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<string>('dry_heat');
  const [formBrand, setFormBrand] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('sterilizers')
      .select('*')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('created_at');
    if (error && __DEV__) console.error('Sterilizers error:', error.message);
    setItems(data ?? []);
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Resolve signed URLs for any new image_paths
  useEffect(() => {
    const missing = items.filter((i) => i.image_path && !thumbs[i.image_path]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (i) => {
          try {
            const url = await getPhotoUrl(i.image_path!);
            // null = signed-URL failed; don't cache so a later re-render retries.
            return url ? ([i.image_path!, url] as const) : null;
          } catch { return null; }
        }),
      );
      if (cancelled) return;
      setThumbs((prev) => {
        const next = { ...prev };
        for (const e of entries) if (e) next[e[0]] = e[1];
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [items, thumbs]);

  const resetForm = () => {
    setFormName(''); setFormBrand(''); setFormType('dry_heat');
    setPendingPhoto(null); setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (item: SterilizerRow) => {
    setEditingId(item.id);
    setFormName(item.name);
    setFormType(item.type || 'dry_heat');
    setFormBrand(item.brand || '');
    setPendingPhoto(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const handleSave = async () => {
    if (!formName.trim() || !userId) {
      Alert.alert('Увага', 'Введіть назву стерилізатора');
      return;
    }
    setSaving(true);
    try {
      let id = editingId;
      if (id) {
        const { error } = await supabase
          .from('sterilizers')
          .update({
            name: formName.trim(),
            type: formType || 'dry_heat',
            brand: formBrand.trim() || null,
          })
          .eq('id', id)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('sterilizers')
          .insert({
            user_id: userId,
            name: formName.trim(),
            type: formType || 'dry_heat',
            brand: formBrand.trim() || null,
          })
          .select('id')
          .single();
        if (error) throw error;
        id = data.id;
      }

      if (pendingPhoto && id) {
        const path = await uploadSterilizerPhoto(userId, id, pendingPhoto);
        const { error: imgErr } = await supabase
          .from('sterilizers')
          .update({ image_path: path })
          .eq('id', id)
          .eq('user_id', userId);
        if (imgErr) throw imgErr;
      }

      closeForm();
      load();
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Не вдалося зберегти';
      if (__DEV__) console.error('Save sterilizer error:', msg);
      Alert.alert('Помилка', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Прибрати зі списку?', `"${name}" більше не показуватиметься у списку.`, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Прибрати', style: 'destructive', onPress: async () => {
        if (!userId) return;
        // Try a hard delete first (works for sterilizers never used in a cycle).
        const { error } = await supabase.from('sterilizers').delete().eq('id', id).eq('user_id', userId);
        if (error) {
          // Referenced by journal entries (FK) — archive instead so history stays intact.
          const { error: archErr } = await supabase
            .from('sterilizers')
            .update({ is_archived: true })
            .eq('id', id)
            .eq('user_id', userId);
          if (archErr) {
            if (__DEV__) console.error('Archive sterilizer error:', archErr.message);
            Alert.alert('Помилка', 'Не вдалося прибрати стерилізатор. Спробуйте ще раз.');
            return;
          }
          Alert.alert('Прибрано', 'Стерилізатор приховано зі списку. Записи в журналі стерилізацій збережено.');
        }
        load();
      }},
    ]);
  };

  const getTypeStyle = (type: string | null) => {
    const found = TYPE_OPTIONS.find((t) => t.value === type);
    return found || { label: type || 'Невідомий', color: COLORS.textSecondary, bg: COLORS.cardBg };
  };

  if (showCamera) {
    return (
      <CameraCapture
        label="Фото стерилізатора"
        onCapture={(uri) => { setPendingPhoto(uri); setShowCamera(false); }}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Стерилізатори</Text>
        <TouchableOpacity
          style={[styles.backBtn, showForm && { backgroundColor: COLORS.brand, borderColor: COLORS.brand }]}
          onPress={() => (showForm ? closeForm() : openCreate())}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={18} color={showForm ? COLORS.white : COLORS.brand} />
        </TouchableOpacity>
      </View>

      {showForm && (() => {
        const editing = editingId ? items.find((i) => i.id === editingId) : null;
        const existingPath = editing?.image_path ?? null;
        const existingUrl = existingPath ? thumbs[existingPath] : null;
        const hasPhoto = !!pendingPhoto || !!existingPath;
        return (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{editingId ? 'Редагувати стерилізатор' : 'Новий стерилізатор'}</Text>

          {/* Photo */}
          <View style={styles.photoRow}>
            <TouchableOpacity style={styles.photoThumb} onPress={() => setShowCamera(true)} activeOpacity={0.7}>
              {pendingPhoto ? (
                <Image source={{ uri: pendingPhoto }} style={styles.photoThumbImg} />
              ) : existingUrl ? (
                <Image source={{ uri: existingUrl }} style={styles.photoThumbImg} />
              ) : (
                <Feather name="camera" size={22} color={COLORS.textSecondary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={() => setShowCamera(true)} activeOpacity={0.7}>
              <Feather name="camera" size={14} color={COLORS.brand} />
              <Text style={styles.photoBtnText}>{hasPhoto ? 'Замінити фото' : 'Додати фото'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <MaterialCommunityIcons name="radiator" size={16} color={COLORS.textSecondary} style={{ marginLeft: 12 }} />
            <TextInput style={styles.formInput} value={formName} onChangeText={setFormName} placeholder="Назва стерилізатора" placeholderTextColor={COLORS.textSecondary} />
          </View>
          <Text style={styles.fieldLabel}>Тип</Text>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity key={opt.value} style={[styles.typeChip, formType === opt.value && { backgroundColor: opt.bg, borderColor: opt.color }]} onPress={() => setFormType(opt.value)} activeOpacity={0.7}>
                <View style={[styles.typeRadio, formType === opt.value && { borderColor: opt.color }]}>
                  {formType === opt.value && <View style={[styles.typeRadioDot, { backgroundColor: opt.color }]} />}
                </View>
                <Text style={[styles.typeLabel, formType === opt.value && { color: opt.color, fontWeight: '600' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.inputGroup}>
            <Feather name="tag" size={14} color={COLORS.textSecondary} style={{ marginLeft: 12 }} />
            <TextInput style={styles.formInput} value={formBrand} onChangeText={setFormBrand} placeholder="Бренд (необов'язково)" placeholderTextColor={COLORS.textSecondary} />
          </View>
          <TouchableOpacity style={styles.submitBtn} onPress={handleSave} activeOpacity={0.8} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color={COLORS.white} /> : (<><Feather name={editingId ? 'check' : 'plus'} size={16} color={COLORS.white} /><Text style={styles.submitBtnText}>{editingId ? 'Зберегти зміни' : 'Додати стерилізатор'}</Text></>)}
          </TouchableOpacity>
        </View>
        );
      })()}

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const typeStyle = getTypeStyle(item.type);
            const thumbUrl = item.image_path ? thumbs[item.image_path] : null;
            return (
              <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.7}>
                <View style={styles.cardIconWrap}>
                  {thumbUrl ? (
                    <Image source={{ uri: thumbUrl }} style={styles.cardThumbImg} />
                  ) : (
                    <MaterialCommunityIcons name="radiator" size={22} color="#E65100" />
                  )}
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.tagRow}>
                    <View style={[styles.tag, { backgroundColor: typeStyle.bg }]}><Text style={[styles.tagText, { color: typeStyle.color }]}>{typeStyle.label}</Text></View>
                    {item.brand ? <View style={[styles.tag, { backgroundColor: COLORS.cardBg }]}><Text style={[styles.tagText, { color: COLORS.textSecondary }]}>{item.brand}</Text></View> : null}
                  </View>
                </View>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.name)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="trash-2" size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          ListHeaderComponent={items.length > 0 ? <Text style={styles.listTitle}>{items.length} {items.length === 1 ? 'стерилізатор' : items.length < 5 ? 'стерилізатори' : 'стерилізаторів'}</Text> : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><MaterialCommunityIcons name="radiator" size={48} color={COLORS.textSecondary} /></View>
              <Text style={styles.emptyTitle}>Стерилізаторів поки немає</Text>
              <Text style={styles.emptyText}>Додайте свій стерилізатор (сухожар, автоклав)</Text>
              {!showForm && (
                <TouchableOpacity style={styles.emptyBtn} onPress={openCreate} activeOpacity={0.7}>
                  <Feather name="plus" size={16} color={COLORS.brand} /><Text style={styles.emptyBtnText}>Додати стерилізатор</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  formCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 10 },
  formTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 },
  inputGroup: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.bg },
  formInput: { flex: 1, height: 44, paddingHorizontal: 10, fontSize: 14, color: COLORS.text },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 12, gap: 8, backgroundColor: COLORS.white },
  typeRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  typeRadioDot: { width: 8, height: 8, borderRadius: 4 },
  typeLabel: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  submitBtn: { flexDirection: 'row', height: 44, borderRadius: 12, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photoThumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoThumbImg: { width: '100%', height: '100%' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.brand },
  photoBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.brand },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  listTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 8 },
  cardIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF3E0', alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  cardThumbImg: { width: '100%', height: '100%' },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  tagRow: { flexDirection: 'row', gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: '600' },
  deleteBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 60 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.brand, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
});
