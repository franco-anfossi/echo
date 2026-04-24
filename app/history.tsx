
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Input } from '@/components/ui/Input';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { modeColor, modeLabel, PRACTICE_MODES } from '@/lib/practice-modes';
import { relativeDate } from '@/lib/relative-date';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, RefreshControl, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

const MODE_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Todos' },
  ...PRACTICE_MODES.map((m) => ({ id: m.id, label: m.label })),
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function bucketLabel(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const dayDiff = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  if (dayDiff === 0) return 'Hoy';
  if (dayDiff === 1) return 'Ayer';
  if (dayDiff <= 7) return 'Esta semana';
  if (dayDiff <= 30) return 'Este mes';
  return 'Antes';
}

const BUCKET_ORDER = ['Hoy', 'Ayer', 'Esta semana', 'Este mes', 'Antes'];

export default function HistoryScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const router = useRouter();

  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('attempts')
        .select(`
          *,
          topics (title, difficulty),
          attempt_scores (overall_score)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAttempts(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const sections = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = attempts.filter((a) => {
      if (filter !== 'all' && a.practice_type !== filter) return false;
      if (!term) return true;
      const title = (a.topics?.title || a.target_text || '').toLowerCase();
      return title.includes(term);
    });

    const byBucket: Record<string, any[]> = {};
    for (const item of filtered) {
      const label = bucketLabel(new Date(item.created_at));
      if (!byBucket[label]) byBucket[label] = [];
      byBucket[label].push(item);
    }
    return BUCKET_ORDER
      .filter((l) => byBucket[l]?.length)
      .map((l) => ({ title: l, data: byBucket[l] }));
  }, [attempts, search, filter]);

  const totalShown = sections.reduce((acc, s) => acc + s.data.length, 0);

  const renderItem = ({ item }: { item: any }) => {
    const mode = item.practice_type || 'improv';
    const color = modeColor(mode);
    const label = modeLabel(mode);
    const score = item.attempt_scores?.overall_score;
    const difficulty: string | undefined = item.topics?.difficulty;
    const difficultyLabel: Record<string, string> = {
      beginner: 'Principiante',
      intermediate: 'Intermedio',
      advanced: 'Avanzado',
    };
    const difficultyColor: Record<string, string> = {
      beginner: '#10B981',
      intermediate: '#F59E0B',
      advanced: '#EF4444',
    };
    const scoreTier =
      typeof score === 'number'
        ? score >= 80
          ? { bg: '#16A34A22', fg: '#16A34A' }
          : score >= 60
            ? { bg: themeColors.secondary, fg: themeColors.primary }
            : { bg: '#F5970022', fg: '#B45309' }
        : { bg: themeColors.inputBackground, fg: themeColors.subtext };
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
        onPress={() => router.push({ pathname: '/(tabs)/practice/results', params: { attemptId: item.id } })}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
              <View style={{ backgroundColor: color + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                <Typography variant="caption" weight="bold" color={color}>{label}</Typography>
              </View>
              {difficulty && difficultyLabel[difficulty] && (
                <View style={{ backgroundColor: (difficultyColor[difficulty] || themeColors.subtext) + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                  <Typography variant="caption" weight="bold" color={difficultyColor[difficulty] || themeColors.subtext}>
                    {difficultyLabel[difficulty]}
                  </Typography>
                </View>
              )}
              <Typography variant="caption" color={themeColors.subtext}>
                {relativeDate(item.created_at)}
              </Typography>
            </View>
            <Typography variant="h3" weight="bold" numberOfLines={1}>
              {item.topics?.title || item.target_text || 'Tema personalizado'}
            </Typography>
          </View>
          <View style={[styles.scoreBadge, { backgroundColor: scoreTier.bg }]}>
            <Typography variant="h3" color={scoreTier.fg}>
              {typeof score === 'number' ? score : '-'}
            </Typography>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Typography variant="caption" color={themeColors.subtext} style={{ textTransform: 'capitalize' }}>
            {item.status}
          </Typography>
          <Ionicons name="chevron-forward" size={16} color={themeColors.subtext} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginBottom: 16 }}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Typography variant="h2" weight="bold">
          Historial
        </Typography>
      </View>

      <Input
        placeholder="Buscar por tema..."
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
        {MODE_FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                backgroundColor: active ? themeColors.primary : themeColors.surface,
                borderColor: active ? themeColors.primary : themeColors.border,
              }}
            >
              <Typography variant="caption" weight="bold" color={active ? '#FFF' : themeColors.subtext}>
                {f.label}
              </Typography>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={themeColors.primary} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={{ paddingTop: 12, paddingBottom: 6, backgroundColor: themeColors.background }}>
              <Typography variant="label" color={themeColors.subtext} weight="bold">
                {section.title}
              </Typography>
            </View>
          )}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Typography variant="body" color={themeColors.subtext} align="center">
                {attempts.length === 0
                  ? 'No hay intentos registrados.'
                  : 'No hay resultados con esos filtros.'}
              </Typography>
            </View>
          }
          ListFooterComponent={
            totalShown > 0 ? (
              <Typography variant="caption" color={themeColors.subtext} align="center" style={{ marginTop: 12 }}>
                {totalShown} práctica{totalShown === 1 ? '' : 's'}
              </Typography>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
    marginTop: 16,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  empty: {
    alignItems: 'center',
    marginTop: 40,
  }
});
