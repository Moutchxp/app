/**
 * LOT 28 — EXTRACTION du TÉLÉPHONE dans la SIGNATURE d'un message reçu (module PUR, aucune I/O, aucun import → client-safe pour le type).
 * On lit le numéro que l'interlocuteur met dans SA signature, on le normalise, et on le QUALIFIE (ligne directe / standard) SANS JAMAIS
 * deviner : une qualification n'est posée que sur un fait (étiquette écrite, unicité d'une signature nommée, ou rapprochement au standard connu).
 *
 * Règles de qualification (arbitrage Arno, LOT 28 §2.2 — appliquées telles quelles) :
 *   • « ligne directe » : étiqueté Tél. / Téléphone / Ligne directe / Tél. direct / Direct / Poste, OU seul numéro d'une signature nommée ;
 *   • « standard » : étiqueté Standard / Accueil, OU (pour un numéro NON étiqueté) rapproché du standard commune connu ;
 *   • sinon (deux numéros non étiquetés non rapprochables) : AUCUNE étiquette (jamais devinée).
 */

/** Un numéro qualifié prêt à afficher : normalisé, avec son étiquette (ou null) et sa SOURCE (signature d'un message vs annuaire commune). */
export interface TelephoneQualifie { numero: string; label: 'direct' | 'standard' | null; source: 'signature' | 'annuaire' }
/** Un numéro brut extrait d'une signature : normalisé + étiquette LEXICALE lue juste avant (ou null). */
export interface TelephoneExtrait { numero: string; label: 'direct' | 'standard' | null }

/** Normalise un numéro FR en « 0X XX XX XX XX » (accepte +33 / 0033 / espaces / points / tirets / collé). `null` si ce n'est pas un numéro FR valide. PUR. */
export function normaliserTelephoneFr(brut: string): string | null {
  let d = (brut ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+33')) d = '0' + d.slice(3);
  else if (d.startsWith('0033')) d = '0' + d.slice(4);
  if (!/^0[1-9]\d{8}$/.test(d)) return null;                     // 10 chiffres, 2e chiffre 1-9 (jamais 00)
  return d.replace(/(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/, '$1 $2 $3 $4 $5');
}

// Ligne qui OUVRE un fil cité (mail transféré / réponse) : au-delà, ce n'est plus la signature utile mais l'historique.
const OUVRE_FIL_CITE = [
  /^\s*(?:de|à|a|from|envoyé|sent|exp[ée]diteur|objet|subject|cc)\s*:/i,
  /^\s*-{3,}\s*$/, /^\s*_{3,}\s*$/,
  /^\s*-+\s*(?:message|original|mail|forwarded)/i,
  /^\s*le\s.+\ba\s+écrit\s*:/i,   // « Le 12/08/2026 … a écrit : »
  /^\s*>/,                         // ligne citée « > … »
];
// Formules de politesse : la SIGNATURE commence après la dernière. Un numéro non étiqueté avant = numéro du corps → ignoré.
const SIGNOFF = /\b(?:cordialement|bien\s+à\s+vous|bien\s+cordialement|salutations|sinc[èe]rement|cdt|respectueusement|belle\s+journée)\b/gi;
// Étiquettes lexicales (dans la même ligne, avant le numéro).
const LABEL_STANDARD = /\b(?:standard|accueil|std)\b/i;
const LABEL_DIRECT = /(?:t[ée]l|t[ée]l[ée]phone|ligne\s+directe|direct|poste|ligne)\b/i;
// Motif d'un numéro FR dans un texte (entouré de non-chiffres pour ne pas mordre dans une référence plus longue).
const RE_NUM = /(?<!\d)(?:\+33|0033|0)[\s.\-]?[1-9](?:[\s.\-]?\d\d){4}(?!\d)/g;

/**
 * Extrait de la SIGNATURE d'un message (hors fil cité) les numéros FR + leur étiquette éventuelle. On coupe d'abord au fil cité
 * (« De: / À: / Envoyé: », séparateurs, « … a écrit : », lignes « > »), puis on ne retient un numéro que s'il est ÉTIQUETÉ ou s'il
 * se trouve dans la zone de signature (après la dernière formule de politesse) — les numéros du corps sont ignorés. Dédup par numéro. PUR.
 */
export function extraireTelephonesSignature(texte: string): TelephoneExtrait[] {
  if (!texte || texte.trim() === '') return [];
  const lignes = texte.split(/\r?\n/);
  let fin = lignes.length;
  for (let i = 0; i < lignes.length; i++) {
    if (OUVRE_FIL_CITE.some((re) => re.test(lignes[i]))) { fin = i; break; }
  }
  const utile = lignes.slice(0, fin).join('\n');
  SIGNOFF.lastIndex = 0;
  let idxSignoff = -1;
  for (let m = SIGNOFF.exec(utile); m !== null; m = SIGNOFF.exec(utile)) idxSignoff = m.index; // la DERNIÈRE formule
  const parNumero = new Map<string, TelephoneExtrait>();
  RE_NUM.lastIndex = 0;
  for (let m = RE_NUM.exec(utile); m !== null; m = RE_NUM.exec(utile)) {
    const numero = normaliserTelephoneFr(m[0]);
    if (!numero) continue;
    const debutLigne = utile.lastIndexOf('\n', m.index) + 1;
    const avant = utile.slice(debutLigne, m.index);
    const label: 'direct' | 'standard' | null = LABEL_STANDARD.test(avant) ? 'standard' : LABEL_DIRECT.test(avant) ? 'direct' : null;
    const dansSignature = idxSignoff >= 0 && m.index > idxSignoff;
    if (label === null && !dansSignature) continue;              // numéro du corps, non étiqueté → ignoré
    const exist = parNumero.get(numero);
    if (!exist) parNumero.set(numero, { numero, label });
    else if (exist.label === null && label !== null) parNumero.set(numero, { numero, label }); // enrichit l'étiquette
  }
  return [...parNumero.values()];
}

/**
 * Qualifie les numéros extraits d'une signature d'une PERSONNE (nommée ou non), avec le standard commune connu (pour rapprocher). Ne
 * pose une qualification que sur un FAIT ; deux numéros non étiquetés non rapprochables restent SANS étiquette. PUR.
 */
export function qualifierTelephones(extraits: TelephoneExtrait[], opts: { nomConnu: boolean; standardCommune: string | null }): TelephoneQualifie[] {
  const std = opts.standardCommune ? normaliserTelephoneFr(opts.standardCommune) : null;
  const seul = extraits.length === 1;
  return extraits.map((e) => {
    let label = e.label; // une étiquette ÉCRITE par l'interlocuteur fait foi (jamais écrasée)
    if (label === null) {
      if (std && e.numero === std) label = 'standard';           // rapproché du standard commune connu
      else if (seul && opts.nomConnu) label = 'direct';          // seul numéro d'une signature nommée
      // sinon : plusieurs numéros non étiquetés non rapprochables → on n'invente pas
    }
    return { numero: e.numero, label, source: 'signature' as const };
  });
}
