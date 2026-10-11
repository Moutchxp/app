import { query } from '../db/client';
import { etatDesCartes } from './partieCategorieRepo';

/**
 * ══ 🔴🔴 LOT INVARIANT-HISTORIQUE-INALTERABLE — « ANCIEN CONTACT » ════════════════════════════════════════════════════
 * ⚠️ PAS DE `import 'server-only'` ICI — convention du module.
 *
 * ARNO : « Si le contact a été supprimé ou est parti, on affiche le nom et l'adresse tels qu'ils figurent dans le mail,
 * avec la mention grise “ancien contact” et une pastille grise. »
 *
 * 🔴 L'HISTORIQUE NE DÉPEND PAS DE CETTE LECTURE : le mail est là de toute façon (son nom et son adresse viennent du
 * MAIL). Cette lecture ne fait qu'AJOUTER une mention. Une adresse est un « ancien contact » quand elle a été celle
 * d'un contact — client, carte de contact, contact de syndic, carnet d'immeuble — et qu'aucun contact EN COURS ne la
 * porte plus. LECTURE SEULE.
 */
export async function anciensContactsParmi(adresses: readonly string[]): Promise<string[]> {
  const liste = [...new Set(adresses.map((a) => (a ?? '').trim().toLowerCase()).filter((a) => a !== ''))];
  if (liste.length === 0) return [];
  const { rows } = await query<{ adresse: string; actif: boolean }>(
    `WITH tout AS (
       SELECT lower(btrim(c.valeur)) AS adresse, (c.absent_le IS NULL AND c.archive_le IS NULL) AS actif
         FROM gestion_annuaire_contact c WHERE c.sorte = 'email'
       UNION ALL
       SELECT lower(btrim(k.valeur)), (k.retire_le IS NULL AND ct.retire_le IS NULL AND ct.parti_le IS NULL AND s.supprime_le IS NULL)
         FROM gestion_syndic_coordonnee k
         JOIN gestion_syndic_contact ct ON ct.id = k.contact_id
         JOIN gestion_syndic s ON s.id = ct.syndic_id
        WHERE k.sorte = 'email'
       UNION ALL
       SELECT lower(btrim(s.email)), s.supprime_le IS NULL FROM gestion_syndic s WHERE coalesce(btrim(s.email), '') <> ''
       UNION ALL
       SELECT lower(btrim(k.valeur)), (k.retire_le IS NULL AND ct.retire_le IS NULL)
         FROM gestion_copropriete_contact_coordonnee k
         JOIN gestion_copropriete_contact ct ON ct.id = k.contact_id
        WHERE k.sorte = 'email'
     )
     SELECT adresse, bool_or(actif) AS actif FROM tout WHERE adresse = ANY($1::text[]) GROUP BY adresse`, [liste]);
  // Les cartes de contact d'un bien sont lues par LEUR dépôt (règle du module : une table, un dépôt).
  const cartes = await etatDesCartes(liste);
  const actif = new Map<string, boolean>();
  for (const r of [...rows, ...cartes]) actif.set(r.adresse, (actif.get(r.adresse) ?? false) || r.actif);
  return [...actif].filter(([, a]) => !a).map(([adresse]) => adresse).sort();
}
