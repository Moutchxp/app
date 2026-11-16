import { query, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { cleImmeuble } from '../gestion/syndics';
import { colonneExisteMemo } from './sondeLocation';
import { immeubleDeLAg } from './immeubleAg';
import { familleDeCategorie } from './bienComplet';
import type { EntreeAg, OrigineAg, StatutAg, TypeAg } from './agCopropriete';
import { emailDeLAuteur } from './mailPortefeuilleRepo';
import { nomCollaborateur } from './texteCompteRendu';

/**
 * ══ 🔴🔴 L'HISTORIQUE DES AG D'UNE COPROPRIÉTÉ (Arno, 16/11/2026, migration 475). IMPUR (base). ═══════════════════════════════════════════
 *
 * Règles et textes : `agCopropriete.ts`. La copropriété d'un bien : celle dont la clé de son immeuble (règle de la 377 : « Immeuble » du bien,
 * sinon son adresse) est la clé principale, ou une adresse EN COURS (335). Le syndic n'intervient jamais : un changement de syndic ne touche ni
 * les AG ni le digicode (porté par l'immeuble de l'adresse, 396). Écriture en AJOUT SEUL (trigger en base) ; une entrée saisie pour un bien sans
 * copropriété garde la clé de son immeuble et rejoint d'elle-même la copropriété dès que cette clé en devient une adresse.
 */

export function historiqueAgDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_copropriete_ag', 'type_ag');
}

export interface CoproprieteAg { id: number; libelle: string; cle: string }
/** L'immeuble d'un bien pour l'AG (clé + libellé), sa copropriété s'il en a une, et de quoi le rattacher (adresse). */
export interface ContexteAgLot {
  lotId: number;
  immeuble: { cle: string; libelle: string } | null;
  copropriete: CoproprieteAg | null;
  adresse: { libelle: string | null; codePostal: string | null; commune: string | null; normalisee: string | null };
  /** « Copropriété » de la fiche du bien (461) : oui / non / non renseigné */
  coproprieteSaisie: boolean | null;
}

type Q = RequeteTx | typeof query;

/** La copropriété dont cette clé est la clé principale ou une adresse en cours ; sinon `null`. */
export async function coproprieteDeCle(cle: string, q: Q = query): Promise<CoproprieteAg | null> {
  const { rows } = await (q as typeof query)<{ id: string; libelle: string; cle: string }>(
    `SELECT c.id::text, c.libelle, c.cle_immeuble AS cle FROM gestion_copropriete c
      WHERE c.cle_immeuble = $1
         OR c.id = (SELECT a.copropriete_id FROM gestion_copropriete_adresse a WHERE a.cle_immeuble = $1 AND a.retire_le IS NULL ORDER BY a.id LIMIT 1)
      ORDER BY (c.cle_immeuble = $1) DESC, c.id LIMIT 1`, [cle]);
  return rows[0] === undefined ? null : { id: Number(rows[0].id), libelle: rows[0].libelle, cle: rows[0].cle };
}

/** Le contexte AG d'un bien. `null` : bien inconnu. */
export async function contexteAgDuLot(lotId: number, q: Q = query): Promise<ContexteAgLot | null> {
  const avec461 = await colonneExisteMemo('gestion_annuaire_lot', 'copropriete');
  const { rows } = await (q as typeof query)<{ immeuble: string | null; adresse: string | null; code_postal: string | null; commune: string | null;
    adresse_normalisee: string | null; categorie: string | null; copropriete: boolean | null }>(
    `SELECT immeuble, adresse, code_postal, commune, adresse_normalisee, categorie, ${avec461 ? 'copropriete' : 'NULL::boolean AS copropriete'}
       FROM gestion_annuaire_lot WHERE id = $1`, [lotId]);
  const r = rows[0];
  if (r === undefined) return null;
  const immeuble = immeubleDeLAg({ immeuble: r.immeuble, adresse: r.adresse, parking: familleDeCategorie(r.categorie ?? '') === 'parking' || r.categorie === 'box' });
  return { lotId, immeuble, copropriete: immeuble === null ? null : await coproprieteDeCle(immeuble.cle, q),
    adresse: { libelle: r.adresse, codePostal: r.code_postal, commune: r.commune, normalisee: r.adresse_normalisee }, coproprieteSaisie: r.copropriete };
}

/** Les clés (principale et adresses en cours) d'une copropriété. */
async function clesDeLaCopropriete(id: number, q: Q = query): Promise<string[]> {
  const { rows } = await (q as typeof query)<{ cle: string }>(
    `SELECT cle_immeuble AS cle FROM gestion_copropriete WHERE id = $1
     UNION SELECT cle_immeuble FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND retire_le IS NULL`, [id]);
  return rows.map((x) => x.cle);
}

/**
 * L'historique : celui de la copropriété (ses entrées, et celles saisies sous l'une de ses clés avant tout rattachement) ; sans copropriété,
 * celui de la clé de l'immeuble et du bien (« à rattacher »). Du plus récent au plus ancien.
 */
export async function entreesAg(cible: { coproprieteId: number | null; cle: string | null; lotId: number | null }, q: Q = query): Promise<EntreeAg[]> {
  if (!(await historiqueAgDisponible())) return [];
  const cles = cible.coproprieteId !== null ? await clesDeLaCopropriete(cible.coproprieteId, q) : [];
  const { rows } = await (q as typeof query)<{ id: string; type_ag: TypeAg; statut: StatutAg; date_ag: string | null; confirmation: boolean; origine: OrigineAg;
    saisie_le: string; saisie_par_libelle: string; sortie_validee_id: string | null; copropriete_id: string | null }>(
    `SELECT h.id::text, h.type_ag, h.statut, h.date_ag::text, h.confirmation, h.origine, h.saisie_le::text AS saisie_le, h.saisie_par_libelle,
            h.sortie_validee_id::text, h.copropriete_id::text
       FROM gestion_copropriete_ag h
      WHERE ($1::bigint IS NOT NULL AND (h.copropriete_id = $1 OR (h.copropriete_id IS NULL AND h.cle_immeuble = ANY($2::text[]))))
         OR ($1::bigint IS NULL AND h.copropriete_id IS NULL AND (h.cle_immeuble = $3 OR h.lot_id = $4))
      ORDER BY h.saisie_le DESC, h.id DESC`,
    [cible.coproprieteId, cles, cible.cle, cible.lotId]);
  return rows.map((r) => ({ id: Number(r.id), type: r.type_ag, statut: r.statut, date: r.date_ag, confirmation: r.confirmation, origine: r.origine,
    saisieLe: new Date(r.saisie_le).toISOString(), saisiePar: r.saisie_par_libelle, sortieId: r.sortie_validee_id === null ? null : Number(r.sortie_validee_id),
    aRattacher: cible.coproprieteId === null }));
}

/** L'historique d'un bien (par sa copropriété, sinon par son immeuble). */
export async function entreesAgDuLot(lotId: number, q: Q = query): Promise<{ contexte: ContexteAgLot; entrees: EntreeAg[] } | null> {
  const contexte = await contexteAgDuLot(lotId, q);
  if (contexte === null) return null;
  return { contexte, entrees: await entreesAg({ coproprieteId: contexte.copropriete?.id ?? null, cle: contexte.immeuble?.cle ?? null, lotId }, q) };
}

/** « Prénom NOM » du compte connecté (l'historique dit QUI a saisi) ; à défaut, son identifiant. */
export async function nomAuteurAg(auteur: Auteur): Promise<string> {
  const q = await emailDeLAuteur(auteur).catch(() => null);
  return (q === null ? '' : nomCollaborateur({ prenom: q.prenom ?? null, nom: q.nomFamille ?? null })) || auteur.libelle;
}

/** Ajoute des entrées (AJOUT SEUL). `cible` : la copropriété si elle est connue, sinon la clé de l'immeuble et le bien. */
export async function ajouterEntreesAg(q: Q, cible: { coproprieteId: number | null; cle: string | null; lotId: number | null; sortieId: number | null },
  entrees: readonly { type: TypeAg; statut: StatutAg; date: string | null; confirmation?: boolean }[], origine: OrigineAg, auteur: Auteur): Promise<number> {
  const qui = entrees.length === 0 ? auteur.libelle : await nomAuteurAg(auteur);
  for (const e of entrees) {
    await (q as typeof query)(
      `INSERT INTO gestion_copropriete_ag (copropriete_id, cle_immeuble, lot_id, sortie_validee_id, type_ag, statut, date_ag, confirmation, origine, saisie_par, saisie_par_libelle)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11)`,
      [cible.coproprieteId, cible.cle, cible.lotId, cible.sortieId, e.type, e.statut, e.date, e.confirmation === true, origine, auteur.id, qui]);
  }
  return entrees.length;
}

/**
 * Les copropriétés EXISTANTES qui couvrent l'adresse d'un bien : celle dont l'adresse du bien est la clé principale ou une adresse en cours
 * (335), et celles des autres biens à la même adresse. LECTURE SEULE.
 */
export async function coproprietesPourLot(c: ContexteAgLot, q: Q = query): Promise<CoproprieteAg[]> {
  const cles = new Set<string>();
  if ((c.adresse.libelle ?? '').trim() !== '') cles.add(cleImmeuble(c.adresse.libelle));
  if ((c.adresse.normalisee ?? '').trim() !== '') {
    const { rows } = await (q as typeof query)<{ immeuble: string | null; adresse: string | null }>(
      `SELECT immeuble, adresse FROM gestion_annuaire_lot WHERE adresse_normalisee = $1 AND id <> $2 AND absent_le IS NULL LIMIT 50`, [c.adresse.normalisee, c.lotId]);
    for (const r of rows) { const i = immeubleDeLAg({ immeuble: r.immeuble, adresse: r.adresse, parking: false }); if (i !== null) cles.add(i.cle); }
  }
  const vues = new Map<number, CoproprieteAg>();
  for (const k of cles) { if (k === '') continue; const x = await coproprieteDeCle(k, q); if (x !== null) vues.set(x.id, x); }
  return [...vues.values()].sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
}

const journal = (q: Q, lotId: number, action: string, commentaire: string, auteur: Auteur): Promise<unknown> =>
  (q as typeof query)(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, $2, $3, $4, $5)`,
    [lotId, action, commentaire, auteur.id, auteur.libelle]);

/**
 * Rattache un bien à une copropriété existante, SANS toucher à la fiche du bien (son « Immeuble », tenu par l'import, n'est pas réécrit) : la
 * clé de son immeuble devient une ADRESSE de la copropriété (335) — exactement ce que fait la fiche syndic pour une adresse secondaire.
 */
export async function rattacherLotACopropriete(q: Q, c: ContexteAgLot, coproprieteId: number, auteur: Auteur): Promise<{ ok: true; copropriete: CoproprieteAg } | { ok: false; motif: string }> {
  if (c.immeuble === null) return { ok: false, motif: 'Ce bien n’a ni immeuble ni adresse : impossible de le rattacher à une copropriété.' };
  const { rows } = await (q as typeof query)<{ id: string; libelle: string; cle: string }>('SELECT id::text, libelle, cle_immeuble AS cle FROM gestion_copropriete WHERE id = $1', [coproprieteId]);
  if (rows[0] === undefined) return { ok: false, motif: 'Cette copropriété n’existe plus : rechargez la fenêtre.' };
  const copro = { id: Number(rows[0].id), libelle: rows[0].libelle, cle: rows[0].cle };
  const deja = await coproprieteDeCle(c.immeuble.cle, q);
  if (deja !== null && deja.id === copro.id) return { ok: true, copropriete: copro };
  if (deja !== null) return { ok: false, motif: `L’immeuble de ce bien est déjà une adresse de la copropriété « ${deja.libelle} ».` };
  await (q as typeof query)(
    `INSERT INTO gestion_copropriete_adresse (copropriete_id, cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [copro.id, c.immeuble.cle, c.immeuble.libelle, c.adresse.codePostal, c.adresse.commune, auteur.id, auteur.libelle]);
  await journal(q, c.lotId, 'location_copropriete_rattachee', `bien rattaché à la copropriété « ${copro.libelle} » (son immeuble « ${c.immeuble.libelle} » en devient une adresse) — depuis « Valider la sortie »`, auteur);
  return { ok: true, copropriete: copro };
}

/** Crée une copropriété (nom + adresse du bien) et y rattache le bien. Un nom déjà connu : la copropriété existante est reprise. */
export async function creerCoproprietePourLot(q: Q, c: ContexteAgLot, nom: string, auteur: Auteur): Promise<{ ok: true; copropriete: CoproprieteAg } | { ok: false; motif: string }> {
  const libelle = nom.replace(/\s+/g, ' ').trim().slice(0, 200);
  const cle = cleImmeuble(libelle);
  if (cle === '') return { ok: false, motif: 'Donnez un nom à la copropriété.' };
  const existante = await coproprieteDeCle(cle, q);
  let id = existante?.id ?? null;
  if (id === null) {
    const { rows } = await (q as typeof query)<{ id: string }>(
      `INSERT INTO gestion_copropriete (cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text`,
      [cle, libelle, c.adresse.codePostal, c.adresse.commune, auteur.id, auteur.libelle]);
    id = Number(rows[0].id);
    await journal(q, c.lotId, 'location_copropriete_creee', `copropriété « ${libelle} » créée depuis « Valider la sortie »`, auteur);
  }
  return rattacherLotACopropriete(q, c, id, auteur);
}
