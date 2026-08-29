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
  cerfa: 'le formulaire Cerfa de demande de permis de construire',
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
