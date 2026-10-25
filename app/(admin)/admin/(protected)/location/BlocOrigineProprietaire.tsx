'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CSS_MODALE_ISSUE } from './ModaleIssue';
import { corpsOrigineProprietaire, manqueOrigineProprietaire, ORIGINE_PROPRIETAIRE_VIDE, useOrigineProprietaire, type SaisieOrigineProprietaire } from './ChoixOrigineProprietaire';
import { CSS_SUIVI_COMMERCIAL } from './SuiviCommercial';
import type { OrigineProprietaire } from '../../../../lib/location/origineProprietaire';

/**
 * ══ 🔴 Arno (25/10/2026, 425) — « ORIGINE DU CONTACT » DANS LA FICHE DU PROPRIÉTAIRE ═════════════════════════════════════════════════
 * L'origine (« à compléter » si inconnue ou à renseigner), modifiable : récapitulatif (ancienne → nouvelle), Confirmer ; journal (compte,
 * session, écran « Fiche du propriétaire »). PAS DE RÉTROACTIVITÉ : les locations déjà enregistrées ne changent pas. Après la
 * modification, une case (DÉCOCHÉE par défaut) propose de l'appliquer aussi à ses locations encore « à renseigner », avec leur liste.
 */
interface LocationListee { id: number; libelle: string; dateSignature: string; mot: string }
interface Lu { disponible: boolean; origine: { origine: OrigineProprietaire | null; mot: string; modifieeLe: string | null; par: string | null } | null;
  locations: { toutes: LocationListee[]; aRenseigner: LocationListee[] } }

const API = '/api/admin/gestion/annuaire';
const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');
const versSaisie = (o: OrigineProprietaire | null): SaisieOrigineProprietaire => (o === null ? ORIGINE_PROPRIETAIRE_VIDE()
  : { origine: o.origine, precision: o.precision ?? '', collegueId: o.collegueId, apporteurId: o.apporteurId });

export function BlocOrigineProprietaire({ proprietaireId, modifiable = true }: { proprietaireId: number; modifiable?: boolean }) {
  const [lu, setLu] = useState<Lu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState<SaisieOrigineProprietaire>(ORIGINE_PROPRIETAIRE_VIDE);
  const [reporter, setReporter] = useState(false);
  const [recap, setRecap] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; mot: string } | null>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?origineProprietaire=${proprietaireId}`, { cache: 'no-store' }).then((r) => r.json()).then((d: { etat?: string; data?: Lu }) => {
      if (!vivant) return;
      if (d.etat === 'ok' && d.data !== undefined) { setLu(d.data); setErreur(null); } else setErreur('L’origine du contact n’a pas pu être lue.');
    }).catch(() => { if (vivant) setErreur('L’origine du contact n’a pas pu être lue : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [proprietaireId, n]);

  if (erreur !== null) return <p className="gst-erreur" role="alert">{erreur}</p>;
  if (lu === null || !lu.disponible || lu.origine === null) return null;
  const actuelle = lu.origine;
  const aCompleter = actuelle.origine === null || actuelle.origine.origine === 'inconnue';
  return (
    <section className="cp-origine-proprietaire" aria-labelledby={`origine-${proprietaireId}`} data-bloc-origine-proprietaire>
      <style>{CSS_SUIVI_COMMERCIAL + CSS_ORIGINE_PROPRIETAIRE}</style>
      <p className="cop-ligne">
        <span id={`origine-${proprietaireId}`} className="cop-mot">Origine du contact</span>{' '}
        <strong data-origine-actuelle>{actuelle.mot}</strong>
        {aCompleter && <span className="cop-a-completer" data-origine-a-completer>à compléter</span>}
        {modifiable && !edition && (
          <button type="button" className="gst-bouton gst-bouton--petit" onClick={() => { setSaisie(versSaisie(actuelle.origine)); setReporter(false); setMessage(null); setEdition(true); }}
            data-modifier-origine-proprietaire>Modifier</button>
        )}
      </p>
      {actuelle.modifieeLe !== null && <p className="loc-muet cop-trace">Saisie le {dateFr(actuelle.modifieeLe)}{actuelle.par ? ` par ${actuelle.par}` : ''}.</p>}
      {message !== null && <p className={message.ok ? 'gst-info' : 'gst-erreur'} role={message.ok ? 'status' : 'alert'} data-issue-origine-proprietaire>{message.mot}</p>}
      {edition && (
        <Edition saisie={saisie} onSaisie={setSaisie} aRenseigner={lu.locations.aRenseigner} reporter={reporter} onReporter={setReporter}
          onAnnuler={() => setEdition(false)} onEnregistrer={() => setRecap(true)} />
      )}
      {recap && createPortal(
        <div className="mis-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) setRecap(false); }}>
          <style>{CSS_MODALE_ISSUE}</style>
          <div className="mis-boite" role="dialog" aria-modal="true" aria-label="Récapitulatif" data-recap-origine-proprietaire>
            <h2 className="mis-titre">Récapitulatif</h2>
            <p style={{ margin: 0 }}>Origine du contact : <strong>{actuelle.mot}</strong> → <strong>{motSaisie(saisie)}</strong></p>
            <p className="loc-muet" style={{ margin: 0 }}>Les locations déjà enregistrées ne changent pas.</p>
            {reporter && <p style={{ margin: 0 }} data-recap-report>Appliquée aussi à {lu.locations.aRenseigner.length} location(s) encore « à renseigner ».</p>}
            <div className="mis-actions">
              <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={() => setRecap(false)} disabled={envoi}>Revenir</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" disabled={envoi} data-confirmer-origine-proprietaire onClick={() => { void (async () => {
                setEnvoi(true);
                try {
                  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'origine-proprietaire', id: proprietaireId, origine: corpsOrigineProprietaire(saisie), reporter }) });
                  const d = await r.json() as { etat?: string; motif?: string; data?: { mot: string; reportees: number } };
                  if (d.etat === 'ok' && d.data !== undefined) {
                    setMessage({ ok: true, mot: `✓ Origine enregistrée : ${d.data.mot}${d.data.reportees > 0 ? ` — ${d.data.reportees} location(s) « à renseigner » complétée(s)` : ''}.` });
                    setEdition(false); setN((x) => x + 1);
                  } else setMessage({ ok: false, mot: d.motif ?? 'L’origine n’a pas été enregistrée.' });
                } catch { setMessage({ ok: false, mot: 'L’origine n’a pas été enregistrée : le serveur n’a pas répondu.' }); }
                finally { setEnvoi(false); setRecap(false); }
              })(); }}>{envoi ? 'Enregistrement…' : 'Confirmer'}</button>
            </div>
          </div>
        </div>, document.querySelector('.svv-adm-root') ?? document.body)}
    </section>
  );
}

function motSaisie(s: SaisieOrigineProprietaire): string {
  return s.origine === '' ? 'à renseigner' : s.origine === 'inconnue' ? 'Origine inconnue — à compléter' : s.origine === 'personnalise' ? `Personnalisé : ${s.precision}` : ({
    collegue: 'Collègue directement', apporteur: 'Apporteur d’affaires', internet: 'Internet', recommandation: 'Recommandation client', passage_agence: 'Passage agence',
    campagne: 'Campagne de communication' } as Record<string, string>)[s.origine] ?? s.origine;
}

function Edition({ saisie, onSaisie, aRenseigner, reporter, onReporter, onAnnuler, onEnregistrer }: {
  saisie: SaisieOrigineProprietaire; onSaisie: (s: SaisieOrigineProprietaire) => void; aRenseigner: LocationListee[];
  reporter: boolean; onReporter: (v: boolean) => void; onAnnuler: () => void; onEnregistrer: () => void;
}) {
  const choix = useOrigineProprietaire(saisie, onSaisie);
  const manque = manqueOrigineProprietaire(saisie);
  const heritable = saisie.origine !== '' && saisie.origine !== 'inconnue';
  return (
    <div className="cop-edition" data-edition-origine-proprietaire>
      <div className="loc-grille loc-suivi-ligne loc-suivi-ligne--deux">{choix.champs}</div>
      {choix.apres}
      <p className="loc-muet" style={{ margin: 0 }}>Pas de rétroactivité : les locations déjà enregistrées gardent leur origine.</p>
      {aRenseigner.length > 0 && heritable && (
        <div className="cop-report" data-report-origine>
          <label className="cop-case"><input type="checkbox" checked={reporter} onChange={(e) => onReporter(e.target.checked)} data-reporter-origine />
            <span>L’appliquer aussi à ses {aRenseigner.length} location(s) encore « à renseigner »</span></label>
          <ul className="cop-liste" data-locations-a-renseigner>
            {aRenseigner.map((l) => <li key={l.id}>{l.libelle} <span className="loc-muet">— signée le {dateFr(l.dateSignature)}</span></li>)}
          </ul>
        </div>
      )}
      {manque !== null && <small className="loc-manque">{manque}</small>}
      <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler}>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={manque !== null} onClick={onEnregistrer} data-enregistrer-origine-proprietaire>Enregistrer</button>
      </div>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px. */
export const CSS_ORIGINE_PROPRIETAIRE = `
.cp-origine-proprietaire{display:flex;flex-direction:column;gap:6px;margin:8px 0}
.cop-ligne{margin:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.cop-mot{color:var(--color-svv-muted)}
.cop-a-completer{border-radius:999px;padding:.1rem .55rem;font-size:.75rem;font-weight:700;border:1px dashed var(--color-svv-amber);color:var(--color-svv-amber)}
.cop-trace{margin:0;font-size:.82rem}
.cop-edition{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--color-svv-line-strong);border-radius:14px;background:var(--color-svv-surface)}
.cop-report{display:flex;flex-direction:column;gap:4px}
.cop-case{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer}
.cop-liste{margin:0;padding-left:1.2rem;font-size:.88rem;overflow-wrap:anywhere}
`;
