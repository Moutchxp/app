/**
 * MODULE « GESTION » — configuration lue au RUNTIME depuis le singleton `gestion_config` (migration 228), avec REPLI SÛR :
 * table absente, ligne manquante ou base injoignable ⇒ les valeurs par défaut ci-dessous, JAMAIS une exception. Même
 * principe que `chargerConfigVeille` / `chargerProfilDegagement`.
 *
 * 🔴 RÈGLE : aucune de ces valeurs n'est écrite en dur ailleurs. Le dossier relevé, la profondeur de rattrapage, le
 * plafond par passe, les types de pièces acceptés et leur taille se changent EN BASE, sans redéploiement.
 * Les défauts ci-dessous sont la COPIE EXACTE des DEFAULT de la migration 228 — un test le vérifie, pour que le repli
 * ne raconte jamais autre chose que la base.
 */
import { query } from '../db/client';

export interface ConfigGestion {
  dossierImap: string;
  adresseGestion: string;
  domainesInternes: string[];
  rattrapageJours: number;
  plafondParPasse: number;
  typesPiecesAcceptes: string[];
  pieceTailleMaxOctets: number;
  conservationCarteCloseMois: number;
}

/** Repli SÛR — identique aux DEFAULT de la migration 228. */
export const CONFIG_GESTION_DEFAUT: ConfigGestion = {
  dossierImap: '_GESTION BOITE MAIL',
  adresseGestion: 'gestion@criterimmo.fr',
  domainesInternes: ['criterimmo.fr', 'sansvisavis.com'],
  rattrapageJours: 90,
  plafondParPasse: 400,
  typesPiecesAcceptes: [
    'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'video/mp4',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/heic',
  ],
  pieceTailleMaxOctets: 25 * 1024 * 1024,
  conservationCarteCloseMois: 60,
};

/** Découpe une liste stockée en une colonne texte (virgules), nettoyée et en minuscules. PUR. */
export function listeDe(brut: string | null | undefined): string[] {
  return (brut ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => x !== '');
}

interface LigneConfig {
  dossier_imap: string; adresse_gestion: string; domaines_internes: string;
  rattrapage_jours: number; plafond_par_passe: number;
  types_pieces_acceptes: string; piece_taille_max_mo: number; conservation_carte_close_mois: number;
}

/** Lit la configuration. Toute erreur (table absente, base injoignable) ⇒ repli, jamais une exception qui bloquerait l'écran. */
export async function chargerConfigGestion(): Promise<ConfigGestion> {
  try {
    const { rows } = await query<LigneConfig>(
      `SELECT dossier_imap, adresse_gestion, domaines_internes, rattrapage_jours, plafond_par_passe,
              types_pieces_acceptes, piece_taille_max_mo, conservation_carte_close_mois
         FROM gestion_config WHERE id = 1`);
    const r = rows[0];
    if (!r) return CONFIG_GESTION_DEFAUT;
    return {
      dossierImap: r.dossier_imap?.trim() || CONFIG_GESTION_DEFAUT.dossierImap,
      adresseGestion: (r.adresse_gestion ?? '').trim().toLowerCase() || CONFIG_GESTION_DEFAUT.adresseGestion,
      domainesInternes: listeDe(r.domaines_internes).length > 0 ? listeDe(r.domaines_internes) : CONFIG_GESTION_DEFAUT.domainesInternes,
      rattrapageJours: r.rattrapage_jours > 0 ? r.rattrapage_jours : CONFIG_GESTION_DEFAUT.rattrapageJours,
      plafondParPasse: r.plafond_par_passe > 0 ? r.plafond_par_passe : CONFIG_GESTION_DEFAUT.plafondParPasse,
      typesPiecesAcceptes: listeDe(r.types_pieces_acceptes).length > 0 ? listeDe(r.types_pieces_acceptes) : CONFIG_GESTION_DEFAUT.typesPiecesAcceptes,
      pieceTailleMaxOctets: (r.piece_taille_max_mo > 0 ? r.piece_taille_max_mo : 25) * 1024 * 1024,
      conservationCarteCloseMois: r.conservation_carte_close_mois > 0 ? r.conservation_carte_close_mois : CONFIG_GESTION_DEFAUT.conservationCarteCloseMois,
    };
  } catch {
    return CONFIG_GESTION_DEFAUT; // repli sûr : le module démarre même si la migration 228 n'est pas appliquée
  }
}
