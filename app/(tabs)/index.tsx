
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { Strings } from '@/constants/Strings';
import { useAuth } from '@/ctx/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function Home() {
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const router = useRouter();

  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [streak, setStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);

  // Placeholder name extraction
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Orador';

  // Level Logic
  const getLevelInfo = (currentXp: number) => {
    const level = Math.floor(Math.sqrt(currentXp / 100)) + 1;
    const minXpForCurrentLevel = 100 * Math.pow(level - 1, 2);
    const minXpForNextLevel = 100 * Math.pow(level, 2);
    const xpInLevel = currentXp - minXpForCurrentLevel;
    const xpNeededForLevel = minXpForNextLevel - minXpForCurrentLevel;
    const progress = xpNeededForLevel === 0 ? 0 : xpInLevel / xpNeededForLevel;

    return { level, progress, xpInLevel, xpNeededForLevel };
  };

  const { level, progress, xpInLevel, xpNeededForLevel } = getLevelInfo(xp);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [user])
  );

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    await Promise.all([
      fetchRecentActivity(),
      fetchProfileData(),
      checkDecay()
    ]);
    setLoading(false);
  };

  const checkDecay = async () => {
    const { data } = await supabase.rpc('check_daily_decay');
    if (data?.decayed) {
      console.log('Decayed XP:', data.amount);
    }
  };

  const fetchProfileData = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('streak_current, xp')
        .eq('id', user!.id)
        .single();

      if (data) {
        setStreak(data.streak_current || 0);
        setXp(data.xp || 0);
      }
    } catch (e) {
      console.error('Error fetching profile:', e);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const { data, error } = await supabase
        .from('attempts')
        .select(`
          *,
          topics (title),
          attempt_scores (overall_score)
        `)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      setRecentAttempts(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const renderRecentItem = (item: any) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.recentItem, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
      onPress={() => router.push({ pathname: '/(tabs)/practice/results', params: { attemptId: item.id } })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.iconBox, { backgroundColor: themeColors.inputBackground }]}>
          <Ionicons name="mic" size={20} color={themeColors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Typography variant="body" weight="bold" numberOfLines={1}>
            {item.topics?.title || 'Tema Personalizado'}
          </Typography>
          <Typography variant="caption" color={themeColors.subtext}>
            {new Date(item.created_at).toLocaleDateString()}
          </Typography>
        </View>
        <View style={[styles.scoreBadge, { backgroundColor: themeColors.secondary }]}>
          <Typography variant="label" color={themeColors.primary}>
            {item.attempt_scores?.overall_score || '-'}
          </Typography>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenWrapper>
      {/* New Header with Level System */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View>
            <Typography variant="h2" weight="bold">
              {Strings.home.welcome} {userName}
            </Typography>
            <Typography variant="caption" color={themeColors.subtext}>
              {Strings.home.dailyGoal}: 10 min
            </Typography>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Typography variant="h3" color={themeColors.primary} weight="bold">{streak} 🔥</Typography>
          </View>
        </View>

        {/* Level Progress Card */}
        <View style={[styles.levelCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: themeColors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Typography variant="caption" weight="black" color="#FFF">LVL {level}</Typography>
              </View>
              <Typography variant="caption" weight="bold" color={themeColors.text}>Principiante</Typography>
            </View>
            <Typography variant="caption" color={themeColors.subtext}>{Math.floor(xpInLevel)} / {Math.floor(xpNeededForLevel)} XP</Typography>
          </View>

          <View style={{ height: 8, backgroundColor: themeColors.inputBackground, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, height: '100%', backgroundColor: themeColors.primary, borderRadius: 4 }} />
          </View>
        </View>
      </View>

      <View style={{ marginBottom: 32 }}>
        <Typography variant="h3" style={{ marginBottom: 16 }}>
          {Strings.home.startPractice}
        </Typography>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }}>
          {[
            { id: 'improv', label: 'Improvisar', icon: 'mic', color: '#3B82F6' },
            { id: 'reading', label: 'Lectura', icon: 'book', color: '#10B981' },
            { id: 'vocab', label: 'Vocabulario', icon: 'extension-puzzle', color: '#8B5CF6' },
            { id: 'interview', label: 'Entrevista', icon: 'briefcase', color: '#F59E0B' },
            { id: 'debate', label: 'Debate', icon: 'people', color: '#EF4444' },
          ].map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.modeCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
              onPress={() => router.push({ pathname: '/(tabs)/practice', params: { initialMode: m.id } })}
            >
              <View style={[styles.modeIcon, { backgroundColor: m.color + '20' }]}>
                <Ionicons name={m.icon as any} size={24} color={m.color} />
              </View>
              <Typography variant="body" weight="bold" style={{ marginTop: 12 }}>{m.label}</Typography>
              <Typography variant="caption" color={themeColors.subtext} style={{ marginTop: 4 }}>+20 XP</Typography>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Typography variant="h3">
            {Strings.home.recentActivity}
          </Typography>
          <TouchableOpacity onPress={() => router.push('/history')}>
            <Typography variant="label" color={themeColors.primary}>Ver todo</Typography>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={themeColors.primary} />
        ) : recentAttempts.length > 0 ? (
          recentAttempts.map(renderRecentItem)
        ) : (
          <View style={[styles.emptyState, { backgroundColor: themeColors.surface }]}>
            <Typography variant="body" color={themeColors.subtext} align="center">
              No tienes actividad reciente.
            </Typography>
          </View>
        )}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 24,
    marginTop: 16,
  },
  levelCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8
  },
  section: {
    flex: 1,
  },
  emptyState: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButton: {
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  modeCard: {
    width: 150,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  modeIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentItem: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
