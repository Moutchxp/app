// TUILE « TRANSACTION » (Arno, 27/10/2026) — LA BASE : lectures, saisies, modifications, rattachements, retours en arrière.
// Pas de `import 'server-only'` (même convention que les dépôts de la Location lus par les scripts) ; aucun composant client ne
// l'importe. 🔴 RIEN N'EST JAMAIS SUPPRIMÉ : retirer = `retire_le` ; chaque geste écrit au journal sa valeur avant / après, et
// « Annuler » rejoue la valeur d'avant (un nouveau geste, journalisé lui aussi).
import { query, withTransaction, type RequeteTx } from '../db/client';
import { droitTransactionDisponible } from '../admin/schemaDroits';
import type { Attribution, CaARattacher, GestionMois, LigneVente, Retrocession, Societe, Vente } from './modele';
import type { ChampsVente, GestionSaisie, RetroSaisie, VenteSaisie } from './saisie';

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
const premierDuMois = (annee: number, mois: number | null): string | null => (mois === null ? null : `${annee}-${String(mois).padStart(2, '0')}-01`);

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────────

function venteDe(r: Record<string, unknown>, lignes: LigneVente[]): Vente {
  return { id: n(r.id), societe: r.societe as Societe, libelle: String(r.libelle), honorairesTtc: n(r.honoraires_ttc), statut: r.statut as Vente['statut'],
    annee: n(r.annee), mois: moisDe(r.mois_acte), dateCompromis: jour(r.date_compromis), apporteur: t(r.apporteur), note: t(r.note),
    origine: r.origine as Vente['origine'], sourceFichier: t(r.source_fichier), sourceOnglet: t(r.source_onglet), sourceLigne: nOuNull(r.source_ligne), lignes,
    double: r.double_cle === null || r.double_cle === undefined ? null : { cle: String(r.double_cle), attribution: r.attribution as Attribution } };
}

/** Les ventes (et compromis) non retirés d'une société — toutes si `societe` est null — avec leurs lignes. */
export async function lireVentes(societe: Societe | null): Promise<Vente[]> {
  const { rows } = await query<Record<string, unknown>>(
    // Les dates en TEXTE (« AAAA-MM-JJ ») : lues en Date, le pilote les placerait à minuit LOCAL (la veille en UTC).
    `SELECT id, societe, libelle, honoraires_ttc, statut, annee, to_char(mois_acte, 'YYYY-MM-DD') AS mois_acte,
            to_char(date_compromis, 'YYYY-MM-DD') AS date_compromis, apporteur, note, origine, source_fichier, source_onglet, source_ligne,
            double_cle, attribution
       FROM transaction_vente WHERE retire_le IS NULL AND ($1::text IS NULL OR societe = $1) ORDER BY annee, mois_acte NULLS LAST, id`, [societe]);
  const { rows: ls } = await query<Record<string, unknown>>(
    `SELECT l.id, l.vente_id, l.negociateur, l.role, l.montant_ttc, l.nature, l.compte, l.origine, l.source_fichier, l.source_onglet, l.source_ligne, l.note
       FROM transaction_vente_ligne l JOIN transaction_vente v ON v.id = l.vente_id
      WHERE l.retire_le IS NULL AND v.retire_le IS NULL AND ($1::text IS NULL OR v.societe = $1) ORDER BY l.id`, [societe]);
  const parVente = new Map<number, LigneVente[]>();
  for (const l of ls) {
    const id = n(l.vente_id);
    parVente.set(id, [...(parVente.get(id) ?? []), { id: n(l.id), negociateur: String(l.negociateur), role: l.role as LigneVente['role'],
      montantTtc: nOuNull(l.montant_ttc), nature: l.nature as LigneVente['nature'], compte: l.compte === true, origine: l.origine as LigneVente['origine'],
      sourceFichier: t(l.source_fichier), sourceOnglet: t(l.source_onglet), sourceLigne: nOuNull(l.source_ligne), note: t(l.note) }]);
  }
  return rows.map((r) => venteDe(r, parVente.get(n(r.id)) ?? []));
}

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

type Entite = 'vente' | 'vente_ligne' | 'retrocession' | 'ca_a_rattacher' | 'gestion_mois';
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
  vente: { table: 'transaction_vente', colonnes: ['libelle', 'honoraires_ttc', 'statut', 'annee', 'mois_acte', 'date_compromis', 'apporteur', 'note', 'retire_le', 'attribution'] },
  vente_ligne: { table: 'transaction_vente_ligne', colonnes: ['negociateur', 'role', 'montant_ttc', 'retire_le'] },
  retrocession: { table: 'transaction_retrocession', colonnes: ['vente_id', 'apporteur', 'montant_ttc', 'retire_le'] },
  ca_a_rattacher: { table: 'transaction_ca_a_rattacher', colonnes: ['retire_le'] },
  gestion_mois: { table: 'transaction_gestion_mois', colonnes: ['nb_lots', 'honoraires_ht', 'adhoc_ht', 'salarie_ht', 'reste_ht', 'note', 'retire_le'] },
};

/** La valeur d'une colonne comme le journal la garde (numeric en nombre, date en « AAAA-MM-JJ », instant en ISO). */
function valeurJournal(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v ?? null;
}
async function lireLigne(q: RequeteTx, entite: Entite, id: number): Promise<Record<string, unknown> | null> {
  const c = COLONNES[entite];
  const { rows } = await q<Record<string, unknown>>(
    `SELECT ${c.colonnes.map((x) => (x === 'mois_acte' || x === 'date_compromis' ? `to_char(${x}, 'YYYY-MM-DD') AS ${x}` : x)).join(', ')}
       FROM ${c.table} WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] === undefined ? null : Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, valeurJournal(v)]));
}
/** Écrit des colonnes (de la liste fermée) sur une ligne ; rend la valeur d'avant et d'après des SEULES colonnes changées. */
async function ecrire(q: RequeteTx, entite: Entite, id: number, valeurs: Record<string, unknown>, avecModifie: boolean):
  Promise<{ avant: Record<string, unknown>; apres: Record<string, unknown> } | null> {
  const c = COLONNES[entite];
  const actuel = await lireLigne(q, entite, id);
  if (actuel === null) return null;
  const changees = Object.entries(valeurs).filter(([k, v]) => c.colonnes.includes(k) && JSON.stringify(actuel[k] ?? null) !== JSON.stringify(valeurJournal(v)));
  const avant = Object.fromEntries(changees.map(([k]) => [k, actuel[k] ?? null]));
  const apres = Object.fromEntries(changees.map(([k, v]) => [k, valeurJournal(v)]));
  if (changees.length === 0) return { avant, apres };
  const sets = changees.map(([k], i) => `${k} = $${i + 2}`);
  if (avecModifie) sets.push('modifie_le = now()');
  await q(`UPDATE ${c.table} SET ${sets.join(', ')} WHERE id = $1`, [id, ...changees.map(([, v]) => v)]);
  return { avant, apres };
}
const AVEC_MODIFIE: Record<Entite, boolean> = { vente: true, vente_ligne: false, retrocession: true, ca_a_rattacher: false, gestion_mois: true };

// ── Les ventes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function creerVente(s: VenteSaisie, auteur: AuteurTx): Promise<Issue<number>> {
  if (!(await transactionDisponible())) return { ok: false, motif: MOTIF_SANS_MIGRATION };
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string }>(
      `INSERT INTO transaction_vente (societe, libelle, honoraires_ttc, statut, annee, mois_acte, date_compromis, apporteur, note, origine, cree_par, cree_par_libelle)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, 'saisie', $10, $11) RETURNING id`,
      [s.societe, s.libelle, s.honorairesTtc, s.statut, s.annee, s.statut === 'compromis' ? null : premierDuMois(s.annee, s.mois), s.dateCompromis, s.apporteur, s.note,
        auteur.id, auteur.libelle]);
    const id = n(rows[0].id);
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
    return { ok: true };
  });
}
