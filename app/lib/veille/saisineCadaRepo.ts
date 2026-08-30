/**
 * X2 — DÉPÔT de la saisine CADA : lire les demandes SAISISSABLES et créer la saisine en BROUILLON. Écrit UNIQUEMENT
 * demande_relance (type='saisine_cada') et demande_journal ; ne touche JAMAIS demande.statut. AUCUN envoi, aucun écran.
 * Réutilise fenetreCada + releveEstFraiche (echeance.ts), chargerContexteRelance + chargerLotRelance (relanceAuto.ts),
 * genererSaisineCada (saisineCada.ts). Lectures INJECTABLES (test node-pur), écriture transactionnelle.
 */
import { query, withTransaction } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { profilValide, dateEnFrancais, type ProfilDemandeur } from '../sitadel/demande';
import { fenetreCadaEffective, refusAcquis, releveEstFraiche, type VoieCada } from './echeance';
import { saisineLeDe } from './cascadeRelance'; // A (lot 5) — date de dépôt annoncée = échéance + délai (réglage)
import { chargerContexteRelance, chargerLotRelance, type ContexteRelance, type LotRelance } from './relanceAuto';

/** A (lot 5) — jour à partir duquel la saisine TACITE devient déposable : échéance + délai de dépôt (réglage), comme annoncé à
 *  la mairie par le courrier d'étape 'saisine'. Le refus EXPRÈS n'a rien annoncé → aucun délai (déposable dès le refus notifié). */
function deposableTardif(voie: VoieCada, envoyeLe: Date, maintenant: Date, saisineDelaiJours: number): boolean {
  return voie === 'refus_tacite' && maintenant.getTime() < saisineLeDe(envoyeLe, saisineDelaiJours).getTime();
}
import { genererSaisineCada } from './saisineCada';

/** Refus métier d'une action de saisine (non saisissable, saisine déjà en cours…) — raison exposée, jamais un 503. */
export class SaisineCadaError extends Error {
  constructor(public readonly raison: string) { super(raison); this.name = 'SaisineCadaError'; }
}

/** T1/Correction 3 — aucun dossier dont le refus soit ACQUIS au jour de la saisine (tous les dus encore dans leur mois de
 *  silence) → saisine prématurée. Sous-type de SaisineCadaError → traité en 409 métier, jamais un 503. */
export class AucunDossierAcquisError extends SaisineCadaError {
  constructor() { super('aucun dossier dont le refus soit acquis : saisine prématurée (les dossiers dus sont encore dans leur mois de silence)'); this.name = 'AucunDossierAcquisError'; }
}

// ── POINT 2 : lecture des demandes saisissables ───────────────────────────────
export interface DemandeSaisissable {
  demandeId: number; reference: string; communeNom: string | null; profil: ProfilDemandeur;
  envoyeLe: Date; refusTaciteLe: Date; forclusionLe: Date; joursAvantForclusion: number; // refusTaciteLe = date du refus RETENU (tacite OU exprès)
  voie: VoieCada; // T1 : voie d'entrée retenue (refus_expres | refus_tacite) — affichée distinctement dans l'onglet Saisines
  dossiersActifs: number; dossiersDus: number;
  dossiersExclusRefusNonAcquis: number; // T1/Correction 3 : dossiers dus dont le refus N'EST PAS acquis → EXCLUS du corps (jamais muet)
  numeros: string[]; // lot 5b (B) : num_dau des dossiers dus (permis) — affiché dans l'onglet Saisines
}
export interface SaisiesEligibles { saisissables: DemandeSaisissable[]; indeterminees: DemandeSaisissable[] }

/** Candidat brut (filtre SQL passé) AVANT classification fenêtre/fraîcheur. `refusExpres` = dates de refus exprès des dossiers dus. */
export interface CandidatSaisine {
  demandeId: number; reference: string; communeNom: string | null; profil: ProfilDemandeur;
  envoyeLe: Date; dossiersActifs: number; dossiersDus: number; refusExpres: Date[]; numeros: string[]; // lot 5b (B) : num_dau des dus
}

export interface DepsSaisissables {
  lireCandidats(): Promise<CandidatSaisine[]>;
  derniereReleveOkLe(): Promise<Date | null>;
  fraicheurHeures(): Promise<number>;
  saisineDelaiJours(): Promise<number>; // A (lot 5) — délai de dépôt (config_veille.relance_saisine_delai_jours) : la saisine tacite n'est possible qu'à échéance + ce délai
  butoirsPartiel(): Promise<Map<number, Date>>; // CASC-2 — par demande à « dossier partiel » actif : butoir prolongé (partiel_le + 1 mois + 4 j). Map vide = aucune prolongation
  maintenant(): Date;
}

/** Filtre SQL : demande envoyée, émission e-mail CONFIRMÉE, au moins un dossier DÛ, AUCUNE saisine vivante. La fenêtre (refus
 *  acquis / non forclos) et la fraîcheur sont appliquées EN TS (fenetreCada / releveEstFraiche), sources uniques du calcul. */
const SQL_CANDIDATS =
  `WITH ach AS (
     -- B2 — ancre CADA agnostique au canal : un dépôt téléservice écrit statut='envoye' sous canal='formulaire' (pas 'email').
     SELECT demande_id, min(envoye_le) AS envoye_le
       FROM demande_acheminement WHERE statut = 'envoye' GROUP BY demande_id
   )
   SELECT d.id::int AS id, d.reference, c.nom AS commune_nom, d.profil_demandeur AS profil, a.envoye_le,
          (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif) AS dossiers_actifs,
          (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL) AS dossiers_dus,
          -- lot 5b (B) : num_dau des dossiers dus (permis affichés dans l'onglet Saisines).
          coalesce((SELECT array_agg(s.num_dau ORDER BY s.num_dau) FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
                     WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL), '{}') AS dus_nums,
          -- T1 : dates de refus EXPRÈS des dossiers encore dus (ancre CADA immédiate ; l'éligibilité effective est calculée en TS).
          (SELECT coalesce(array_agg(dd.refus_le), '{}') FROM demande_dossier dd
            WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL AND dd.triage = 'refus_mairie') AS refus_expres
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
      const { rows } = await query<{ id: number; reference: string; commune_nom: string | null; profil: string; envoye_le: Date; dossiers_actifs: number; dossiers_dus: number; refus_expres: Date[]; dus_nums: string[] }>(SQL_CANDIDATS);
      return rows.map((r) => ({ demandeId: r.id, reference: r.reference, communeNom: r.commune_nom, profil: profilValide(r.profil), envoyeLe: r.envoye_le, dossiersActifs: r.dossiers_actifs, dossiersDus: r.dossiers_dus, refusExpres: r.refus_expres ?? [], numeros: r.dus_nums ?? [] }));
    },
    butoirsPartiel: async () => {
      const cfg = await chargerConfigVeille(); // CASC-2 — délai (mois + jours) piloté par config_veille (repli 1 mois + 4 j si 178 absente)
      const { lireButoirsPartiel } = await import('../permis/dossierPartielRepo');
      return lireButoirsPartiel(cfg.cadaPartielDelaiMois, cfg.cadaPartielDelaiJours);
    },
    derniereReleveOkLe: async () => {
      const { rows } = await query<{ t: Date | null }>(`SELECT max(termine_le) AS t FROM releve_run WHERE resultat = 'ok'`);
      return rows[0]?.t ?? null;
    },
    fraicheurHeures: async () => (await chargerConfigVeille()).releveFraicheurHeures,
    saisineDelaiJours: async () => (await chargerConfigVeille()).relanceSaisineDelaiJours, // A (lot 5)
    maintenant: () => new Date(),
  };
}

/**
 * Demandes SAISISSABLES + INDÉTERMINÉES. Une demande n'est saisissable QUE si sa fenêtre est OUVERTE (refus acquis, non
 * forclos) ET la relève est FRAÎCHE — sincérité : on n'affirme JAMAIS un silence non vérifié. Fenêtre non ouverte / forclose
 * → écartée. Fenêtre ouverte MAIS relève non fraîche → INDÉTERMINÉE (pas saisissable).
 */
export async function lireSaisinesEligibles(deps: DepsSaisissables = depsReellesSaisissables()): Promise<SaisiesEligibles> {
  const [candidats, derniereOk, fraicheur, saisineDelai, butoirsPartiel] = await Promise.all([deps.lireCandidats(), deps.derniereReleveOkLe(), deps.fraicheurHeures(), deps.saisineDelaiJours(), deps.butoirsPartiel()]);
  const maintenant = deps.maintenant();
  const fraiche = releveEstFraiche(derniereOk, maintenant, fraicheur);
  const saisissables: DemandeSaisissable[] = [];
  const indeterminees: DemandeSaisissable[] = [];
  for (const c of candidats) {
    // CASC-2 — DOSSIER PARTIEL : l'éligibilité N'EST PAS suspendue, seul son POINT DE DÉPART est REPOUSSÉ. Tant que le butoir prolongé
    //   (partiel_le + 1 mois + 4 j, calculé sur la PREMIÈRE réclamation) n'est pas atteint, la saisine n'est pas encore proposable —
    //   même gate « pas encore déposable » que la saisine tacite. Marqueur levé → aucun butoir → éligibilité ordinaire (rien ici).
    const butoir = butoirsPartiel.get(c.demandeId);
    if (butoir !== undefined && maintenant.getTime() < butoir.getTime()) continue;
    // T1/Correction 1 — ancre = refus le plus PRÉCOCE déjà acquis (tacite OU exprès), jamais fenetreCada(envoyeLe) seule.
    const { fenetre: f, voie } = fenetreCadaEffective(c.envoyeLe, c.refusExpres, maintenant);
    if (f.etat !== 'ouverte' || voie === null) continue; // aucun refus acquis (pas_ouverte) ou forclos → jamais saisissable
    // A (lot 5) — saisine TACITE pas encore déposable (échéance + délai annoncé) → hors des « possibles » (comme avant l'échéance).
    if (deposableTardif(voie, c.envoyeLe, maintenant, saisineDelai)) continue;
    // T1/Correction 3 — dossiers dus dont le refus N'EST PAS acquis (exclus du corps). Tacite échu → tous les dus sont acquis.
    const taciteAcquis = refusAcquis(c.envoyeLe, null, maintenant); // = echeanceDe(envoyeLe) ≤ maintenant
    const exprAcquis = c.refusExpres.filter((r) => r.getTime() <= maintenant.getTime()).length;
    const exclus = taciteAcquis ? 0 : Math.max(0, c.dossiersDus - exprAcquis);
    const d: DemandeSaisissable = {
      demandeId: c.demandeId, reference: c.reference, communeNom: c.communeNom, profil: c.profil, envoyeLe: c.envoyeLe,
      refusTaciteLe: f.refusTaciteLe, forclusionLe: f.forclusionLe, joursAvantForclusion: f.joursAvantForclusion, voie,
      dossiersActifs: c.dossiersActifs, dossiersDus: c.dossiersDus, dossiersExclusRefusNonAcquis: exclus, numeros: c.numeros,
    };
    (fraiche ? saisissables : indeterminees).push(d); // silence non vérifié → indéterminée
  }
  return { saisissables, indeterminees };
}

// ── POINT 4 : création de la saisine en brouillon ─────────────────────────────
export interface MetaSaisine { statut: string; reference: string; communeNom: string | null; profil: ProfilDemandeur; envoyeLe: Date | null; saisineVivante: boolean;
  dusRefus: { dossierId: number; refusLe: Date | null }[]; // T1 : dossiers DUS avec leur date de refus exprès (null hors refus_mairie) — ancre + filtre du corps
}
export interface DepsCreerSaisine {
  lireMeta(demandeId: number): Promise<MetaSaisine | null>;
  chargerContexte(profil: ProfilDemandeur): Promise<ContexteRelance>;
  chargerLot(demandeId: number): Promise<LotRelance | null>;
  derniereReleveOkLe(): Promise<Date | null>;
  butoirPartiel(demandeId: number): Promise<Date | null>; // CASC-4 : butoir CASC-2 si la demande est PARTIELLE (marqueur actif), sinon null
  maintenant(): Date;
}

export function depsReellesCreerSaisine(): DepsCreerSaisine {
  return {
    lireMeta: async (demandeId) => {
      const { rows } = await query<{ statut: string; reference: string; commune_nom: string | null; profil: string; envoye_le: Date | null; saisine_vivante: boolean; dus_refus: { dossierId: number; refusLe: string | null }[] }>(
        `SELECT d.statut, d.reference, c.nom AS commune_nom, d.profil_demandeur AS profil,
                (SELECT min(a.envoye_le) FROM demande_acheminement a WHERE a.demande_id = d.id AND a.statut = 'envoye') AS envoye_le, -- B2 : agnostique au canal
                EXISTS (SELECT 1 FROM demande_relance rl WHERE rl.demande_id = d.id AND rl.type = 'saisine_cada' AND rl.statut <> 'abandonnee') AS saisine_vivante,
                (SELECT coalesce(json_agg(json_build_object('dossierId', dd.dossier_id, 'refusLe', dd.refus_le) ORDER BY dd.dossier_id), '[]'::json)
                   FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL) AS dus_refus -- T1 : dossiers dus + refus exprès
           FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee WHERE d.id = $1`, [demandeId]);
      const r = rows[0];
      if (!r) return null;
      return { statut: r.statut, reference: r.reference, communeNom: r.commune_nom, profil: profilValide(r.profil), envoyeLe: r.envoye_le, saisineVivante: r.saisine_vivante,
        dusRefus: (r.dus_refus ?? []).map((x) => ({ dossierId: x.dossierId, refusLe: x.refusLe ? new Date(x.refusLe) : null })) };
    },
    chargerContexte: (profil) => chargerContexteRelance(profil),
    chargerLot: (demandeId) => chargerLotRelance(demandeId),
    derniereReleveOkLe: async () => {
      const { rows } = await query<{ t: Date | null }>(`SELECT max(termine_le) AS t FROM releve_run WHERE resultat = 'ok'`);
      return rows[0]?.t ?? null;
    },
    butoirPartiel: async (demandeId) => {
      const cfg = await chargerConfigVeille(); // CASC-4 — butoir CASC-2 (repli 1 mois + 4 j si 178 absente) ; null si demande non partielle
      const { butoirPartielActif } = await import('../permis/dossierPartielRepo');
      return butoirPartielActif(demandeId, cfg.cadaPartielDelaiMois, cfg.cadaPartielDelaiJours);
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
  const envoyeLe = meta.envoyeLe; // Date (garde ci-dessus) — capturé en const pour flotter dans les closures ci-dessous

  const ctx = await deps.chargerContexte(meta.profil);
  const maintenant = deps.maintenant();
  // CASC-4 — RÉGIME UNIQUE : une demande est soit ORDINAIRE, soit PARTIELLE, jamais les deux. Sur une demande PARTIELLE (marqueur
  //   CASC-1 actif), la saisine CADA n'est proposable qu'au BUTOIR CASC-2 (partiel_le + 1 mois + 4 j). On garde ICI, à la CRÉATION
  //   (pas seulement à la proposition lireSaisinesEligibles) : refus explicite motivé, jamais un échec silencieux.
  const butoirPartiel = await deps.butoirPartiel(demandeId);
  if (butoirPartiel !== null && maintenant.getTime() < butoirPartiel.getTime()) {
    throw new SaisineCadaError(`dossier partiel : la saisine CADA ne sera proposable qu'au ${dateEnFrancais(butoirPartiel.toISOString().slice(0, 10))} (délai prolongé depuis la 1re réclamation de pièces)`);
  }
  // T1/Correction 1 — ANCRE EFFECTIVE (refus le plus précoce déjà acquis, tacite OU exprès), jamais fenetreCada(envoyeLe) seule.
  const refusExpres = meta.dusRefus.map((x) => x.refusLe).filter((d): d is Date => d !== null);
  const { fenetre: f, voie } = fenetreCadaEffective(envoyeLe, refusExpres, maintenant);
  if (f.etat === 'pas_ouverte' || voie === null) throw new SaisineCadaError('aucun refus acquis : ni refus tacite (délai d’un mois non écoulé) ni refus exprès notifié');
  if (f.etat === 'fermee') throw new SaisineCadaError('délai de saisine forclos (plus de deux mois depuis le refus)');
  // A (lot 5) — la FORCLUSION prime toujours ; SI encore ouverte, la saisine TACITE n'est déposable qu'à échéance + délai (réglage) :
  //   déposer avant contredirait la date annoncée à la mairie par le courrier d'étape 'saisine'.
  if (deposableTardif(voie, envoyeLe, maintenant, ctx.cascade.saisineDelaiJours)) {
    throw new SaisineCadaError(`date de dépôt annoncée non atteinte : la saisine sera possible le ${dateEnFrancais(saisineLeDe(envoyeLe, ctx.cascade.saisineDelaiJours).toISOString().slice(0, 10))} (échéance + ${ctx.cascade.saisineDelaiJours} j, comme annoncé à la mairie)`);
  }
  if (!releveEstFraiche(await deps.derniereReleveOkLe(), maintenant, ctx.reglages.releveFraicheurHeures)) {
    throw new SaisineCadaError('silence non vérifié : la relève des réponses n’est pas assez récente pour affirmer une absence de réponse');
  }

  const lot = await deps.chargerLot(demandeId);
  if (lot === null) throw new SaisineCadaError('demande introuvable');
  // T1/Correction 3 — le corps ne liste QUE les dossiers dont le refus est ACQUIS (exprès notifié OU tacite échu). Les dus encore
  //   dans leur mois de silence sont EXCLUS (la CADA les écarterait — prématurés). ⚠️ DETTE : demande_relance_vivante_uniq interdit
  //   une 2e saisine vivante par demande → un dossier exclu aujourd'hui n'aura pas SA saisine plus tard sans chantier dédié.
  const refusParDossier = new Map(meta.dusRefus.map((x) => [x.dossierId, x.refusLe]));
  const satisfaits = new Set(lot.satisfaitsIds);
  const dusIds = lot.lot.dossiers.map((d) => d.dossierId).filter((id) => !satisfaits.has(id));
  if (dusIds.length === 0) throw new SaisineCadaError('tous les dossiers sont satisfaits : plus rien à réclamer');
  const exclusNonAcquis = dusIds.filter((id) => !refusAcquis(envoyeLe, refusParDossier.get(id) ?? null, maintenant));
  if (dusIds.length - exclusNonAcquis.length <= 0) throw new AucunDossierAcquisError();

  // genererSaisineCada lève IdentiteIncompleteError / AucunDossierNonSatisfaitError (saisineCada.ts) — laissées remonter.
  const { objet, corps } = genererSaisineCada({
    reference: meta.reference, profil: meta.profil, communeNom: lot.lot.communeNom, lot: lot.lot,
    dossiersSatisfaitsIds: [...lot.satisfaitsIds, ...exclusNonAcquis], // T1 : exclut satisfaits + refus NON acquis (corps = refus acquis seulement)
    config: ctx.config, pieces: ctx.pieces, envoyeeLe: envoyeLe, refusTaciteLe: f.refusTaciteLe,
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

/** Sens d'un avis CADA — liste FERMÉE (miroir exact du CHECK avis_sens, migration 083). Garde pour l'interface d'admin. */
export const SENS_AVIS = ['favorable', 'defavorable', 'sans_suite'] as const;
export type SensAvis = (typeof SENS_AVIS)[number];

/**
 * X4 — enregistre l'AVIS rendu par la CADA sur une saisine (avis_recu_le + avis_sens, migration 083), transactionnel et
 * journalisé. REFUSE (garde `AND statut='envoyee'`) toute saisine qui n'a pas été envoyée : un brouillon / une saisine
 * abandonnée ne peut pas « recevoir » un avis → 0 ligne → SaisineCadaError (→ 409 côté route). N'écrit JAMAIS demande.statut.
 */
export async function enregistrerAvisSaisine(saisineId: number, sens: SensAvis, auteur: string | null): Promise<void> {
  await withTransaction(async (q) => {
    const res = await q<{ demande_id: number }>(
      `UPDATE demande_relance SET avis_recu_le = now(), avis_sens = $2 WHERE id = $1 AND type = 'saisine_cada' AND statut = 'envoyee' RETURNING demande_id`,
      [saisineId, sens]);
    const row = res.rows[0];
    if (!row) throw new SaisineCadaError('saisine introuvable ou non envoyée (seule une saisine envoyée à la CADA peut recevoir un avis)');
    // Journal APPEND-ONLY : aucune transition de statut de la DEMANDE (statut_avant/apres NULL).
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`,
      [row.demande_id, `avis CADA « ${sens} » enregistré pour la saisine ${saisineId}`, auteur]);
  });
}

/**
 * X3 — canal FORMULAIRE : marque une saisine comme DÉPOSÉE À LA MAIN sur le formulaire en ligne de la CADA (statut 'envoyee'
 * + envoyee_le, journal mentionnant le dépôt). AUCUNE ligne d'acheminement (il n'y a aucune émission e-mail à prouver).
 * Transactionnelle. REFUSE (garde `AND statut='brouillon'`) toute saisine qui n'est pas en brouillon. Appelée par l'écran (X4).
 */
export async function marquerSaisineDeposee(saisineId: number, auteur: string | null): Promise<void> {
  await withTransaction(async (q) => {
    const res = await q<{ demande_id: number }>(
      `UPDATE demande_relance SET statut = 'envoyee', envoyee_le = now() WHERE id = $1 AND type = 'saisine_cada' AND statut = 'brouillon' RETURNING demande_id`,
      [saisineId]);
    const row = res.rows[0];
    if (!row) throw new SaisineCadaError('saisine introuvable ou déjà déposée/abandonnée (seule une saisine en brouillon peut être marquée déposée)');
    // Journal APPEND-ONLY : aucune transition de statut de la DEMANDE (statut_avant/apres NULL).
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`,
      [row.demande_id, `saisine CADA ${saisineId} déposée à la main sur le formulaire en ligne`, auteur]);
  });
}

// ── X5 : lecture du CONTEXTE de la page de confirmation (lien e-mail) ──────────
/**
 * État d'une demande vis-à-vis d'une saisine CADA, du point de vue de la page de confirmation. MIROIR (en LECTURE) des gardes
 * de creerSaisineCada — l'AUTORITÉ reste creerSaisineCada au POST (qui peut encore refuser si l'état a changé entre-temps).
 * Seul 'saisissable' autorise le bouton.
 */
export type EtatConfirmation =
  | 'saisissable' | 'deja_lancee' | 'forclose' | 'refus_non_acquis'
  | 'delai_non_atteint' // A (lot 5) : refus tacite acquis, mais la date de dépôt annoncée (échéance + délai) n'est pas atteinte
  | 'plus_de_dossier' | 'silence_non_verifie' | 'demande_absente' | 'demande_hors_etat';

export interface ContexteConfirmation {
  etat: EtatConfirmation;
  reference: string | null;
  communeNom: string | null;
  envoyeLe: Date | null;
  refusTaciteLe: Date | null;
  forclusionLe: Date | null;
  joursAvantForclusion: number | null;
  voie: VoieCada | null;                 // T1 : voie retenue (refus_expres | refus_tacite) ; null hors fenêtre ouverte
  dossiersDusNums: string[];
  dossiersExclusRefusNonAcquis: number;  // T1/Correction 3 : dossiers dus exclus du corps (refus pas encore acquis)
  dejaLanceeLe: Date | null; // envoyee_le de la saisine déjà lancée (si 'envoyee'), sinon null
}

export interface LigneConfirmationDB {
  statut: string;
  reference: string;
  commune_nom: string | null;
  envoye_le: Date | null;
  dossiers_dus_nums: string[];
  refus_expres: Date[];            // T1 : dates de refus exprès des dossiers dus (ancre effective + exclus)
  saisine_statut: string | null;   // statut d'une saisine_cada vivante (≠ 'abandonnee'), ou null
  saisine_envoyee_le: Date | null;
}

export interface DepsConfirmation {
  lire(demandeId: number): Promise<LigneConfirmationDB | null>;
  derniereReleveOkLe(): Promise<Date | null>;
  fraicheurHeures(): Promise<number>;
  saisineDelaiJours(): Promise<number>; // A (lot 5) — date de dépôt annoncée = échéance + délai
  maintenant(): Date;
}

const SQL_CONFIRMATION =
  `SELECT d.statut, d.reference, c.nom AS commune_nom,
          (SELECT min(a.envoye_le) FROM demande_acheminement a WHERE a.demande_id = d.id AND a.statut = 'envoye') AS envoye_le, -- B2 : agnostique au canal
          COALESCE((SELECT array_agg(s.num_dau ORDER BY s.num_dau)
                      FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
                     WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL), '{}') AS dossiers_dus_nums,
          COALESCE((SELECT array_agg(dd.refus_le) FROM demande_dossier dd
                     WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL AND dd.triage = 'refus_mairie'), '{}') AS refus_expres, -- T1 : ancre effective
          (SELECT rl.statut FROM demande_relance rl WHERE rl.demande_id = d.id AND rl.type = 'saisine_cada' AND rl.statut <> 'abandonnee' ORDER BY rl.id DESC LIMIT 1) AS saisine_statut,
          (SELECT rl.envoyee_le FROM demande_relance rl WHERE rl.demande_id = d.id AND rl.type = 'saisine_cada' AND rl.statut <> 'abandonnee' ORDER BY rl.id DESC LIMIT 1) AS saisine_envoyee_le
     FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee
    WHERE d.id = $1`;

export function depsReellesConfirmation(): DepsConfirmation {
  return {
    lire: async (demandeId) => {
      const { rows } = await query<LigneConfirmationDB>(SQL_CONFIRMATION, [demandeId]);
      return rows[0] ?? null;
    },
    derniereReleveOkLe: async () => {
      const { rows } = await query<{ t: Date | null }>(`SELECT max(termine_le) AS t FROM releve_run WHERE resultat = 'ok'`);
      return rows[0]?.t ?? null;
    },
    fraicheurHeures: async () => (await chargerConfigVeille()).releveFraicheurHeures,
    saisineDelaiJours: async () => (await chargerConfigVeille()).relanceSaisineDelaiJours, // A (lot 5)
    maintenant: () => new Date(),
  };
}

/**
 * Contexte à afficher sur la page de confirmation d'une demande. Classe l'état EN TS dans le MÊME ordre que creerSaisineCada :
 * absente → saisine déjà vivante → demande hors état → refus non acquis → forclose → plus de dossier → silence non vérifié →
 * saisissable. N'expose que l'identification du dossier (référence, commune, dates, jours, numéros de dossiers dus) — aucune
 * donnée personnelle. Ne DÉCIDE rien : le bouton (côté page) n'apparaît que pour 'saisissable', et le POST re-garde de toute façon.
 */
export async function chargerConfirmationCada(demandeId: number, deps: DepsConfirmation = depsReellesConfirmation()): Promise<ContexteConfirmation> {
  const l = await deps.lire(demandeId);
  const vide: Omit<ContexteConfirmation, 'etat'> = { reference: null, communeNom: null, envoyeLe: null, refusTaciteLe: null, forclusionLe: null, joursAvantForclusion: null, voie: null, dossiersDusNums: [], dossiersExclusRefusNonAcquis: 0, dejaLanceeLe: null };
  if (!l) return { etat: 'demande_absente', ...vide };

  const socle = { reference: l.reference, communeNom: l.commune_nom, envoyeLe: l.envoye_le, voie: null as VoieCada | null, dossiersDusNums: l.dossiers_dus_nums ?? [], dossiersExclusRefusNonAcquis: 0 };
  // Saisine déjà vivante (brouillon ou envoyée) → « déjà lancée » (avec la date si elle est partie). Prioritaire (anti-doublon visible).
  if (l.saisine_statut !== null) {
    return { etat: 'deja_lancee', ...socle, refusTaciteLe: null, forclusionLe: null, joursAvantForclusion: null, dejaLanceeLe: l.saisine_statut === 'envoyee' ? l.saisine_envoyee_le : null };
  }
  if (l.statut !== 'envoyee' || l.envoye_le === null) {
    return { etat: 'demande_hors_etat', ...socle, refusTaciteLe: null, forclusionLe: null, joursAvantForclusion: null, dejaLanceeLe: null };
  }
  // T1/Correction 1 — ancre effective (refus le plus précoce acquis) + voie ; Correction 3 — dus exclus car refus non acquis.
  const { fenetre: f, voie } = fenetreCadaEffective(l.envoye_le, l.refus_expres ?? [], deps.maintenant());
  const taciteAcquis = refusAcquis(l.envoye_le, null, deps.maintenant());
  const exprAcquis = (l.refus_expres ?? []).filter((r) => r.getTime() <= deps.maintenant().getTime()).length;
  const exclus = taciteAcquis ? 0 : Math.max(0, (l.dossiers_dus_nums ?? []).length - exprAcquis);
  const avecFenetre = { ...socle, refusTaciteLe: f.refusTaciteLe, forclusionLe: f.forclusionLe, joursAvantForclusion: f.joursAvantForclusion, voie, dossiersExclusRefusNonAcquis: exclus, dejaLanceeLe: null };
  if (f.etat === 'pas_ouverte' || voie === null) return { etat: 'refus_non_acquis', ...avecFenetre };
  if (f.etat === 'fermee') return { etat: 'forclose', ...avecFenetre };
  // A (lot 5) — refus tacite acquis MAIS date de dépôt annoncée (échéance + délai) non atteinte → pas encore déposable (bouton masqué).
  if (deposableTardif(voie, l.envoye_le, deps.maintenant(), await deps.saisineDelaiJours())) return { etat: 'delai_non_atteint', ...avecFenetre };
  if ((l.dossiers_dus_nums ?? []).length === 0) return { etat: 'plus_de_dossier', ...avecFenetre };
  const fraiche = releveEstFraiche(await deps.derniereReleveOkLe(), deps.maintenant(), await deps.fraicheurHeures());
  if (!fraiche) return { etat: 'silence_non_verifie', ...avecFenetre };
  return { etat: 'saisissable', ...avecFenetre };
}
