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
import type { FamillePlan } from './planMasse';

/** Libellé EN CLAIR (pour un agent de mairie) d'une famille demandée. Différent du libellé court d'affichage : ici c'est une phrase. */
const DEMANDE_FAMILLE: Record<FamillePlan, string> = {
  masse: 'le plan de masse (PC2)',
  coupe: 'le plan de coupe (PC3)',
  etage: 'les plans des différents niveaux (plans d’étages)',
  cerfa: 'le formulaire Cerfa de demande de permis de construire et son annexe si besoin pour obtenir la liste intégrale des parcelles cadastrales concernées par ce permis',
};

/** Ordre stable des familles dans le corps (masse, coupe, étages, Cerfa). */
const ORDRE: readonly FamillePlan[] = ['masse', 'coupe', 'etage', 'cerfa'];

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

/**
 * PART-3e — valide la DATE d'une relance DÉJÀ EFFECTUÉE hors de l'outil (déclaration, aucun envoi). PURE. Refuse : date absente/mal
 * formée, dans le FUTUR, ou ANTÉRIEURE au dernier message reçu de la mairie (une relance ne peut précéder ce qu'elle relance).
 * Comparaison au grain JOUR (10 premiers caractères ISO 'YYYY-MM-DD'). `dernierMessageLe` null → borne basse ignorée.
 */
export function problemeDateDeclaration(dateRelance: string, aujourdhui: string, dernierMessageLe: string | null): string | null {
  const d = (dateRelance ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'date de relance manquante ou invalide';
  if (d > (aujourdhui ?? '').slice(0, 10)) return 'la date de relance ne peut pas être dans le futur';
  if (dernierMessageLe) {
    const m = dernierMessageLe.slice(0, 10);
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
export function composerComplementPieces(numDau: string, familles: readonly FamillePlan[]): ComplementPieces | null {
  const demandees = ORDRE.filter((f) => familles.includes(f));
  if (demandees.length === 0) return null;

  const objet = `Permis de construire n° ${numDau} — complément de pièces`;
  const liste = demandees.map((f) => `  - ${DEMANDE_FAMILLE[f]}`);
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
