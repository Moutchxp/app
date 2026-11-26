import { query, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { ficheCopropriete } from './coproprieteRepo';
import { adresseImmeuble, cleImmeuble, nomAvecVille } from './syndics';
import { noterRetraitDAdressesRegroupees } from './regroupementCoproprietesRepo';
import { resumeAdresse } from './adresseCoproGestes';
import { cleComparable, codesPostauxCompatibles, nomCopropriete, type ConflitAdresse } from './adresseCoproExclusivite';
export type { ConflitAdresse } from './adresseCoproExclusivite';

/**
 * ══ 🔴🔴 LE CONFLIT D'ADRESSE ENTRE DEUX COPROPRIÉTÉS — LA LECTURE ET LE DÉPLACEMENT (Arno, 26/11/2026, 12h50, point 2). IMPUR (base). ═══════════════
 * La lecture (`conflitDeLAdresse`) : la copropriété AUTRE que celle-ci qui porte déjà l'adresse (principale ou adresse en cours), par la clé de comparaison
 * (code postal compatible) ou par l'adresse officielle (BAN), avec ce qui partirait (digicodes, bâtiments) et les biens à cette adresse. Elle sert à
 * l'écran (au rattachement) ET au serveur (à l'enregistrement, dans la transaction : jamais d'adresse en double, même à deux personnes en même temps).
 * Le déplacement (`deplacerAdresse`) : la ligne de l'autre copropriété reçoit `retire_le` (jamais effacée), son regroupement est prévenu, les biens de
 * l'adresse perdent le syndic de l'autre copropriété (une ligne par bien), les bâtiments de l'adresse passent au registre de celle-ci, et les DEUX
 * historiques le notent. Les digicodes sont rangés par adresse : ils suivent l'adresse sans être réécrits.
 */

type Q = RequeteTx | typeof query;
interface Porteur { copro: string; cle_copro: string; libelle_copro: string; nom: string | null; ligne: string | null; cle: string; libelle: string; code_postal: string | null; commune: string | null; ban_id: string | null }

/** La copropriété AUTRE qui porte déjà cette adresse, ou `null`. `coproId` : celle-ci (absente : une fiche pas encore créée, désignée par `coproCle`). */
export async function conflitDeLAdresse(q: Q, ici: { coproId: number | null; coproCle: string },
  a: { libelle: string; codePostal?: string | null; banId?: string | null }): Promise<ConflitAdresse | null> {
  const k = cleComparable(a.libelle);
  if (k === '') return null;
  const { rows } = await q<Porteur>(
    `SELECT c.id::text AS copro, c.cle_immeuble AS cle_copro, c.libelle AS libelle_copro, c.nom, NULL::text AS ligne, c.cle_immeuble AS cle, c.libelle, c.code_postal, c.commune, c.ban_id
       FROM gestion_copropriete c WHERE ($1::bigint IS NULL OR c.id <> $1) AND c.cle_immeuble <> $2
     UNION ALL
     SELECT c.id::text, c.cle_immeuble, c.libelle, c.nom, a.id::text, a.cle_immeuble, a.libelle, coalesce(a.code_postal, c.code_postal), coalesce(a.commune, c.commune), a.ban_id
       FROM gestion_copropriete_adresse a JOIN gestion_copropriete c ON c.id = a.copropriete_id
      WHERE a.retire_le IS NULL AND ($1::bigint IS NULL OR c.id <> $1) AND c.cle_immeuble <> $2`, [ici.coproId, ici.coproCle]);
  const p = rows.find((r) => (cleComparable(r.libelle) === k || r.cle === cleImmeuble(a.libelle)) && codesPostauxCompatibles(r.code_postal, a.codePostal))
    ?? (a.banId ? rows.find((r) => r.ban_id !== null && r.ban_id === a.banId) : undefined);
  if (p === undefined) return null;
  const autre = await ficheCopropriete(p.cle_copro);
  const d = autre?.digicodes.find((x) => x.cle === p.cle);
  const r = resumeAdresse(d === undefined ? null : { commun: d.commun, batiments: d.batiments }, (autre?.biens ?? []).filter((x) => x.cle === p.cle));
  return { cle: p.cle, ecrite: adresseImmeuble(p.libelle, p.code_postal, p.commune),
    copropriete: { id: Number(p.copro), cle: p.cle_copro, libelle: p.libelle_copro, nom: p.nom, syndic: autre?.syndic ? nomAvecVille(autre.syndic.nom, autre.syndic.ville) : null },
    principale: p.ligne === null, biens: r.biens, digicodes: r.digicodes };
}

/** LE DÉPLACEMENT confirmé (« Oui, la rattacher ici et la retirer de … »), dans la transaction de l'enregistrement, AVANT l'ajout de l'adresse ici. */
export async function deplacerAdresse(q: RequeteTx, c: ConflitAdresse, vers: { id: string; libelle: string }, auteur: Auteur): Promise<void> {
  const { rows: [l] } = await q<{ id: string }>(
    'SELECT id::text FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND cle_immeuble = $2 AND retire_le IS NULL FOR UPDATE', [c.copropriete.id, c.cle]);
  if (l === undefined) return; // déjà partie entre-temps : rien à retirer
  await q('UPDATE gestion_copropriete_adresse SET retire_le = now(), retire_par_libelle = $2 WHERE id = $1', [l.id, auteur.libelle]);
  await noterRetraitDAdressesRegroupees(q, [l.id], `depuis la fiche copropriété (déplacée vers ${vers.libelle})`, auteur);
  // les biens de l'adresse perdent le syndic de l'autre copropriété
  const autre = await ficheCopropriete(c.copropriete.cle);
  if (autre?.syndic) {
    const syndic = nomAvecVille(autre.syndic.nom, autre.syndic.ville);
    for (const b of autre.biens.filter((x) => x.cle === c.cle)) {
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'syndic_retire', $2, $3, $4, $5)`,
        [b.id, syndic, `Syndic ${syndic} retiré de l’adresse ${c.ecrite} (déplacée de la copropriété ${nomCopropriete(c.copropriete)} vers ${vers.libelle}, depuis la fiche copropriété)`, auteur.id, auteur.libelle]);
    }
  }
  // les bâtiments de l'adresse : au registre de celle-ci (ceux de l'autre restent, rangés à une adresse qui n'est plus la sienne : ils n'y sont plus proposés)
  await q(`INSERT INTO gestion_copropriete_batiment (copropriete_id, batiment_cle, batiment_libelle, sorte, cree_par, cree_par_libelle, adresse_cle)
           SELECT $1, b.batiment_cle, b.batiment_libelle, b.sorte, $3, $4, b.adresse_cle FROM gestion_copropriete_batiment b WHERE b.copropriete_id = $2 AND b.adresse_cle = $5
           ON CONFLICT DO NOTHING`, [vers.id, c.copropriete.id, auteur.id, auteur.libelle, c.cle]);
  const parti = c.digicodes.length > 0 ? ` — digicodes et bâtiments partis avec elle : ${c.digicodes.join(' · ')}` : '';
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, 'adresse_cedee', $2, $3, $4, $5)`,
    [c.copropriete.id, c.cle, `Adresse retirée de la copropriété : ${c.ecrite}, rattachée à la copropriété ${vers.libelle}${parti}`, auteur.id, auteur.libelle]);
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, 'adresse_reprise', $2, $3, $4, $5)`,
    [vers.id, c.cle, `Adresse reprise de la copropriété ${nomCopropriete(c.copropriete)}${c.copropriete.syndic ? ` (syndic ${c.copropriete.syndic})` : ''} : ${c.ecrite}${parti}`, auteur.id, auteur.libelle]);
}
