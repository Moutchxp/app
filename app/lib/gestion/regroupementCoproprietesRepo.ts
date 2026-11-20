import { query, withTransaction, type RequeteTx } from '../db/client';
import { colonneExisteMemo } from '../location/sondeLocation';
import type { Auteur } from './gestes';
import { listerCoproprietes } from './coproprieteRepo';
import { immeubleDuBien, type LigneCopropriete } from './copropriete';
import { propositionsRegroupement, signatureProposition, type FicheARegrouper } from './doublonsCopropriete';
import { parcellesDesAdresses } from './parcelleRepo';
import { adresseImmeuble, cleImmeuble, nomAvecVille } from './syndics';
import { journaliserLienSyndic } from './journalSyndicCopro';

/**
 * ══ 🔴🔴 REGROUPER LES COPROPRIÉTÉS EN DOUBLE PAR VARIANTES D'ADRESSE (Arno, 19/11/2026, migration 504). IMPUR (base). ═══════════════════════════
 *
 * « Regrouper » (liste Copropriétés) : Arno coche plusieurs fiches et choisit l'adresse principale ; les AUTRES écritures deviennent des adresses
 * SECONDAIRES de cette copropriété (la même table que la fiche copropriété, 335), marquées par leur regroupement. Leurs biens rejoignent la
 * copropriété — et son syndic — par la règle déjà en place (un bien suit l'adresse secondaire de son « Immeuble »). 🔴 Les adresses des biens et
 * les données WIPPIMMO ne sont JAMAIS modifiées : seul un rattachement s'ajoute, et « Dégrouper » le retire (`retire_le`), sans rien effacer.
 *
 * Une écriture regroupée doit être « fiche à créer » : une fiche déjà enregistrée a ses propres données (syndic, habitants, AG…), et se regroupe
 * depuis sa fiche (« Même syndic : regrouper ? ») — rien n'est déplacé d'office. TOUS LES REFUS AVANT TOUTE ÉCRITURE (piège `withTransaction`).
 * Journal : une ligne par bien qui change de copropriété (« Historique » du bien), et le regroupement lui-même (qui, quand, les écritures).
 */

export const MOTIF_SANS_504 = 'Le regroupement des copropriétés demande la mise à jour de la base (migration 504) : rien n’est enregistré.';
export const ACTION_REGROUPEE = 'copropriete_regroupee';
export const ACTION_DEGROUPEE = 'copropriete_degroupee';

export function regroupementDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_copropriete_doublon_ignore', 'signature');
}

export interface FicheProposee { cle: string; immeuble: string; nbBiens: number; declaree: boolean }
export interface PropositionAffichee { cles: string[]; principale: string; signature: string; fiches: FicheProposee[] }
export interface RegroupementEnCours { id: number; cle: string; principale: string; regroupees: string[]; le: string; par: string }

/** Le libellé qu'on cherche dans la BAN : l'écriture sans ce qui suit « / », ni les parenthèses, ni le code postal et la suite. PUR. */
const pourLaBan = (immeuble: string): string => immeuble.split('/')[0].replace(/\([^)]*\)?/g, ' ').replace(/,?\s*\b\d{5}\b[\s\S]*$/, '').replace(/\s+/g, ' ').trim();

/** LES PROPOSITIONS de la liste : la signature tolérante, puis la parcelle des fiches proposées quand elle est connue. LECTURE SEULE. */
export async function propositionsDeLaListe(lignes?: readonly LigneCopropriete[]): Promise<PropositionAffichee[]> {
  const toutes = lignes ?? await listerCoproprietes();
  const fiches: FicheARegrouper[] = toutes.map((l) => ({ cle: l.cle, immeuble: l.immeuble, codePostal: l.codePostal ?? null, commune: l.commune ?? null,
    declaree: l.declaree, nbBiens: l.nbBiens }));
  const avec504 = await regroupementDisponible();
  const ignorees = avec504
    ? new Set((await query<{ signature: string }>('SELECT DISTINCT signature FROM gestion_copropriete_doublon_ignore')).rows.map((r) => r.signature))
    : new Set<string>();
  const premieres = propositionsRegroupement(fiches, ignorees);
  if (premieres.length === 0) return [];
  // la parcelle des seules fiches proposées : deux parcelles différentes séparent la proposition
  const vues = new Set(premieres.flatMap((p) => p.cles));
  const aLire = fiches.filter((f) => vues.has(f.cle));
  const parcelles = await parcellesDesAdresses(aLire.map((f) => ({ libelle: pourLaBan(f.immeuble), codePostal: f.codePostal ?? '', commune: f.commune ?? '' })))
    .catch(() => new Map<string, string>());
  const avecParcelle = aLire.map((f) => ({ ...f, parcelle: parcelles.get(cleImmeuble(pourLaBan(f.immeuble))) ?? null }));
  const parCle = new Map(fiches.map((f) => [f.cle, f]));
  return propositionsRegroupement(avecParcelle, ignorees).map((p) => ({ ...p, signature: signatureProposition(p.cles),
    fiches: p.cles.map((k) => parCle.get(k)!).map((f) => ({ cle: f.cle, immeuble: f.immeuble, nbBiens: f.nbBiens, declaree: f.declaree })) }));
}

/** Les regroupements EN COURS (non dégroupés), par copropriété (sa clé principale) : ce que « Dégrouper » propose. LECTURE SEULE. */
export async function regroupementsEnCours(): Promise<RegroupementEnCours[]> {
  if (!(await regroupementDisponible())) return [];
  const { rows } = await query<{ id: string; cle: string; principale: string; regroupees: string[]; le: string; par: string }>(
    // 🔴 (lot 0) les écritures EN COURS du regroupement (une adresse retirée depuis la fiche n'y est plus), pas la liste figée à sa création
    `SELECT r.id::text, c.cle_immeuble AS cle, r.principale,
            array(SELECT a.libelle FROM gestion_copropriete_adresse a WHERE a.regroupement_id = r.id AND a.retire_le IS NULL ORDER BY a.id) AS regroupees,
            r.cree_le::text AS le, r.cree_par_libelle AS par
       FROM gestion_copropriete_regroupement r JOIN gestion_copropriete c ON c.id = r.copropriete_id
      WHERE r.degroupe_le IS NULL${(await colonneExisteMemo('gestion_copropriete_regroupement', 'absorbe_le')) ? ' AND r.absorbe_le IS NULL' : ''} ORDER BY r.id`);
  // 🔴 (lot 5, 508) un regroupement ABSORBÉ par l'unification des adresses officielles n'est plus en cours : ses adresses sont des écritures d'origine
  return rows.map((r) => ({ id: Number(r.id), cle: r.cle, principale: r.principale, regroupees: r.regroupees, le: r.le, par: r.par }));
}

/** Les biens (en portefeuille) de ces clés d'immeuble, par leur « Immeuble », sinon leur adresse — la règle de la liste. LECTURE SEULE. */
async function biensDesCles(q: RequeteTx, cles: ReadonlySet<string>): Promise<{ id: string; cle: string }[]> {
  const { rows } = await q<{ id: string; immeuble: string | null; adresse: string | null }>(
    'SELECT id::text, immeuble, adresse FROM gestion_annuaire_lot WHERE absent_le IS NULL ORDER BY id');
  return rows.map((l) => ({ id: l.id, cle: cleImmeuble(immeubleDuBien(l)) })).filter((l) => cles.has(l.cle));
}

/** Le syndic en cours de la copropriété (pour le dire dans l'Historique des biens, et au journal des syndics), ou `null`. */
async function syndicDeLaCopro(q: RequeteTx, coproId: string): Promise<{ id: number; nom: string } | null> {
  const { rows } = await q<{ id: string; nom: string; ville: string | null }>(
    `SELECT s.id::text, s.nom, s.ville FROM gestion_copropriete_syndic cs JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL
      WHERE cs.copropriete_id = $1 AND cs.fin IS NULL LIMIT 1`, [coproId]);
  return rows[0] === undefined ? null : { id: Number(rows[0].id), nom: nomAvecVille(rows[0].nom, rows[0].ville) };
}

const listeEcritures = (xs: readonly string[]): string => xs.map((x) => `« ${x} »`).join(', ');

/**
 * REGROUPER : `principale` (clé) et `cles` (toutes les fiches cochées, la principale comprise). Rend le message de confirmation. Refus clairs,
 * rien d'écrit : moins de deux fiches, une fiche qui n'est plus dans la liste, une écriture déjà enregistrée ou déjà adresse d'une copropriété.
 */
export async function regrouper(brut: unknown, auteur: Auteur): Promise<{ ok: true; message: string; id: number } | { ok: false; motif: string }> {
  if (!(await regroupementDisponible())) return { ok: false, motif: MOTIF_SANS_504 };
  const b = (brut ?? {}) as Record<string, unknown>;
  const principale = cleImmeuble(typeof b.principale === 'string' ? b.principale : '');
  const cles = [...new Set((Array.isArray(b.cles) ? b.cles.slice(0, 50) : []).map((x) => cleImmeuble(typeof x === 'string' ? x : '')).filter((x) => x !== ''))];
  if (principale === '' || !cles.includes(principale)) return { ok: false, motif: 'Choisissez l’adresse principale parmi les fiches cochées.' };
  const autresCles = cles.filter((k) => k !== principale);
  if (autresCles.length === 0) return { ok: false, motif: 'Cochez au moins deux fiches à regrouper.' };
  const lignes = new Map((await listerCoproprietes()).map((l) => [l.cle, l]));
  const p = lignes.get(principale);
  const autres = autresCles.map((k) => lignes.get(k));
  if (p === undefined || autres.some((x) => x === undefined)) return { ok: false, motif: 'Une des fiches cochées n’est plus dans la liste (déjà regroupée ?) : rechargez la page. Rien n’est enregistré.' };
  const deja = autres.find((x) => x!.declaree);
  if (deja !== undefined) {
    return { ok: false, motif: `« ${deja.immeuble} » a déjà sa fiche enregistrée : elle ne peut pas devenir une adresse secondaire d’ici (ouvrez sa fiche, « Même syndic : regrouper ? »). Rien n’est enregistré.` };
  }
  const regroupees = autres.map((x) => x!);
  const r = await withTransaction(async (q) => {
    // ── ① LES REFUS, AVANT TOUTE ÉCRITURE : une écriture devenue copropriété ou adresse d'une copropriété depuis l'affichage ──────────────────────
    const { rows: prises } = await q<{ cle: string }>(
      `SELECT cle_immeuble AS cle FROM gestion_copropriete WHERE cle_immeuble = ANY($1::text[])
       UNION SELECT cle_immeuble FROM gestion_copropriete_adresse WHERE retire_le IS NULL AND cle_immeuble = ANY($1::text[])`, [autresCles]);
    if (prises.length > 0) {
      const x = regroupees.find((f) => f.cle === prises[0].cle);
      return { ok: false as const, motif: `« ${x?.immeuble ?? prises[0].cle} » est déjà une copropriété ou l’adresse d’une copropriété : rechargez la page. Rien n’est enregistré.` };
    }
    // ── ② la copropriété principale (créée si elle n'est encore connue que par ses biens) ───────────────────────────────────────────────────
    await q(
      `INSERT INTO gestion_copropriete (cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (cle_immeuble) DO UPDATE SET code_postal = coalesce(gestion_copropriete.code_postal, EXCLUDED.code_postal),
                                                commune = coalesce(gestion_copropriete.commune, EXCLUDED.commune)`,
      [p.cle, p.immeuble, p.codePostal ?? null, p.commune ?? null, auteur.id, auteur.libelle]);
    const { rows: c } = await q<{ id: string }>('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = $1', [p.cle]);
    const coproId = c[0].id;
    // ── ③ le regroupement, puis les écritures regroupées en adresses secondaires (marquées par lui) ─────────────────────────────────────────
    const { rows: rg } = await q<{ id: string }>(
      `INSERT INTO gestion_copropriete_regroupement (copropriete_id, principale, regroupees, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5) RETURNING id::text`,
      [coproId, p.immeuble, regroupees.map((f) => f.immeuble), auteur.id, auteur.libelle]);
    const id = rg[0].id;
    for (const f of regroupees) {
      await q(
        `INSERT INTO gestion_copropriete_adresse (copropriete_id, cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle, regroupement_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [coproId, f.cle, f.immeuble, f.codePostal ?? null, f.commune ?? null, auteur.id, auteur.libelle, id]);
    }
    // ── ④ l'Historique de chaque bien qui rejoint la copropriété ────────────────────────────────────────────────────────────────────────────
    const s = await syndicDeLaCopro(q, coproId);
    const syndic = s?.nom ?? null;
    const copro = adresseImmeuble(p.immeuble, p.codePostal ?? null, p.commune ?? null);
    // 🔴 (20/11/2026, journal des syndics) les écritures regroupées rejoignent la copropriété ET son syndic : dit au journal de la copropriété
    if (s !== null) {
      await journaliserLienSyndic(q, { coproId, nature: 'rattache', syndicId: s.id, ecran: 'la liste Copropriétés (« Regrouper »)',
        motif: `regroupement n° ${id} : ${listeEcritures(regroupees.map((x) => x.immeuble))} rejoignent la copropriété` }, auteur);
    }
    for (const l of await biensDesCles(q, new Set(autresCles))) {
      const f = regroupees.find((x) => x.cle === l.cle)!;
      await q(
        `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
         VALUES ('annuaire_lot', $1, $2, $3, $4, $5, $6, $7)`,
        [l.id, ACTION_REGROUPEE, f.immeuble, p.immeuble,
          `Copropriété regroupée (n° ${id}) : l’écriture « ${f.immeuble} » devient une adresse de la copropriété ${copro}`
            + `${syndic === null ? '' : ` (syndic : ${syndic})`} — écritures regroupées : ${listeEcritures(regroupees.map((x) => x.immeuble))}`,
          auteur.id, auteur.libelle]);
    }
    return { ok: true as const, id: Number(id), copro, syndic };
  });
  if (!r.ok) return r;
  const n = regroupees.reduce((s, f) => s + f.nbBiens, 0);
  return { ok: true, id: r.id, message: `Regroupé : ${listeEcritures(regroupees.map((f) => f.immeuble))} ${regroupees.length > 1 ? 'deviennent des adresses' : 'devient une adresse'} `
    + `de la copropriété ${r.copro} ; ${n} bien${n > 1 ? 's' : ''} la rejoigne${n > 1 ? 'nt' : ''}${r.syndic === null ? '' : `, avec son syndic ${r.syndic}`}.` };
}

/** DÉGROUPER : le regroupement est clos, ses adresses secondaires RETIRÉES (jamais effacées) ; leurs biens redeviennent leur propre fiche. */
export async function degrouper(brut: unknown, auteur: Auteur): Promise<{ ok: true; message: string } | { ok: false; motif: string }> {
  if (!(await regroupementDisponible())) return { ok: false, motif: MOTIF_SANS_504 };
  const id = Number(((brut ?? {}) as Record<string, unknown>).id);
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, motif: 'Regroupement non désigné.' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ copro: string; principale: string; cle: string; cp: string | null; commune: string | null }>(
      `SELECT r.copropriete_id::text AS copro, r.principale, c.cle_immeuble AS cle, c.code_postal AS cp, c.commune
         FROM gestion_copropriete_regroupement r JOIN gestion_copropriete c ON c.id = r.copropriete_id
        WHERE r.id = $1 AND r.degroupe_le IS NULL FOR UPDATE OF r`, [id]);
    const r = rows[0];
    if (r === undefined) return { ok: false as const, motif: 'Ce regroupement n’existe pas ou a déjà été dégroupé : rechargez la page.' };
    const { rows: adresses } = await q<{ id: string; cle: string; libelle: string }>(
      'SELECT id::text, cle_immeuble AS cle, libelle FROM gestion_copropriete_adresse WHERE regroupement_id = $1 AND retire_le IS NULL ORDER BY id FOR UPDATE', [id]);
    const s = await syndicDeLaCopro(q, r.copro);
    const syndic = s?.nom ?? null;
    const copro = adresseImmeuble(r.principale, r.cp, r.commune);
    if (s !== null && adresses.length > 0) {
      await journaliserLienSyndic(q, { coproId: r.copro, nature: 'retire', syndicId: s.id, ecran: 'la liste Copropriétés (« Dégrouper »)',
        motif: `dégroupement n° ${id} : ${listeEcritures(adresses.map((a) => a.libelle))} quittent la copropriété` }, auteur);
    }
    if (adresses.length > 0) {
      await q('UPDATE gestion_copropriete_adresse SET retire_le = now(), retire_par_libelle = $2 WHERE id = ANY($1::bigint[])', [adresses.map((a) => a.id), auteur.libelle]);
    }
    await q('UPDATE gestion_copropriete_regroupement SET degroupe_le = now(), degroupe_par = $2, degroupe_par_libelle = $3 WHERE id = $1', [id, auteur.id, auteur.libelle]);
    for (const l of await biensDesCles(q, new Set(adresses.map((a) => a.cle)))) {
      const a = adresses.find((x) => x.cle === l.cle)!;
      await q(
        `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
         VALUES ('annuaire_lot', $1, $2, $3, $4, $5, $6, $7)`,
        [l.id, ACTION_DEGROUPEE, r.principale, a.libelle, `Copropriété dégroupée (n° ${id}) : l’écriture « ${a.libelle} » n’est plus une adresse de la copropriété ${copro}`, auteur.id, auteur.libelle]);
      // comme tout retrait d'adresse d'une copropriété qui a un syndic : le bien perd ce syndic, une ligne par bien
      if (syndic !== null) {
        await q(
          `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'syndic_retire', $2, $3, $4, $5)`,
          [l.id, syndic, `Syndic ${syndic} retiré de l’adresse ${a.libelle} (dégroupée de la copropriété ${copro})`, auteur.id, auteur.libelle]);
      }
    }
    return { ok: true as const, message: `Dégroupé : ${listeEcritures(adresses.map((a) => a.libelle))} ne ${adresses.length > 1 ? 'sont' : 'est'} plus `
      + `${adresses.length > 1 ? 'des adresses' : 'une adresse'} de la copropriété ${copro} ; ${adresses.length > 1 ? 'elles redeviennent leurs propres fiches' : 'elle redevient sa propre fiche'}.` };
  });
}

/**
 * ══ 🔴 (Arno, 20/11/2026, LOT 0 — correctif 504) UNE ADRESSE D'UN REGROUPEMENT RETIRÉE AILLEURS QUE PAR « DÉGROUPER » ══════════════════════════════
 * LE DÉFAUT CONSTATÉ (recette, 19/11 22h03) : « Valider » sur la fiche copropriété a retiré les 5 adresses du regroupement n° 1 (absentes de la
 * saisie) SANS le clore ni rien écrire au journal — la liste l'affichait toujours « en cours ». Désormais, dans la MÊME transaction que le retrait :
 * une ligne « dégroupée » dans l'Historique de chaque bien des écritures retirées (avec l'écran d'origine), et le regroupement est CLOS (`degroupe_le`,
 * qui) dès qu'il n'a plus aucune adresse en cours. Rien n'est effacé. `ids` : les adresses secondaires que l'appelant vient de retirer.
 */
export async function noterRetraitDAdressesRegroupees(q: RequeteTx, ids: readonly string[], ecran: string, auteur: Auteur): Promise<number[]> {
  if (ids.length === 0 || !(await regroupementDisponible())) return [];
  const { rows } = await q<{ regroupement: string; cle: string; libelle: string; principale: string; cp: string | null; commune: string | null }>(
    `SELECT a.regroupement_id::text AS regroupement, a.cle_immeuble AS cle, a.libelle, r.principale, c.code_postal AS cp, c.commune
       FROM gestion_copropriete_adresse a JOIN gestion_copropriete_regroupement r ON r.id = a.regroupement_id
       JOIN gestion_copropriete c ON c.id = r.copropriete_id
      WHERE a.id = ANY($1::bigint[]) AND r.degroupe_le IS NULL ORDER BY a.id`, [[...ids]]);
  if (rows.length === 0) return [];
  for (const l of await biensDesCles(q, new Set(rows.map((r) => r.cle)))) {
    const a = rows.find((x) => x.cle === l.cle)!;
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire_lot', $1, $2, $3, $4, $5, $6, $7)`,
      [l.id, ACTION_DEGROUPEE, a.principale, a.libelle, `Copropriété dégroupée (n° ${a.regroupement}, ${ecran}) : l’écriture « ${a.libelle} » n’est plus une adresse `
        + `de la copropriété ${adresseImmeuble(a.principale, a.cp, a.commune)}`, auteur.id, auteur.libelle]);
  }
  return cloreRegroupementsVides(q, [...new Set(rows.map((r) => r.regroupement))], auteur);
}

/** Clôt ceux de ces regroupements (encore ouverts) qui n'ont plus AUCUNE adresse en cours. Rend leurs numéros. */
async function cloreRegroupementsVides(q: RequeteTx, ids: readonly string[], auteur: Auteur): Promise<number[]> {
  const { rows } = await q<{ id: string }>(
    `UPDATE gestion_copropriete_regroupement r SET degroupe_le = now(), degroupe_par = $2, degroupe_par_libelle = $3
      WHERE r.id = ANY($1::bigint[]) AND r.degroupe_le IS NULL
        AND NOT EXISTS (SELECT 1 FROM gestion_copropriete_adresse a WHERE a.regroupement_id = r.id AND a.retire_le IS NULL)
      RETURNING r.id::text`, [[...ids], auteur.id, auteur.libelle]);
  return rows.map((r) => Number(r.id));
}

/**
 * LA RÉPARATION (lot 0) : les regroupements restés « en cours » alors que TOUTES leurs adresses ont été retirées (avant le correctif). `appliquer` faux :
 * rien n'est écrit, ils sont seulement rendus. Vrai : chacun est CLOS, avec une ligne d'Historique par bien de ses écritures (qui disait qu'il
 * était encore regroupé) — l'écran d'origine du retrait n'étant pas connu, la ligne dit ce qui a été constaté. Rien n'est effacé.
 */
export async function regroupementsOrphelins(appliquer: boolean, auteur: Auteur): Promise<{ id: number; principale: string; regroupees: string[]; retireLe: string | null }[]> {
  if (!(await regroupementDisponible())) return [];
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string; principale: string; regroupees: string[]; retire_le: string | null }>(
      `SELECT r.id::text, r.principale, r.regroupees, (SELECT max(a.retire_le)::text FROM gestion_copropriete_adresse a WHERE a.regroupement_id = r.id) AS retire_le
         FROM gestion_copropriete_regroupement r
        WHERE r.degroupe_le IS NULL AND NOT EXISTS (SELECT 1 FROM gestion_copropriete_adresse a WHERE a.regroupement_id = r.id AND a.retire_le IS NULL)
        ORDER BY r.id FOR UPDATE OF r`);
    const out = rows.map((r) => ({ id: Number(r.id), principale: r.principale, regroupees: r.regroupees, retireLe: r.retire_le }));
    if (!appliquer || rows.length === 0) return out;
    for (const r of rows) {
      const { rows: adr } = await q<{ cle: string; libelle: string }>(
        'SELECT DISTINCT cle_immeuble AS cle, libelle FROM gestion_copropriete_adresse WHERE regroupement_id = $1', [r.id]);
      for (const l of await biensDesCles(q, new Set(adr.map((a) => a.cle)))) {
        const a = adr.find((x) => x.cle === l.cle)!;
        await q(
          `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
           VALUES ('annuaire_lot', $1, $2, $3, $4, $5, $6, $7)`,
          [l.id, ACTION_DEGROUPEE, r.principale, a.libelle, `Regroupement n° ${r.id} clos (réparation) : ses adresses avaient été retirées le ${r.retire_le ?? '?'} `
            + `sans le clore ; l’écriture « ${a.libelle} » n’en faisait déjà plus partie`, auteur.id, auteur.libelle]);
      }
    }
    await cloreRegroupementsVides(q, rows.map((r) => r.id), auteur);
    return out;
  });
}

/** « IGNORER » une proposition : sa signature (les clés triées), qui et quand. Elle ne revient plus — sauf si une nouvelle écriture s'y ajoute. */
export async function ignorerProposition(brut: unknown, auteur: Auteur): Promise<{ ok: true } | { ok: false; motif: string }> {
  if (!(await regroupementDisponible())) return { ok: false, motif: MOTIF_SANS_504 };
  const b = (brut ?? {}) as Record<string, unknown>;
  const cles = [...new Set((Array.isArray(b.cles) ? b.cles.slice(0, 50) : []).map((x) => cleImmeuble(typeof x === 'string' ? x : '')).filter((x) => x !== ''))].sort();
  if (cles.length < 2) return { ok: false, motif: 'Proposition non désignée.' };
  await query('INSERT INTO gestion_copropriete_doublon_ignore (signature, cles, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4)',
    [signatureProposition(cles), cles, auteur.id, auteur.libelle]);
  return { ok: true };
}
