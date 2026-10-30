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

/**
 * 🔴 LOT BX — ANNULER un reclassement (`transaction:reclasser-retro --annuler --ventes=…`), pour UNE vente, dans une transaction : la commission
 * posée par le reclassement (note « reclassement LOT BV : rétrocession(s) n° … ») est RETIRÉE (`retire_le`), les rétrocessions qu'elle nomme sont
 * RÉTABLIES (`retire_le` remis à vide), chaque geste au journal. Rien n'est supprimé ; l'état d'avant le reclassement revient à l'identique.
 */
export async function annulerReclassement(o: { venteId: number; auteur: string }): Promise<{ ok: true; ligneIds: number[]; retroIds: number[] } | { ok: false; motif: string }> {
  return withTransaction(async (q) => {
    const { rows: ls } = await q<{ id: string; note: string; negociateur: string; montant: string }>(
      `SELECT id::text, note, negociateur, montant_ttc::text AS montant FROM transaction_vente_ligne
        WHERE vente_id = $1 AND role = 'negociateur' AND retire_le IS NULL AND note LIKE 'reclassement LOT BV : rétrocession(s) n° %' FOR UPDATE`, [o.venteId]);
    if (ls.length === 0) return { ok: false as const, motif: `vente ${o.venteId} : aucun reclassement actif — rien n’est écrit.` };
    const retroIds = [...new Set(ls.flatMap((l) => (/n° ([\d, ]+)/.exec(l.note)?.[1] ?? '').split(',').map((x) => Number(x.trim())).filter((x) => Number.isSafeInteger(x) && x > 0)))];
    const commentaire = `annulation du reclassement LOT BV (LOT BX) : vente ${o.venteId}`;
    const journal = (entite: string, id: number, action: string, avant: unknown, apres: unknown) => q(
      `INSERT INTO transaction_journal (entite, entite_id, action, avant, apres, commentaire, auteur_id, auteur_libelle) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, NULL, $7)`,
      [entite, id, action, avant === null ? null : JSON.stringify(avant), apres === null ? null : JSON.stringify(apres), commentaire, o.auteur]);
    for (const l of ls) {
      await q('UPDATE transaction_vente_ligne SET retire_le = now(), retire_par_libelle = $2 WHERE id = $1', [l.id, o.auteur]);
      await journal('vente_ligne', Number(l.id), 'retirer', { negociateur: l.negociateur, montant_ttc: Number(l.montant) }, null);
    }
    const { rows: rs } = await q<{ id: string; montant: string }>(
      'UPDATE transaction_retrocession SET retire_le = NULL, retire_par_libelle = NULL WHERE id = ANY($1::bigint[]) AND vente_id = $2 AND retire_le IS NOT NULL RETURNING id::text, montant_ttc::text AS montant',
      [retroIds, o.venteId]);
    for (const r of rs) await journal('retrocession', Number(r.id), 'retablir', null, { montant_ttc: Number(r.montant) });
    return { ok: true as const, ligneIds: ls.map((l) => Number(l.id)), retroIds: rs.map((r) => Number(r.id)) };
  });
}
