import { query, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { civiliteLue, cleImmeuble, type ContactImmeubleLu, type SyndicSaisi } from './syndics';

/**
 * ══ 🔴 LOT COPRO-CONTACTS-IMMEUBLE — LE CARNET DE CONTACTS PROPRE À CHAQUE IMMEUBLE ════════════════════════════════
 *
 * ARNO : « un petit carnet de contacts PROPRE À CHAQUE IMMEUBLE (gardien, conseil syndical…), totalement indépendant
 * du syndic ». Rattachés à la COPROPRIÉTÉ (table 333), jamais au syndic : un retrait ou un changement de syndic ne les
 * touche pas. Retrait HISTORISÉ, jamais d'effacement. Aucune ligne de journal.
 */

const nul = (s: string): string | null => (s.trim() === '' ? null : s.trim());

/** Les contacts EN COURS d'un immeuble (désigné par son libellé ou sa clé), avec leurs coordonnées. LECTURE SEULE. */
export async function contactsDeLImmeuble(immeuble: string): Promise<ContactImmeubleLu[]> {
  const cle = cleImmeuble(immeuble);
  if (cle === '') return [];
  const { rows } = await query<{
    id: string; categorie: ContactImmeubleLu['categorie']; libelle: string | null; civilite: string | null;
    prenom: string | null; nom: string | null; note: string | null;
    coordonnees: Array<{ id: number; sorte: 'email' | 'telephone'; libelle: string | null; valeur: string }> | null;
  }>(
    `SELECT ct.id::text, ct.categorie, ct.libelle, ct.civilite, ct.prenom, ct.nom, ct.note,
            (SELECT json_agg(json_build_object('id', k.id, 'sorte', k.sorte, 'libelle', k.libelle, 'valeur', k.valeur) ORDER BY k.rang, k.id)
               FROM gestion_copropriete_contact_coordonnee k WHERE k.contact_id = ct.id AND k.retire_le IS NULL) AS coordonnees
       FROM gestion_copropriete_contact ct JOIN gestion_copropriete c ON c.id = ct.copropriete_id
      WHERE ct.retire_le IS NULL
        AND (c.cle_immeuble = $1 OR c.id = (SELECT a.copropriete_id FROM gestion_copropriete_adresse a WHERE a.cle_immeuble = $1 AND a.retire_le IS NULL))
      ORDER BY ct.rang, ct.id`, [cle]);
  return rows.map((r) => ({
    id: Number(r.id), categorie: r.categorie, libelle: r.libelle, civilite: civiliteLue(r.civilite) ?? null,
    prenom: r.prenom, nom: r.nom, note: r.note, coordonnees: (r.coordonnees ?? []).map((k) => ({ ...k, id: Number(k.id) })),
  }));
}

/**
 * L'écriture, DANS la transaction de la fiche (`enregistrerSyndic`) : la saisie porte la liste ENTIÈRE des contacts de
 * l'immeuble. Ceux d'un identifiant connu DE CET IMMEUBLE sont mis à jour, les nouveaux insérés, les absents RETIRÉS
 * (`retire_le`, qui) ; même règle pour leurs coordonnées. L'immeuble est déclaré s'il ne l'est pas encore.
 */
export async function enregistrerContactsImmeuble(q: RequeteTx, saisie: NonNullable<SyndicSaisi['contactsImmeuble']>,
  auteur: Auteur): Promise<void> {
  // LOT COPRO-PLUSIEURS-ADRESSES — une adresse SECONDAIRE désigne sa copropriété (le carnet est partagé).
  const { rows: sec } = await q<{ cle: string }>(
    `SELECT c.cle_immeuble AS cle FROM gestion_copropriete_adresse a JOIN gestion_copropriete c ON c.id = a.copropriete_id
      WHERE a.cle_immeuble = $1 AND a.retire_le IS NULL`, [cleImmeuble(saisie.immeuble)]);
  const cle = sec[0]?.cle ?? cleImmeuble(saisie.immeuble);
  await q(
    `INSERT INTO gestion_copropriete (cle_immeuble, libelle, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4)
     ON CONFLICT (cle_immeuble) DO NOTHING`, [cle, saisie.immeuble.trim(), auteur.id, auteur.libelle]);
  const { rows: copro } = await q<{ id: string }>(`SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = $1`, [cle]);
  const coproId = copro[0]?.id;
  if (coproId === undefined) return;
  const { rows: existants } = await q<{ id: string }>(
    `SELECT id::text FROM gestion_copropriete_contact WHERE copropriete_id = $1 AND retire_le IS NULL FOR UPDATE`, [coproId]);
  const ids = new Set(existants.map((r) => Number(r.id)));
  const gardes = new Set<number>();
  for (const [rang, c] of saisie.contacts.entries()) {
    const champs = [c.categorie, c.categorie === 'personnalise' ? nul(c.libelle) : null, c.civilite, nul(c.prenom), nul(c.nom), nul(c.note), rang];
    let contactId: number;
    if (c.id != null && ids.has(c.id)) {
      contactId = c.id;
      gardes.add(contactId);
      await q(
        `UPDATE gestion_copropriete_contact SET categorie = $2, libelle = $3, civilite = $4, prenom = $5, nom = $6, note = $7, rang = $8,
                maj_le = now(), maj_par_libelle = $9
          WHERE id = $1`, [contactId, ...champs, auteur.libelle]);
    } else {
      const { rows } = await q<{ id: string }>(
        `INSERT INTO gestion_copropriete_contact (copropriete_id, categorie, libelle, civilite, prenom, nom, note, rang, cree_par, cree_par_libelle)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id::text`, [coproId, ...champs, auteur.id, auteur.libelle]);
      contactId = Number(rows[0]?.id);
    }
    const { rows: kx } = await q<{ id: string }>(
      `SELECT id::text FROM gestion_copropriete_contact_coordonnee WHERE contact_id = $1 AND retire_le IS NULL`, [contactId]);
    const kIds = new Set(kx.map((r) => Number(r.id)));
    const kGardes = new Set<number>();
    for (const [kr, k] of c.coordonnees.entries()) {
      if (k.id != null && kIds.has(k.id)) {
        kGardes.add(k.id);
        await q(`UPDATE gestion_copropriete_contact_coordonnee SET sorte = $2, libelle = $3, valeur = $4, rang = $5 WHERE id = $1`,
          [k.id, k.sorte, nul(k.libelle), k.valeur, kr]);
      } else {
        await q(`INSERT INTO gestion_copropriete_contact_coordonnee (contact_id, sorte, libelle, valeur, rang) VALUES ($1, $2, $3, $4, $5)`,
          [contactId, k.sorte, nul(k.libelle), k.valeur, kr]);
      }
    }
    const kRetires = [...kIds].filter((x) => !kGardes.has(x));
    if (kRetires.length > 0) {
      await q(`UPDATE gestion_copropriete_contact_coordonnee SET retire_le = now() WHERE id = ANY($1::bigint[])`, [kRetires]);
    }
  }
  const retires = [...ids].filter((x) => !gardes.has(x));
  if (retires.length > 0) {
    // « Retirer de l'immeuble » : historisé, jamais effacé ; ses coordonnées partent avec lui.
    await q(`UPDATE gestion_copropriete_contact SET retire_le = now(), retire_par_libelle = $2 WHERE id = ANY($1::bigint[])`,
      [retires, auteur.libelle]);
    await q(`UPDATE gestion_copropriete_contact_coordonnee SET retire_le = now() WHERE contact_id = ANY($1::bigint[]) AND retire_le IS NULL`, [retires]);
  }
}
