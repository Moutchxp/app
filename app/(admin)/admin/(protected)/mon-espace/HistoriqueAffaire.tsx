'use client';

import { useEffect, useState } from 'react';
import { LIBELLE_ACTION, resume, type Geste } from '../transaction/FormulaireVente';
import { URL_JOURNAL } from './NouveauCompromis';

/**
 * 🔴 MON ESPACE, LOT 6 (Arno, 02/11/2026) — « Historique des modifications » d'une affaire, EN LECTURE : le journal existant de la tuile (en ajout
 * seul, verrouillé en base) — qui (nom figé), quand, quoi, avant → après — lu par /api/admin/mon-espace/journal (ses négociateurs et les
 * administrateurs ; un collaborateur n'y lit pas les commissions). Aucun « Annuler » ici : l'historique ne se modifie pas.
 */
export function HistoriqueAffaire({ id }: { id: number }) {
  const [gestes, setGestes] = useState<Geste[] | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(`${URL_JOURNAL}?id=${id}`, { cache: 'no-store' });
        const j = (await r.json()) as { etat?: string; motif?: string; data?: Geste[] };
        if (!vivant) return;
        if (j.etat === 'ok' && Array.isArray(j.data)) setGestes(j.data); else { setGestes([]); setMotif(j.motif ?? 'L’historique n’a pas pu être lu.'); }
      } catch { if (vivant) { setGestes([]); setMotif('L’historique n’a pas pu être lu.'); } }
    })();
    return () => { vivant = false; };
  }, [id]);
  return (
    <section className="mes-historique" aria-label="Historique des modifications" data-historique-mon-espace={id}>
      <h4>Historique des modifications</h4>
      {motif !== null && <p className="trx-erreur" role="alert">{motif}</p>}
      {gestes === null ? <p className="loc-muet">Chargement…</p> : gestes.length === 0 ? (motif === null && <p className="loc-muet">Aucune modification enregistrée.</p>) : (
        <ul className="trx-journal">
          {gestes.map((g) => (
            <li key={g.id} data-geste={g.id}>
              <strong>{LIBELLE_ACTION[g.action] ?? g.action}</strong> — {new Date(g.le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} — <span data-geste-auteur>{g.auteur}</span>
              <br /><span className="loc-muet">Avant : {resume(g.avant)} → après : {resume(g.apres)}</span>
              {g.commentaire && <><br /><span className="loc-muet">{g.commentaire}</span></>}
              {g.annulePar !== null && <span className="loc-pastille trx-pastilles">annulé</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
