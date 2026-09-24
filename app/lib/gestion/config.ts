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
  // LOT 3-quater — REPRISE après coupure réseau (migration 230). Budget GLOBAL de reconnexions pour UNE passe, et délai de
  //   base (qui CROÎT à chaque tentative). `reconnexionsMax = 0` rend exactement le comportement d'avant : arrêt propre.
  reconnexionsMax: number;
  reconnexionDelaiS: number;
  /**
   * LOT 5-DIRECT — INTERVALLE de la relève CONTINUE, en secondes (migration 238). C'est ce réglage, et lui seul, qui
   * décide en combien de temps un mail arrivé dans Gmail apparaît dans la boîte. Réglable EN BASE, sans redéploiement.
   */
  releveContinueSecondes: number;
  // LOT 4b — FENÊTRE D'ACTIVITÉ de la file (migration 232). Un échange n'apparaît dans « À classer » que si son dernier
  //   message date de moins de N jours. Ni suppression, ni masquage silencieux : l'écran annonce ce qu'il ne montre pas.
  fenetreActiviteJours: number;
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
    // LOT 3-quinquies (migration 231) — invitations de rendez-vous : une invitation est une pièce comme une autre, et la
    //   refuser laissait une ligne « type non autorisé » là où il y avait un rendez-vous.
    'text/calendar', 'application/ics',
  ],
  pieceTailleMaxOctets: 25 * 1024 * 1024,
  conservationCarteCloseMois: 60,
  reconnexionsMax: 3,
  reconnexionDelaiS: 5,
  fenetreActiviteJours: 30,
  // 60 s : un mail apparaît dans la minute, et Gmail reçoit une interrogation par minute — très en deçà de ce qu'il
  //   tolère. Descendre plus bas n'améliorerait rien de perceptible et multiplierait les connexions.
  releveContinueSecondes: 60,
};

/**
 * LOT 5-DIRECT — BORNES de l'intervalle. En dessous de 15 s on harcèle Gmail pour un gain que personne ne voit ;
 * au-delà d'une heure, ce n'est plus une relève continue et le bouton « Relever maintenant » fait mieux.
 */
export const RELEVE_CONTINUE_MIN_S = 15;
export const RELEVE_CONTINUE_MAX_S = 3600;

/** Ramène un intervalle dans ses bornes. Une valeur absente, nulle ou aberrante retombe sur le défaut. PUR. */
export function intervalleContinuValide(brut: number | null | undefined): number {
  if (typeof brut !== 'number' || !Number.isFinite(brut) || brut <= 0) return CONFIG_GESTION_DEFAUT.releveContinueSecondes;
  return Math.min(Math.max(Math.round(brut), RELEVE_CONTINUE_MIN_S), RELEVE_CONTINUE_MAX_S);
}

/** Découpe une liste stockée en une colonne texte (virgules), nettoyée et en minuscules. PUR. */
export function listeDe(brut: string | null | undefined): string[] {
  return (brut ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => x !== '');
}

interface LigneConfig {
  dossier_imap: string; adresse_gestion: string; domaines_internes: string;
  rattrapage_jours: number; plafond_par_passe: number;
  types_pieces_acceptes: string; piece_taille_max_mo: number; conservation_carte_close_mois: number;
  reconnexions_max?: number; reconnexion_delai_s?: number; // migration 230 — absentes tant qu'elle n'est pas appliquée
  fenetre_activite_jours?: number;                          // migration 232 — idem
  releve_continue_secondes?: number;                        // migration 238 — idem
}

const COLONNES_BASE = `dossier_imap, adresse_gestion, domaines_internes, rattrapage_jours, plafond_par_passe,
              types_pieces_acceptes, piece_taille_max_mo, conservation_carte_close_mois`;

/**
 * Lit la ligne de configuration. Les migrations 230 et 232 ajoutent des colonnes ; tant qu'elles ne sont PAS appliquées,
 * PostgreSQL répond « colonne inconnue » (42703). On rejoue alors la requête SANS elles, plutôt que de retomber sur TOUS les
 * défauts : une migration en attente ne doit pas faire oublier les réglages déjà en base. Toute AUTRE erreur remonte.
 *
 * ⚠️ CE REPLI-CI FONCTIONNE VRAIMENT, et ce n'est pas une évidence : il passe par `query()`, donc en AUTO-COMMIT, hors de
 * toute transaction. Le même schéma posé À L'INTÉRIEUR d'une transaction ne marche PAS — la première erreur l'aborte et le
 * repli échoue en 25P02. C'est exactement le piège qui a fait échouer une relève (cf. lot 4a, captureRepo).
 */
async function lireLigne(): Promise<LigneConfig | undefined> {
  try {
    const { rows } = await query<LigneConfig>(
      `SELECT ${COLONNES_BASE}, reconnexions_max, reconnexion_delai_s, fenetre_activite_jours, releve_continue_secondes
         FROM gestion_config WHERE id = 1`);
    return rows[0];
  } catch (e) {
    if ((e as { code?: string }).code !== '42703') throw e; // colonne inconnue = migration 230 en attente ; tout le reste remonte
    const { rows } = await query<LigneConfig>(`SELECT ${COLONNES_BASE} FROM gestion_config WHERE id = 1`);
    return rows[0];
  }
}

/** Lit la configuration. Toute erreur (table absente, base injoignable) ⇒ repli, jamais une exception qui bloquerait l'écran. */
export async function chargerConfigGestion(): Promise<ConfigGestion> {
  try {
    const r = await lireLigne();
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
      // 230 en attente ⇒ colonnes absentes ⇒ repli. `0` est une VALEUR VALIDE (aucune reprise), d'où le test sur `undefined`
      //   et non sur la véracité : `?? ` et non `||`, sans quoi couper la reprise serait impossible.
      reconnexionsMax: r.reconnexions_max ?? CONFIG_GESTION_DEFAUT.reconnexionsMax,
      reconnexionDelaiS: (r.reconnexion_delai_s ?? 0) > 0 ? r.reconnexion_delai_s! : CONFIG_GESTION_DEFAUT.reconnexionDelaiS,
      fenetreActiviteJours: (r.fenetre_activite_jours ?? 0) > 0 ? r.fenetre_activite_jours! : CONFIG_GESTION_DEFAUT.fenetreActiviteJours,
      // 238 en attente ⇒ colonne absente ⇒ 60 s. La relève continue tourne donc AVANT même que la migration soit passée.
      releveContinueSecondes: intervalleContinuValide(r.releve_continue_secondes),
    };
  } catch {
    return CONFIG_GESTION_DEFAUT; // repli sûr : le module démarre même si la migration 228 n'est pas appliquée
  }
}
