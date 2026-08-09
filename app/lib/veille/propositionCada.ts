/**
 * X5 — COMPOSITION de l'e-mail de PROPOSITION de saisine CADA. Module PUR : aucune I/O. Produit { sujet, corps } à partir
 * d'une demande DEVENUE saisissable + le lien de confirmation. Modèle : composerAlerte (texte brut, factuel, à soi-même).
 *
 * ⚠️ Ce n'est PAS une pièce juridique : TON INTERNE et FACTUEL, AUCUNE citation d'article (les fondements juridiques ne
 * figurent que dans la saisine elle-même, générée plus tard). Le corps montre le détail de la demande INITIALE (pour
 * reconnaître le dossier) + le lien. Le lien OUVRE une page de confirmation ; il ne déclenche RIEN au chargement.
 */
export interface EntreeProposition {
  reference: string;
  communeNom: string | null;
  envoyeLe: string;            // 'AAAA-MM-JJ' (date d'envoi de la demande initiale)
  refusTaciteLe: string;       // 'AAAA-MM-JJ' (silence d'un mois acquis)
  joursAvantForclusion: number;
  dossiersDusNums: string[];   // numéros de dossiers encore dus
  lienConfirmation: string;    // URL absolue de la page de confirmation (jeton en query)
}

function commune(nom: string | null): string {
  return nom ? ` (${nom})` : '';
}

/** Compose la proposition (toujours un message : appelée seulement pour une demande saisissable). */
export function composerProposition(e: EntreeProposition): { sujet: string; corps: string } {
  const dossiers = e.dossiersDusNums.length > 0 ? e.dossiersDusNums.join(', ') : '(aucun numéro de dossier)';
  const urgence = e.joursAvantForclusion <= 7
    ? `Il ne reste que ${e.joursAvantForclusion} jour(s) avant la forclusion : à traiter en priorité.`
    : `Il reste ${e.joursAvantForclusion} jour(s) avant la forclusion.`;

  const corps = [
    'Une demande adressée à une mairie est restée sans réponse plus d’un mois : le silence vaut refus, la saisine de la CADA est désormais possible.',
    '',
    'Demande concernée :',
    `  · référence : ${e.reference}`,
    `  · commune : ${e.communeNom ?? '(commune inconnue)'}`,
    `  · demande envoyée le : ${e.envoyeLe}`,
    `  · refus tacite acquis le : ${e.refusTaciteLe}`,
    `  · dossiers encore dus : ${dossiers}`,
    `  · ${urgence}`,
    '',
    'Pour lancer la saisine, ouvrir cette page et cliquer sur le bouton de confirmation :',
    e.lienConfirmation,
    '',
    'Le lien ne fait rien tout seul : il ouvre une page qui rappelle le dossier ; la saisine ne part qu’au clic sur le bouton.',
    'Vous pouvez aussi lancer la saisine depuis l’onglet « Saisines CADA » de l’espace d’administration — c’est le même geste.',
    '',
    'Sans Vis-à-Vis® — message interne de suivi.',
  ].join('\n');

  const sujet = `Saisir la CADA ? — ${e.reference}${commune(e.communeNom)}`;
  return { sujet, corps };
}
