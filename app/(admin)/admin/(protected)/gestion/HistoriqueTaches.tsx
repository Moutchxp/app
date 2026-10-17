'use client';

import { useCallback, useEffect, useState } from 'react';
import { dateMissionTache, historiqueDesTaches, invitesAcceptants, versTacheFrise, type TacheFrise } from '../../../../lib/gestion/tacheFrise';
import { DeclencheurBulleTache } from './PointTacheFrise';
import { FenetreTache } from './FenetreTache';
import { ecouterTaches, lireTaches } from './tachesClient';

/**
 * ══ 🔴🔴 LOT GESTION-HISTORIQUE-TACHES (Arno, 17/10/2026) — « HISTORIQUE DES TÂCHES (N) » DANS L'HISTORIQUE DU BIEN ═══
 *
 * ARNO : « dès qu'au moins une tâche validée est rattachée au bien, ajoute une ligne “Historique des tâches (N)” dans
 * l'historique du bien, même style que les autres lignes repliables. Au clic, elle se déplie et liste toutes les tâches
 * validées de ce bien, de la plus récente à la plus ancienne (date de la mission), une ligne par tâche : date de la
 * mission, titre, invités qui ont accepté, état (acceptée / réalisée). Au survol, la même bulle récapitulative que dans
 * la frise ; au clic, ouvre la tâche. Sans aucune tâche validée : la ligne n'apparaît pas. »
 *
 * 🔴 LE GABARIT EST CELUI DES BANDES DE L'HISTORIQUE (`hdb-groupe`, `hdb-groupe-tete`, `hdb-replier`, triangle, compteur) ;
 * la bulle est la MÊME que celle du point de la frise (`DeclencheurBulleTache`) ; la règle « validée » vient du module pur
 * (`tacheValidee`). Repliée par défaut. Relue après chaque geste sur une tâche.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export function HistoriqueTaches({ lotId }: { lotId: number }) {
  const [taches, setTaches] = useState<TacheFrise[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);

  const charger = useCallback(async () => {
    const r = await lireTaches(lotId);
    setTaches(r.etat === 'ok' ? historiqueDesTaches(r.taches.map(versTacheFrise)) : []);
  }, [lotId]);
  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => ecouterTaches(() => { void charger(); }), [charger]);

  if (taches === null || taches.length === 0) return null;
  return (
    <section className="hdb-groupe hdb-groupe--bande hdb-groupe--taches" data-historique-taches>
      <style>{CSS_HISTORIQUE_TACHES}</style>
      <div className="hdb-groupe-tete">
        <button type="button" className="hdb-replier" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          Historique des tâches
          <span className="gst-compte">{taches.length}</span>
        </button>
      </div>
      {ouvert && (
        <ul className="hdt-liste">
          {taches.map((t) => {
            const acceptants = invitesAcceptants(t);
            const etat = t.etat === 'faite' ? 'Réalisée' : 'Acceptée';
            return (
              <li key={t.id} className="hdt-ligne">
                <DeclencheurBulleTache t={t} onOuvrir={setDetail} className="hdt-declencheur"
                  libelle={`Tâche « ${t.objet} » — ${dateMissionTache(t.jour, t.heure, t.dureeMinutes)} — ${etat}`}
                  donnees={{ 'data-tache-historique': t.id }}>
                  <span className="hdt-date">{dateMissionTache(t.jour, t.heure, t.dureeMinutes)}</span>
                  <span className="hdt-titre">{t.objet}</span>
                  <span className="hdt-invites">{acceptants.join(', ')}</span>
                  <span className={`hdt-etat hdt-etat--${t.etat === 'faite' ? 'faite' : 'acceptee'}`}>{etat}</span>
                </DeclencheurBulleTache>
              </li>
            );
          })}
        </ul>
      )}
      {detail !== null && <FenetreTache mode={{ sorte: 'detail', id: detail }} onFermer={() => setDetail(null)} />}
    </section>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons seulement (Clair et Sombre). Une ligne par tache ; sur telephone, les
   quatre informations passent les unes sous les autres. */
export const CSS_HISTORIQUE_TACHES = `
.hdt-liste{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.hdt-declencheur{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .75rem;width:100%;min-height:44px;padding:.4rem .6rem;
  box-sizing:border-box;text-align:left;font:inherit;font-size:.86rem;color:var(--color-svv-ink);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line);border-radius:.5rem;cursor:pointer}
.hdt-declencheur:hover{border-color:var(--color-svv-line-strong)}
.hdt-declencheur:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.hdt-date{font-weight:600;white-space:nowrap}
.hdt-titre{font-weight:600;flex:1 1 12rem;min-width:0;overflow-wrap:anywhere}
.hdt-invites{color:var(--color-svv-muted);overflow-wrap:anywhere}
.hdt-etat{font-size:.78rem;font-weight:700;border-radius:999px;padding:1px 8px;border:1px solid currentColor}
.hdt-etat--acceptee{color:var(--color-svv-green-ink)}
.hdt-etat--faite{color:var(--color-svv-muted)}
`;
