/**
 * X2 — DÉPÔT de la saisine CADA : lire les demandes SAISISSABLES et créer la saisine en BROUILLON. Écrit UNIQUEMENT
 * demande_relance (type='saisine_cada') et demande_journal ; ne touche JAMAIS demande.statut. AUCUN envoi, aucun écran.
 * Réutilise fenetreCada + releveEstFraiche (echeance.ts), chargerContexteRelance + chargerLotRelance (relanceAuto.ts),
 * genererSaisineCada (saisineCada.ts). Lectures INJECTABLES (test node-pur), écriture transactionnelle.
 */
import { query, withTransaction } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { profilValide, type ProfilDemandeur } from '../sitadel/demande';
import { fenetreCada, releveEstFraiche } from './echeance';
import { chargerContexteRelance, chargerLotRelance, type ContexteRelance, type LotRelance } from './relanceAuto';
import { genererSaisineCada } from './saisineCada';

/** Refus métier d'une action de saisine (non saisissable, saisine déjà en cours…) — raison exposée, jamais un 503. */
export class SaisineCadaError extends Error {
  constructor(public readonly raison: string) { super(raison); this.name = 'SaisineCadaError'; }
}

// ── POINT 2 : lecture des demandes saisissables ───────────────────────────────
export interface DemandeSaisissable {
  demandeId: number; reference: string; communeNom: string | null; profil: ProfilDemandeur;
  envoyeLe: Date; refusTaciteLe: Date; forclusionLe: Date; joursAvantForclusion: number; // pour l'écran à venir
  dossiersActifs: number; dossiersDus: number;
}
export interface SaisiesEligibles { saisissables: DemandeSaisissable[]; indeterminees: DemandeSaisissable[] }

/** Candidat brut (filtre SQL passé) AVANT classification fenêtre/fraîcheur. */
export interface CandidatSaisine {
  demandeId: number; reference: string; communeNom: string | null; profil: ProfilDemandeur;
  envoyeLe: Date; dossiersActifs: number; dossiersDus: number;
}

export interface DepsSaisissables {
  lireCandidats(): Promise<CandidatSaisine[]>;
  derniereReleveOkLe(): Promise<Date | null>;
  fraicheurHeures(): Promise<number>;
  maintenant(): Date;
}

/** Filtre SQL : demande envoyée, émission e-mail CONFIRMÉE, au moins un dossier DÛ, AUCUNE saisine vivante. La fenêtre (refus
 *  acquis / non forclos) et la fraîcheur sont appliquées EN TS (fenetreCada / releveEstFraiche), sources uniques du calcul. */
const SQL_CANDIDATS =
  `WITH ach AS (
     SELECT demande_id, min(envoye_le) AS envoye_le
       FROM demande_acheminement WHERE canal = 'email' AND statut = 'envoye' GROUP BY demande_id
   )
   SELECT d.id::int AS id, d.reference, c.nom AS commune_nom, d.profil_demandeur AS profil, a.envoye_le,
          (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif) AS dossiers_actifs,
          (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL) AS dossiers_dus
     FROM demande d
     JOIN ach a ON a.demande_id = d.id
     LEFT JOIN commune c ON c.code_insee = d.code_insee
    WHERE d.statut = 'envoyee'
      AND EXISTS (SELECT 1 FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL)
      AND NOT EXISTS (SELECT 1 FROM demande_relance rl WHERE rl.demande_id = d.id AND rl.type = 'saisine_cada' AND rl.statut <> 'abandonnee')
    ORDER BY a.envoye_le ASC`;

export function depsReellesSaisissables(): DepsSaisissables {
  return {
    lireCandidats: async () => {
      const { rows } = await query<{ id: number; reference: string; commune_nom: string | null; profil: string; envoye_le: Date; dossiers_actifs: number; dossiers_dus: number }>(SQL_CANDIDATS);
      return rows.map((r) => ({ demandeId: r.id, reference: r.reference, communeNom: r.commune_nom, profil: profilValide(r.profil), envoyeLe: r.envoye_le, dossiersActifs: r.dossiers_actifs, dossiersDus: r.dossiers_dus }));
    },
    derniereReleveOkLe: async () => {
      const { rows } = await query<{ t: Date | null }>(`SELECT max(termine_le) AS t FROM releve_run WHERE resultat = 'ok'`);
      return rows[0]?.t ?? null;
    },
    fraicheurHeures: async () => (await chargerConfigVeille()).releveFraicheurHeures,
    maintenant: () => new Date(),
  };
}

/**
 * Demandes SAISISSABLES + INDÉTERMINÉES. Une demande n'est saisissable QUE si sa fenêtre est OUVERTE (refus acquis, non
 * forclos) ET la relève est FRAÎCHE — sincérité : on n'affirme JAMAIS un silence non vérifié. Fenêtre non ouverte / forclose
 * → écartée. Fenêtre ouverte MAIS relève non fraîche → INDÉTERMINÉE (pas saisissable).
 */
export async function lireSaisinesEligibles(deps: DepsSaisissables = depsReellesSaisissables()): Promise<SaisiesEligibles> {
  const [candidats, derniereOk, fraicheur] = await Promise.all([deps.lireCandidats(), deps.derniereReleveOkLe(), deps.fraicheurHeures()]);
  const maintenant = deps.maintenant();
  const fraiche = releveEstFraiche(derniereOk, maintenant, fraicheur);
  const saisissables: DemandeSaisissable[] = [];
  const indeterminees: DemandeSaisissable[] = [];
  for (const c of candidats) {
    const f = fenetreCada(c.envoyeLe, maintenant);
    if (f.etat !== 'ouverte') continue; // pas_ouverte (refus non acquis) ou fermee (forclos) → jamais saisissable
    const d: DemandeSaisissable = {
      demandeId: c.demandeId, reference: c.reference, communeNom: c.communeNom, profil: c.profil, envoyeLe: c.envoyeLe,
      refusTaciteLe: f.refusTaciteLe, forclusionLe: f.forclusionLe, joursAvantForclusion: f.joursAvantForclusion,
      dossiersActifs: c.dossiersActifs, dossiersDus: c.dossiersDus,
    };
    (fraiche ? saisissables : indeterminees).push(d); // silence non vérifié → indéterminée
  }
  return { saisissables, indeterminees };
}

// ── POINT 4 : création de la saisine en brouillon ─────────────────────────────
export interface MetaSaisine { statut: string; reference: string; communeNom: string | null; profil: ProfilDemandeur; envoyeLe: Date | null; saisineVivante: boolean }
export interface DepsCreerSaisine {
  lireMeta(demandeId: number): Promise<MetaSaisine | null>;
  chargerContexte(profil: ProfilDemandeur): Promise<ContexteRelance>;
  chargerLot(demandeId: number): Promise<LotRelance | null>;
  derniereReleveOkLe(): Promise<Date | null>;
  maintenant(): Date;
}

export function depsReellesCreerSaisine(): DepsCreerSaisine {
  return {
    lireMeta: async (demandeId) => {
      const { rows } = await query<{ statut: string; reference: string; commune_nom: string | null; profil: string; envoye_le: Date | null; saisine_vivante: boolean }>(
        `SELECT d.statut, d.reference, c.nom AS commune_nom, d.profil_demandeur AS profil,
                (SELECT min(a.envoye_le) FROM demande_acheminement a WHERE a.demande_id = d.id AND a.canal = 'email' AND a.statut = 'envoye') AS envoye_le,
                EXISTS (SELECT 1 FROM demande_relance rl WHERE rl.demande_id = d.id AND rl.type = 'saisine_cada' AND rl.statut <> 'abandonnee') AS saisine_vivante
           FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee WHERE d.id = $1`, [demandeId]);
      const r = rows[0];
      if (!r) return null;
      return { statut: r.statut, reference: r.reference, communeNom: r.commune_nom, profil: profilValide(r.profil), envoyeLe: r.envoye_le, saisineVivante: r.saisine_vivante };
    },
    chargerContexte: (profil) => chargerContexteRelance(profil),
    chargerLot: (demandeId) => chargerLotRelance(demandeId),
    derniereReleveOkLe: async () => {
      const { rows } = await query<{ t: Date | null }>(`SELECT max(termine_le) AS t FROM releve_run WHERE resultat = 'ok'`);
      return rows[0]?.t ?? null;
    },
    maintenant: () => new Date(),
  };
}

/**
 * Crée la saisine en BROUILLON (demande_relance type='saisine_cada', objet+corps FIGÉS à la création, profil de la demande),
 * transactionnelle et journalisée. REFUSE (SaisineCadaError) si la demande n'est pas saisissable au sens du point 2. Un
 * double déclenchement simultané viole demande_relance_vivante_uniq (23505) → intercepté (err.constraint, motif
 * certificatEmission) en refus métier NOMMÉ, jamais un 503. N'écrit JAMAIS demande.statut.
 */
export async function creerSaisineCada(demandeId: number, auteur: string | null, deps: DepsCreerSaisine = depsReellesCreerSaisine()): Promise<number> {
  const meta = await deps.lireMeta(demandeId);
  if (!meta) throw new SaisineCadaError('demande introuvable');
  if (meta.statut !== 'envoyee') throw new SaisineCadaError(`demande « ${meta.statut} » : seule une demande envoyée peut être saisie devant la CADA`);
  if (meta.envoyeLe === null) throw new SaisineCadaError('aucune émission e-mail confirmée : la demande n’a pas de date d’envoi opposable');
  if (meta.saisineVivante) throw new SaisineCadaError('une saisine est déjà en cours pour cette demande');

  const ctx = await deps.chargerContexte(meta.profil);
  const maintenant = deps.maintenant();
  const f = fenetreCada(meta.envoyeLe, maintenant);
  if (f.etat === 'pas_ouverte') throw new SaisineCadaError('le refus tacite n’est pas encore acquis (délai d’un mois non écoulé)');
  if (f.etat === 'fermee') throw new SaisineCadaError('délai de saisine forclos (plus de deux mois depuis le refus tacite)');
  if (!releveEstFraiche(await deps.derniereReleveOkLe(), maintenant, ctx.reglages.releveFraicheurHeures)) {
    throw new SaisineCadaError('silence non vérifié : la relève des réponses n’est pas assez récente pour affirmer une absence de réponse');
  }

  const lot = await deps.chargerLot(demandeId);
  if (lot === null) throw new SaisineCadaError('demande introuvable');
  if (lot.lot.dossiers.length - lot.satisfaitsIds.length <= 0) throw new SaisineCadaError('tous les dossiers sont satisfaits : plus rien à réclamer');

  // genererSaisineCada lève IdentiteIncompleteError / AucunDossierNonSatisfaitError (saisineCada.ts) — laissées remonter.
  const { objet, corps } = genererSaisineCada({
    reference: meta.reference, profil: meta.profil, communeNom: lot.lot.communeNom, lot: lot.lot,
    dossiersSatisfaitsIds: lot.satisfaitsIds, config: ctx.config, pieces: ctx.pieces, envoyeeLe: meta.envoyeLe, refusTaciteLe: f.refusTaciteLe,
  });

  try {
    return await withTransaction(async (q) => {
      const ins = await q<{ id: number }>(
        `INSERT INTO demande_relance (demande_id, type, objet, corps, profil_demandeur, statut)
         VALUES ($1, 'saisine_cada', $2, $3, $4, 'brouillon') RETURNING id`,
        [demandeId, objet, corps, meta.profil]);
      const id = ins.rows[0].id;
      // Journal APPEND-ONLY : aucune transition de statut de la DEMANDE (statut_avant/apres NULL).
      await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`,
        [demandeId, `saisine CADA ${id} créée en brouillon`, auteur]);
      return id;
    });
  } catch (err) {
    // Double déclenchement simultané → l'unique partiel (demande_relance_vivante_uniq) tranche → 23505. Discrimination par
    // err.constraint (motif certificatEmission.ts) → refus métier nommé, jamais un 503.
    const e = err as { code?: string; constraint?: string };
    if (e.code === '23505' && e.constraint === 'demande_relance_vivante_uniq') {
      throw new SaisineCadaError('une saisine est déjà en cours pour cette demande');
    }
    throw err;
  }
}
