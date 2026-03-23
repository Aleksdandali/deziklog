import React from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { RADII } from '../../lib/theme';
import { GUIDES } from '../../lib/guides-data';

export default function GuideScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guide = GUIDES.find((g) => g.id === id);

  if (!guide) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.errorWrap}>
          <Feather name="alert-circle" size={40} color={COLORS.textSecondary} />
          <Text style={st.errorText}>Методичку не знайдено</Text>
          <TouchableOpacity onPress={() => router.back()} style={st.backLink}>
            <Text style={st.backLinkText}>Повернутись</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle} numberOfLines={1}>{guide.title}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.body}>
        <View style={st.titleCard}>
          <View style={st.titleIcon}>
            <Feather name={guide.icon as any} size={24} color={COLORS.brand} />
          </View>
          <Text style={st.title}>{guide.title}</Text>
          <Text style={st.subtitle}>{guide.desc}</Text>
        </View>

        {guide.sections.map((section, idx) => (
          <View key={idx} style={st.section}>
            <View style={st.sectionHeader}>
              <View style={st.sectionDot} />
              <Text style={st.sectionTitle}>{section.title}</Text>
            </View>
            <Text style={st.sectionContent}>{section.content}</Text>
          </View>
        ))}

        <View style={st.disclaimer}>
          <Feather name="info" size={14} color={COLORS.textTertiary} />
          <Text style={st.disclaimerText}>
            За офіційними інструкціями виробників. Звіряйтеся з інструкцією на упаковці.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  body: { padding: 24, paddingBottom: 40 },

  titleCard: {
    backgroundColor: COLORS.brandLight, borderRadius: RADII.lg,
    padding: 20, alignItems: 'center', marginBottom: 24,
  },
  titleIcon: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 4 },

  section: {
    backgroundColor: COLORS.bg, borderRadius: RADII.lg,
    padding: 16, marginBottom: 12,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.brand },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  sectionContent: { fontSize: 14, color: COLORS.text, lineHeight: 22 },

  disclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  disclaimerText: { fontSize: 12, color: COLORS.textTertiary, flex: 1, lineHeight: 18 },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 15, color: COLORS.textSecondary },
  backLink: { paddingVertical: 10 },
  backLinkText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
});
