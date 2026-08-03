'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { type Lot, type DiagnosticProposition, expliquerProposition, resumeDiagnostic, ancreDetail, ETIQUETTE_PROFIL, type ProfilDemandeur } from '../../../../lib/sitadel/demande';
import type { DemandeListe, DemandeDetail, ResumeDemandes, AlerteIdentite } from '../../../../lib/sitadel/demandeRepo';
import { OrigineDest } from './DemandesRendu';
import { BlocPrada } from './BlocPrada';
import { BlocDepot } from './BlocDepot';

/**
 * Gestion des demandes de communication (S7 / S7b / S7e). Deux profils de demandeur (Société / Personne physique) :
 * chaque demande porte le sien ; une bascule EN UN CLIC (sur brouillon) régénère le texte après confirmation. Colonne et
 * filtre « profil ». ⚠️ AUCUNE action d'envoi (préparation et revue seulement).
 */
const STATUT_LIBELLE: Record<string, string> = { brouillon: 'brouillon', prete: 'prête', envoyee: 'envoyée', close: 'close', abandonnee: 'abandonnée' };
const PROFILS: ProfilDemandeur[] = ['entreprise', 'personne'];
const PAGE_SIZE = 20;
const styleChamp: CSSProperties = { padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 };

type Tri = 'recent' | 'reference' | 'commune' | 'statut';
type Bascule = { ids: number[]; profil: ProfilDemandeur };

/** Message d'échec = la RAISON réelle renvoyée par le serveur ({erreur}), jamais un libellé figé à deux mots. */
async function erreurServeur(res: Response, repli: string): Promise<string> {
  try { const d = (await res.json()) as { erreur?: string }; return d?.erreur && d.erreur.trim() !== '' ? d.erreur : repli; }
  catch { return repli; }
}

export function DemandesVue() {
  const [liste, setListe] = useState<{ demandes: DemandeListe[]; alertesIdentite: AlerteIdentite[]; resume: ResumeDemandes } | null>(null);
  const [prop, setProp] = useState<{ lots: Lot[]; diagnostic: DiagnosticProposition; profil: ProfilDemandeur } | null>(null);
  const [profilPrep, setProfilPrep] = useState<ProfilDemandeur>('entreprise');
  const [detail, setDetail] = useState<DemandeDetail | null>(null);
  const [corps, setCorps] = useState('');
  const [msg, setMsg] = useState('');
  const [version, setVersion] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [fStatut, setFStatut] = useState('');
  const [fCommune, setFCommune] = useState('');
  const [fProfil, setFProfil] = useState('');
  const [tri, setTri] = useState<Tri>('recent');
  const [page, setPage] = useState(1);
  const [confBascule, setConfBascule] = useState<Bascule | null>(null); // confirmation avant régénération

  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes', { cache: 'no-store' });
        if (!annule && res.ok) setListe((await res.json()) as { demandes: DemandeListe[]; alertesIdentite: AlerteIdentite[]; resume: ResumeDemandes });
      } catch { /* liste indisponible */ }
    })();
    return () => { annule = true; };
  }, [version]);

  const filtrees = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const qc = norm(fCommune.trim());
    let l = (liste?.demandes ?? []).filter((d) =>
      (fStatut === '' || d.statut === fStatut) &&
      (fProfil === '' || d.profil === fProfil) &&
      (qc === '' || norm(d.communeNom ?? d.codeInsee).includes(qc) || d.codeInsee.startsWith(qc)));
    l = [...l].sort((a, b) => {
      if (tri === 'reference') return a.reference.localeCompare(b.reference);
      if (tri === 'commune') return (a.communeNom ?? a.codeInsee).localeCompare(b.communeNom ?? b.codeInsee);
      if (tri === 'statut') return a.statut.localeCompare(b.statut);
      return b.creeLe.localeCompare(a.creeLe);
    });
    return l;
  }, [liste, fStatut, fCommune, fProfil, tri]);

  const nbPages = Math.max(1, Math.ceil(filtrees.length / PAGE_SIZE));
  const pageCourante = Math.min(page, nbPages);
  const visibles = filtrees.slice((pageCourante - 1) * PAGE_SIZE, pageCourante * PAGE_SIZE);
  const majFiltre = (fn: () => void): void => { fn(); setPage(1); };

  const basculer = (id: number): void => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toutSelectionner = (): void => setSel((s) => {
    const tousVisibles = visibles.every((d) => s.has(d.id));
    const n = new Set(s);
    for (const d of visibles) { if (tousVisibles) n.delete(d.id); else n.add(d.id); }
    return n;
  });

  async function preparer(): Promise<void> {
    setMsg('');
    const res = await fetch(`/api/admin/permis/demandes/proposition?profil=${profilPrep}`, { cache: 'no-store' });
    if (res.ok) { const p = (await res.json()) as { lots: Lot[]; diagnostic: DiagnosticProposition; profil: ProfilDemandeur }; setProp(p); setProfilPrep(p.profil); }
    else setMsg(await erreurServeur(res, 'Proposition indisponible.'));
  }
  async function creer(): Promise<void> {
    const res = await fetch('/api/admin/permis/demandes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profil: profilPrep }) });
    if (res.ok) {
      const r = (await res.json()) as { crees: string[]; ignores: number; profil: ProfilDemandeur };
      setMsg(`${r.crees.length} demande(s) créée(s) en ${ETIQUETTE_PROFIL[r.profil].toLowerCase()}${r.ignores ? `, ${r.ignores} lot(s) ignoré(s)` : ''}.`);
      setProp(null); rafraichir();
    } else setMsg(await erreurServeur(res, 'Création impossible.'));
  }
  async function ouvrir(id: number): Promise<void> {
    setMsg('');
    const res = await fetch(`/api/admin/permis/demandes/${id}`, { cache: 'no-store' });
    if (res.ok) { const d = (await res.json()) as DemandeDetail; setDetail(d); setCorps(d.corps ?? ''); }
    else setMsg(await erreurServeur(res, 'Ouverture impossible.'));
  }
  async function sauverCorps(): Promise<void> {
    if (!detail) return;
    const res = await fetch(`/api/admin/permis/demandes/${detail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ corps }) });
    if (res.ok) { setDetail((await res.json()) as DemandeDetail); setMsg('Texte enregistré.'); }
  }
  async function transition(ids: number[], statut: 'prete' | 'abandonnee'): Promise<void> {
    if (ids.length === 0) return;
    const res = await fetch('/api/admin/permis/demandes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, statut }) });
    if (res.ok) {
      const r = (await res.json()) as { traites: number };
      setMsg(`${r.traites} demande(s) ${statut === 'prete' ? 'marquée(s) prête(s)' : 'abandonnée(s)'}.`);
      setSel(new Set()); if (detail && ids.includes(detail.id)) void ouvrir(detail.id); rafraichir();
      return;
    }
    if (res.status === 409) {
      const d = (await res.json()) as { champs?: string[] };
      setMsg(`Aucune demande modifiée : identité du demandeur incomplète — ${(d.champs ?? []).join(' ; ')}. Complétez la configuration dans l’onglet Réglages.`);
    } else setMsg(await erreurServeur(res, 'Action impossible.'));
  }
  /** Applique la bascule de profil confirmée (régénère le texte). Un seul refus ⇒ zéro écriture (tout-ou-rien serveur). */
  async function appliquerBascule(): Promise<void> {
    if (!confBascule) return;
    const { ids, profil } = confBascule;
    setConfBascule(null);
    const res = await fetch('/api/admin/permis/demandes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, profil }) });
    if (res.ok) {
      const r = (await res.json()) as { traites: number };
      setMsg(`${r.traites} demande(s) basculée(s) en ${ETIQUETTE_PROFIL[profil].toLowerCase()} (texte régénéré).`);
      setSel(new Set()); if (detail && ids.includes(detail.id)) void ouvrir(detail.id); rafraichir();
      return;
    }
    if (res.status === 409) { const d = (await res.json()) as { erreur?: string }; setMsg(`Aucune bascule : ${d.erreur ?? 'transition interdite'}.`); }
    else setMsg(await erreurServeur(res, 'Bascule impossible.'));
  }

  const r = liste?.resume;
  const explication = prop ? expliquerProposition(prop.lots.length, prop.diagnostic) : '';
  const selProfil = (id: string) => id as ProfilDemandeur;

  return (
    <div className="flex flex-col gap-4">
      {r && (
        <div className="svv-card" style={{ fontSize: 13 }}>
          <strong>{r.total} demande(s)</strong> · {r.dossiersCouverts} dossier(s) couvert(s) — {['brouillon', 'prete', 'envoyee', 'close', 'abandonnee'].filter((s) => r.parStatut[s]).map((s) => `${r.parStatut[s]} ${STATUT_LIBELLE[s]}`).join(' · ') || 'aucune'}.
          <div style={{ color: 'var(--color-svv-muted)', marginTop: '.3rem' }}>
            À ce stade, <strong>rien n&rsquo;est envoyé</strong> : cet écran prépare et permet de relire les demandes. L&rsquo;envoi est une étape ultérieure.
          </div>
        </div>
      )}
      {/* Alertes d'identité CIBLÉES par profil réellement utilisé en brouillon */}
      {liste?.alertesIdentite.map((a) => (
        <div key={a.profil} className="svv-page-note" style={{ marginTop: 0, color: 'var(--color-svv-red)' }}>
          Profil « {a.libelle} » incomplet ({a.manque.join(' ; ')}). Les demandes en {a.libelle.toLowerCase()} ne pourront pas passer « prête » tant que ce n&rsquo;est pas complété (onglet Réglages).
        </div>
      ))}

      {/* Confirmation de bascule (le texte va être régénéré) */}
      {confBascule && (
        <div className="svv-card" style={{ borderColor: 'var(--color-svv-red)', fontSize: 13 }}>
          <strong>Basculer {confBascule.ids.length} demande(s) en {ETIQUETTE_PROFIL[confBascule.profil].toLowerCase()} ?</strong>
          <div style={{ color: 'var(--color-svv-muted)', margin: '.3rem 0 .5rem' }}>Le texte va être régénéré depuis l’identité de ce profil : <strong>les modifications manuelles du corps seront perdues</strong>.</div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .8rem' }} onClick={() => void appliquerBascule()}>Confirmer la bascule</button>
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .8rem' }} onClick={() => setConfBascule(null)}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.4rem .8rem' }} onClick={() => void preparer()}>Préparer les demandes</button>
        <label style={{ fontSize: 12, display: 'flex', gap: '.3rem', alignItems: 'center' }}>Profil
          <select value={profilPrep} onChange={(e) => setProfilPrep(selProfil(e.target.value))} style={styleChamp}>
            {PROFILS.map((p) => <option key={p} value={p}>{ETIQUETTE_PROFIL[p]}</option>)}
          </select>
        </label>
        {msg && <span role="status" style={{ fontSize: 13 }}>{msg}</span>}
      </div>

      {/* S14e — arbitrages PRADA (info) + rapprochements ambigus à trancher (rattachement/écartement manuel) */}
      <BlocPrada />
      {/* S16 — file « à déposer à la main » (canal formulaire / téléservice) */}
      <BlocDepot />

      {prop && (
        <div className="svv-card">
          {/* Décompte CHIFFRÉ toujours visible : rend lisible l'effet des réglages (dont l'ancienneté maximale). */}
          <p style={{ margin: '0 0 .5rem', fontSize: 12, color: 'var(--color-svv-muted)' }}>{resumeDiagnostic(prop.diagnostic)}</p>
          {prop.lots.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-svv-muted)' }}>{explication}</p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem', gap: '.5rem', flexWrap: 'wrap' }}>
                <strong>{prop.lots.length} lot(s) proposé(s) — en {ETIQUETTE_PROFIL[profilPrep].toLowerCase()}</strong>
                <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .8rem' }} onClick={() => void creer()}>Créer ces demandes</button>
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 13 }}>
                {prop.lots.map((l, i) => <li key={`${l.codeInsee}-${i}`} style={{ marginBottom: '.2rem' }}>{l.communeNom} ({l.codeInsee}) · {l.canal} · {l.dossiers.length} dossier(s) <OrigineDest origine={l.destOrigine} nom={l.destNom} /></li>)}
              </ul>
            </>
          )}
        </div>
      )}

      {detail && (
        <div id={ancreDetail(detail.id)} className="svv-card flex flex-col gap-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            <strong>{detail.reference} — {detail.communeNom ?? detail.codeInsee} — {STATUT_LIBELLE[detail.statut] ?? detail.statut} — {ETIQUETTE_PROFIL[detail.profil as ProfilDemandeur] ?? detail.profil}</strong>
            <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }} onClick={() => setDetail(null)}>fermer</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-svv-muted)', display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Destinataire figé : {detail.canal}{detail.destEmail ? ` · ${detail.destEmail}` : ''}{detail.destAdressePostale ? ` · ${detail.destAdressePostale}` : ''}{detail.destUrlFormulaire ? ` · ${detail.destUrlFormulaire}` : ''}</span>
            <OrigineDest origine={detail.destOrigine} nom={detail.destNom} />
          </div>
          {/* Bascule de profil — un clic ; sur brouillon uniquement (sinon désactivée + raison). */}
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ color: 'var(--color-svv-muted)' }}>Profil :</span>
            {PROFILS.map((p) => {
              const actif = detail.profil === p;
              const brouillon = detail.statut === 'brouillon';
              return (
                <button key={p} type="button"
                  className={`svv-btn ${actif ? 'svv-btn-primary' : 'svv-btn-outline'}`}
                  style={{ padding: '.25rem .7rem', opacity: brouillon || actif ? 1 : 0.5, cursor: brouillon && !actif ? 'pointer' : 'default' }}
                  disabled={actif || !brouillon}
                  onClick={() => setConfBascule({ ids: [detail.id], profil: p })}>{ETIQUETTE_PROFIL[p]}</button>
              );
            })}
            {detail.statut !== 'brouillon' && <span style={{ color: 'var(--color-svv-muted)' }}>bascule impossible : la demande n&rsquo;est plus en brouillon.</span>}
          </div>
          <textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={16} readOnly={detail.statut !== 'brouillon'}
            style={{ width: '100%', fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 12, padding: '.5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }} />
          <div><span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Dossiers ({detail.dossiers.length}) : </span><span style={{ fontSize: 12 }}>{detail.dossiers.map((x) => x.numDau).join(', ')}</span></div>
          {detail.statut === 'brouillon' && (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .8rem' }} onClick={() => void sauverCorps()}>Enregistrer le texte</button>
              <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .8rem' }} onClick={() => void transition([detail.id], 'prete')}>Marquer prête</button>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .8rem' }} onClick={() => void transition([detail.id], 'abandonnee')}>Abandonner</button>
            </div>
          )}
        </div>
      )}

      {/* Filtres + tri + actions groupées */}
      <div className="svv-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'center', fontSize: 12 }}>
        <label className="flex flex-col gap-1">Statut
          <select value={fStatut} onChange={(e) => majFiltre(() => setFStatut(e.target.value))} style={styleChamp}>
            <option value="">Tous</option>
            {['brouillon', 'prete', 'envoyee', 'close', 'abandonnee'].map((s) => <option key={s} value={s}>{STATUT_LIBELLE[s]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Profil
          <select value={fProfil} onChange={(e) => majFiltre(() => setFProfil(e.target.value))} style={styleChamp}>
            <option value="">Tous</option>
            {PROFILS.map((p) => <option key={p} value={p}>{ETIQUETTE_PROFIL[p]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Commune
          <input value={fCommune} onChange={(e) => majFiltre(() => setFCommune(e.target.value))} placeholder="nom ou code" style={styleChamp} />
        </label>
        <label className="flex flex-col gap-1">Tri
          <select value={tri} onChange={(e) => setTri(e.target.value as Tri)} style={styleChamp}>
            <option value="recent">Plus récentes</option><option value="reference">Référence</option><option value="commune">Commune</option><option value="statut">Statut</option>
          </select>
        </label>
        <span style={{ marginLeft: 'auto' }}>{sel.size} sélectionnée(s)</span>
        <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .7rem', opacity: sel.size ? 1 : 0.5 }} disabled={sel.size === 0} onClick={() => void transition([...sel], 'prete')}>Passer en prête</button>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem', opacity: sel.size ? 1 : 0.5 }} disabled={sel.size === 0} onClick={() => void transition([...sel], 'abandonnee')}>Abandonner</button>
        <label className="flex flex-col gap-1">Basculer la sélection en…
          <select value="" disabled={sel.size === 0} onChange={(e) => { if (e.target.value) setConfBascule({ ids: [...sel], profil: selProfil(e.target.value) }); }} style={{ ...styleChamp, opacity: sel.size ? 1 : 0.5 }}>
            <option value="">—</option>
            {PROFILS.map((p) => <option key={p} value={p}>{ETIQUETTE_PROFIL[p]}</option>)}
          </select>
        </label>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
              <th style={{ padding: '.4rem .5rem' }}><input type="checkbox" aria-label="Tout sélectionner" checked={visibles.length > 0 && visibles.every((d) => sel.has(d.id))} onChange={toutSelectionner} /></th>
              {['Référence', 'Commune', 'Profil', 'Canal', 'Destinataire', 'Dossiers', 'Statut', ''].map((h) => <th key={h} style={{ padding: '.4rem .5rem' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibles.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
                <td style={{ padding: '.4rem .5rem' }}><input type="checkbox" checked={sel.has(d.id)} onChange={() => basculer(d.id)} aria-label={`Sélectionner ${d.reference}`} /></td>
                <td style={{ padding: '.4rem .5rem', fontFamily: 'var(--font-svv-mono, monospace)' }}>{d.reference}</td>
                <td style={{ padding: '.4rem .5rem' }}>{d.communeNom ?? d.codeInsee}</td>
                <td style={{ padding: '.4rem .5rem' }}>{ETIQUETTE_PROFIL[d.profil as ProfilDemandeur] ?? d.profil}</td>
                <td style={{ padding: '.4rem .5rem' }}>{d.canal}</td>
                <td style={{ padding: '.4rem .5rem' }}><OrigineDest origine={d.destOrigine} nom={d.destNom} /></td>
                <td style={{ padding: '.4rem .5rem' }}>{d.nbDossiers}</td>
                <td style={{ padding: '.4rem .5rem' }}>{STATUT_LIBELLE[d.statut] ?? d.statut}</td>
                <td style={{ padding: '.4rem .5rem' }}><button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }} onClick={() => void ouvrir(d.id)}>ouvrir</button></td>
              </tr>
            ))}
            {filtrees.length === 0 && (
              <tr><td colSpan={9} style={{ padding: '1rem .5rem', color: 'var(--color-svv-muted)' }}>{liste ? 'Aucune demande pour ces filtres. Cliquez « Préparer les demandes ».' : 'Chargement…'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {nbPages > 1 && (
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={pageCourante <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</button>
          <span>Page {pageCourante} / {nbPages} ({filtrees.length} demande(s))</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={pageCourante >= nbPages} onClick={() => setPage((p) => Math.min(nbPages, p + 1))}>Suivant</button>
        </div>
      )}
    </div>
  );
}
