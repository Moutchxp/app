'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  etatControle, lienDossierDrive, lienFiche, peutValiderTousLesSurs, SECTIONS, sectionsDuRapprochement, TAILLE_CONTROLE,
  type CleSection, type Decision, type FicheCourte, type Geste, type LigneRapprochement, type PlanLotSuivant,
} from '../../../../../lib/gestion/rapprochementDossiers';
import { biensAMontrer, type DecisionBien, type GesteBien, type LigneBien } from '../../../../../lib/gestion/racinesProprietaires';
import { formatParis } from '../../../../../lib/temps/paris';

/**
 * ÉCRAN « Rapprochement des dossiers clients » (tuile Gestion, administrateur — Arno, 19/10/2026).
 * Chaque dossier copié de « Documents clients scannés » : sa fiche proposée, la raison en clair, et trois gestes (Valider,
 * Corriger, Aucun rattachement). 🔴 Aucune décision n'écrit dans le Drive : elles sont enregistrées, datées, attribuées,
 * modifiables jusqu'au lot suivant. Mobile d'abord : cartes empilées, cibles de 44 px, sections repliables.
 */

export const API_RAPPROCHEMENT = '/api/admin/gestion/rapprochement-dossiers';

/** La section « Biens » (migration 388, Arno 19/10/2026) : absente tant que la migration n'est pas appliquée. */
export type DonneesBiens = { etat: 'sans_schema' } | { etat: 'vide' } | { etat: 'ok'; calcul: string; lignes: LigneBien[] };

export type Donnees =
  | { etat: 'chargement' } | { etat: 'erreur' } | { etat: 'sans_schema' } | { etat: 'vide' }
  | { etat: 'ok'; calcul: string; lignes: LigneRapprochement[]; plan: PlanLotSuivant; biens?: DonneesBiens };

/** Ce que dit la décision qui fait foi, en clair. PUR. */
export function libelleDecision(d: Decision | null, nbDecisions = 1): string {
  if (d === null) return 'À décider';
  const quand = FORMAT_DATE.format(new Date(d.decideLe));
  const quoi = d.geste === 'valider' ? `Validé${d.enMasse ? ' (avec tous les SÛRS)' : ''}`
    : d.geste === 'corriger' ? `Corrigé → ${d.fiche?.nom ?? 'fiche'}` : 'Aucun rattachement';
  return `${quoi} — ${d.decidePar}, ${quand}${nbDecisions > 1 ? ` · ${nbDecisions} décisions, la dernière fait foi` : ''}`;
}

/** Ce que dit la décision qui fait foi sur un bien, en clair. PUR. */
export function libelleDecisionBien(d: DecisionBien | null, nbDecisions = 1): string {
  if (d === null) return 'À décider — sans réponse, le bouton du bien ouvrira le dossier du propriétaire';
  const quand = d.decideLe === '' ? '' : `, ${FORMAT_DATE.format(new Date(d.decideLe))}`;
  const quoi = d.geste === 'valider' ? 'Validé' : d.geste === 'corriger' ? `Corrigé → ${d.dossierNom ?? 'dossier'}` : 'Aucun rattachement';
  return `${quoi} — ${d.decidePar}${quand}${nbDecisions > 1 ? ` · ${nbDecisions} décisions, la dernière fait foi` : ''}`;
}

/** Le compteur d'une section : lignes, et combien sont décidées. PUR. */
export function compteurSection(cle: CleSection, lignes: readonly LigneRapprochement[]): string {
  if (cle === 'controle') { const c = etatControle(lignes); return `${c.valides}/${TAILLE_CONTROLE} validés`; }
  if (cle === 'clients_sans_dossier') return String(lignes.length);
  const d = lignes.filter((l) => l.decision !== null).length;
  return `${lignes.length}${d > 0 ? ` · ${d} décidé${d > 1 ? 's' : ''}` : ''}`;
}

const FORMAT_DATE = formatParis('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const NIVEAU: Record<string, string> = { SUR: 'SÛR', PROBABLE: 'Probable', AMBIGU: 'Ambigu', AUCUN: 'Aucun', SANS_DOSSIER: 'Sans dossier' };

export const CSS_RAPPROCHEMENT = `
.rpd{display:flex;flex-direction:column;gap:1rem;max-width:62rem;padding:0 0 3rem}
.rpd-barre{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;justify-content:space-between;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.85rem;padding:.85rem 1rem}
.rpd-barre p{margin:0;color:var(--color-svv-muted);font-size:.9rem}
.rpd-btn{min-height:44px;min-width:44px;padding:.55rem .9rem;border-radius:.7rem;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font-weight:600;font-size:.92rem;cursor:pointer}
.rpd-btn:disabled{color:var(--color-svv-muted);background:var(--color-svv-field);cursor:not-allowed}
.rpd-btn-rouge{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-blanc)}
.rpd-btn-rouge:disabled{background:var(--color-svv-field);border-color:var(--color-svv-line-strong);color:var(--color-svv-muted)}
.rpd-btn-actif{border-color:var(--color-svv-ink);box-shadow:inset 0 0 0 1px var(--color-svv-ink)}
.rpd-section{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.85rem}
.rpd-section>summary{min-height:44px;display:flex;align-items:center;gap:.6rem;padding:.6rem 1rem;cursor:pointer;font-weight:700;color:var(--color-svv-ink);list-style:none}
.rpd-section>summary::-webkit-details-marker{display:none}
.rpd-compteur{font-weight:600;font-size:.82rem;color:var(--color-svv-muted);background:var(--color-svv-field);border-radius:999px;padding:.15rem .6rem}
.rpd-aide{margin:0 1rem .6rem;color:var(--color-svv-muted);font-size:.86rem}
.rpd-lignes{display:flex;flex-direction:column;gap:.6rem;padding:0 .6rem .8rem}
.rpd-ligne{border:1px solid var(--color-svv-line);border-radius:.7rem;padding:.7rem .8rem;display:flex;flex-direction:column;gap:.35rem;background:var(--color-svv-page)}
.rpd-ligne[data-decide=oui]{border-color:var(--color-svv-green)}
.rpd-ligne a{color:var(--color-svv-ink);font-weight:700;text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}
.rpd-meta{color:var(--color-svv-muted);font-size:.84rem}
.rpd-raison{font-size:.9rem;color:var(--color-svv-ink)}
.rpd-pastille{display:inline-block;font-size:.75rem;font-weight:700;border-radius:999px;padding:.1rem .5rem;margin-left:.35rem;background:var(--color-svv-field);color:var(--color-svv-ink)}
.rpd-pastille-principal{background:var(--color-svv-blue-soft);color:var(--color-svv-blue)}
.rpd-decision{font-size:.84rem;color:var(--color-svv-muted)}
.rpd-decision[data-decide=oui]{color:var(--color-svv-green-ink);font-weight:600}
.rpd-gestes{display:flex;flex-wrap:wrap;gap:.45rem}
.rpd-recherche{display:flex;flex-direction:column;gap:.4rem;padding:.5rem;border-radius:.6rem;background:var(--color-svv-field)}
.rpd-recherche input{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;padding:0 .7rem;font-size:1rem;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.rpd-resultat{text-align:left;width:100%}
.rpd-motif{color:var(--color-svv-red-dark);font-size:.88rem}
.rpd-plan ul{margin:.2rem 1rem .8rem 2rem;padding:0;color:var(--color-svv-ink);font-size:.9rem}
@media (min-width:48rem){.rpd-ligne{display:grid;grid-template-columns:1fr auto;align-items:start}.rpd-gestes{justify-content:flex-end}.rpd-ligne>.rpd-corps{grid-column:1}.rpd-ligne>.rpd-gestes{grid-column:2;grid-row:1}.rpd-ligne>.rpd-recherche{grid-column:1/-1}}
`;

interface PropsLigne {
  l: LigneRapprochement;
  occupe: boolean;
  onDecider: (l: LigneRapprochement, geste: Geste, fiche: number | null) => void;
  chercher: (terme: string) => Promise<{ id: number; nom: string; detail: string | null }[]>;
}

export function LigneDossier({ l, occupe, onDecider, chercher }: PropsLigne) {
  const [correction, setCorrection] = useState(false);
  const [terme, setTerme] = useState('');
  const [resultats, setResultats] = useState<{ id: number; nom: string; detail: string | null }[]>([]);
  const cherche = correction && terme.trim().length >= 2;
  useEffect(() => {
    if (!cherche) return undefined;
    let vivant = true;
    const t = setTimeout(() => { void chercher(terme).then((r) => { if (vivant) setResultats(r); }); }, 250);
    return () => { vivant = false; clearTimeout(t); };
  }, [cherche, terme, chercher]);
  const geste = l.decision?.geste ?? null;
  const choisir = (f: FicheCourte | { id: number }) => { setCorrection(false); setTerme(''); onDecider(l, 'corriger', f.id); };
  if (l.sorte === 'client_sans_dossier') {
    return (
      <li className="rpd-ligne">
        <div className="rpd-corps">
          {l.fiche ? <a href={lienFiche(l.fiche.id)}>{l.fiche.nom}</a> : null}
          <div className="rpd-raison">{l.raison}</div>
          {l.fiche?.dossierActuelId ? <div className="rpd-meta"><a href={lienDossierDrive(l.fiche.dossierActuelId)} target="_blank" rel="noreferrer">Ouvrir son dossier actuel</a></div> : null}
        </div>
      </li>
    );
  }
  return (
    <li className="rpd-ligne" data-decide={l.decision ? 'oui' : 'non'} data-proposition={l.id}>
      <div className="rpd-corps">
        <div>
          <a href={lienDossierDrive(l.copieDossierId as string)} target="_blank" rel="noreferrer">{l.nomDossier}</a>
          <span className="rpd-pastille">{NIVEAU[l.niveau]}</span>
          {l.principal ? <span className="rpd-pastille rpd-pastille-principal">Dossier principal proposé</span> : null}
        </div>
        <div className="rpd-meta">{l.branche} · {l.nbFichiers ?? 0} fichier{(l.nbFichiers ?? 0) > 1 ? 's' : ''}</div>
        <div className="rpd-raison">
          {l.fiche ? <>Fiche proposée : <a href={lienFiche(l.fiche.id)}>{l.fiche.nom}</a> — </> : <>Aucune fiche proposée — </>}
          {l.raison}
        </div>
        {l.candidats.length > 0 && l.niveau !== 'SUR' ? (
          <div className="rpd-meta">Fiches possibles : {l.candidats.map((c, i) => <span key={c.id}>{i > 0 ? ', ' : ''}<a href={lienFiche(c.id)}>{c.nom}</a></span>)}</div>
        ) : null}
        <div className="rpd-decision" data-decide={l.decision ? 'oui' : 'non'}>{libelleDecision(l.decision, l.nbDecisions)}</div>
      </div>
      <div className="rpd-gestes">
        <button type="button" className={`rpd-btn${geste === 'valider' ? ' rpd-btn-actif' : ''}`} disabled={occupe || l.fiche === null}
          onClick={() => onDecider(l, 'valider', null)}>Valider</button>
        <button type="button" className={`rpd-btn${geste === 'corriger' || correction ? ' rpd-btn-actif' : ''}`} disabled={occupe}
          onClick={() => setCorrection((c) => !c)}>Corriger</button>
        <button type="button" className={`rpd-btn${geste === 'aucun' ? ' rpd-btn-actif' : ''}`} disabled={occupe}
          onClick={() => onDecider(l, 'aucun', null)}>Aucun rattachement</button>
      </div>
      {correction ? (
        <div className="rpd-recherche">
          {l.candidats.filter((c) => c.id !== l.fiche?.id).map((c) => (
            <button key={c.id} type="button" className="rpd-btn rpd-resultat" disabled={occupe} onClick={() => choisir(c)}>{c.nom}</button>
          ))}
          <input type="search" placeholder="Chercher une fiche propriétaire par son nom" value={terme} autoFocus
            aria-label="Chercher une fiche propriétaire" onChange={(e) => setTerme(e.target.value)} />
          {(cherche ? resultats : []).map((r) => (
            <button key={r.id} type="button" className="rpd-btn rpd-resultat" disabled={occupe} onClick={() => choisir(r)}>
              {r.nom}{r.detail ? <span className="rpd-meta"> — {r.detail}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function LigneDuBien({ l, occupe, onDeciderBien }: {
  l: LigneBien; occupe: boolean; onDeciderBien: (l: LigneBien, geste: GesteBien, dossier: string | null) => void;
}) {
  const [correction, setCorrection] = useState(false);
  const geste = l.decision?.geste ?? null;
  return (
    <li className="rpd-ligne" data-decide={l.decision ? 'oui' : 'non'} data-bien={l.id}>
      <div className="rpd-corps">
        <div>
          <strong>{l.adresse}</strong> <span className="rpd-meta">lot {l.wippimmo}</span>
          <span className="rpd-pastille">{NIVEAU[l.niveau]}</span>
        </div>
        <div className="rpd-meta">Propriétaire : <a href={lienFiche(l.proprietaire.id)}>{l.proprietaire.nom}</a></div>
        <div className="rpd-raison">
          {l.dossierId !== null ? <>Dossier proposé : <a href={lienDossierDrive(l.dossierId)} target="_blank" rel="noreferrer">{l.dossierNom}</a> — </> : <>Aucun dossier proposé — </>}
          {l.raison}
        </div>
        <div className="rpd-decision" data-decide={l.decision ? 'oui' : 'non'}>{libelleDecisionBien(l.decision, l.nbDecisions)}</div>
      </div>
      <div className="rpd-gestes">
        <button type="button" className={`rpd-btn${geste === 'valider' ? ' rpd-btn-actif' : ''}`} disabled={occupe || l.dossierId === null}
          onClick={() => onDeciderBien(l, 'valider', null)}>Valider</button>
        <button type="button" className={`rpd-btn${geste === 'corriger' || correction ? ' rpd-btn-actif' : ''}`} disabled={occupe}
          onClick={() => setCorrection((c) => !c)}>Corriger</button>
        <button type="button" className={`rpd-btn${geste === 'aucun' ? ' rpd-btn-actif' : ''}`} disabled={occupe}
          onClick={() => onDeciderBien(l, 'aucun', null)}>Aucun rattachement</button>
      </div>
      {correction ? (
        <div className="rpd-recherche">
          {l.candidats.filter((c) => c.id !== l.dossierId).map((c) => (
            <button key={c.id} type="button" className="rpd-btn rpd-resultat" disabled={occupe}
              onClick={() => { setCorrection(false); onDeciderBien(l, 'corriger', c.id); }}>{c.nom}</button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/**
 * LA SECTION « BIENS » (Arno, 19/10/2026) : pour un propriétaire à plusieurs dossiers copiés, le dossier de chacun de ses
 * biens. Les SÛRS valent validés et ne sont pas montrés ; ici, les PROBABLES et les AMBIGUS, avec les mêmes gestes.
 */
export function SectionBiens({ biens, occupe, onDeciderBien }: {
  biens: DonneesBiens | undefined; occupe: boolean; onDeciderBien: (l: LigneBien, geste: GesteBien, dossier: string | null) => void;
}) {
  if (biens === undefined || biens.etat === 'sans_schema') {
    return <div className="rpd-section"><p className="rpd-aide" data-section="biens">Biens : la migration 388 n’est pas encore appliquée.</p></div>;
  }
  if (biens.etat === 'vide') return <div className="rpd-section"><p className="rpd-aide" data-section="biens">Biens : aucun calcul chargé.</p></div>;
  const montres = biensAMontrer(biens.lignes);
  const surs = biens.lignes.length - montres.length;
  const decides = montres.filter((l) => l.decision !== null).length;
  return (
    <details className="rpd-section" data-section="biens" open>
      <summary>Biens <span className="rpd-compteur" data-compteur="biens">{montres.length}{decides > 0 ? ` · ${decides} décidé${decides > 1 ? 's' : ''}` : ''}</span></summary>
      <p className="rpd-aide">
        Propriétaires à plusieurs dossiers copiés : le dossier de chacun de leurs biens. {surs} SÛR{surs > 1 ? 'S' : ''} valent validés et ne sont
        pas montrés. Sans réponse ou « Aucun rattachement » : le bouton du bien ouvrira le dossier du propriétaire.
      </p>
      <ul className="rpd-lignes" style={{ listStyle: 'none', margin: 0 }}>
        {montres.map((l) => <LigneDuBien key={l.id} l={l} occupe={occupe} onDeciderBien={onDeciderBien} />)}
      </ul>
    </details>
  );
}

export function PlanDuLot({ plan }: { plan: PlanLotSuivant }) {
  const actifs = plan.deplacements.filter((d) => d.vers === 'Actifs').length;
  return (
    <details className="rpd-section rpd-plan">
      <summary>Plan du lot suivant (rien n’est exécuté) <span className="rpd-compteur">{plan.nonDecides} à décider</span></summary>
      <p className="rpd-aide">Recalculé à partir des décisions enregistrées. Il ne s’exécutera qu’au lot suivant, sous le verrou décrit à l’étape 1 bis.</p>
      <ul>
        <li>Déplacements : {actifs} dossier(s) copié(s) vers « Actifs », {plan.deplacements.length - actifs} vers « Inactifs ».</li>
        <li>Fiches repointées vers leur dossier copié : {plan.repointages.length}.</li>
        <li>Anciens dossiers propriétaires à la corbeille (jamais de suppression définitive) : {plan.corbeille.length}.</li>
        <li>Laissés en place (vendus / perdus mais en gestion) : {plan.laissesEnPlace.length}.</li>
        <li>Dossiers d’essai à la corbeille : {plan.dossiersTest.join(' ; ')}.</li>
      </ul>
    </details>
  );
}

export function VueRapprochement({ donnees, occupe, message, onDecider, onValiderSurs, chercher, onDeciderBien = () => undefined }: {
  donnees: Donnees; occupe: boolean; message: string | null;
  onDecider: PropsLigne['onDecider']; onValiderSurs: () => void; chercher: PropsLigne['chercher'];
  onDeciderBien?: (l: LigneBien, geste: GesteBien, dossier: string | null) => void;
}) {
  if (donnees.etat === 'chargement') return <div className="svv-card">Chargement…</div>;
  if (donnees.etat === 'erreur') return <div className="svv-card">Lecture impossible. Réessayer dans un instant.</div>;
  if (donnees.etat === 'sans_schema') return <div className="svv-card">La migration 387 n’est pas encore appliquée : aucune proposition ne peut être lue ni décidée.</div>;
  if (donnees.etat === 'vide') return <div className="svv-card">Aucune proposition chargée : lancer le chargement du calcul (voir le rapport du 19/10/2026).</div>;
  const sections = sectionsDuRapprochement(donnees.lignes);
  const masse = peutValiderTousLesSurs(donnees.lignes);
  return (
    <div className="rpd">
      <style>{CSS_RAPPROCHEMENT}</style>
      <div className="rpd-barre">
        <p>Calcul du {donnees.calcul} · {donnees.lignes.filter((l) => l.sorte === 'dossier').length} dossiers copiés · aucune décision n’écrit dans le Drive.</p>
        <button type="button" className="rpd-btn rpd-btn-rouge" disabled={occupe || !masse.ok} onClick={onValiderSurs}
          title={masse.ok ? undefined : masse.motif}>
          Valider tous les SÛRS{masse.ok ? ` (${masse.nombre})` : ''}
        </button>
        {!masse.ok ? <p className="rpd-motif" data-motif-masse>{masse.motif}</p> : null}
        {message ? <p className="rpd-motif" role="status">{message}</p> : null}
      </div>
      {SECTIONS.map((s) => (
        <details key={s.cle} className="rpd-section" data-section={s.cle} open={s.cle === 'controle' || undefined}>
          <summary>{s.titre} <span className="rpd-compteur" data-compteur={s.cle}>{compteurSection(s.cle, sections[s.cle])}</span></summary>
          <p className="rpd-aide">{s.aide}</p>
          <ul className="rpd-lignes" style={{ listStyle: 'none', margin: 0 }}>
            {sections[s.cle].map((l) => <LigneDossier key={l.id} l={l} occupe={occupe} onDecider={onDecider} chercher={chercher} />)}
          </ul>
        </details>
      ))}
      <SectionBiens biens={donnees.biens} occupe={occupe} onDeciderBien={onDeciderBien} />
      <PlanDuLot plan={donnees.plan} />
    </div>
  );
}

export function RapprochementDossiers() {
  const [donnees, setDonnees] = useState<Donnees>({ etat: 'chargement' });
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // La relecture : au montage, puis après chaque geste (la version avance). L'écran garde son image pendant la relecture.
  useEffect(() => {
    let vivant = true;
    fetch(API_RAPPROCHEMENT, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat: string; data?: { calcul: string; lignes: LigneRapprochement[]; plan: PlanLotSuivant; biens?: DonneesBiens } }>)
      .then((j) => {
        if (!vivant) return;
        if (j.etat === 'ok' && j.data) setDonnees({ etat: 'ok', ...j.data });
        else if (j.etat === 'sans_schema' || j.etat === 'vide') setDonnees({ etat: j.etat });
        else setDonnees({ etat: 'erreur' });
      })
      .catch(() => { if (vivant) setDonnees({ etat: 'erreur' }); });
    return () => { vivant = false; };
  }, [version]);
  const envoyer = async (corps: Record<string, unknown>) => {
    setOccupe(true); setMessage(null);
    try {
      const r = await fetch(API_RAPPROCHEMENT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const j = (await r.json()) as { ok: boolean; motif?: string; nombre?: number };
      if (!j.ok) setMessage(j.motif ?? 'Refusé.');
      else if (typeof j.nombre === 'number') setMessage(`${j.nombre} SÛR(s) validé(s).`);
      setVersion((v) => v + 1);
    } catch { setMessage('Enregistrement impossible. Réessayer.'); }
    finally { setOccupe(false); }
  };
  const chercher = useCallback(async (terme: string) => {
    try {
      const r = await fetch(`${API_RAPPROCHEMENT}?q=${encodeURIComponent(terme)}`, { cache: 'no-store' });
      const j = (await r.json()) as { etat: string; data?: { id: number; nom: string; detail: string | null }[] };
      return j.etat === 'ok' && j.data ? j.data : [];
    } catch { return []; }
  }, []);
  return (
    <VueRapprochement donnees={donnees} occupe={occupe} message={message} chercher={chercher}
      onDecider={(l, geste, fiche) => { void envoyer({ action: 'decider', propositionId: l.id, geste, proprietaireId: fiche }); }}
      onValiderSurs={() => { void envoyer({ action: 'valider-surs' }); }}
      onDeciderBien={(l, geste, dossier) => { void envoyer({ action: 'decider-bien', propositionId: l.id, geste, dossierId: dossier }); }} />
  );
}
