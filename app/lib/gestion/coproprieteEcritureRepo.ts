import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { enregistrerContactsImmeuble } from './contactsImmeubleRepo';
import { adressesDeLaParcelle } from './parcelleRepo';
import { adresseImmeuble, cleImmeuble, nomAvecVille, validerContactsImmeuble, type AdresseSaisie, type ContactImmeubleSaisi } from './syndics';
import { ficheCopropriete, fiche476Disponible } from './coproprieteRepo';
import type { FicheCopropriete } from './copropriete';

/**
 * ══ 🔴🔴 LA FICHE COPROPRIÉTÉ — L'ÉCRITURE (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 2). IMPUR (base). ═════════════════════════════
 *
 * La fiche se crée au PREMIER enregistrement (une copropriété connue seulement par ses biens). En UNE transaction, et TOUS LES REFUS AVANT TOUTE
 * ÉCRITURE (piège du dépôt : `withTransaction` valide au retour normal) :
 *   · le nom, « hors copropriété » (l'immeuble entier ; migration 476) ;
 *   · les adresses SECONDAIRES (liste entière) : les nouvelles ajoutées, les absentes RETIRÉES (`retire_le`, jamais effacées) ; une adresse qui est
 *     déjà une autre copropriété, ou l'adresse d'une autre, est REFUSÉE (même règle que la fiche syndic) ;
 *   · les habitants et gardiens (le carnet de l'immeuble, 333 — mêmes règles que la fiche syndic) ;
 *   · le SYNDIC (rattacher ou changer, depuis cette fiche comme depuis la fiche syndic) : le lien en cours est FERMÉ (« changement de syndic »),
 *     les gestionnaires de l'ancien syndic cessent de suivre la copropriété, le nouveau lien est ouvert ; un conflit de parcelle confirmé est noté ;
 *   · l'alerte « autres adresses de la même parcelle » marquée vue (une seule fois par copropriété).
 * Le digicode (par adresse, 396/399) et les AG (475) gardent leurs propres enregistrements.
 */

export interface SaisieCopropriete {
  immeuble: string;
  nom: string | null;
  horsCopropriete: boolean | null;
  adresses: AdresseSaisie[];
  contacts: ContactImmeubleSaisi[] | null;
  syndicId: number | null;
  alerteParcelleVue: boolean;
  conflitsParcelle: { autre: string; parcelle: string | null }[];
}

const texte = (v: unknown, max = 300): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const nul = (s: string | null | undefined): string | null => ((s ?? '').trim() === '' ? null : (s ?? '').trim());

/** La saisie propre, ou le motif du refus. PUR. */
export function validerSaisieCopropriete(brut: unknown): { ok: true; saisie: SaisieCopropriete } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  const immeuble = texte(b.immeuble);
  if (cleImmeuble(immeuble) === '') return { ok: false, motif: 'Copropriété non désignée.' };
  const adresses: AdresseSaisie[] = [];
  const vues = new Set<string>();
  for (const x of (Array.isArray(b.adresses) ? b.adresses.slice(0, 30) : [])) {
    const a = (x ?? {}) as Record<string, unknown>;
    const libelle = texte(a.libelle);
    const cle = cleImmeuble(libelle);
    if (cle === '' || vues.has(cle)) continue;
    vues.add(cle);
    adresses.push({ libelle, codePostal: texte(a.codePostal, 10), commune: texte(a.commune, 120) });
  }
  let contacts: ContactImmeubleSaisi[] | null = null;
  if (Array.isArray(b.contacts)) {
    const v = validerContactsImmeuble({ immeuble, contacts: b.contacts });
    if (!v.ok) return v;
    contacts = v.carnet.contacts;
  }
  const syndicId = typeof b.syndicId === 'number' && Number.isSafeInteger(b.syndicId) && b.syndicId > 0 ? b.syndicId : null;
  const conflitsParcelle = (Array.isArray(b.conflitsParcelle) ? b.conflitsParcelle.slice(0, 20) : [])
    .map((x) => (x ?? {}) as Record<string, unknown>).map((k) => ({ autre: texte(k.autre), parcelle: nul(texte(k.parcelle, 40)) })).filter((k) => cleImmeuble(k.autre) !== '');
  return { ok: true, saisie: { immeuble, nom: nul(texte(b.nom, 200)), horsCopropriete: typeof b.horsCopropriete === 'boolean' ? b.horsCopropriete : null,
    adresses, contacts, syndicId, alerteParcelleVue: b.alerteParcelleVue === true, conflitsParcelle } };
}

/** La copropriété (principale) d'une clé : la sienne, ou celle dont elle est une adresse en cours. */
async function coproDeCle(q: RequeteTx, cle: string): Promise<{ id: string; cle: string; libelle: string } | null> {
  const { rows } = await q<{ id: string; cle: string; libelle: string }>(
    `SELECT c.id::text, c.cle_immeuble AS cle, c.libelle FROM gestion_copropriete c
      WHERE c.cle_immeuble = $1 OR c.id = (SELECT a.copropriete_id FROM gestion_copropriete_adresse a WHERE a.cle_immeuble = $1 AND a.retire_le IS NULL ORDER BY a.id LIMIT 1)
      ORDER BY (c.cle_immeuble = $1) DESC, c.id LIMIT 1`, [cle]);
  return rows[0] ?? null;
}

/** L'enregistrement. Rend la fiche relue. */
export async function enregistrerCopropriete(brut: unknown, auteur: Auteur): Promise<{ ok: true; fiche: FicheCopropriete } | { ok: false; motif: string }> {
  const v = validerSaisieCopropriete(brut);
  if (!v.ok) return v;
  const s = v.saisie;
  const lue = await ficheCopropriete(s.immeuble);
  if (lue === null) return { ok: false, motif: 'Cette copropriété n’est connue ni par un bien ni par une fiche : rechargez la page.' };
  const avec476 = await fiche476Disponible();
  if (s.horsCopropriete !== null && !avec476) return { ok: false, motif: '« Hors copropriété » demande la mise à jour de la base (migration 476) : rien n’est enregistré.' };
  const r = await withTransaction(async (q) => {
    // ── ① TOUS LES REFUS, AVANT TOUTE ÉCRITURE ─────────────────────────────────────────────────────────────────────────────────────────────
    for (const a of s.adresses) {
      const cle = cleImmeuble(a.libelle);
      if (cle === lue.cle) continue;
      const autre = await coproDeCle(q, cle);
      if (autre !== null && autre.cle !== lue.cle) {
        return { ok: false as const, motif: autre.cle === cle
          ? `${adresseImmeuble(a.libelle, a.codePostal, a.commune)} est déjà une autre copropriété (« ${autre.libelle} »).`
          : `${adresseImmeuble(a.libelle, a.codePostal, a.commune)} est déjà une adresse de la copropriété « ${autre.libelle} ».` };
      }
    }
    if (s.syndicId !== null) {
      const { rows } = await q<{ id: string }>('SELECT id::text FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL', [s.syndicId]);
      if (rows[0] === undefined) return { ok: false as const, motif: 'Ce syndic n’existe plus : choisissez-en un autre.' };
    }
    // ── ② la copropriété (créée au premier enregistrement), son nom, « hors copropriété » ──────────────────────────────────────────────────
    await q(
      `INSERT INTO gestion_copropriete (cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (cle_immeuble) DO UPDATE SET code_postal = coalesce(gestion_copropriete.code_postal, EXCLUDED.code_postal),
                                                commune = coalesce(gestion_copropriete.commune, EXCLUDED.commune)`,
      [lue.cle, lue.libelle, lue.codePostal, lue.commune, auteur.id, auteur.libelle]);
    const { rows: c } = await q<{ id: string }>('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = $1', [lue.cle]);
    const coproId = c[0].id;
    if (avec476) {
      await q(`UPDATE gestion_copropriete SET nom = $2, hors_copropriete = coalesce($3, hors_copropriete), maj_le = now(), maj_par_libelle = $4 WHERE id = $1`,
        [coproId, s.nom, s.horsCopropriete, auteur.libelle]);
    }
    // ── ③ les adresses secondaires : ajoutées, retirées (jamais effacées) ───────────────────────────────────────────────────────────────────
    const { rows: enCours } = await q<{ id: string; cle: string; libelle: string }>(
      `SELECT id::text, cle_immeuble AS cle, libelle FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND retire_le IS NULL FOR UPDATE`, [coproId]);
    const voulues = new Map(s.adresses.filter((a) => cleImmeuble(a.libelle) !== lue.cle).map((a) => [cleImmeuble(a.libelle), a]));
    const retirees = enCours.filter((x) => !voulues.has(x.cle));
    if (retirees.length > 0) {
      await q('UPDATE gestion_copropriete_adresse SET retire_le = now(), retire_par_libelle = $2 WHERE id = ANY($1::bigint[])', [retirees.map((x) => x.id), auteur.libelle]);
      // comme la fiche syndic : chaque bien à l'adresse retirée perd le syndic de la copropriété — une ligne de journal par bien
      if (lue.syndic !== null) {
        const syndic = nomAvecVille(lue.syndic.nom, lue.syndic.ville);
        const { rows: lots } = await q<{ id: string; immeuble: string | null }>('SELECT id::text, immeuble FROM gestion_annuaire_lot WHERE absent_le IS NULL AND coalesce(btrim(immeuble), \'\') <> \'\'');
        for (const x of retirees) {
          for (const l of lots.filter((y) => cleImmeuble(y.immeuble) === x.cle)) {
            await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'syndic_retire', $2, $3, $4, $5)`,
              [l.id, syndic, `Syndic ${syndic} retiré de l’adresse ${x.libelle} (retirée de la copropriété ${lue.libelle}, depuis la fiche copropriété)`, auteur.id, auteur.libelle]);
          }
        }
      }
    }
    const deja = new Set(enCours.map((x) => x.cle));
    for (const [cle, a] of voulues) {
      if (deja.has(cle)) continue;
      await q(`INSERT INTO gestion_copropriete_adresse (copropriete_id, cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [coproId, cle, a.libelle, nul(a.codePostal), nul(a.commune), auteur.id, auteur.libelle]);
    }
    // ── ④ les habitants et gardiens ──────────────────────────────────────────────────────────────────────────────────────────────────────
    if (s.contacts !== null) await enregistrerContactsImmeuble(q, { immeuble: lue.libelle, contacts: s.contacts }, auteur);
    // ── ⑤ le syndic : rattacher ou changer (le lien en cours est fermé, jamais effacé) ───────────────────────────────────────────────────
    if (s.syndicId !== null && s.syndicId !== lue.syndic?.id) {
      const { rows: liens } = await q<{ id: string; syndic_id: string }>(
        `SELECT id::text, syndic_id::text FROM gestion_copropriete_syndic WHERE copropriete_id = $1 AND fin IS NULL FOR UPDATE`, [coproId]);
      for (const l of liens) {
        await q(`UPDATE gestion_copropriete_syndic SET fin = now(), fin_par = $2, fin_par_libelle = $3, fin_motif = 'changement de syndic' WHERE id = $1`, [l.id, auteur.id, auteur.libelle]);
        await q(`UPDATE gestion_syndic_contact_copropriete a SET retire_le = now(), retire_par_libelle = $3, retire_motif = 'changement de syndic'
                   FROM gestion_syndic_contact c WHERE a.contact_id = c.id AND c.syndic_id = $1 AND a.copropriete_id = $2 AND a.retire_le IS NULL`, [l.syndic_id, coproId, auteur.libelle]);
      }
      await q('INSERT INTO gestion_copropriete_syndic (copropriete_id, syndic_id, pose_par, pose_par_libelle) VALUES ($1, $2, $3, $4)', [coproId, s.syndicId, auteur.id, auteur.libelle]);
      // un conflit de parcelle CONFIRMÉ (une adresse de la parcelle est la copropriété d'un AUTRE syndic) : noté, comme depuis la fiche syndic
      for (const k of s.conflitsParcelle) {
        const autre = await coproDeCle(q, cleImmeuble(k.autre));
        if (autre === null || autre.id === coproId) continue;
        const { rows: sb } = await q<{ syndic: string }>('SELECT syndic_id::text AS syndic FROM gestion_copropriete_syndic WHERE copropriete_id = $1 AND fin IS NULL LIMIT 1', [autre.id]);
        if (sb[0] === undefined || Number(sb[0].syndic) === s.syndicId) continue;
        await q(`INSERT INTO gestion_copropriete_conflit (copropriete_a, syndic_a, copropriete_b, syndic_b, parcelle, cree_par, cree_par_libelle)
                 SELECT $1, $2, $3, $4, $5, $6, $7 WHERE NOT EXISTS (SELECT 1 FROM gestion_copropriete_conflit WHERE verifie_le IS NULL
                   AND ((copropriete_a = $1 AND copropriete_b = $3) OR (copropriete_a = $3 AND copropriete_b = $1)))`,
          [coproId, s.syndicId, autre.id, sb[0].syndic, k.parcelle, auteur.id, auteur.libelle]);
      }
    }
    if (s.alerteParcelleVue) {
      await q('UPDATE gestion_copropriete SET alerte_parcelle_le = now(), alerte_parcelle_par_libelle = $2 WHERE id = $1 AND alerte_parcelle_le IS NULL', [coproId, auteur.libelle]);
    }
    return { ok: true as const };
  });
  if (!r.ok) return r;
  const relue = await ficheCopropriete(lue.cle);
  return relue === null ? { ok: false, motif: 'Enregistré, mais la fiche n’a pas pu être relue : rechargez la page.' } : { ok: true, fiche: relue };
}

/** Une adresse de la même parcelle : libre (« Rattacher »), déjà de cette copropriété, ou prise par une autre (avec son syndic). */
export interface PropositionParcelle { libelle: string; codePostal: string; commune: string; parcelle: string; etat: 'libre' | 'prise';
  copropriete: string | null; syndic: { id: number; nom: string; ville: string | null } | null }

/** Les adresses des mêmes parcelles que celles de la copropriété (hors les siennes). LECTURE SEULE. */
export async function propositionsParcelle(adresses: readonly AdresseSaisie[], cleCopro: string): Promise<PropositionParcelle[]> {
  const { adresses: autour } = await adressesDeLaParcelle(adresses);
  const siennes = new Set(adresses.map((a) => cleImmeuble(a.libelle)));
  const out: PropositionParcelle[] = [];
  for (const a of autour) {
    if (siennes.has(a.cle)) continue;
    const { rows } = await query<{ cle: string; libelle: string; syndic_id: string | null; syndic_nom: string | null; syndic_ville: string | null }>(
      `SELECT c.cle_immeuble AS cle, c.libelle, s.id::text AS syndic_id, s.nom AS syndic_nom, s.ville AS syndic_ville
         FROM gestion_copropriete c
         LEFT JOIN gestion_copropriete_syndic cs ON cs.copropriete_id = c.id AND cs.fin IS NULL
         LEFT JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL
        WHERE c.cle_immeuble = $1 OR c.id = (SELECT x.copropriete_id FROM gestion_copropriete_adresse x WHERE x.cle_immeuble = $1 AND x.retire_le IS NULL ORDER BY x.id LIMIT 1)
        LIMIT 1`, [a.cle]);
    const c = rows[0];
    const prise = c !== undefined && c.cle !== cleCopro;
    out.push({ libelle: a.libelle, codePostal: a.codePostal, commune: a.commune, parcelle: a.parcelle, etat: prise ? 'prise' : 'libre',
      copropriete: prise ? c.libelle : null, syndic: prise && c.syndic_id !== null ? { id: Number(c.syndic_id), nom: c.syndic_nom ?? '', ville: c.syndic_ville } : null });
  }
  return out;
}
