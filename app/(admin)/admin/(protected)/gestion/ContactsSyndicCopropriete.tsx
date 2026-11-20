'use client';

import { useEffect, useState } from 'react';
import type { GestionnaireSyndic } from '../../../../lib/gestion/copropriete';

/**
 * ══ 🔴🔴 LES CONTACTS DU SYNDIC DE CETTE COPROPRIÉTÉ (Arno, 20/11/2026) ════════════════════════════════════════════════════════════════════════════════
 * « Un syndic peut être énorme et avoir beaucoup de personnel, mais en général il n'y a que 2, 3 ou 4 de ses contacts affectés à une copropriété. »
 * Monté par la fiche Copropriété (le MÊME composant pour la fiche et la modale) :
 *   · les contacts rattachés (nom, fonction, téléphone, e-mail), chacun avec un rond « − » qui le DÉTACHE de la copropriété après confirmation —
 *     jamais supprimé de l'annuaire du syndic ;
 *   · « + Rattacher un contact du syndic » : la recherche dans l'annuaire COMPLET du syndic (nom, prénom, fonction, téléphone, e-mail), un ou
 *     plusieurs contacts cochés, rattachés à CETTE copropriété.
 * Gestes immédiats, journalisés ; aucun mail ; usage interne (ces coordonnées ne sont jamais montrées à un client).
 */
const API = '/api/admin/gestion/coproprietes/fiche';

export const nomGestionnaire = (g: Pick<GestionnaireSyndic, 'civilite' | 'prenom' | 'nom'>): string =>
  [g.civilite, g.prenom, (g.nom ?? '').toLocaleUpperCase('fr-FR')].filter(Boolean).join(' ');

type Trouve = GestionnaireSyndic & { rattache: boolean };
type Lu = { etat: 'ok'; syndic: { id: number; nom: string }; contacts: Trouve[]; total: number } | { etat: 'sans_syndic' };

export function ContactsSyndicCopropriete({ immeuble, syndicNom, gestionnaires, onChange }: {
  immeuble: string; syndicNom: string; gestionnaires: readonly GestionnaireSyndic[]; onChange: (g: GestionnaireSyndic[]) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState('');
  const [lu, setLu] = useState<Lu | null>(null);
  const [choisis, setChoisis] = useState<number[]>([]);
  const [aDetacher, setADetacher] = useState<GestionnaireSyndic | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [version, setVersion] = useState(0);

  // la recherche dans l'annuaire complet du syndic (200 ms après la frappe, la précédente annulée)
  useEffect(() => {
    if (!ouvert) return;
    const c = new AbortController();
    const t = setTimeout(() => {
      fetch(`${API}?contactsSyndic=${encodeURIComponent(immeuble)}&q=${encodeURIComponent(q.trim())}`, { cache: 'no-store', signal: c.signal })
        .then((r) => r.json() as Promise<Lu>).then((d) => { if (!c.signal.aborted) setLu(d); })
        .catch((e: unknown) => { if ((e as Error)?.name !== 'AbortError') setMotif('La recherche n’a pas pu être faite : le serveur n’a pas répondu.'); });
    }, 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [ouvert, q, immeuble, version]);

  const poster = async (corps: Record<string, unknown>): Promise<boolean> => {
    setEnvoi(true); setMotif(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corps, immeuble }) });
      const d = await r.json().catch(() => ({})) as { etat?: string; motif?: string; gestionnaires?: GestionnaireSyndic[] };
      if (d.etat === 'ok' && Array.isArray(d.gestionnaires)) { onChange(d.gestionnaires); setVersion((v) => v + 1); return true; }
      setMotif(d.motif ?? 'Le geste n’a pas pu être enregistré.');
      return false;
    } catch {
      setMotif('Le geste n’a pas pu être enregistré : le serveur n’a pas répondu.');
      return false;
    } finally { setEnvoi(false); }
  };
  const rattacher = async (): Promise<void> => {
    if (choisis.length === 0 || envoi) return;
    if (await poster({ action: 'rattacher-contacts-syndic', contactIds: choisis })) setChoisis([]);
  };
  const detacher = async (): Promise<void> => {
    if (aDetacher === null || envoi) return;
    if (await poster({ action: 'detacher-contact-syndic', contactId: aDetacher.id })) setADetacher(null);
  };
  const basculer = (id: number): void => setChoisis((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  return (
    <div data-fcp-gestionnaires>
      <style>{CSS_CSC}</style>
      <p className="fcp-sous-titre">Contact(s) syndic de cette copropriété</p>
      {gestionnaires.length === 0 ? <p className="loc-muet fcp-sans-marge" data-csc-aucun>Aucun gestionnaire affecté.</p> : (
        <ul className="fcp-liste">{gestionnaires.map((g) => (
          <li key={g.id} className="csc-ligne" data-csc-rattache={g.id}>
            <span className="csc-texte"><strong>{nomGestionnaire(g)}</strong>
              {g.titre ? <span className="loc-muet"> · {g.titre}</span> : null}{g.coordonnees.map((k, i) => <span key={i} className="fcp-coord"> · {k.valeur}</span>)}</span>
            <button type="button" className="csc-moins" onClick={() => { setMotif(null); setADetacher(g); }} disabled={envoi}
              aria-label={`Détacher ${nomGestionnaire(g)} de cette copropriété`} title="Détacher de cette copropriété" data-csc-detacher={g.id}>−</button>
          </li>))}</ul>)}

      {aDetacher !== null && (
        <div className="csc-confirmation" role="alertdialog" aria-label="Détacher ce contact" data-csc-confirmer-detacher={aDetacher.id}>
          <p className="fcp-sans-marge">Détacher <strong>{nomGestionnaire(aDetacher)}</strong> de cette copropriété ? Il reste dans l’annuaire de {syndicNom}.</p>
          <div className="csc-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" onClick={() => setADetacher(null)} disabled={envoi} data-csc-annuler>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn fcp-mini" onClick={() => { void detacher(); }} disabled={envoi} data-csc-confirmer>
              {envoi ? 'Détachement…' : 'Détacher'}</button>
          </div>
        </div>)}

      <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" onClick={() => { setOuvert((o) => !o); setMotif(null); }} aria-expanded={ouvert}
        data-csc-ouvrir>+ Rattacher un contact du syndic</button>
      {ouvert && (
        <div className="fcp-ajout" data-csc-recherche>
          <label className="fcp-champ"><span>Rechercher dans l’annuaire de {syndicNom}</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="nom, prénom, fonction, téléphone, e-mail" data-csc-q autoFocus /></label>
          {lu === null ? <p className="loc-muet fcp-sans-marge" role="status">Recherche…</p>
            : lu.etat === 'sans_syndic' ? <p className="loc-muet fcp-sans-marge">Cette copropriété n’a pas encore de syndic enregistré.</p>
            : (
              <>
                <p className="loc-muet fcp-sans-marge" data-csc-total>{lu.total === 0 ? `Aucun contact de ${lu.syndic.nom} ne correspond.`
                  : `${lu.total} contact${lu.total > 1 ? 's' : ''} dans l’annuaire de ${lu.syndic.nom}${lu.total > lu.contacts.length ? ` (les ${lu.contacts.length} premiers)` : ''}.`}</p>
                <ul className="fcp-liste csc-resultats">{lu.contacts.map((c) => (
                  <li key={c.id}>
                    <label className={`csc-choix${c.rattache ? ' csc-choix--deja' : ''}`} data-csc-resultat={c.id}>
                      <input type="checkbox" checked={c.rattache || choisis.includes(c.id)} disabled={c.rattache || envoi} onChange={() => basculer(c.id)} />
                      <span><strong>{nomGestionnaire(c)}</strong>{c.titre ? <span className="loc-muet"> · {c.titre}</span> : null}
                        {c.coordonnees.map((k, i) => <span key={i} className="fcp-coord"> · {k.valeur}</span>)}
                        {c.rattache && <span className="csc-deja" data-csc-deja> · déjà rattaché</span>}</span>
                    </label>
                  </li>))}</ul>
                <button type="button" className="svv-btn svv-btn-primary gst-btn fcp-mini" onClick={() => { void rattacher(); }} disabled={choisis.length === 0 || envoi}
                  data-csc-rattacher>{envoi ? 'Rattachement…' : `Rattacher à cette copropriété${choisis.length > 0 ? ` (${choisis.length})` : ''}`}</button>
              </>)}
        </div>)}
      {motif !== null && <p className="fcp-alerte" role="alert" data-csc-motif>{motif}</p>}
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons --color-svv-* seulement ; cibles de 44 px. */
const CSS_CSC = `
.csc-ligne{display:flex;align-items:center;gap:8px;justify-content:space-between}
.csc-texte{min-width:0;overflow-wrap:anywhere}
.csc-moins{flex:0 0 auto;width:44px;height:44px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-red);font:inherit;font-size:1.3rem;font-weight:800;cursor:pointer}
.csc-moins:focus-visible{outline:2px solid var(--color-svv-line-strong-hover);outline-offset:2px}
.csc-confirmation{margin:8px 0;padding:10px 12px;border:1px solid var(--color-svv-line-strong);border-radius:12px;background:var(--color-svv-field);display:flex;flex-direction:column;gap:8px}
.csc-boutons{display:flex;flex-wrap:wrap;gap:8px}
.csc-resultats li{list-style:none}
.csc-choix{display:flex;align-items:flex-start;gap:10px;min-height:44px;padding:6px 0;cursor:pointer;overflow-wrap:anywhere}
.csc-choix input{width:22px;height:22px;flex:0 0 auto;margin-top:2px}
.csc-choix--deja{cursor:default;color:var(--color-svv-muted)}
.csc-deja{color:var(--color-svv-green-ink);font-weight:700}
`;
