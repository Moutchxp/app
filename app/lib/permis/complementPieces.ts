/**
 * PART-3a — GÉNÉRATEUR PUR du courriel « complément de pièces » : demander à une mairie les pièces MANQUANTES d'un permis. Aucun
 * effet de bord. C'est un COMPLÉMENT DE DOSSIER courtois, PAS une relance de cascade : SANS aucune mention de refus tacite, de CADA
 * ni de Commission d'accès. À la première personne du singulier, factuel.
 *
 * ⚠️ DISTINCT des 3 générateurs de relance (verrouillés au mot près par leurs tests) : on n'en touche AUCUN, celui-ci est à part.
 *
 * Il ne cite QUE les familles passées (celles cochées à l'écran), rappelle le NUMÉRO DE PERMIS (num_dau, jamais la référence
 * interne SVAV-…), et remercie pour les pièces déjà transmises.
 */
import { FAMILLES_REF_DEFAUT } from './famillesRef';

/**
 * Une pièce à demander dans le corps : soit un CODE de famille (résolu via le REPLI des 4 familles historiques `FAMILLES_REF_DEFAUT` —
 * rétro-compat des appelants/tests), soit un objet COMPLET `{code, libelleCorps, ordre}` fourni par l'appelant (référentiel VIF, familles
 * élargies pilotées en base). La phrase EN CLAIR (`libelleCorps`) et l'ordre viennent donc du référentiel, plus d'aucun texte en dur ici.
 */
export type PieceDemandee = string | { code: string; libelleCorps: string; ordre?: number };

/** Résout une pièce demandée en { code, libelleCorps, ordre }, ou null si inconnue (code hors repli, ou libellé de corps vide). PURE. */
function resoudrePiece(p: PieceDemandee): { code: string; libelleCorps: string; ordre: number } | null {
  if (typeof p === 'string') {
    const f = FAMILLES_REF_DEFAUT.find((r) => r.code === p);
    return f ? { code: f.code, libelleCorps: f.libelleCorps, ordre: f.ordre } : null;
  }
  return p.libelleCorps && p.libelleCorps.trim() !== '' ? { code: p.code, libelleCorps: p.libelleCorps, ordre: p.ordre ?? Number.MAX_SAFE_INTEGER } : null;
}

/** Une adresse est-elle un « no-reply » (non répondable) ? PURE. On refuse d'écrire à ces adresses (jamais de repli silencieux). */
export function estNoReply(adresse: string | null | undefined): boolean {
  const a = (adresse ?? '').trim().toLowerCase();
  if (a === '') return true; // pas d'adresse → non répondable
  return /(^|[._-])(no[._-]?reply|donotreply|ne[._-]?pas[._-]?repondre)([._-]|@)/.test(a) || a.startsWith('noreply@');
}

/**
 * En-têtes de FIL pour répondre au dernier message reçu : In-Reply-To = son Message-ID ; References = sa chaîne References existante
 * PUIS son Message-ID (arbre du fil, dans l'ordre). PURE. `references` vide si aucune donnée (mais In-Reply-To suffit au rattachement).
 */
export function entetesFil(messageId: string, referencesBrut: string | null | undefined): { inReplyTo: string; references: string } {
  const mid = (messageId ?? '').trim();
  const refs = (referencesBrut ?? '').trim();
  return { inReplyTo: mid, references: `${refs ? `${refs} ` : ''}${mid}`.trim() };
}

/** Entité HTML échappée (&nbsp; &amp; &lt; &#160; …) — INTERDITE : le mail part en texte brut, une entité s'y afficherait littéralement. */
const RE_ENTITE_HTML = /&(?:[a-z]+|#\d+);/i;

/**
 * Valide un objet + corps de complément AVANT envoi (y compris quand ils ont été MODIFIÉS À LA MAIN — PART-3c). Renvoie le motif de
 * refus, ou `null` si le texte est envoyable. PURE. Refuse : objet vide, corps vide, ou toute entité HTML échappée (texte brut).
 */
export function problemeTexteComplement(objet: string, corps: string): string | null {
  if (objet.trim() === '') return 'objet vide';
  if (corps.trim() === '') return 'corps vide';
  if (RE_ENTITE_HTML.test(objet) || RE_ENTITE_HTML.test(corps)) return 'le texte contient une entité HTML échappée (le mail part en texte brut)';
  return null;
}

/** Jour ISO 'YYYY-MM-DD' à partir d'une chaîne ISO OU d'un objet Date. Le driver `pg` déserialise `timestamptz` en `Date` (aucun
 * `setTypeParser`) : le vrai `dernierMessageLe` est un Date au runtime, une chaîne seulement en test/mock. On normalise au grain JOUR
 * en UTC (cohérent avec les `to_char(… AT TIME ZONE 'UTC')` du reste du domaine et avec `aujourdhui()` = `toISOString().slice(0,10)`). */
function jourIso(v: string | Date): string {
  return (typeof v === 'string' ? v : v.toISOString()).slice(0, 10);
}

/**
 * PART-3e — valide la DATE d'une relance DÉJÀ EFFECTUÉE hors de l'outil (déclaration, aucun envoi). PURE. Refuse : date absente/mal
 * formée, dans le FUTUR, ou ANTÉRIEURE au dernier message reçu de la mairie (une relance ne peut précéder ce qu'elle relance).
 * Comparaison au grain JOUR (10 premiers caractères ISO 'YYYY-MM-DD'). `dernierMessageLe` null → borne basse ignorée.
 * `dernierMessageLe` accepte `Date | string` : le vrai appelant (`lireContexteDeclaration`) fournit un `Date` (colonne timestamptz).
 */
export function problemeDateDeclaration(dateRelance: string, aujourdhui: string, dernierMessageLe: string | Date | null): string | null {
  const d = (dateRelance ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'date de relance manquante ou invalide';
  if (d > (aujourdhui ?? '').slice(0, 10)) return 'la date de relance ne peut pas être dans le futur';
  if (dernierMessageLe) {
    const m = jourIso(dernierMessageLe);
    if (d < m) return `la relance ne peut pas précéder le dernier message reçu de la mairie (${m})`;
  }
  return null;
}

/** FIL-B — objet d'une RÉPONSE à un message : préfixe « Re: » de l'objet d'origine, sauf s'il en porte déjà un. PURE. */
export function objetReponse(objetOrigine: string | null | undefined): string {
  const o = (objetOrigine ?? '').trim();
  if (o === '') return 'Re:';
  return /^re\s*:/i.test(o) ? o : `Re: ${o}`;
}

export interface ComplementPieces { objet: string; corps: string }

/**
 * Compose l'objet + le corps du courriel de complément. `familles` = les familles à demander (déjà filtrées : cochées à l'écran).
 * `null` si aucune famille (l'appelant refuse l'envoi en amont — ce retour null est un filet). PURE.
 */
export function composerComplementPieces(numDau: string, familles: readonly PieceDemandee[]): ComplementPieces | null {
  // Résout + écarte l'inconnu, TRIE par ordre référentiel (tri stable → à ordre égal, ordre d'entrée conservé), puis DÉDUPLIQUE par code.
  const vues = new Set<string>();
  const demandees = familles
    .map(resoudrePiece)
    .filter((x): x is { code: string; libelleCorps: string; ordre: number } => x !== null)
    .sort((a, b) => a.ordre - b.ordre)
    .filter((d) => (vues.has(d.code) ? false : (vues.add(d.code), true)));
  if (demandees.length === 0) return null;

  const objet = `Permis de construire n° ${numDau} — complément de pièces`;
  const liste = demandees.map((f) => `  - ${f.libelleCorps}`);
  const intro = demandees.length === 1
    ? 'je me permets de solliciter la communication de la pièce suivante :'
    : 'je me permets de solliciter la communication des pièces suivantes :';
  const corps = [
    'Madame, Monsieur,',
    '',
    `Je vous remercie pour les pièces déjà transmises concernant le permis de construire n° ${numDau}.`,
    '',
    `Afin de compléter le dossier, ${intro}`,
    ...liste,
    '',
    'Je vous en remercie par avance et reste à votre disposition pour tout complément.',
    '',
    'Bien cordialement,',
  ].join('\n');
  return { objet, corps };
}
