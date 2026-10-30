// Pas de `import 'server-only'` : lu par la commande `transaction:reclasser-retro` (même convention que `repo.ts` de la tuile).
import { withTransaction } from '../db/client';

/**
 * 🔴 LOT BV — L'ÉCRITURE d'un reclassement « rétrocession → commission du négociateur » (`transaction:reclasser-retro --ecrire`), pour UNE vente,
 * dans une transaction : les rétrocessions sont relues sous verrou (toujours actives, même total), la commission est AJOUTÉE (ligne
 * « negociateur », origine « saisie », note qui dit d'où elle vient), les rétrocessions sont RETIRÉES (`retire_le`, jamais supprimées), et chaque
 * geste entre au journal (`transaction_journal`). Réversible : rien n'est effacé. N'est appelée que pour une vente que le plan dit reclassable.
 */
export async function reclasserRetroEnCommission(o: { venteId: number; retroIds: readonly number[]; negociateur: string; montantTtc: number; auteur: string }): Promise<{ ok: true; ligneId: number } | { ok: false; motif: string }> {
  return withTransaction(async (q) => {
    const { rows: rs } = await q<{ id: string; montant: string }>(
      'SELECT id, montant_ttc::text AS montant FROM transaction_retrocession WHERE id = ANY($1::bigint[]) AND vente_id = $2 AND retire_le IS NULL FOR UPDATE',
      [[...o.retroIds], o.venteId]);
    const total = rs.reduce((t, r) => t + Number(r.montant), 0);
    if (rs.length !== o.retroIds.length || Math.round(total * 100) !== Math.round(o.montantTtc * 100)) {
      return { ok: false as const, motif: `vente ${o.venteId} : les rétrocessions ont changé depuis le plan — rien n’est écrit.` };
    }
    const note = `reclassement LOT BV : rétrocession(s) n° ${o.retroIds.join(', ')} (ligne « Apporteur » du fichier) → commission de ${o.negociateur}`;
    const { rows } = await q<{ id: string }>(
      `INSERT INTO transaction_vente_ligne (vente_id, negociateur, role, montant_ttc, nature, compte, origine, note, cree_par_libelle)
       VALUES ($1, $2, 'negociateur', $3, 'vente', true, 'saisie', $4, $5) RETURNING id`, [o.venteId, o.negociateur, o.montantTtc, note, o.auteur]);
    const ligneId = Number(rows[0].id);
    await q('UPDATE transaction_retrocession SET retire_le = now(), retire_par_libelle = $2 WHERE id = ANY($1::bigint[]) AND retire_le IS NULL', [[...o.retroIds], o.auteur]);
    const journal = (entite: string, id: number, action: string, avant: unknown, apres: unknown) => q(
      `INSERT INTO transaction_journal (entite, entite_id, action, avant, apres, commentaire, auteur_id, auteur_libelle) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, NULL, $7)`,
      [entite, id, action, avant === null ? null : JSON.stringify(avant), apres === null ? null : JSON.stringify(apres), note, o.auteur]);
    for (const r of rs) await journal('retrocession', Number(r.id), 'retirer', { montant_ttc: Number(r.montant) }, null);
    await journal('vente_ligne', ligneId, 'ajouter', null, { vente_id: o.venteId, negociateur: o.negociateur, role: 'negociateur', montant_ttc: o.montantTtc });
    return { ok: true as const, ligneId };
  });
}
