// TUILE « TRANSACTION » (Arno, 27/10/2026) — LA BASE : lectures, saisies, modifications, rattachements, retours en arrière.
// Pas de `import 'server-only'` (même convention que les dépôts de la Location lus par les scripts) ; aucun composant client ne
// l'importe. 🔴 RIEN N'EST JAMAIS SUPPRIMÉ : retirer = `retire_le` ; chaque geste écrit au journal sa valeur avant / après, et
// « Annuler » rejoue la valeur d'avant (un nouveau geste, journalisé lui aussi).
import { query, withTransaction, type RequeteTx } from '../db/client';
import { annulationDisponible, commissionneDisponible, droitTransactionDisponible, interCabinetDisponible, modeCommissionDisponible, personneTypeDisponible, prixVenteDisponible, repartitionDisponible, statutDisponible, uniteCommissionDisponible } from '../admin/schemaDroits';
import { estCivilite, estModeCommission, estSociete, LIBELLE_SOCIETE, societePorteuse, TVA, type Attribution, type RepresentantVente, type CaARattacher, type DossierVente, type GestionMois, type LigneVente, type ModeCommission, type Partie, type PersonneVente, type Retrocession,
  type MontantSaisi, type Societe, type SortePartie, type Vente } from './modele';
import type { AnnulationSaisie, ChampsVente, DossierSaisie, GestionSaisie, RetroSaisie, VenteSaisie } from './saisie';
import { verifierRepartition } from './repartition';
import { miroirsAttendus, planRegistre, venteDansSociete, type EntreeRegistre } from './interCabinet';
import { calculDansUnite, estUnite, honorairesDuCote, TAUX_REMUNERATION_DEFAUT } from './commissions';
import { libelleDesPersonnes, personneExistante } from './personnes';
import { statutLu, type Statut } from '../admin/statut';
import { statutsDesComptes } from '../admin/statutCompte';
import { commissionneEffectif, commissionneLu } from '../admin/commissionneCompte';
import { lireAliasNegociateurs, lireComptesNegociateurs } from '../location/suivi/negociateurIdentiteRepo';
import { rattacherLibelle } from '../location/suivi/negociateurIdentite';
import { comptesDeLOnglet } from './societeNegociateur';
import { lireFichesStatut, statutDeFiche } from './statutSansCompte';
import { LES_DEUX, societeALaDate, societeDOffice, type PeriodeSociete, type SocieteCompte } from './societeNegociateur';

export interface AuteurTx { id: number | null; libelle: string }
export type Issue<T = undefined> = { ok: true; valeur?: T } | { ok: false; motif: string };

/** Les tables de la tuile existent-elles (migration 433) ? Sonde mémorisée (« oui » seulement), partagée avec le droit. */
export const transactionDisponible = (): Promise<boolean> => droitTransactionDisponible();
export const MOTIF_SANS_MIGRATION = 'Disponible après la mise à jour de la base (migration 433) : rien n’a été enregistré.';

const n = (v: unknown): number => Number(v);
const nOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const t = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
/** Une date lue en texte (« AAAA-MM-JJ », `to_char`) — jamais un objet Date du pilote (minuit local : la veille en UTC). */
const jour = (v: unknown): string | null => (v === null || v === undefined ? null : String(v).slice(0, 10));
const moisDe = (v: unknown): number | null => { const d = jour(v); return d === null ? null : Number(d.slice(5, 7)); };
/** LOT V — le mode d'une commission lu en base (442) ; autre chose ou NULL : null (déduit). */
const modeLu = (v: unknown): ModeCommission | null => (estModeCommission(v) ? v : null);
const premierDuMois = (annee: number, mois: number | null): string | null => (mois === null ? null : `${annee}-${String(mois).padStart(2, '0')}-01`);

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * LOT I — la rétrocession de l'apporteur dans SON unité : HT si `retro_apporteur_ht` (437) est posé, sinon TTC (`retro_apporteur_ttc`,
 * comme avant) ; null : aucune (vide ou 0).
 */
function retroDe(r: Record<string, unknown>): MontantSaisi | null {
  if (r.retro_apporteur_ht != null) return n(r.retro_apporteur_ht) === 0 ? null : { montant: n(r.retro_apporteur_ht), unite: 'ht' };
  return r.retro_apporteur_ttc == null || n(r.retro_apporteur_ttc) === 0 ? null : { montant: n(r.retro_apporteur_ttc), unite: 'ttc' };
}
const ttcDe = (m: MontantSaisi | null): number => (m === null ? 0 : m.unite === 'ttc' ? m.montant : m.montant * TVA);

function venteDe(r: Record<string, unknown>, lignes: LigneVente[], lotD?: { parties: Partie[]; personnes: PersonneVente[] }): Vente {
  const retro = lotD !== undefined ? retroDe(r) : null;
  const avecLotD = lotD !== undefined ? {
    repartition: r.repartition === true ? { parties: lotD.parties, retroApporteurTtc: ttcDe(retro) } : null,
    dossier: dossierDe(r, lotD.personnes),
    retroApporteur: retro,
  } : {};
  const avecAnnulation = 'annulation_motif' in r
    ? { annulation: r.annulation_motif == null ? null : { date: jour(r.annulation_date), motif: String(r.annulation_motif), note: t(r.annulation_note) } } : {};
  return { ...avecLotD, ...avecAnnulation, ...('prix_vente' in r ? { prixVente: nOuNull(r.prix_vente) } : {}), id: n(r.id), societe: r.societe as Societe, libelle: String(r.libelle), honorairesTtc: n(r.honoraires_ttc), statut: r.statut as Vente['statut'],
    annee: n(r.annee), mois: moisDe(r.mois_acte), dateCompromis: jour(r.date_compromis), apporteur: t(r.apporteur), note: t(r.note),
    origine: r.origine as Vente['origine'], sourceFichier: t(r.source_fichier), sourceOnglet: t(r.source_onglet), sourceLigne: nOuNull(r.source_ligne), lignes,
    double: r.double_cle === null || r.double_cle === undefined ? null : { cle: String(r.double_cle), attribution: r.attribution as Attribution } };
}

/** LOT D — le dossier d'une vente lu en base (colonnes de la 434) ; null s'il est vide. */
function dossierDe(r: Record<string, unknown>, personnes: PersonneVente[]): DossierVente | null {
  const d: DossierVente = { adresseBien: t(r.adresse_bien), dateActePrevue: jour(r.date_acte_prevue), dateActe: jour(r.date_acte),
    entree: r.negociateur_entree_id == null ? null : { id: n(r.negociateur_entree_id), nom: String(r.entree_nom ?? '') },
    sortie: r.negociateur_sortie_id == null ? null : { id: n(r.negociateur_sortie_id), nom: String(r.sortie_nom ?? '') },
    apporteurId: nOuNull(r.apporteur_id), personnes };
  return d.adresseBien === null && d.dateActePrevue === null && d.dateActe === null && d.entree === null && d.sortie === null && d.apporteurId === null
    && personnes.length === 0 ? null : d;
}
const NOM_COMPTE = (col: string): string =>
  `(SELECT coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), u.identifiant) FROM admin_utilisateur u WHERE u.id = v.${col})`;

/**
 * Les ventes (et compromis) non retirés d'une société — toutes si `societe` est null — avec leurs lignes. LOT D (434 appliquée) : une
 * vente RÉPARTIE se lit avec ses parties et ses personnes. 🔴 LOT R — L'INTER-CABINET : pour une société, la vente qu'elle PORTE (négociateur
 * d'entrée) telle quelle ; celle que l'autre société porte et dont elle reçoit une part, sa LIGNE MIROIR (sa seule part) ; une part disparue
 * connue du registre (440), la ligne miroir annulée. Toutes (null) : chaque vente une fois, telle quelle (le CA global neutralise
 * l'inter-cabinet entre nos sociétés).
 */
export async function lireVentes(societe: Societe | null): Promise<Vente[]> {
  const ventes = await lireVentesBrutes(societe);
  if (societe === null || !(await repartitionDisponible())) return ventes;
  const registre = await lireRegistre(ventes.map((v) => v.id), societe);
  return ventes.flatMap((v) => { const x = venteDansSociete(v, societe, registre.get(v.id) ?? null); return x === null ? [] : [x]; });
}

/** LOT R (440) — les lignes du registre de l'inter-cabinet de ces ventes pour cette société (vide sans la 440). */
async function lireRegistre(ids: readonly number[], societe: Societe): Promise<Map<number, EntreeRegistre>> {
  const out = new Map<number, EntreeRegistre>();
  if (ids.length === 0 || !(await interCabinetDisponible())) return out;
  const { rows } = await query<Record<string, unknown>>(
    `SELECT vente_id, societe, porteuse, part_ht, pourcentage, etat, to_char(coalesce(modifie_le, cree_le) AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS le
       FROM transaction_inter_cabinet WHERE societe = $1 AND vente_id = ANY($2::bigint[])`, [societe, [...ids]]);
  for (const r of rows) out.set(n(r.vente_id), registreDe(r));
  return out;
}
const registreDe = (r: Record<string, unknown>): EntreeRegistre => ({ societe: r.societe as Societe, porteuse: r.porteuse as Societe, partHt: n(r.part_ht),
  pourcentage: nOuNull(r.pourcentage), etat: r.etat === 'annulee' ? 'annulee' : 'active', modifieLe: jour(r.le) });

/** Les ventes lues en base, telles qu'enregistrées (avant la vue d'une société). */
async function lireVentesBrutes(societe: Societe | null): Promise<Vente[]> {
  const lotD = await repartitionDisponible();
  const avecPrix = await prixVenteDisponible();
  const avecAnnulation = await annulationDisponible();
  const avecUnite = await uniteCommissionDisponible();
  const avecTaux = await interCabinetDisponible();
  const avecMode = await modeCommissionDisponible();
  // 🔴 LOT R — une vente répartie se lit pour sa société de saisie et pour chaque société d'une de ses parties (la porteuse ou celle qui
  // reçoit) ; avec le registre (440), aussi pour une société qui ne reçoit plus rien (sa ligne miroir annulée). `venteDansSociete` tranche.
  const filtre = lotD
    ? `($1::text IS NULL OR v.societe = $1
         OR (v.repartition AND EXISTS (SELECT 1 FROM transaction_partie p WHERE p.vente_id = v.id AND p.retire_le IS NULL AND p.societe = $1))${avecTaux
           ? '\n         OR EXISTS (SELECT 1 FROM transaction_inter_cabinet ic WHERE ic.vente_id = v.id AND ic.societe = $1)' : ''})`
    : '($1::text IS NULL OR v.societe = $1)';
  const { rows } = await query<Record<string, unknown>>(
    // Les dates en TEXTE (« AAAA-MM-JJ ») : lues en Date, le pilote les placerait à minuit LOCAL (la veille en UTC).
    `SELECT v.id, v.societe, v.libelle, v.honoraires_ttc, v.statut, v.annee, to_char(v.mois_acte, 'YYYY-MM-DD') AS mois_acte,
            to_char(v.date_compromis, 'YYYY-MM-DD') AS date_compromis, v.apporteur, v.note, v.origine, v.source_fichier, v.source_onglet, v.source_ligne,
            v.double_cle, v.attribution${avecPrix ? ', v.prix_vente' : ''}${avecAnnulation
              ? ", to_char(v.annulation_date, 'YYYY-MM-DD') AS annulation_date, v.annulation_motif, v.annulation_note" : ''}${lotD ? `, v.adresse_bien, to_char(v.date_acte_prevue, 'YYYY-MM-DD') AS date_acte_prevue,
            to_char(v.date_acte, 'YYYY-MM-DD') AS date_acte, v.negociateur_entree_id, v.negociateur_sortie_id, v.apporteur_id, v.retro_apporteur_ttc,${avecUnite ? ' v.retro_apporteur_ht,' : ''}
            v.repartition, ${NOM_COMPTE('negociateur_entree_id')} AS entree_nom, ${NOM_COMPTE('negociateur_sortie_id')} AS sortie_nom` : ''}
       FROM transaction_vente v WHERE v.retire_le IS NULL AND ${filtre} ORDER BY v.annee, v.mois_acte NULLS LAST, v.id`, [societe]);
  const { rows: ls } = await query<Record<string, unknown>>(
    `SELECT l.id, l.vente_id, l.negociateur, l.role, l.montant_ttc, l.nature, l.compte, l.origine, l.source_fichier, l.source_onglet, l.source_ligne, l.note${avecUnite ? ', l.cote, l.montant_ht' : ''}${avecTaux ? ', l.taux' : ''}${avecMode ? ', l.mode_commission' : ''}
       FROM transaction_vente_ligne l JOIN transaction_vente v ON v.id = l.vente_id
      WHERE l.retire_le IS NULL AND v.retire_le IS NULL AND ${filtre} ORDER BY l.id`, [societe]);
  const parVente = new Map<number, LigneVente[]>();
  for (const l of ls) {
    const id = n(l.vente_id);
    // LOT I — une ligne saisie EN HT (437) : `montantHt` est le montant saisi, `montantTtc` son équivalent (les totaux d'avant le lisent).
    const enHt = nOuNull(l.montant_ht);
    parVente.set(id, [...(parVente.get(id) ?? []), { id: n(l.id), negociateur: String(l.negociateur), role: l.role as LigneVente['role'],
      montantTtc: enHt !== null ? enHt * TVA : nOuNull(l.montant_ttc), ...(avecUnite ? { montantHt: enHt, cote: (l.cote ?? null) as LigneVente['cote'] } : {}),
      ...(avecTaux ? { taux: nOuNull(l.taux) } : {}), ...(avecMode ? { mode: modeLu(l.mode_commission) } : {}), nature: l.nature as LigneVente['nature'], compte: l.compte === true, origine: l.origine as LigneVente['origine'],
      sourceFichier: t(l.source_fichier), sourceOnglet: t(l.source_onglet), sourceLigne: nOuNull(l.source_ligne), note: t(l.note) }]);
  }
  if (!lotD) return rows.map((r) => venteDe(r, parVente.get(n(r.id)) ?? []));
  const ids = rows.map((r) => n(r.id));
  // LOT P — le statut FIGÉ de chaque partie (439) et, pour une vente d'avant, l'ACTUEL de son compte (to_jsonb : jamais d'erreur SQL).
  const avecStatut = await statutDisponible();
  // LOT S (441) — « commissionné » FIGÉ sur la partie, et le choix ACTUEL du compte (un collaborateur l'est toujours ; sans la 441 : tous).
  const avecCommissionne = await commissionneDisponible();
  const [{ rows: ps }, { rows: pers }] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT p.vente_id, p.sorte, p.compte_id, p.negociateur_libelle, p.societe, p.nom, p.coordonnees, p.pourcentage, p.montant_ht${avecStatut ? ', p.statut' : ''}${avecCommissionne ? ', p.commissionne' : ''},
              (SELECT to_jsonb(u) ->> 'statut' FROM admin_utilisateur u WHERE u.id = p.compte_id) AS statut_compte,
              (SELECT u.role || ':' || coalesce(to_jsonb(u) ->> 'commissionne', '') FROM admin_utilisateur u WHERE u.id = p.compte_id) AS commissionne_compte
         FROM transaction_partie p WHERE p.retire_le IS NULL AND p.vente_id = ANY($1::bigint[]) ORDER BY p.vente_id, p.rang, p.id`, [ids]),
    query<Record<string, unknown>>(
      // 🔴 LOT BJ — type, civilité, prénom (443) lus par to_jsonb : sans la migration, absents (une fiche d'avant, lue comme un particulier).
      `SELECT l.vente_id, p.id, l.role, p.nom, p.telephone, p.email, p.adresse,
              to_jsonb(p) ->> 'type' AS type, to_jsonb(p) ->> 'civilite' AS civilite, to_jsonb(p) ->> 'prenom' AS prenom
         FROM transaction_vente_personne l JOIN transaction_personne p ON p.id = l.personne_id
        WHERE l.retire_le IS NULL AND l.vente_id = ANY($1::bigint[]) ORDER BY l.vente_id, l.role DESC, l.rang, l.id`, [ids]),
  ]);
  const parties = new Map<number, Partie[]>();
  for (const p of ps) parties.set(n(p.vente_id), [...(parties.get(n(p.vente_id)) ?? []), { ...partieDe(p), statutCompte: statutLu(p.statut_compte),
    ...(p.compte_id != null ? { commissionneCompte: commissionneDuCompteLu(p.commissionne_compte) } : {}) }]);
  const personnes = new Map<number, PersonneVente[]>();
  // 🔴 LOT BJ — les représentants des sociétés (443) ; sans la migration : aucun.
  const societes = [...new Set(pers.filter((p) => p.type === 'societe').map((p) => n(p.id)))];
  const representants = await lireRepresentants(societes);
  for (const p of pers) personnes.set(n(p.vente_id), [...(personnes.get(n(p.vente_id)) ?? []), { id: n(p.id), role: p.role as PersonneVente['role'],
    nom: String(p.nom), telephone: t(p.telephone), email: t(p.email), adresse: t(p.adresse), ...extraPersonne(p),
    ...(p.type === 'societe' ? { representants: representants.get(n(p.id)) ?? [] } : {}) }]);
  return rows.map((r) => venteDe(r, parVente.get(n(r.id)) ?? [], { parties: parties.get(n(r.id)) ?? [], personnes: personnes.get(n(r.id)) ?? [] }));
}
/** 🔴 LOT BJ — type, civilité et prénom d'une fiche lue (443) ; absents sans la migration (une fiche d'avant). PUR. */
const extraPersonne = (p: Record<string, unknown>): Pick<PersonneVente, 'type' | 'civilite' | 'prenom'> =>
  (p.type == null && p.civilite == null && p.prenom == null ? {}
    : { type: p.type === 'societe' ? 'societe' : 'particulier', civilite: estCivilite(p.civilite) ? p.civilite : null, prenom: t(p.prenom) });
/** 🔴 LOT BJ — les représentants (actifs, dans l'ordre) de ces sociétés ; sans la 443 : aucun. */
async function lireRepresentants(societes: readonly number[]): Promise<Map<number, RepresentantVente[]>> {
  const out = new Map<number, RepresentantVente[]>();
  if (societes.length === 0 || !(await personneTypeDisponible())) return out;
  const { rows } = await query<Record<string, unknown>>(
    `SELECT r.societe_id, p.id, p.civilite, p.nom, p.prenom, p.telephone, p.email, p.adresse
       FROM transaction_personne_representant r JOIN transaction_personne p ON p.id = r.personne_id
      WHERE r.retire_le IS NULL AND r.societe_id = ANY($1::bigint[]) ORDER BY r.societe_id, r.rang, r.id`, [[...societes]]);
  for (const r of rows) out.set(n(r.societe_id), [...(out.get(n(r.societe_id)) ?? []), { id: n(r.id), civilite: estCivilite(r.civilite) ? r.civilite : null,
    nom: String(r.nom), prenom: t(r.prenom), telephone: t(r.telephone), email: t(r.email), adresse: t(r.adresse) }]);
  return out;
}
const partieDe = (p: Record<string, unknown>): Partie => ({ sorte: p.sorte as SortePartie, compteId: nOuNull(p.compte_id), negociateur: t(p.negociateur_libelle),
  societe: estSociete(p.societe) ? p.societe : null, nom: t(p.nom), coordonnees: t(p.coordonnees), pourcentage: nOuNull(p.pourcentage), montantHt: nOuNull(p.montant_ht),
  // LOT P — le statut figé, seulement quand la colonne est lue (439) : sans elle, la partie est celle d'avant, au bit près.
  ...('statut' in p ? { statut: statutLu(p.statut) } : {}),
  // LOT S — « commissionné » figé, seulement quand la colonne est lue (441).
  ...('commissionne' in p ? { commissionne: commissionneLu(p.commissionne) } : {}) });
/** « role:valeur » (lu avec la partie) → le choix effectif du compte : un collaborateur, toujours commissionné. */
const commissionneDuCompteLu = (x: unknown): boolean => {
  const [role, valeur] = String(x ?? ':').split(':');
  return commissionneEffectif(role, commissionneLu(valeur));
};

export async function lireRetrocessions(societe: Societe | null): Promise<Retrocession[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT id, societe, annee, mois, negociateur, montant_ttc, apporteur, vente_id, libelle, origine, source_onglet, source_cellule
       FROM transaction_retrocession WHERE retire_le IS NULL AND ($1::text IS NULL OR societe = $1) ORDER BY annee, mois, id`, [societe]);
  return rows.map((r) => ({ id: n(r.id), societe: r.societe as Societe, annee: n(r.annee), mois: n(r.mois), negociateur: String(r.negociateur),
    montantTtc: n(r.montant_ttc), apporteur: t(r.apporteur), venteId: nOuNull(r.vente_id), libelle: t(r.libelle), origine: r.origine as Retrocession['origine'],
    sourceOnglet: t(r.source_onglet), sourceCellule: t(r.source_cellule) }));
}

export async function lireARattacher(societe: Societe): Promise<CaARattacher[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT id, societe, annee, mois, negociateur, montant_ttc, libelle, source_onglet, source_cellule
       FROM transaction_ca_a_rattacher WHERE retire_le IS NULL AND societe = $1 ORDER BY annee, mois, id`, [societe]);
  return rows.map((r) => ({ id: n(r.id), societe: r.societe as Societe, annee: n(r.annee), mois: n(r.mois), negociateur: String(r.negociateur),
    montantTtc: n(r.montant_ttc), libelle: t(r.libelle), sourceOnglet: t(r.source_onglet), sourceCellule: t(r.source_cellule) }));
}

export async function lireGestion(): Promise<GestionMois[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT id, annee, mois, nb_lots, honoraires_ht, adhoc_ht, salarie_ht, reste_ht, note, origine
       FROM transaction_gestion_mois WHERE retire_le IS NULL ORDER BY annee, mois`);
  return rows.map((r) => ({ id: n(r.id), annee: n(r.annee), mois: n(r.mois), nbLots: nOuNull(r.nb_lots), honorairesHt: nOuNull(r.honoraires_ht),
    adhocHt: nOuNull(r.adhoc_ht), salarieHt: nOuNull(r.salarie_ht), resteHt: nOuNull(r.reste_ht), note: t(r.note), origine: r.origine as GestionMois['origine'] }));
}

export interface EntreeJournal { id: number; action: string; avant: unknown; apres: unknown; commentaire: string | null; auteur: string; le: string;
  annuleJournalId: number | null; annulePar: number | null }

/** L'historique d'une ligne (le plus récent d'abord) ; `annulePar` : le geste qui l'a annulé, s'il y en a un. */
export async function lireJournal(entite: string, id: number): Promise<EntreeJournal[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT j.id, j.action, j.avant, j.apres, j.commentaire, j.auteur_libelle, j.le, j.annule_journal_id,
            (SELECT max(a.id) FROM transaction_journal a WHERE a.annule_journal_id = j.id) AS annule_par
       FROM transaction_journal j WHERE j.entite = $1 AND j.entite_id = $2 ORDER BY j.id DESC`, [entite, id]);
  return rows.map((r) => ({ id: n(r.id), action: String(r.action), avant: r.avant, apres: r.apres, commentaire: t(r.commentaire), auteur: String(r.auteur_libelle),
    le: r.le instanceof Date ? r.le.toISOString() : String(r.le), annuleJournalId: nOuNull(r.annule_journal_id), annulePar: nOuNull(r.annule_par) }));
}

// ── Le journal ──────────────────────────────────────────────────────────────────────────────────────────────────────────

type Entite = 'vente' | 'vente_ligne' | 'retrocession' | 'ca_a_rattacher' | 'gestion_mois' | 'personne';
async function journaliser(q: RequeteTx, e: { entite: Entite; id: number; action: string; avant: unknown; apres: unknown; commentaire?: string | null;
  annule?: number | null; auteur: AuteurTx }): Promise<number> {
  const { rows } = await q<{ id: string }>(
    `INSERT INTO transaction_journal (entite, entite_id, action, avant, apres, commentaire, annule_journal_id, auteur_id, auteur_libelle)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9) RETURNING id`,
    [e.entite, e.id, e.action, e.avant === null ? null : JSON.stringify(e.avant), e.apres === null ? null : JSON.stringify(e.apres), e.commentaire ?? null,
      e.annule ?? null, e.auteur.id, e.auteur.libelle]);
  return n(rows[0].id);
}

/** Les colonnes que chaque geste peut écrire — et donc rejouer à l'annulation. Une liste fermée : rien d'autre ne se réécrit. */
const COLONNES: Record<Entite, { table: string; colonnes: readonly string[] }> = {
  // LOT AE — `societe` : la société PORTEUSE d'une vente répartie (son négociateur d'entrée) se range à l'enregistrement ; journalisée, réversible.
  vente: { table: 'transaction_vente', colonnes: ['libelle', 'honoraires_ttc', 'statut', 'annee', 'mois_acte', 'date_compromis', 'apporteur', 'note', 'retire_le', 'attribution', 'societe'] },
  vente_ligne: { table: 'transaction_vente_ligne', colonnes: ['negociateur', 'role', 'montant_ttc', 'retire_le'] },
  retrocession: { table: 'transaction_retrocession', colonnes: ['vente_id', 'apporteur', 'montant_ttc', 'retire_le'] },
  ca_a_rattacher: { table: 'transaction_ca_a_rattacher', colonnes: ['retire_le'] },
  gestion_mois: { table: 'transaction_gestion_mois', colonnes: ['nb_lots', 'honoraires_ht', 'adhoc_ht', 'salarie_ht', 'reste_ht', 'note', 'retire_le'] },
  personne: { table: 'transaction_personne', colonnes: ['nom', 'telephone', 'email', 'adresse', 'note', 'retire_le'] },
};
/** LOT D — les colonnes de la vente portées par la 434 : lues et écrites SEULEMENT quand elle est appliquée. */
const COLONNES_VENTE_434 = ['adresse_bien', 'date_acte_prevue', 'date_acte', 'negociateur_entree_id', 'negociateur_sortie_id', 'apporteur_id', 'retro_apporteur_ttc', 'repartition'];
const DATES = ['mois_acte', 'date_compromis', 'date_acte_prevue', 'date_acte', 'annulation_date'];
async function colonnesDe(entite: Entite): Promise<readonly string[]> {
  const c = COLONNES[entite].colonnes;
  // 🔴 LOT BJ — type, civilité, prénom d'une fiche (443) : lus et écrits SEULEMENT quand la migration est appliquée.
  if (entite === 'personne') return (await personneTypeDisponible()) ? [...c, 'type', 'civilite', 'prenom'] : c;
  if (entite !== 'vente') return c;
  // LOT E — le prix de vente (435) : lu et écrit SEULEMENT quand la colonne existe.
  return [...c, ...((await repartitionDisponible()) ? COLONNES_VENTE_434 : []), ...((await prixVenteDisponible()) ? ['prix_vente'] : []),
    ...((await annulationDisponible()) ? ['annulation_date', 'annulation_motif', 'annulation_note'] : []),
    // LOT I — la rétrocession de l'apporteur saisie en HT (437).
    ...((await uniteCommissionDisponible()) ? ['retro_apporteur_ht'] : [])];
}

/** La valeur d'une colonne comme le journal la garde (numeric en nombre, date en « AAAA-MM-JJ », instant en ISO). */
function valeurJournal(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v ?? null;
}
async function lireLigne(q: RequeteTx, entite: Entite, id: number): Promise<Record<string, unknown> | null> {
   const c = COLONNES[entite];
  const colonnes = await colonnesDe(entite);
  const { rows } = await q<Record<string, unknown>>(
    `SELECT ${colonnes.map((x) => (DATES.includes(x) ? `to_char(${x}, 'YYYY-MM-DD') AS ${x}` : x)).join(', ')}
       FROM ${c.table} WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] === undefined ? null : Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, valeurJournal(v)]));
}
/** Écrit des colonnes (de la liste fermée) sur une ligne ; rend la valeur d'avant et d'après des SEULES colonnes changées. */
async function ecrire(q: RequeteTx, entite: Entite, id: number, valeurs: Record<string, unknown>, avecModifie: boolean):
  Promise<{ avant: Record<string, unknown>; apres: Record<string, unknown> } | null> {
  const c = COLONNES[entite];
  const colonnes = await colonnesDe(entite);
  const actuel = await lireLigne(q, entite, id);
  if (actuel === null) return null;
  const changees = Object.entries(valeurs).filter(([k, v]) => colonnes.includes(k) && JSON.stringify(actuel[k] ?? null) !== JSON.stringify(valeurJournal(v)));
  const avant = Object.fromEntries(changees.map(([k]) => [k, actuel[k] ?? null]));
  const apres = Object.fromEntries(changees.map(([k, v]) => [k, valeurJournal(v)]));
  if (changees.length === 0) return { avant, apres };
  const sets = changees.map(([k], i) => `${k} = $${i + 2}`);
  if (avecModifie) sets.push('modifie_le = now()');
  await q(`UPDATE ${c.table} SET ${sets.join(', ')} WHERE id = $1`, [id, ...changees.map(([, v]) => v)]);
  return { avant, apres };
}
const AVEC_MODIFIE: Record<Entite, boolean> = { vente: true, vente_ligne: false, retrocession: true, ca_a_rattacher: false, gestion_mois: true, personne: true };

// ── 🔴 LOT R (440) : le registre des lignes miroir de l'inter-cabinet ─────────────────────────────────────────────────────────

/**
 * Met le REGISTRE des lignes miroir d'une vente d'accord avec elle, dans la transaction du geste qui l'a changée : une part neuve chez
 * l'autre société → ligne créée ; changée → mise à jour ; disparue → ANNULÉE (jamais supprimée) ; retrouvée → rétablie. Chaque changement
 * est écrit au journal de la vente (action « inter_cabinet », avant / après). Sans la 440 : rien (les lignes miroir se calculent à la lecture).
 */
async function synchroniserInterCabinet(q: RequeteTx, venteId: number, auteur: AuteurTx): Promise<void> {
  if (!(await interCabinetDisponible())) return;
  const { rows: vs } = await q<Record<string, unknown>>(
    'SELECT id, societe, honoraires_ttc, retro_apporteur_ttc, retro_apporteur_ht, repartition, retire_le FROM transaction_vente WHERE id = $1', [venteId]);
  const v = vs[0];
  // Une vente retirée (retire_le) n'est lue nulle part, ni elle ni sa ligne miroir : le registre reste tel quel.
  if (v === undefined || v.retire_le != null) return;
  const { rows: ps } = await q<Record<string, unknown>>(
    `SELECT sorte, compte_id, negociateur_libelle, societe, nom, coordonnees, pourcentage, montant_ht FROM transaction_partie
      WHERE vente_id = $1 AND retire_le IS NULL ORDER BY rang, id`, [venteId]);
  const retroTtc = v.retro_apporteur_ht != null ? n(v.retro_apporteur_ht) * TVA : v.retro_apporteur_ttc == null ? 0 : n(v.retro_apporteur_ttc);
  const attendus = miroirsAttendus({ societe: v.societe as Societe, honorairesTtc: n(v.honoraires_ttc),
    repartition: v.repartition === true ? { parties: ps.map(partieDe), retroApporteurTtc: retroTtc } : null });
  const { rows: ex } = await q<Record<string, unknown>>(
    `SELECT vente_id, societe, porteuse, part_ht, pourcentage, etat, NULL AS le FROM transaction_inter_cabinet WHERE vente_id = $1 ORDER BY id FOR UPDATE`, [venteId]);
  const vue = (e: Pick<EntreeRegistre, 'societe' | 'porteuse' | 'partHt' | 'pourcentage' | 'etat'>) =>
    ({ societe: e.societe, porteuse: e.porteuse, part_ht: e.partHt, pourcentage: e.pourcentage, etat: e.etat });
  const nom = (x: Societe): string => (x === 'macj' ? 'MACJ' : 'CRITERIMMO');
  for (const o of planRegistre(attendus, ex.map(registreDe))) {
    if (o.sorte === 'creer') {
      await q(`INSERT INTO transaction_inter_cabinet (vente_id, societe, porteuse, part_ht, pourcentage, etat, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
        [venteId, o.societe, o.porteuse, o.partHt, o.pourcentage, auteur.libelle]);
      await journaliser(q, { entite: 'vente', id: venteId, action: 'inter_cabinet', avant: null, apres: vue({ ...o, etat: 'active' }), auteur,
        commentaire: `Ligne miroir créée : ${nom(o.societe)} reçoit sa part en inter-cabinet de ${nom(o.porteuse)}.` });
    } else if (o.sorte === 'annuler') {
      await q(`UPDATE transaction_inter_cabinet SET etat = 'annulee', modifie_le = now() WHERE vente_id = $1 AND societe = $2`, [venteId, o.societe]);
      await journaliser(q, { entite: 'vente', id: venteId, action: 'inter_cabinet', avant: vue(o.avant), apres: vue({ ...o.avant, etat: 'annulee' }), auteur,
        commentaire: `Ligne miroir annulée : ${nom(o.societe)} ne reçoit plus rien de cette vente (la ligne reste, rien n’est supprimé).` });
    } else {
      await q(`UPDATE transaction_inter_cabinet SET porteuse = $3, part_ht = $4, pourcentage = $5, etat = 'active', modifie_le = now() WHERE vente_id = $1 AND societe = $2`,
        [venteId, o.societe, o.porteuse, o.partHt, o.pourcentage]);
      await journaliser(q, { entite: 'vente', id: venteId, action: 'inter_cabinet', avant: vue(o.avant), apres: vue({ ...o, etat: 'active' }), auteur,
        commentaire: o.sorte === 'retablir' ? `Ligne miroir rétablie : ${nom(o.societe)} reçoit de nouveau une part.` : `Ligne miroir mise à jour : la part de ${nom(o.societe)} a changé.` });
    }
  }
}

// ── Les ventes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function creerVente(s: VenteSaisie, auteur: AuteurTx): Promise<Issue<number>> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  const avecPrix = await prixVenteDisponible();
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string }>(
      `INSERT INTO transaction_vente (societe, libelle, honoraires_ttc, statut, annee, mois_acte, date_compromis, apporteur, note, origine, cree_par, cree_par_libelle)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, 'saisie', $10, $11) RETURNING id`,
      [s.societe, s.libelle, s.honorairesTtc, s.statut, s.annee, s.statut === 'compromis' ? null : premierDuMois(s.annee, s.mois), s.dateCompromis, s.apporteur, s.note,
        auteur.id, auteur.libelle]);
    const id = n(rows[0].id);
    // LOT E — le prix de vente (435), posé à part : sans la colonne, rien n'est tenté.
    if (avecPrix && s.prixVente != null) await q('UPDATE transaction_vente SET prix_vente = $2 WHERE id = $1', [id, s.prixVente]);
    for (const p of s.parts) {
      await q(`INSERT INTO transaction_vente_ligne (vente_id, negociateur, role, montant_ttc, nature, compte, origine, cree_par_libelle)
               VALUES ($1, $2, $3, $4, $5, $6, 'saisie', $7)`,
        [id, p.negociateur, p.role, p.montantTtc, s.statut === 'compromis' ? 'compromis' : 'vente', p.role !== 'negociateur', auteur.libelle]);
    }
    await journaliser(q, { entite: 'vente', id, action: 'saisie', avant: null, apres: { ...s, parts: s.parts }, auteur,
      commentaire: 'Vente saisie à l’écran ; « Annuler » la retire (retire_le), rien n’est supprimé.' });
    return { ok: true, valeur: id };
  });
}

/** Les champs de l'écran → les colonnes de la vente (le mois de l'acte se rapporte à l'année, dite ou actuelle). */
function colonnesDeChamps(ch: ChampsVente, actuel: Record<string, unknown>): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (ch.libelle !== undefined) c.libelle = ch.libelle;
  if (ch.honorairesTtc !== undefined) c.honoraires_ttc = ch.honorairesTtc;
  if (ch.statut !== undefined) c.statut = ch.statut;
  if (ch.annee !== undefined) c.annee = ch.annee;
  if (ch.dateCompromis !== undefined) c.date_compromis = ch.dateCompromis;
  if (ch.apporteur !== undefined) c.apporteur = ch.apporteur;
  if (ch.note !== undefined) c.note = ch.note;
  if (ch.prixVente !== undefined) c.prix_vente = ch.prixVente;
  const annee = ch.annee ?? Number(actuel.annee);
  const statut = ch.statut ?? String(actuel.statut);
  const moisActuel = typeof actuel.mois_acte === 'string' ? Number(actuel.mois_acte.slice(5, 7)) : null;
  const mois = ch.mois !== undefined ? ch.mois : moisActuel;
  if (ch.mois !== undefined || ch.annee !== undefined || ch.statut !== undefined) c.mois_acte = statut === 'compromis' ? null : premierDuMois(annee, mois);
  return c;
}

export async function modifierVente(id: number, ch: ChampsVente, auteur: AuteurTx): Promise<Issue> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  return withTransaction(async (q) => {
    const actuel = await lireLigne(q, 'vente', id);
    if (actuel === null || actuel.retire_le !== null) return { ok: false, motif: 'Vente introuvable (ou retirée).' };
    const r = await ecrire(q, 'vente', id, colonnesDeChamps(ch, actuel), true);
    if (r === null || Object.keys(r.apres).length === 0) return { ok: false, motif: 'Rien n’a changé.' };
    await journaliser(q, { entite: 'vente', id, action: 'modification', avant: r.avant, apres: r.apres, auteur });
    await synchroniserInterCabinet(q, id, auteur);
    return { ok: true };
  });
}

/** Retirer (réversible) ou rétablir une vente : `retire_le`, journalisé. Ses lignes ne sont pas touchées (elles suivent la vente). */
export async function retirerVente(id: number, retirer: boolean, auteur: AuteurTx): Promise<Issue> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  return withTransaction(async (q) => {
    const actuel = await lireLigne(q, 'vente', id);
    if (actuel === null) return { ok: false, motif: 'Vente introuvable.' };
    if ((actuel.retire_le !== null) === retirer) return { ok: false, motif: retirer ? 'Vente déjà retirée.' : 'Vente non retirée.' };
    const r = await ecrire(q, 'vente', id, { retire_le: retirer ? new Date() : null }, true);
    if (retirer) await q('UPDATE transaction_vente SET retire_par_libelle = $2 WHERE id = $1', [id, auteur.libelle]);
    await journaliser(q, { entite: 'vente', id, action: retirer ? 'retrait' : 'retablissement', avant: r?.avant ?? null, apres: r?.apres ?? null, auteur });
    await synchroniserInterCabinet(q, id, auteur);
    return { ok: true };
  });
}

// ── LOT C : attribuer une vente notée chez les deux sociétés ──────────────────────────────────────────────────────────────

/** Les notes (toutes sociétés) des groupes « même vente notée deux fois » qui touchent cette société (null : tous les groupes). */
export async function lireNotesDoubles(societe: Societe | null): Promise<Vente[]> {
  const toutes = await lireVentes(null);
  const cles = new Set(toutes.filter((v) => v.double !== null && (societe === null || v.societe === societe)).map((v) => v.double!.cle));
  return toutes.filter((v) => v.double !== null && cles.has(v.double.cle));
}

/**
 * « Attribuer à CRITERIMMO / à MACJ » : la note de la société choisie devient « retenue », celle de l'autre « écartée » ; `null` remet
 * le groupe « à attribuer ». Chaque note changée laisse sa trace au journal (valeur avant / après) : chaque geste se défait.
 */
export async function attribuer(cle: string, societe: Societe | null, auteur: AuteurTx): Promise<Issue> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string; societe: Societe }>(
      'SELECT id, societe FROM transaction_vente WHERE double_cle = $1 AND retire_le IS NULL ORDER BY id FOR UPDATE', [cle]);
    if (rows.length === 0) return { ok: false, motif: 'Vente à attribuer introuvable.' };
    if (societe !== null && !rows.some((r) => r.societe === societe)) return { ok: false, motif: 'Cette société n’a pas noté cette vente.' };
    let changees = 0;
    for (const r of rows) {
      const voulu: Attribution = societe === null ? 'a_attribuer' : r.societe === societe ? 'retenue' : 'ecartee';
      const e = await ecrire(q, 'vente', n(r.id), { attribution: voulu }, true);
      if (e === null || Object.keys(e.apres).length === 0) continue;
      changees++;
      await journaliser(q, { entite: 'vente', id: n(r.id), action: 'attribution', avant: e.avant, apres: e.apres, auteur,
        commentaire: societe === null ? `Vente « ${cle} » remise à attribuer.` : `Vente « ${cle} » attribuée à ${societe === 'macj' ? 'MACJ' : 'CRITERIMMO'}.` });
    }
    return changees === 0 ? { ok: false, motif: 'Rien n’a changé.' } : { ok: true };
  });
}

// ── Les rétrocessions ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Le petit outil d'Arno : rattacher une rétrocession à une vente (ou la rendre « à répartir »), réversible et journalisé. */
export async function rattacherRetro(id: number, venteId: number | null, auteur: AuteurTx): Promise<Issue> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  return withTransaction(async (q) => {
    const { rows } = await q<{ societe: string }>('SELECT societe FROM transaction_retrocession WHERE id = $1 AND retire_le IS NULL', [id]);
    if (rows.length === 0) return { ok: false, motif: 'Rétrocession introuvable.' };
    if (venteId !== null) {
      const { rows: v } = await q<{ societe: string }>('SELECT societe FROM transaction_vente WHERE id = $1 AND retire_le IS NULL', [venteId]);
      if (v.length === 0) return { ok: false, motif: 'Vente introuvable.' };
      if (v[0].societe !== rows[0].societe) return { ok: false, motif: 'La vente n’est pas de la même société.' };
    }
    const r = await ecrire(q, 'retrocession', id, { vente_id: venteId }, true);
    if (r === null || Object.keys(r.apres).length === 0) return { ok: false, motif: 'Rien n’a changé.' };
    await journaliser(q, { entite: 'retrocession', id, action: 'rattachement', avant: r.avant, apres: r.apres, auteur,
      commentaire: venteId === null ? 'Rendue « à répartir ».' : `Rattachée à la vente n° ${venteId}.` });
    return { ok: true };
  });
}

export async function saisirRetro(s: RetroSaisie, auteur: AuteurTx): Promise<Issue<number>> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string }>(
      `INSERT INTO transaction_retrocession (societe, annee, mois, negociateur, montant_ttc, apporteur, vente_id, origine, cree_par_libelle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'saisie', $8) RETURNING id`,
      [s.societe, s.annee, s.mois, s.negociateur, s.montantTtc, s.apporteur, s.venteId, auteur.libelle]);
    const id = n(rows[0].id);
    await journaliser(q, { entite: 'retrocession', id, action: 'saisie', avant: null, apres: s, auteur });
    return { ok: true, valeur: id };
  });
}

// ── La gestion du mois ──────────────────────────────────────────────────────────────────────────────────────────────────

export async function enregistrerGestion(annee: number, mois: number, g: GestionSaisie, auteur: AuteurTx): Promise<Issue> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  return withTransaction(async (q) => {
    const valeurs = { nb_lots: g.nbLots, honoraires_ht: g.honorairesHt, adhoc_ht: g.adhocHt, salarie_ht: g.salarieHt, reste_ht: g.resteHt, note: g.note };
    const { rows } = await q<{ id: string }>('SELECT id FROM transaction_gestion_mois WHERE annee = $1 AND mois = $2 AND retire_le IS NULL FOR UPDATE', [annee, mois]);
    if (rows.length === 0) {
      const { rows: c } = await q<{ id: string }>(
        `INSERT INTO transaction_gestion_mois (annee, mois, nb_lots, honoraires_ht, adhoc_ht, salarie_ht, reste_ht, note, origine, cree_par_libelle)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'saisie', $9) RETURNING id`,
        [annee, mois, g.nbLots, g.honorairesHt, g.adhocHt, g.salarieHt, g.resteHt, g.note, auteur.libelle]);
      await journaliser(q, { entite: 'gestion_mois', id: n(c[0].id), action: 'saisie', avant: null, apres: { annee, mois, ...valeurs }, auteur });
      return { ok: true };
    }
    const id = n(rows[0].id);
    const r = await ecrire(q, 'gestion_mois', id, valeurs, true);
    if (r === null || Object.keys(r.apres).length === 0) return { ok: false, motif: 'Rien n’a changé.' };
    await journaliser(q, { entite: 'gestion_mois', id, action: 'modification', avant: r.avant, apres: r.apres, auteur });
    return { ok: true };
  });
}

// ── Annuler un geste ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * « Annuler » un geste du journal : remet la valeur d'AVANT sur les colonnes qu'il a changées — seulement si elles portent encore la
 * valeur qu'il a écrite (sinon un geste plus récent les a touchées : on refuse, avec le motif). Une saisie s'annule en retirant la
 * ligne (`retire_le`). Le retour en arrière est lui-même un geste du journal (`annule_journal_id`), qu'on peut annuler à son tour.
 */
export async function annulerGeste(journalId: number, auteur: AuteurTx): Promise<Issue> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  return withTransaction(async (q) => {
    const { rows } = await q<Record<string, unknown>>(
      `SELECT id, entite, entite_id, action, avant, apres,
              EXISTS (SELECT 1 FROM transaction_journal a WHERE a.annule_journal_id = j.id) AS deja
         FROM transaction_journal j WHERE id = $1`, [journalId]);
    const j = rows[0];
    if (j === undefined) return { ok: false, motif: 'Geste introuvable.' };
    if (j.deja === true) return { ok: false, motif: 'Ce geste a déjà été annulé.' };
    const entite = String(j.entite) as Entite;
    const id = n(j.entite_id);
    // 🔴 LOT R — une ligne miroir suit sa vente d'origine : elle ne se défait pas seule (« Annuler » le geste de la vente qui l'a changée).
    if (j.action === 'inter_cabinet') return { ok: false, motif: 'La ligne miroir suit la vente d’origine : annulez le geste de la vente qui l’a changée.' };
    // 🔴 LOT BJ — une fiche modifiée ou des représentants changés depuis l'affaire : tracés ici, corrigés dans le formulaire « Modifier ».
    if (j.action === 'personne' || j.action === 'representants') return { ok: false, motif: 'Une fiche de vendeur ou d’acquéreur (et ses représentants) se corrige dans le formulaire « Modifier » de l’affaire.' };
    // LOT D — un geste sur un ENSEMBLE de lignes (les parties, les personnes d'une vente) se défait en rétablissant l'ensemble d'avant.
    if (entite === 'vente' && ENSEMBLES[String(j.action)] !== undefined) {
      const r = await defaireEnsemble(q, j, journalId, auteur);
      if (r.ok) await synchroniserInterCabinet(q, id, auteur);
      return r;
    }
    const actuel = await lireLigne(q, entite, id);
    if (actuel === null) return { ok: false, motif: 'Ligne introuvable.' };
    let valeurs: Record<string, unknown>;
    // Une SAISIE (ou une ligne écrite par l'import) s'annule en la retirant ; tout autre geste (modification, rattachement, retrait,
    // mise à jour ou retrait par l'import) remet la valeur d'avant.
    if (j.action === 'saisie' || j.action === 'import_fichier') {
      if (actuel.retire_le !== null) return { ok: false, motif: 'La ligne est déjà retirée.' };
      valeurs = { retire_le: new Date() };
    } else {
      const apres = (j.apres ?? {}) as Record<string, unknown>;
      const avant = (j.avant ?? {}) as Record<string, unknown>;
      const touchee = Object.keys(apres).some((k) => k !== 'retire_le' && JSON.stringify(actuel[k] ?? null) !== JSON.stringify(apres[k] ?? null))
        || ('retire_le' in apres && (actuel.retire_le === null) !== (apres.retire_le === null));
      if (touchee) return { ok: false, motif: 'Modifiée depuis par un autre geste : annulez d’abord le geste le plus récent.' };
      valeurs = Object.fromEntries(Object.keys(apres).map((k) => [k, avant[k] ?? null]));
    }
    const r = await ecrire(q, entite, id, valeurs, AVEC_MODIFIE[entite]);
    await journaliser(q, { entite, id, action: 'annulation', avant: r?.avant ?? null, apres: r?.apres ?? null, annule: journalId, auteur,
      commentaire: `Annulation du geste n° ${journalId} (${String(j.action)}).` });
    if (entite === 'vente') await synchroniserInterCabinet(q, id, auteur);
    return { ok: true };
  });
}

// ── LOT D (migration 434) : le dossier d'un compromis, sa répartition, « Acte signé » ─────────────────────────────────────────

export const MOTIF_SANS_434 = 'Disponible après la mise à jour de la base (migration 434) : rien n’a été enregistré.';
/** 🔴 LOT BJ — sans la 443 : ni société, ni civilité, ni prénom, ni représentants. */
export const MOTIF_SANS_443 = 'Particulier / société, civilité, prénom et représentants : disponibles après la mise à jour de la base (migration 443). Rien n’a été enregistré.';
export const MOTIF_SANS_437 = 'Les commissions des négociateurs et la saisie en HT sont disponibles après la mise à jour de la base (migration 437) : rien n’a été enregistré.';

/** Les ENSEMBLES de lignes d'une vente qu'un geste remplace en bloc (retire les anciennes, pose les nouvelles) : réversibles en bloc. */
const ENSEMBLES: Record<string, { table: string; filtre?: string } | undefined> = {
  repartition: { table: 'transaction_partie' },
  personnes: { table: 'transaction_vente_personne' },
  // LOT I (437) — les commissions versées aux négociateurs d'entrée et de sortie : les SEULES lignes de vente qui portent un côté (les
  // lignes d'avant — imports, saisies — n'en portent pas et ne sont jamais touchées).
  commissions: { table: 'transaction_vente_ligne', filtre: 'cote IS NOT NULL' },
};
const filtreDe = (action: string): string => { const f = ENSEMBLES[action]?.filtre; return f === undefined ? '' : ` AND ${f}`; };
const idsActifs = async (q: RequeteTx, table: string, venteId: number, filtre = ''): Promise<number[]> =>
  (await q<{ id: string }>(`SELECT id FROM ${table} WHERE vente_id = $1 AND retire_le IS NULL${filtre} ORDER BY id`, [venteId])).rows.map((r) => n(r.id));
const memesIds = (a: readonly number[], b: readonly number[]): boolean => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

/** Défait un geste d'ensemble : l'ensemble qu'il a posé est retiré, celui d'avant revient ; refusé si un geste plus récent l'a changé. */
async function defaireEnsemble(q: RequeteTx, j: Record<string, unknown>, journalId: number, auteur: AuteurTx): Promise<Issue> {
  const e = ENSEMBLES[String(j.action)]!;
  const venteId = n(j.entite_id);
  const avant = ((j.avant ?? {}) as { ids?: number[] }).ids ?? [];
  const apres = ((j.apres ?? {}) as { ids?: number[] }).ids ?? [];
  if (!memesIds(await idsActifs(q, e.table, venteId, filtreDe(String(j.action))), apres)) return { ok: false, motif: 'Modifiée depuis par un autre geste : annulez d’abord le geste le plus récent.' };
  await q(`UPDATE ${e.table} SET retire_le = now(), retire_par_libelle = $2 WHERE id = ANY($1::bigint[]) AND retire_le IS NULL`, [apres, auteur.libelle]);
  await q(`UPDATE ${e.table} SET retire_le = NULL, retire_par_libelle = NULL WHERE id = ANY($1::bigint[])`, [avant]);
  await journaliser(q, { entite: 'vente', id: venteId, action: String(j.action), avant: { ids: apres }, apres: { ids: avant }, annule: journalId, auteur,
    commentaire: `Annulation du geste n° ${journalId} : ${({ repartition: 'la répartition', personnes: 'les personnes', commissions: 'les commissions versées' } as Record<string, string>)[String(j.action)]} d’avant reviennent.` });
  return { ok: true };
}

/** `societe` : celle d'aujourd'hui — LOT K : « les_deux » pour un collaborateur des deux sociétés (choisie vente par vente). */
export interface NegociateurCompte { id: number; nom: string; actif: boolean; societe: SocieteCompte | null; periodes: PeriodeSociete[];
  /** LOT P (439) — son statut d'aujourd'hui ; null : à renseigner (ou avant la 439). */
  statut?: Statut | null;
  /** LOT S (441) — commissionné aujourd'hui (un collaborateur l'est toujours ; sans la 441 : tous). */
  commissionne?: boolean }

/** Les comptes (négociateurs possibles) avec leurs périodes de société ; `societe` : celle d'aujourd'hui. */
export async function lireNegociateurs(aujourdhui: string): Promise<NegociateurCompte[]> {
  // 🔴 LOT P — un OBSERVATEUR n'est jamais négociateur : il n'entre pas dans la liste (statut lu via to_jsonb : sans la 439, personne n'est exclu).
  const { rows } = await query<{ id: string; nom: string; actif: boolean; statut: string | null; role?: string; commissionne?: string | null }>(
    `SELECT id, coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant) AS nom, actif, to_jsonb(u) ->> 'statut' AS statut,
            role, to_jsonb(u) ->> 'commissionne' AS commissionne
       FROM admin_utilisateur u WHERE coalesce(to_jsonb(u) ->> 'statut', '') <> 'observateur' ORDER BY lower(nom), lower(prenom), id`);
  const periodes = await lirePeriodesSociete(rows.map((r) => n(r.id)));
  return rows.map((r) => {
    const p = periodes.get(n(r.id)) ?? [];
    return { id: n(r.id), nom: String(r.nom), actif: r.actif === true, societe: societeALaDate(p, aujourdhui), periodes: p, statut: statutLu(r.statut),
      commissionne: commissionneEffectif(r.role, commissionneLu(r.commissionne)) };
  });
}
/** Les périodes de société de ces comptes (vide sans la 434). */
export async function lirePeriodesSociete(ids: readonly number[]): Promise<Map<number, PeriodeSociete[]>> {
  const out = new Map<number, PeriodeSociete[]>();
  if (ids.length === 0 || !(await repartitionDisponible())) return out;
  const { rows } = await query<{ compte_id: string; societe: SocieteCompte; depuis: string }>(
    `SELECT compte_id, societe, to_char(depuis, 'YYYY-MM-DD') AS depuis FROM transaction_societe_compte
      WHERE retire_le IS NULL AND compte_id = ANY($1::bigint[]) ORDER BY depuis, id`, [[...ids]]);
  for (const r of rows) out.set(n(r.compte_id), [...(out.get(n(r.compte_id)) ?? []), { societe: r.societe, depuis: r.depuis }]);
  return out;
}

/** L'annuaire des vendeurs et acquéreurs (pour choisir une personne déjà connue). */
export interface PersonneAnnuaire { id: number; nom: string; telephone: string | null; email: string | null; adresse: string | null;
  /** 🔴 LOT BJ (443) — absents : une fiche d'avant (un particulier). */
  type?: 'particulier' | 'societe'; civilite?: 'M.' | 'Mme' | null; prenom?: string | null }
export async function lirePersonnes(): Promise<PersonneAnnuaire[]> {
  if (!(await repartitionDisponible())) return [];
  const { rows } = await query<Record<string, unknown>>(
    `SELECT id, nom, telephone, email, adresse, to_jsonb(p) ->> 'type' AS type, to_jsonb(p) ->> 'civilite' AS civilite, to_jsonb(p) ->> 'prenom' AS prenom
       FROM transaction_personne p WHERE retire_le IS NULL ORDER BY lower(nom), id`);
  return rows.map((r) => ({ id: n(r.id), nom: String(r.nom), telephone: t(r.telephone), email: t(r.email), adresse: t(r.adresse), ...extraPersonne(r) }));
}

const anneeDe = (d: string | null): number | null => (d === null ? null : Number(d.slice(0, 4)));

/**
 * Enregistre un compromis (ou une vente) avec son dossier et sa RÉPARTITION — création (`id` null) ou modification. Tout est vérifié
 * AVANT la moindre écriture (une répartition fausse ne laisse rien en base : la saisie reste à l'écran). Chaque négociateur est relu en
 * base, avec sa société À LA DATE DE LA VENTE (acte, sinon compromis, sinon aujourd'hui), figée sur la partie. Les personnes déjà connues
 * sont RÉUTILISÉES (jamais de doublon). Journalisé : la vente, les personnes (ensemble), la répartition (ensemble) — chaque geste se défait.
 */
export async function enregistrerDossier(id: number | null, s: DossierSaisie, aujourdhui: string, auteur: AuteurTx): Promise<Issue<number>> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  if (!(await repartitionDisponible())) return { ok: false, motif: MOTIF_SANS_434 };
  // LOT I — sans la 437, tout reste en TTC comme avant : une saisie en HT, ou une commission de négociateur par côté, est refusée (rien n'est écrit).
  const avecUnite = await uniteCommissionDisponible();
  const avecTaux = await interCabinetDisponible();
  const avecMode = await modeCommissionDisponible();
  const commissions = s.commissions;
  const aDesCommissions = commissions !== undefined && (commissions.entree !== null || commissions.sortie !== null);
  if (!avecUnite && (s.retroUnite === 'ht' || aDesCommissions)) return { ok: false, motif: MOTIF_SANS_437 };
  // La rétrocession telle que la répartition la déduit : son équivalent TTC (rien n'est converti en base : elle s'enregistre dans son unité).
  const retroTtc = s.retroUnite === 'ht' ? s.retroApporteurTtc * TVA : s.retroApporteurTtc;
  const dateVente = s.dateActe ?? s.dateCompromis ?? aujourdhui;
  // ① les négociateurs, relus en base, avec leur société à la date de la vente
  const comptesIds = [...new Set([s.entreeId, s.sortieId, ...s.parties.map((p) => p.compteId)].filter((x): x is number => x !== null))];
  type CompteLu = { id: string; nom: string; statut?: string | null; role?: string; commissionne?: string | null };
  const { rows: cs } = comptesIds.length === 0 ? { rows: [] as CompteLu[] } : await query<CompteLu>(
    `SELECT id, coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant) AS nom, to_jsonb(admin_utilisateur) ->> 'statut' AS statut,
            role, to_jsonb(admin_utilisateur) ->> 'commissionne' AS commissionne
       FROM admin_utilisateur WHERE id = ANY($1::bigint[])`, [comptesIds]);
  if (cs.length !== comptesIds.length) return { ok: false, motif: 'Négociateur inconnu.' };
  // 🔴 LOT P — un OBSERVATEUR n'est jamais négociateur (la liste ne le propose pas ; une saisie forgée est refusée ici).
  const observateur = cs.find((c) => c.statut === 'observateur');
  if (observateur !== undefined) return { ok: false, motif: `${observateur.nom} est observateur (lecture seule) : il ne peut pas être négociateur. Rien n’a été enregistré.` };
  // 🔴 LOT P — le statut est FIGÉ sur la partie : celui déjà figé sur cette vente pour ce négociateur reste (un changement de statut ultérieur
  // ne touche pas les ventes passées) ; sinon, le statut actuel du compte.
  const avecStatut = await statutDisponible();
  const statutActuel = new Map(cs.map((c) => [n(c.id), statutLu(c.statut)]));
  const statutFige = new Map<number, Statut | null>();
  if (avecStatut && id !== null) {
    const { rows: deja } = await query<{ compte_id: string | null; statut: string | null }>(
      'SELECT compte_id, statut FROM transaction_partie WHERE vente_id = $1 AND retire_le IS NULL AND compte_id IS NOT NULL AND statut IS NOT NULL', [id]);
    for (const d of deja) statutFige.set(n(d.compte_id), statutLu(d.statut));
  }
  const statutPour = (compteId: number): Statut | null => statutFige.get(compteId) ?? statutActuel.get(compteId) ?? null;
  // 🔴 LOT S (441) — « commissionné » FIGÉ sur la partie, comme le statut : celui déjà figé sur cette vente reste ; sinon le choix actuel du compte.
  const avecCommissionne = await commissionneDisponible();
  const commissionneActuel = new Map(cs.map((c) => [n(c.id), commissionneEffectif(c.role, commissionneLu(c.commissionne))]));
  const commissionneFige = new Map<number, boolean>();
  if (avecCommissionne && id !== null) {
    const { rows: deja } = await query<{ compte_id: string | null; commissionne: boolean | null }>(
      'SELECT compte_id, commissionne FROM transaction_partie WHERE vente_id = $1 AND retire_le IS NULL AND compte_id IS NOT NULL AND commissionne IS NOT NULL', [id]);
    for (const d of deja) if (d.commissionne !== null) commissionneFige.set(n(d.compte_id), d.commissionne);
  }
  const commissionnePour = (compteId: number): boolean => commissionneFige.get(compteId) ?? commissionneActuel.get(compteId) ?? true;
  const periodes = await lirePeriodesSociete(comptesIds);
  const nomDe = new Map(cs.map((c) => [n(c.id), String(c.nom)]));
  // 🔴 LOT K — un collaborateur des DEUX sociétés : la société de sa partie est celle CHOISIE pour cette vente (obligatoire) ; tout autre
  // collaborateur garde la sienne, relue en base à la date de la vente (ce que l'écran envoie pour lui est ignoré).
  const societeDuCompte = (id: number): SocieteCompte | null => societeALaDate(periodes.get(id) ?? [], dateVente);
  for (const p of s.parties) {
    if (p.sorte === 'exterieure' || p.compteId === null || societeDuCompte(p.compteId) !== LES_DEUX || p.societe != null) continue;
    return { ok: false, motif: `${nomDe.get(p.compteId) ?? 'Ce négociateur'} travaille pour CRITERIMMO et pour MACJ : choisissez pour quelle société il travaille sur cette vente (${p.sorte === 'sortie' ? 'sortie' : 'entrée'} du mandat). Rien n’a été enregistré.` };
  }
  const parties: Partie[] = s.parties.map((p) => (p.sorte === 'exterieure'
    ? { sorte: p.sorte, compteId: null, negociateur: null, societe: null, nom: p.nom, coordonnees: p.coordonnees, pourcentage: p.pourcentage, montantHt: p.montantHt }
    : { sorte: p.sorte, compteId: p.compteId, negociateur: p.compteId === null ? null : nomDe.get(p.compteId) ?? null,
      societe: p.compteId === null ? null : societeDuCompte(p.compteId) === LES_DEUX ? p.societe ?? null : societeDOffice(societeDuCompte(p.compteId)),
      nom: null, coordonnees: null, pourcentage: p.pourcentage, montantHt: p.montantHt }))
    .map((p) => (avecStatut ? { ...p, statut: p.compteId === null ? null : statutPour(p.compteId) } : p))
    .map((p) => (avecCommissionne ? { ...p, commissionne: p.compteId === null ? null : commissionnePour(p.compteId) } : p));
  // ② la répartition (somme = 100 %, sociétés connues, apporteur déduit d'abord)
  const repartie = s.entreeId !== null || s.sortieId !== null || parties.length > 0;
  // 🔴 LOT AE (Arno) — LA VENTE APPARTIENT À LA SOCIÉTÉ DU NÉGOCIATEUR D'ENTRÉE (pour un collaborateur des deux sociétés : celle choisie pour
  // cette vente) ; la page de saisie ne compte que sans négociateur d'entrée. Chez l'autre société, sa part reçue (ligne miroir).
  const porteuse = repartie ? parties.find((p) => (p.sorte === 'entree' || p.sorte === 'entree_sortie') && p.societe !== null)?.societe ?? null : null;
  if (repartie) {
    const motif = verifierRepartition(parties, s.honorairesTtc, retroTtc);
    if (motif !== null) return { ok: false, motif };
  }
  // ③ l'apporteur (annuaire de la Location)
  let apporteurNom = s.apporteurNom;
  if (s.apporteurId !== null) {
    const { rows: a } = await query<{ nom: string }>('SELECT nom FROM gestion_location_apporteur WHERE id = $1', [s.apporteurId]).catch(() => ({ rows: [] as { nom: string }[] }));
    if (a.length === 0) return { ok: false, motif: 'Apporteur inconnu dans l’annuaire des apporteurs.' };
    apporteurNom = String(a[0].nom);
  }
  // LOT I — la commission d'un côté se rattache à SON négociateur : sans négociateur de ce côté, refusée.
  if (commissions !== undefined) {
    for (const [cote, mot] of [['entree', 'd’entrée'], ['sortie', 'de sortie']] as const) {
      const negoId = cote === 'entree' ? s.entreeId : s.sortieId;
      if (commissions[cote] !== null && negoId === null) return { ok: false, motif: `Choisissez le négociateur ${mot} avant de saisir sa commission.` };
    }
  }
  // 🔴 LOT BJ — sans la 443, une saisie qui porte une société, une civilité, un prénom ou des représentants est refusée (rien n'est écrit).
  const avecType = await personneTypeDisponible();
  if (!avecType && s.personnes.some((p) => p.type === 'societe' || (p.civilite ?? null) !== null || (p.prenom ?? null) !== null || (p.representants ?? []).length > 0)) {
    return { ok: false, motif: MOTIF_SANS_443 };
  }
  const libelle = s.libelle ?? libelleDesPersonnes(s.personnes);
  if (libelle.trim() === '') return { ok: false, motif: 'Nommez au moins un vendeur ou un acquéreur (ou le libellé de la vente).' };
  const annee = s.statut === 'vendue' ? anneeDe(s.dateActe)! : anneeDe(s.dateActePrevue) ?? anneeDe(s.dateCompromis) ?? Number(aujourdhui.slice(0, 4));
  const valeurs: Record<string, unknown> = {
    libelle, honoraires_ttc: s.honorairesTtc, statut: s.statut, annee, mois_acte: s.statut === 'vendue' ? `${s.dateActe!.slice(0, 7)}-01` : null,
    date_compromis: s.dateCompromis, apporteur: apporteurNom, note: s.note, adresse_bien: s.adresseBien, date_acte_prevue: s.dateActePrevue, date_acte: s.dateActe,
    negociateur_entree_id: s.entreeId, negociateur_sortie_id: s.sortieId, apporteur_id: s.apporteurId, repartition: repartie,
    // LOT I — la rétrocession dans SON unité : en HT (437) la colonne TTC reste vide ; une rétrocession nulle s'écrit comme avant (0 TTC).
    retro_apporteur_ttc: s.retroUnite === 'ht' && s.retroApporteurTtc !== 0 ? null : s.retroApporteurTtc,
    ...(avecUnite ? { retro_apporteur_ht: s.retroUnite === 'ht' && s.retroApporteurTtc !== 0 ? s.retroApporteurTtc : null } : {}),
    ...((await prixVenteDisponible()) ? { prix_vente: s.prixVente } : {}),
  };
  return withTransaction(async (q) => {
    let venteId: number;
    // LOT V — la vente telle qu'elle était (commission, apporteur) : pour dire pourquoi une commission calculée a été recalculée.
    let avantVente: Record<string, unknown> | null = null;
    if (id === null) {
      const cols = Object.keys(valeurs);
      const { rows } = await q<{ id: string }>(
        `INSERT INTO transaction_vente (societe, origine, cree_par, cree_par_libelle, ${cols.join(', ')})
         VALUES ($1, 'saisie', $2, $3, ${cols.map((_, i) => `$${i + 4}`).join(', ')}) RETURNING id`, [porteuse ?? s.societe, auteur.id, auteur.libelle, ...cols.map((k) => valeurs[k])]);
      venteId = n(rows[0].id);
      for (const p of s.lignes) {
        await q(`INSERT INTO transaction_vente_ligne (vente_id, negociateur, role, montant_ttc, nature, compte, origine, cree_par_libelle)
                 VALUES ($1, $2, $3, $4, $5, $6, 'saisie', $7)`,
          [venteId, p.negociateur, p.role, p.montantTtc, s.statut === 'compromis' ? 'compromis' : 'vente', p.role !== 'negociateur', auteur.libelle]);
      }
      await journaliser(q, { entite: 'vente', id: venteId, action: 'saisie', avant: null, apres: { ...valeurs, lignes: s.lignes }, auteur,
        commentaire: s.statut === 'compromis' ? 'Compromis saisi (onglet Compromis) ; « Annuler » le retire (retire_le), rien n’est supprimé.' : 'Vente saisie avec sa répartition.' });
    } else {
      const actuel = await lireLigne(q, 'vente', id);
      if (actuel === null || actuel.retire_le !== null) return { ok: false, motif: 'Vente introuvable (ou retirée).' };
      avantVente = actuel;
      // LOT F — compléter un compromis (personnes, prix…) ne change aucun montant de place : sans date pour la fixer, il garde SON année
      // (le prévisionnel d'un compromis importé reste où il était) ; sans apporteur de l'annuaire, il garde l'apporteur écrit du fichier.
      if (s.statut === 'compromis' && s.dateActePrevue === null && s.dateCompromis === null) valeurs.annee = Number(actuel.annee);
      // 🔴 LOT BH — sauf « Supprimer » : le lien apporteur ↔ affaire est retiré, même un nom écrit (la fiche reste dans l'annuaire).
      if (s.retirerApporteur !== true && s.apporteurId === null && s.apporteurNom === null && actuel.apporteur_id == null) delete valeurs.apporteur;
      // LOT AE — le négociateur d'entrée a changé de société (autre négociateur, ou société choisie pour un collaborateur des deux) : la vente
      // bascule chez sa nouvelle porteuse (journalisé ; « Annuler » la remet) ; les lignes miroir suivent (registre, plus bas).
      const ecrites = porteuse !== null ? { ...valeurs, societe: porteuse } : valeurs;
      const r = await ecrire(q, 'vente', id, ecrites, true);
      if (r !== null && Object.keys(r.apres).length > 0) await journaliser(q, { entite: 'vente', id, action: 'modification', avant: r.avant, apres: r.apres, auteur,
        ...('societe' in r.apres ? { commentaire: `Société porteuse : ${LIBELLE_SOCIETE[String(r.avant.societe) as Societe] ?? r.avant.societe} → ${LIBELLE_SOCIETE[porteuse!]} (la société du négociateur d’entrée).` } : {}) });
      venteId = id;
    }
    // ④ les personnes : réutiliser une fiche connue, sinon en créer une ; l'ensemble des liens de la vente est remplacé (réversible)
    // 🔴 LOT BJ — une fiche se réutilise seulement pour une fiche du même type (particulier / société) ; une société, aussi par son nom ; chaque
    // création ou modification d'une fiche faite depuis l'affaire est aussi inscrite au journal de l'affaire ; une société garde ses représentants.
    const { rows: connues } = await q<Record<string, unknown>>(`SELECT id, nom, telephone, email, adresse${avecType ? ', type' : ''} FROM transaction_personne WHERE retire_le IS NULL`);
    const fiches = connues.map((p) => ({ id: n(p.id), nom: String(p.nom), telephone: t(p.telephone), email: t(p.email), adresse: t(p.adresse),
      type: p.type === 'societe' ? 'societe' as const : 'particulier' as const }));
    const nomNorme = (x: string): string => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const resoudre = async (p: { id: number | null; nom: string; telephone: string | null; email: string | null; adresse: string | null;
      type: 'particulier' | 'societe'; civilite: string | null; prenom: string | null; typeChoisi: boolean }): Promise<number> => {
      const memeType = fiches.filter((f) => f.type === p.type);
      let pid = p.id ?? personneExistante(p, memeType)?.id ?? (p.type === 'societe' ? memeType.find((f) => nomNorme(f.nom) === nomNorme(p.nom))?.id ?? null : null);
      const extra = avecType ? { type: p.type, civilite: p.civilite, prenom: p.prenom } : {};
      if (pid === null) {
        const cols = ['nom', 'telephone', 'email', 'adresse', ...Object.keys(extra), 'cree_par_libelle'];
        const vals = [p.nom, p.telephone, p.email, p.adresse, ...Object.values(extra), auteur.libelle];
        const { rows } = await q<{ id: string }>(`INSERT INTO transaction_personne (${cols.join(', ')}) VALUES (${cols.map((_, k) => `$${k + 1}`).join(', ')}) RETURNING id`, vals);
        pid = n(rows[0].id);
        fiches.push({ id: pid, nom: p.nom, telephone: p.telephone, email: p.email, adresse: p.adresse, type: p.type });
        const fiche = { nom: p.nom, telephone: p.telephone, email: p.email, adresse: p.adresse, ...extra };
        await journaliser(q, { entite: 'personne', id: pid, action: 'saisie', avant: null, apres: fiche, auteur });
        if (id !== null) await journaliser(q, { entite: 'vente', id, action: 'personne', avant: null, apres: { personne: pid, ...fiche }, auteur,
          commentaire: `Fiche créée : ${[p.prenom, p.nom].filter((x) => (x ?? '') !== '').join(' ')} (n° ${pid}).` });
      } else {
        // Une fiche connue : ce qui est saisi la complète ou la corrige (journalisé, réversible) ; un champ laissé vide ne l'efface pas.
        const maj: Record<string, unknown> = Object.fromEntries((['nom', 'telephone', 'email', 'adresse'] as const).filter((k) => p[k] !== null && p[k] !== '').map((k) => [k, p[k]]));
        if (avecType) { if (p.typeChoisi) maj.type = p.type; if (p.civilite !== null) maj.civilite = p.civilite; if (p.prenom !== null && p.prenom !== '') maj.prenom = p.prenom; }
        const r = await ecrire(q, 'personne', pid, maj, true);
        if (r !== null && Object.keys(r.apres).length > 0) {
          await journaliser(q, { entite: 'personne', id: pid, action: 'modification', avant: r.avant, apres: r.apres, auteur });
          if (id !== null) await journaliser(q, { entite: 'vente', id, action: 'personne', avant: { personne: pid, ...r.avant }, apres: { personne: pid, ...r.apres }, auteur,
            commentaire: `Fiche n° ${pid} modifiée.` });
        }
      }
      return pid;
    };
    const liens: { personneId: number; role: 'vendeur' | 'acquereur' }[] = [];
    for (const p of s.personnes) {
      const type = p.type ?? 'particulier';
      const pid = await resoudre({ ...p, type, civilite: p.civilite ?? null, prenom: p.prenom ?? null, typeChoisi: p.type !== undefined });
      // 🔴 LOT BJ — les représentants d'une société : l'ensemble est remplacé s'il a changé (retire_le, jamais supprimé), journalisé (fiche et affaire).
      if (avecType && type === 'societe') {
        const reps: number[] = [];
        for (const r of p.representants ?? []) {
          const rid = await resoudre({ ...r, type: 'particulier', typeChoisi: true });
          if (rid !== pid && !reps.includes(rid)) reps.push(rid);
        }
        const { rows: actifs } = await q<{ id: string; personne_id: string }>(
          'SELECT id, personne_id FROM transaction_personne_representant WHERE societe_id = $1 AND retire_le IS NULL ORDER BY rang, id', [pid]);
        const avant = actifs.map((x) => n(x.personne_id));
        if (JSON.stringify(avant) !== JSON.stringify(reps)) {
          await q('UPDATE transaction_personne_representant SET retire_le = now(), retire_par_libelle = $2 WHERE id = ANY($1::bigint[])', [actifs.map((x) => n(x.id)), auteur.libelle]);
          for (const [k, rid] of reps.entries()) {
            await q('INSERT INTO transaction_personne_representant (societe_id, personne_id, rang, cree_par_libelle) VALUES ($1, $2, $3, $4)', [pid, rid, k, auteur.libelle]);
          }
          await journaliser(q, { entite: 'personne', id: pid, action: 'representants', avant: { personnes: avant }, apres: { personnes: reps }, auteur });
          if (id !== null) await journaliser(q, { entite: 'vente', id, action: 'representants', avant: { societe: pid, personnes: avant }, apres: { societe: pid, personnes: reps }, auteur,
            commentaire: `Représentants de la société n° ${pid} : ${reps.length} (avant : ${avant.length}).` });
        }
      }
      if (!liens.some((l) => l.personneId === pid && l.role === p.role)) liens.push({ personneId: pid, role: p.role });
    }
    await remplacerEnsemble(q, 'personnes', venteId, auteur, async (avant) => {
      const { rows: a } = await q<{ personne_id: string; role: string }>('SELECT personne_id, role FROM transaction_vente_personne WHERE id = ANY($1::bigint[]) ORDER BY id', [avant]);
      return JSON.stringify(a.map((x) => [n(x.personne_id), x.role])) === JSON.stringify(liens.map((l) => [l.personneId, l.role]));
    }, async () => {
      const ids: number[] = [];
      for (const [i, l] of liens.entries()) {
        const { rows } = await q<{ id: string }>(
          'INSERT INTO transaction_vente_personne (vente_id, personne_id, role, rang, cree_par_libelle) VALUES ($1, $2, $3, $4, $5) RETURNING id', [venteId, l.personneId, l.role, i, auteur.libelle]);
        ids.push(n(rows[0].id));
      }
      return ids;
    });
    // ⑤ la répartition : l'ensemble des parties est remplacé s'il a changé (réversible)
    const repartitionChangee = await remplacerEnsemble(q, 'repartition', venteId, auteur, async (avant) => {
      const { rows: a } = await q<Record<string, unknown>>(
        `SELECT sorte, compte_id, negociateur_libelle, societe, nom, coordonnees, pourcentage, montant_ht${avecStatut ? ', statut' : ''}${avecCommissionne ? ', commissionne' : ''} FROM transaction_partie WHERE id = ANY($1::bigint[]) ORDER BY rang, id`, [avant]);
      return JSON.stringify(a.map(partieDe)) === JSON.stringify(repartie ? parties : []);
    }, async () => {
      const ids: number[] = [];
      for (const [i, p] of (repartie ? parties : []).entries()) {
        const { rows } = await q<{ id: string }>(
          `INSERT INTO transaction_partie (vente_id, sorte, compte_id, negociateur_libelle, societe, nom, coordonnees, pourcentage, montant_ht, rang, cree_par_libelle${avecStatut ? ', statut' : ''}${avecCommissionne ? ', commissionne' : ''})
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11${avecStatut ? ', $12' : ''}${avecCommissionne ? `, $${avecStatut ? 13 : 12}` : ''}) RETURNING id`,
          [venteId, p.sorte, p.compteId, p.negociateur, p.societe, p.nom, p.coordonnees, p.pourcentage, p.montantHt, i, auteur.libelle, ...(avecStatut ? [p.statut ?? null] : []),
            ...(avecCommissionne ? [p.commissionne ?? null] : [])]);
        ids.push(n(rows[0].id));
      }
      return ids;
    }, repartie ? `Répartition : ${parties.map((p) => `${p.sorte === 'exterieure' ? p.nom : p.negociateur} ${p.pourcentage !== null ? `${p.pourcentage} %` : `${p.montantHt} € HT`}`).join(' · ')}` : 'Répartition retirée.');
    // ⑥ LOT I (437) — les commissions versées aux négociateurs d'entrée et de sortie (la « paye du négociateur », par côté), chacune dans
    // SON unité : l'ensemble des lignes à côté de la vente est remplacé s'il a changé (réversible) ; les lignes d'avant ne bougent pas.
    if (commissions !== undefined && avecUnite) {
      const colonnes = `cote, negociateur, montant_ttc, montant_ht${avecTaux ? ', taux' : ''}${avecMode ? ', mode_commission' : ''}`;
      const { rows: deja } = id === null ? { rows: [] as Record<string, unknown>[] } : await q<Record<string, unknown>>(
        `SELECT ${colonnes} FROM transaction_vente_ligne WHERE vente_id = $1 AND retire_le IS NULL AND cote IS NOT NULL ORDER BY id`, [venteId]);
      // 🔴 LOT V (Arno) — UNE COMMISSION « CALCULÉE » SUIT LE CALCUL : le serveur la calcule lui-même sur ce qui s'enregistre (honoraires de ce
      // côté — commission nette de l'apporteur × sa part — × le taux), dans l'unité choisie, sans arrondi. « Manuelle » : le montant tapé, tel quel.
      const nego = (x: number | null) => (x === null ? null : { id: x, nom: nomDe.get(x) ?? '' });
      const pourCalcul = { honorairesTtc: s.honorairesTtc, repartition: repartie ? { parties, retroApporteurTtc: retroTtc } : null,
        dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: nego(s.entreeId), sortie: nego(s.sortieId), apporteurId: null, personnes: [] } };
      const recalculees: ('entree' | 'sortie')[] = [];
      const voulues = (['entree', 'sortie'] as const).flatMap((cote): CommissionVoulue[] => {
        const negoId = cote === 'entree' ? s.entreeId : s.sortieId;
        if (negoId === null) return [];
        const taux = avecTaux ? commissions.taux?.[cote] ?? null : null;
        const mode = commissions.mode?.[cote] ?? null;
        const h = mode === 'calculee' ? honorairesDuCote(pourCalcul, cote) : null;
        const m = h === null ? commissions[cote] : calculDansUnite((h.ttc * (taux ?? TAUX_REMUNERATION_DEFAUT)) / 100, commissions[cote]?.unite ?? 'ttc');
        if (h !== null) recalculees.push(cote);
        return m === null ? [] : [{ cote, negociateur: nomDe.get(negoId) ?? '', ttc: m.unite === 'ttc' ? m.montant : null, ht: m.unite === 'ht' ? m.montant : null,
          taux, mode: avecMode && (mode === 'manuelle' || h !== null) ? mode : null }];
      });
      // 🔴 LOT S — un côté tenu par un négociateur NON COMMISSIONNÉ : sa commission déjà enregistrée reste TELLE QUELLE (intacte, ignorée des
      // calculs) ; rien de neuf ne s'écrit pour lui, quoi que l'écran envoie.
      const nonCommissionnes = (['entree', 'sortie'] as const).filter((cote) => { const negoId = cote === 'entree' ? s.entreeId : s.sortieId; return negoId !== null && !commissionnePour(negoId); });
      let finales = voulues;
      if (nonCommissionnes.length > 0) {
        const garde = deja.filter((l) => nonCommissionnes.includes(l.cote as 'entree' | 'sortie')
          && String(l.negociateur) === (nomDe.get((l.cote === 'entree' ? s.entreeId : s.sortieId) as number) ?? ''))
          .map((l): CommissionVoulue => ({ cote: l.cote as 'entree' | 'sortie', negociateur: String(l.negociateur), ttc: nOuNull(l.montant_ttc), ht: nOuNull(l.montant_ht),
            taux: avecTaux ? nOuNull(l.taux) : null, mode: avecMode ? modeLu(l.mode_commission) : null }));
        finales = [...voulues.filter((c) => !nonCommissionnes.includes(c.cote)), ...garde].sort((a, b) => (a.cote === b.cote ? 0 : a.cote === 'entree' ? -1 : 1));
      }
      // LOT V — pourquoi les commissions calculées ont bougé (journal : « recalculée suite à … »).
      const recalculeesFinales = recalculees.filter((c) => !nonCommissionnes.includes(c));
      const causes: string[] = [];
      if (avantVente !== null) {
        if (Number(avantVente.honoraires_ttc) !== s.honorairesTtc) causes.push('changement de la commission de la vente');
        const retroAvant = avantVente.retro_apporteur_ht != null ? Number(avantVente.retro_apporteur_ht) * TVA : Number(avantVente.retro_apporteur_ttc ?? 0);
        if (nOuNull(avantVente.apporteur_id) !== s.apporteurId || Math.abs(retroAvant - retroTtc) >= 0.005) causes.push('changement de l’apporteur');
      }
      if (repartitionChangee) causes.push('changement de la répartition');
      if (avecTaux && recalculeesFinales.some((c) => (nOuNull(deja.find((l) => l.cote === c)?.taux) ?? TAUX_REMUNERATION_DEFAUT) !== (commissions.taux?.[c] ?? TAUX_REMUNERATION_DEFAUT))) causes.push('changement du taux');
      const prefixe = recalculeesFinales.length === 0 || causes.length === 0 ? undefined
        : `Commission${recalculeesFinales.length > 1 ? 's' : ''} recalculée${recalculeesFinales.length > 1 ? 's' : ''} suite à : ${causes.join(', ')}`;
      await poserCommissions(q, venteId, s.statut, finales, avecTaux, auteur, avecMode, prefixe);
    }
    // 🔴 LOT R — la ligne miroir de l'autre société suit la vente (création, %, négociateur, commission, apporteur).
    await synchroniserInterCabinet(q, venteId, auteur);
    return { ok: true, valeur: venteId };
  });
}

// ── 🔴 LOT AE : les ventes réparties enregistrées dans une autre société que leur porteuse (le script `transaction:ranger-porteuse`) ──

/** Une vente répartie dont la société enregistrée n'est pas sa porteuse (la société de son négociateur d'entrée). */
export interface VenteMalRangee { id: number; libelle: string; statut: string; enregistree: Societe; porteuse: Societe; negociateurEntree: string | null }

/** Les ventes réparties (non retirées) mal rangées. Lecture seule. */
export async function ventesMalRangees(): Promise<VenteMalRangee[]> {
  if (!(await repartitionDisponible())) return [];
  const { rows } = await query<{ id: string; libelle: string; statut: string; societe: string; porteuse: string; negociateur: string | null }>(
    `SELECT v.id, v.libelle, v.statut, v.societe, p.societe AS porteuse, p.negociateur_libelle AS negociateur
       FROM transaction_vente v
       JOIN LATERAL (SELECT societe, negociateur_libelle FROM transaction_partie p WHERE p.vente_id = v.id AND p.retire_le IS NULL
                       AND p.sorte IN ('entree', 'entree_sortie') AND p.societe IS NOT NULL ORDER BY p.rang, p.id LIMIT 1) p ON true
      WHERE v.retire_le IS NULL AND v.repartition AND p.societe <> v.societe ORDER BY v.id`);
  return rows.filter((r) => estSociete(r.societe) && estSociete(r.porteuse)).map((r) => ({ id: n(r.id), libelle: String(r.libelle), statut: String(r.statut),
    enregistree: r.societe as Societe, porteuse: r.porteuse as Societe, negociateurEntree: t(r.negociateur) }));
}

/**
 * Range une vente répartie chez sa porteuse (la société de son négociateur d'entrée) : la colonne `societe` réécrite, journalisée (« Annuler »
 * la remet) ; le registre des lignes miroir suit. Une vente déjà bien rangée : rien. Jamais une suppression.
 */
export async function rangerPorteuse(id: number, auteur: AuteurTx): Promise<Issue<{ avant: Societe; apres: Societe } | null>> {
  if (!(await repartitionDisponible())) return { ok: false, motif: MOTIF_SANS_434 };
  return withTransaction(async (q) => {
    const actuel = await lireLigne(q, 'vente', id);
    if (actuel === null || actuel.retire_le !== null) return { ok: false, motif: 'Vente introuvable (ou retirée).' };
    const { rows: parties } = await q<Record<string, unknown>>(
      `SELECT sorte, compte_id, negociateur_libelle, societe, nom, coordonnees, pourcentage, montant_ht FROM transaction_partie WHERE vente_id = $1 AND retire_le IS NULL ORDER BY rang, id`, [id]);
    if (parties.length === 0) return { ok: true, valeur: null };
    const avant = String(actuel.societe) as Societe;
    const porteuse = societePorteuse({ societe: avant, repartition: { retroApporteurTtc: 0, parties: parties.map(partieDe) } });
    if (porteuse === avant) return { ok: true, valeur: null };
    const r = await ecrire(q, 'vente', id, { societe: porteuse }, true);
    await journaliser(q, { entite: 'vente', id, action: 'modification', avant: r?.avant ?? null, apres: r?.apres ?? null, auteur,
      commentaire: `Rangée chez sa société porteuse : ${LIBELLE_SOCIETE[avant]} → ${LIBELLE_SOCIETE[porteuse]} (la société du négociateur d’entrée) — transaction:ranger-porteuse.` });
    await synchroniserInterCabinet(q, id, auteur);
    return { ok: true, valeur: { avant, apres: porteuse } };
  });
}

/** Une commission de négociateur à poser (LOT I : son unité ; LOT R : son taux de rémunération, null : 50 % par défaut). */
interface CommissionVoulue { cote: 'entree' | 'sortie'; negociateur: string; ttc: number | null; ht: number | null; taux: number | null;
  /** LOT V (442) — le mode enregistré (null : déduit, ou colonne absente). */
  mode: ModeCommission | null }

/** LOT I / R — l'ensemble des commissions d'une vente remplacé s'il a changé (réversible, journalisé). */
async function poserCommissions(q: RequeteTx, venteId: number, statut: string, voulues: readonly CommissionVoulue[], avecTaux: boolean, auteur: AuteurTx,
  avecMode = false, prefixe?: string): Promise<boolean> {
  return remplacerEnsemble(q, 'commissions', venteId, auteur, async (avant) => {
    const { rows: a } = await q<Record<string, unknown>>(
      `SELECT cote, negociateur, montant_ttc, montant_ht${avecTaux ? ', taux' : ''}${avecMode ? ', mode_commission' : ''} FROM transaction_vente_ligne WHERE id = ANY($1::bigint[]) ORDER BY id`, [avant]);
    return JSON.stringify(a.map((x) => [x.cote, x.negociateur, nOuNull(x.montant_ttc), nOuNull(x.montant_ht), avecTaux ? nOuNull(x.taux) : null, avecMode ? modeLu(x.mode_commission) : null]))
      === JSON.stringify(voulues.map((x) => [x.cote, x.negociateur, x.ttc, x.ht, avecTaux ? x.taux : null, avecMode ? x.mode : null]));
  }, async () => {
    const ids: number[] = [];
    for (const c of voulues) {
      const { rows } = await q<{ id: string }>(
        `INSERT INTO transaction_vente_ligne (vente_id, negociateur, role, montant_ttc, montant_ht, cote, nature, compte, origine, cree_par_libelle${avecTaux ? ', taux' : ''}${avecMode ? ', mode_commission' : ''})
         VALUES ($1, $2, 'negociateur', $3, $4, $5, $6, false, 'saisie', $7${avecTaux ? ', $8' : ''}${avecMode ? `, $${avecTaux ? 9 : 8}` : ''}) RETURNING id`,
        [venteId, c.negociateur, c.ttc, c.ht, c.cote, statut === 'compromis' ? 'compromis' : 'vente', auteur.libelle, ...(avecTaux ? [c.taux] : []), ...(avecMode ? [c.mode] : [])]);
      ids.push(n(rows[0].id));
    }
    return ids;
  }, `${prefixe === undefined ? '' : `${prefixe} — `}${voulues.length === 0 ? 'Commissions versées retirées.' : `Commissions versées : ${voulues.map((c) => `${c.cote === 'entree' ? 'entrée' : 'sortie'} ${c.negociateur} ${c.ht ?? c.ttc} € ${c.ht !== null ? 'HT' : 'TTC'}${c.taux !== null ? ` (taux ${c.taux.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %)` : ''}${c.mode === 'manuelle' ? ', saisie à la main' : c.mode === 'calculee' ? ', calculée' : ''}`).join(' · ')}`}`);
}

/**
 * 🔴 LOT R — LA RÉMUNÉRATION D'UN CÔTÉ, SEULE (depuis la carte d'un compromis ou depuis sa ligne miroir chez l'autre société) : le montant
 * dans son unité et le taux (ou « Appliquer le calcul »). Elle s'enregistre sur la VENTE D'ORIGINE (aucune donnée dupliquée) ; la commission
 * de l'autre côté ne bouge pas. Journalisé, réversible (« Annuler » dans l'historique de la vente).
 */
export async function enregistrerCommissionCote(id: number, cote: 'entree' | 'sortie', montant: MontantSaisi | null, taux: number | null, auteur: AuteurTx,
  /** 🔴 LOT V — « calculee » (Appliquer / Revenir au calcul, taux modifié) ou « manuelle » (montant tapé) ; null : inconnu. */
  mode: ModeCommission | null = null): Promise<Issue> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  if (!(await repartitionDisponible())) return { ok: false, motif: MOTIF_SANS_434 };
  if (!(await uniteCommissionDisponible())) return { ok: false, motif: MOTIF_SANS_437 };
  const avecTaux = await interCabinetDisponible();
  const avecMode = await modeCommissionDisponible();
  if (montant !== null && (!Number.isFinite(montant.montant) || montant.montant < 0 || !estUnite(montant.unite))) return { ok: false, motif: 'La rémunération doit être un montant positif, en HT ou en TTC.' };
  if (taux !== null && (!Number.isFinite(taux) || taux < 0)) return { ok: false, motif: 'Le taux de rémunération doit être un pourcentage positif.' };
  return withTransaction(async (q) => {
    const actuel = await lireLigne(q, 'vente', id);
    if (actuel === null || actuel.retire_le !== null) return { ok: false, motif: 'Vente introuvable (ou retirée).' };
    const negoId = cote === 'entree' ? actuel.negociateur_entree_id : actuel.negociateur_sortie_id;
    if (negoId == null) return { ok: false, motif: `Choisissez le négociateur ${cote === 'entree' ? 'd’entrée' : 'de sortie'} avant de saisir sa rémunération.` };
    const { rows: c } = await q<{ nom: string; role: string; commissionne: string | null }>(
      `SELECT coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant) AS nom, role, to_jsonb(admin_utilisateur) ->> 'commissionne' AS commissionne FROM admin_utilisateur WHERE id = $1`, [negoId]);
    // 🔴 LOT S — un négociateur NON COMMISSIONNÉ sur cette vente (figé sur sa partie, sinon son compte) : aucune rémunération ne s'enregistre.
    const { rows: fige } = (await commissionneDisponible())
      ? await q<{ commissionne: boolean | null }>('SELECT commissionne FROM transaction_partie WHERE vente_id = $1 AND compte_id = $2 AND retire_le IS NULL AND commissionne IS NOT NULL ORDER BY rang, id LIMIT 1', [id, negoId])
      : { rows: [] as { commissionne: boolean | null }[] };
    if (!(fige[0]?.commissionne ?? commissionneEffectif(c[0]?.role, commissionneLu(c[0]?.commissionne)))) {
      return { ok: false, motif: `${String(c[0]?.nom ?? 'Ce négociateur')} n’est pas commissionné sur cette vente : aucune rémunération ne s’enregistre. Rien n’a été enregistré.` };
    }
    const { rows: ls } = await q<Record<string, unknown>>(
      `SELECT cote, negociateur, montant_ttc, montant_ht${avecTaux ? ', taux' : ''}${avecMode ? ', mode_commission' : ''} FROM transaction_vente_ligne
        WHERE vente_id = $1 AND retire_le IS NULL AND cote IS NOT NULL ORDER BY id`, [id]);
    const garde = ls.filter((l) => l.cote !== cote).map((l): CommissionVoulue => ({ cote: l.cote as 'entree' | 'sortie', negociateur: String(l.negociateur),
      ttc: nOuNull(l.montant_ttc), ht: nOuNull(l.montant_ht), taux: avecTaux ? nOuNull(l.taux) : null, mode: avecMode ? modeLu(l.mode_commission) : null }));
    const neuve: CommissionVoulue[] = montant === null ? [] : [{ cote, negociateur: String(c[0]?.nom ?? ''), ttc: montant.unite === 'ttc' ? montant.montant : null,
      ht: montant.unite === 'ht' ? montant.montant : null, taux: avecTaux ? taux : null, mode: avecMode ? mode : null }];
    const voulues = [...garde, ...neuve].sort((a, b) => (a.cote === b.cote ? 0 : a.cote === 'entree' ? -1 : 1));
    const avant = await idsActifs(q, 'transaction_vente_ligne', id, filtreDe('commissions'));
    await poserCommissions(q, id, String(actuel.statut), voulues, avecTaux, auteur, avecMode, mode === 'calculee' ? 'Calcul appliqué' : undefined);
    if (memesIds(await idsActifs(q, 'transaction_vente_ligne', id, filtreDe('commissions')), avant)) return { ok: false, motif: 'Rien n’a changé.' };
    return { ok: true };
  });
}

/** Remplace un ensemble de lignes d'une vente si `inchange` dit qu'il a changé : retire l'actuel, pose le neuf, journalise les deux listes d'ids. */
async function remplacerEnsemble(q: RequeteTx, action: 'repartition' | 'personnes' | 'commissions', venteId: number, auteur: AuteurTx,
  inchange: (avant: number[]) => Promise<boolean>, poser: () => Promise<number[]>, commentaire?: string): Promise<boolean> {
  const table = ENSEMBLES[action]!.table;
  const avant = await idsActifs(q, table, venteId, filtreDe(action));
  if (await inchange(avant)) return false;
  await q(`UPDATE ${table} SET retire_le = now(), retire_par_libelle = $2 WHERE id = ANY($1::bigint[])`, [avant, auteur.libelle]);
  const apres = await poser();
  await journaliser(q, { entite: 'vente', id: venteId, action, avant: { ids: avant }, apres: { ids: apres }, auteur, commentaire: commentaire ?? null });
  return true;
}

/** « Acte signé » : le compromis devient une vente encaissée au mois de l'acte (date saisie). Journalisé ; « Revenir en compromis » le défait. */
export async function acteSigne(id: number, dateActe: string, auteur: AuteurTx): Promise<Issue> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  return withTransaction(async (q) => {
    const actuel = await lireLigne(q, 'vente', id);
    if (actuel === null || actuel.retire_le !== null) return { ok: false, motif: 'Compromis introuvable (ou retiré).' };
    if (actuel.statut !== 'compromis') return { ok: false, motif: 'Ce n’est pas un compromis en cours.' };
    const lotD = await repartitionDisponible();
    const r = await ecrire(q, 'vente', id, { statut: 'vendue', annee: Number(dateActe.slice(0, 4)), mois_acte: `${dateActe.slice(0, 7)}-01`, ...(lotD ? { date_acte: dateActe } : {}) }, true);
    await journaliser(q, { entite: 'vente', id, action: 'acte_signe', avant: r?.avant ?? null, apres: r?.apres ?? null, auteur,
      commentaire: `Acte signé le ${dateActe.split('-').reverse().join('/')} : vente encaissée au mois de l’acte.` });
    await synchroniserInterCabinet(q, id, auteur);
    return { ok: true };
  });
}

/** « Revenir en compromis » : la vente redevient un compromis en cours (année : celle de l'acte prévu, sinon l'année actuelle). Journalisé. */
export async function retourCompromis(id: number, auteur: AuteurTx): Promise<Issue> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  return withTransaction(async (q) => {
    const actuel = await lireLigne(q, 'vente', id);
    if (actuel === null || actuel.retire_le !== null) return { ok: false, motif: 'Vente introuvable (ou retirée).' };
    if (actuel.statut !== 'vendue') return { ok: false, motif: 'Ce n’est pas une vente encaissée.' };
    const lotD = await repartitionDisponible();
    const prevue = typeof actuel.date_acte_prevue === 'string' ? Number(actuel.date_acte_prevue.slice(0, 4)) : null;
    const r = await ecrire(q, 'vente', id, { statut: 'compromis', mois_acte: null, annee: prevue ?? Number(actuel.annee), ...(lotD ? { date_acte: null } : {}) }, true);
    await journaliser(q, { entite: 'vente', id, action: 'retour_compromis', avant: r?.avant ?? null, apres: r?.apres ?? null, auteur,
      commentaire: 'Revenue en compromis en cours (l’acte n’est plus compté).' });
    await synchroniserInterCabinet(q, id, auteur);
    return { ok: true };
  });
}

// ── LOT G (migration 436) : annuler un compromis, le rétablir ───────────────────────────────────────────────────────────────

export const MOTIF_SANS_436 = 'Disponible après la mise à jour de la base (migration 436) : rien n’a été enregistré.';

/**
 * « Confirmer l'annulation » : le compromis passe « annulé » (motif, date, note) — il sort des compromis en cours et du prévisionnel, ne
 * compte dans aucun CA, et reste consultable. Rien n'est supprimé ; journalisé ; « Rétablir le compromis » le défait.
 */
export async function annulerCompromis(id: number, a: AnnulationSaisie, auteur: AuteurTx): Promise<Issue> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  if (!(await annulationDisponible())) return { ok: false, motif: MOTIF_SANS_436 };
  return withTransaction(async (q) => {
    const actuel = await lireLigne(q, 'vente', id);
    if (actuel === null || actuel.retire_le !== null) return { ok: false, motif: 'Compromis introuvable (ou retiré).' };
    if (actuel.statut !== 'compromis') return { ok: false, motif: 'Ce n’est pas un compromis en cours.' };
    const r = await ecrire(q, 'vente', id, { statut: 'annulee', annulation_date: a.date, annulation_motif: a.motif, annulation_note: a.note }, true);
    await journaliser(q, { entite: 'vente', id, action: 'annulation_compromis', avant: r?.avant ?? null, apres: r?.apres ?? null, auteur,
      commentaire: `Compromis annulé le ${a.date.split('-').reverse().join('/')} : ${a.motif}.` });
    await synchroniserInterCabinet(q, id, auteur);
    return { ok: true };
  });
}

/** « Rétablir le compromis » : il redevient un compromis en cours (motif, date et note de l'annulation vidés, gardés au journal). */
export async function retablirCompromis(id: number, auteur: AuteurTx): Promise<Issue> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  if (!(await annulationDisponible())) return { ok: false, motif: MOTIF_SANS_436 };
  return withTransaction(async (q) => {
    const actuel = await lireLigne(q, 'vente', id);
    if (actuel === null || actuel.retire_le !== null) return { ok: false, motif: 'Compromis introuvable (ou retiré).' };
    if (actuel.statut !== 'annulee' || actuel.annulation_motif == null) return { ok: false, motif: 'Ce compromis n’est pas annulé.' };
    const r = await ecrire(q, 'vente', id, { statut: 'compromis', annulation_date: null, annulation_motif: null, annulation_note: null }, true);
    await journaliser(q, { entite: 'vente', id, action: 'retablissement_compromis', avant: r?.avant ?? null, apres: r?.apres ?? null, auteur,
      commentaire: 'Compromis rétabli : de nouveau en cours.' });
    await synchroniserInterCabinet(q, id, auteur);
    return { ok: true };
  });
}

// ── LOT Q : le statut des négociateurs IMPORTÉS (paye d'un fichier, sans partie) ──────────────────────────────────────────────────

/**
 * 🔴 LOT Q (Arno, 28/10/2026) — « libellé de négociateur → statut ACTUEL du compte rapproché », pour la paye importée (lignes sans partie).
 * Le rapprochement est celui qui existe déjà, sans rien deviner : ① un rattachement posé à la main (Location, migration 432) ; ② le nom
 * complet ou l'adresse d'UN SEUL compte (`rattacherLibelle`) ; ③ sinon le prénom (ou « prénom nom ») d'UN SEUL compte (`comptesDeLOnglet`,
 * la règle de la société au lot D) ; ④ 🔴 LOT BX : AUCUN compte → la fiche « statut sans compte » du libellé (migration 444, ancien
 * collaborateur des fichiers). Rien de tout cela, ou compte « à renseigner » : null — la paye n'est pas déduite et elle est signalée.
 * Les observateurs ne sont jamais négociateurs (exclus de la liste des comptes). LECTURE SEULE.
 */
export async function lireStatutsNegociateurs(libelles: readonly string[]): Promise<Record<string, Statut | null>> {
  const uniques = [...new Set(libelles.filter((l) => l.trim() !== ''))];
  if (uniques.length === 0) return {};
  // 🔴 LOT BX — un libellé qui ne se rapproche d'AUCUN compte (ancien collaborateur des fichiers) : le statut de sa fiche (migration 444).
  const [comptes, fiches] = await Promise.all([comptesRapprochesDesLibelles(uniques), lireFichesStatut().catch(() => [])]);
  const statuts = await statutsDesComptes([...new Set(Object.values(comptes).flatMap((c) => (c === null ? [] : [c.id])))]);
  const out: Record<string, Statut | null> = {};
  for (const l of uniques) { const c = comptes[l]; out[l] = c === null ? statutDeFiche(fiches, l) : statuts.get(c.id) ?? null; }
  return out;
}

/** Le compte rapproché de chaque libellé (règles ① à ③ ci-dessus), ou null : aucun compte sûr. LECTURE SEULE. */
export async function comptesRapprochesDesLibelles(libelles: readonly string[]): Promise<Record<string, { id: number; nom: string } | null>> {
  const [comptes, alias] = await Promise.all([lireComptesNegociateurs(), lireAliasNegociateurs().catch(() => [])]);
  const pourOnglet = comptes.map((c) => ({ id: c.id, prenom: c.prenom ?? '', nom: c.nom ?? '' }));
  const out: Record<string, { id: number; nom: string } | null> = {};
  for (const l of libelles) {
    const r = rattacherLibelle(l, comptes, alias);
    let id: number | null = r.sorte === 'compte' || r.sorte === 'alias' || r.sorte === 'auto' ? r.compteId : null;
    if (id === null) { const cs = comptesDeLOnglet(l, pourOnglet); if (cs.length === 1) id = cs[0].id; }
    const c = id === null ? undefined : comptes.find((x) => x.id === id);
    out[l] = c === undefined ? null : { id: c.id, nom: [c.prenom, c.nom].filter(Boolean).join(' ') || c.identifiant };
  }
  return out;
}

/** Les libellés des négociateurs dont la paye est saisie sur ces ventes (lignes « paye du négociateur »). PUR. */
export const libellesDePaye = (ventes: readonly Vente[]): string[] =>
  [...new Set(ventes.flatMap((v) => v.lignes.filter((l) => l.role === 'negociateur').map((l) => l.negociateur)))];
