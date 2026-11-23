import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { cleImmeuble } from '../gestion/syndics';
import { colonneExisteMemo } from './sondeLocation';
import { immeubleDeLAg } from './immeubleAg';
import { familleDeCategorie } from './bienComplet';
import { AG_EN_ATTENTE_MAX, typeAgOfficielle, verifierAgOfficielle, verifierPv, type EntreeAg, type NatureAg, type OrigineAg, type StatutAg, type TypeAg } from './agCopropriete';
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
/** 🔴 (Arno, 17/11/2026) la 481 : AGO / AGE, note, « Corriger » avec trace. Sans elle : toute date est une AGO, le bloc reste en lecture. */
export function pvAgDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_copropriete_ag', 'corrige_id');
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

/** La copropriété dont cette clé est une adresse en cours, sinon celle dont elle est la clé principale ; sinon `null`. 🔴 (16/11/2026, lot 6)
 *  L'adresse SECONDAIRE l'emporte sur une copropriété homonyme (après un regroupement), comme dans la fiche syndic (`immeublesConnus`). */
export async function coproprieteDeCle(cle: string, q: Q = query): Promise<CoproprieteAg | null> {
  const { rows } = await (q as typeof query)<{ id: string; libelle: string; cle: string }>(
    `SELECT c.id::text, c.libelle, c.cle_immeuble AS cle FROM gestion_copropriete c
      WHERE c.cle_immeuble = $1
         OR c.id = (SELECT a.copropriete_id FROM gestion_copropriete_adresse a WHERE a.cle_immeuble = $1 AND a.retire_le IS NULL ORDER BY a.id LIMIT 1)
      ORDER BY (c.cle_immeuble <> $1) DESC, c.id LIMIT 1`, [cle]);
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
  // 🔴 (Arno, 17/11/2026, 481) AGO / AGE, note ; une entrée CORRIGÉE n'est plus lue que dans la trace de celle qui la corrige (elle reste en base)
  const avec481 = await pvAgDisponible();
  const { rows } = await (q as typeof query)<{ id: string; type_ag: TypeAg; statut: StatutAg; date_ag: string | null; confirmation: boolean; origine: OrigineAg;
    saisie_le: string; saisie_par_libelle: string; sortie_validee_id: string | null; copropriete_id: string | null; nature_ag: NatureAg | null; note: string | null;
    c_id: string | null; c_date: string | null; c_nature: NatureAg | null; c_note: string | null }>(
    `SELECT h.id::text, h.type_ag, h.statut, h.date_ag::text, h.confirmation, h.origine, h.saisie_le::text AS saisie_le, h.saisie_par_libelle,
            h.sortie_validee_id::text, h.copropriete_id::text,
            ${avec481 ? `h.nature_ag, h.note, c.id::text AS c_id, c.date_ag::text AS c_date, c.nature_ag AS c_nature, c.note AS c_note`
              : `NULL::text AS nature_ag, NULL::text AS note, NULL::text AS c_id, NULL::text AS c_date, NULL::text AS c_nature, NULL::text AS c_note`}
       FROM gestion_copropriete_ag h
       ${avec481 ? 'LEFT JOIN gestion_copropriete_ag c ON c.id = h.corrige_id' : ''}
      WHERE (($1::bigint IS NOT NULL AND (h.copropriete_id = $1 OR (h.copropriete_id IS NULL AND h.cle_immeuble = ANY($2::text[]))))
          OR ($1::bigint IS NULL AND h.copropriete_id IS NULL AND (h.cle_immeuble = $3 OR h.lot_id = $4)))
        ${avec481 ? 'AND NOT EXISTS (SELECT 1 FROM gestion_copropriete_ag x WHERE x.corrige_id = h.id)' : ''}
      ORDER BY h.saisie_le DESC, h.id DESC`,
    [cible.coproprieteId, cles, cible.cle, cible.lotId]);
  return rows.map((r) => ({ id: Number(r.id), type: r.type_ag, statut: r.statut, date: r.date_ag, confirmation: r.confirmation, origine: r.origine,
    saisieLe: new Date(r.saisie_le).toISOString(), saisiePar: r.saisie_par_libelle, sortieId: r.sortie_validee_id === null ? null : Number(r.sortie_validee_id),
    aRattacher: cible.coproprieteId === null, nature: r.nature_ag === 'age' ? 'age' : 'ago', note: r.note,
    corrige: r.c_id === null ? null : { id: Number(r.c_id), date: r.c_date, nature: r.c_nature === 'age' ? 'age' : 'ago', note: r.c_note } }));
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

/** Aujourd'hui à Paris, « AAAA-MM-JJ ». */
const aujourdhuiParis = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

/**
 * ══ 🔴🔴 « + Ajouter un PV d'AG » et « Corriger » (Arno, 17/11/2026, migration 481), depuis la FICHE COPROPRIÉTÉ ═══════════════════════════
 * Un PV = une date OFFICIELLE d'AG tenue (jamais une date à venir), AGO ou AGE, note facultative ; ajout seul ; « Corriger » ajoute une ligne
 * qui désigne celle qu'elle corrige (une seule correction vivante par ligne ; la ligne corrigée reste en base). Contrôles refaits ici.
 */
export async function enregistrerPv(brut: unknown, auteur: Auteur): Promise<{ ok: true; entrees: EntreeAg[] } | { ok: false; motif: string }> {
  return enregistrerDateAg(brut, auteur, 'pv');
}
/**
 * 🔴🔴 « + Ajouter une AG » de la FICHE COPROPRIÉTÉ (Arno, 23/11/2026) : « Date officielle uniquement : l'assemblée a eu lieu ou sa date est fixée par
 * convocation. » — passée (ou du jour) : un PV (« dernière AG tenue ») ; à venir : « prochaine AG », OFFICIELLE. Même table, même origine
 * (« fiche copropriété »), même « Corriger » (une officielle, tenue ou à venir ; la ligne corrigée reste en base). Jamais une date projetée.
 */
export async function enregistrerAgOfficielle(brut: unknown, auteur: Auteur): Promise<{ ok: true; entrees: EntreeAg[] } | { ok: false; motif: string }> {
  return enregistrerDateAg(brut, auteur, 'officielle');
}
async function enregistrerDateAg(brut: unknown, auteur: Auteur, mode: 'pv' | 'officielle'): Promise<{ ok: true; entrees: EntreeAg[] } | { ok: false; motif: string }> {
  if (!(await pvAgDisponible())) return { ok: false, motif: 'La saisie des PV d’AG attend la mise à jour de la base (migration 481) : rien n’est enregistré.' };
  const b = (brut ?? {}) as Record<string, unknown>;
  const cle = cleImmeuble(typeof b.immeuble === 'string' ? b.immeuble.slice(0, 300) : '');
  if (cle === '') return { ok: false, motif: 'Demande incomplète : la copropriété manque.' };
  const jour = aujourdhuiParis();
  const v = mode === 'pv' ? verifierPv(b, jour) : verifierAgOfficielle(b);
  if (!v.ok) return { ok: false, motif: v.motif };
  const type = mode === 'pv' ? 'derniere' : typeAgOfficielle(v.saisie.date, jour);
  const corrige = b.corrige === undefined || b.corrige === null ? null : Number(b.corrige);
  if (corrige !== null && !(Number.isSafeInteger(corrige) && corrige > 0)) return { ok: false, motif: 'Demande illisible : la saisie à corriger est inconnue.' };
  const copro = await coproprieteDeCle(cle);
  if (copro === null) return { ok: false, motif: 'Cette copropriété n’a pas encore de fiche : enregistrez-la d’abord.' };
  const qui = await nomAuteurAg(auteur);
  const r = await withTransaction(async (q) => {
    if (corrige !== null) {
      const actives = await entreesAg({ coproprieteId: copro.id, cle: null, lotId: null }, q);
      const cible = actives.find((e) => e.id === corrige);
      const { rows: verrou } = await q<{ id: string }>('SELECT id::text FROM gestion_copropriete_ag WHERE id = $1 FOR UPDATE', [corrige]);
      const corrigeable = cible !== undefined && (mode === 'pv' ? cible.type === 'derniere' : cible.statut === 'officielle');
      if (verrou[0] === undefined || !corrigeable) return { ok: false as const, motif: 'Cette saisie a déjà été corrigée (ou n’est pas un PV de cette copropriété) : rechargez la fiche.' };
      const { rows: deja } = await q<{ n: string }>('SELECT count(*)::text AS n FROM gestion_copropriete_ag WHERE corrige_id = $1', [corrige]);
      if (Number(deja[0]?.n ?? 0) > 0) return { ok: false as const, motif: 'Cette saisie a déjà été corrigée : rechargez la fiche.' };
      if (cible!.date === v.saisie.date && (cible!.nature ?? 'ago') === v.saisie.nature && (cible!.note ?? null) === v.saisie.note) return { ok: false as const, motif: 'Rien n’a changé : modifiez la date, le type ou la note.' };
    }
    await q(`INSERT INTO gestion_copropriete_ag (copropriete_id, type_ag, statut, date_ag, origine, saisie_par, saisie_par_libelle, nature_ag, note, corrige_id)
             VALUES ($1, $8, 'officielle', $2::date, 'fiche_copropriete', $3, $4, $5, $6, $7)`,
      [copro.id, v.saisie.date, auteur.id, qui, v.saisie.nature, v.saisie.note, corrige, type]);
    return { ok: true as const };
  });
  if (!r.ok) return r;
  return { ok: true, entrees: await entreesAg({ coproprieteId: copro.id, cle, lotId: null }) };
}

/** 🔴 (Arno, 23/11/2026) les AG officielles d'une fiche NOUVELLE, contrôlées AVANT toute écriture (10 au plus). PUR quant à la base, sauf la sonde. */
export async function agOfficiellesValides(brut: unknown): Promise<{ ok: true; ags: { date: string; nature: NatureAg; note: string | null }[] } | { ok: false; motif: string }> {
  const liste = Array.isArray(brut) ? brut : [];
  if (liste.length === 0) return { ok: true, ags: [] };
  if (liste.length > AG_EN_ATTENTE_MAX) return { ok: false, motif: `${AG_EN_ATTENTE_MAX} AG au plus par enregistrement.` };
  if (!(await pvAgDisponible())) return { ok: false, motif: 'La saisie des AG attend la mise à jour de la base (migration 481) : rien n’est enregistré.' };
  const ags: { date: string; nature: NatureAg; note: string | null }[] = [];
  for (const x of liste) {
    const v = verifierAgOfficielle((x ?? {}) as Record<string, unknown>);
    if (!v.ok) return { ok: false, motif: `AG : ${v.motif}` };
    ags.push(v.saisie);
  }
  return { ok: true, ags };
}
/** Écrit, DANS LA TRANSACTION de la fiche, les AG officielles d'une copropriété (même table, même origine que « + Ajouter une AG »). */
export async function ajouterAgOfficiellesDans(q: Q, coproprieteId: number | string, ags: readonly { date: string; nature: NatureAg; note: string | null }[], auteur: Auteur): Promise<number> {
  if (ags.length === 0) return 0;
  const qui = await nomAuteurAg(auteur);
  const jour = aujourdhuiParis();
  for (const a of ags) {
    await (q as typeof query)(
      `INSERT INTO gestion_copropriete_ag (copropriete_id, type_ag, statut, date_ag, origine, saisie_par, saisie_par_libelle, nature_ag, note)
       VALUES ($1, $2, 'officielle', $3::date, 'fiche_copropriete', $4, $5, $6, $7)`,
      [coproprieteId, typeAgOfficielle(a.date, jour), a.date, auteur.id, qui, a.nature, a.note]);
  }
  return ags.length;
}

// ══ 🔴🔴 LES PV D'AG DANS « NOUVEAU BIEN » ET « MODIFIER LE BIEN » (Arno, 17/11/2026) ═══════════════════════════════════════════════════════
// Demande d'Arno : « AG DANS « Copropriété & ID fiscal » : ajoute le module PV d'AG déjà créé […] la saisie va dans la MÊME base officielle des PV
// d'AG de la copropriété, partagée avec la fiche Copropriété et « Valider la sortie » ; si l'adresse n'est pas encore choisie ou si le bien n'est
// relié à aucune copropriété : le dire clairement ; un PV saisi avant l'enregistrement du bien est rattaché à la copropriété à l'enregistrement. »

/** La 483 est-elle posée (l'origine « fiche du bien » d'un PV) ? */
export async function origineFicheBienPvDisponible(q: Q = query): Promise<boolean> {
  const { rows } = await (q as typeof query)<{ ok: boolean }>(
    `SELECT coalesce(bool_or(pg_get_constraintdef(oid) LIKE '%fiche_bien_pv%'), false) AS ok FROM pg_constraint WHERE conname = 'gestion_copropriete_ag_origine_chk'`)
    .catch(() => ({ rows: [{ ok: false }] }));
  return rows[0]?.ok === true;
}

/** Ce que le bloc AG du bien lit : sa copropriété (s'il en a une), ses AG, et si la saisie des PV est installée (481). LECTURE SEULE. */
export interface AgDuBienLu { copropriete: { libelle: string; cle: string } | null; immeuble: string | null; entrees: EntreeAg[]; pv: boolean }
export async function agDuBien(o: { lotId: number } | { immeuble: string }): Promise<AgDuBienLu | null> {
  const pv = await pvAgDisponible();
  if (!(await historiqueAgDisponible())) return { copropriete: null, immeuble: null, entrees: [], pv: false };
  if ('lotId' in o) {
    const h = await entreesAgDuLot(o.lotId);
    if (h === null) return null;
    return { copropriete: h.contexte.copropriete === null ? null : { libelle: h.contexte.copropriete.libelle, cle: h.contexte.copropriete.cle },
      immeuble: h.contexte.immeuble?.libelle ?? null, entrees: h.entrees, pv };
  }
  const cle = cleImmeuble(o.immeuble.slice(0, 300));
  if (cle === '') return { copropriete: null, immeuble: null, entrees: [], pv };
  const copro = await coproprieteDeCle(cle);
  return { copropriete: copro === null ? null : { libelle: copro.libelle, cle: copro.cle }, immeuble: o.immeuble,
    entrees: copro === null ? [] : await entreesAg({ coproprieteId: copro.id, cle, lotId: null }), pv };
}

/** Les PV en attente (saisis avant l'enregistrement du bien) : contrôlés AVANT toute écriture ; 10 au plus. */
export const PV_EN_ATTENTE_MAX = 10;
export async function pvsDuBienValides(brut: unknown): Promise<{ ok: true; pvs: { date: string; nature: NatureAg; note: string | null }[] } | { ok: false; motif: string }> {
  const liste = Array.isArray(brut) ? brut : [];
  if (liste.length === 0) return { ok: true, pvs: [] };
  if (liste.length > PV_EN_ATTENTE_MAX) return { ok: false, motif: `${PV_EN_ATTENTE_MAX} PV d’AG au plus par enregistrement.` };
  if (!(await pvAgDisponible())) return { ok: false, motif: 'La saisie des PV d’AG attend la mise à jour de la base (migration 481) : rien n’est enregistré.' };
  const jour = aujourdhuiParis();
  const pvs: { date: string; nature: NatureAg; note: string | null }[] = [];
  for (const x of liste) {
    const v = verifierPv((x ?? {}) as Record<string, unknown>, jour);
    if (!v.ok) return { ok: false, motif: `PV d’AG : ${v.motif}` };
    pvs.push(v.saisie);
  }
  return { ok: true, pvs };
}

/**
 * À l'enregistrement du bien, DANS SA TRANSACTION : les PV en attente vont dans la base officielle des PV de la copropriété du bien (sa copropriété ;
 * sans copropriété : la clé de son immeuble et le bien, « à rattacher à une copropriété », qui rejoignent d'eux-mêmes la copropriété dès que cette
 * clé en devient une adresse). AJOUT SEUL. Rend le nombre de PV écrits.
 */
export async function ajouterPvsDuBien(q: Q, lotId: number, pvs: readonly { date: string; nature: NatureAg; note: string | null }[], auteur: Auteur): Promise<number> {
  if (pvs.length === 0) return 0;
  const c = await contexteAgDuLot(lotId, q);
  if (c === null) return 0;
  const qui = await nomAuteurAg(auteur);
  // 🔴 (Arno, 17/11/2026 : « un PV saisi depuis « Nouveau bien » ou « Modifier le bien » doit apparaître dans l'historique comme « (fiche du bien) » », migration 483) ; sans la 483 : « fiche copropriété », comme avant
  const origine = (await origineFicheBienPvDisponible(q)) ? 'fiche_bien_pv' : 'fiche_copropriete';
  for (const p of pvs) {
    await (q as typeof query)(
      `INSERT INTO gestion_copropriete_ag (copropriete_id, cle_immeuble, lot_id, type_ag, statut, date_ag, origine, saisie_par, saisie_par_libelle, nature_ag, note)
       VALUES ($1, $2, $3, 'derniere', 'officielle', $4::date, $9, $5, $6, $7, $8)`,
      [c.copropriete?.id ?? null, c.copropriete === null ? (c.immeuble?.cle ?? null) : null, c.copropriete === null ? lotId : null, p.date, auteur.id, qui, p.nature, p.note, origine]);
  }
  return pvs.length;
}
