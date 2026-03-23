import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { COLORS } from '../../lib/constants';

interface EmployeeRow { id: string; name: string; created_at: string; }

export default function EmployeesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [items, setItems] = useState<EmployeeRow[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');
    if (error && __DEV__) console.error('Employees error:', error.message);
    setItems(data ?? []);
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    if (!newName.trim() || !userId) return;
    setAdding(true);
    const { error } = await supabase
      .from('employees')
      .insert({ user_id: userId, name: newName.trim() });
    setAdding(false);
    if (error) { if (__DEV__) console.error('Add employee error:', error.message); Alert.alert('Помилка', error.message); return; }
    setNewName('');
    load();
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Видалити співробітника?', `"${name}" буде видалено.`, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: async () => {
        if (!userId) return;
        const { error } = await supabase.from('employees').delete().eq('id', id).eq('user_id', userId);
        if (error && __DEV__) console.error('Delete employee error:', error.message);
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
        <Text style={styles.title}>Співробітники</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.addSection}>
        <Text style={styles.addLabel}>Додати співробітника</Text>
        <View style={styles.addRow}>
          <View style={styles.inputWrapper}>
            <Feather name="user" size={16} color={COLORS.textSecondary} style={{ marginLeft: 12 }} />
            <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Ім'я та прізвище" placeholderTextColor={COLORS.textSecondary} onSubmitEditing={handleAdd} returnKeyType="done" />
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
              <View style={styles.cardIcon}><Feather name="user" size={20} color={COLORS.brand} /></View>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.name)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="trash-2" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          ListHeaderComponent={items.length > 0 ? <Text style={styles.listTitle}>{items.length} {items.length === 1 ? 'співробітник' : items.length < 5 ? 'співробітники' : 'співробітників'}</Text> : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Feather name="users" size={48} color={COLORS.textSecondary} /></View>
              <Text style={styles.emptyTitle}>Співробітників поки немає</Text>
              <Text style={styles.emptyText}>Додайте співробітників, які проводять стерилізацію</Text>
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
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 60 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
});
