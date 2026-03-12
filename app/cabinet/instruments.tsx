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

interface InstrumentRow { id: string; name: string; created_at: string; }

export default function InstrumentsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [items, setItems] = useState<InstrumentRow[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('instruments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');
    if (error) console.error('Instruments error:', error.message);
    setItems(data ?? []);
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    if (!newName.trim() || !userId) return;
    setAdding(true);
    const { error } = await supabase
      .from('instruments')
      .insert({ user_id: userId, name: newName.trim() });
    setAdding(false);
    if (error) { console.error('Add instrument error:', error.message); Alert.alert('Помилка', error.message); return; }
    setNewName('');
    load();
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Видалити інструмент?', `"${name}" буде видалено назавжди.`, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('instruments').delete().eq('id', id);
        if (error) console.error('Delete instrument error:', error.message);
        load();
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Інструменти</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.addSection}>
        <Text style={styles.addLabel}>Додати інструмент</Text>
        <View style={styles.addRow}>
          <View style={styles.inputWrapper}>
            <MaterialCommunityIcons name="scissors-cutting" size={16} color={COLORS.textSecondary} style={{ marginLeft: 12 }} />
            <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Наприклад: Ножиці манікюрні" placeholderTextColor={COLORS.textSecondary} onSubmitEditing={handleAdd} returnKeyType="done" />
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.8} disabled={adding}>
            {adding ? <ActivityIndicator size="small" color={COLORS.white} /> : <Feather name="plus" size={20} color={COLORS.white} />}
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardIcon}><MaterialCommunityIcons name="scissors-cutting" size={20} color={COLORS.brand} /></View>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.name)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="trash-2" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          ListHeaderComponent={items.length > 0 ? <Text style={styles.listTitle}>{items.length} {items.length === 1 ? 'інструмент' : items.length < 5 ? 'інструменти' : 'інструментів'}</Text> : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><MaterialCommunityIcons name="scissors-cutting" size={36} color={COLORS.textSecondary} /></View>
              <Text style={styles.emptyTitle}>Немає інструментів</Text>
              <Text style={styles.emptyText}>Додайте інструменти, які ви використовуєте для стерилізації</Text>
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
  addSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  addLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 },
  addRow: { flexDirection: 'row', gap: 10 },
  inputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  input: { flex: 1, height: 48, paddingHorizontal: 10, fontSize: 14, color: COLORS.text },
  addBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  listTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 8 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8EAF6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardName: { fontSize: 15, fontWeight: '600', color: COLORS.text, flex: 1 },
  deleteBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
});
