/**
 * ══ 🔴🔴 LES VOCAUX DU COMPTE RENDU DE PRÉ-VISITE (Arno, 13/11/2026, lot C) — RÈGLES PURES ═══════════════════════════════════════════════
 * Enregistrés au micro du téléphone (Safari iOS : audio/mp4), 10 minutes au plus chacun ; TRANSCRITS par Mistral, le texte s'insère dans le
 * compte rendu À L'ENDROIT DU CURSEUR, modifiable, avec la mention « (transcrit d'un vocal) ». 🔴 LE FICHIER AUDIO RESTE INTERNE : écoutable
 * dans « Voir le compte rendu », JAMAIS joint à un mail (ni locataire, ni propriétaire, ni interne). ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export const VOCAL_DUREE_MAX_S = 10 * 60;
export const VOCAL_MAX_OCTETS = 15 * 1024 * 1024;
/** 🔴 Arno (15/11/2026) — une PRISE = une pièce audio ; plusieurs prises par fichier vocal, plusieurs fichiers : 40 prises au plus par compte rendu. */
export const VOCAUX_MAX = 40;
/** 🔴 Arno (15/11/2026) — une prise (ou une dictée) de moins d'une demi-seconde est ignorée (appui trop bref). */
export const PRISE_MIN_MS = 500;
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

/**
 * 🔴🔴 Arno (15/11/2026, 9e retour) — JAMAIS DE VOCAL FANTÔME : les OCTETS reçus sont-ils vraiment un enregistrement audio avec du contenu ?
 * Signature lue dans les octets (jamais le seul type annoncé) : MP4/M4A (« ftyp » puis des données « mdat »/« moof »), WebM (EBML), Ogg,
 * WAV, MP3, AAC. null : accepté ; sinon le motif. PUR.
 */
export const AUDIO_MIN_OCTETS = 64;
export function refusContenuAudio(o: Uint8Array): string | null {
  if (o.byteLength === 0) return 'L’enregistrement est vide.';
  if (o.byteLength < AUDIO_MIN_OCTETS) return 'L’enregistrement est vide ou incomplet : réenregistrez la prise.';
  // 🔴🔴 (15/11/2026, bug de l'envoi final) — JAMAIS « String.fromCharCode(...octets) » sur un fichier entier : l'étalement de centaines de
  // milliers d'octets dépassait la pile (RangeError) dès qu'une vraie prise M4A de l'iPhone dépassait ~100 Ko, et l'envoi tombait en
  // « la base n'a pas répondu ». Les mots sont lus octet par octet, sur 4 octets seulement.
  const mot = (i: number): string => (i + 4 <= o.byteLength ? String.fromCharCode(o[i], o[i + 1], o[i + 2], o[i + 3]) : '');
  if (mot(4) === 'ftyp') return donneesMp4(o) ? null : 'L’enregistrement ne contient aucun son : réenregistrez la prise.';
  if (o[0] === 0x1a && o[1] === 0x45 && o[2] === 0xdf && o[3] === 0xa3) return null; // WebM / Matroska
  if (mot(0) === 'OggS') return null;
  if (mot(0) === 'RIFF' && mot(8) === 'WAVE') return null;
  if (String.fromCharCode(o[0], o[1], o[2]) === 'ID3' || (o[0] === 0xff && (o[1] & 0xe0) === 0xe0)) return null; // MP3 ou AAC (ADTS)
  return 'Ce fichier n’est pas un enregistrement audio lisible : réenregistrez la prise.';
}

/**
 * Un MP4 / M4A porte-t-il des DONNÉES (une boîte « mdat » non vide, ou des fragments « moof ») ? Parcours des boîtes de premier niveau
 * (taille sur 4 octets, 64 bits si 1, « jusqu'à la fin » si 0) ; aucune boîte de données reconnue : recherche octet par octet. Sans pile, sans copie. PUR.
 */
function donneesMp4(o: Uint8Array): boolean {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  let i = 0; let mdatVide = false;
  while (i + 8 <= o.byteLength) {
    let taille = v.getUint32(i);
    const type = String.fromCharCode(o[i + 4], o[i + 5], o[i + 6], o[i + 7]);
    let entete = 8;
    if (taille === 1) { if (i + 16 > o.byteLength) break; taille = Number(v.getBigUint64(i + 8)); entete = 16; }
    else if (taille === 0) taille = o.byteLength - i;
    if (taille < entete) break;
    if (type === 'moof') return true;
    if (type === 'mdat') { if (taille > entete && i + entete < o.byteLength) return true; mdatVide = true; }
    i += taille;
  }
  if (mdatVide) return false; // une boîte de données bien formée, mais VIDE : aucun son
  // aucune boîte de données reconnue (structure inhabituelle) : les quatre lettres n'importe où, octet par octet — jamais refuser un vrai son
  for (let k = 0; k + 4 <= o.byteLength; k++) {
    const a = o[k], b = o[k + 1], c = o[k + 2], d = o[k + 3];
    if (a === 0x6d && ((b === 0x64 && c === 0x61 && d === 0x74) || (b === 0x6f && c === 0x6f && d === 0x66))) return true; // mdat, moof
  }
  return false;
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
/**
 * 🔴 Arno (15/11/2026) — LES FICHIERS VOCAUX du dictaphone : un nom (« Vocal 1 », renommable) et ses PRISES dans l'ordre. Rangés au journal à
 * l'envoi (`json:{"fichiers":[…]}`) ; l'ancienne trace (`ids:1,2`) reste lue : chaque vocal y est un fichier d'une prise.
 */
export interface FichierVocalTrace { nom: string; ids: number[];
  /** 🔴 Arno (15/11/2026) — « Envoyé aux locataires » (défaut : non, le fichier reste interne). */
  locataires?: boolean }
export const NOM_FICHIER_MAX = 60;
const idValide = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
/** Un nom de fichier vocal propre (un seul espace, 60 caractères au plus), ou le nom par défaut. PUR. */
export const nomFichierVocal = (brut: unknown, rang: number): string => {
  const x = typeof brut === 'string' ? brut.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOM_FICHIER_MAX) : '';
  return x === '' ? `Vocal ${rang + 1}` : x;
};
export function traceVocaux(ids: readonly number[], fichiers?: readonly FichierVocalTrace[]): string {
  if (!fichiers || fichiers.length === 0) return `ids:${ids.join(',')}`;
  return `json:${JSON.stringify({ fichiers: fichiers.map((f, i) => ({ nom: nomFichierVocal(f.nom, i), ids: f.ids.filter(idValide), ...(f.locataires ? { locataires: true } : {}) })) })}`;
}
/** Les fichiers vocaux d'une trace du journal (ancienne trace : un fichier par vocal). PUR. */
export function fichiersDeTrace(x: string | null | undefined): FichierVocalTrace[] {
  if (typeof x !== 'string') return [];
  if (/^ids:[\d,]*$/.test(x)) return x.slice(4).split(',').map(Number).filter(idValide).map((id, i) => ({ nom: `Vocal ${i + 1}`, ids: [id] }));
  if (!x.startsWith('json:')) return [];
  try {
    const j = JSON.parse(x.slice(5)) as { fichiers?: { nom?: unknown; ids?: unknown; locataires?: unknown }[] };
    return (Array.isArray(j.fichiers) ? j.fichiers : []).map((f, i) => ({ nom: nomFichierVocal(f.nom, i), ids: (Array.isArray(f.ids) ? f.ids : []).filter(idValide),
      ...(f.locataires === true ? { locataires: true } : {}) }))
      .filter((f) => f.ids.length > 0);
  } catch { return []; }
}
export const idsDeTrace = (x: string | null | undefined): number[] => fichiersDeTrace(x).flatMap((f) => f.ids);

/**
 * Les fichiers vocaux reçus par la route (nom, prises), BORNÉS aux prises connues du compte rendu : une prise inconnue est écartée, une prise
 * ne compte qu'une fois, un fichier vide disparaît ; les prises connues hors de tout fichier forment chacune un fichier. PUR.
 */
export function fichiersVocauxRecus(brut: unknown, prises: readonly number[]): FichierVocalTrace[] {
  const connues = new Set(prises); const vues = new Set<number>();
  const liste = (Array.isArray(brut) ? brut : []).slice(0, VOCAUX_MAX).map((f, i) => {
    const o = (f ?? {}) as { nom?: unknown; ids?: unknown; locataires?: unknown };
    const ids = (Array.isArray(o.ids) ? o.ids : []).map((n) => (typeof n === 'string' ? Number(n) : n)).filter((n): n is number => idValide(n) && connues.has(n) && !vues.has(n) && (vues.add(n), true));
    return { nom: nomFichierVocal(o.nom, i), ids, ...(o.locataires === true ? { locataires: true } : {}) };
  }).filter((f) => f.ids.length > 0);
  for (const id of prises) if (!vues.has(id)) liste.push({ nom: `Vocal ${liste.length + 1}`, ids: [id] });
  return liste;
}

/** 🔴 Arno (15/11/2026) — LA DICTÉE : le texte dicté s'insère À L'ENDROIT DU CURSEUR (ou à la fin), comme s'il avait été tapé — sans mention. PUR. */
export function insererDictee(corps: string, curseur: number | null, dicte: string): { texte: string; curseur: number } {
  const t = dicte.replace(/\s+/g, ' ').trim();
  if (t === '') return { texte: corps, curseur: curseur ?? corps.length };
  const p = curseur === null || curseur < 0 || curseur > corps.length ? corps.length : curseur;
  const avant = corps.slice(0, p); const apres = corps.slice(p);
  const bloc = `${avant !== '' && !/\s$/.test(avant) ? ' ' : ''}${t}${apres !== '' && !/^\s/.test(apres) ? ' ' : ''}`;
  return { texte: `${avant}${bloc}${apres}`, curseur: avant.length + bloc.length };
}

/* ══ 🔴 Arno (15/11/2026) — UN FICHIER VOCAL « ENVOYÉ AUX LOCATAIRES » ══════════════════════════════════════════════════════════════════════
 * Coché sur un fichier (défaut : NON), ses prises partent en pièces jointes dans les mails des LOCATAIRES et dans le mail interne (jamais
 * ailleurs : le compte rendu ne va à aucun propriétaire), nommées dans l'ordre ; le texte du mail les annonce. Poids total des pièces
 * (photos comprises) plafonné. */
const slug = (x: string): string => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/g, '');
/** « Vocal-1-salle-de-bain.m4a », ou « Vocal-1-salle-de-bain-prise-2.m4a » quand le fichier a plusieurs prises. PUR. */
export function nomPieceVocale(rangFichier: number, nom: string, rangPrise: number, nbPrises: number, type: string): string {
  const s = slug(nom); const ext = TYPES_AUDIO[typeAudio(type) ?? ''] ?? 'audio';
  return `Vocal-${rangFichier + 1}${s && s !== `vocal-${rangFichier + 1}` ? `-${s}` : ''}${nbPrises > 1 ? `-prise-${rangPrise + 1}` : ''}.${ext}`;
}
export const TITRE_VOCAUX = 'Enregistrements vocaux joints';
/** Les lignes du mail qui annoncent les vocaux joints. PUR. */
export function paragraphesVocaux(fichiers: readonly { nom: string; ids: readonly number[] }[]): string[] {
  return fichiers.length === 0 ? [] : [TITRE_VOCAUX, fichiers.map((f, i) => `${nomFichierVocal(f.nom, i)}${f.ids.length > 1 ? ` (${f.ids.length} prises, à écouter dans l’ordre)` : ''}`).join('\n')];
}
/** Le refus d'un envoi trop lourd (photos et vocaux joints). PUR. */
export function refusPoidsPieces(octets: number, plafond: number): string | null {
  if (octets <= plafond) return null;
  const mo = (x: number) => (x / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return `Les pièces jointes pèsent ${mo(octets)} Mo, au-delà de ${mo(plafond)} Mo : décochez « Envoyé aux locataires » sur un vocal (ou retirez une photo), puis réessayez.`;
}
/** Le vocal dans le récapitulatif et dans « Voir le compte rendu ». PUR. */
/** Le libellé du journal des vocaux d'un compte rendu : combien sont partis aux locataires, combien restent internes. PUR. */
export function libelleJournalVocaux(total: number, envoyees: number): string {
  const n = Math.max(0, Math.min(envoyees, total));
  const parties = [n > 0 ? `${n} envoyée${n > 1 ? 's' : ''} aux locataires` : null, total - n > 0 ? `${total - n} interne${total - n > 1 ? 's' : ''}` : null].filter(Boolean);
  return `${total} prise${total > 1 ? 's' : ''} vocale${total > 1 ? 's' : ''} du compte rendu de pré-visite — ${parties.join(', ')}`;
}
export const etatVocalLocataires = (envoye: boolean): string => (envoye ? 'ENVOYÉ aux locataires' : 'NON envoyé (interne)');
