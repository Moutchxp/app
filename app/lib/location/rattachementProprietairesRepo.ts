import { query } from '../db/client';
import { sqlPersonneVivante } from '../gestion/personneVivanteSql';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { lireCartesDuBien, poserCarteAlaMain, poserCategorieAlaMain, type LigneCarte } from '../gestion/partieCategorieRepo';
import type { Auteur } from '../gestion/gestes';
import { sqlBienDuPortefeuille, sqlDansPortefeuille } from './portefeuilleRepo';
import { contactsUniques, type ContactProprietaire, type PersonneProprietaire, type PersonnesARattacher } from './rattachementProprietaires';
export type { ContactProprietaire, PersonneProprietaire, PersonnesARattacher } from './rattachementProprietaires';

/**
 * ══ 🔴🔴 TUILE LOCATION — « QUI RATTACHER À CE BIEN ? » (Arno, 18/10/2026). IMPUR (base), LECTURE SEULE sauf
 * `rattacherContactsExistants`. ════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les personnes propriétaires LIÉES = les propriétaires (principal, ou co-propriétaire en cours — migration 278) des biens
 * du portefeuille que possède la personne choisie. Les CONTACTS = les cartes « contact du propriétaire » vivantes posées
 * sur les biens de ces personnes, lues par la lecture de la Gestion (`lireCartesDuBien`). Seules les fiches vivantes et
 * dans le portefeuille sont proposées (une fiche archivée ne peut pas devenir propriétaire d'un bien).
 * 🔴 Aucune donnée de personne n'est jamais modifiée ici.
 */

const MAX = 20;

/** Les biens du portefeuille (annexes exclues) d'une liste de propriétaires : id, clé de carte, adresse, propriétaires. */
async function biensDe(ids: readonly number[]): Promise<{ id: number; cle: string; adresse: string; proprietaires: number[] }[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<{ id: string; cle: string; adresse: string | null; commune: string | null; proprietaires: string[] }>(
    `SELECT lo.id::text, lo.wippimmo_id AS cle, lo.adresse, lo.commune,
            array_remove(array_cat(ARRAY[lo.proprietaire_id::text],
              coalesce((SELECT array_agg(lp.proprietaire_id::text) FROM gestion_annuaire_lot_proprietaire lp WHERE lp.lot_id = lo.id AND lp.jusqu_a IS NULL), '{}')), NULL) AS proprietaires
       FROM gestion_annuaire_lot lo
      WHERE (lo.proprietaire_id = ANY($1::bigint[])
             OR lo.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.proprietaire_id = ANY($1::bigint[]) AND lp.jusqu_a IS NULL))
        AND ${await sqlBienDuPortefeuille('lo')}
        AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe a WHERE a.annexe_id = lo.id)
      ORDER BY lo.id LIMIT 200`, [ids]);
  return rows.map((r) => ({
    id: Number(r.id), cle: r.cle, adresse: [r.adresse, r.commune].filter((x) => (x ?? '').trim() !== '').join(', '), proprietaires: r.proprietaires.map(Number),
  }));
}

/** Les cartes des propriétaires désignés (vivants, dans le portefeuille), dans l'ordre demandé. */
export async function cartesDeProprietaires(ids: readonly number[]): Promise<PersonneProprietaire[]> {
  const propres = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX);
  if (propres.length === 0) return [];
  const vivante = await sqlPersonneVivante('p');
  const coordVivante = await conditionCoordonneeVivante('c');
  const { rows } = await query<{ id: string; nom: string; telephone: string | null; email: string | null }>(
    `SELECT p.id::text, p.nom_complet AS nom,
            (SELECT c.valeur FROM gestion_annuaire_contact c WHERE c.sujet = 'proprietaire' AND c.sujet_id = p.id AND c.sorte = 'telephone'
                AND c.absent_le IS NULL${coordVivante} ORDER BY c.id LIMIT 1) AS telephone,
            (SELECT c.valeur FROM gestion_annuaire_contact c WHERE c.sujet = 'proprietaire' AND c.sujet_id = p.id AND c.sorte = 'email'
                AND c.absent_le IS NULL${coordVivante} ORDER BY c.id LIMIT 1) AS email
       FROM gestion_annuaire_proprietaire p WHERE p.id = ANY($1::bigint[]) AND ${vivante}${await sqlDansPortefeuille('p')}`, [propres]);
  const biens = await biensDe(propres);
  return propres.map((id) => rows.find((r) => Number(r.id) === id)).filter((r) => r !== undefined).map((r) => ({
    id: Number(r.id), nom: r.nom, telephone: r.telephone, email: r.email,
    biens: [...new Set(biens.filter((b) => b.proprietaires.includes(Number(r.id))).map((b) => b.adresse))],
  }));
}

const nomDeCarte = (c: LigneCarte): string =>
  [c.civilite, (c.nom ?? '').trim() === '' ? null : (c.nom ?? '').toUpperCase(), c.prenom].filter((x) => (x ?? '').trim() !== '').join(' ') || c.adresse;

/** Les cartes « contact du propriétaire » vivantes posées sur les biens des propriétaires désignés. */
async function contactsDeProprietaires(ids: readonly number[]): Promise<{ contact: ContactProprietaire; carte: LigneCarte }[]> {
  const biens = await biensDe(ids);
  const r: { contact: ContactProprietaire; carte: LigneCarte }[] = [];
  for (const b of biens) {
    for (const c of await lireCartesDuBien(b.cle)) {
      if (c.cote !== 'proprietaire') continue;
      const deja = r.find((x) => x.contact.email.toLowerCase() === c.adresse.toLowerCase());
      if (deja !== undefined) { if (!deja.contact.biens.includes(b.adresse)) deja.contact.biens.push(b.adresse); continue; }
      r.push({ carte: c, contact: {
        id: c.id, lotId: b.id, email: c.adresse, nom: nomDeCarte(c), qualite: c.qualite, biens: [b.adresse],
        telephone: c.coordonnees.find((k) => k.sorte === 'telephone')?.valeur ?? c.telephone,
      } });
    }
  }
  return r;
}

/** « Qui rattacher à ce bien ? » : la personne choisie, les personnes propriétaires liées, leurs contacts. LECTURE SEULE. */
export async function personnesARattacher(choisie: number): Promise<PersonnesARattacher | null> {
  const { rows } = await query<{ id: string }>(
    `WITH lots AS (
       SELECT lo.id FROM gestion_annuaire_lot lo
        WHERE (lo.proprietaire_id = $1 OR lo.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.proprietaire_id = $1 AND lp.jusqu_a IS NULL))
          AND ${await sqlBienDuPortefeuille('lo')})
     SELECT lo.proprietaire_id::text AS id FROM gestion_annuaire_lot lo JOIN lots USING (id) WHERE lo.proprietaire_id IS NOT NULL
     UNION
     SELECT lp.proprietaire_id::text FROM gestion_annuaire_lot_proprietaire lp JOIN lots ON lots.id = lp.lot_id WHERE lp.jusqu_a IS NULL`, [choisie]);
  const lies = rows.map((r) => Number(r.id)).filter((id) => id !== choisie).sort((a, b) => a - b);
  const proprietaires = await cartesDeProprietaires([choisie, ...lies]);
  if (!proprietaires.some((p) => p.id === choisie)) return null;
  const contacts = contactsUniques((await contactsDeProprietaires(proprietaires.map((p) => p.id))).map((x) => x.contact));
  return { choisie, proprietaires, contacts };
}

/** AVANT toute écriture : chaque contact coché est bien une carte des biens de ces propriétaires. `null` = valide. */
export async function refusContactsExistants(carteIds: readonly number[], proprietaireIds: readonly number[]): Promise<string | null> {
  const voulues = new Set(carteIds.filter((n) => Number.isInteger(n) && n > 0));
  if (voulues.size === 0) return null;
  const connues = (await contactsDeProprietaires(proprietaireIds)).filter((x) => voulues.has(x.contact.id));
  return connues.length === voulues.size ? null : 'Un contact coché n’est plus rattaché à ces propriétaires dans la Gestion : retirez-le.';
}

/**
 * À l'enregistrement du bien : les contacts EXISTANTS cochés sont rattachés comme « contact du propriétaire » sur CE bien,
 * par la porte de la Gestion (`poserCategorieAlaMain` puis `poserCarteAlaMain`, la fiche de la carte d'origine recopiée).
 * Seules les cartes posées sur les biens des propriétaires du nouveau bien sont acceptées. La carte d'origine n'est pas
 * touchée. Rend le nombre posé, ou le motif.
 */
export async function rattacherContactsExistants(lotCle: string, carteIds: readonly number[], proprietaireIds: readonly number[], auteur: Auteur):
  Promise<{ ok: true; n: number } | { ok: false; motif: string }> {
  const voulues = new Set(carteIds.filter((n) => Number.isInteger(n) && n > 0));
  if (voulues.size === 0) return { ok: true, n: 0 };
  const connues = (await contactsDeProprietaires(proprietaireIds)).filter((x) => voulues.has(x.contact.id));
  if (connues.length !== voulues.size) return { ok: false, motif: 'Un contact coché n’est plus rattaché à ces propriétaires dans la Gestion.' };
  let n = 0;
  for (const { carte: c } of connues) {
    const range = await poserCategorieAlaMain({ adresse: c.adresse, lotCle, categorie: 'proprietaire', auteur });
    if (!range.ok) return { ok: false, motif: `${nomDeCarte(c)} : ${range.motif}` };
    const pose = await poserCarteAlaMain({
      lotCle, cote: 'proprietaire', adresse: c.adresse, nom: c.nom, telephone: c.telephone, auteur,
      fiche: { civilite: c.civilite, prenom: c.prenom, qualite: c.qualite, adressePostale: c.adressePostale, codePostal: c.codePostal,
        commune: c.commune, note: c.note, coordonnees: c.coordonnees },
    });
    if (!pose.ok) return { ok: false, motif: `${nomDeCarte(c)} : ${pose.motif}` };
    n += 1;
  }
  return { ok: true, n };
}
