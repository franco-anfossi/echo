const AVATAR_COLORS = [
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#EF4444', // red
  '#F59E0B', // amber
  '#10B981', // emerald
  '#0EA5E9', // sky
  '#14B8A6', // teal
  '#A855F7', // purple
  '#F97316', // orange
];

export function avatarColor(input: string | null | undefined): string {
  const base = (input || '').trim().toLowerCase() || 'echo';
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatarInitials(name: string | null | undefined, email?: string | null): string {
  const src = (name || '').trim();
  if (src) {
    const parts = src.split(/\s+/);
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || 'U';
  }
  const e = (email || '').trim();
  if (e) return e[0]?.toUpperCase() || 'U';
  return 'U';
}
