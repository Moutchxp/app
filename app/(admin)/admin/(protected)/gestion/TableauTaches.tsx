'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  compterTaches, filtrerTaches, MOT_COMPTEUR, ORDRE_COULEURS, repartirTaches,
  type FiltreTaches, type Tache,
} from '../../../../lib/gestion/taches';
import { CSS_TACHES, LigneTache, useMaintenant } from './LigneTache';
import { FenetreTache } from './FenetreTache';
import { ecouterTaches, lireTaches } from './tachesClient';

/**
 * ══ 🔴🔴 LOT TACHES-1 — LE RÉCAPITULATIF GÉNÉRAL, SUR L'ÉCRAN PARTAGÉ DE LA TUILE GESTION ═══════════════════════
 *
 * Arno : « un tableau de TOUTES les tâches de TOUS les biens, avec le même code couleur. Chaque ligne : couleur,
 * date (et heure), objet, adresse du bien (cliquable vers la fiche), personne à qui la tâche est confiée. Filtre
 * “Toutes / Les miennes” (Toutes par défaut). Compteurs en tête : en retard / du jour / 2 jours / plus tard. »
 *
 * 🔴 POSÉ TOUT EN BAS DE L'ÉCRAN PARTAGÉ, SOUS « Échanges sans événement » : c'est la seule place qui ne déplace,
 * ne rétrécit ni ne masque rien (boîte mail à gauche, événements à droite, annuaire au-dessus restent au pixel
 * près). Le placer plus haut aurait poussé les deux colonnes vers le bas.
 *
 * 🔴 LA LIGNE EST `LigneTache`, LA MÊME QUE SUR LA FICHE DU BIEN : même couleur, mêmes gestes, même signal. Une tâche
 * marquée faite ici se grise aussi sur la fiche ouverte ailleurs.
 *
 * ⚠️ SANS LA MIGRATION 346, NE REND RIEN. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export function TableauTaches({ onOuvrirBien }: { onOuvrirBien: (lotId: number) => void }) {
  const maintenant = useMaintenant();
  const [donnees, setDonnees] = useState<{ taches: Tache[]; moi: number | null; tronque: boolean } | null>(null);
  const [installe, setInstalle] = useState(true);
  const [filtre, setFiltre] = useState<FiltreTaches>('toutes');
  const [detail, setDetail] = useState<number | null>(null);

  const charger = useCallback(async () => {
    const r = await lireTaches(null);
    if (r.etat === 'sans_schema') { setInstalle(false); return; }
    if (r.etat === 'ok') setDonnees({ taches: r.taches, moi: r.moi, tronque: r.tronque });
    else setDonnees((d) => d ?? { taches: [], moi: null, tronque: false });
  }, []);

  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => ecouterTaches(() => { void charger(); }), [charger]);

  if (!installe || donnees === null) return null;
  const visibles = filtrerTaches(donnees.taches, filtre, donnees.moi);
  const { ouvertes, terminees } = repartirTaches(visibles, maintenant);
  const n = compterTaches(ouvertes, maintenant);

  return (
    <section className="tch-tableau" aria-labelledby="tch-tableau-titre">
      <style>{CSS_TACHES}{CSS_TABLEAU}</style>
      <div className="tch-tableau-tete">
        <h2 className="gst-titre" id="tch-tableau-titre">
          Tâches <span className="gst-compte">{ouvertes.length}</span>
        </h2>
        <div className="tch-filtre" role="group" aria-label="Quelles tâches">
          {(['toutes', 'miennes'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filtre === f}
              className={`tch-filtre-btn${filtre === f ? ' tch-filtre-btn--actif' : ''}`} onClick={() => setFiltre(f)}>
              {f === 'toutes' ? 'Toutes' : 'Les miennes'}
            </button>
          ))}
        </div>
      </div>
      <ul className="tch-compteurs" aria-label="Compteurs des tâches">
        {ORDRE_COULEURS.map((c) => (
          <li key={c} className="tch-compteur">
            <span className={`tch-pastille tch-pastille--${c}`} aria-hidden="true" />
            <b>{n[c]}</b> {MOT_COMPTEUR[c]}
          </li>
        ))}
      </ul>
      {donnees.tronque && <p className="gst-tronc">La liste est tronquée : toutes les tâches ne sont pas affichées.</p>}
      {ouvertes.length === 0
        ? <p className="tch-vide">{filtre === 'miennes' ? 'Aucune tâche à faire ne vous est confiée.' : 'Aucune tâche à faire.'} Une tâche se crée depuis la fiche d’un bien (« + Tâche »).</p>
        : (
          <ul className="tch-liste">
            {ouvertes.map((t) => (
              <LigneTache key={t.id} tache={t} maintenant={maintenant} avecAdresse onOuvrirBien={onOuvrirBien}
                onDetail={setDetail} />
            ))}
          </ul>
        )}
      {terminees.length > 0 && (
        <details className="tch-terminees">
          <summary>Faites ou annulées ({terminees.length})</summary>
          <ul className="tch-liste">
            {terminees.map((t) => (
              <LigneTache key={t.id} tache={t} maintenant={maintenant} avecAdresse onOuvrirBien={onOuvrirBien}
                onDetail={setDetail} />
            ))}
          </ul>
        </details>
      )}
      {detail !== null && <FenetreTache mode={{ sorte: 'detail', id: detail }} onFermer={() => setDetail(null)} />}
    </section>
  );
}

/* ⚠️ CSS DANS UN GABARIT : jamais d'accent grave dans un commentaire ci-dessous. */
const CSS_TABLEAU = `
.tch-tableau{display:flex;flex-direction:column;gap:8px;margin:18px 0 8px;padding:14px;
  border:1px solid var(--color-svv-line-strong);border-radius:14px;background:var(--color-svv-surface)}
.tch-tableau-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.tch-tableau-tete .gst-titre{margin:0}
.tch-filtre{display:inline-flex;border:1px solid var(--color-svv-line-strong);border-radius:999px;overflow:hidden}
.tch-filtre-btn{min-height:40px;padding:0 .9rem;border:0;background:var(--color-svv-surface);color:var(--color-svv-ink);
  font:inherit;font-size:.85rem;cursor:pointer}
.tch-filtre-btn--actif{background:var(--color-svv-ink);color:var(--color-svv-surface);font-weight:700}
.tch-filtre-btn:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
`;
