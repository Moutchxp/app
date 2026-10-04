import { RACINE_DRIVES_PARTAGES } from '../gestion/cibleDepot';

/**
 * ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 2a — OÙ LE BOUTON « DRIVE » DU BANDEAU OUVRE ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO : « un bouton “Drive” (icône Drive + libellé) qui ouvre NOTRE fenêtre Drive […] positionnée sur
 * “Drives partagés”. Même fenêtre, même code. Pas de copie. »
 *
 * 🔴 POURQUOI CES TROIS CONSTANTES VIVENT DANS UN MODULE, ET PAS DANS LE COMPOSANT. L'identifiant du regroupement
 * (`svav:drives`) est un mot À NOUS : il ne désigne aucun dossier chez Google, et il est déjà écrit — une fois —
 * dans `cibleDepot`, où la route de dépôt le REFUSE. Le réécrire ici en aurait fait une seconde source : le jour
 * où ce mot change, le bouton du bandeau ouvrirait un listing vide sans que rien ne le dise.
 *
 * ⚠️ LE LIBELLÉ EST CELUI DE LA BARRE LATÉRALE DE LA FENÊTRE, au caractère près : « Drives partagés ». Le bandeau
 * annonce donc l'endroit exact où l'on arrive, et non un synonyme.
 *
 * 🔒 PUR : une chaîne, un objet. Aucun React, aucune I/O — il est lu par un composant du navigateur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le mot du bouton. Court : il vit dans un bandeau d'une seule ligne, à côté du nom et du rôle. */
export const LIBELLE_DRIVE_BANDEAU = 'Drive';

/**
 * L'INFOBULLE, qui dit ce que le clic OUVRE — et surtout que c'est NOTRE fenêtre, pas Google. La confusion est
 * facile (l'icône est celle de Google), et elle coûterait un aller-retour inutile par le navigateur.
 */
export const AIDE_DRIVE_BANDEAU = 'Ouvrir le Drive de l’agence dans l’application, sur « Drives partagés »';

/**
 * LE POINT D'ARRIVÉE. `id` est le regroupement des Drives partagés, `nom` son libellé.
 *
 * ⚠️ CE N'EST PAS UN DOSSIER : la fenêtre l'ouvre comme sa barre latérale le fait, et « Déposer ici » y reste
 * éteint en disant pourquoi (lot RENOMMER-PARTOUT-ET-FINITIONS, point 5). C'est le comportement voulu — on arrive
 * à la racine des Drives, et l'on choisit.
 */
export const DEPART_DRIVE_BANDEAU: { id: string; nom: string } = {
  id: RACINE_DRIVES_PARTAGES,
  nom: 'Drives partagés',
};
