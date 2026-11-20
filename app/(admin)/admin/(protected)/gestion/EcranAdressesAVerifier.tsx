'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChampAdresseBan, CSS_CHAMP_ADRESSE, type ChoixAdresse } from './ChampAdresseBan';

/**
 * ══ 🔴🔴 L'ÉCRAN « ADRESSES À VÉRIFIER » (Arno, 20/11/2026, « Adresse officielle BAN », lot 6) ═══════════════════════════════════════════════════════
 * Les écritures WIPPIMMO dont l'adresse officielle n'est pas certaine (« à vérifier ») ou pas trouvée (« introuvable »), par nombre de biens ; pour
 * chacune : la commune, le motif, les propositions officielles et leur ressemblance. Quatre gestes, chacun après une fenêtre de confirmation, puis une
 * confirmation visible : valider une proposition, choisir une autre adresse (l'auto-complétion unique), plusieurs adresses (une plage), hors
 * périmètre / sans adresse (raison obligatoire). Chaque choix se défait (« Annuler ce choix »). Mobile d'abord, cibles de 44 px, jetons --color-svv-*.
 */
const API = '/api/admin/gestion/adresses-a-verifier';
interface Proposition { banId: string; libelle: string; score: number | null }
interface Ecriture { cle: string; ecriture: string; codePostal: string | null; commune: string | null; lots: number[]; statut: 'a_verifier' | 'introuvable'; motif: string;
  propositions: Proposition[]; plage: { texte: string; adresses: Proposition[] } | null }
interface Choix { operationId: number; le: string; par: string; geste: string; ecriture: string; adresses: string[]; raison: string | null }
type Geste = 'valider' | 'autre' | 'plusieurs' | 'hors';
interface AConfirmer { e: Ecriture; geste: Geste; corps: Record<string, unknown>; adresses: string[]; raison?: string }
const MOT_STATUT: Record<Ecriture['statut'], string> = { a_verifier: 'À vérifier', introuvable: 'Introuvable' };
const MOT_GESTE: Record<string, string> = { valider: 'proposition validée', autre: 'autre adresse choisie', plusieurs: 'plusieurs adresses', hors: 'hors périmètre / sans adresse' };
const biens = (n: number) => `${n} bien${n > 1 ? 's' : ''}`;
const ressemblance = (s: number | null) => (s === null ? '' : ` — ressemblance ${s.toFixed(2).replace('.', ',')}`);

export function EcranAdressesAVerifier({ retour = null, onCompte }: { retour?: React.ReactNode; onCompte?: (n: number) => void }) {
  const [file, setFile] = useState<Ecriture[] | null>(null);
  const [recents, setRecents] = useState<Choix[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [ouvert, setOuvert] = useState<{ cle: string; geste: Geste } | null>(null);
  const [autre, setAutre] = useState(''); const [autreChoisie, setAutreChoisie] = useState<ChoixAdresse | null>(null);
  const [cochees, setCochees] = useState<string[]>([]);
  const [raison, setRaison] = useState('');
  const [aConfirmer, setAConfirmer] = useState<AConfirmer | null>(null);
  const [aAnnuler, setAAnnuler] = useState<Choix | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // la file se relit après chaque geste : ses boutons restent grisés tant qu'elle n'est pas relue (jamais un clic sur une ligne périmée)
  const [recharge, setRecharge] = useState(false);
  const occupe = envoi || recharge;
  const [refus, setRefus] = useState<string | null>(null);
  const idAutre = useId();
  useEffect(() => {
    let vivant = true;
    fetch(API, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: { file: Ecriture[]; recents: Choix[] }; message?: string }>)
      .then((j) => { if (!vivant) return; setRecharge(false); if (j.etat === 'ok' && j.data) { setFile(j.data.file); setRecents(j.data.recents); setErreur(null); onCompte?.(j.data.file.length); } else { setFile([]); setErreur(j.message ?? 'Lecture impossible.'); } })
      .catch(() => { if (vivant) { setRecharge(false); setFile([]); setErreur('Lecture impossible : le serveur n’a pas répondu.'); } });
    return () => { vivant = false; };
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const ouvrir = (cle: string, geste: Geste) => { setOuvert((o) => (o?.cle === cle && o.geste === geste ? null : { cle, geste })); setAutre(''); setAutreChoisie(null); setCochees([]); setRaison(''); setMessage(null); };
  const confirmer = (c: AConfirmer) => { setRefus(null); setAConfirmer(c); };
  const envoyer = async (corps: Record<string, unknown>): Promise<boolean> => {
    setEnvoi(true); setRefus(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const j = await r.json() as { etat?: string; data?: { message?: string }; motif?: string; message?: string };
      if (j.etat !== 'ok') { setRefus(j.motif ?? j.message ?? 'Enregistrement impossible. Rien n’est enregistré.'); return false; }
      setMessage(j.data?.message ?? 'Enregistré.'); setRecharge(true); setVersion((v) => v + 1); return true;
    } catch { setRefus('Le serveur n’a pas répondu. Rien n’est enregistré.'); return false; } finally { setEnvoi(false); }
  };
  return (
    <section className="eav" aria-labelledby="eav-titre" data-ecran-adresses-a-verifier>
      <style>{CSS_ECRAN_ADRESSES}</style><style>{CSS_CHAMP_ADRESSE}</style>
      <div className="eav-tete">
        {retour}
        <h2 className="eav-titre" id="eav-titre">Adresses à vérifier {file !== null && <span className="eav-compte" data-eav-compte>{file.length}</span>}</h2>
      </div>
      <p className="eav-discret eav-sans-marge">Les écritures WIPPIMMO dont l’adresse officielle n’est pas certaine. Les adresses des biens ne sont jamais modifiées ; chaque choix se défait.</p>
      {erreur !== null && <p className="eav-refus" role="alert">{erreur}</p>}
      {message !== null && <p className="eav-message" role="status" data-eav-message>✓ {message}</p>}
      {file === null ? <p className="eav-discret">Chargement…</p> : file.length === 0 ? <p className="eav-discret" data-eav-vide>Aucune adresse à vérifier.</p> : (
        <ul className="eav-liste">{file.map((e) => (
          <li key={e.cle} className="eav-carte" data-eav-ecriture={e.ecriture}>
            <p className="eav-ecriture">« {e.ecriture} »</p>
            <p className="eav-ligne"><span className={`eav-statut eav-statut-${e.statut}`} data-eav-statut={e.statut}>{MOT_STATUT[e.statut]}</span>
              <span className="eav-discret">{[e.codePostal, e.commune].filter(Boolean).join(' ')} · {biens(e.lots.length)}</span></p>
            <p className="eav-motif" data-eav-motif>{e.motif}</p>
            {e.propositions.length > 0 && <ul className="eav-propositions">{e.propositions.map((p) => (
              <li key={p.banId}><span>{p.libelle}<span className="eav-discret">{ressemblance(p.score)}</span></span>
                <button type="button" className="svv-btn svv-btn-primary gst-btn eav-btn" disabled={occupe}
                  onClick={() => confirmer({ e, geste: 'valider', corps: { action: 'geste', geste: 'valider', cle: e.cle, banId: p.banId }, adresses: [p.libelle] })} data-eav-valider={p.banId}>Valider la proposition</button></li>))}</ul>}
            <div className="eav-actions">
              <button type="button" className="svv-btn svv-btn-outline gst-btn eav-btn" aria-expanded={ouvert?.cle === e.cle && ouvert.geste === 'autre'} onClick={() => ouvrir(e.cle, 'autre')} data-eav-autre>Choisir une autre adresse</button>
              {e.plage !== null && e.plage.adresses.length > 1 && <button type="button" className="svv-btn svv-btn-outline gst-btn eav-btn" aria-expanded={ouvert?.cle === e.cle && ouvert.geste === 'plusieurs'}
                onClick={() => ouvrir(e.cle, 'plusieurs')} data-eav-plusieurs>Plusieurs adresses</button>}
              <button type="button" className="svv-btn svv-btn-outline gst-btn eav-btn" aria-expanded={ouvert?.cle === e.cle && ouvert.geste === 'hors'} onClick={() => ouvrir(e.cle, 'hors')} data-eav-hors>Hors périmètre / sans adresse</button>
            </div>
            {ouvert?.cle === e.cle && ouvert.geste === 'autre' && (
              <div className="eav-panneau" data-eav-panneau-autre>
                <label className="eav-champ" htmlFor={`${idAutre}-${e.cle}`}><span>Rechercher l’adresse, puis la choisir dans la liste</span></label>
                <ChampAdresseBan id={`${idAutre}-${e.cle}`} valeur={autre} verifiee={autreChoisie !== null} exemple="ex. 30 rue de Longchamp, 92200 Neuilly-sur-Seine"
                  onChange={(v) => { setAutre(v); setAutreChoisie(null); }} onChoisir={(a) => { setAutre([a.voie, [a.codePostal, a.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ')); setAutreChoisie(a); }} />
                <button type="button" className="svv-btn svv-btn-primary gst-btn eav-btn" disabled={autreChoisie === null || occupe}
                  onClick={() => autreChoisie && confirmer({ e, geste: 'autre', corps: { action: 'geste', geste: 'autre', cle: e.cle, adresse: autreChoisie }, adresses: [autre] })} data-eav-autre-utiliser>Utiliser cette adresse</button>
              </div>)}
            {ouvert?.cle === e.cle && ouvert.geste === 'plusieurs' && e.plage !== null && (
              <fieldset className="eav-panneau" data-eav-panneau-plusieurs>
                <legend>Les adresses officielles de la plage {e.plage.texte} : cochez celles de l’immeuble</legend>
                {e.plage.adresses.map((a) => (
                  <label key={a.banId} className="eav-coche"><input type="checkbox" checked={cochees.includes(a.banId)}
                    onChange={(x) => setCochees((c) => (x.target.checked ? [...c, a.banId] : c.filter((y) => y !== a.banId)))} data-eav-coche={a.banId} /><span>{a.libelle}</span></label>))}
                <button type="button" className="svv-btn svv-btn-primary gst-btn eav-btn" disabled={cochees.length < 2 || occupe}
                  onClick={() => confirmer({ e, geste: 'plusieurs', corps: { action: 'geste', geste: 'plusieurs', cle: e.cle, banIds: cochees },
                    adresses: (e.plage?.adresses ?? []).filter((a) => cochees.includes(a.banId)).map((a) => a.libelle) })} data-eav-plusieurs-valider>Valider ces adresses</button>
              </fieldset>)}
            {ouvert?.cle === e.cle && ouvert.geste === 'hors' && (
              <div className="eav-panneau" data-eav-panneau-hors>
                <label className="eav-champ"><span>Raison (obligatoire)</span>
                  <textarea value={raison} onChange={(x) => setRaison(x.target.value)} rows={2} placeholder="ex. commune non couverte, fiche d’essai" data-eav-raison /></label>
                <button type="button" className="svv-btn svv-btn-primary gst-btn eav-btn" disabled={raison.trim() === '' || occupe}
                  onClick={() => confirmer({ e, geste: 'hors', corps: { action: 'geste', geste: 'hors', cle: e.cle, raison }, adresses: [], raison })} data-eav-hors-valider>Noter hors périmètre</button>
              </div>)}
          </li>))}</ul>)}
      {recents.length > 0 && (
        <section className="eav-recents" aria-labelledby="eav-recents-titre" data-eav-recents>
          <h3 className="eav-sous-titre" id="eav-recents-titre">Choix faits</h3>
          <ul className="eav-liste">{recents.map((c) => (
            <li key={c.operationId} className="eav-recent" data-eav-recent={c.operationId}>
              <span>« {c.ecriture} » — {MOT_GESTE[c.geste] ?? c.geste}{c.adresses.length ? ` : ${c.adresses.join(' · ')}` : ''}{c.raison ? ` (${c.raison})` : ''}
                <span className="eav-discret"> — le {c.le}, par {c.par}</span></span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn eav-btn" disabled={occupe} onClick={() => { setRefus(null); setAAnnuler(c); }} data-eav-annuler={c.operationId}>Annuler ce choix</button>
            </li>))}</ul>
        </section>)}
      {aConfirmer !== null && (
        <Fenetre titre="Confirmer ce choix" envoi={envoi} refus={refus} confirmer={aConfirmer.geste === 'hors' ? 'Confirmer : hors périmètre' : 'Confirmer'} donnee="confirmer"
          onAnnuler={() => setAConfirmer(null)} onConfirmer={async () => { if (await envoyer(aConfirmer.corps)) { setAConfirmer(null); setOuvert(null); } }}>
          <p>« {aConfirmer.e.ecriture} » — {biens(aConfirmer.e.lots.length)}</p>
          {aConfirmer.geste === 'hors' ? <p>Noté <strong>hors périmètre / sans adresse</strong> : {aConfirmer.raison}</p>
            : <p>{aConfirmer.adresses.length > 1 ? 'Adresses officielles' : 'Adresse officielle'} : <strong>{aConfirmer.adresses.join(' · ')}</strong></p>}
          <p className="eav-discret">L’écriture d’origine est gardée ; les adresses des biens ne changent pas. Le choix est noté dans l’historique des biens, et il se défait (« Annuler ce choix »).</p>
        </Fenetre>)}
      {aAnnuler !== null && (
        <Fenetre titre="Annuler ce choix ?" envoi={envoi} refus={refus} confirmer="Annuler ce choix" donnee="annuler"
          onAnnuler={() => setAAnnuler(null)} onConfirmer={async () => { if (await envoyer({ action: 'annuler', operationId: aAnnuler.operationId })) setAAnnuler(null); }}>
          <p>« {aAnnuler.ecriture} » revient dans la file ; ce que ce choix avait rattaché est retiré.</p>
        </Fenetre>)}
    </section>
  );
}

function Fenetre({ titre, donnee, children, envoi, refus, confirmer, onConfirmer, onAnnuler }: { titre: string; donnee: string; children: React.ReactNode; envoi: boolean; refus: string | null;
  confirmer: string; onConfirmer: () => void; onAnnuler: () => void }) {
  const id = `eav-fenetre-${donnee}`;
  const premier = useRef<HTMLButtonElement>(null);
  useEffect(() => { premier.current?.focus(); }, []);
  return (
    <div className="eav-voile" onKeyDown={(e) => { if (e.key === 'Escape' && !envoi) onAnnuler(); }}>
      <div className="eav-boite" role="dialog" aria-modal="true" aria-labelledby={id} data-eav-fenetre={donnee}>
        <h3 id={id} className="eav-sous-titre">{titre}</h3>
        <div className="eav-boite-corps">{children}</div>
        {refus !== null && <p className="eav-refus" role="alert" data-eav-refus>{refus}</p>}
        <div className="eav-actions eav-actions-fin">
          <button ref={premier} type="button" className="svv-btn svv-btn-outline gst-btn eav-btn" onClick={onAnnuler} disabled={envoi}>Retour</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn eav-btn" onClick={onConfirmer} disabled={envoi} data-eav-confirmer>{envoi ? 'Enregistrement…' : confirmer}</button>
        </div>
      </div>
    </div>
  );
}

/* Jetons --color-svv-* uniquement. AUCUN ACCENT GRAVE dans ce litteral. Telephone d'abord : tout passe a la ligne. */
export const CSS_ECRAN_ADRESSES = `
.eav{display:flex;flex-direction:column;gap:.7rem;min-width:0;padding:4px 0}
.eav-tete{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.eav-titre{margin:0;font-size:1.1rem;font-weight:700;color:var(--color-svv-ink);flex:1 1 auto}
.eav-sous-titre{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-ink)}
.eav-discret{color:var(--color-svv-muted);font-size:.85rem}
.eav-sans-marge{margin:0}
.eav-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.5rem}
.eav-carte,.eav-recent{display:flex;flex-direction:column;gap:.4rem;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink);min-width:0}
.eav-recent{flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;overflow-wrap:anywhere}
.eav-ecriture{margin:0;font-weight:700;overflow-wrap:anywhere}
.eav-ligne{margin:0;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.eav-statut{display:inline-flex;align-items:center;min-height:28px;padding:2px 10px;border-radius:999px;font-weight:800;font-size:.85rem;border:1px solid}
.eav-statut-a_verifier{color:var(--color-svv-orange);background:var(--color-svv-orange-soft);border-color:var(--color-svv-orange)}
.eav-statut-introuvable{color:var(--color-svv-red);background:var(--color-svv-red-soft);border-color:var(--color-svv-red)}
.eav-motif{margin:0;font-size:.9rem;overflow-wrap:anywhere}
.eav-propositions{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.4rem}
.eav-propositions li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.4rem .7rem;padding:6px 8px;border-radius:8px;background:var(--color-svv-field);overflow-wrap:anywhere}
.eav-actions{display:flex;flex-wrap:wrap;gap:.5rem}
.eav-actions-fin{justify-content:flex-end}
.eav-btn{min-height:44px}
.eav-panneau{display:flex;flex-direction:column;gap:.5rem;margin:0;padding:10px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-field);min-width:0}
.eav-panneau legend{font-weight:700;padding:0 4px}
.eav-champ{display:flex;flex-direction:column;gap:4px;font-weight:700}
.eav-champ textarea{width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;border-radius:8px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:16px}
.eav-coche{display:flex;align-items:center;gap:.6rem;min-height:44px;cursor:pointer;overflow-wrap:anywhere}
.eav-coche input{width:20px;height:20px;margin:0;flex:0 0 auto;accent-color:var(--color-svv-ink)}
.eav-message{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border:1px solid var(--color-svv-green);overflow-wrap:anywhere}
.eav-recents{display:flex;flex-direction:column;gap:.5rem;margin-top:.6rem}
.eav-compte{display:inline-flex;align-items:center;justify-content:center;min-width:28px;min-height:28px;padding:0 8px;margin-left:6px;border-radius:999px;background:var(--color-svv-orange-soft);color:var(--color-svv-orange);border:1px solid var(--color-svv-orange);font-size:.9rem;font-weight:800;vertical-align:middle}
.eav-refus{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-red-soft);color:var(--color-svv-red);border:1px solid var(--color-svv-red);overflow-wrap:anywhere}
.eav-panneau .cab-enveloppe{position:relative;width:100%}
.eav-panneau .cp-saisie{width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;border-radius:8px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:16px}
.eav-voile{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:color-mix(in srgb,var(--color-svv-ink) 45%,transparent)}
.eav-boite{width:min(560px,100%);max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;padding:16px;border-radius:14px;background:var(--color-svv-surface);color:var(--color-svv-ink);border:1px solid var(--color-svv-line-strong);display:flex;flex-direction:column;gap:.7rem}
.eav-boite-corps{display:flex;flex-direction:column;gap:.5rem;overflow-wrap:anywhere}
.eav-boite-corps p{margin:0}
`;
