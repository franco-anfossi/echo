export type PracticeMode = 'improv' | 'reading' | 'vocab' | 'interview' | 'debate';

export const PRACTICE_MODES: { id: PracticeMode; label: string; color: string; icon: string }[] = [
  { id: 'improv', label: 'Improvisar', color: '#3B82F6', icon: 'mic' },
  { id: 'reading', label: 'Lectura', color: '#10B981', icon: 'book' },
  { id: 'vocab', label: 'Vocabulario', color: '#8B5CF6', icon: 'extension-puzzle' },
  { id: 'interview', label: 'Entrevista', color: '#F59E0B', icon: 'briefcase' },
  { id: 'debate', label: 'Debate', color: '#EF4444', icon: 'people' },
];

export const MODE_LABELS: Record<string, string> = PRACTICE_MODES.reduce((acc, m) => {
  acc[m.id] = m.label;
  return acc;
}, {} as Record<string, string>);

export const MODE_COLORS: Record<string, string> = PRACTICE_MODES.reduce((acc, m) => {
  acc[m.id] = m.color;
  return acc;
}, {} as Record<string, string>);

export function modeLabel(mode: string | null | undefined): string {
  if (!mode) return 'Práctica';
  return MODE_LABELS[mode] || 'Práctica';
}

export function modeColor(mode: string | null | undefined): string {
  if (!mode) return '#64748B';
  return MODE_COLORS[mode] || '#64748B';
}
