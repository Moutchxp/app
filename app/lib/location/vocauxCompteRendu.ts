/**
 * ══ 🔴🔴 LES VOCAUX DU COMPTE RENDU DE PRÉ-VISITE (Arno, 13/11/2026, lot C) — RÈGLES PURES ═══════════════════════════════════════════════
 * Enregistrés au micro du téléphone (Safari iOS : audio/mp4), 10 minutes au plus chacun ; TRANSCRITS par Mistral, le texte s'insère dans le
 * compte rendu À L'ENDROIT DU CURSEUR, modifiable, avec la mention « (transcrit d'un vocal) ». 🔴 LE FICHIER AUDIO RESTE INTERNE : écoutable
 * dans « Voir le compte rendu », JAMAIS joint à un mail (ni locataire, ni propriétaire, ni interne). ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export const VOCAL_DUREE_MAX_S = 10 * 60;
export const VOCAL_MAX_OCTETS = 15 * 1024 * 1024;
export const VOCAUX_MAX = 10;
export const MENTION_TRANSCRIT = '(transcrit d’un vocal)';
export const ACTION_JOURNAL_VOCAUX = 'location_previsite_vocaux';

/** Les formats audio acceptés (type annoncé, sans ses paramètres) : Safari iOS (mp4/aac), Chrome/Firefox (webm/ogg), mp3, wav. */
const TYPES_AUDIO: Record<string, string> = {
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
};
/** Le type audio normalisé, ou null (refusé). PUR. */
export function typeAudio(t: string | null | undefined): string | null {
  const x = (t ?? '').toLowerCase().split(';')[0].trim();
  return x in TYPES_AUDIO ? x : null;
}
/** « Vocal-1.m4a ». PUR. */
export const nomVocal = (rang: number, type: string): string => `Vocal-${rang + 1}.${TYPES_AUDIO[typeAudio(type) ?? ''] ?? 'audio'}`;

/** Le refus d'un vocal reçu : type, taille, durée annoncée. null : accepté. PUR. */
export function refusVocal(v: { typeMime: string | null; taille: number; dureeS: number | null }): string | null {
  if (typeAudio(v.typeMime) === null) return 'Ce fichier n’est pas un enregistrement audio reconnu.';
  if (!(v.taille > 0)) return 'L’enregistrement est vide.';
  if (v.taille > VOCAL_MAX_OCTETS) return `L’enregistrement dépasse ${VOCAL_MAX_OCTETS / (1024 * 1024)} Mo.`;
  if (v.dureeS !== null && v.dureeS > VOCAL_DUREE_MAX_S + 5) return 'Un vocal dure 10 minutes au plus.';
  return null;
}

/** Le texte transcrit, inséré À L'ENDROIT DU CURSEUR (ligne à part, mention discrète) ; rend aussi la nouvelle position du curseur. PUR. */
export function insererTranscription(corps: string, curseur: number | null, transcrit: string): { texte: string; curseur: number } {
  const t = transcrit.trim();
  if (t === '') return { texte: corps, curseur: curseur ?? corps.length };
  const p = curseur === null || curseur < 0 || curseur > corps.length ? corps.length : curseur;
  const avant = corps.slice(0, p); const apres = corps.slice(p);
  const bloc = `${avant !== '' && !avant.endsWith('\n') ? '\n' : ''}${t} ${MENTION_TRANSCRIT}${apres !== '' && !apres.startsWith('\n') ? '\n' : ''}`;
  return { texte: `${avant}${bloc}${apres}`, curseur: avant.length + bloc.length };
}

/** « 02:07 ». PUR. */
export const dureeFr = (s: number): string => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

/** La trace des vocaux d'un compte rendu, dans le journal (« ids:12,13 »), et sa relecture. PUR. */
export const traceVocaux = (ids: readonly number[]): string => `ids:${ids.join(',')}`;
export const idsDeTrace = (x: string | null | undefined): number[] =>
  /^ids:[\d,]*$/.test(x ?? '') ? (x as string).slice(4).split(',').map(Number).filter((n) => Number.isSafeInteger(n) && n > 0) : [];
