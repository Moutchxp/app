/**
 * CR-2a — HELPERS PURS de la CARTOUCHE de compte rendu du Cerfa. Aucune I/O, aucun React : traduisent l'état interne (origine +
 * méthode du journal, scission généré/humain) en libellés LISIBLES par un non-développeur, et détectent la divergence R+N.
 * Module client-safe (que des types importés d'ailleurs). Testé en node pur.
 */
import type { ScissionDescription } from '../../../../lib/permis/descriptionScission';

/** Une pièce Cerfa ayant servi au compte rendu : nom, nombre de pages (null si illisible), id pour le lien GED signé. */
export interface PieceCerfa { id: number; nom: string; pages: number | null }

/** Provenance LISIBLE d'une ligne (jamais un nom de méthode interne brut). */
export type Provenance = 'lidar' | 'plans_coupes' | 'cerfa' | 'petitionnaire' | 'teleservice' | 'saisie' | 'sitadel' | 'pieces';

/** Libellé affiché d'une provenance — vocabulaire arbitré par le porteur. */
export function libelleProvenance(p: Provenance): string {
  switch (p) {
    case 'lidar': return 'mesure LiDAR';
    case 'plans_coupes': return 'plans et coupes';
    case 'cerfa': return 'déclaré au Cerfa';
    case 'petitionnaire': return 'déclaration du pétitionnaire';
    case 'teleservice': return 'généré par le téléservice';
    case 'saisie': return 'saisi à la main';
    case 'sitadel': return 'registre Sitadel';
    case 'pieces': return 'lu dans les pièces';
  }
}

/**
 * Provenance d'une valeur de champ, d'après son ORIGINE (saisie / extraite / null) et la MÉTHODE gagnante du journal. `null` si la
 * valeur n'a PAS d'origine (champ vide non instruit — l'appelant en tire l'état « pas encore instruit »).
 */
export function provenanceChamp(origine: 'saisie' | 'extraite' | null, methode: string | null | undefined): Provenance | null {
  if (origine === 'saisie') return 'saisie';
  if (origine !== 'extraite') return null;
  switch (methode) {
    case 'cerfa': case 'recap': return 'cerfa';           // le formulaire / son champ libre structuré
    case 'enonce': case 'plan': return 'plans_coupes';    // tableaux de niveaux / cote positionnelle
    case 'teleservice': return 'teleservice';             // phrase générée par la mairie
    case 'lidar': return 'lidar';
    default: return 'pieces';                             // ia / motifs / inconnue → lu dans une pièce
  }
}

/**
 * État d'une ligne du compte rendu — TROIS cas à ne jamais confondre :
 *  - `connu`        : une valeur, avec sa provenance ;
 *  - `non_declare`  : l'information n'est pas dans ce Cerfa (on le DIT, pas de tiret muet) ;
 *  - `non_instruit` : la donnée pourrait exister mais rien ne l'a encore produite.
 */
export type EtatLigne =
  | { statut: 'connu'; provenance: Provenance }
  | { statut: 'non_declare' }
  | { statut: 'non_instruit' };

export const LIBELLE_NON_DECLARE = 'non déclaré dans ce Cerfa';
export const LIBELLE_NON_INSTRUIT = 'pas encore instruit';

/**
 * Message d'échec du chargement de la cartouche (et des liens de pièces). PIÈGE DU 401 (dette du dépôt) : une session expirée ne doit
 * JAMAIS dire « indisponible » ni « erreur », mais inviter à se reconnecter. 403 (compte révoqué) = même invite. Tout le reste = retry.
 */
export function messageErreurCartouche(status: number): string {
  if (status === 401 || status === 403) return 'Session expirée, reconnectez-vous.';
  return 'Compte rendu non chargé — rouvrez la section pour réessayer.';
}

/**
 * État d'un champ à partir de sa valeur, son origine, sa méthode, et un drapeau `absentDuCerfa` (l'information n'est structurellement
 * pas dans ce formulaire — ex. la date d'obtention, ou un champ listé dans `absents` du récap). Valeur connue → `connu` ; sinon
 * `non_declare` si `absentDuCerfa`, sinon `non_instruit`.
 */
export function etatChamp(
  valeurConnue: boolean, origine: 'saisie' | 'extraite' | null, methode: string | null | undefined, absentDuCerfa = false,
): EtatLigne {
  if (valeurConnue) {
    const p = provenanceChamp(origine, methode);
    return { statut: 'connu', provenance: p ?? 'pieces' };
  }
  return absentDuCerfa ? { statut: 'non_declare' } : { statut: 'non_instruit' };
}

/**
 * DIVERGENCE R+N entre la phrase GÉNÉRÉE (téléservice) et la déclaration HUMAINE. Cas réel 470 : généré « R+4 », humain « allant
 * jusqu'au R+5 ». La déclaration humaine PRIME sur le téléservice (précédence) → `retenu` = valeur humaine. `null` si pas de conflit
 * lisible (pas de part générée, pas de R+N dans l'humain, ou valeurs égales). On ne DEVINE pas : il faut un « R+N » explicite.
 */
export function divergenceNiveauxHorsSol(scission: ScissionDescription): { genere: number; humain: number; retenu: number } | null {
  const genere = scission.valeurs?.niveauxHorsSol ?? null;
  if (genere == null || !scission.humain) return null;
  const m = /R\s*\+\s*(\d+)/i.exec(scission.humain);
  if (!m) return null;
  const humain = Number(m[1]);
  if (!Number.isFinite(humain) || humain === genere) return null;
  return { genere, humain, retenu: humain }; // déclaration humaine > téléservice
}
