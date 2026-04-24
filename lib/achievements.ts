export type AchievementId =
  | 'first_step'
  | 'streak_3'
  | 'streak_7'
  | 'streak_30'
  | 'attempts_10'
  | 'attempts_50'
  | 'attempts_100'
  | 'perfect_score'
  | 'high_avg_85'
  | 'all_modes'
  | 'level_5'
  | 'level_10';

export type IoniconName =
  | 'play-circle' | 'flame' | 'flame-outline' | 'rocket'
  | 'trophy' | 'medal' | 'star' | 'ribbon'
  | 'mic' | 'planet' | 'sparkles' | 'pulse';

export interface Achievement {
  id: AchievementId;
  title: string;
  description: string;
  icon: IoniconName;
  color: string;
  unlocked: boolean;
  /** 0..1 for locked achievements with measurable progress */
  progress: number;
  progressLabel: string;
}

export interface UserStatsForAchievements {
  total_attempts: number;
  streak_current: number;
  streak_longest: number;
  xp: number;
  best_overall_score: number;
  monthly_avg_score: number;
  unique_modes_used: number;
}

const totalModes = 5;

function clamp01(n: number): number {
  if (Number.isNaN(n) || n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function computeAchievements(stats: UserStatsForAchievements): Achievement[] {
  const level = levelFromXp(stats.xp);
  const xpForLevel = (l: number) => 100 * Math.pow(l - 1, 2);

  const items: Achievement[] = [
    {
      id: 'first_step',
      title: 'Primer paso',
      description: 'Completa tu primera práctica.',
      icon: 'play-circle',
      color: '#3B82F6',
      unlocked: stats.total_attempts >= 1,
      progress: clamp01(stats.total_attempts / 1),
      progressLabel: `${Math.min(stats.total_attempts, 1)} / 1`,
    },
    {
      id: 'streak_3',
      title: 'Calentando',
      description: 'Mantén una racha de 3 días.',
      icon: 'flame-outline',
      color: '#F97316',
      unlocked: stats.streak_longest >= 3,
      progress: clamp01(stats.streak_longest / 3),
      progressLabel: `${Math.min(stats.streak_longest, 3)} / 3 días`,
    },
    {
      id: 'streak_7',
      title: 'Semana de fuego',
      description: 'Mantén una racha de 7 días.',
      icon: 'flame',
      color: '#EF4444',
      unlocked: stats.streak_longest >= 7,
      progress: clamp01(stats.streak_longest / 7),
      progressLabel: `${Math.min(stats.streak_longest, 7)} / 7 días`,
    },
    {
      id: 'streak_30',
      title: 'Imparable',
      description: 'Mantén una racha de 30 días.',
      icon: 'rocket',
      color: '#8B5CF6',
      unlocked: stats.streak_longest >= 30,
      progress: clamp01(stats.streak_longest / 30),
      progressLabel: `${Math.min(stats.streak_longest, 30)} / 30 días`,
    },
    {
      id: 'attempts_10',
      title: 'Diez al hilo',
      description: 'Completa 10 prácticas.',
      icon: 'mic',
      color: '#10B981',
      unlocked: stats.total_attempts >= 10,
      progress: clamp01(stats.total_attempts / 10),
      progressLabel: `${Math.min(stats.total_attempts, 10)} / 10`,
    },
    {
      id: 'attempts_50',
      title: 'Veterano',
      description: 'Completa 50 prácticas.',
      icon: 'medal',
      color: '#0EA5E9',
      unlocked: stats.total_attempts >= 50,
      progress: clamp01(stats.total_attempts / 50),
      progressLabel: `${Math.min(stats.total_attempts, 50)} / 50`,
    },
    {
      id: 'attempts_100',
      title: 'Maratonista',
      description: 'Completa 100 prácticas.',
      icon: 'trophy',
      color: '#F59E0B',
      unlocked: stats.total_attempts >= 100,
      progress: clamp01(stats.total_attempts / 100),
      progressLabel: `${Math.min(stats.total_attempts, 100)} / 100`,
    },
    {
      id: 'perfect_score',
      title: 'Perfección',
      description: 'Logra un puntaje global de 100.',
      icon: 'star',
      color: '#FACC15',
      unlocked: stats.best_overall_score >= 100,
      progress: clamp01(stats.best_overall_score / 100),
      progressLabel: `Mejor: ${stats.best_overall_score} / 100`,
    },
    {
      id: 'high_avg_85',
      title: 'Promedio dorado',
      description: 'Mantén un promedio mensual de 85+.',
      icon: 'ribbon',
      color: '#22C55E',
      unlocked: stats.monthly_avg_score >= 85,
      progress: clamp01(stats.monthly_avg_score / 85),
      progressLabel: `${stats.monthly_avg_score} / 85`,
    },
    {
      id: 'all_modes',
      title: 'Camaleón',
      description: 'Practica en los 5 modos.',
      icon: 'planet',
      color: '#A855F7',
      unlocked: stats.unique_modes_used >= totalModes,
      progress: clamp01(stats.unique_modes_used / totalModes),
      progressLabel: `${Math.min(stats.unique_modes_used, totalModes)} / ${totalModes} modos`,
    },
    {
      id: 'level_5',
      title: 'Nivel 5',
      description: 'Alcanza el nivel 5.',
      icon: 'sparkles',
      color: '#6366F1',
      unlocked: level >= 5,
      progress: clamp01(stats.xp / xpForLevel(5)),
      progressLabel: `${stats.xp} / ${xpForLevel(5)} XP`,
    },
    {
      id: 'level_10',
      title: 'Nivel 10',
      description: 'Alcanza el nivel 10.',
      icon: 'pulse',
      color: '#EC4899',
      unlocked: level >= 10,
      progress: clamp01(stats.xp / xpForLevel(10)),
      progressLabel: `${stats.xp} / ${xpForLevel(10)} XP`,
    },
  ];

  return items;
}
