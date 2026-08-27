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
  // N6-D — sources ADDITIVES (optionnelles) : un appelant qui ne les fournit PAS obtient un résultat STRICTEMENT inchangé.
  objet?: string | null;       // objet du mail (Gmail y colle les noms de fichiers ; un correspondant y met souvent la référence)
  corpsHtml?: string | null;   // corps HTML : on en extrait le TEXTE seul (jamais les balises ni les attributs)
}

export interface DossierPourSatisfaction {
  dossierId: number;
  numDau: string;              // numéro Sitadel COMPLET du dossier
}

/** Plancher de sûreté : un vrai numéro Sitadel est long. En-dessous, on refuse de marquer (jamais un rapprochement douteux). */
const LONGUEUR_MIN_NUM = 6;

/**
 * Supprime espaces et séparateurs usuels et met en MAJUSCULES — normalisation EXACTE, pas de rapprochement flou.
 * SOURCE UNIQUE de la normalisation d'un numéro de dossier Sitadel : elle GARDE les lettres — préfixe de type (« PC »)
 * ET lettre INTERNE du format Paris (« …V0006 ») — seuls les séparateurs tombent. Le rattachement (rattachementReponse),
 * la relève (releveReponses) et l'appariement des dépôts (propositionDepot) l'appliquent des DEUX côtés (candidat ET texte)
 * pour que la comparaison soit symétrique : un « chiffres seuls » côté candidat contre un « garde-lettres » côté texte
 * manquait TOUT numéro à lettre interne (l'accusé Paris « PC07512025V0006 » ne rattachait rien alors qu'il cite le permis).
 */
export function normaliserNumeroDossier(s: string): string {
  return s.toUpperCase().replace(/[\s.\-/_]/g, '');
}

/**
 * N6-D — extrait le TEXTE d'un corps HTML : retire les balises (et donc leurs attributs — on ne cherche JAMAIS un numéro dans un
 * `href`), décode quelques entités usuelles. Pas une seconde normalisation : `normaliser` reste seul juge du rapprochement.
 */
function texteDepuisHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')                 // balises + attributs retirés → seuls les nœuds de texte subsistent
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#0*39;|&apos;/gi, "'");
}

/**
 * Renvoie les `dossierId` dont le numéro Sitadel complet apparaît LITTÉRALEMENT (après normalisation) dans un nom de pièce
 * jointe, le corps texte, l'OBJET (N6-D) ou le TEXTE du corps HTML (N6-D). Un numéro tronqué/partiel ne satisfait rien. Liste
 * vide si aucune correspondance. Élargir les sources augmente le risque d'ambiguïté : c'est l'appelant (règle « ≥ 2 numéros
 * distincts → on ne verse rien ») qui l'absorbe, jamais ce module.
 */
export function dossiersSatisfaits(reponse: ReponsePourSatisfaction, dossiers: DossierPourSatisfaction[]): number[] {
  const foin = normaliserNumeroDossier([
    ...reponse.piecesNoms,
    reponse.corpsTexte ?? '',
    reponse.objet ?? '',                       // additif : absent chez les appelants historiques → chaîne vide, foin inchangé
    texteDepuisHtml(reponse.corpsHtml),        // additif : texte du HTML seul (jamais les balises)
  ].join('\n'));
  const satisfaits: number[] = [];
  for (const d of dossiers) {
    const num = normaliserNumeroDossier(d.numDau);
    if (num.length < LONGUEUR_MIN_NUM) continue; // trop court pour être un rapprochement sûr → on ne marque pas
    if (foin.includes(num)) satisfaits.push(d.dossierId);
  }
  return satisfaits;
}
