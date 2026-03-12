import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';

const COLORS = {
  bg: '#f5f6fa', white: '#FFFFFF', text: '#1B1B1B', textSecondary: '#6B7280',
  border: '#e2e4ed', brand: '#4b569e', cardBg: '#eceef5',
};

const TYPE_OPTIONS = [
  { value: 'dry_heat', label: 'Сухожар', color: '#E65100', bg: '#FFF3E0' },
  { value: 'autoclave', label: 'Автоклав', color: '#0277BD', bg: '#E1F5FE' },
] as const;

interface SterilizerRow { id: string; name: string; type: string | null; brand: string | null; created_at: string; }

export default function SterilizersScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [items, setItems] = useState<SterilizerRow[]>([]);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<string>('dry_heat');
  const [newBrand, setNewBrand] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('sterilizers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');
    if (error) console.error('Sterilizers error:', error.message);
    setItems(data ?? []);
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    if (!newName.trim() || !userId) {
      Alert.alert('Увага', 'Введіть назву стерилізатора');
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('sterilizers').insert({
      user_id: userId,
      name: newName.trim(),
      type: newType || 'dry_heat',
      brand: newBrand.trim() || null,
    });
    setAdding(false);
    if (error) { console.error('Add sterilizer error:', error.message); Alert.alert('Помилка', error.message); return; }
    setNewName(''); setNewBrand(''); setNewType('dry_heat'); setShowForm(false);
    load();
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Видалити стерилізатор?', `"${name}" буде видалено назавжди.`, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('sterilizers').delete().eq('id', id);
        if (error) console.error('Delete sterilizer error:', error.message);
        load();
      }},
    ]);
  };

  const getTypeStyle = (type: string | null) => {
    const found = TYPE_OPTIONS.find((t) => t.value === type);
    return found || { label: type || 'Невідомий', color: COLORS.textSecondary, bg: COLORS.cardBg };
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Стерилізатори</Text>
        <TouchableOpacity style={[styles.backBtn, showForm && { backgroundColor: COLORS.brand, borderColor: COLORS.brand }]} onPress={() => setShowForm(!showForm)}>
          <Feather name={showForm ? 'x' : 'plus'} size={18} color={showForm ? COLORS.white : COLORS.brand} />
        </TouchableOpacity>
      </View>

      {showForm && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Новий стерилізатор</Text>
          <View style={styles.inputGroup}>
            <MaterialCommunityIcons name="radiator" size={16} color={COLORS.textSecondary} style={{ marginLeft: 12 }} />
            <TextInput style={styles.formInput} value={newName} onChangeText={setNewName} placeholder="Назва стерилізатора" placeholderTextColor={COLORS.textSecondary} />
          </View>
          <Text style={styles.fieldLabel}>Тип</Text>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity key={opt.value} style={[styles.typeChip, newType === opt.value && { backgroundColor: opt.bg, borderColor: opt.color }]} onPress={() => setNewType(opt.value)} activeOpacity={0.7}>
                <View style={[styles.typeRadio, newType === opt.value && { borderColor: opt.color }]}>
                  {newType === opt.value && <View style={[styles.typeRadioDot, { backgroundColor: opt.color }]} />}
                </View>
                <Text style={[styles.typeLabel, newType === opt.value && { color: opt.color, fontWeight: '600' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.inputGroup}>
            <Feather name="tag" size={14} color={COLORS.textSecondary} style={{ marginLeft: 12 }} />
            <TextInput style={styles.formInput} value={newBrand} onChangeText={setNewBrand} placeholder="Бренд (необов'язково)" placeholderTextColor={COLORS.textSecondary} />
          </View>
          <TouchableOpacity style={styles.submitBtn} onPress={handleAdd} activeOpacity={0.8} disabled={adding}>
            {adding ? <ActivityIndicator size="small" color={COLORS.white} /> : (<><Feather name="plus" size={16} color={COLORS.white} /><Text style={styles.submitBtnText}>Додати стерилізатор</Text></>)}
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const typeStyle = getTypeStyle(item.type);
            return (
              <View style={styles.card}>
                <View style={styles.cardIconWrap}><MaterialCommunityIcons name="radiator" size={22} color="#E65100" /></View>
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
              </View>
            );
          }}
          ListHeaderComponent={items.length > 0 ? <Text style={styles.listTitle}>{items.length} {items.length === 1 ? 'стерилізатор' : items.length < 5 ? 'стерилізатори' : 'стерилізаторів'}</Text> : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><MaterialCommunityIcons name="radiator" size={36} color={COLORS.textSecondary} /></View>
              <Text style={styles.emptyTitle}>Немає стерилізаторів</Text>
              <Text style={styles.emptyText}>Додайте обладнання, яке використовуєте для стерилізації</Text>
              {!showForm && (
                <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowForm(true)} activeOpacity={0.7}>
                  <Feather name="plus" size={16} color={COLORS.brand} /><Text style={styles.emptyAddText}>Додати перший стерилізатор</Text>
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
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  listTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 8 },
  cardIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF3E0', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  tagRow: { flexDirection: 'row', gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: '600' },
  deleteBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFF3E0', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.brand, borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  emptyAddText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
});
