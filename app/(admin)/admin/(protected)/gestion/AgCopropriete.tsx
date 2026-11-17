'use client';

import { useEffect, useState } from 'react';
import { A_RATTACHER, dateFr, jourFrDe, LIBELLE_NATURE_AG, LIBELLE_ORIGINE_AG, ligneEntreeAg, natureDe, NOTE_PV_MAX, pvsDeLaCopropriete, TITRE_BLOC_AG, traceCorrection,
  verifierPv, type ChampPv, type EntreeAg, type NatureAg } from '../../../../lib/location/agCopropriete';

/**
 * ══ 🔴🔴 LE BLOC « AG DE LA COPROPRIÉTÉ » (Arno, 16/11/2026, migration 475) ═══════════════════════════════════════════════════════════════════
 * Sur la fiche du bien (Location et Gestion), à côté du digicode, et dans la fiche syndic (par copropriété) : l'historique des AG — dates,
 * dernière tenue / prochaine, statut OFFICIELLE ou PROJETÉE (distincts à l'œil), qui, quand, d'où (sortie n° …, fiche du bien…). Les AG sont
 * celles de la COPROPRIÉTÉ : un changement de syndic n'y change rien. LECTURE SEULE (`/api/admin/gestion/immeubles/ag`).
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
const API = '/api/admin/gestion/immeubles/ag';
interface Lu { copropriete: string | null; immeuble: string | null; applicable: boolean; entrees: EntreeAg[]; pv?: boolean }

/** Aujourd'hui à Paris, « AAAA-MM-JJ ». */
const aujourdhui = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

/**
 * `edition` (🔴 Arno, 17/11/2026, migration 481 — la FICHE COPROPRIÉTÉ seule) : « + Ajouter un PV d'AG » (date du PV, AGO / AGE, note),
 * l'historique des PV du plus récent au plus ancien (type, auteur, date de saisie) avec « Corriger » (trace, rien d'effacé), puis les autres
 * dates comme avant. Sans `edition` (fiche du bien, fiche syndic) : la lecture seule d'avant.
 */
export function AgCopropriete({ lotId, immeuble, edition = false }: { lotId?: number; immeuble?: string; edition?: boolean }) {
  const q = lotId !== undefined ? `lotId=${lotId}` : `immeuble=${encodeURIComponent(immeuble ?? '')}`;
  const [lu, setLu] = useState<{ q: string; etat: 'ok'; data: Lu } | { q: string; etat: 'sans_schema' | 'erreur' } | null>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?${q}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: Lu }>).then((d) => {
      if (!vivant) return;
      setLu(d.etat === 'ok' && d.data ? { q, etat: 'ok', data: d.data } : { q, etat: d.etat === 'sans_schema' ? 'sans_schema' : 'erreur' });
    }).catch(() => { if (vivant) setLu({ q, etat: 'erreur' }); });
    return () => { vivant = false; };
  }, [q]);
  const etat = lu !== null && lu.q === q ? lu : null;
  if (etat === null || etat.etat === 'sans_schema') return null;
  if (etat.etat !== 'ok') return <p className="loc-muet" data-ag-copropriete-bloc="erreur">{TITRE_BLOC_AG} : lecture impossible.</p>;
  const d: Lu = etat.data;
  if (!d.applicable) return null;
  if (edition && d.pv === true && immeuble !== undefined) {
    return <PvCopropriete immeuble={immeuble} copropriete={d.copropriete} entrees={d.entrees}
      onEntrees={(entrees) => setLu({ q, etat: 'ok', data: { ...d, entrees } })} />;
  }
  return (
    <div className="agc" data-ag-copropriete-bloc>
      <p className="agc-titre">{TITRE_BLOC_AG}{d.copropriete !== null ? <> — <span data-agc-copropriete>{d.copropriete}</span></> : <span className="agc-a-rattacher" data-agc-a-rattacher> — {A_RATTACHER}</span>}</p>
      {d.entrees.length === 0 ? <p className="loc-muet agc-vide" data-agc-vide>Aucune AG enregistrée.</p> : (
        <ul className="agc-liste">
          {d.entrees.map((e) => (
            <li key={e.id} className={`agc-entree agc-entree--${e.type === 'derniere' ? 'tenue' : e.statut}`} data-agc-entree={e.type} data-agc-statut={e.statut}>{ligneEntreeAg(e)}</li>
          ))}
        </ul>
      )}
      <style>{CSS_AG_COPROPRIETE}</style>
    </div>
  );
}

/** La fiche Copropriété : les PV (ajout, « Corriger »), puis les autres dates de l'historique, comme avant. */
function PvCopropriete({ immeuble, copropriete, entrees, onEntrees }: { immeuble: string; copropriete: string | null; entrees: EntreeAg[]; onEntrees: (e: EntreeAg[]) => void }) {
  const [form, setForm] = useState<{ corrige: EntreeAg | null } | null>(null);
  const pvs = pvsDeLaCopropriete(entrees);
  const autres = entrees.filter((e) => !pvs.includes(e));
  return (
    <div className="agc" data-ag-copropriete-bloc data-agc-edition>
      <p className="agc-titre">{TITRE_BLOC_AG}{copropriete !== null ? <> — <span data-agc-copropriete>{copropriete}</span></> : null}</p>
      {form === null
        ? <p className="agc-ajouter"><button type="button" className="svv-btn svv-btn-outline gst-btn agc-bouton" onClick={() => setForm({ corrige: null })} data-agc-ajouter-pv>+ Ajouter un PV d’AG</button></p>
        : form.corrige === null && <FormulairePv immeuble={immeuble} corrige={null} onFermer={() => setForm(null)} onEnregistre={(e) => { setForm(null); onEntrees(e); }} />}
      <p className="agc-sous-titre">Procès-verbaux d’AG (du plus récent au plus ancien)</p>
      {pvs.length === 0 ? <p className="loc-muet agc-vide" data-agc-vide>Aucun PV d’AG enregistré.</p> : (
        <ul className="agc-liste" data-agc-pvs>
          {pvs.map((e) => (
            <li key={e.id} className="agc-entree agc-entree--tenue agc-pv" data-agc-pv={e.id} data-agc-nature={natureDe(e)}>
              <span className="agc-pv-tete"><strong data-agc-pv-date>{dateFr(e.date as string)}</strong> — <span data-agc-pv-type>{LIBELLE_NATURE_AG[natureDe(e)]}</span></span>
              <span className="agc-pv-qui">saisie par {e.saisiePar} le {jourFrDe(e.saisieLe)} ({LIBELLE_ORIGINE_AG[e.origine] ?? e.origine})</span>
              {e.note ? <span className="agc-pv-note" data-agc-pv-note>Note : {e.note}</span> : null}
              {e.corrige ? <span className="agc-pv-trace" data-agc-pv-trace>{traceCorrection(e.corrige)}</span> : null}
              {form !== null && form.corrige?.id === e.id
                ? <FormulairePv immeuble={immeuble} corrige={e} onFermer={() => setForm(null)} onEnregistre={(x) => { setForm(null); onEntrees(x); }} />
                : <button type="button" className="svv-btn svv-btn-outline gst-btn agc-bouton agc-corriger" disabled={form !== null} onClick={() => setForm({ corrige: e })} data-agc-corriger={e.id}>Corriger</button>}
            </li>))}
        </ul>)}
      {autres.length > 0 && <>
        <p className="agc-sous-titre">Autres dates (prochaines AG, dates retirées)</p>
        <ul className="agc-liste" data-agc-autres>
          {autres.map((e) => (
            <li key={e.id} className={`agc-entree agc-entree--${e.type === 'derniere' ? 'tenue' : e.statut}`} data-agc-entree={e.type} data-agc-statut={e.statut}>{ligneEntreeAg(e)}</li>
          ))}
        </ul></>}
      <style>{CSS_AG_COPROPRIETE}</style>
    </div>
  );
}

/** Le formulaire d'un PV : date (passée ou du jour), type obligatoire AGO / AGE, note facultative ; les messages après une tentative. */
function FormulairePv({ immeuble, corrige, onFermer, onEnregistre }: { immeuble: string; corrige: EntreeAg | null; onFermer: () => void; onEnregistre: (e: EntreeAg[]) => void }) {
  const [date, setDate] = useState(corrige?.date ?? '');
  const [nature, setNature] = useState<NatureAg | null>(corrige === null ? null : natureDe(corrige));
  const [note, setNote] = useState(corrige?.note ?? '');
  const [tente, setTente] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const jour = aujourdhui();
  const v = verifierPv({ date, nature, note }, jour);
  const enDefaut = (c: ChampPv): boolean => tente && !v.ok && v.champs.includes(c);
  const enregistrer = (): void => {
    setTente(true); setRefus(null);
    if (!v.ok) return;
    setEnvoi(true);
    void fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pv', immeuble, date: v.saisie.date, nature: v.saisie.nature, note: v.saisie.note, ...(corrige !== null ? { corrige: corrige.id } : {}) }) })
      .then((r) => r.json() as Promise<{ etat?: string; data?: { entrees: EntreeAg[] }; motif?: string; message?: string }>)
      .then((x) => { setEnvoi(false); if (x.etat === 'ok' && x.data) onEnregistre(x.data.entrees); else setRefus(x.motif ?? x.message ?? 'Le PV n’a pas été enregistré.'); })
      .catch(() => { setEnvoi(false); setRefus('Le serveur n’a pas répondu : le PV n’a pas été enregistré.'); });
  };
  return (
    <div className="agc-form" role="group" aria-label={corrige === null ? 'Ajouter un PV d’AG' : 'Corriger ce PV d’AG'} data-agc-form={corrige === null ? 'ajout' : 'correction'}
      onKeyDown={(e) => { if (e.key === 'Escape' && !envoi) { e.stopPropagation(); onFermer(); } }}>
      <p className="agc-form-titre">{corrige === null ? 'Nouveau PV d’AG' : `Corriger le PV du ${dateFr(corrige.date as string)}`}</p>
      <p className="loc-muet agc-form-aide">Seules les dates OFFICIELLES de PV se saisissent ici (aucune date projetée).{corrige !== null ? ' La saisie d’avant reste dans l’historique.' : ''}</p>
      <label className={`agc-champ${enDefaut('date') ? ' agc-champ--defaut' : ''}`}><span>Date du PV <span className="loc-oblig">*</span></span>
        <input type="date" value={date} max={jour} disabled={envoi} onChange={(e) => setDate(e.target.value)} aria-invalid={enDefaut('date')} data-agc-pv-date-saisie /></label>
      <fieldset className={`agc-types${enDefaut('nature') ? ' agc-champ--defaut' : ''}`} aria-invalid={enDefaut('nature')}>
        <legend>Type <span className="loc-oblig">*</span></legend>
        {(['ago', 'age'] as const).map((n) => (
          <button key={n} type="button" className={`svv-btn gst-btn agc-type${nature === n ? ' svv-btn-primary' : ' svv-btn-outline'}`} aria-pressed={nature === n} disabled={envoi}
            onClick={() => setNature(n)} data-agc-pv-type-choix={n}>{LIBELLE_NATURE_AG[n]}</button>))}
      </fieldset>
      <label className={`agc-champ${enDefaut('note') ? ' agc-champ--defaut' : ''}`}><span>Note (facultative)</span>
        <textarea value={note} rows={2} maxLength={NOTE_PV_MAX + 50} disabled={envoi} onChange={(e) => setNote(e.target.value)} data-agc-pv-note-saisie /></label>
      {tente && !v.ok && <p className="agc-erreur" role="alert" data-agc-pv-erreur>{v.motif}</p>}
      {refus !== null && <p className="agc-erreur" role="alert" data-agc-pv-refus>{refus}</p>}
      <p className="agc-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn agc-bouton" disabled={envoi} onClick={onFermer} data-agc-pv-annuler>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn agc-bouton" disabled={envoi} onClick={enregistrer} data-agc-pv-enregistrer>
          {envoi ? 'Enregistrement…' : corrige === null ? 'Enregistrer le PV' : 'Enregistrer la correction'}</button>
      </p>
    </div>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Une projection : en italique, bordure en tirets ; une officielle : bordure pleine. */
export const CSS_AG_COPROPRIETE = `
.agc{grid-column:1 / -1;display:flex;flex-direction:column;gap:4px;min-width:0}
.agc-titre{margin:0;font-weight:800;color:var(--color-svv-ink);overflow-wrap:anywhere}
.agc-a-rattacher{color:var(--color-svv-orange);font-weight:800}
.agc-vide{margin:0}
.agc-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.agc-entree{padding:4px 8px;border-radius:8px;border:1px solid var(--color-svv-line-strong);color:var(--color-svv-ink);font-size:.88rem;overflow-wrap:anywhere}
.agc-entree--officielle{border-color:var(--color-svv-green);background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.agc-entree--projetee{border-style:dashed;font-style:italic}
.agc-sous-titre{margin:6px 0 0;font-weight:700;font-size:.9rem;color:var(--color-svv-ink)}
.agc-ajouter{margin:2px 0}
.agc-bouton{min-height:44px}
.agc-pv{display:flex;flex-direction:column;gap:3px;align-items:flex-start}
.agc-pv-qui,.agc-pv-note,.agc-pv-trace{font-size:.82rem}
.agc-pv-trace{font-style:italic}
.agc-form{display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);font-style:normal}
.agc-form-titre{margin:0;font-weight:800}
.agc-form-aide{margin:0;font-size:.85rem}
.agc-champ{display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:700;min-width:0}
.agc-champ input,.agc-champ textarea{min-height:44px;box-sizing:border-box;width:100%;max-width:100%;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);padding:8px 10px;font:inherit;font-weight:400}
.agc-types{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;border:0;min-width:0}
.agc-types legend{font-size:.85rem;font-weight:700;margin-bottom:4px;padding:0}
.agc-types .agc-type{min-height:44px;white-space:normal;text-align:left;flex:1 1 240px;max-width:100%;box-sizing:border-box;min-width:0}
.agc-champ--defaut input,.agc-champ--defaut textarea{border-color:var(--color-svv-red);border-width:2px}
.agc-types.agc-champ--defaut .agc-type{border-color:var(--color-svv-red)}
.agc-erreur{margin:0;padding:8px 12px;border-radius:10px;border-left:4px solid var(--color-svv-red);background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);font-weight:700;font-size:.9rem}
.agc-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin:0}
`;
