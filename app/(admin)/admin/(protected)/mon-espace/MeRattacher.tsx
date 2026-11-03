'use client';

import { useEffect, useId, useState } from 'react';
import { CSS_PARAMETRES } from '../location/ParametresLocation';
import { CSS_ONGLETS_SUIVI } from '../location/OngletsSuivi';
import { aujourdhuiParis, MOT_REMUNERATION_ADMIN } from '../../../../lib/location/suivi/suivi';
import type { MesApporteursLus, MonApporteur } from '../../../../lib/mon-espace/apporteurs';

/**
 * ══ 🔴 D32 (Arno, 03/11/2026, option B) — « ME RATTACHER CET APPORTEUR » (un collaborateur, un apporteur « à rattacher ») ════════════════════════
 * La mécanique du rattachement de la fiche (D26) : la date d'effet (ou « Depuis toujours »), la question « touche-t-il des honoraires ? », la garde
 * 409 (`collegueAvant` : à rattacher) ; le collègue est TOUJOURS le titulaire (aucun choix). Le taux et la règle de rémunération restent aux
 * administrateurs : la réponse est inscrite au journal, aucune version n'est écrite (« Oui » : « à fixer par un administrateur »). Le serveur refuse
 * tout le reste (403, `droitRattachement`).
 */
export function MeRattacher({ a, lu, envoyer, onFermer, onFait }: { a: MonApporteur; lu: MesApporteursLus;
  envoyer: (corps: Record<string, unknown>) => Promise<{ motif: string | null }>; onFermer: () => void; onFait: (message: string) => void }) {
  const titreId = useId();
  const [toujours, setToujours] = useState(false);
  const [depuis, setDepuis] = useState(aujourdhuiParis());
  const [reponse, setReponse] = useState<'oui' | 'non' | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    const echap = (e: globalThis.KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onFermer]);
  const pret = reponse !== null && (toujours || depuis !== '') && !envoi;
  const valider = async (): Promise<void> => {
    if (!pret) return;
    setEnvoi(true); setMotif(null);
    const r = await envoyer({ action: 'rattachement', apporteurId: a.id, collegueAvant: null, rattachement: { sorte: 'rattacher', collegueId: lu.titulaireId,
      ...(toujours ? { depuisToujours: true } : { depuis }), remuneration: { remunere: reponse === 'oui' } } });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    onFait(reponse === 'oui' ? `${a.libelle} vous est rattaché. Sa rémunération (taux, règle) sera fixée par un administrateur.` : `${a.libelle} vous est rattaché.`);
  };
  return (
    <div className="plo-voile" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }} data-fenetre-me-rattacher={a.id}>
      <style>{CSS_PARAMETRES}{CSS_ONGLETS_SUIVI}{CSS_ME_RATTACHER}</style>
      <div className="plo-fenetre mer-fenetre" role="dialog" aria-modal="true" aria-labelledby={titreId}>
        <div className="plo-tete">
          <h2 id={titreId}>Me rattacher {a.libelle}</h2>
          <button type="button" className="plo-x" aria-label="Fermer" onClick={onFermer} data-fermer-me-rattacher>×</button>
        </div>
        <div className="plo-corps mer-corps">
          <p className="plo-muet">Cet apporteur n’est rattaché à aucun collègue. Vous pouvez vous le rattacher ; changer un rattachement, rattacher à un autre collègue ou
            fixer une rémunération reste réservé aux administrateurs.</p>
          <div className="plo-champ"><span>À partir du</span>
            {lu.toujours === true && <label className="plo-case"><input type="checkbox" checked={toujours} onChange={(e) => setToujours(e.target.checked)} data-me-rattacher-toujours />Depuis toujours</label>}
            <input type="date" aria-label="À partir du" value={toujours ? '' : depuis} disabled={toujours} onChange={(e) => setDepuis(e.target.value)} data-me-rattacher-depuis />
          </div>
          <div className="plo-champ" data-me-rattacher-question><span>Touchez-vous des honoraires sur l’activité de cet apporteur ?</span>
            <span className="plo-modes" role="radiogroup" aria-label="Vos honoraires">
              <button type="button" role="radio" className="plo-mode" aria-checked={reponse === 'non'} onClick={() => setReponse('non')} data-me-rattacher-reponse="non">Non</button>
              <button type="button" role="radio" className="plo-mode" aria-checked={reponse === 'oui'} onClick={() => setReponse('oui')} data-me-rattacher-reponse="oui">Oui</button>
            </span>
            {reponse === null && <small className="plo-muet">À trancher pour enregistrer.</small>}
            {reponse === 'oui' && <small className="plo-muet" data-me-rattacher-remuneration>{MOT_REMUNERATION_ADMIN} Votre réponse est notée au journal de l’apporteur.</small>}
          </div>
          {motif !== null && <p className="plo-alerte" role="alert" data-me-rattacher-motif>{motif}</p>}
        </div>
        <div className="plo-pied mer-pied">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer} data-annuler-me-rattacher>Annuler</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!pret} onClick={() => void valider()} data-valider-me-rattacher>Me rattacher cet apporteur</button>
        </div>
      </div>
    </div>
  );
}

const CSS_ME_RATTACHER = `
.mer-fenetre{width:min(560px,100%)}
.mer-corps{display:flex;flex-direction:column;gap:14px}
.mer-corps .plo-champ{display:flex;flex-direction:column;gap:6px}
.mer-corps input[type="date"]{min-height:44px;max-width:220px}
.mer-pied{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--color-svv-line)}
.mer-pied .gst-btn{min-height:44px;width:auto}
`;
