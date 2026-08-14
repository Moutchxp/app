/**
 * R5a — LECTURE agrégée pour l'écran « Réponses » (suivi de la boucle de retour CRPA). LECTURE SEULE : aucune écriture,
 * aucune règle métier ici — l'état d'échéance est calculé À L'AFFICHAGE par `etatEcheance` (echeance.ts), pas recopié.
 * Types partagés par la route (serveur) et le rendu (via `import type`, donc erasés côté client).
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { bornesFenetres, type FenetreCumul } from './fenetresCumul';
import { apparierPropositions, chiffresDossier, type CibleDepot } from './propositionDepot';
import { fenetreDepuis } from './releveReponses'; // P1 : MÊME source que la relève pour « on relève depuis le … » (jamais une 2e vérité)
import type { ProfilBoite } from './demandeReponseRepo';

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
  accuses: number | null;           // T3 : accusés enregistrés pendant le run (visibilité au journal)
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
  rebondsDetectes: number; rebondsRattaches: number; rebondsEtrangers: number; rebondsAppliques: number; accuses: number;
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

/** L1 — un lien de téléchargement capté dans une réponse rattachée à la demande (jamais suivi ; affiché seulement). */
export interface LienAffiche {
  url: string;
  fort: boolean;                 // chemin à jeton → affiché en tête ; les faibles sont repliés
  recuLe: string;                // recu_le du message porteur (ISO) → « lien reçu le JJ/MM »
  expireLe: string | null;       // expiration EXPLICITE (ISO) ou null (« durée de validité non précisée »)
  expirationSource: string | null; // 'absolue' | 'relative' | null
  expirationIndice: string | null; // fragment reconnu (« 7 jours », « jusqu'au 17/08/2026 »)
}

/** G1 — une alerte GED déjà PARTIE pour cette demande (journal alerte_ged) : rendue visible, retard compris (décision 7). */
export interface AlerteGedAffiche {
  type: string;            // 'j3' | 'h24'
  numDau: string | null;   // permis concerné (null = alerte « contenu non rattaché »)
  envoyeLe: string;        // ISO
  enRetard: boolean;       // partie après son seuil (machine éteinte) → jamais un silence supposé normal
}

/**
 * T7-B (cas ③) — un message de mairie de nature `autre` rattaché à cette demande, qui appelle une réponse humaine. On ne
 * remonte QUE les messages ANCRÉS (nature_classee_le IS NOT NULL) : un `autre` classé par le backfill historique (099) n'arme
 * jamais le cas ③ (ni alerte, ni signal, ni bouton) — la réponse de Paris est ainsi protégée. `reponduLe` NULL = à répondre.
 */
export interface MessageAutreAffiche {
  id: number;                  // demande_reponse.id (grain du bouton « répondu »)
  objet: string | null;
  deAdresse: string;
  deNom: string | null;
  recuLe: string;              // ISO
  reponduLe: string | null;    // ISO si marqué répondu, null sinon (pilote le signal « réponse attendue »)
  reponduPar: string | null;
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
  dossiersSatisfaits: number;   // T8 : dossiers MARQUÉS REÇUS (satisfait_le) — déclaration humaine. JAMAIS « obtenu ».
  dossiersEnGed: number;        // T8 : dossiers dont un fichier est EN GED (dossier_document, déf. G1/G2) — fait vérifiable. Pilote « obtenu ».
  nbReponses: number;           // T3 : « la mairie a ÉCRIT » — messages rattachés hors rebond (accusé COMPRIS). Pilote « En cours ».
  nbReponsesReelles: number;    // T3 : « la mairie a RÉPONDU » — hors accusé ET hors rebond. Pilote l'entrée dans « Réponses ».
  derniereReponseLe: string | null; // T1 : date (ISO) du dernier message « a écrit » (hors rebond) → pré-remplit « refus le »
  dossiers: DossierSuivi[];
  liens: LienAffiche[];         // L1 : liens de téléchargement captés dans les réponses rattachées (forts d'abord)
  alertesGed: AlerteGedAffiche[]; // G1 : alertes « à classer/télécharger en GED » déjà envoyées (retard visible)
  messagesAutre: MessageAutreAffiche[]; // T7-B : messages `autre` ancrés (cas ③) — la ligne est signalée tant qu'il en reste ≥1 non répondu
}
// T6-A/2 — le critère d'inclusion « Réponses » (demandeADuRetour) + la partition d'affichage (partitionnerReponses) vivent dans
//   ReponsesRendu.tsx (module PUR client-safe), PAS ici : ce module importe db/client (pg), qu'on ne veut jamais dans le bundle client.

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
  releveDepuisLe: string | null;   // P1 : début de la PROCHAINE fenêtre de relève (curseur − 3 j, ou backfill) → « on relève depuis le … »
  relevePlafondAtteint: boolean;   // P1 : la dernière passe courante a été TRONQUÉE par le plafond → on est EN RETARD (à afficher)
  runs: LigneRun[];
  cumuls: CumulsRuns; // T2 — cumuls des six fenêtres glissantes (ligne de total à période sélectionnable)
  demandes: DemandeSuivi[];
  aRattacher: ReponseARattacher[];
  propositions: PropositionDepotAffichee[]; // T4 : « Dépôts à confirmer » (messages citant le permis d'une demande en attente)
  relances: RelancePreparee[];
}

/** T4 — une proposition « cette demande a-t-elle été déposée ? » : un message + ses demandes candidates (1 = actionnable, ≥ 2 = ambiguë). */
export interface PropositionDepotAffichee {
  id: number; recuLe: string; deAdresse: string; deNom: string | null; objet: string | null; nbPieces: number;
  candidats: { demandeId: number; reference: string; communeNom: string | null }[];
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
  { col: 'accuses', prop: 'accuses' },
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
      rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0, accuses: 0,
      enregistrees: 0, piecesDeposees: 0, piecesNonDeposees: 0,
    };
    for (const m of COMPTEURS_CUMUL) c[m.prop] = row[`w${w}_${m.col}`] ?? 0;
    out[b.cle] = c;
  });
  return out;
}

/**
 * T6-A — SOURCE UNIQUE de la donnée riche par demande ENVOYÉE/CLOSE : échéance (envoyeLe/statutAcheminement/dossiers) + retour
 * mairie (nbReponses/derniereReponseLe) + détail des dossiers dus. NON FILTRÉE — « En cours » ET « Réponses » la consomment TOUS
 * DEUX, chacun filtrant EN AVAL. Le critère « la mairie a écrit » reste LOCAL à la vue Réponses ; il ne doit JAMAIS être appliqué
 * ici, sinon les demandes sans message disparaîtraient AUSSI d'« En cours ». Un SEUL chargeur → un seul calcul d'échéance
 * (via etatEcheance, en aval), jamais deux (défaut B2). LECTURE SEULE.
 */
export interface SuiviDemandesData { demandes: DemandeSuivi[]; derniereOkLe: string | null; reglages: ReglagesReleve }
export async function chargerDemandesSuivi(): Promise<SuiviDemandesData> {
  const cfg = await chargerConfigVeille();
  const reglages: ReglagesReleve = {
    active: cfg.releveActive, intervalleMinutes: cfg.releveIntervalleMinutes, profil: cfg.releveProfil,
    fraicheurHeures: cfg.releveFraicheurHeures, alerteJours: cfg.echeanceAlerteJours,
  };

  const derniere = await query<{ t: string | null }>(`SELECT max(termine_le)::text AS t FROM releve_run WHERE resultat = 'ok'`);
  const derniereOkLe = derniere.rows[0]?.t ?? null;

  // Demandes ENVOYÉES + CLOSES (tous profils) : R5c — une demande close reste VISIBLE (identifiée comme telle, avec Rouvrir),
  // elle ne disparaît pas de l'écran. Acheminement agrégé + compteurs de dossiers + nombre de réponses rattachées.
  const dem = await query<{
    id: number; reference: string; code_insee: string; commune_nom: string | null; statut: string;
    envoye_le: string | null; statut_acheminement: string; dossiers_actifs: number; dossiers_satisfaits: number; dossiers_en_ged: number; nb_reponses: number; nb_reponses_reelles: number; derniere_reponse_le: string | null;
  }>(
    // T3 — DEUX faits DISTINCTS : « la mairie a ÉCRIT » (nb_reponses, accusé COMPRIS, rebond EXCLU → pilote « En cours ») et
    //   « la mairie a RÉPONDU » (nb_reponses_reelles, hors accusé ET hors rebond → pilote l'entrée dans « Réponses »). Un rebond
    //   rattaché reste enregistré (preuve) mais N'EST NI l'un NI l'autre. derniere_reponse_le suit « a écrit » (accusé compris).
    `SELECT d.id::int AS id, d.reference, d.code_insee, c.nom AS commune_nom, d.statut,
            min(a.envoye_le)::text AS envoye_le,
            (SELECT max(r.recu_le)::text FROM demande_reponse r WHERE r.demande_id = d.id AND r.nature <> 'rebond') AS derniere_reponse_le, -- T1 : pré-remplissage « refus le »
            CASE WHEN bool_or(a.statut = 'envoye') THEN 'envoye'
                 WHEN bool_or(a.statut = 'rebond') THEN 'rebond'
                 WHEN bool_or(a.statut = 'echec')  THEN 'echec'
                 ELSE 'en_attente' END AS statut_acheminement,
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif) AS dossiers_actifs,
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NOT NULL) AS dossiers_satisfaits,
            -- T8 — « EN GED » = une ligne dossier_document (déf. G1/G2), DISTINCT de satisfait_le (« marqué reçu »). Pilote « documents obtenus ».
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND EXISTS (SELECT 1 FROM dossier_document doc WHERE doc.dossier_id = dd.dossier_id)) AS dossiers_en_ged,
            (SELECT count(*)::int FROM demande_reponse r WHERE r.demande_id = d.id AND r.nature <> 'rebond') AS nb_reponses,
            (SELECT count(*)::int FROM demande_reponse r WHERE r.demande_id = d.id AND r.nature NOT IN ('accuse','rebond')) AS nb_reponses_reelles
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

  // L1 — liens de téléchargement captés dans les réponses RATTACHÉES de ces demandes (une passe, groupés par demande ; forts
  //   d'abord). `recu_le` du message porteur → « lien reçu le JJ/MM ». On ne suit JAMAIS un lien : lecture d'affichage seule.
  const liens = await query<{ demande_id: number; url: string; fort: boolean; recu_le: string; expire_le: string | null; expiration_source: string | null; expiration_indice: string | null }>(
    `SELECT r.demande_id::int AS demande_id, l.url, l.fort, r.recu_le::text AS recu_le,
            l.expire_le::text AS expire_le, l.expiration_source, l.expiration_indice
       FROM demande_reponse_lien l
       JOIN demande_reponse r ON r.id = l.reponse_id
       JOIN demande d ON d.id = r.demande_id
      WHERE d.statut IN ('envoyee', 'close') AND r.demande_id IS NOT NULL
      ORDER BY r.demande_id, l.fort DESC, l.capte_le`,
  );
  const parLiens = new Map<number, LienAffiche[]>();
  for (const r of liens.rows) {
    (parLiens.get(r.demande_id) ?? parLiens.set(r.demande_id, []).get(r.demande_id)!)
      .push({ url: r.url, fort: r.fort, recuLe: r.recu_le, expireLe: r.expire_le, expirationSource: r.expiration_source, expirationIndice: r.expiration_indice });
  }

  // G1 — alertes GED déjà parties, par demande (retard rendu visible — décision 7). LECTURE SEULE.
  const alertes = await query<{ demande_id: number; type: string; num_dau: string | null; envoye_le: string; en_retard: boolean }>(
    `SELECT r.demande_id::int AS demande_id, ag.type, s.num_dau, ag.envoye_le::text AS envoye_le, ag.en_retard
       FROM alerte_ged ag
       JOIN demande_reponse r ON r.id = ag.reponse_id
       JOIN demande d ON d.id = r.demande_id
       LEFT JOIN sitadel_dossier s ON s.id = ag.dossier_id
      WHERE d.statut IN ('envoyee', 'close') AND r.demande_id IS NOT NULL
      ORDER BY r.demande_id, ag.envoye_le DESC`,
  );
  const parAlertes = new Map<number, AlerteGedAffiche[]>();
  for (const a of alertes.rows) {
    (parAlertes.get(a.demande_id) ?? parAlertes.set(a.demande_id, []).get(a.demande_id)!)
      .push({ type: a.type, numDau: a.num_dau, envoyeLe: a.envoye_le, enRetard: a.en_retard });
  }

  // T7-B (cas ③) — messages `autre` ANCRÉS rattachés à ces demandes (nature_classee_le IS NOT NULL → jamais un rétro-classé :
  //   Paris protégée). `repondu_le` NULL = à répondre → pilote le signal de ligne « réponse attendue » et le bouton par message.
  const msgAutre = await query<{ demande_id: number; id: number; objet: string | null; de_adresse: string; de_nom: string | null; recu_le: string; repondu_le: string | null; repondu_par: string | null }>(
    `SELECT r.demande_id::int AS demande_id, r.id::int AS id, r.objet, r.de_adresse, r.de_nom,
            r.recu_le::text AS recu_le, r.repondu_le::text AS repondu_le, r.repondu_par
       FROM demande_reponse r
       JOIN demande d ON d.id = r.demande_id
      WHERE d.statut IN ('envoyee', 'close') AND r.demande_id IS NOT NULL
        AND r.nature = 'autre' AND r.nature_classee_le IS NOT NULL
      ORDER BY r.demande_id, r.recu_le DESC`,
  );
  const parMsgAutre = new Map<number, MessageAutreAffiche[]>();
  for (const m of msgAutre.rows) {
    (parMsgAutre.get(m.demande_id) ?? parMsgAutre.set(m.demande_id, []).get(m.demande_id)!)
      .push({ id: m.id, objet: m.objet, deAdresse: m.de_adresse, deNom: m.de_nom, recuLe: m.recu_le, reponduLe: m.repondu_le, reponduPar: m.repondu_par });
  }

  const demandes: DemandeSuivi[] = dem.rows.map((r) => ({
    demandeId: r.id, reference: r.reference, codeInsee: r.code_insee, communeNom: r.commune_nom, statut: r.statut,
    envoyeLe: r.envoye_le, statutAcheminement: r.statut_acheminement,
    dossiersActifs: r.dossiers_actifs, dossiersSatisfaits: r.dossiers_satisfaits, dossiersEnGed: r.dossiers_en_ged, nbReponses: r.nb_reponses, nbReponsesReelles: r.nb_reponses_reelles,
    derniereReponseLe: r.derniere_reponse_le,
    dossiers: parDemande.get(r.id) ?? [],
    liens: parLiens.get(r.id) ?? [],
    alertesGed: parAlertes.get(r.id) ?? [],
    messagesAutre: parMsgAutre.get(r.id) ?? [],
  }));
  return { demandes, derniereOkLe, reglages };
}

/** Charge tout le nécessaire de l'écran « Réponses » en une passe. LECTURE SEULE. */
export async function chargerSuiviReponses(): Promise<ReponsesData> {
  // T6-A — la donnée par demande (échéance + retour + dossiers) vient de la SOURCE UNIQUE, partagée avec « En cours » (non filtrée ici).
  const { demandes, derniereOkLe, reglages } = await chargerDemandesSuivi();

  // P1 — « on relève depuis le … » : début de la PROCHAINE fenêtre (curseur − 3 j, ou backfill), depuis la MÊME source que la relève.
  const profil: ProfilBoite = reglages.profil === 'personne' ? 'personne' : 'entreprise';
  const releveDepuisLe = (await fenetreDepuis(profil))?.toISOString() ?? null;
  // P1 — plafond atteint sur la dernière passe COURANTE réussie → on est EN RETARD (le curseur n'a pas avancé, cf. curseurReleve).
  const plaf = await query<{ p: boolean | null }>(
    `SELECT plafond_atteint AS p FROM releve_run WHERE declencheur = 'planifie' AND resultat = 'ok' ORDER BY termine_le DESC LIMIT 1`);
  const relevePlafondAtteint = plaf.rows[0]?.p === true;

  const runs = await query<{
    demarre_le: string; termine_le: string | null; declencheur: string; resultat: string;
    vus: number | null; deja_connus: number | null; hors_perimetre: number | null; retenus: number | null; rattaches: number | null;
    rebonds_detectes: number | null; rebonds_rattaches: number | null; rebonds_etrangers: number | null; rebonds_appliques: number | null; accuses: number | null;
    enregistrees: number | null; pieces_deposees: number | null; pieces_non_deposees: number | null; erreur: string | null;
  }>(
    `SELECT demarre_le::text AS demarre_le, termine_le::text AS termine_le, declencheur, resultat,
            vus, deja_connus, hors_perimetre, retenus, rattaches,
            rebonds_detectes, rebonds_rattaches, rebonds_etrangers, rebonds_appliques, accuses, enregistrees,
            pieces_deposees, pieces_non_deposees, erreur
       FROM releve_run ORDER BY demarre_le DESC LIMIT 10`,
  );

  const rat = await query<{ id: number; recu_le: string; de_adresse: string; de_nom: string | null; objet: string | null; corps_texte: string | null; traite_le: string | null; rattachement_methode: string; nb_pieces: number }>(
    `SELECT r.id::int AS id, r.recu_le::text AS recu_le, r.de_adresse, r.de_nom, r.objet, r.corps_texte, r.traite_le::text AS traite_le, r.rattachement_methode,
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
  // T4 — DÉPÔTS À CONFIRMER : parmi les messages non rattachés, ceux qui citent le permis d'une demande EN ATTENTE (formulaire,
  //   brouillon/prête). DEUX FILES DISTINCTES : « À rattacher » = messages SANS rapport ; « Dépôts à confirmer » = citants.
  const cibleRows = await query<{ demande_id: number; reference: string; commune_nom: string | null; num_daus: string[]; refs_mairie: string[] }>(
    `SELECT d.id::int AS demande_id, d.reference, c.nom AS commune_nom,
            coalesce((SELECT array_agg(s.num_dau) FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id WHERE dd.demande_id = d.id AND dd.actif), '{}') AS num_daus,
            coalesce((SELECT array_agg(re.reference) FROM demande_reference_externe re WHERE re.demande_id = d.id), '{}') AS refs_mairie
       FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee
      WHERE d.statut IN ('brouillon', 'prete') AND d.dest_canal = 'formulaire'`,
  );
  const cibles: CibleDepot[] = cibleRows.rows.map((r) => ({
    demandeId: r.demande_id, reference: r.reference, communeNom: r.commune_nom,
    numerosDossier: (r.num_daus ?? []).map(chiffresDossier).filter((n) => n.length >= 10),
    referencesMairie: (r.refs_mairie ?? []).map((x) => x.trim()).filter((x) => x !== ''),
  }));
  const messagesNonRattaches = rat.rows.map((r) => ({ id: r.id, objet: r.objet, corpsTexte: r.corps_texte, nomsPieces: (piecesParReponse.get(r.id) ?? []).map((p) => p.nomFichier), traiteLe: r.traite_le }));
  const { propositions: propsBrutes, idsCitants } = apparierPropositions(messagesNonRattaches, cibles);

  const aRattacher: ReponseARattacher[] = rat.rows.filter((r) => !idsCitants.has(r.id)).map((r) => ({
    id: r.id, recuLe: r.recu_le, deAdresse: r.de_adresse, deNom: r.de_nom, objet: r.objet, nbPieces: r.nb_pieces,
    rattachementMethode: r.rattachement_methode, pieces: piecesParReponse.get(r.id) ?? [],
  }));
  const parId = new Map(rat.rows.map((r) => [r.id, r]));
  const propositions: PropositionDepotAffichee[] = propsBrutes.map((p) => {
    const r = parId.get(p.messageId)!;
    return { id: p.messageId, recuLe: r.recu_le, deAdresse: r.de_adresse, deNom: r.de_nom, objet: r.objet, nbPieces: r.nb_pieces, candidats: p.candidats };
  });

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
    reglages, derniereOkLe, releveDepuisLe, relevePlafondAtteint,
    runs: runs.rows.map((r) => ({
      demarreLe: r.demarre_le, termineLe: r.termine_le, declencheur: r.declencheur, resultat: r.resultat,
      vus: r.vus, dejaConnus: r.deja_connus, horsPerimetre: r.hors_perimetre, retenus: r.retenus, rattaches: r.rattaches,
      rebondsDetectes: r.rebonds_detectes, rebondsRattaches: r.rebonds_rattaches, rebondsEtrangers: r.rebonds_etrangers,
      rebondsAppliques: r.rebonds_appliques, accuses: r.accuses, enregistrees: r.enregistrees,
      piecesDeposees: r.pieces_deposees, piecesNonDeposees: r.pieces_non_deposees, erreur: r.erreur,
    })),
    cumuls,
    demandes, aRattacher, propositions, relances,
  };
}
