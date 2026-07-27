/**
 * Accès données des demandes de communication (chantier S7). ⚠️ N'ENVOIE RIEN. Lit les candidats (top du classement),
 * propose des lots (via `demande.ts`), crée/liste/lit les demandes, édite le corps, change le statut EN JOURNALISANT.
 * Le destinataire est FIGÉ à la création (copie de mairie_contact) — auditabilité.
 */
import { query, withTransaction } from '../db/client';
import { chargerConfigVeille, type ConfigVeille } from './veilleConfig';
import { lireDossiersPriorite, type DossierAffiche } from './veilleRepo';
import type { CanalContact } from './mairieContact';
import {
  type CandidatDossier, type ConfigDemandeur, type Lot, type HistoriqueDemandes, type DiagnosticProposition, type ParamsLot,
  type ProfilDemandeur,
  proposerLots, genererTexte, piecesDepuisConfig, formaterReferenceDemande, problemesIdentite, profilValide, ETIQUETTE_PROFIL,
} from './demande';

type Requete = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;
const asQ = (q: (t: string, p?: unknown[]) => Promise<unknown>): Requete => ((t, p) => q(t, p)) as Requete;

const NB_CANDIDATS = 600; // profondeur de candidats examinés (haut du classement) — large devant un lot mensuel

function adresseDe(d: DossierAffiche): string {
  return [d.adrNumTer, d.adrLibvoieTer, d.adrLocaliteTer].filter((x) => x && x.trim() !== '').join(' ');
}
function versCandidat(d: DossierAffiche): CandidatDossier {
  return {
    dossierId: d.id, codeInsee: d.codeInsee, communeNom: d.communeNom, canal: d.destCanal,
    numDau: d.numDau, dateReelleAutorisation: d.dateReelleAutorisation, adresse: adresseDe(d), codePostal: d.adrCodpostTer, cadastre: d.cadastre,
  };
}

/** Borne d'ancienneté : aujourd'hui − `annees` (format 'AAAA-MM-JJ'). Au-delà, la hauteur est déjà mesurée au LiDAR. */
function dateMinDepuis(annees: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - annees);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function paramsLot(cfg: ConfigVeille): ParamsLot {
  return { dossiersParDemande: cfg.dossiersParDemande, demandesParCommuneParMois: cfg.demandesParCommuneParMois, dateMin: dateMinDepuis(cfg.ancienneteMaxDemandeAnnees) };
}

/** Identité d'un profil (défaut 'entreprise'). Ligne absente → champs vides (jamais d'exception). */
export async function lireConfigDemandeur(profil: ProfilDemandeur = 'entreprise'): Promise<ConfigDemandeur> {
  const r = await query<{ raison_sociale: string; forme_juridique: string; siege_adresse: string; representant_nom: string; representant_qualite: string; email_contact: string; telephone: string }>(
    `SELECT raison_sociale, forme_juridique, siege_adresse, representant_nom, representant_qualite, email_contact, telephone FROM config_demandeur WHERE profil = $1`,
    [profil],
  );
  const x = r.rows[0] ?? { raison_sociale: '', forme_juridique: '', siege_adresse: '', representant_nom: '', representant_qualite: '', email_contact: '', telephone: '' };
  return {
    raisonSociale: x.raison_sociale, formeJuridique: x.forme_juridique, siegeAdresse: x.siege_adresse,
    representantNom: x.representant_nom, representantQualite: x.representant_qualite, emailContact: x.email_contact, telephone: x.telephone,
  };
}

/**
 * Historique : dossiers déjà rattachés (demande active) + nombre de demandes du mois par commune QUI COMPTENT pour le
 * plafond mensuel.
 * ⚠️ Le plafond `demandes_par_commune_par_mois` borne la SOLLICITATION RÉELLE d'une mairie : seules les demandes
 * RÉELLEMENT PARTIES le consomment → `statut IN ('envoyee','close')`. Une 'brouillon' (préparée, jamais envoyée), une
 * 'prete' (prête mais pas partie) et une 'abandonnee' (jamais sortie de la machine) ne sollicitent PAS la commune : elles
 * ne doivent pas geler son quota (sinon des lots parfaitement valides sont bloqués « au plafond » sans qu'aucun courrier
 * n'ait quitté le système). AUCUN ENVOI n'existe encore : ce comptage est donc nul aujourd'hui, et le restera tant que
 * rien n'est envoyé — c'est voulu.
 */
async function lireHistorique(): Promise<HistoriqueDemandes> {
  const [att, mois] = await Promise.all([
    query<{ dossier_id: number }>(`SELECT dossier_id FROM demande_dossier WHERE actif`),
    query<{ code_insee: string; n: number }>(
      `SELECT code_insee, count(*)::int AS n FROM demande
       WHERE statut IN ('envoyee', 'close') AND date_trunc('month', cree_le) = date_trunc('month', now())
       GROUP BY code_insee`,
    ),
  ]);
  return {
    dejaRattaches: new Set(att.rows.map((r) => r.dossier_id)),
    demandesCeMoisParCommune: new Map(mois.rows.map((r) => [r.code_insee, r.n])),
  };
}

/** Compteurs expliquant l'absence de lots — MÊME logique d'exclusion que proposerLots (sans le toucher). */
function diagnostiquer(candidats: CandidatDossier[], hist: HistoriqueDemandes, params: ParamsLot): DiagnosticProposition {
  const sansCanal = new Set<string>();
  const parCommune = new Map<string, number>();
  let rattaches = 0, horsFenetre = 0;
  for (const d of candidats) {
    if (d.dateReelleAutorisation === null || (params.dateMin !== null && d.dateReelleAutorisation < params.dateMin)) { horsFenetre += 1; continue; }
    if (hist.dejaRattaches.has(d.dossierId)) { rattaches += 1; continue; }
    if (d.communeNom === null || d.canal === null || d.canal === 'inconnu') { sansCanal.add(d.codeInsee); continue; }
    parCommune.set(d.codeInsee, (parCommune.get(d.codeInsee) ?? 0) + 1);
  }
  let plafond = 0;
  for (const code of parCommune.keys()) {
    if (params.demandesParCommuneParMois - (hist.demandesCeMoisParCommune.get(code) ?? 0) <= 0) plafond += 1;
  }
  return { candidatsExamines: candidats.length, dossiersHorsFenetre: horsFenetre, dossiersDejaRattaches: rattaches, communesSansCanal: sansCanal.size, communesPlafondMensuel: plafond };
}

/** Lots PROPOSÉS (aucune écriture) + diagnostic (pour expliquer un « 0 lot ») — pour revue avant création. */
export async function proposition(cfg: ConfigVeille): Promise<{ lots: Lot[]; diagnostic: DiagnosticProposition }> {
  const [dossiers, hist] = await Promise.all([lireDossiersPriorite(cfg, NB_CANDIDATS), lireHistorique()]);
  const candidats = dossiers.map(versCandidat);
  const params = paramsLot(cfg);
  return { lots: proposerLots(candidats, params, hist), diagnostic: diagnostiquer(candidats, hist, params) };
}

/** Attribue une référence SVAV-DEM-AAAA-NNNNNN (compteur atomique, verrou de ligne). */
async function attribuerReference(q: Requete, annee: number): Promise<string> {
  const r = await q<{ dernier: number }>(
    `INSERT INTO demande_compteur (annee, dernier) VALUES ($1, 1)
     ON CONFLICT (annee) DO UPDATE SET dernier = demande_compteur.dernier + 1 RETURNING dernier`, [annee],
  );
  return formaterReferenceDemande(annee, r.rows[0].dernier);
}

/**
 * Crée les demandes à partir des lots proposés. Pour chaque lot (transaction) : référence, destinataire FIGÉ (copie de
 * mairie_contact), texte généré, liens dossiers (actif), journal (→brouillon). L'index unique partiel
 * `demande_dossier_unique_actif` est le filet anti-double : si un dossier a été rattaché entre-temps, le lot est ignoré.
 * Retourne les références créées. AUCUN ENVOI.
 */
export async function creerDemandes(cfg: ConfigVeille, annee: number, auteur: string | null, profilDemande?: ProfilDemandeur): Promise<{ crees: string[]; ignores: number; profil: ProfilDemandeur }> {
  const profil = profilDemande ?? profilValide(cfg.profilDemandeurDefaut);
  const { lots } = await proposition(cfg);
  const cfgDem = await lireConfigDemandeur(profil);
  const pieces = piecesDepuisConfig(cfg.piecesDemandees);
  const crees: string[] = [];
  let ignores = 0;
  for (const lot of lots) {
    try {
      const ref = await withTransaction(async (tx) => {
        const q = asQ(tx);
        const reference = await attribuerReference(q, annee);
        const { objet, corps } = genererTexte(lot, cfgDem, reference, pieces, profil);
        const contact = await q<{ email: string | null; url_formulaire: string | null; adresse_postale: string | null }>(
          `SELECT email, url_formulaire, adresse_postale FROM mairie_contact WHERE code_insee = $1`, [lot.codeInsee],
        );
        const ct = contact.rows[0] ?? { email: null, url_formulaire: null, adresse_postale: null };
        const dem = await q<{ id: number }>(
          `INSERT INTO demande (reference, code_insee, statut, objet, corps, profil_demandeur, dest_canal, dest_email, dest_url_formulaire, dest_adresse_postale)
           VALUES ($1, $2, 'brouillon', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [reference, lot.codeInsee, objet, corps, profil, lot.canal, ct.email, ct.url_formulaire, ct.adresse_postale],
        );
        const id = dem.rows[0].id;
        for (const d of lot.dossiers) {
          await q(`INSERT INTO demande_dossier (demande_id, dossier_id, actif) VALUES ($1, $2, true)`, [id, d.dossierId]);
        }
        await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, 'brouillon', 'création', $2)`, [id, auteur]);
        return reference;
      });
      crees.push(ref);
    } catch {
      ignores += 1; // conflit d'unicité (dossier déjà rattaché entre-temps) → lot ignoré, pas d'écriture partielle
    }
  }
  return { crees, ignores, profil };
}

export interface DemandeListe { id: number; reference: string; codeInsee: string; communeNom: string | null; canal: string | null; nbDossiers: number; statut: string; profil: string; creeLe: string }

export interface ResumeDemandes { parStatut: Record<string, number>; total: number; dossiersCouverts: number }

/** Alerte d'identité CIBLÉE : un profil réellement porté par des demandes en brouillon dont l'identité est incomplète. */
export interface AlerteIdentite { profil: ProfilDemandeur; libelle: string; manque: string[] }

export async function listerDemandes(): Promise<{ demandes: DemandeListe[]; alertesIdentite: AlerteIdentite[]; resume: ResumeDemandes }> {
  const [r, rs, rd] = await Promise.all([
    query<{ id: number; reference: string; code_insee: string; commune_nom: string | null; dest_canal: string | null; nb: number; statut: string; profil_demandeur: string; cree_le: string }>(
      `SELECT d.id, d.reference, d.code_insee, c.nom AS commune_nom, d.dest_canal, d.statut, d.profil_demandeur, d.cree_le::text AS cree_le,
              (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id) AS nb
       FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee ORDER BY d.cree_le DESC`),
    query<{ statut: string; n: number }>(`SELECT statut, count(*)::int AS n FROM demande GROUP BY statut`),
    query<{ n: number }>(`SELECT count(DISTINCT dossier_id)::int AS n FROM demande_dossier`),
  ]);
  const parStatut: Record<string, number> = {};
  for (const s of rs.rows) parStatut[s.statut] = s.n;

  // Alertes CIBLÉES : uniquement les profils réellement portés par des demandes EN BROUILLON (celles qui aspirent à
  // passer « prête ») et dont l'identité correspondante est incomplète.
  const profilsBrouillon = [...new Set(r.rows.filter((x) => x.statut === 'brouillon').map((x) => profilValide(x.profil_demandeur)))];
  const alertesIdentite: AlerteIdentite[] = [];
  for (const profil of profilsBrouillon) {
    const manque = problemesIdentite(await lireConfigDemandeur(profil), profil);
    if (manque.length > 0) alertesIdentite.push({ profil, libelle: ETIQUETTE_PROFIL[profil], manque });
  }

  return {
    demandes: r.rows.map((x) => ({ id: x.id, reference: x.reference, codeInsee: x.code_insee, communeNom: x.commune_nom, canal: x.dest_canal, nbDossiers: x.nb, statut: x.statut, profil: x.profil_demandeur, creeLe: x.cree_le })),
    alertesIdentite,
    resume: { parStatut, total: r.rows.length, dossiersCouverts: rd.rows[0]?.n ?? 0 },
  };
}

export interface DemandeDetail extends DemandeListe { objet: string | null; corps: string | null; destEmail: string | null; destUrlFormulaire: string | null; destAdressePostale: string | null; dossiers: { numDau: string; date: string | null }[] }

export async function lireDemande(id: number): Promise<DemandeDetail | null> {
  const r = await query<{ id: number; reference: string; code_insee: string; commune_nom: string | null; statut: string; profil_demandeur: string; objet: string | null; corps: string | null; dest_canal: string | null; dest_email: string | null; dest_url_formulaire: string | null; dest_adresse_postale: string | null; cree_le: string }>(
    `SELECT d.id, d.reference, d.code_insee, c.nom AS commune_nom, d.statut, d.profil_demandeur, d.objet, d.corps,
            d.dest_canal, d.dest_email, d.dest_url_formulaire, d.dest_adresse_postale, d.cree_le::text AS cree_le
     FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee WHERE d.id = $1`, [id],
  );
  const x = r.rows[0];
  if (!x) return null;
  const doss = await query<{ num_dau: string; date: string | null }>(
    `SELECT s.num_dau, s.date_reelle_autorisation::text AS date FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id WHERE dd.demande_id = $1 ORDER BY s.num_dau`, [id],
  );
  return {
    id: x.id, reference: x.reference, codeInsee: x.code_insee, communeNom: x.commune_nom, canal: x.dest_canal,
    nbDossiers: doss.rows.length, statut: x.statut, profil: x.profil_demandeur, creeLe: x.cree_le, objet: x.objet, corps: x.corps,
    destEmail: x.dest_email, destUrlFormulaire: x.dest_url_formulaire, destAdressePostale: x.dest_adresse_postale,
    dossiers: doss.rows.map((d) => ({ numDau: d.num_dau, date: d.date })),
  };
}

/** Édite le corps (et l'objet) d'une demande brouillon. */
export async function majCorps(id: number, corps: string, objet: string | null): Promise<void> {
  await query(`UPDATE demande SET corps = $2, objet = COALESCE($3, objet), maj_le = now() WHERE id = $1 AND statut = 'brouillon'`, [id, corps, objet]);
}

/** Erreur de garde-fou identité (transition bloquée) — champs manquants exposés. */
export class IdentiteIncompleteError extends Error {
  constructor(public champs: string[]) { super('identité du demandeur incomplète'); this.name = 'IdentiteIncompleteError'; }
}

/** Erreur de transition interdite (ex. bascule de profil sur une demande non-brouillon) — raison exposée. */
export class TransitionInterditeError extends Error {
  constructor(public raison: string) { super(raison); this.name = 'TransitionInterditeError'; }
}

/**
 * Change le statut EN JOURNALISANT. Quitter 'brouillon' (→ 'prete') exige une identité demandeur COMPLÈTE (sinon
 * `IdentiteIncompleteError` avec la liste des champs). Abandonner libère les dossiers (demande_dossier.actif=false).
 * ⚠️ 'envoyee' N'EST PAS gérée ici (l'envoi est un chantier ultérieur).
 */
export async function changerStatut(id: number, nouveau: 'prete' | 'abandonnee', auteur: string | null): Promise<void> {
  return changerStatutLot([id], nouveau, auteur);
}

/**
 * Transition de statut d'un LOT de demandes, EN TOUT-OU-RIEN. Pour 'prete', l'identité est vérifiée UNE FOIS avant toute
 * écriture (sinon `IdentiteIncompleteError` → AUCUNE demande touchée). Sinon, toutes les transitions passent dans UNE
 * transaction (échec = rollback total, aucune transition partielle). Chaque transition est journalisée. AUCUN ENVOI.
 */
export async function changerStatutLot(ids: number[], nouveau: 'prete' | 'abandonnee', auteur: string | null): Promise<void> {
  if (ids.length === 0) return;
  if (nouveau === 'prete') {
    // Verrou 'prete' sur l'identité DU PROFIL PORTÉ par chaque demande (pas un profil global). Une seule identité
    // incomplète parmi les profils concernés bloque TOUT le lot (aucune écriture).
    const { rows } = await query<{ profil: string }>(`SELECT DISTINCT profil_demandeur AS profil FROM demande WHERE id = ANY($1::bigint[])`, [ids]);
    const manque: string[] = [];
    for (const { profil } of rows) {
      const p = profilValide(profil);
      for (const x of problemesIdentite(await lireConfigDemandeur(p), p)) manque.push(`${ETIQUETTE_PROFIL[p]} — ${x}`);
    }
    if (manque.length > 0) throw new IdentiteIncompleteError(manque);
  }
  const motif = ids.length > 1 ? 'transition (lot)' : 'transition';
  await withTransaction(async (tx) => {
    const q = asQ(tx);
    for (const id of ids) {
      const av = await q<{ statut: string }>(`SELECT statut FROM demande WHERE id = $1`, [id]);
      const avant = av.rows[0]?.statut ?? null;
      await q(`UPDATE demande SET statut = $2, maj_le = now() WHERE id = $1`, [nouveau, id]);
      if (nouveau === 'abandonnee') await q(`UPDATE demande_dossier SET actif = false WHERE demande_id = $1`, [id]);
      await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, $2, $3, $4, $5)`, [id, avant, nouveau, motif, auteur]);
    }
  });
}

// ── Bascule de profil (régénère le corps depuis l'identité COURANTE du profil cible) ─────────────────────────────────
interface LigneDossierRegen {
  id: number; num_dau: string; date_reelle_autorisation: string | null;
  adr_num_ter: string | null; adr_libvoie_ter: string | null; adr_localite_ter: string | null; adr_codpost_ter: string | null;
  sec_cadastre1: string | null; num_cadastre1: string | null; sec_cadastre2: string | null; num_cadastre2: string | null; sec_cadastre3: string | null; num_cadastre3: string | null;
}
function cadastreDe(r: LigneDossierRegen): string[] {
  const refs: string[] = [];
  for (const [sec, num] of [[r.sec_cadastre1, r.num_cadastre1], [r.sec_cadastre2, r.num_cadastre2], [r.sec_cadastre3, r.num_cadastre3]]) {
    if ((sec ?? '').trim() !== '' || (num ?? '').trim() !== '') refs.push(`${(sec ?? '').trim()} ${(num ?? '').trim()}`.trim());
  }
  return refs;
}

/** Reconstruit le `Lot` d'une demande (pour régénérer son texte) à partir de ses dossiers rattachés. `null` si absente. */
async function chargerPourRegeneration(q: Requete, id: number): Promise<{ statut: string; reference: string; profilAvant: ProfilDemandeur; lot: Lot } | null> {
  const r = await q<{ reference: string; code_insee: string; commune_nom: string | null; dest_canal: string | null; statut: string; profil_demandeur: string }>(
    `SELECT d.reference, d.code_insee, c.nom AS commune_nom, d.dest_canal, d.statut, d.profil_demandeur
     FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee WHERE d.id = $1`, [id],
  );
  const x = r.rows[0];
  if (!x) return null;
  const doss = await q<LigneDossierRegen>(
    `SELECT s.id, s.num_dau, s.date_reelle_autorisation::text AS date_reelle_autorisation,
            s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter, s.adr_codpost_ter,
            s.sec_cadastre1, s.num_cadastre1, s.sec_cadastre2, s.num_cadastre2, s.sec_cadastre3, s.num_cadastre3
     FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
     WHERE dd.demande_id = $1 AND dd.actif ORDER BY s.num_dau`, [id],
  );
  const communeNom = x.commune_nom ?? x.code_insee;
  const dossiers: CandidatDossier[] = doss.rows.map((d) => ({
    dossierId: d.id, codeInsee: x.code_insee, communeNom, canal: (x.dest_canal as CanalContact | null),
    numDau: d.num_dau, dateReelleAutorisation: d.date_reelle_autorisation,
    adresse: [d.adr_num_ter, d.adr_libvoie_ter, d.adr_localite_ter].filter((v) => v && v.trim() !== '').join(' '),
    codePostal: d.adr_codpost_ter, cadastre: cadastreDe(d),
  }));
  const lot: Lot = { codeInsee: x.code_insee, communeNom, canal: (x.dest_canal as CanalContact) ?? 'email', dossiers };
  return { statut: x.statut, reference: x.reference, profilAvant: profilValide(x.profil_demandeur), lot };
}

/** Bascule le profil d'UNE demande (délègue au lot). */
export async function changerProfil(id: number, profil: ProfilDemandeur, auteur: string | null): Promise<void> {
  return changerProfilLot([id], profil, auteur);
}

/**
 * Bascule le profil d'un LOT de demandes, EN TOUT-OU-RIEN (une transaction). Autorisée UNIQUEMENT sur des demandes en
 * 'brouillon' (sinon `TransitionInterditeError` → rollback total, aucune écriture). Régénère l'objet ET le corps depuis
 * l'identité COURANTE du profil cible, met à jour `profil_demandeur`, et journalise le changement (append-only). AUCUN
 * ENVOI. ⚠️ écrase les modifications manuelles du corps (le texte est reconstruit — l'UI en avertit avant d'appeler).
 */
export async function changerProfilLot(ids: number[], profil: ProfilDemandeur, auteur: string | null): Promise<void> {
  if (ids.length === 0) return;
  const cfgVeille = await chargerConfigVeille();
  const cfgProfil = await lireConfigDemandeur(profil);
  const pieces = piecesDepuisConfig(cfgVeille.piecesDemandees);
  await withTransaction(async (tx) => {
    const q = asQ(tx);
    for (const id of ids) {
      const d = await chargerPourRegeneration(q, id);
      if (!d) throw new TransitionInterditeError(`demande ${id} introuvable`);
      if (d.statut !== 'brouillon') throw new TransitionInterditeError(`la demande ${d.reference} n'est pas en brouillon (statut : ${d.statut}) — bascule de profil impossible`);
      const { objet, corps } = genererTexte(d.lot, cfgProfil, d.reference, pieces, profil);
      await q(`UPDATE demande SET objet = $2, corps = $3, profil_demandeur = $4, maj_le = now() WHERE id = $1`, [id, objet, corps, profil]);
      await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, $2, $2, $3, $4)`, [id, d.statut, `profil ${d.profilAvant} → ${profil}`, auteur]);
    }
  });
}
