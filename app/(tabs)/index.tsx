
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { Strings } from '@/constants/Strings';
import { useAuth } from '@/ctx/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { readCache, writeCache } from '@/lib/cache';
import { formatDuration } from '@/lib/format';
import { modeColor, modeLabel } from '@/lib/practice-modes';
import { relativeDate } from '@/lib/relative-date';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function Home() {
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const router = useRouter();

  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [streak, setStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [todayBest, setTodayBest] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [suggestedMode, setSuggestedMode] = useState<{ id: string; label: string; reason: string; icon: string; color: string } | null>(null);
  const [favoriteCount, setFavoriteCount] = useState(0);

  const DAILY_GOAL = 1;

  const ALL_MODES = [
    { id: 'improv', label: 'Improvisar', icon: 'mic', color: '#3B82F6' },
    { id: 'reading', label: 'Lectura', icon: 'book', color: '#10B981' },
    { id: 'vocab', label: 'Vocabulario', icon: 'extension-puzzle', color: '#8B5CF6' },
    { id: 'interview', label: 'Entrevista', icon: 'briefcase', color: '#F59E0B' },
    { id: 'debate', label: 'Debate', icon: 'people', color: '#EF4444' },
  ];

  // Placeholder name extraction
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Orador';

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return 'Buenas noches';
    if (h < 13) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  const dailyTip = (() => {
    const tips = [
      'Respira antes de hablar: una pausa breve da claridad y autoridad.',
      'Reduce muletillas reemplazándolas con micro-silencios.',
      'Usa frases cortas. Cada idea, su oración.',
      'Cambia el tono al final de cada idea para mantener atención.',
      'Practica en voz alta, no solo en tu cabeza.',
      'Estructura tus ideas: contexto → punto → ejemplo → cierre.',
      'Mira "a la cámara": apunta tu voz a un punto fijo para sonar más seguro.',
    ];
    const today = new Date();
    const dayIndex = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
    return tips[dayIndex % tips.length];
  })();

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

  const cacheKey = user?.id ? `echo:home:${user.id}` : null;

  useFocusEffect(
    useCallback(() => {
      fetchData();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id])
  );

  // Fetch favorite count from per-user cache
  useEffect(() => {
    if (!user?.id) return;
    readCache<string[]>(`echo:favorites:${user.id}`).then((v) => {
      setFavoriteCount(Array.isArray(v) ? v.length : 0);
    });
  }, [user?.id, refreshing]);

  // Hydrate from cache so returning to the tab feels instant
  useEffect(() => {
    if (!cacheKey) return;
    readCache<{
      recentAttempts: any[];
      streak: number;
      xp: number;
      todayCount: number;
      todayBest: number | null;
    }>(cacheKey).then((cached) => {
      if (!cached) return;
      setRecentAttempts((prev) => (prev.length ? prev : cached.recentAttempts || []));
      setStreak((prev) => prev || cached.streak || 0);
      setXp((prev) => prev || cached.xp || 0);
      setTodayCount((prev) => prev || cached.todayCount || 0);
      setTodayBest((prev) => (prev !== null ? prev : cached.todayBest ?? null));
      setLoading(false);
    });
  }, [cacheKey]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    await Promise.all([
      fetchRecentActivity(),
      fetchProfileData(),
      fetchTodayCount(),
      fetchSuggestion(),
      checkDecay()
    ]);
    setLoading(false);
  };

  const fetchSuggestion = async () => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from('attempts')
        .select('practice_type, attempt_scores(overall_score)')
        .eq('user_id', user!.id)
        .gte('created_at', since.toISOString());

      const buckets: Record<string, { count: number; sum: number }> = {};
      for (const row of data || []) {
        const mode = (row as any).practice_type || 'improv';
        if (!buckets[mode]) buckets[mode] = { count: 0, sum: 0 };
        buckets[mode].count += 1;
        const rel = (row as any).attempt_scores;
        const scoreRow = Array.isArray(rel) ? rel[0] : rel;
        const score = scoreRow?.overall_score || 0;
        if (score > 0) buckets[mode].sum += score;
      }

      const untried = ALL_MODES.find((m) => !buckets[m.id] || buckets[m.id].count === 0);
      if (untried) {
        setSuggestedMode({ ...untried, reason: 'Aún no la has probado' });
        return;
      }

      let weakest: { mode: typeof ALL_MODES[number]; avg: number } | null = null;
      for (const m of ALL_MODES) {
        const b = buckets[m.id];
        const avg = b && b.count > 0 ? b.sum / b.count : 0;
        if (!weakest || avg < weakest.avg) weakest = { mode: m, avg };
      }
      if (weakest) {
        setSuggestedMode({
          ...weakest.mode,
          reason: `Promedio ${Math.round(weakest.avg)} · sigue mejorando`,
        });
      } else {
        setSuggestedMode(null);
      }
    } catch (e) {
      console.error('Suggestion fetch failed', e);
    }
  };

  const fetchTodayCount = async () => {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('attempts')
        .select('id, attempt_scores(overall_score)')
        .eq('user_id', user!.id)
        .gte('created_at', startOfDay.toISOString());
      if (error) throw error;
      const rows = data || [];
      setTodayCount(rows.length);
      const scores = rows
        .map((r: any) => {
          const rel = r.attempt_scores;
          const row = Array.isArray(rel) ? rel[0] : rel;
          return row?.overall_score || 0;
        })
        .filter((s) => s > 0);
      setTodayBest(scores.length > 0 ? Math.max(...scores) : null);
    } catch (e) {
      console.error('Error fetching today count:', e);
    }
  };

  const checkDecay = async () => {
    try {
      await supabase.rpc('check_daily_decay');
    } catch {
      // RPC is optional; ignore if it isn't deployed
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

  const renderRecentItem = (item: any) => {
    const mode = item.practice_type || 'improv';
    const color = modeColor(mode);
    const label = modeLabel(mode);
    const modeIcon: Record<string, string> = {
      improv: 'mic',
      reading: 'book',
      vocab: 'extension-puzzle',
      interview: 'briefcase',
      debate: 'people',
    };
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.recentItem, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
        onPress={() => router.push({ pathname: '/(tabs)/practice/results', params: { attemptId: item.id } })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
            <Ionicons name={(modeIcon[mode] || 'mic') as any} size={20} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Typography variant="body" weight="bold" numberOfLines={1}>
              {item.topics?.title || item.target_text || 'Tema personalizado'}
            </Typography>
            <Typography variant="caption" color={themeColors.subtext}>
              {label} · {relativeDate(item.created_at)}
              {item.duration_seconds ? ` · ${formatDuration(item.duration_seconds)}` : ''}
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
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Persist the current home payload after each successful load
  useEffect(() => {
    if (!cacheKey || loading) return;
    writeCache(cacheKey, { recentAttempts, streak, xp, todayCount, todayBest });
  }, [cacheKey, loading, recentAttempts, streak, xp, todayCount, todayBest]);

  return (
    <ScreenWrapper>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColors.primary}
          />
        }
      >
      {/* New Header with Level System */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Typography variant="caption" color={themeColors.subtext}>
              {greeting},
            </Typography>
            <Typography variant="h2" weight="bold">
              {userName}
            </Typography>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Typography variant="h3" color={themeColors.primary} weight="bold">{streak} 🔥</Typography>
          </View>
        </View>

        {/* Streak risk banner */}
        {streak > 0 && todayCount === 0 && (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/practice')}
            activeOpacity={0.85}
            style={[styles.streakBanner, { backgroundColor: '#FFF3E0', borderColor: '#FF8C00' }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="flame" size={22} color="#FF8C00" />
              <View style={{ flex: 1 }}>
                <Typography variant="label" weight="bold" color="#9A3412">
                  ¡Tu racha de {streak} día{streak === 1 ? '' : 's'} está en riesgo!
                </Typography>
                <Typography variant="caption" color="#9A3412">
                  Practica hoy para no romperla.
                </Typography>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9A3412" />
            </View>
          </TouchableOpacity>
        )}

        {/* Daily goal progress card */}
        <View style={[styles.dailyGoalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons
                name={todayCount >= DAILY_GOAL ? 'checkmark-circle' : 'flag-outline'}
                size={18}
                color={todayCount >= DAILY_GOAL ? themeColors.success : themeColors.primary}
              />
              <Typography variant="label" weight="bold">
                {todayCount >= DAILY_GOAL ? '¡Meta del día completada!' : 'Meta del día'}
              </Typography>
            </View>
            <Typography variant="caption" color={themeColors.subtext}>
              {todayCount} / {DAILY_GOAL} práctica{DAILY_GOAL === 1 ? '' : 's'}
            </Typography>
          </View>
          <View style={{ height: 8, backgroundColor: themeColors.inputBackground, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{
              width: `${Math.min(100, (todayCount / DAILY_GOAL) * 100)}%`,
              height: '100%',
              backgroundColor: todayCount >= DAILY_GOAL ? themeColors.success : themeColors.primary,
              borderRadius: 4,
            }} />
          </View>

          {todayCount > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: themeColors.inputBackground }}>
                <Ionicons name="mic" size={12} color={themeColors.subtext} />
                <Typography variant="caption" color={themeColors.subtext}>
                  {todayCount} hoy
                </Typography>
              </View>
              {todayBest !== null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: themeColors.inputBackground }}>
                  <Ionicons name="star" size={12} color={themeColors.subtext} />
                  <Typography variant="caption" color={themeColors.subtext}>
                    Mejor: {todayBest}
                  </Typography>
                </View>
              )}
            </View>
          )}
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

      <Animated.View entering={FadeInDown.delay(100).duration(400)} style={[styles.dailyTipCard, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.border }]}>
        <Ionicons name="bulb-outline" size={18} color={themeColors.primary} />
        <View style={{ flex: 1 }}>
          <Typography variant="caption" weight="bold" color={themeColors.subtext} style={{ letterSpacing: 0.5 }}>
            TIP DEL DÍA
          </Typography>
          <Typography variant="body" style={{ marginTop: 2, lineHeight: 20 }}>
            {dailyTip}
          </Typography>
        </View>
      </Animated.View>

      {suggestedMode && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push({ pathname: '/(tabs)/practice', params: { initialMode: suggestedMode.id } })}
          style={[styles.suggestionCard, { backgroundColor: suggestedMode.color + '15', borderColor: suggestedMode.color + '60' }]}
        >
          <View style={[styles.suggestionIcon, { backgroundColor: suggestedMode.color + '30' }]}>
            <Ionicons name={suggestedMode.icon as any} size={26} color={suggestedMode.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Typography variant="caption" weight="bold" color={suggestedMode.color} style={{ letterSpacing: 0.5 }}>
              SUGERIDO PARA TI
            </Typography>
            <Typography variant="h4" weight="bold" style={{ marginTop: 2 }}>
              {suggestedMode.label}
            </Typography>
            <Typography variant="caption" color={themeColors.subtext} style={{ marginTop: 2 }}>
              {suggestedMode.reason}
            </Typography>
          </View>
          <Ionicons name="arrow-forward" size={20} color={suggestedMode.color} />
        </TouchableOpacity>
      )}

      <View style={{ marginBottom: 32 }}>
        <Typography variant="h3" style={{ marginBottom: 16 }}>
          {Strings.home.startPractice}
        </Typography>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }}>
          {[
            { id: 'improv', label: 'Improvisar', icon: 'mic', color: '#3B82F6', duration: '1:30' },
            { id: 'reading', label: 'Lectura', icon: 'book', color: '#10B981', duration: '3:00' },
            { id: 'vocab', label: 'Vocabulario', icon: 'extension-puzzle', color: '#8B5CF6', duration: '1:00' },
            { id: 'interview', label: 'Entrevista', icon: 'briefcase', color: '#F59E0B', duration: '1:30' },
            { id: 'debate', label: 'Debate', icon: 'people', color: '#EF4444', duration: '1:00' },
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Ionicons name="time-outline" size={12} color={themeColors.subtext} />
                <Typography variant="caption" color={themeColors.subtext}>
                  {m.duration} · +20 XP
                </Typography>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {favoriteCount > 0 && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/(tabs)/practice')}
          style={[styles.favChip, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B55' }]}
          accessibilityRole="button"
          accessibilityLabel="Ver temas favoritos"
        >
          <Ionicons name="star" size={16} color="#F59E0B" />
          <Typography variant="label" weight="bold" color="#B45309" style={{ flex: 1 }}>
            Tienes {favoriteCount} tema{favoriteCount === 1 ? '' : 's'} favorito{favoriteCount === 1 ? '' : 's'}
          </Typography>
          <Ionicons name="arrow-forward" size={16} color="#B45309" />
        </TouchableOpacity>
      )}

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
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/practice')}
            style={[styles.emptyState, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
          >
            <View style={[styles.emptyIcon, { backgroundColor: themeColors.secondary }]}>
              <Ionicons name="mic" size={28} color={themeColors.primary} />
            </View>
            <Typography variant="h4" weight="bold" style={{ marginTop: 12 }}>
              Comienza tu primera práctica
            </Typography>
            <Typography variant="caption" color={themeColors.subtext} align="center" style={{ marginTop: 4, marginBottom: 12 }}>
              Elige un modo y graba tu primera sesión.
            </Typography>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Typography variant="label" weight="bold" color={themeColors.primary}>Empezar</Typography>
              <Ionicons name="arrow-forward" size={16} color={themeColors.primary} />
            </View>
          </TouchableOpacity>
        )}
      </View>
      </ScrollView>
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
    marginTop: 12
  },
  dailyGoalCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  streakBanner: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 24,
  },
  suggestionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dailyTipCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  favChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  section: {
    flex: 1,
  },
  emptyState: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
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
