import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Plus, Trash2 } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';
import { getSterilizers, addSterilizer, deleteSterilizer } from '@/lib/api';
import type { Sterilizer } from '@/lib/types';

export default function SterilizersScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Sterilizer[]>([]);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('');

  const load = async () => {
    try { setItems(await getSterilizers()); } catch {}
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await addSterilizer(newName.trim(), newType.trim() || undefined);
      setNewName('');
      setNewType('');
      await load();
    } catch (err: any) {
      Alert.alert('Помилка', err.message);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Видалити?', '', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: async () => {
        try { await deleteSterilizer(id); await load(); } catch {}
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Стерилізатори</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <X size={20} color={COLORS.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.addSection}>
        <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Назва стерилізатора" placeholderTextColor={COLORS.textSecondary} />
        <TextInput style={styles.input} value={newType} onChangeText={setNewType} placeholder="Тип (сухожар, автоклав)" placeholderTextColor={COLORS.textSecondary} />
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.8}>
          <Plus size={18} color={COLORS.white} strokeWidth={2.5} />
          <Text style={styles.addBtnText}>Додати</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{item.name}</Text>
              {item.type && <Text style={styles.cardType}>{item.type}</Text>}
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id)} hitSlop={12}>
              <Trash2 size={16} color={COLORS.textSecondary} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Додайте стерилізатори, які використовуєте</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  addSection: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white },
  addBtn: { flexDirection: 'row', height: 44, borderRadius: 12, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 6 },
  addBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 8 },
  cardName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  cardType: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', paddingTop: 32 },
});
