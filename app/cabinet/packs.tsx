import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Plus, Trash2 } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';
import { getProfile, saveProfile } from '@/lib/storage';
import type { UserProfile, PackItem } from '@/lib/types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

export default function PacksScreen() {
  const router = useRouter();
  const [items, setItems] = useState<PackItem[]>([]);
  const [newType, setNewType] = useState('');
  const [newSize, setNewSize] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getProfile();
      setProfile(p);
      setItems(p.packs);
    })();
  }, []);

  const save = async (updated: PackItem[]) => {
    setItems(updated);
    if (profile) {
      const p = { ...profile, packs: updated };
      setProfile(p);
      await saveProfile(p);
    }
  };

  const handleAdd = () => {
    if (!newType.trim()) return;
    save([...items, { id: generateId(), type: newType.trim(), size: newSize.trim() }]);
    setNewType('');
    setNewSize('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Пакети</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <X size={20} color={COLORS.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.addSection}>
        <TextInput style={styles.input} value={newType} onChangeText={setNewType} placeholder="Тип (Крафт, Прозорий...)" placeholderTextColor={COLORS.textSecondary} />
        <View style={styles.addRow}>
          <TextInput style={[styles.input, { flex: 1 }]} value={newSize} onChangeText={setNewSize} placeholder="Розмір (100×200)" placeholderTextColor={COLORS.textSecondary} onSubmitEditing={handleAdd} />
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.8}>
            <Plus size={20} color={COLORS.white} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View>
              <Text style={styles.itemName}>{item.type}</Text>
              {item.size ? <Text style={styles.itemSub}>{item.size}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => save(items.filter((i) => i.id !== item.id))} hitSlop={12}>
              <Trash2 size={16} color={COLORS.danger} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Список порожній</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  addSection: { paddingHorizontal: 20, gap: 8, marginBottom: 16 },
  addRow: { flexDirection: 'row', gap: 10 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.bg },
  addBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  itemName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  empty: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', paddingTop: 40 },
});
