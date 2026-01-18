
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function HistoryScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const router = useRouter();

  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const getModeLabel = (type: string) => {
    const map: any = {
      'improv': 'Improvisación',
      'reading': 'Lectura',
      'vocab': 'Vocabulario',
      'interview': 'Entrevista',
      'debate': 'Debate'
    };
    return map[type] || 'Práctica';
  };

  const getModeColor = (type: string) => {
    const map: any = {
      'improv': '#3B82F6',
      'reading': '#10B981',
      'vocab': '#8B5CF6',
      'interview': '#F59E0B',
      'debate': '#EF4444'
    };
    return map[type] || '#64748B';
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
      onPress={() => router.push({ pathname: '/(tabs)/practice/results', params: { attemptId: item.id } })}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 }}>
            <View style={{ backgroundColor: getModeColor(item.practice_type) + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
              <Typography variant="caption" weight="bold" color={getModeColor(item.practice_type)}>{getModeLabel(item.practice_type)}</Typography>
            </View>
            <Typography variant="caption" color={themeColors.subtext}>
              {new Date(item.created_at).toLocaleDateString()}
            </Typography>
          </View>
          <Typography variant="h3" weight="bold" numberOfLines={1}>{item.topics?.title || 'Tema Personalizado'}</Typography>
        </View>
        <View style={[styles.scoreBadge, { backgroundColor: themeColors.secondary }]}>
          <Typography variant="h3" color={themeColors.primary}>
            {item.attempt_scores?.overall_score || '-'}
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

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 16 }}>
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Typography variant="h2" weight="bold">
          Historial
        </Typography>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={themeColors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={attempts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Typography variant="body" color={themeColors.subtext}>No hay intentos registrados.</Typography>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 24,
    marginTop: 16,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
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
