'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CSS_CARTES, type ChampsSaisis } from '../gestion/CartesPersonnes';
import { CSS_MODALE_CARACTERISTIQUES } from './ModaleCaracteristiquesBien';
import { BlocTraceFiche, CSS_TRACE_FICHE, useTraceFiche } from './TraceFiche';
import { SaisieCartes, type EtatCartes } from './SaisieCartes';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS } from './commun';
import { CSS_CONDITIONS } from './ConditionsEntree';
import { CSS_ENTRETIEN } from './EntretienBien';
import { ModaleCaracteristiquesBien } from './ModaleCaracteristiquesBien';
import { ContenuConditionsBail, CSS_CONDITIONS_BAIL, useConditionsBail } from './BlocConditionsBail';
import { refusDossier, TITRE_BLOC } from '../../../../lib/location/dossierLocation';
import {
  avertissementCartes, champsModifies, changementsFiche, ECRAN_FICHE_LOCATAIRE, refusFiche, type CarteFicheLue, type ChangementFiche,
  type LectureFicheLocataire, type SaisieFicheLocataire,
} from '../../../../lib/location/ficheLocataireCartes';

/**
 * ══ 🔴 Arno (25/10/2026) — « FICHE LOCATAIRE » DEPUIS « SUIVI DU MOIS » : LES CARTES DU BLOC 1 DE « NOUVEAU LOCATAIRE », EN MODIFICATION ══
 * (Accord explicite d'Arno : elle REMPLACE, dans cette modale, l'affichage de la fiche Gestion — qui reste entière dans la tuile Gestion.)
 * Une carte par locataire du bail et par contact du locataire, préremplie ; « + Ajouter… » un colocataire ou un contact — le MÊME
 * composant que « Nouveau locataire » (`SaisieCartes`), les mêmes contrôles (nom, téléphone ET e-mail pour la première carte client).
 * En tête : « Dernière modification » et l'historique (le journal), et l'avertissement « Aucune carte complète » s'il y a lieu.
 * « Enregistrer les modifications » → le récapitulatif (ancienne → nouvelle), Confirmer / Revenir ; un conflit est refusé sans rien
 * écraser ; après confirmation, la modale RESTE ouverte (« ✓ Modifications enregistrées ») et la ligne du Suivi se relit derrière.
 * Aucun geste Drive.
 * 🔴 Arno (25/10/2026) — EN DESSOUS, LE BLOC 3 « CONDITIONS D'ENTRÉE » de la ligne (le Dossier de location : `activiteId`), complet, en
 * modification — le MÊME contenu que le Dossier (`ContenuConditionsBail`) — et « Caractéristiques du bien loué ». UN SEUL « Enregistrer
 * les modifications » pour les deux blocs : récapitulatif groupé par bloc, un seul enregistrement (tout est vérifié avant d'écrire).
 * Une ligne sans bail : « Dossier non rattaché — à rattacher d'abord » (rien n'est créé). Aucun envoi à ADHOC & MONGA.
 */
const API = '/api/admin/gestion/annuaire/location';

const champsDeCarte = (c: CarteFicheLue): ChampsSaisis => ({
  civilite: c.civilite, nom: c.nom, prenom: c.prenom, qualite: c.qualite, adresse: c.adresse, codePostal: c.codePostal, commune: c.commune, note: c.note,
  coordonnees: c.contacts.map((k) => ({ sorte: k.sorte, valeur: k.affichage, libelle: k.libelle ?? '' })),
});

/** L'état des cartes à l'écran → la saisie à envoyer (les seuls champs modifiés des cartes existantes ; les cartes ajoutées). PUR. */
export function saisieDesCartes(lu: LectureFicheLocataire, e: EtatCartes): SaisieFicheLocataire {
  const s: SaisieFicheLocataire = { version: lu.version, modifiees: [], nouvelles: [] };
  const passe = (sorte: 'client' | 'contact', champs: ChampsSaisis[], ids: (number | null)[] | undefined): void => {
    champs.forEach((c, i) => {
      const id = ids?.[i] ?? null;
      const lue = id === null ? undefined : lu.cartes.find((x) => x.id === id && x.sorte === sorte);
      if (lue === undefined) { s.nouvelles.push({ sorte, champs: c }); return; }
      const m = champsModifies(lue, c);
      if (m.changements.length > 0) s.modifiees.push({ id: lue.id, sorte, champs: m.champs });
    });
  };
  passe('client', e.clients, e.idsClients);
  passe('contact', e.contacts, e.idsContacts);
  return s;
}

type Issue = { sorte: 'recap' } | { sorte: 'erreur'; motif: string } | { sorte: 'conflit'; motif: string } | { sorte: 'abandon' } | null;

export function ModaleFicheLocataire({ locataireId, bailId = null, activiteId = null, libelle, onFermer, onEnregistre }: {
  locataireId: number; bailId?: number | null; libelle: string; onFermer: () => void;
  /** 🔴 Arno (25/10/2026) — la ligne du Suivi (son Dossier de location : le bloc 3) ; `null` : ligne sans bail rattaché. */
  activiteId?: number | null;
  /** La ligne du Suivi se relit DERRIÈRE la modale, qui reste ouverte. */
  onEnregistre: () => void;
}) {
  const titre = useId();
  const fenetre = useRef<HTMLDivElement | null>(null);
  const trace = useTraceFiche('locataire', locataireId);
  const [lu, setLu] = useState<LectureFicheLocataire | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const [etat, setEtat] = useState<EtatCartes | null>(null);
  const [issue, setIssue] = useState<Issue>(null);
  const [envoi, setEnvoi] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const bloc3 = useConditionsBail(activiteId);
  const [caracteristiques, setCaracteristiques] = useState(false);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?ficheLocataireCartes=${locataireId}${bailId !== null ? `&bail=${bailId}` : ''}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat?: string; data?: LectureFicheLocataire }>)
      .then((d) => {
        if (!vivant) return;
        if (d.etat === 'ok' && d.data && Array.isArray(d.data.cartes)) { setLu(d.data); setErreur(null); setEtat(null); } else setErreur('Cette fiche n’a pas pu être lue.');
      })
      .catch(() => { if (vivant) setErreur('Cette fiche n’a pas pu être lue : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [locataireId, bailId, n]);
  const surCartes = useCallback((e: EtatCartes) => { setEtat(e); }, []);
  const initiales = useMemo(() => (lu === null ? [] : lu.cartes.map((c) => ({ id: c.id, sorte: c.sorte, champs: champsDeCarte(c) }))), [lu]);
  const saisie = lu === null ? null : etat === null ? { version: lu.version, modifiees: [], nouvelles: [] } : saisieDesCartes(lu, etat);
  const changementsCartes: ChangementFiche[] = lu === null || saisie === null ? [] : changementsFiche(lu, saisie);
  // Le nombre de modifications des DEUX blocs (cartes et conditions d'entrée) : un seul enregistrement.
  const changements = [...changementsCartes, ...bloc3.changements];
  const nbChangements = changements.length;
  const ouvertes = etat?.ouvertes ?? 0;
  const fermer = useCallback((): void => {
    if (nbChangements > 0 && !envoi) { setIssue({ sorte: 'abandon' }); return; }
    onFermer();
  }, [nbChangements, envoi, onFermer]);
  useEffect(() => {
    // Échap referme — jamais quand une fenêtre est ouverte par-dessus, ni pendant la saisie d'une carte.
    const clavier = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      if (fenetre.current?.querySelector('.cp-form') != null) return;
      fermer();
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [fermer]);
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, []);

  const enregistrer = (): void => {
    if (lu === null || saisie === null || changements.length === 0) return;
    if (ouvertes > 0) { setIssue({ sorte: 'erreur', motif: 'Une carte est encore ouverte : enregistrez-la (ou annulez-la) avant d’enregistrer les modifications.' }); return; }
    // « Utiliser cette fiche » (une fiche déjà connue) : elle ne rejoint pas le bail d'ici — on le dit, rien n'est ignoré en silence.
    if ((etat?.existants.length ?? 0) > 0) { setIssue({ sorte: 'erreur', motif: 'Une fiche déjà connue a été retenue (« Utiliser cette fiche ») : elle ne peut pas rejoindre le bail depuis cette fenêtre. Retirez-la, ou faites-la entrer par « Nouveau locataire ».' }); return; }
    const refus = refusFiche(lu, saisie);
    if (refus !== null) { setIssue({ sorte: 'erreur', motif: refus }); return; }
    // Le bloc 3 : les mêmes contrôles que le Dossier de location (dossier complet : 0 valide, vide refusé) ; le bloc 4 n'est pas ici.
    if (bloc3.changements.length > 0 && bloc3.etat.sorte === 'ok' && bloc3.saisie !== null) {
      const r3 = refusDossier(bloc3.etat.l, bloc3.saisie, { suivi: false, charges: bloc3.etat.conditions?.chargesCopro !== undefined });
      if (r3 !== null) { setIssue({ sorte: 'erreur', motif: r3 }); return; }
    }
    setOk(null);
    setIssue({ sorte: 'recap' });
  };
  const confirmer = async (): Promise<void> => {
    if (lu === null || saisie === null || envoi) return;
    setEnvoi(true);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-svav-confirmation': 'propre' },
        body: JSON.stringify({ action: 'modifier-fiche-locataire', id: locataireId, bailId: lu.bailId, saisie, ecran: ECRAN_FICHE_LOCATAIRE,
          ...(bloc3.changements.length > 0 && bloc3.envoi !== null ? { dossier: bloc3.envoi } : {}) }) });
      const d = await r.json().catch(() => ({})) as { etat?: string; motif?: string };
      if (d.etat === 'ok') {
        setIssue(null); setOk('✓ Modifications enregistrées'); setN((x) => x + 1); trace.relire(); void bloc3.lire(false); onEnregistre();
        return;
      }
      if (d.etat === 'conflit') { setIssue({ sorte: 'conflit', motif: d.motif ?? 'Cette fiche a été modifiée depuis son ouverture : rechargez-la. Rien n’a été enregistré.' }); return; }
      setIssue({ sorte: 'erreur', motif: d.motif ?? 'Les modifications n’ont pas été enregistrées.' });
    } catch {
      setIssue({ sorte: 'erreur', motif: 'Les modifications n’ont pas été enregistrées : le serveur n’a pas répondu.' });
    } finally { setEnvoi(false); }
  };

  const avert = lu === null ? null : avertissementCartes(lu.cartes);
  const parCarte = new Map<string, ChangementFiche[]>();
  for (const c of changementsCartes) parCarte.set(c.carte, [...(parCarte.get(c.carte) ?? []), c]);
  return (
    <div className="mcb-voile">
      <style>{CSS_MODALE_CARACTERISTIQUES + CSS_TRACE_FICHE + CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CARTES + CSS_CONDITIONS + CSS_CONDITIONS_BAIL + CSS_ENTRETIEN + CSS_MODALE_LOCATAIRE}</style>
      <div className="mcb-fenetre" ref={fenetre} role="dialog" aria-modal="true" aria-labelledby={titre} data-modale-fiche-locataire={locataireId}>
        <div className="mfl-tete">
          <h2 id={titre} className="mfl-titre">{lu?.titre ?? `Fiche locataire — ${libelle}`}</h2>
          <button type="button" className="svv-btn svv-btn-outline gst-btn mfl-fermer" onClick={fermer} data-fermer-fiche-locataire>Fermer</button>
        </div>
        <section className="gst-page loc-page loc-ample">
          <BlocTraceFiche trace={trace} />
          {erreur !== null && <p className="gst-erreur" role="alert">{erreur}</p>}
          {lu === null ? (erreur === null && <p className="gst-info" role="status">Lecture de la fiche…</p>) : (
            <>
              {avert !== null && (
                <div className="cp-bandeau-incomplet" role="alert" data-sans-carte-complete>
                  <strong>{avert.titre}</strong>
                  <ul>{avert.lignes.map((x) => <li key={x}>{x}</li>)}</ul>
                  <span>Complétez au moins une carte : un téléphone et un e-mail.</span>
                </div>
              )}
              <section className="loc-section" aria-labelledby="mfl-1" data-bloc-cartes-locataire>
                <h3 id="mfl-1"><span className="loc-num">1</span>Le ou les locataires</h3>
                <p className="loc-section-phrase">Les cartes du bail : « Modifier » une carte, « + Ajouter… » un colocataire ou un contact du locataire, puis
                  « Enregistrer les modifications ». Rien n’est fusionné, rien n’est supprimé.</p>
                <SaisieCartes key={n} cote="locataire" onChange={surCartes} initiales={initiales} confirmerRetrait />
              </section>
              {/* 🔴 Arno (25/10/2026) — le bloc 3 de « Nouveau locataire », celui du Dossier de location de la ligne. */}
              <section className="loc-section" aria-labelledby="mfl-3" data-bloc-conditions-locataire>
                <h3 id="mfl-3"><span className="loc-num">3</span>{TITRE_BLOC[3]}</h3>
                {bloc3.etat.sorte === 'non_rattache' ? (
                  <p className="loc-alerte loc-alerte--orange" role="status" data-bloc3-non-rattache>Dossier non rattaché — à rattacher d’abord.</p>
                ) : bloc3.etat.sorte === 'erreur' ? (
                  <p className="gst-erreur" role="alert">{bloc3.etat.motif}</p>
                ) : bloc3.etat.sorte !== 'ok' ? (
                  <p className="gst-info" role="status">Lecture des conditions d’entrée…</p>
                ) : (
                  <>
                    <button type="button" className="svv-btn svv-btn-outline gst-btn loc-bouton-bien" onClick={() => setCaracteristiques(true)} data-caracteristiques-bien="fiche-locataire">
                      Caractéristiques du bien loué</button>
                    <ContenuConditionsBail l={bloc3.etat.l} conditions={bloc3.etat.conditions} onConditions={bloc3.poserConditions}
                      entretien={bloc3.etat.entretien} onEntretien={bloc3.poserEntretien} />
                  </>
                )}
              </section>
            </>
          )}
        </section>
        <div className="mfl-pied">
          {ok !== null && <p className="mfl-ok" role="status" data-fiche-enregistree>{ok}</p>}
          <p className="loc-muet" data-etat-fiche style={{ margin: 0 }}>{changements.length === 0 ? 'Aucune modification.' : `${changements.length} modification${changements.length > 1 ? 's' : ''} à enregistrer.`}</p>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={changements.length === 0 || envoi} onClick={enregistrer} data-enregistrer-fiche>
            Enregistrer les modifications</button>
        </div>
      </div>
      {issue !== null && (
        <div className="mfl-voile2" role="presentation">
          <div className="mfl-boite" role="dialog" aria-modal="true" aria-label={issue.sorte === 'recap' ? 'Récapitulatif' : 'Information'} data-issue-fiche={issue.sorte}>
            {issue.sorte === 'recap' ? (
              <>
                <h3>Enregistrer ces modifications ?</h3>
                <div data-recap-fiche>
                  {/* 🔴 Arno (25/10/2026) — les champs modifiés, GROUPÉS PAR BLOC (ancienne → nouvelle). */}
                  {changementsCartes.length > 0 && (
                    <div className="mfl-recap-bloc" data-recap-bloc="1"><p className="mfl-recap-titre">1. Le ou les locataires</p>
                      {[...parCarte.entries()].map(([carte, l]) => (
                        <div key={carte} className="mfl-recap-carte"><strong>{carte}</strong>
                          <ul>{l.map((c) => <li key={`${c.champ}-${c.apres}`}>{c.champ} : <span className="mfl-avant">{c.avant}</span> → <strong>{c.apres}</strong></li>)}</ul></div>
                      ))}
                    </div>
                  )}
                  {bloc3.changements.length > 0 && (
                    <div className="mfl-recap-bloc" data-recap-bloc="3"><p className="mfl-recap-titre">3. {TITRE_BLOC[3]}</p>
                      <ul>{bloc3.changements.map((c) => <li key={c.champ}>{c.champ} : <span className="mfl-avant">{c.avant}</span> → <strong>{c.apres}</strong></li>)}</ul>
                    </div>
                  )}
                </div>
                <div className="mfl-boutons">
                  <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setIssue(null)} disabled={envoi} data-revenir>Revenir</button>
                  <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void confirmer(); }} disabled={envoi} data-confirmer-fiche>
                    {envoi ? 'Enregistrement…' : 'Confirmer'}</button>
                </div>
              </>
            ) : issue.sorte === 'abandon' ? (
              <>
                <h3>Quitter sans enregistrer ?</h3>
                <p>Les modifications de cette fiche ne sont pas enregistrées : elles seront perdues.</p>
                <div className="mfl-boutons">
                  <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setIssue(null)} data-rester>Rester</button>
                  <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onFermer} data-quitter>Quitter sans enregistrer</button>
                </div>
              </>
            ) : (
              <>
                <h3>{issue.sorte === 'conflit' ? 'Fiche modifiée entre-temps' : 'Rien n’a été enregistré'}</h3>
                <p data-motif-fiche>{issue.motif}</p>
                <div className="mfl-boutons">
                  {issue.sorte === 'conflit' && <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { setIssue(null); setN((x) => x + 1); trace.relire(); void bloc3.lire(false); }} data-recharger>Recharger</button>}
                  <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setIssue(null)}>Fermer</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {caracteristiques && bloc3.etat.sorte === 'ok' && (
        <ModaleCaracteristiquesBien lotId={bloc3.etat.l.lotId} retourMot="Fiche locataire" trace={{ ecran: ECRAN_FICHE_LOCATAIRE }}
          onFermer={() => setCaracteristiques(false)} onEnregistre={() => { setCaracteristiques(false); void bloc3.lire(true); onEnregistre(); }} />
      )}
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. */
const CSS_MODALE_LOCATAIRE = `
.mfl-tete{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:0 4px}
.mfl-titre{margin:0;font-size:1.15rem;font-weight:800;color:var(--color-svv-ink);overflow-wrap:anywhere}
.mfl-fermer{width:auto;min-height:44px;margin:0;flex:0 0 auto}
.mfl-pied{position:sticky;bottom:0;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px 16px;padding:12px 4px 4px;background:var(--color-svv-surface);border-top:1px solid var(--color-svv-line)}
.mfl-pied .gst-btn{width:auto;min-height:44px}
.mfl-ok{margin:0;margin-right:auto;color:var(--color-svv-green-ink);font-weight:800}
.mfl-voile2{position:fixed;inset:0;z-index:95;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);display:flex;align-items:center;justify-content:center;padding:16px}
.mfl-boite{background:var(--color-svv-surface);color:var(--color-svv-ink);border-radius:16px;padding:18px 20px;width:min(620px,100%);max-height:calc(100vh - 32px);overflow:auto;display:flex;flex-direction:column;gap:10px}
.mfl-boite h3{margin:0;font-size:1.1rem}
.mfl-boite p{margin:0}
.mfl-recap-carte{padding:8px 0;border-bottom:1px solid var(--color-svv-line)}
.mfl-recap-bloc{display:flex;flex-direction:column;gap:2px;padding:6px 0}
.mfl-recap-bloc > ul{margin:4px 0 0;padding-left:1.2rem;overflow-wrap:anywhere}
.mfl-recap-titre{margin:0;font-weight:800;color:var(--color-svv-ink)}
.mfl-recap-carte ul{margin:4px 0 0;padding-left:1.2rem;overflow-wrap:anywhere}
.mfl-avant{color:var(--color-svv-muted);text-decoration:line-through}
.mfl-boutons{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.mfl-boutons .gst-btn{width:auto;min-height:44px}
`;
