import 'server-only';
/**
 * Module INTERNAUTE — LOT 3 : ACCÈS BASE de l'exploitation interne (serveur only).
 *
 * Utilise le pool applicatif `app/lib/db/client.ts` (JAMAIS `poolAnalytics`). AUCUN import `app/lib/analytics/*`
 * ni moteur → cloisonnement M2 respecté. Lecture SEULE des colonnes déjà persistées (LOT 2) — le moteur n'est
 * jamais rappelé (golden intact). La seule écriture est le JOURNAL d'accountability (`internaute_extraction_log`).
 *
 * ⚠️ INVARIANT STRUCTUREL (raison d'être de la vue du LOT 1) : toute lecture exploitable contraint sur
 * `internaute_consentement_actif` par l'INTERSECTION des statuts cochés (un `EXISTS(finalité active)` par statut, en
 * AND ; `opposition_recontact=false` ssi F1 ∈ statuts). Un profil sans TOUS les statuts cochés actifs N'APPARAÎT
 * JAMAIS ; une sélection VIDE ne renvoie RIEN (fail-closed). Cet invariant est construit par `clauseStatuts`
 * (extraction.ts, pur & testable), partagé par le comptage, la liste et l'export.
 */
import { query } from '../db/client';
import { construireFiltres, clauseStatuts, exprConsentiLe, normaliserStatuts, ordreListe, FINALITE_F1, versCsv, versCsvPreuveDesabo, type FiltresExtraction, type LigneProfil, type LignePreuveDesabo } from './extraction';
import type { CleFinalite } from './textesConsentement';

// L'invariant de consentement (FROM/WHERE, INTERSECTION de statuts) est construit par `clauseStatuts` (extraction.ts,
// pur & testable) ; ici on ne fait que l'EXÉCUTER. GARDE FAIL-CLOSED : une sélection de statuts VIDE renvoie un
// résultat vide SANS émettre de requête (jamais toute la base). `consenti_le` = `exprConsentiLe(statuts)`.

function clauseWhere(clauses: string[]): string {
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

/**
 * FRONTIÈRE DE DONNÉES : le driver `pg` renvoie les colonnes `numeric` (ici `internaute_projet.score`) SOUS FORME
 * DE CHAÎNE. On coerce `score` en `number` ICI, une seule fois, pour que le runtime honore le type `LigneProfil`
 * (le JSX peut alors faire confiance au type — `l.score.toFixed()` etc. sans planter). `lat`/`lon` ne sont PAS
 * concernés (colonnes `double precision` → déjà des nombres). Coercition d'affichage : n'altère aucun calcul de
 * score autoritatif (le moteur reste la seule source du score ; ici on relit une copie déjà persistée).
 */
function coercerLigne(r: LigneProfil): LigneProfil {
  return { ...r, score: r.score == null ? null : Number(r.score) };
}

/** Page de profils = INTERSECTION des statuts cochés (tous actifs) ∩ filtres, + total. Lecture seule.
 *  GARDE FAIL-CLOSED : `statuts` vide (après normalisation) → `{ total: 0, lignes: [] }` SANS requête (jamais toute la base). */
export async function lireProfilsFiltres(
  filtres: FiltresExtraction,
  page: number,
  taille: number,
  statuts: readonly CleFinalite[],
): Promise<{ total: number; lignes: LigneProfil[] }> {
  if (normaliserStatuts(statuts).length === 0) return { total: 0, lignes: [] };
  const { clauses, params } = construireFiltres(filtres);
  const where = clauseWhere(clauses);
  const from = clauseStatuts(statuts);
  const consenti = exprConsentiLe(statuts);

  const total = await query<{ n: string }>(`SELECT count(*)::text AS n ${from}${where}`, params);

  const offset = Math.max(0, (page - 1) * taille);
  const lignes = await query<LigneProfil>(
    `SELECT i.id, i.prenom, i.nom, i.email, i.telephone, i.cree_a,
            p.verdict, p.score, p.commune_insee, p.dernier_etage, p.residence_principale,
            ${consenti} AS consenti_le,
            -- Capsule « Compte / One-shot » : titulaire d'un credential ? Axe DIFFÉRENT du consentement (F1/F2/F3).
            -- Colonne ajoutée SANS toucher le FROM/WHERE (intersection des statuts) ni la vue internaute_commercial.
            EXISTS (SELECT 1 FROM internaute_auth ia WHERE ia.internaute_id = i.id) AS a_un_compte
     ${from}${where}
     ${ordreListe(filtres)}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, taille, offset],
  );
  return { total: Number(total.rows[0]?.n ?? 0), lignes: lignes.rows.map(coercerLigne) };
}

/** Toutes les lignes de l'INTERSECTION des statuts ∩ filtres (sans pagination), pour l'export CSV. Fail-closed si vide. */
export async function lireProfilsExport(filtres: FiltresExtraction, statuts: readonly CleFinalite[]): Promise<LigneProfil[]> {
  if (normaliserStatuts(statuts).length === 0) return [];
  const { clauses, params } = construireFiltres(filtres);
  const r = await query<LigneProfil>(
    `SELECT i.id, i.prenom, i.nom, i.email, i.telephone, i.cree_a,
            p.verdict, p.score, p.commune_insee, p.dernier_etage, p.residence_principale,
            ${exprConsentiLe(statuts)} AS consenti_le
     ${clauseStatuts(statuts)}${clauseWhere(clauses)}
     ${ordreListe(filtres)}`,
    params,
  );
  return r.rows.map(coercerLigne);
}

/**
 * COMPTE des profils de l'INTERSECTION des statuts ∩ filtres — pour le compteur LIVE « == ce que l'export sortira ».
 * Réutilise EXACTEMENT les MÊMES builders que la liste/l'export (`clauseStatuts` + `construireFiltres`) → le nombre
 * renvoyé est identique à ce que `lireProfilsExport(filtres, statuts)` produirait (mêmes FROM/WHERE, mêmes params).
 * GARDE FAIL-CLOSED (même patron que les 3 lectures) : `statuts` vide (après normalisation) → `0` SANS requête ;
 * défense en profondeur = le `WHERE false` de `clauseStatuts([])`. JAMAIS `FROM internaute` brut — la base commerciale
 * est la VUE `internaute_commercial` (migration 044), qui exclut PAR CONSTRUCTION tout internaute sans consentement actif. Lecture seule.
 */
export async function compterProfils(filtres: FiltresExtraction, statuts: readonly CleFinalite[]): Promise<number> {
  if (normaliserStatuts(statuts).length === 0) return 0; // fail-closed : aucune requête sans contrainte de finalité
  const { clauses, params } = construireFiltres(filtres);
  const r = await query<{ n: string }>(
    `SELECT count(*)::text AS n ${clauseStatuts(statuts)}${clauseWhere(clauses)}`,
    params,
  );
  return Number(r.rows[0]?.n ?? 0);
}

/**
 * Bornes de dates de création de la base COMMERCIALE, pour le bouton « depuis toujours » : MIN/MAX `cree_a` sur la VUE
 * `internaute_commercial` (migration 044) — qui exclut DÉJÀ les effacés ET les internautes sans consentement actif. Cohérent
 * avec la liste (qui n'affiche que des consentants) : un destinataire de PDF n'étire jamais la plage de dates commerciale.
 * `to_char` → 'YYYY-MM-DD' directement consommable par un `<input type="date">`. Base vide → `{ null, null }`. Lecture seule.
 */
export async function lireBornesDates(): Promise<{ min: string | null; max: string | null }> {
  const r = await query<{ min: string | null; max: string | null }>(
    `SELECT to_char(min(cree_a), 'YYYY-MM-DD') AS min, to_char(max(cree_a), 'YYYY-MM-DD') AS max
     FROM internaute_commercial`,
  );
  return { min: r.rows[0]?.min ?? null, max: r.rows[0]?.max ?? null };
}

/** Libellés des départements IDF (référence STATIQUE, pas une liste d'existence : la liste RÉELLE est requêtée à
 *  chaud). Un département hors carte → son code est affiché tel quel (`deptNom = dept`). */
const DEPT_NOM: Record<string, string> = {
  '75': 'Paris', '77': 'Seine-et-Marne', '78': 'Yvelines', '91': 'Essonne',
  '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': "Val-d'Oise",
};

/**
 * Communes RÉELLEMENT présentes chez les consentants de l'ENSEMBLE de statuts (extraction commerciale nominative —
 * PAS de k-anonymat ici). DYNAMIQUE : `SELECT DISTINCT p.commune_insee` sur l'intersection (`clauseStatuts`), joint à
 * `adresse_ban` (référentiel géo public BAN/IGN) pour le NOM — lu DIRECTEMENT via `db/client`, JAMAIS via
 * `app/lib/analytics/*` (cloisonnement M2). Défaut `[FINALITE_F1]` (le picker géo interroge F1, comportement
 * historique ; le câbler sur les statuts cochés est un affinage ultérieur). `statuts` vide → `WHERE false` → aucune
 * commune. Aucune liste en dur ; nom absent → INSEE. Département = 2 premiers car. (IDF) ; libellé via `DEPT_NOM`.
 */
export async function lireCommunesPresentes(statuts: readonly CleFinalite[] = [FINALITE_F1]): Promise<{ insee: string; nom: string; dept: string; deptNom: string }[]> {
  if (normaliserStatuts(statuts).length === 0) return []; // fail-closed explicite (cohérent avec les 3 lectures), doublé du `WHERE false`
  const r = await query<{ insee: string; nom: string | null }>(
    `SELECT c.insee AS insee, MAX(a.nom_commune) AS nom
       FROM (SELECT DISTINCT p.commune_insee AS insee ${clauseStatuts(statuts)} AND p.commune_insee IS NOT NULL) c
       LEFT JOIN adresse_ban a ON a.insee_commune = c.insee
      GROUP BY c.insee
      ORDER BY 1`,
  );
  return r.rows.map((row) => {
    const dept = row.insee.slice(0, 2);
    return { insee: row.insee, nom: row.nom ?? row.insee, dept, deptNom: DEPT_NOM[dept] ?? dept };
  });
}

export { versCsv, versCsvPreuveDesabo };

/**
 * DOSSIER DE PREUVE DES DÉSABONNEMENTS (accountability RGPD). Toutes les décisions BRUTES de `internaute_consentement`
 * (PAS la vue `_actif` : on veut TOUT l'historique) des personnes ayant AU MOINS une ligne 'retire' → la LIGNE DE VIE
 * complète (accord → retrait → ré-accord), jamais un état figé, jamais lisible comme une liste noire. INDÉPENDANT des
 * filtres/statuts commerciaux. Lecture SEULE. Tri déterministe : internaute_id, horodatage, id (chronologie par personne).
 *
 * - `LEFT JOIN internaute` : identité VIDE pour un effacé (PII NULLifiées) — c'est la PREUVE que l'effacement fonctionne.
 * - `LEFT JOIN texte` : `texte_id` est NULLABLE (023) → un INNER JOIN masquerait une décision → on garde la ligne, texte vide.
 * - `LEFT JOIN journal` : une ligne 'retire' SANS entrée de journal sort quand même, colonnes journal vides (un fait, pas une erreur).
 */
export async function lirePreuvesDesabonnement(): Promise<LignePreuveDesabo[]> {
  const r = await query<LignePreuveDesabo>(
    `SELECT ic.internaute_id,
            i.prenom, i.nom, i.email, i.efface_a::text AS efface_a,
            ic.finalite, ic.etat, ic.horodatage::text AS horodatage, ic.canal,
            t.version AS texte_version, t.contenu AS texte_contenu,
            j.details->>'a_la_demande_de' AS a_la_demande_de,
            j.utilisateur_id              AS admin_auteur_id,
            j.details->>'motif'           AS motif
       FROM internaute_consentement ic
       LEFT JOIN internaute i                    ON i.id = ic.internaute_id
       LEFT JOIN internaute_consentement_texte t ON t.id = ic.texte_id
       -- ATTENTION — JOINTURE JOURNAL PAR ÉGALITÉ DE TIMESTAMP (j.ts = ic.horodatage) : il n'existe AUCUNE clé partagée
       --    entre journal et preuve. Cette égalité tient UNIQUEMENT parce que retirerConsentement (cycleVie.ts) écrit la
       --    ligne 'retire' ET l'entrée de journal DANS LA MÊME TRANSACTION, où DEFAULT now() = l'instant de transaction
       --    (identique pour les deux colonnes). Ce n'est PAS une contrainte : un refactor scindant ces deux écritures en
       --    transactions distinctes casserait cette jointure SILENCIEUSEMENT (colonnes journal vides).
       LEFT JOIN internaute_cycle_vie_log j
              ON j.action = 'retrait_consentement'
             AND j.cible_internaute_id = ic.internaute_id
             AND j.details->>'finalite' = ic.finalite
             AND j.ts = ic.horodatage
      WHERE ic.internaute_id IN (SELECT internaute_id FROM internaute_consentement WHERE etat = 'retire')
      ORDER BY ic.internaute_id, ic.horodatage, ic.id`,
  );
  return r.rows;
}

/** Dossier complet d'UNE personne (droit d'accès). Renvoie null si l'id n'existe pas. */
export async function lireProfilComplet(id: string): Promise<{
  internaute: Record<string, unknown>;
  projets: Record<string, unknown>[];
  consentements: Record<string, unknown>[];
} | null> {
  const pers = await query(
    `SELECT id, prenom, nom, email, telephone, source_collecte, opposition_recontact, parcours, cree_a, maj_a, efface_a,
            EXISTS (SELECT 1 FROM internaute_auth ia WHERE ia.internaute_id = internaute.id) AS a_un_compte
     FROM internaute WHERE id = $1`,
    [id],
  );
  if (pers.rows.length === 0) return null;

  // Statut RÉEL de l'envoi du certificat = `certificat_acheminement` (source de vérité), relié par `certificat.projet_id`.
  // LEFT JOIN OBLIGATOIRE : un projet peut n'avoir AUCUN certificat (verdict VIS_A_VIS → émission refusée) — pas une
  // anomalie. Un projet a au plus 1 certificat (034) et 1 acheminement (037) → aucun risque de multiplication de lignes.
  const projets = await query(
    `SELECT ip.id, ip.version_tunnel, ip.payload, ip.verdict, ip.score, ip.etage, ip.dernier_etage, ip.residence_principale,
            ip.commune_insee, ip.lat, ip.lon, ip.adresse_saisie, ip.adresse_normalisee, ip.cree_a,
            ip.azimut_deg, ip.hauteur_sous_plafond_m, ip.hauteur_vision_m,
            c.numero AS certificat_numero, a.statut AS acheminement_statut, a.envoye_le AS acheminement_envoye_le
     FROM internaute_projet ip
     LEFT JOIN certificat c ON c.projet_id = ip.id
     LEFT JOIN certificat_acheminement a ON a.certificat_id = c.id
     WHERE ip.internaute_id = $1 ORDER BY ip.cree_a DESC`,
    [id],
  );

  // État de consentement PAR finalité (vue actif) + libellé. Montre à quoi la personne a consenti et depuis quand.
  const consentements = await query(
    `SELECT f.cle AS finalite, f.libelle, ca.etat, ca.actif, ca.horodatage AS depuis
     FROM internaute_finalite f
     LEFT JOIN internaute_consentement_actif ca ON ca.finalite = f.cle AND ca.internaute_id = $1
     ORDER BY f.ordre`,
    [id],
  );

  return { internaute: pers.rows[0], projets: projets.rows, consentements: consentements.rows };
}

/** Journalise une action d'exploitation (accountability). Append-only. `auteurId` = admin (null = voie de secours). */
export async function journaliserExtraction(
  auteurId: number | null,
  action: 'export_csv' | 'acces_profil' | 'export_preuve_desabo',
  details: { filtres?: FiltresExtraction; nbLignes?: number; cibleInternauteId?: string; statuts?: string },
): Promise<void> {
  // Les STATUTS d'export (quelle intersection de consentements) sont tracés DANS le blob jsonb `filtres` (aucune
  // colonne dédiée → aucune migration) : l'audit distingue ainsi un export {F1} d'un export {F1,F2}. `filtres`/`statuts`
  // absents → NULL (comportement inchangé pour `acces_profil`, qui n'en passe aucun).
  const blob =
    details.filtres || details.statuts
      ? JSON.stringify({ ...(details.filtres ?? {}), ...(details.statuts ? { statuts: details.statuts } : {}) })
      : null;
  await query(
    `INSERT INTO internaute_extraction_log (utilisateur_id, action, cible_internaute_id, filtres, nb_lignes)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [
      auteurId,
      action,
      details.cibleInternauteId ?? null,
      blob,
      details.nbLignes ?? null,
    ],
  );
}
