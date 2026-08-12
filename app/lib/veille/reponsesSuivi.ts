/**
 * R5a — LECTURE agrégée pour l'écran « Réponses » (suivi de la boucle de retour CRPA). LECTURE SEULE : aucune écriture,
 * aucune règle métier ici — l'état d'échéance est calculé À L'AFFICHAGE par `etatEcheance` (echeance.ts), pas recopié.
 * Types partagés par la route (serveur) et le rendu (via `import type`, donc erasés côté client).
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { bornesFenetres, type FenetreCumul } from './fenetresCumul';

/** Réglages de relève/échéance en vigueur (lecture seule ; édités dans l'onglet Réglages). */
export interface ReglagesReleve {
  active: boolean;
  intervalleMinutes: number;
  profil: string;
  fraicheurHeures: number;
  alerteJours: number;
}

/** Une ligne du journal releve_run (les compteurs sont NULL pour un run 'en_cours' ou 'ignore'). */
export interface LigneRun {
  demarreLe: string;
  termineLe: string | null;
  declencheur: string;
  resultat: string;
  vus: number | null;
  dejaConnus: number | null;
  horsPerimetre: number | null;
  retenus: number | null;
  rattaches: number | null;
  rebondsDetectes: number | null;
  rebondsRattaches: number | null;
  rebondsEtrangers: number | null;
  rebondsAppliques: number | null;
  enregistrees: number | null;
  piecesDeposees: number | null;    // R4
  piecesNonDeposees: number | null; // R4
  erreur: string | null;
}

/**
 * T2 — cumul d'UNE fenêtre glissante : les 12 mêmes compteurs que `LigneRun` (jamais NULL ici — un `sum` vide vaut 0),
 * plus le NOMBRE de relèves de la fenêtre et combien en ERREUR (un total de « vus » ne dit rien sans son nombre de passes).
 */
export interface CumulFenetre {
  nbReleves: number;
  nbErreurs: number;
  vus: number; dejaConnus: number; horsPerimetre: number; retenus: number; rattaches: number;
  rebondsDetectes: number; rebondsRattaches: number; rebondsEtrangers: number; rebondsAppliques: number;
  enregistrees: number; piecesDeposees: number; piecesNonDeposees: number;
}
/** Les six fenêtres livrées d'un coup (24h · 7j · 30j · 90j · 365j · total) → changer de période n'exige aucun rechargement. */
export type CumulsRuns = Record<FenetreCumul, CumulFenetre>;

/** R4 — une pièce jointe d'une réponse : stockée (sur l'object storage) ou non, et pourquoi (motif). LECTURE SEULE. */
export interface PieceInfo {
  id: number;             // R5b : id de demande_reponse_piece (pour demander un lien signé) — la clé de stockage ne sort JAMAIS
  nomFichier: string;
  stockee: boolean;
  motif: string | null; // motif_non_stocke si non stockée
}

/** Un dossier d'une demande suivie (satisfait ou dû, et par quel canal). */
export interface DossierSuivi {
  dossierId: number;      // R5b : pour marquer/démarquer reçu
  numDau: string;
  adresse: string | null;
  satisfait: boolean;
  satisfaitPar: string | null; // 'automatique' | 'manuel' | null (si dû)
  triage: string | null;       // T1 : 'non_fourni' | 'refus_mairie' | null (dossier NON reçu trié)
  refusLe: string | null;      // T1 : date de notification du refus exprès (ISO date) ; null hors refus_mairie
}

/** Une demande envoyée, avec de quoi calculer son échéance À L'AFFICHAGE (etatEcheance) et son détail par dossier. */
export interface DemandeSuivi {
  demandeId: number;
  reference: string;
  codeInsee: string;
  communeNom: string | null;
  statut: string;         // R5b : statut de la demande (garde-fou : pas de marquage si 'close')
  envoyeLe: string | null;
  statutAcheminement: string;
  dossiersActifs: number;
  dossiersSatisfaits: number;
  nbReponses: number;
  derniereReponseLe: string | null; // T1 : date (ISO) de la réponse rattachée la plus récente → pré-remplit « refus le »
  dossiers: DossierSuivi[];
}

/** Un message dans la file « à rattacher » (demande_reponse sans demande_id). */
export interface ReponseARattacher {
  id: number;
  recuLe: string;
  deAdresse: string;
  deNom: string | null;
  objet: string | null;
  nbPieces: number;
  rattachementMethode: string;
  pieces: PieceInfo[]; // R4 : détail par pièce (stockée ou non, et pourquoi)
}

/** Un brouillon de relance prêt (demande_relance 'brouillon'). */
export interface RelancePreparee {
  id: number;
  genereeLe: string;
  demandeId: number;
  reference: string | null;
  communeNom: string | null;
  objet: string;
  corps: string;
}

export interface ReponsesData {
  reglages: ReglagesReleve;
  derniereOkLe: string | null;
  runs: LigneRun[];
  cumuls: CumulsRuns; // T2 — cumuls des six fenêtres glissantes (ligne de total à période sélectionnable)
  demandes: DemandeSuivi[];
  aRattacher: ReponseARattacher[];
  relances: RelancePreparee[];
}

/** T2 — les 12 compteurs cumulables : colonne SQL ↔ propriété de CumulFenetre (source unique de l'ordre et du nommage). */
const COMPTEURS_CUMUL: { col: string; prop: keyof Omit<CumulFenetre, 'nbReleves' | 'nbErreurs'> }[] = [
  { col: 'vus', prop: 'vus' },
  { col: 'deja_connus', prop: 'dejaConnus' },
  { col: 'hors_perimetre', prop: 'horsPerimetre' },
  { col: 'retenus', prop: 'retenus' },
  { col: 'rattaches', prop: 'rattaches' },
  { col: 'rebonds_detectes', prop: 'rebondsDetectes' },
  { col: 'rebonds_rattaches', prop: 'rebondsRattaches' },
  { col: 'rebonds_etrangers', prop: 'rebondsEtrangers' },
  { col: 'rebonds_appliques', prop: 'rebondsAppliques' },
  { col: 'enregistrees', prop: 'enregistrees' },
  { col: 'pieces_deposees', prop: 'piecesDeposees' },
  { col: 'pieces_non_deposees', prop: 'piecesNonDeposees' },
];

/**
 * T2 — LECTURE d'agrégation DÉDIÉE (séparée des 10 dernières lignes, qu'elle ne touche pas) : UNE seule requête renvoie les
 * SIX cumuls glissants d'un coup, par agrégats conditionnels `... FILTER (WHERE demarre_le >= $n)` (bornes LIÉES en
 * paramètres, calculées ici depuis `maintenant`) ; la fenêtre `total` n'a PAS de FILTER (sans borne). Un seul aller-retour,
 * aucun paramètre de période côté route. LECTURE SEULE. `maintenant` en argument → déterministe et testable.
 */
export async function chargerCumulsRuns(maintenant: Date): Promise<CumulsRuns> {
  const bornes = bornesFenetres(maintenant);
  const params: string[] = [];
  const selects: string[] = [];
  bornes.forEach((b, w) => {
    // Prédicat de la fenêtre (vide pour `total`) : la borne est liée UNE fois et réutilisée par tous les agrégats de la fenêtre.
    let cond = '';
    if (b.depuis !== null) { params.push(b.depuis.toISOString()); cond = `demarre_le >= $${params.length}`; }
    const filtreFenetre = cond ? ` FILTER (WHERE ${cond})` : '';
    selects.push(`count(demarre_le)${filtreFenetre}::int AS w${w}_nb`);
    selects.push(`count(demarre_le) FILTER (WHERE ${cond ? `${cond} AND ` : ''}resultat = 'erreur')::int AS w${w}_err`);
    for (const m of COMPTEURS_CUMUL) selects.push(`coalesce(sum(${m.col})${filtreFenetre}, 0)::int AS w${w}_${m.col}`);
  });
  const res = await query<Record<string, number>>(`SELECT ${selects.join(', ')} FROM releve_run`, params);
  const row = (res.rows[0] ?? {}) as Record<string, number | undefined>; // alias absent → undefined → 0 (jamais NULL exposé)
  const out = {} as CumulsRuns;
  bornes.forEach((b, w) => {
    const c: CumulFenetre = {
      nbReleves: row[`w${w}_nb`] ?? 0, nbErreurs: row[`w${w}_err`] ?? 0,
      vus: 0, dejaConnus: 0, horsPerimetre: 0, retenus: 0, rattaches: 0,
      rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0,
      enregistrees: 0, piecesDeposees: 0, piecesNonDeposees: 0,
    };
    for (const m of COMPTEURS_CUMUL) c[m.prop] = row[`w${w}_${m.col}`] ?? 0;
    out[b.cle] = c;
  });
  return out;
}

/** Charge tout le nécessaire de l'écran « Réponses » en une passe. LECTURE SEULE. */
export async function chargerSuiviReponses(): Promise<ReponsesData> {
  const cfg = await chargerConfigVeille();
  const reglages: ReglagesReleve = {
    active: cfg.releveActive, intervalleMinutes: cfg.releveIntervalleMinutes, profil: cfg.releveProfil,
    fraicheurHeures: cfg.releveFraicheurHeures, alerteJours: cfg.echeanceAlerteJours,
  };

  const derniere = await query<{ t: string | null }>(`SELECT max(termine_le)::text AS t FROM releve_run WHERE resultat = 'ok'`);
  const derniereOkLe = derniere.rows[0]?.t ?? null;

  const runs = await query<{
    demarre_le: string; termine_le: string | null; declencheur: string; resultat: string;
    vus: number | null; deja_connus: number | null; hors_perimetre: number | null; retenus: number | null; rattaches: number | null;
    rebonds_detectes: number | null; rebonds_rattaches: number | null; rebonds_etrangers: number | null; rebonds_appliques: number | null;
    enregistrees: number | null; pieces_deposees: number | null; pieces_non_deposees: number | null; erreur: string | null;
  }>(
    `SELECT demarre_le::text AS demarre_le, termine_le::text AS termine_le, declencheur, resultat,
            vus, deja_connus, hors_perimetre, retenus, rattaches,
            rebonds_detectes, rebonds_rattaches, rebonds_etrangers, rebonds_appliques, enregistrees,
            pieces_deposees, pieces_non_deposees, erreur
       FROM releve_run ORDER BY demarre_le DESC LIMIT 10`,
  );

  // Demandes ENVOYÉES + CLOSES (tous profils) : R5c — une demande close reste VISIBLE (identifiée comme telle, avec Rouvrir),
  // elle ne disparaît pas de l'écran. Acheminement agrégé + compteurs de dossiers + nombre de réponses rattachées.
  const dem = await query<{
    id: number; reference: string; code_insee: string; commune_nom: string | null; statut: string;
    envoye_le: string | null; statut_acheminement: string; dossiers_actifs: number; dossiers_satisfaits: number; nb_reponses: number; derniere_reponse_le: string | null;
  }>(
    `SELECT d.id::int AS id, d.reference, d.code_insee, c.nom AS commune_nom, d.statut,
            min(a.envoye_le)::text AS envoye_le,
            (SELECT max(r.recu_le)::text FROM demande_reponse r WHERE r.demande_id = d.id) AS derniere_reponse_le, -- T1 : pré-remplissage « refus le »
            CASE WHEN bool_or(a.statut = 'envoye') THEN 'envoye'
                 WHEN bool_or(a.statut = 'rebond') THEN 'rebond'
                 WHEN bool_or(a.statut = 'echec')  THEN 'echec'
                 ELSE 'en_attente' END AS statut_acheminement,
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif) AS dossiers_actifs,
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NOT NULL) AS dossiers_satisfaits,
            (SELECT count(*)::int FROM demande_reponse r WHERE r.demande_id = d.id) AS nb_reponses
       FROM demande d
       LEFT JOIN commune c ON c.code_insee = d.code_insee
       -- B2 — la date d'envoi (ancre d'échéance) se lit QUEL QUE SOIT le canal : un dépôt téléservice écrit une ligne
       --   canal='formulaire' (pas 'email'). Filtrer canal='email' ici serait le défaut symétrique de l'écriture corrigée.
       LEFT JOIN demande_acheminement a ON a.demande_id = d.id
      WHERE d.statut IN ('envoyee', 'close')
      GROUP BY d.id, d.reference, d.code_insee, c.nom, d.statut`,
  );

  // Détail des dossiers de ces demandes (groupés ensuite par demande_id) — évite un N+1.
  // T2 — RÉPONSES = dossiers DUS. On ne liste QUE `satisfait_le IS NULL` : un dossier OBTENU vit désormais dans l'onglet
  //   Archives (listerArchives : `dd.satisfait_le IS NOT NULL`), plus sous sa demande ici → un même dossier n'est JAMAIS dans
  //   les deux onglets. Le nombre d'obtenus reste connu par `dossiers_satisfaits` (dem, ci-dessus) → la Vue affiche « N obtenu(s)
  //   — voir Archives ». `satisfait` reste dans le SELECT (toujours false ici) pour la compat de type DossierSuivi.
  const doss = await query<{ demande_id: number; dossier_id: number; num_dau: string; adresse: string | null; satisfait: boolean; satisfait_par: string | null; triage: string | null; refus_le: string | null }>(
    `SELECT dd.demande_id::int AS demande_id, dd.dossier_id::int AS dossier_id, s.num_dau,
            nullif(btrim(concat_ws(' ', s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter)), '') AS adresse,
            (dd.satisfait_le IS NOT NULL) AS satisfait, dd.satisfait_par, dd.triage, dd.refus_le::text AS refus_le
       FROM demande_dossier dd
       JOIN sitadel_dossier s ON s.id = dd.dossier_id
       JOIN demande d ON d.id = dd.demande_id
      WHERE d.statut IN ('envoyee', 'close') AND dd.actif AND dd.satisfait_le IS NULL
      ORDER BY dd.demande_id, s.num_dau`,
  );
  const parDemande = new Map<number, DossierSuivi[]>();
  for (const r of doss.rows) {
    (parDemande.get(r.demande_id) ?? parDemande.set(r.demande_id, []).get(r.demande_id)!)
      .push({ dossierId: r.dossier_id, numDau: r.num_dau, adresse: r.adresse, satisfait: r.satisfait, satisfaitPar: r.satisfait_par, triage: r.triage, refusLe: r.refus_le });
  }
  const demandes: DemandeSuivi[] = dem.rows.map((r) => ({
    demandeId: r.id, reference: r.reference, codeInsee: r.code_insee, communeNom: r.commune_nom, statut: r.statut,
    envoyeLe: r.envoye_le, statutAcheminement: r.statut_acheminement,
    dossiersActifs: r.dossiers_actifs, dossiersSatisfaits: r.dossiers_satisfaits, nbReponses: r.nb_reponses,
    derniereReponseLe: r.derniere_reponse_le,
    dossiers: parDemande.get(r.id) ?? [],
  }));

  const rat = await query<{ id: number; recu_le: string; de_adresse: string; de_nom: string | null; objet: string | null; rattachement_methode: string; nb_pieces: number }>(
    `SELECT r.id::int AS id, r.recu_le::text AS recu_le, r.de_adresse, r.de_nom, r.objet, r.rattachement_methode,
            (SELECT count(*)::int FROM demande_reponse_piece p WHERE p.reponse_id = r.id) AS nb_pieces
       FROM demande_reponse r
      WHERE r.demande_id IS NULL
      ORDER BY r.recu_le DESC`,
  );
  // R4 — détail par pièce des réponses à rattacher (stockée ou non, et pourquoi), en une passe puis groupé par réponse.
  const pj = await query<{ id: number; reponse_id: number; nom_fichier: string; stockee: boolean; motif_non_stocke: string | null }>(
    `SELECT p.id::int AS id, p.reponse_id::int AS reponse_id, p.nom_fichier, (p.cle_stockage IS NOT NULL) AS stockee, p.motif_non_stocke
       FROM demande_reponse_piece p
       JOIN demande_reponse r ON r.id = p.reponse_id
      WHERE r.demande_id IS NULL
      ORDER BY p.reponse_id, p.id`,
  );
  const piecesParReponse = new Map<number, PieceInfo[]>();
  for (const p of pj.rows) {
    (piecesParReponse.get(p.reponse_id) ?? piecesParReponse.set(p.reponse_id, []).get(p.reponse_id)!)
      .push({ id: p.id, nomFichier: p.nom_fichier, stockee: p.stockee, motif: p.motif_non_stocke });
  }
  const aRattacher: ReponseARattacher[] = rat.rows.map((r) => ({
    id: r.id, recuLe: r.recu_le, deAdresse: r.de_adresse, deNom: r.de_nom, objet: r.objet, nbPieces: r.nb_pieces,
    rattachementMethode: r.rattachement_methode, pieces: piecesParReponse.get(r.id) ?? [],
  }));

  const rel = await query<{ id: number; generee_le: string; demande_id: number; reference: string | null; commune_nom: string | null; objet: string; corps: string }>(
    `SELECT rl.id::int AS id, rl.generee_le::text AS generee_le, rl.demande_id::int AS demande_id, d.reference, c.nom AS commune_nom, rl.objet, rl.corps
       FROM demande_relance rl
       JOIN demande d ON d.id = rl.demande_id
       LEFT JOIN commune c ON c.code_insee = d.code_insee
      WHERE rl.statut = 'brouillon' AND d.statut = 'envoyee'
      ORDER BY rl.generee_le DESC`,
  );
  const relances: RelancePreparee[] = rel.rows.map((r) => ({
    id: r.id, genereeLe: r.generee_le, demandeId: r.demande_id, reference: r.reference, communeNom: r.commune_nom, objet: r.objet, corps: r.corps,
  }));

  // T2 — cumuls des six fenêtres glissantes (lecture dédiée, séparée du bloc `runs` ci-dessus qui reste inchangé).
  const cumuls = await chargerCumulsRuns(new Date());

  return {
    reglages, derniereOkLe,
    runs: runs.rows.map((r) => ({
      demarreLe: r.demarre_le, termineLe: r.termine_le, declencheur: r.declencheur, resultat: r.resultat,
      vus: r.vus, dejaConnus: r.deja_connus, horsPerimetre: r.hors_perimetre, retenus: r.retenus, rattaches: r.rattaches,
      rebondsDetectes: r.rebonds_detectes, rebondsRattaches: r.rebonds_rattaches, rebondsEtrangers: r.rebonds_etrangers,
      rebondsAppliques: r.rebonds_appliques, enregistrees: r.enregistrees,
      piecesDeposees: r.pieces_deposees, piecesNonDeposees: r.pieces_non_deposees, erreur: r.erreur,
    })),
    cumuls,
    demandes, aRattacher, relances,
  };
}
