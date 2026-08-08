/**
 * R6c — SATISFACTION AUTOMATIQUE d'un dossier par une réponse, à HAUTE PRÉCISION SEULEMENT. Module PUR (aucune I/O).
 *
 * Un dossier n'est reconnu satisfait que si son numéro Sitadel COMPLET apparaît LITTÉRALEMENT dans un nom de pièce jointe
 * ou dans le corps texte de la réponse, après normalisation des seuls espaces et séparateurs. AUCUN rapprochement
 * approximatif, aucune heuristique de proximité, aucun rattachement par adresse ou par date : un faux positif ferait
 * CESSER de réclamer une pièce jamais reçue. En cas de doute, on NE marque pas.
 */

export interface ReponsePourSatisfaction {
  piecesNoms: string[];        // noms des fichiers joints
  corpsTexte: string | null;   // corps texte de la réponse
}

export interface DossierPourSatisfaction {
  dossierId: number;
  numDau: string;              // numéro Sitadel COMPLET du dossier
}

/** Plancher de sûreté : un vrai numéro Sitadel est long. En-dessous, on refuse de marquer (jamais un rapprochement douteux). */
const LONGUEUR_MIN_NUM = 6;

/** Supprime espaces et séparateurs usuels et met en majuscules — normalisation EXACTE, pas de rapprochement flou. */
function normaliser(s: string): string {
  return s.toUpperCase().replace(/[\s.\-/_]/g, '');
}

/**
 * Renvoie les `dossierId` dont le numéro Sitadel complet apparaît LITTÉRALEMENT (après normalisation) dans un nom de pièce
 * jointe ou dans le corps de la réponse. Un numéro tronqué/partiel ne satisfait rien. Liste vide si aucune correspondance.
 */
export function dossiersSatisfaits(reponse: ReponsePourSatisfaction, dossiers: DossierPourSatisfaction[]): number[] {
  const foin = normaliser([...reponse.piecesNoms, reponse.corpsTexte ?? ''].join('\n'));
  const satisfaits: number[] = [];
  for (const d of dossiers) {
    const num = normaliser(d.numDau);
    if (num.length < LONGUEUR_MIN_NUM) continue; // trop court pour être un rapprochement sûr → on ne marque pas
    if (foin.includes(num)) satisfaits.push(d.dossierId);
  }
  return satisfaits;
}
