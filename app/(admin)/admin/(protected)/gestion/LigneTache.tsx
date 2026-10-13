'use client';

import { useEffect, useState } from 'react';
import {
  couleurTache, dateLisibleTache, horodatageLisible, MOT_COULEUR, RACCOURCIS_DECALAGE,
  type Tache,
} from '../../../../lib/gestion/taches';
import { agirSurTache, type GesteTache } from './tachesClient';

/**
 * ══ 🔴🔴 LOT TACHES-1 — UNE TÂCHE SUR UNE LIGNE, LA MÊME PARTOUT ═══════════════════════════════════════════════
 *
 * Arno : « Sur chaque tâche, dans n'importe quel écran […], deux actions directes : “Faite” et “Décaler” (+1 jour,
 * +2 jours, +1 semaine, ou une date et heure au choix). La couleur se recalcule aussitôt. Une seule et même
 * fonction partagée pour ces actions et pour la couleur. »
 *
 * 🔴 CE COMPOSANT EST CETTE FONCTION, À L'ÉCRAN : la fiche du bien et le récapitulatif général rendent TOUS DEUX
 * `LigneTache`. La couleur vient de `couleurTache` (module pur), les gestes de `agirSurTache` (une seule porte), et
 * le signal émis après chaque geste relit tous les blocs affichés. Un écran qui écrirait sa propre ligne finirait
 * par dire autre chose.
 *
 * 🔴 LA COULEUR NE PARLE JAMAIS SEULE : une pastille ET un mot (« En retard », « Aujourd'hui »…). Une tâche faite ou
 * annulée se grise et dit par qui et quand.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

/**
 * L'HEURE DE L'ÉCRAN, relue chaque minute : la couleur dépend du JOUR, et un écran laissé ouvert passé minuit doit
 * repeindre ses tâches tout seul (la tâche de demain devient celle du jour).
 */
export function useMaintenant(): Date {
  const [m, setM] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setM(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return m;
}

export function LigneTache({ tache, maintenant, avecAdresse = false, onOuvrirBien, onDetail }: {
  tache: Tache;
  maintenant: Date;
  /** Le récapitulatif général montre l'adresse du bien (cliquable) ; la fiche du bien, non — on y est déjà. */
  avecAdresse?: boolean;
  onOuvrirBien?: (lotId: number) => void;
  onDetail: (id: number) => void;
}) {
  const couleur = couleurTache(tache, maintenant);
  const [decaler, setDecaler] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [jour, setJour] = useState(tache.jour);
  const [heure, setHeure] = useState(tache.heure ?? '');

  const agir = async (g: GesteTache) => {
    setOccupe(true);
    setMessage(null);
    const r = await agirSurTache(tache.id, g);
    setOccupe(false);
    if (r.ok) setDecaler(false);
    setMessage({ ok: r.ok, texte: r.message });
  };

  const terminee = tache.etat !== 'a_faire';
  const fin = tache.etat === 'faite'
    ? `Faite par ${tache.faiteParLibelle ?? '?'} le ${horodatageLisible(tache.faiteLe ?? '')}`
    : tache.etat === 'annulee'
      ? `Annulée par ${tache.annuleeParLibelle ?? '?'} le ${horodatageLisible(tache.annuleeLe ?? '')}`
      : null;

  return (
    <li className={`tch-ligne ${couleur === null ? 'tch-ligne--terminee' : `tch-ligne--${couleur}`}`}
      data-tache={tache.id} data-couleur={couleur ?? 'terminee'}>
      <div className="tch-haut">
        <span className="tch-pastille-mot">
          <span className={`tch-pastille tch-pastille--${couleur ?? 'terminee'}`} aria-hidden="true" />
          <span className="tch-mot">{couleur === null ? (tache.etat === 'faite' ? 'Faite' : 'Annulée') : MOT_COULEUR[couleur]}</span>
        </span>
        <span className="tch-date">{dateLisibleTache(tache.jour, tache.heure)}</span>
        <button type="button" className="tch-objet" onClick={() => onDetail(tache.id)}
          title="Voir le détail, modifier ou annuler">
          {tache.objet}
        </button>
      </div>
      <div className="tch-bas">
        {avecAdresse && (
          onOuvrirBien
            ? <button type="button" className="tch-lien" onClick={() => onOuvrirBien(tache.lotId)}>{tache.adresseBien}</button>
            : <span>{tache.adresseBien}</span>
        )}
        <span className="tch-confiee">→ {tache.confieeALibelle}</span>
        {tache.evenement !== null && <span className="tch-ev">{tache.evenement.reference}</span>}
        {/* 🔴 LOT TACHES-1-BIS — dans les listes, un simple indicateur ; le détail montre les coordonnées. */}
        {(tache.nbContacts ?? 0) > 0 && (
          <span className="tch-contacts">👤 {tache.nbContacts} contact{tache.nbContacts > 1 ? 's' : ''}</span>
        )}
        {fin !== null && <span className="tch-fin">{fin}</span>}
      </div>
      {!terminee && (
        <div className="tch-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
            onClick={() => void agir({ geste: 'faite' })}>
            ✓ Faite
          </button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
            aria-expanded={decaler}
            onClick={() => { setJour(tache.jour); setHeure(tache.heure ?? ''); setDecaler((v) => !v); }}>
            Décaler
          </button>
        </div>
      )}
      {decaler && !terminee && (
        <div className="tch-decaler" role="group" aria-label="Décaler la tâche">
          {RACCOURCIS_DECALAGE.map((r) => (
            <button key={r.cle} type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
              onClick={() => void agir({ geste: 'decaler', raccourci: r.cle })}>
              {r.mot}
            </button>
          ))}
          <span className="tch-decaler-choix">
            <label className="tch-champ-court">
              <span className="tch-etiquette">Date</span>
              <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} />
            </label>
            <label className="tch-champ-court">
              <span className="tch-etiquette">Heure (facultative)</span>
              <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
            </label>
            <button type="button" className="svv-btn gst-btn tch-btn" disabled={occupe || jour === ''}
              onClick={() => void agir({ geste: 'decaler', jour, heure: heure === '' ? null : heure })}>
              Valider
            </button>
          </span>
        </div>
      )}
      {message && <p className={`tch-message${message.ok ? '' : ' tch-message--erreur'}`} role="status">{message.texte}</p>}
    </li>
  );
}

/**
 * LES STYLES DES TÂCHES, partagés par la ligne, la fenêtre, la fiche et le récapitulatif. Jetons du thème
 * seulement : Clair et Sombre suivent tout seuls.
 *
 * ⚠️ CSS DANS UN GABARIT : jamais d'accent grave dans un commentaire ci-dessous (il fermerait le gabarit).
 */
export const CSS_TACHES = `
.tch-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.tch-ligne{display:flex;flex-direction:column;gap:4px;padding:8px 10px 8px 12px;border:1px solid var(--color-svv-line);
  border-left-width:5px;border-radius:.6rem;background:var(--color-svv-surface);min-width:0}
.tch-ligne--retard{border-left-color:var(--color-svv-red)}
.tch-ligne--jour{border-left-color:var(--color-svv-line-strong)}
.tch-ligne--proche{border-left-color:var(--color-svv-urgence-orange)}
.tch-ligne--plus_tard{border-left-color:var(--color-svv-green)}
.tch-ligne--terminee{border-left-color:var(--color-svv-line);opacity:.62}
.tch-haut{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .7rem;min-width:0}
.tch-bas{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .7rem;font-size:.82rem;color:var(--color-svv-muted)}
.tch-pastille-mot{display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem;font-weight:700;
  color:var(--color-svv-ink);white-space:nowrap}
.tch-pastille{display:inline-block;width:14px;height:14px;border-radius:50%;flex:0 0 auto;
  border:1px solid transparent}
.tch-pastille--retard{background:var(--color-svv-red)}
.tch-pastille--jour{background:#ffffff;border-color:#9aa3ad}
.tch-pastille--proche{background:var(--color-svv-urgence-orange)}
.tch-pastille--plus_tard{background:var(--color-svv-green)}
.tch-pastille--terminee{background:var(--color-svv-line)}
.tch-date{font-size:.85rem;color:var(--color-svv-ink);white-space:nowrap}
.tch-objet{flex:1 1 12rem;min-width:0;text-align:left;background:none;border:0;padding:4px 0;font:inherit;
  font-weight:600;color:var(--color-svv-ink);cursor:pointer;overflow-wrap:anywhere;min-height:32px}
.tch-objet:hover{text-decoration:underline}
.tch-objet:focus-visible,.tch-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tch-ligne--terminee .tch-objet{text-decoration:line-through;font-weight:500}
.tch-lien{background:none;border:0;padding:0;font:inherit;color:var(--color-svv-blue);cursor:pointer;
  text-decoration:underline;text-align:left;overflow-wrap:anywhere}
.tch-ev{padding:0 .4rem;border:1px solid var(--color-svv-line);border-radius:999px}
.tch-actions,.tch-decaler{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px}
.tch-btn{width:auto;min-height:44px;padding:0 .8rem;font-size:.84rem}
.tch-decaler{padding:8px;border:1px dashed var(--color-svv-line-strong);border-radius:.5rem}
.tch-decaler-choix{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px}
.tch-champ-court{display:flex;flex-direction:column;gap:2px;font-size:.78rem;color:var(--color-svv-muted)}
.tch-champ-court input{min-height:40px;padding:0 .4rem;border:1px solid var(--color-svv-line-strong);border-radius:.4rem;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit}
.tch-message{margin:0;font-size:.82rem;color:var(--color-svv-green-ink)}
.tch-message--erreur{color:var(--color-svv-red)}
.tch-compteurs{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.tch-compteur{display:inline-flex;align-items:center;gap:.35rem;padding:.2rem .6rem;border:1px solid var(--color-svv-line);
  border-radius:999px;font-size:.82rem;color:var(--color-svv-ink);background:var(--color-svv-surface)}
.tch-compteur b{font-variant-numeric:tabular-nums}
.tch-vide{margin:0;font-size:.85rem;color:var(--color-svv-muted)}
.tch-terminees{margin-top:6px}
.tch-terminees > summary{cursor:pointer;font-size:.85rem;color:var(--color-svv-muted);min-height:32px;
  display:flex;align-items:center}
.tch-terminees > .tch-liste{margin-top:6px}
.tch-bloc-fiche{margin:10px 0 4px;padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:.8rem;
  background:var(--color-svv-surface)}
.tch-bloc-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0 0 8px;font-size:.95rem;
  font-weight:700;color:var(--color-svv-ink)}
`;
