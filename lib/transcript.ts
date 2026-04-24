const FILLER_WORDS = new Set([
  'eh',
  'ah',
  'um',
  'uhm',
  'mmm',
  'mm',
  'este',
  'bueno',
  'pues',
  'tipo',
  'como',
  'osea',
  'sea',
  'digamos',
  'entonces',
  'literal',
  'nada',
]);
const FILLER_PHRASES = [/\bo sea\b/gi, /\bes decir\b/gi];

export interface TranscriptToken {
  text: string;
  isFiller: boolean;
}

/**
 * Split transcript into ordered tokens preserving whitespace/punctuation so
 * the view can render filler words with a highlight while keeping the
 * surrounding text intact.
 */
export function tokenizeTranscript(transcript: string): TranscriptToken[] {
  if (!transcript) return [];
  // First, collapse multi-word phrases into single filler tokens so the
  // word-level check doesn't need to know about them.
  let normalized = transcript;
  for (const rx of FILLER_PHRASES) {
    normalized = normalized.replace(rx, (m) => `__FILLER__${m}__ENDFILLER__`);
  }

  const parts = normalized.split(/(\s+|[,.;:!?¿¡()«»"])/g).filter((p) => p !== '');
  return parts.map((raw) => {
    if (raw.startsWith('__FILLER__') && raw.endsWith('__ENDFILLER__')) {
      return { text: raw.replace(/^__FILLER__|__ENDFILLER__$/g, ''), isFiller: true };
    }
    const clean = raw.toLowerCase().replace(/[^a-záéíóúüñ]/gi, '');
    return { text: raw, isFiller: !!clean && FILLER_WORDS.has(clean) };
  });
}
