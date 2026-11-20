'use client';

import { useEffect, useRef, useState } from 'react';
import { nomAvecVille } from '../../../../lib/gestion/syndics';
import { TITRE_HORS_COPROPRIETE, type LigneCopropriete } from '../../../../lib/gestion/copropriete';
import { FicheCopropriete } from './FicheCopropriete';

/**
 * ══ 🔴🔴 L'ÉCRAN « COPROPRIÉTÉS » (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 4) ══════════════════════════════════════════════════════
 * Juste sous « Syndics » : TOUS les immeubles du portefeuille — une copropriété encore non enregistrée y figure, et sa fiche se crée au premier
 * « Valider ». Une ligne par copropriété : son nom, ses adresses, son syndic, le nombre de biens, « Bien hors copropriété » le cas échéant ;
 * une recherche (nom, adresse, syndic) ; chaque ligne ouvre la fiche copropriété. Comme l'écran des syndics, il ne dépend de rien de l'écran
 * hôte (Gestion, ou la page de la Location) : il reçoit son retour, et éventuellement une copropriété à ouvrir dès l'arrivée.
 */
const API = '/api/admin/gestion/coproprietes/liste';
type Ligne = Omit<LigneCopropriete, 'cherchable'>;

/* ══ 🔴🔴 (Arno, 19/11/2026) LES COPROPRIÉTÉS EN DOUBLE PAR VARIANTES D'ADRESSE (migration 504) ══════════════════════════════════════════════════
 * Cocher plusieurs fiches → « Regrouper… » : une fenêtre récapitule (l'adresse principale à choisir, les écritures qui deviennent ses adresses
 * secondaires, les biens qui suivent), puis confirme. Les propositions (« Ces N fiches semblent être la même copropriété — Regrouper ? ») viennent
 * d'une comparaison tolérante ; « Ignorer » est mémorisé. Un regroupement se défait (« Dégrouper »). JAMAIS de fusion automatique ; les adresses
 * des biens et les données WIPPIMMO ne sont jamais modifiées. */
const API_REGROUPEMENT = '/api/admin/gestion/coproprietes/regroupement';
interface FicheProposee { cle: string; immeuble: string; nbBiens: number; declaree: boolean }
interface Proposition { cles: string[]; principale: string; signature: string; fiches: FicheProposee[] }
interface Regroupement { id: number; cle: string; principale: string; regroupees: string[]; le: string; par: string }
interface Regroupements { propositions: Proposition[]; regroupements: Regroupement[]; disponible: boolean }
const PROPOSITIONS_VISIBLES = 3;
/* 🔴 (Arno, 20/11/2026, « Adresse officielle BAN », lot 4) l'adresse officielle de chaque ligne, lue À PART (calcul en direct, mémorisé 10 minutes côté
   serveur) : la liste s'affiche sans l'attendre, puis le libellé officiel, les adresses officielles et la pastille « à vérifier » s'y posent */
const API_OFFICIELLES = '/api/admin/gestion/coproprietes/officielles';
interface LigneOfficielle { principale: string; court: string; adresses: string[]; aVerifier: boolean }
const guillemets = (xs: readonly string[]): string => xs.map((x) => `« ${x} »`).join(', ');
const jour = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }); };
const biens = (n: number): string => `${n} bien${n > 1 ? 's' : ''}`;

export function EcranCoproprietes({ retour = null, ouvrirDepart = null }: { retour?: React.ReactNode; ouvrirDepart?: string | null }) {
  const [q, setQ] = useState('');
  const [liste, setListe] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [ouverte, setOuverte] = useState<string | null>(ouvrirDepart);
  const [rg, setRg] = useState<Regroupements | null>(null);
  const [coches, setCoches] = useState<string[]>([]);
  const [toutesPropositions, setToutesPropositions] = useState(false);
  const [aRegrouper, setARegrouper] = useState<{ fiches: FicheProposee[]; principale: string } | null>(null);
  const [aDegrouper, setADegrouper] = useState<Regroupement | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [refusModale, setRefusModale] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const connues = useRef(new Map<string, FicheProposee>());
  const [officielles, setOfficielles] = useState<Record<string, LigneOfficielle>>({});
  useEffect(() => {
    let vivant = true;
    fetch(API_OFFICIELLES, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: { lignes: Record<string, LigneOfficielle> } }>)
      .then((j) => { if (vivant && j.etat === 'ok' && j.data) setOfficielles(j.data.lignes); }).catch(() => undefined);
    return () => { vivant = false; };
  }, [version]);
  useEffect(() => {
    let vivant = true;
    fetch(API_REGROUPEMENT, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: Regroupements }>)
      .then((j) => { if (vivant) setRg(j.etat === 'ok' && j.data ? j.data : null); }).catch(() => { if (vivant) setRg(null); });
    return () => { vivant = false; };
  }, [version]);
  useEffect(() => {
    let vivant = true;
    const t = setTimeout(() => {
      fetch(`${API}?q=${encodeURIComponent(q)}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: { lignes: Ligne[] }; message?: string }>)
        .then((j) => { if (!vivant) return; if (j.etat === 'ok' && j.data) { for (const l of j.data.lignes) connues.current.set(l.cle, { cle: l.cle, immeuble: l.immeuble, nbBiens: l.nbBiens, declaree: l.declaree }); setListe(j.data.lignes); setErreur(null); } else { setListe([]); setErreur(j.message ?? 'Lecture impossible.'); } })
        .catch(() => { if (vivant) { setListe([]); setErreur('Lecture impossible : le serveur n’a pas répondu.'); } });
    }, 200);
    return () => { vivant = false; clearTimeout(t); };
  }, [q, version]);
  const cocher = (cle: string, oui: boolean) => setCoches((c) => (oui ? [...c.filter((x) => x !== cle), cle] : c.filter((x) => x !== cle)));
  const ouvrirRegroupement = (fiches: FicheProposee[], principale?: string) => {
    const p = principale ?? (fiches.find((f) => f.declaree) ?? [...fiches].sort((a, b) => b.nbBiens - a.nbBiens)[0])?.cle ?? '';
    setRefusModale(null); setMessage(null); setARegrouper({ fiches, principale: p });
  };
  const envoyer = async (corps: Record<string, unknown>): Promise<{ ok: true; message: string } | { ok: false; motif: string }> => {
    setEnvoi(true);
    try {
      const r = await fetch(API_REGROUPEMENT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const j = await r.json() as { etat?: string; data?: { message?: string }; motif?: string; message?: string };
      return j.etat === 'ok' ? { ok: true, message: j.data?.message ?? '' } : { ok: false, motif: j.motif ?? j.message ?? 'Enregistrement impossible. Rien n’est enregistré.' };
    } catch { return { ok: false, motif: 'Le serveur n’a pas répondu. Rien n’est enregistré.' }; } finally { setEnvoi(false); }
  };
  const confirmerRegroupement = async () => {
    if (aRegrouper === null) return;
    const r = await envoyer({ action: 'regrouper', principale: aRegrouper.principale, cles: aRegrouper.fiches.map((f) => f.cle) });
    if (!r.ok) { setRefusModale(r.motif); return; }
    setARegrouper(null); setCoches([]); setMessage(r.message); setVersion((v) => v + 1);
  };
  const confirmerDegroupement = async () => {
    if (aDegrouper === null) return;
    const r = await envoyer({ action: 'degrouper', id: aDegrouper.id });
    if (!r.ok) { setRefusModale(r.motif); return; }
    setADegrouper(null); setMessage(r.message); setVersion((v) => v + 1);
  };
  const ignorer = async (p: Proposition) => {
    setMessage(null);
    const r = await envoyer({ action: 'ignorer', cles: p.cles });
    if (!r.ok) { setErreur(r.motif); return; }
    setMessage(`Proposition ignorée : ${guillemets(p.fiches.map((f) => f.immeuble))}. Elle ne reviendra pas, sauf si une nouvelle écriture s’y ajoute.`); setVersion((v) => v + 1);
  };
  const propositions = rg?.propositions ?? [];
  const visibles = toutesPropositions ? propositions : propositions.slice(0, PROPOSITIONS_VISIBLES);
  const fichesCochees = coches.map((k) => connues.current.get(k)).filter((f): f is FicheProposee => f !== undefined);
  return (
    <section className="ecp" aria-labelledby="ecp-titre" data-ecran-coproprietes>
      <style>{CSS_ECRAN_COPROPRIETES}</style>
      <div className="ecp-tete">
        {retour}
        <h2 className="ecp-titre" id="ecp-titre">Copropriétés {liste !== null && <span className="gst-compte" data-ecp-compte>{liste.length}</span>}</h2>
      </div>
      <p className="ecp-discret ecp-sans-marge">Tous les immeubles du portefeuille ; une copropriété pas encore enregistrée a sa fiche créée au premier « Valider ».</p>
      <label className="ecp-recherche">
        <span className="ecp-sr">Rechercher une copropriété</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : nom, adresse, syndic…" data-ecp-recherche />
      </label>
      {erreur !== null && <p className="cp-refus" role="alert">{erreur}</p>}
      {message !== null && <p className="ecp-message" role="status" data-ecp-message>{message}</p>}
      {visibles.map((p) => (
        <div key={p.signature} className="ecp-proposition" data-ecp-proposition={p.signature}>
          <p className="ecp-proposition-titre">Ces {p.fiches.length} fiches semblent être la même copropriété — Regrouper ?</p>
          <p className="ecp-proposition-fiches">{p.fiches.map((f) => `« ${f.immeuble} » (${biens(f.nbBiens)})`).join(' · ')}</p>
          <div className="ecp-actions">
            <button type="button" className="svv-btn svv-btn-primary gst-btn ecp-btn" onClick={() => ouvrirRegroupement(p.fiches, p.principale)} disabled={envoi} data-ecp-proposition-regrouper>Regrouper…</button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn ecp-btn" onClick={() => { void ignorer(p); }} disabled={envoi} data-ecp-ignorer>Ignorer</button>
          </div>
        </div>
      ))}
      {propositions.length > PROPOSITIONS_VISIBLES && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn ecp-btn ecp-btn-seul" onClick={() => setToutesPropositions((t) => !t)} aria-expanded={toutesPropositions} data-ecp-autres-propositions>
          {toutesPropositions ? 'Afficher moins de propositions' : `Afficher les ${propositions.length - PROPOSITIONS_VISIBLES} autres propositions`}
        </button>
      )}
      {coches.length > 0 && (
        <div className="ecp-selection" data-ecp-selection>
          <span>{coches.length} fiche{coches.length > 1 ? 's' : ''} cochée{coches.length > 1 ? 's' : ''}</span>
          <div className="ecp-actions">
            <button type="button" className="svv-btn svv-btn-primary gst-btn ecp-btn" disabled={fichesCochees.length < 2 || envoi} onClick={() => ouvrirRegroupement(fichesCochees)} data-ecp-regrouper>Regrouper…</button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn ecp-btn" onClick={() => setCoches([])} data-ecp-decocher>Tout décocher</button>
          </div>
        </div>
      )}
      {liste === null ? <p className="ecp-discret">Chargement…</p> : liste.length === 0 ? (
        <p className="ecp-discret" data-ecp-vide>{q.trim() === '' ? 'Aucun immeuble dans le portefeuille.' : 'Aucune copropriété ne répond à cette recherche.'}</p>
      ) : (
        <ul className="ecp-liste">
          {liste.map((c) => { const o = officielles[c.cle]; const avecOfficielle = o !== undefined && o.principale !== ''; return (
            <li key={c.cle} className="ecp-item">
              <label className="ecp-coche" title="Cocher pour regrouper">
                <input type="checkbox" checked={coches.includes(c.cle)} onChange={(e) => cocher(c.cle, e.target.checked)} data-ecp-coche={c.cle} />
                <span className="ecp-sr">Cocher « {c.nom} » pour la regrouper</span>
              </label>
              <button type="button" className="ecp-ligne" onClick={() => setOuverte(c.immeuble)} data-ecp-ligne={c.cle}>
                <span className="ecp-nom" {...(avecOfficielle && c.nom === c.immeuble ? { 'data-ecp-officielle': '' } : {})}>{avecOfficielle && c.nom === c.immeuble ? o.court : c.nom}
                  {c.hors && <span className="ecp-hors" data-ecp-hors> · {TITRE_HORS_COPROPRIETE}</span>}
                  {!c.declaree && <span className="ecp-discret" data-ecp-a-creer> · fiche à créer</span>}
                  {o?.aVerifier && <span className="ecp-a-verifier" data-ecp-a-verifier> · à vérifier</span>}</span>
                <span className="ecp-adresses" data-ecp-adresses>{(avecOfficielle ? o.adresses : c.adresses).join(' · ')}</span>
                <span className="ecp-chiffres">
                  <span data-ecp-syndic>{c.syndic === null ? (c.hors ? 'sans syndic' : 'aucun syndic lié') : `Syndic : ${nomAvecVille(c.syndic.nom, c.syndic.ville)}`}</span>
                  {' · '}<span data-ecp-biens>{c.nbBiens} bien{c.nbBiens > 1 ? 's' : ''}</span>
                </span>
              </button>
              {(rg?.regroupements ?? []).filter((r) => r.cle === c.cle).map((r) => (
                <div key={r.id} className="ecp-regroupe" data-ecp-regroupement={r.id}>
                  <span className="ecp-discret">Regroupe {guillemets(r.regroupees)} (le {jour(r.le)}, par {r.par})</span>
                  <button type="button" className="svv-btn svv-btn-outline gst-btn ecp-btn" disabled={envoi} onClick={() => { setRefusModale(null); setMessage(null); setADegrouper(r); }} data-ecp-degrouper={r.id}>Dégrouper…</button>
                </div>
              ))}
            </li>
          ); })}
        </ul>
      )}
      {ouverte !== null && <FicheCopropriete immeuble={ouverte} onFerme={() => { setOuverte(null); setVersion((v) => v + 1); }} />}
      {aRegrouper !== null && (
        <ModaleRegrouper fiches={aRegrouper.fiches} principale={aRegrouper.principale} disponible={rg?.disponible !== false} envoi={envoi} refus={refusModale}
          onPrincipale={(p) => setARegrouper({ ...aRegrouper, principale: p })} onConfirmer={() => { void confirmerRegroupement(); }} onAnnuler={() => setARegrouper(null)} />
      )}
      {aDegrouper !== null && (
        <Modale titre="Dégrouper ?" donnee="degrouper" envoi={envoi} refus={refusModale} libelleConfirmer="Confirmer le dégroupement"
          onConfirmer={() => { void confirmerDegroupement(); }} onAnnuler={() => setADegrouper(null)}>
          <p>{guillemets(aDegrouper.regroupees)} ne {aDegrouper.regroupees.length > 1 ? 'seront plus des adresses' : 'sera plus une adresse'} de la copropriété « {aDegrouper.principale} ».</p>
          <p>Leurs biens redeviennent leurs propres fiches, sans syndic (s’ils avaient celui de cette copropriété, son retrait est noté dans leur historique).
            Les adresses des biens et les données WIPPIMMO ne sont pas modifiées.</p>
        </Modale>
      )}
    </section>
  );
}

/** Une fenêtre de confirmation (voile, titre, contenu, refus éventuel, « Annuler » / confirmer) ; Échap ferme, le focus va au premier bouton. */
function Modale({ titre, donnee, children, envoi, refus, libelleConfirmer, confirmerDesactive = false, onConfirmer, onAnnuler }: {
  titre: string; donnee: string; children: React.ReactNode; envoi: boolean; refus: string | null; libelleConfirmer: string; confirmerDesactive?: boolean;
  onConfirmer: () => void; onAnnuler: () => void;
}) {
  const id = `ecp-modale-${donnee}`;
  const annuler = useRef<HTMLButtonElement>(null);
  useEffect(() => { annuler.current?.focus(); }, []);
  return (
    <div className="ecp-voile" onKeyDown={(e) => { if (e.key === 'Escape' && !envoi) onAnnuler(); }}>
      <div className="ecp-boite" role="dialog" aria-modal="true" aria-labelledby={id} data-ecp-modale={donnee}>
        <h3 id={id} className="ecp-boite-titre">{titre}</h3>
        <div className="ecp-boite-corps">{children}</div>
        {refus !== null && <p className="cp-refus" role="alert" data-ecp-refus>{refus}</p>}
        <div className="ecp-actions ecp-actions-fin">
          <button ref={annuler} type="button" className="svv-btn svv-btn-outline gst-btn ecp-btn" onClick={onAnnuler} disabled={envoi}>Annuler</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn ecp-btn" onClick={onConfirmer} disabled={envoi || confirmerDesactive} data-ecp-confirmer>
            {envoi ? 'Enregistrement…' : libelleConfirmer}</button>
        </div>
      </div>
    </div>
  );
}

/** « Regrouper » : l'adresse principale à choisir, et le récapitulatif de ce qui va changer — avant toute écriture. */
function ModaleRegrouper({ fiches, principale, disponible, envoi, refus, onPrincipale, onConfirmer, onAnnuler }: {
  fiches: FicheProposee[]; principale: string; disponible: boolean; envoi: boolean; refus: string | null;
  onPrincipale: (cle: string) => void; onConfirmer: () => void; onAnnuler: () => void;
}) {
  const p = fiches.find((f) => f.cle === principale) ?? null;
  const autres = fiches.filter((f) => f.cle !== principale);
  const bloquee = autres.find((f) => f.declaree) ?? null;
  const n = autres.reduce((s, f) => s + f.nbBiens, 0);
  const empechement = !disponible ? 'Le regroupement demande la mise à jour de la base (migration 504) : rien ne peut être enregistré pour l’instant.'
    : bloquee !== null ? `« ${bloquee.immeuble} » a déjà sa fiche enregistrée : elle ne peut être que l’adresse principale (ou se regrouper depuis sa fiche).` : null;
  return (
    <Modale titre={`Regrouper ${fiches.length} fiches en une copropriété`} donnee="regrouper" envoi={envoi} refus={refus ?? empechement}
      libelleConfirmer="Confirmer le regroupement" confirmerDesactive={p === null || autres.length === 0 || empechement !== null} onConfirmer={onConfirmer} onAnnuler={onAnnuler}>
      <fieldset className="ecp-choix">
        <legend>Adresse principale</legend>
        {fiches.map((f) => (
          <label key={f.cle} className="ecp-choix-ligne">
            <input type="radio" name="ecp-principale" checked={f.cle === principale} onChange={() => onPrincipale(f.cle)} data-ecp-principale={f.cle} />
            <span>« {f.immeuble} » <span className="ecp-discret">({biens(f.nbBiens)}{f.declaree ? ', fiche enregistrée' : ''})</span></span>
          </label>
        ))}
      </fieldset>
      {p !== null && autres.length > 0 && (
        <div className="ecp-recap" data-ecp-recap>
          <p>« {p.immeuble} » reste l’adresse principale.</p>
          <p>{autres.length > 1 ? 'Deviennent ses adresses secondaires' : 'Devient son adresse secondaire'} : {guillemets(autres.map((f) => f.immeuble))}.</p>
          <p>{biens(n)} {n > 1 ? 'rejoignent' : 'rejoint'} cette copropriété, et son syndic s’il y en a un.</p>
          <p className="ecp-discret">Les adresses des biens et les données WIPPIMMO ne sont pas modifiées. Le regroupement est noté dans l’historique des biens ; « Dégrouper » le défait.</p>
        </div>
      )}
    </Modale>
  );
}

/* Jetons --color-svv-* uniquement. AUCUN ACCENT GRAVE dans ce litteral. Telephone : tout passe a la ligne. */
export const CSS_ECRAN_COPROPRIETES = `
.ecp{display:flex;flex-direction:column;gap:.7rem;min-width:0;padding:4px 0}
.ecp-tete{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.ecp-titre{margin:0;font-size:1.1rem;font-weight:700;color:var(--color-svv-ink);flex:1 1 auto}
.ecp-recherche input{width:100%;min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid var(--color-svv-line-strong);box-sizing:border-box;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:16px}
.ecp-sr{position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ecp-discret{color:var(--color-svv-muted);font-size:.85rem}
.ecp-sans-marge{margin:0}
.ecp-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.4rem}
.ecp-ligne{width:100%;min-height:44px;display:flex;flex-direction:column;gap:.2rem;text-align:left;cursor:pointer;box-sizing:border-box;
  padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;min-width:0}
.ecp-ligne:hover,.ecp-ligne:focus-visible{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
.ecp-nom{font-weight:700;overflow-wrap:anywhere}
.ecp-hors{color:var(--color-svv-orange);font-weight:800}
.ecp-a-verifier{color:var(--color-svv-orange);font-weight:800}
.ecp-adresses{font-size:.88rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.ecp-chiffres{font-size:.88rem;overflow-wrap:anywhere}
.ecp-item{display:grid;grid-template-columns:44px minmax(0,1fr);column-gap:.3rem;row-gap:.3rem;align-items:start}
.ecp-coche{display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;cursor:pointer}
.ecp-coche input{width:20px;height:20px;margin:0;accent-color:var(--color-svv-ink);cursor:pointer}
.ecp-regroupe{grid-column:2;display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .7rem;overflow-wrap:anywhere}
.ecp-btn{min-height:44px}
.ecp-btn-seul{align-self:flex-start}
.ecp-actions{display:flex;flex-wrap:wrap;gap:.5rem}
.ecp-actions-fin{justify-content:flex-end}
.ecp-message{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border:1px solid var(--color-svv-green);overflow-wrap:anywhere}
.ecp-proposition{display:flex;flex-direction:column;gap:.4rem;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-orange);background:var(--color-svv-orange-soft);color:var(--color-svv-ink)}
.ecp-proposition-titre{margin:0;font-weight:700}
.ecp-proposition-fiches{margin:0;font-size:.88rem;overflow-wrap:anywhere}
.ecp-selection{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;padding:8px 12px;border-radius:10px;
  border:1px solid var(--color-svv-line-strong);background:var(--color-svv-field);color:var(--color-svv-ink)}
.ecp-voile{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;
  background:color-mix(in srgb,var(--color-svv-ink) 45%,transparent)}
.ecp-boite{width:min(560px,100%);max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;padding:16px;border-radius:14px;
  background:var(--color-svv-surface);color:var(--color-svv-ink);border:1px solid var(--color-svv-line-strong);display:flex;flex-direction:column;gap:.7rem}
.ecp-boite-titre{margin:0;font-size:1.05rem;font-weight:700}
.ecp-boite-corps{display:flex;flex-direction:column;gap:.5rem;overflow-wrap:anywhere}
.ecp-boite-corps p{margin:0}
.ecp-choix{margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:.2rem;min-width:0}
.ecp-choix legend{font-weight:700;margin-bottom:.3rem;padding:0}
.ecp-choix-ligne{display:flex;align-items:center;gap:.6rem;min-height:44px;cursor:pointer;overflow-wrap:anywhere}
.ecp-choix-ligne input{width:20px;height:20px;margin:0;flex:0 0 auto;accent-color:var(--color-svv-ink)}
.ecp-recap{display:flex;flex-direction:column;gap:.35rem;padding:10px 12px;border-radius:10px;background:var(--color-svv-field);border:1px solid var(--color-svv-line)}
`;
