// TUILE « TRANSACTION » (Arno, 27/10/2026) — LA BASE : lectures, saisies, modifications, rattachements, retours en arrière.
// Pas de `import 'server-only'` (même convention que les dépôts de la Location lus par les scripts) ; aucun composant client ne
// l'importe. 🔴 RIEN N'EST JAMAIS SUPPRIMÉ : retirer = `retire_le` ; chaque geste écrit au journal sa valeur avant / après, et
// « Annuler » rejoue la valeur d'avant (un nouveau geste, journalisé lui aussi).
import { query, withTransaction, type RequeteTx } from '../db/client';
import { droitTransactionDisponible, prixVenteDisponible, repartitionDisponible } from '../admin/schemaDroits';
import { estSociete, type Attribution, type CaARattacher, type DossierVente, type GestionMois, type LigneVente, type Partie, type PersonneVente, type Retrocession,
  type Societe, type SortePartie, type Vente } from './modele';
import type { ChampsVente, DossierSaisie, GestionSaisie, RetroSaisie, VenteSaisie } from './saisie';
import { verifierRepartition } from './repartition';
import { libelleDesPersonnes, personneExistante } from './personnes';
import { societeALaDate, type PeriodeSociete } from './societeNegociateur';

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

function venteDe(r: Record<string, unknown>, lignes: LigneVente[], lotD?: { parties: Partie[]; personnes: PersonneVente[] }): Vente {
  const avecLotD = lotD !== undefined ? {
    repartition: r.repartition === true ? { parties: lotD.parties, retroApporteurTtc: n(r.retro_apporteur_ttc ?? 0) } : null,
    dossier: dossierDe(r, lotD.personnes),
  } : {};
  return { ...avecLotD, ...('prix_vente' in r ? { prixVente: nOuNull(r.prix_vente) } : {}), id: n(r.id), societe: r.societe as Societe, libelle: String(r.libelle), honorairesTtc: n(r.honoraires_ttc), statut: r.statut as Vente['statut'],
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
 * vente RÉPARTIE appartient aux sociétés de ses parties (pas à la société où elle a été saisie) ; ses parties et ses personnes suivent.
 */
export async function lireVentes(societe: Societe | null): Promise<Vente[]> {
  const lotD = await repartitionDisponible();
  const avecPrix = await prixVenteDisponible();
  const filtre = lotD
    ? `($1::text IS NULL OR (NOT v.repartition AND v.societe = $1)
         OR (v.repartition AND EXISTS (SELECT 1 FROM transaction_partie p WHERE p.vente_id = v.id AND p.retire_le IS NULL AND p.societe = $1)))`
    : '($1::text IS NULL OR v.societe = $1)';
  const { rows } = await query<Record<string, unknown>>(
    // Les dates en TEXTE (« AAAA-MM-JJ ») : lues en Date, le pilote les placerait à minuit LOCAL (la veille en UTC).
    `SELECT v.id, v.societe, v.libelle, v.honoraires_ttc, v.statut, v.annee, to_char(v.mois_acte, 'YYYY-MM-DD') AS mois_acte,
            to_char(v.date_compromis, 'YYYY-MM-DD') AS date_compromis, v.apporteur, v.note, v.origine, v.source_fichier, v.source_onglet, v.source_ligne,
            v.double_cle, v.attribution${avecPrix ? ', v.prix_vente' : ''}${lotD ? `, v.adresse_bien, to_char(v.date_acte_prevue, 'YYYY-MM-DD') AS date_acte_prevue,
            to_char(v.date_acte, 'YYYY-MM-DD') AS date_acte, v.negociateur_entree_id, v.negociateur_sortie_id, v.apporteur_id, v.retro_apporteur_ttc,
            v.repartition, ${NOM_COMPTE('negociateur_entree_id')} AS entree_nom, ${NOM_COMPTE('negociateur_sortie_id')} AS sortie_nom` : ''}
       FROM transaction_vente v WHERE v.retire_le IS NULL AND ${filtre} ORDER BY v.annee, v.mois_acte NULLS LAST, v.id`, [societe]);
  const { rows: ls } = await query<Record<string, unknown>>(
    `SELECT l.id, l.vente_id, l.negociateur, l.role, l.montant_ttc, l.nature, l.compte, l.origine, l.source_fichier, l.source_onglet, l.source_ligne, l.note
       FROM transaction_vente_ligne l JOIN transaction_vente v ON v.id = l.vente_id
      WHERE l.retire_le IS NULL AND v.retire_le IS NULL AND ${filtre} ORDER BY l.id`, [societe]);
  const parVente = new Map<number, LigneVente[]>();
  for (const l of ls) {
    const id = n(l.vente_id);
    parVente.set(id, [...(parVente.get(id) ?? []), { id: n(l.id), negociateur: String(l.negociateur), role: l.role as LigneVente['role'],
      montantTtc: nOuNull(l.montant_ttc), nature: l.nature as LigneVente['nature'], compte: l.compte === true, origine: l.origine as LigneVente['origine'],
      sourceFichier: t(l.source_fichier), sourceOnglet: t(l.source_onglet), sourceLigne: nOuNull(l.source_ligne), note: t(l.note) }]);
  }
  if (!lotD) return rows.map((r) => venteDe(r, parVente.get(n(r.id)) ?? []));
  const ids = rows.map((r) => n(r.id));
  const [{ rows: ps }, { rows: pers }] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT vente_id, sorte, compte_id, negociateur_libelle, societe, nom, coordonnees, pourcentage, montant_ht
         FROM transaction_partie WHERE retire_le IS NULL AND vente_id = ANY($1::bigint[]) ORDER BY vente_id, rang, id`, [ids]),
    query<Record<string, unknown>>(
      `SELECT l.vente_id, p.id, l.role, p.nom, p.telephone, p.email, p.adresse
         FROM transaction_vente_personne l JOIN transaction_personne p ON p.id = l.personne_id
        WHERE l.retire_le IS NULL AND l.vente_id = ANY($1::bigint[]) ORDER BY l.vente_id, l.role DESC, l.rang, l.id`, [ids]),
  ]);
  const parties = new Map<number, Partie[]>();
  for (const p of ps) parties.set(n(p.vente_id), [...(parties.get(n(p.vente_id)) ?? []), partieDe(p)]);
  const personnes = new Map<number, PersonneVente[]>();
  for (const p of pers) personnes.set(n(p.vente_id), [...(personnes.get(n(p.vente_id)) ?? []), { id: n(p.id), role: p.role as PersonneVente['role'],
    nom: String(p.nom), telephone: t(p.telephone), email: t(p.email), adresse: t(p.adresse) }]);
  return rows.map((r) => venteDe(r, parVente.get(n(r.id)) ?? [], { parties: parties.get(n(r.id)) ?? [], personnes: personnes.get(n(r.id)) ?? [] }));
}
const partieDe = (p: Record<string, unknown>): Partie => ({ sorte: p.sorte as SortePartie, compteId: nOuNull(p.compte_id), negociateur: t(p.negociateur_libelle),
  societe: estSociete(p.societe) ? p.societe : null, nom: t(p.nom), coordonnees: t(p.coordonnees), pourcentage: nOuNull(p.pourcentage), montantHt: nOuNull(p.montant_ht) });

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
  vente: { table: 'transaction_vente', colonnes: ['libelle', 'honoraires_ttc', 'statut', 'annee', 'mois_acte', 'date_compromis', 'apporteur', 'note', 'retire_le', 'attribution'] },
  vente_ligne: { table: 'transaction_vente_ligne', colonnes: ['negociateur', 'role', 'montant_ttc', 'retire_le'] },
  retrocession: { table: 'transaction_retrocession', colonnes: ['vente_id', 'apporteur', 'montant_ttc', 'retire_le'] },
  ca_a_rattacher: { table: 'transaction_ca_a_rattacher', colonnes: ['retire_le'] },
  gestion_mois: { table: 'transaction_gestion_mois', colonnes: ['nb_lots', 'honoraires_ht', 'adhoc_ht', 'salarie_ht', 'reste_ht', 'note', 'retire_le'] },
  personne: { table: 'transaction_personne', colonnes: ['nom', 'telephone', 'email', 'adresse', 'note', 'retire_le'] },
};
/** LOT D — les colonnes de la vente portées par la 434 : lues et écrites SEULEMENT quand elle est appliquée. */
const COLONNES_VENTE_434 = ['adresse_bien', 'date_acte_prevue', 'date_acte', 'negociateur_entree_id', 'negociateur_sortie_id', 'apporteur_id', 'retro_apporteur_ttc', 'repartition'];
const DATES = ['mois_acte', 'date_compromis', 'date_acte_prevue', 'date_acte'];
async function colonnesDe(entite: Entite): Promise<readonly string[]> {
  const c = COLONNES[entite].colonnes;
  if (entite !== 'vente') return c;
  // LOT E — le prix de vente (435) : lu et écrit SEULEMENT quand la colonne existe.
  return [...c, ...((await repartitionDisponible()) ? COLONNES_VENTE_434 : []), ...((await prixVenteDisponible()) ? ['prix_vente'] : [])];
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
    // LOT D — un geste sur un ENSEMBLE de lignes (les parties, les personnes d'une vente) se défait en rétablissant l'ensemble d'avant.
    if (entite === 'vente' && ENSEMBLES[String(j.action)] !== undefined) return defaireEnsemble(q, j, journalId, auteur);
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

// ── LOT D (migration 434) : le dossier d'un compromis, sa répartition, « Acte signé » ─────────────────────────────────────────

export const MOTIF_SANS_434 = 'Disponible après la mise à jour de la base (migration 434) : rien n’a été enregistré.';

/** Les ENSEMBLES de lignes d'une vente qu'un geste remplace en bloc (retire les anciennes, pose les nouvelles) : réversibles en bloc. */
const ENSEMBLES: Record<string, { table: string } | undefined> = {
  repartition: { table: 'transaction_partie' },
  personnes: { table: 'transaction_vente_personne' },
};
const idsActifs = async (q: RequeteTx, table: string, venteId: number): Promise<number[]> =>
  (await q<{ id: string }>(`SELECT id FROM ${table} WHERE vente_id = $1 AND retire_le IS NULL ORDER BY id`, [venteId])).rows.map((r) => n(r.id));
const memesIds = (a: readonly number[], b: readonly number[]): boolean => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

/** Défait un geste d'ensemble : l'ensemble qu'il a posé est retiré, celui d'avant revient ; refusé si un geste plus récent l'a changé. */
async function defaireEnsemble(q: RequeteTx, j: Record<string, unknown>, journalId: number, auteur: AuteurTx): Promise<Issue> {
  const e = ENSEMBLES[String(j.action)]!;
  const venteId = n(j.entite_id);
  const avant = ((j.avant ?? {}) as { ids?: number[] }).ids ?? [];
  const apres = ((j.apres ?? {}) as { ids?: number[] }).ids ?? [];
  if (!memesIds(await idsActifs(q, e.table, venteId), apres)) return { ok: false, motif: 'Modifiée depuis par un autre geste : annulez d’abord le geste le plus récent.' };
  await q(`UPDATE ${e.table} SET retire_le = now(), retire_par_libelle = $2 WHERE id = ANY($1::bigint[]) AND retire_le IS NULL`, [apres, auteur.libelle]);
  await q(`UPDATE ${e.table} SET retire_le = NULL, retire_par_libelle = NULL WHERE id = ANY($1::bigint[])`, [avant]);
  await journaliser(q, { entite: 'vente', id: venteId, action: String(j.action), avant: { ids: apres }, apres: { ids: avant }, annule: journalId, auteur,
    commentaire: `Annulation du geste n° ${journalId} : ${String(j.action) === 'repartition' ? 'la répartition' : 'les personnes'} d’avant reviennent.` });
  return { ok: true };
}

export interface NegociateurCompte { id: number; nom: string; actif: boolean; societe: Societe | null; periodes: PeriodeSociete[] }

/** Les comptes (négociateurs possibles) avec leurs périodes de société ; `societe` : celle d'aujourd'hui. */
export async function lireNegociateurs(aujourdhui: string): Promise<NegociateurCompte[]> {
  const { rows } = await query<{ id: string; nom: string; actif: boolean }>(
    `SELECT id, coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant) AS nom, actif FROM admin_utilisateur ORDER BY lower(nom), lower(prenom), id`);
  const periodes = await lirePeriodesSociete(rows.map((r) => n(r.id)));
  return rows.map((r) => {
    const p = periodes.get(n(r.id)) ?? [];
    return { id: n(r.id), nom: String(r.nom), actif: r.actif === true, societe: societeALaDate(p, aujourdhui), periodes: p };
  });
}
/** Les périodes de société de ces comptes (vide sans la 434). */
export async function lirePeriodesSociete(ids: readonly number[]): Promise<Map<number, PeriodeSociete[]>> {
  const out = new Map<number, PeriodeSociete[]>();
  if (ids.length === 0 || !(await repartitionDisponible())) return out;
  const { rows } = await query<{ compte_id: string; societe: Societe; depuis: string }>(
    `SELECT compte_id, societe, to_char(depuis, 'YYYY-MM-DD') AS depuis FROM transaction_societe_compte
      WHERE retire_le IS NULL AND compte_id = ANY($1::bigint[]) ORDER BY depuis, id`, [[...ids]]);
  for (const r of rows) out.set(n(r.compte_id), [...(out.get(n(r.compte_id)) ?? []), { societe: r.societe, depuis: r.depuis }]);
  return out;
}

/** L'annuaire des vendeurs et acquéreurs (pour choisir une personne déjà connue). */
export interface PersonneAnnuaire { id: number; nom: string; telephone: string | null; email: string | null; adresse: string | null }
export async function lirePersonnes(): Promise<PersonneAnnuaire[]> {
  if (!(await repartitionDisponible())) return [];
  const { rows } = await query<Record<string, unknown>>(
    'SELECT id, nom, telephone, email, adresse FROM transaction_personne WHERE retire_le IS NULL ORDER BY lower(nom), id');
  return rows.map((r) => ({ id: n(r.id), nom: String(r.nom), telephone: t(r.telephone), email: t(r.email), adresse: t(r.adresse) }));
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
  const dateVente = s.dateActe ?? s.dateCompromis ?? aujourdhui;
  // ① les négociateurs, relus en base, avec leur société à la date de la vente
  const comptesIds = [...new Set([s.entreeId, s.sortieId, ...s.parties.map((p) => p.compteId)].filter((x): x is number => x !== null))];
  const { rows: cs } = comptesIds.length === 0 ? { rows: [] as { id: string; nom: string }[] } : await query<{ id: string; nom: string }>(
    `SELECT id, coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant) AS nom FROM admin_utilisateur WHERE id = ANY($1::bigint[])`, [comptesIds]);
  if (cs.length !== comptesIds.length) return { ok: false, motif: 'Négociateur inconnu.' };
  const periodes = await lirePeriodesSociete(comptesIds);
  const nomDe = new Map(cs.map((c) => [n(c.id), String(c.nom)]));
  const parties: Partie[] = s.parties.map((p) => (p.sorte === 'exterieure'
    ? { sorte: p.sorte, compteId: null, negociateur: null, societe: null, nom: p.nom, coordonnees: p.coordonnees, pourcentage: p.pourcentage, montantHt: p.montantHt }
    : { sorte: p.sorte, compteId: p.compteId, negociateur: p.compteId === null ? null : nomDe.get(p.compteId) ?? null,
      societe: p.compteId === null ? null : societeALaDate(periodes.get(p.compteId) ?? [], dateVente), nom: null, coordonnees: null, pourcentage: p.pourcentage, montantHt: p.montantHt }));
  // ② la répartition (somme = 100 %, sociétés connues, apporteur déduit d'abord)
  const repartie = s.entreeId !== null || s.sortieId !== null || parties.length > 0;
  if (repartie) {
    const motif = verifierRepartition(parties, s.honorairesTtc, s.retroApporteurTtc);
    if (motif !== null) return { ok: false, motif };
  }
  // ③ l'apporteur (annuaire de la Location)
  let apporteurNom = s.apporteurNom;
  if (s.apporteurId !== null) {
    const { rows: a } = await query<{ nom: string }>('SELECT nom FROM gestion_location_apporteur WHERE id = $1', [s.apporteurId]).catch(() => ({ rows: [] as { nom: string }[] }));
    if (a.length === 0) return { ok: false, motif: 'Apporteur inconnu dans l’annuaire des apporteurs.' };
    apporteurNom = String(a[0].nom);
  }
  const libelle = s.libelle ?? libelleDesPersonnes(s.personnes);
  if (libelle.trim() === '') return { ok: false, motif: 'Nommez au moins un vendeur ou un acquéreur (ou le libellé de la vente).' };
  const annee = s.statut === 'vendue' ? anneeDe(s.dateActe)! : anneeDe(s.dateActePrevue) ?? anneeDe(s.dateCompromis) ?? Number(aujourdhui.slice(0, 4));
  const valeurs: Record<string, unknown> = {
    libelle, honoraires_ttc: s.honorairesTtc, statut: s.statut, annee, mois_acte: s.statut === 'vendue' ? `${s.dateActe!.slice(0, 7)}-01` : null,
    date_compromis: s.dateCompromis, apporteur: apporteurNom, note: s.note, adresse_bien: s.adresseBien, date_acte_prevue: s.dateActePrevue, date_acte: s.dateActe,
    negociateur_entree_id: s.entreeId, negociateur_sortie_id: s.sortieId, apporteur_id: s.apporteurId, retro_apporteur_ttc: s.retroApporteurTtc, repartition: repartie,
    ...((await prixVenteDisponible()) ? { prix_vente: s.prixVente } : {}),
  };
  return withTransaction(async (q) => {
    let venteId: number;
    if (id === null) {
      const cols = Object.keys(valeurs);
      const { rows } = await q<{ id: string }>(
        `INSERT INTO transaction_vente (societe, origine, cree_par, cree_par_libelle, ${cols.join(', ')})
         VALUES ($1, 'saisie', $2, $3, ${cols.map((_, i) => `$${i + 4}`).join(', ')}) RETURNING id`, [s.societe, auteur.id, auteur.libelle, ...cols.map((k) => valeurs[k])]);
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
      const r = await ecrire(q, 'vente', id, valeurs, true);
      if (r !== null && Object.keys(r.apres).length > 0) await journaliser(q, { entite: 'vente', id, action: 'modification', avant: r.avant, apres: r.apres, auteur });
      venteId = id;
    }
    // ④ les personnes : réutiliser une fiche connue, sinon en créer une ; l'ensemble des liens de la vente est remplacé (réversible)
    const { rows: connues } = await q<Record<string, unknown>>('SELECT id, nom, telephone, email, adresse FROM transaction_personne WHERE retire_le IS NULL');
    const fiches = connues.map((p) => ({ id: n(p.id), nom: String(p.nom), telephone: t(p.telephone), email: t(p.email), adresse: t(p.adresse) }));
    const liens: { personneId: number; role: 'vendeur' | 'acquereur' }[] = [];
    for (const p of s.personnes) {
      let pid = p.id ?? personneExistante(p, fiches)?.id ?? null;
      if (pid === null) {
        const { rows } = await q<{ id: string }>(
          'INSERT INTO transaction_personne (nom, telephone, email, adresse, cree_par_libelle) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [p.nom, p.telephone, p.email, p.adresse, auteur.libelle]);
        pid = n(rows[0].id);
        fiches.push({ id: pid, nom: p.nom, telephone: p.telephone, email: p.email, adresse: p.adresse });
        await journaliser(q, { entite: 'personne', id: pid, action: 'saisie', avant: null, apres: p, auteur });
      } else {
        // Une fiche connue : ce qui est saisi la complète ou la corrige (journalisé, réversible) ; un champ laissé vide ne l'efface pas.
        const maj = Object.fromEntries((['nom', 'telephone', 'email', 'adresse'] as const).filter((k) => p[k] !== null && p[k] !== '').map((k) => [k, p[k]]));
        const r = await ecrire(q, 'personne', pid, maj, true);
        if (r !== null && Object.keys(r.apres).length > 0) await journaliser(q, { entite: 'personne', id: pid, action: 'modification', avant: r.avant, apres: r.apres, auteur });
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
    await remplacerEnsemble(q, 'repartition', venteId, auteur, async (avant) => {
      const { rows: a } = await q<Record<string, unknown>>(
        'SELECT sorte, compte_id, negociateur_libelle, societe, nom, coordonnees, pourcentage, montant_ht FROM transaction_partie WHERE id = ANY($1::bigint[]) ORDER BY rang, id', [avant]);
      return JSON.stringify(a.map(partieDe)) === JSON.stringify(repartie ? parties : []);
    }, async () => {
      const ids: number[] = [];
      for (const [i, p] of (repartie ? parties : []).entries()) {
        const { rows } = await q<{ id: string }>(
          `INSERT INTO transaction_partie (vente_id, sorte, compte_id, negociateur_libelle, societe, nom, coordonnees, pourcentage, montant_ht, rang, cree_par_libelle)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [venteId, p.sorte, p.compteId, p.negociateur, p.societe, p.nom, p.coordonnees, p.pourcentage, p.montantHt, i, auteur.libelle]);
        ids.push(n(rows[0].id));
      }
      return ids;
    }, repartie ? `Répartition : ${parties.map((p) => `${p.sorte === 'exterieure' ? p.nom : p.negociateur} ${p.pourcentage !== null ? `${p.pourcentage} %` : `${p.montantHt} € HT`}`).join(' · ')}` : 'Répartition retirée.');
    return { ok: true, valeur: venteId };
  });
}

/** Remplace un ensemble de lignes d'une vente si `inchange` dit qu'il a changé : retire l'actuel, pose le neuf, journalise les deux listes d'ids. */
async function remplacerEnsemble(q: RequeteTx, action: 'repartition' | 'personnes', venteId: number, auteur: AuteurTx,
  inchange: (avant: number[]) => Promise<boolean>, poser: () => Promise<number[]>, commentaire?: string): Promise<void> {
  const table = ENSEMBLES[action]!.table;
  const avant = await idsActifs(q, table, venteId);
  if (await inchange(avant)) return;
  await q(`UPDATE ${table} SET retire_le = now(), retire_par_libelle = $2 WHERE id = ANY($1::bigint[])`, [avant, auteur.libelle]);
  const apres = await poser();
  await journaliser(q, { entite: 'vente', id: venteId, action, avant: { ids: avant }, apres: { ids: apres }, auteur, commentaire: commentaire ?? null });
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
    return { ok: true };
  });
}
