/**
 * R5a — LECTURE agrégée pour l'écran « Réponses » (suivi de la boucle de retour CRPA). LECTURE SEULE : aucune écriture,
 * aucune règle métier ici — l'état d'échéance est calculé À L'AFFICHAGE par `etatEcheance` (echeance.ts), pas recopié.
 * Types partagés par la route (serveur) et le rendu (via `import type`, donc erasés côté client).
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';

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
  erreur: string | null;
}

/** Un dossier d'une demande suivie (satisfait ou dû, et par quel canal). */
export interface DossierSuivi {
  numDau: string;
  adresse: string | null;
  satisfait: boolean;
  satisfaitPar: string | null; // 'automatique' | 'manuel' | null (si dû)
}

/** Une demande envoyée, avec de quoi calculer son échéance À L'AFFICHAGE (etatEcheance) et son détail par dossier. */
export interface DemandeSuivi {
  demandeId: number;
  reference: string;
  codeInsee: string;
  communeNom: string | null;
  envoyeLe: string | null;
  statutAcheminement: string;
  dossiersActifs: number;
  dossiersSatisfaits: number;
  nbReponses: number;
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
  demandes: DemandeSuivi[];
  aRattacher: ReponseARattacher[];
  relances: RelancePreparee[];
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
    enregistrees: number | null; erreur: string | null;
  }>(
    `SELECT demarre_le::text AS demarre_le, termine_le::text AS termine_le, declencheur, resultat,
            vus, deja_connus, hors_perimetre, retenus, rattaches,
            rebonds_detectes, rebonds_rattaches, rebonds_etrangers, rebonds_appliques, enregistrees, erreur
       FROM releve_run ORDER BY demarre_le DESC LIMIT 10`,
  );

  // Demandes ENVOYÉES (tous profils) : acheminement agrégé + compteurs de dossiers + nombre de réponses rattachées.
  const dem = await query<{
    id: number; reference: string; code_insee: string; commune_nom: string | null;
    envoye_le: string | null; statut_acheminement: string; dossiers_actifs: number; dossiers_satisfaits: number; nb_reponses: number;
  }>(
    `SELECT d.id::int AS id, d.reference, d.code_insee, c.nom AS commune_nom,
            min(a.envoye_le)::text AS envoye_le,
            CASE WHEN bool_or(a.statut = 'envoye') THEN 'envoye'
                 WHEN bool_or(a.statut = 'rebond') THEN 'rebond'
                 WHEN bool_or(a.statut = 'echec')  THEN 'echec'
                 ELSE 'en_attente' END AS statut_acheminement,
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif) AS dossiers_actifs,
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NOT NULL) AS dossiers_satisfaits,
            (SELECT count(*)::int FROM demande_reponse r WHERE r.demande_id = d.id) AS nb_reponses
       FROM demande d
       LEFT JOIN commune c ON c.code_insee = d.code_insee
       LEFT JOIN demande_acheminement a ON a.demande_id = d.id AND a.canal = 'email'
      WHERE d.statut = 'envoyee'
      GROUP BY d.id, d.reference, d.code_insee, c.nom`,
  );

  // Détail des dossiers de ces demandes (groupés ensuite par demande_id) — évite un N+1.
  const doss = await query<{ demande_id: number; num_dau: string; adresse: string | null; satisfait: boolean; satisfait_par: string | null }>(
    `SELECT dd.demande_id::int AS demande_id, s.num_dau,
            nullif(btrim(concat_ws(' ', s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter)), '') AS adresse,
            (dd.satisfait_le IS NOT NULL) AS satisfait, dd.satisfait_par
       FROM demande_dossier dd
       JOIN sitadel_dossier s ON s.id = dd.dossier_id
       JOIN demande d ON d.id = dd.demande_id
      WHERE d.statut = 'envoyee' AND dd.actif
      ORDER BY dd.demande_id, s.num_dau`,
  );
  const parDemande = new Map<number, DossierSuivi[]>();
  for (const r of doss.rows) {
    (parDemande.get(r.demande_id) ?? parDemande.set(r.demande_id, []).get(r.demande_id)!)
      .push({ numDau: r.num_dau, adresse: r.adresse, satisfait: r.satisfait, satisfaitPar: r.satisfait_par });
  }
  const demandes: DemandeSuivi[] = dem.rows.map((r) => ({
    demandeId: r.id, reference: r.reference, codeInsee: r.code_insee, communeNom: r.commune_nom,
    envoyeLe: r.envoye_le, statutAcheminement: r.statut_acheminement,
    dossiersActifs: r.dossiers_actifs, dossiersSatisfaits: r.dossiers_satisfaits, nbReponses: r.nb_reponses,
    dossiers: parDemande.get(r.id) ?? [],
  }));

  const rat = await query<{ id: number; recu_le: string; de_adresse: string; de_nom: string | null; objet: string | null; rattachement_methode: string; nb_pieces: number }>(
    `SELECT r.id::int AS id, r.recu_le::text AS recu_le, r.de_adresse, r.de_nom, r.objet, r.rattachement_methode,
            (SELECT count(*)::int FROM demande_reponse_piece p WHERE p.reponse_id = r.id) AS nb_pieces
       FROM demande_reponse r
      WHERE r.demande_id IS NULL
      ORDER BY r.recu_le DESC`,
  );
  const aRattacher: ReponseARattacher[] = rat.rows.map((r) => ({
    id: r.id, recuLe: r.recu_le, deAdresse: r.de_adresse, deNom: r.de_nom, objet: r.objet, nbPieces: r.nb_pieces, rattachementMethode: r.rattachement_methode,
  }));

  const rel = await query<{ id: number; generee_le: string; demande_id: number; reference: string | null; commune_nom: string | null; objet: string; corps: string }>(
    `SELECT rl.id::int AS id, rl.generee_le::text AS generee_le, rl.demande_id::int AS demande_id, d.reference, c.nom AS commune_nom, rl.objet, rl.corps
       FROM demande_relance rl
       JOIN demande d ON d.id = rl.demande_id
       LEFT JOIN commune c ON c.code_insee = d.code_insee
      WHERE rl.statut = 'brouillon'
      ORDER BY rl.generee_le DESC`,
  );
  const relances: RelancePreparee[] = rel.rows.map((r) => ({
    id: r.id, genereeLe: r.generee_le, demandeId: r.demande_id, reference: r.reference, communeNom: r.commune_nom, objet: r.objet, corps: r.corps,
  }));

  return {
    reglages, derniereOkLe,
    runs: runs.rows.map((r) => ({
      demarreLe: r.demarre_le, termineLe: r.termine_le, declencheur: r.declencheur, resultat: r.resultat,
      vus: r.vus, dejaConnus: r.deja_connus, horsPerimetre: r.hors_perimetre, retenus: r.retenus, rattaches: r.rattaches,
      rebondsDetectes: r.rebonds_detectes, rebondsRattaches: r.rebonds_rattaches, rebondsEtrangers: r.rebonds_etrangers,
      rebondsAppliques: r.rebonds_appliques, enregistrees: r.enregistrees, erreur: r.erreur,
    })),
    demandes, aRattacher, relances,
  };
}
