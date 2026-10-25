'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { CSS_MODALE_ISSUE } from './ModaleIssue';
import {
  type ActiviteLue, DESCRIPTION_NATURE_BIEN, LIBELLE_NATURE_BIEN, NATURES_BIEN, natureBienCalculee, natureBienLoue, type NatureBien,
} from '../../../../lib/location/suivi/tableauBord';

const API = '/api/admin/location/suivi';

/** La pastille « nature du bien loué » : couleur douce ET texte (jamais la couleur seule) ; « À qualifier » en bordure pointillée. */
export function PastilleNature({ nature }: { nature: NatureBien }) {
  return <span className={`fdm-nature fdm-nature--${nature}`}>{LIBELLE_NATURE_BIEN[nature]}</span>;
}

/**
 * ══ 🔴 Arno (25/10/2026, migration 424) — « STATUT DU BIEN » (anciennement « Nature du bien ») ══════════════════════════════════════════
 * La rubrique du panneau déplié : la pastille et sa raison (inchangées ; « validé par <nom> le <date> » quand le statut a été validé à la
 * main). Un clic ouvre une petite modale : les 5 statuts, chacun avec son « i » (ce qu'il veut dire), le statut CALCULÉ présélectionné et
 * marqué « proposé ». « Valider » enregistre le statut sur la ligne (journalisé) — il l'emporte alors partout ; « Revenir au statut
 * calculé » l'efface. Ni l'origine du contact ni la gestion ne sont touchées. La modale ne se ferme que par la croix, un clic en dehors
 * ou « Annuler ».
 */
export function RubriqueStatutBien({ a, disponible, onFini }: { a: ActiviteLue; disponible: boolean; onFini: () => void }) {
  const [ouverte, setOuverte] = useState(false);
  const nature = natureBienLoue(a);
  return (
    <>
      <button type="button" className="fdm-statut-bien" onClick={() => setOuverte(true)} aria-haspopup="dialog" data-statut-bien-ouvrir={String(a.id)}
        title="Choisir le statut du bien">
        <PastilleNature nature={nature.nature} /> — {nature.raison}
      </button>
      {ouverte && <ModaleStatutBien a={a} disponible={disponible} onFermer={() => setOuverte(false)} onFini={() => { setOuverte(false); onFini(); }} />}
    </>
  );
}

export function ModaleStatutBien({ a, disponible, onFermer, onFini }: { a: ActiviteLue; disponible: boolean; onFermer: () => void; onFini: () => void }) {
  const idTitre = useId();
  const calcule = natureBienCalculee(a);
  const actuel = natureBienLoue(a);
  const [choix, setChoix] = useState<NatureBien>(actuel.nature);
  const [envoi, setEnvoi] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  /* 🔴 Arno (25/10/2026) — UNE description ouverte à la fois : au clic sur le « i » ; refermée par un second clic, un clic ailleurs ou Échap
     (Échap ne ferme pas la modale). */
  const [info, setInfo] = useState<NatureBien | null>(null);
  useEffect(() => {
    if (info === null) return;
    const ailleurs = (e: MouseEvent): void => {
      const cible = e.target as Element | null;
      if (cible?.closest?.(`[data-statut-info="${info}"], [data-statut-description="${info}"]`) == null) setInfo(null);
    };
    const echap = (e: KeyboardEvent): void => { if (e.key === 'Escape') setInfo(null); };
    document.addEventListener('mousedown', ailleurs);
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('mousedown', ailleurs); document.removeEventListener('keydown', echap); };
  }, [info]);
  const envoyer = async (statut: NatureBien | null): Promise<void> => {
    if (envoi || !disponible) return;
    setEnvoi(true); setMotif(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'statut-bien', id: a.id, statut }) });
      const j = await r.json().catch(() => ({})) as { etat?: string; motif?: string };
      if (j.etat === 'ok') { onFini(); return; }
      setMotif(j.motif ?? 'Le statut n’a pas été enregistré.');
    } catch {
      setMotif('Le statut n’a pas été enregistré : le serveur n’a pas répondu.');
    } finally { setEnvoi(false); }
  };
  const contenu = (
    <div className="mis-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }} data-voile-statut-bien>
      <style>{CSS_MODALE_ISSUE + CSS_STATUT_BIEN}</style>
      <div className="mis-boite msb-boite" role="dialog" aria-modal="true" aria-labelledby={idTitre} data-modale-statut-bien={String(a.id)}>
        <div className="msb-tete">
          <h2 id={idTitre} className="mis-titre">Statut du bien</h2>
          <button type="button" className="msb-croix" aria-label="Fermer" onClick={onFermer} data-fermer-statut-bien>×</button>
        </div>
        <p className="msb-ligne">{a.libelleProprietaire || '—'} / {a.libelleLocataire || '—'}</p>
        {!disponible && <p className="loc-alerte loc-alerte--orange" role="status" data-statut-sans-424>Mise à jour de la base à appliquer (migration 424) : le statut ne peut pas encore être validé à la main.</p>}
        <ul className="msb-choix" role="radiogroup" aria-label="Statut du bien">
          {NATURES_BIEN.map((n) => (
            <li key={n} className="msb-option">
              <div className="msb-rangee">
                <button type="button" role="radio" aria-checked={choix === n} className={`msb-statut${choix === n ? ' msb-statut--choisi' : ''}`}
                  onClick={() => setChoix(n)} data-statut-bien-choix={n}>
                  <span className="msb-coche" aria-hidden="true">{choix === n ? '✓' : ''}</span>
                  <PastilleNature nature={n} />
                  {n === calcule.nature && <span className="msb-propose" data-statut-propose>proposé</span>}
                </button>
                {/* 🔴 Arno (25/10/2026) — le « i » ouvre la description DANS la modale, sous la ligne (jamais par-dessus un autre bouton). */}
                <button type="button" className="msb-i" aria-expanded={info === n} aria-controls={`${idTitre}-desc-${n}`}
                  aria-label={`Ce que veut dire « ${LIBELLE_NATURE_BIEN[n]} »`} data-statut-info={n}
                  onClick={() => setInfo((x) => (x === n ? null : n))}><span className="msb-i-pastille" aria-hidden="true">i</span></button>
              </div>
              {info === n && <p id={`${idTitre}-desc-${n}`} className="msb-desc" data-statut-description={n}>{DESCRIPTION_NATURE_BIEN[n]}</p>}
            </li>
          ))}
        </ul>
        <p className="msb-note">Le statut calculé : <strong>{LIBELLE_NATURE_BIEN[calcule.nature]}</strong> — {calcule.raison}.
          {actuel.manuelle && <> Aujourd’hui : <strong>{LIBELLE_NATURE_BIEN[actuel.nature]}</strong>, {actuel.raison}.</>}</p>
        {motif !== null && <p className="gst-erreur" role="alert" data-statut-motif>{motif}</p>}
        <div className="mis-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={onFermer} data-annuler-statut-bien>Annuler</button>
          {actuel.manuelle && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" disabled={envoi || !disponible} onClick={() => { void envoyer(null); }}
              data-statut-bien-calcule>Revenir au statut calculé</button>
          )}
          <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" disabled={envoi || !disponible} onClick={() => { void envoyer(choix); }}
            data-valider-statut-bien>{envoi ? 'Enregistrement…' : 'Valider'}</button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? contenu : createPortal(contenu, document.querySelector('.svv-adm-root') ?? document.body);
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme seulement ; cibles de 44 px. */
export const CSS_STATUT_BIEN = `
.fdm-statut-bien{appearance:none;background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;text-align:left;cursor:pointer;min-height:44px;display:inline;line-height:inherit}
.fdm-statut-bien:hover .fdm-nature,.fdm-statut-bien:focus-visible .fdm-nature{outline:2px solid var(--color-svv-green-ink);outline-offset:1px}
.fdm-statut-bien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:6px}
.msb-boite{width:min(520px,100%)}
.msb-tete{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.msb-croix{appearance:none;flex:0 0 auto;min-width:44px;min-height:44px;margin:-10px -12px 0 0;background:none;border:0;font-size:1.6rem;line-height:1;color:var(--color-svv-muted);cursor:pointer;border-radius:10px}
.msb-croix:hover{color:var(--color-svv-ink)}
.msb-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.msb-ligne{margin:0;color:var(--color-svv-muted);overflow-wrap:anywhere}
.msb-choix{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.msb-option{display:flex;flex-direction:column;gap:6px}
.msb-rangee{display:flex;align-items:center;gap:6px}
.msb-i{appearance:none;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0;background:none;border:0;border-radius:999px;cursor:pointer;color:var(--color-svv-muted)}
.msb-i-pastille{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:999px;border:1px solid currentColor;font-size:.75rem;font-weight:800;font-style:italic;line-height:1;font-family:Georgia,serif}
.msb-i:hover,.msb-i[aria-expanded="true"]{color:var(--color-svv-red)}
.msb-i:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.msb-desc{margin:0;padding:10px 14px;border-radius:12px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-field);color:var(--color-svv-ink);font-size:.92rem;line-height:1.45;overflow-wrap:anywhere}
.msb-statut{appearance:none;flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:10px;min-height:48px;padding:6px 14px;border-radius:14px;border:2px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;cursor:pointer;text-align:left}
.msb-statut:hover{border-color:var(--color-svv-green-ink)}
.msb-statut--choisi{border-color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
.msb-statut:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.msb-coche{flex:0 0 1em;color:var(--color-svv-green-ink);font-weight:800}
.msb-propose{margin-left:auto;font-size:.75rem;font-weight:700;border-radius:999px;padding:.12rem .55rem;border:1px solid var(--color-svv-green-ink);color:var(--color-svv-green-ink);white-space:nowrap}
.msb-note{margin:0;font-size:.9rem;color:var(--color-svv-muted);line-height:1.45}
.msb-note strong{color:var(--color-svv-ink)}
`;
