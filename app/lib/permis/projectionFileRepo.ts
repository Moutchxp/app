/**
 * PROJ-2c / GED-1 — FILE « Projection » (adaptateur impur). Univers = permis dont les DOCUMENTS sont RÉELLEMENT en GED
 * (`EXISTS dossier_document` — le seul signal « obtenu », posé par le versement N1 par e-mail, cf. depotManuel), ET dont la nature
 * CRÉE/ÉTEND une emprise (neuve/extension ; surélévation exclue), et qui n'ont PAS encore de projection validée (permis_projection).
 * 🔴 GED-1 (décision porteur) : le déclencheur d'entrée n'est PLUS `demande_dossier.satisfait_le` (« marqué reçu » — posé aussi par
 *   l'auto-satisfaction de la relève, SANS document réel : un permis y entrait à tort « la mairie a répondu »). C'est désormais
 *   « les documents sont dans la GED ». EXCLUSIVITÉ des onglets : tant que la GED est vide, le permis reste dans « Réponses »
 *   (lien à télécharger) et N'EST PAS dans « Analyse » ; il y entre dès que le versement e-mail (N1) y dépose les pièces.
 * VALIDER = quitte la file + marque suivi (permis_rattachement en_attente_bati).
 *
 * 🔴 GARDE INCHANGÉE : une emprise reste une RECONSTITUTION. Ce module ne touche NI batiment, NI permis_polygone_altitude, NI le
 * verdict. Il lit permis_corps_batiment / permis_emprise_reconstruite / permis_projection_ignoree, écrit permis_projection et — pour
 * le marquage suivi — UNE ligne permis_rattachement (en_attente_bati) + son événement, exactement comme l'ouverture manuelle (M5).
 */
import { query, withTransaction } from '../db/client';
import { classer, type DossierClassable } from '../sitadel/priorite';
import type { ConfigVeille } from '../sitadel/veilleConfig';
import { listerEmprises, listerIgnorees } from './empriseReconstruiteRepo';
import { verdictProjectionBatiments } from './projectionBatiments';
import { lireDossiersEnTest } from './testAnalyseRepo'; // LOT 51 — porte FIX-2 ouverte pour un dossier « testé en analyse » (sans lever le partiel)

export interface LigneProjection {
  dossierId: number;
  numDau: string;
  communeNom: string | null;
  natureLibelle: string;   // classer(...).libelle (neuve / extension / immeuble neuf)
  nbBatiments: number;     // permis_corps_batiment du permis (à tracer ou ignorer)
  satisfaitLe: string | null;
  nbCorpsSansAltitude: number;  // RATT-1 — bâtiments déclarés sans altitude de sommet (permis_corps_batiment.altitude_sommet_ngf NULL) → titre « Caractéristiques »
  projectionValidee: boolean;   // RATT-1 — la file EXCLUT par construction les projections validées (jalon NOT EXISTS permis_projection) → TOUJOURS false ici ; champ exposé pour un titre de famille générique et honnête
  testeEnAnalyse: boolean;      // LOT 51 — le dossier est présent en Analyse via le marqueur « testé » (partiel actif tenu ouvert) → l'UI propose « Remettre dans En cours » ; false pour un dossier arrivé normalement
}

// Prédicat SQL de nature CONCERNÉE (miroir EXACT de concerneProjectionEmprise : immeuble neuf/construction neuve = nature '1',
// extension = i_extension OU nature '3'/'5'). Surélévation SEULE (i_surelevation sans neuve ni extension) → exclue.
const CONCERNE_SQL = `(s.nature_projet_completee = '1' OR s.i_extension OR s.nature_projet_completee IN ('3','5'))`;

/** Table absente (149/150/151 pas encore appliquées) ? Détection par code Postgres 42P01. */
function estTableAbsente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42P01';
}

/** Colonne absente (migration 177 « dossier partiel » pas encore appliquée : partiel_le/partiel_leve_le) ? Code Postgres 42703. */
function estColonneAbsente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703';
}

async function requeteFile(cfg: ConfigVeille, avecJalon: boolean, avecPartiel: boolean, testIds: number[]): Promise<LigneProjection[]> {
  const jalon = avecJalon ? `AND NOT EXISTS (SELECT 1 FROM permis_projection pp WHERE pp.dossier_id = s.id)` : '';
  // FIX-2 — EXCLUSIVITÉ des univers d'onglets : un dossier dont la demande porte un marqueur « dossier partiel » ACTIF (réclamation
  //   de pièces EN COURS) N'EST PAS prêt à être analysé/projeté → il QUITTE « Analyse » et vit dans « En cours » (symétrique de
  //   estVivanteEnCours, MÊME signal `partiel_le actif`). Il y revient TOUT SEUL à la levée auto du marqueur (evaluerLeveeAutoPartiel,
  //   dossier redevenu complet) : la règle « pièces jointes reçues → GED → Analyse » reste vraie tant qu'aucun partiel n'est actif.
  // LOT 51 — PORTE : un dossier « testé en analyse » (marqueur `dossier_test_analyse`, s.id ∈ $1) OUVRE la porte MALGRÉ un partiel actif,
  //   SANS lever le partiel (les relances continuent). `testIds` vide → `= ANY('{}')` faux → FIX-2 strictement inchangé (comportement d'avant).
  const partiel = avecPartiel
    ? `AND (NOT EXISTS (SELECT 1 FROM demande_dossier ddp JOIN demande dmp ON dmp.id = ddp.demande_id
                        WHERE ddp.dossier_id = s.id AND ddp.actif AND dmp.partiel_le IS NOT NULL AND dmp.partiel_leve_le IS NULL)
           OR s.id = ANY($1))`
    : '';
  const { rows } = await query<{
    dossier_id: number; num_dau: string; commune_nom: string | null; type: 'PC' | 'PD';
    nature_projet_completee: string | null; i_extension: boolean | null; i_surelevation: boolean | null;
    nb_lgt_tot_crees: number | null; surf_creee: string | number | null; nb_batiments: number; satisfait_le: string | null;
    nb_corps_sans_altitude: number;
  }>(
    `SELECT s.id::int AS dossier_id, s.num_dau, c.nom AS commune_nom, s.type,
            s.nature_projet_completee, s.i_extension, s.i_surelevation, s.nb_lgt_tot_crees, s.surf_creee,
            (SELECT count(*) FROM permis_corps_batiment b WHERE b.dossier_id = s.id)::int AS nb_batiments,
            (SELECT count(*) FROM permis_corps_batiment b WHERE b.dossier_id = s.id AND b.altitude_sommet_ngf IS NULL)::int AS nb_corps_sans_altitude,
            max(dd.satisfait_le)::date::text AS satisfait_le
       FROM demande_dossier dd
       JOIN sitadel_dossier s ON s.id = dd.dossier_id
       LEFT JOIN commune c ON c.code_insee = s.code_insee
      WHERE EXISTS (SELECT 1 FROM dossier_document doc WHERE doc.dossier_id = s.id) AND ${CONCERNE_SQL} ${jalon} ${partiel}
      GROUP BY s.id, s.num_dau, c.nom, s.type, s.nature_projet_completee, s.i_extension, s.i_surelevation, s.nb_lgt_tot_crees, s.surf_creee
      ORDER BY max(dd.satisfait_le) DESC, s.num_dau`,
    avecPartiel ? [testIds] : [], // $1 = marqueurs « testé » ; référencé UNIQUEMENT dans la clause partiel (sinon aucun paramètre lié)
  );
  const testSet = new Set(testIds);
  return rows.map((r) => {
    const d: DossierClassable = { type: r.type, natureProjetCompletee: r.nature_projet_completee, iExtension: r.i_extension, iSurelevation: r.i_surelevation, nbLgtTotCrees: r.nb_lgt_tot_crees, surfCreee: r.surf_creee === null ? null : Number(r.surf_creee) };
    return { dossierId: r.dossier_id, numDau: r.num_dau, communeNom: r.commune_nom, natureLibelle: classer(d, cfg).libelle, nbBatiments: r.nb_batiments, satisfaitLe: r.satisfait_le,
      nbCorpsSansAltitude: Number(r.nb_corps_sans_altitude ?? 0), projectionValidee: false, // RATT-1 — false par construction (jalon d'exclusion des validées)
      testeEnAnalyse: testSet.has(r.dossier_id) }; // LOT 51 — présent via le marqueur « testé » ⇒ l'UI propose le retour
  });
}

/** File « Projection » : permis éligibles NON encore validés. Résilience INDÉPENDANTE à deux migrations : permis_projection (151 →
 *  jalon d'exclusion des validées) et partiel_* (177 → exclusion FIX-2 des dossiers en réclamation). Table absente (42P01) → sans
 *  jalon ; colonne absente (42703) → sans l'exclusion partiel ; comportement historique préservé si l'une manque, les deux présentes en prod. */
export async function listerFileProjection(cfg: ConfigVeille): Promise<LigneProjection[]> {
  // LOT 51 — marqueurs « testé en analyse » lus À PART et RÉSILIENTS (189 absente → ∅ → porte FIX-2 jamais ouverte, comportement d'avant).
  const testIds = await lireDossiersEnTest();
  try { return await requeteFile(cfg, true, true, testIds); }
  catch (e) {
    if (estColonneAbsente(e)) { // 177 absente → sans l'exclusion partiel (en re-gérant l'absence éventuelle de 151)
      try { return await requeteFile(cfg, true, false, testIds); }
      catch (e2) { if (estTableAbsente(e2)) return requeteFile(cfg, false, false, testIds); throw e2; }
    }
    if (estTableAbsente(e)) { // 151 absente → sans jalon (en re-gérant l'absence éventuelle de 177)
      try { return await requeteFile(cfg, false, true, testIds); }
      catch (e2) { if (estColonneAbsente(e2)) return requeteFile(cfg, false, false, testIds); throw e2; }
    }
    throw e;
  }
}

/** Compteur de la file (pastille). Même critère que la liste. `0` si les tables amont manquent. */
export async function compterFileProjection(cfg: ConfigVeille): Promise<number> {
  try { return (await listerFileProjection(cfg)).length; }
  catch { return 0; }
}

export type ResultatValidationProjection =
  | { ok: true; marqueSuivi: boolean }
  | { ok: false; motif: string };

/**
 * VALIDER la projection d'un dossier. 🔴 Condition VÉRIFIÉE CÔTÉ SERVEUR (jamais la confiance au client) : chaque bâtiment a une
 * emprise tracée OU une projection ignorée (verdictProjectionBatiments). Si OK : jalon permis_projection + marquage suivi
 * (permis_rattachement en_attente_bati, idempotent via UNIQUE(dossier_id)) + événement. Sinon : refus explicite.
 */
export async function validerProjection(dossierId: number, par: string | null): Promise<ResultatValidationProjection> {
  if (!Number.isInteger(dossierId) || dossierId <= 0) return { ok: false, motif: 'dossier invalide' };
  // Bâtiments déclarés + emprises + projections ignorées → verdict (pur).
  const [{ rows: bats }, emprises, ignores] = await Promise.all([
    query<{ id: number; repere: string | null }>(`SELECT id::int AS id, repere FROM permis_corps_batiment WHERE dossier_id = $1`, [dossierId]),
    listerEmprises(dossierId),
    listerIgnorees(dossierId),
  ]);
  const verdict = verdictProjectionBatiments(
    bats.map((b) => ({ corpsId: b.id, repere: b.repere })),
    emprises.map((e) => ({ corpsId: e.corpsId, provenance: e.provenance })),
    ignores.map((i) => i.corpsId),
  );
  if (!verdict.peutValider) {
    // PROJ-3b — revérification SERVEUR (jamais la confiance au client) : 0 bâtiment déclaré ⇒ refus explicite (aucun passage par vacuité).
    const motif = verdict.aucunBatiment
      ? 'aucun bâtiment déclaré : déclarez au moins un bâtiment avant de valider la projection'
      : `projection incomplète — ${verdict.libelle}`;
    return { ok: false, motif };
  }

  try {
    return await withTransaction(async (q) => {
      await q(`INSERT INTO permis_projection (dossier_id, validee_par) VALUES ($1, $2) ON CONFLICT (dossier_id) DO NOTHING`, [dossierId, par]);
      // Marquage SUIVI : crée le dossier de rattachement en « en_attente_bati » S'IL N'EXISTE PAS (idempotent). Le détecteur de
      // delta l'ouvrira en 'arbitrage_demande' quand BD TOPO livrera le bâti. Verdict SENTINELLE (jamais un verdict de détection).
      const { rows: r } = await q<{ id: number }>(
        `INSERT INTO permis_rattachement (dossier_id, regime, verdict, etat, motif, detecte_le, reevalue_le)
           VALUES ($1, 'indetermine', 'SUIVI_APRES_PROJECTION', 'en_attente_bati', 'projection validée : en attente d’une mise à jour BD TOPO', now(), now())
         ON CONFLICT (dossier_id) DO NOTHING RETURNING id`, [dossierId]);
      const marqueSuivi = r.length > 0;
      if (marqueSuivi) {
        await q(`INSERT INTO permis_rattachement_evenement (rattachement_id, type, ancien_etat, nouvel_etat, details, par)
                 VALUES ($1, 'suivi_apres_projection', NULL, 'en_attente_bati', $2::jsonb, $3)`,
          [r[0].id, JSON.stringify({ origine: 'projection' }), par]);
      }
      return { ok: true, marqueSuivi } as const;
    });
  } catch (e) {
    if (estTableAbsente(e)) return { ok: false, motif: 'file de projection indisponible (migration 151 non appliquée)' };
    throw e;
  }
}
