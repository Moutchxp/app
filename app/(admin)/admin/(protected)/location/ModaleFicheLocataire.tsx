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
import { ContenuBienLoue, ContenuConditionsBail, CSS_CONDITIONS_BAIL, useConditionsBail } from './BlocConditionsBail';
import { ContenuSuiviLocataire, CSS_SUIVI_LOCATAIRE, RecapSuivi, useSuiviLocataire } from './SuiviCommercialLocataire';
import { CSS_SUIVI_COMMERCIAL } from './SuiviCommercial';
import { CSS_BLOC_REPLIE } from './BlocReplie';
import { LigneManques } from './LigneManques';
import { refusDossier, TITRE_BLOC } from '../../../../lib/location/dossierLocation';
import {
  avertissementCartes, champsModifies, titreProprietaires, changementsFiche, ECRAN_FICHE_LOCATAIRE, refusFiche, type CarteFicheLue, type ChangementFiche,
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
 * 🔴 Arno (26/10/2026) — ET LE BLOC 4 « SUIVI COMMERCIAL » de « Nouveau locataire » (`ContenuSuiviLocataire`), sur la ligne de suivi de
 * la ligne : pré-rempli si le bloc a été validé, vide sinon ; ses changements rejoignent le MÊME récapitulatif et le MÊME enregistrement
 * (le chemin du Dossier de location : la même ligne, la même version que le bloc 3). Ce qui manque : « Reste à renseigner » (barre du bas).
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
  // Une ligne du Suivi sans bail (activiteId null) : « non rattachée », comme le bloc 3 — rien n'est pris à sa place.
  const bloc4 = useSuiviLocataire(locataireId, { bailId, activiteId, nonRattache: activiteId === null });
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
  // Le nombre de modifications des TROIS blocs (cartes, conditions d'entrée, suivi commercial) : un seul enregistrement.
  const changements = [...changementsCartes, ...bloc3.changements, ...bloc4.changements];
  const nbChangements = changements.length;
  // 🔴 26/10/2026 — un bloc 4 touché mais incomplet compte aussi : « Enregistrer » dit ce qui manque, rien ne se perd en silence.
  const aEnregistrer = nbChangements > 0 || bloc4.touche;
  const ouvertes = etat?.ouvertes ?? 0;
  const fermer = useCallback((): void => {
    if (aEnregistrer && !envoi) { setIssue({ sorte: 'abandon' }); return; }
    onFermer();
  }, [aEnregistrer, envoi, onFermer]);
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
    if (lu === null || saisie === null || !aEnregistrer) return;
    if (ouvertes > 0) { setIssue({ sorte: 'erreur', motif: 'Une carte est encore ouverte : enregistrez-la (ou annulez-la) avant d’enregistrer les modifications.' }); return; }
    // « Utiliser cette fiche » (une fiche déjà connue) : elle ne rejoint pas le bail d'ici — on le dit, rien n'est ignoré en silence.
    if ((etat?.existants.length ?? 0) > 0) { setIssue({ sorte: 'erreur', motif: 'Une fiche déjà connue a été retenue (« Utiliser cette fiche ») : elle ne peut pas rejoindre le bail depuis cette fenêtre. Retirez-la, ou faites-la entrer par « Nouveau locataire ».' }); return; }
    const refus = refusFiche(lu, saisie);
    if (refus !== null) { setIssue({ sorte: 'erreur', motif: refus }); return; }
    // Le bloc 3 : les mêmes contrôles que le Dossier de location (dossier complet : 0 valide, vide refusé).
    if (bloc3.changements.length > 0 && bloc3.etat.sorte === 'ok' && bloc3.saisie !== null) {
      const r3 = refusDossier(bloc3.etat.l, bloc3.saisie, { suivi: false, charges: bloc3.etat.conditions?.chargesCopro !== undefined });
      if (r3 !== null) { setIssue({ sorte: 'erreur', motif: r3 }); return; }
    }
    // Le bloc 4 : les contrôles de « Nouveau locataire » (« Reste à renseigner ») ; la même ligne que le bloc 3 (une seule version).
    if (bloc4.touche) {
      if (bloc4.manques.length > 0) { setIssue({ sorte: 'erreur', motif: `Suivi commercial — reste à renseigner : ${bloc4.manques.map((m) => m.replace(/^Suivi commercial : /, '')).join(' · ')}.` }); return; }
      if (bloc4.envoi !== null && bloc4.envoi.activiteId === null) { setIssue({ sorte: 'erreur', motif: 'Ce bail n’a pas encore de ligne de suivi : enregistrez son suivi commercial depuis la fiche du locataire (Location).' }); return; }
      if (bloc3.envoi !== null && bloc4.envoi !== null && bloc3.envoi.saisie.version !== bloc4.envoi.version) {
        setIssue({ sorte: 'conflit', motif: 'Cette fiche a été modifiée depuis son ouverture : rechargez-la avant d’enregistrer. Rien n’a été enregistré.' }); return;
      }
    }
    if (changements.length === 0) { setIssue({ sorte: 'erreur', motif: 'Aucune modification à enregistrer : le suivi commercial a les mêmes valeurs que la ligne de suivi.' }); return; }
    setOk(null);
    setIssue({ sorte: 'recap' });
  };
  /* Les blocs 3 et 4 partent ENSEMBLE par le chemin du Dossier de location (une seule version) : le bloc 3 s'il a changé, le bloc 4 s'il a
     été touché (sinon ni l'un ni l'autre n'est lu ni exigé). */
  const avec3 = bloc3.changements.length > 0 && bloc3.envoi !== null;
  const avec4 = bloc4.changements.length > 0 && bloc4.envoi !== null && bloc4.envoi.activiteId !== null;
  const dossier = !avec3 && !avec4 ? null : {
    activiteId: avec4 && bloc4.envoi !== null && bloc4.envoi.activiteId !== null ? bloc4.envoi.activiteId : bloc3.envoi?.activiteId,
    saisie: {
      version: avec3 && bloc3.envoi !== null ? bloc3.envoi.saisie.version : bloc4.envoi?.version,
      ...(avec3 && bloc3.envoi !== null ? { conditions: bloc3.envoi.saisie.conditions, entretien: bloc3.envoi.saisie.entretien } : {}),
      ...(avec4 && bloc4.envoi !== null ? { suivi: bloc4.envoi.suivi } : {}),
    },
  };
  const confirmer = async (): Promise<void> => {
    if (lu === null || saisie === null || envoi) return;
    setEnvoi(true);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-svav-confirmation': 'propre' },
        body: JSON.stringify({ action: 'modifier-fiche-locataire', id: locataireId, bailId: lu.bailId, saisie, ecran: ECRAN_FICHE_LOCATAIRE,
          ...(dossier !== null ? { dossier } : {}) }) });
      const d = await r.json().catch(() => ({})) as { etat?: string; motif?: string };
      if (d.etat === 'ok') {
        setIssue(null); setOk('✓ Modifications enregistrées'); setN((x) => x + 1); trace.relire(); void bloc3.lire(false); void bloc4.lire(); onEnregistre();
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
      <style>{CSS_MODALE_CARACTERISTIQUES + CSS_TRACE_FICHE + CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CARTES + CSS_CONDITIONS + CSS_CONDITIONS_BAIL + CSS_ENTRETIEN
        + CSS_SUIVI_COMMERCIAL + CSS_BLOC_REPLIE + CSS_SUIVI_LOCATAIRE + CSS_MODALE_LOCATAIRE}</style>
      <div className="mcb-fenetre" ref={fenetre} role="dialog" aria-modal="true" aria-labelledby={titre} data-modale-fiche-locataire={locataireId}>
        <div className="mfl-tete">
          {/* 🔴 Arno (27/10/2026) — en gros, le ou les propriétaires du bien ; le nom du locataire juste en dessous. */}
          <div className="mfl-titres">
            {titreProprietaires(lu?.proprietaires) !== null ? (
              <>
                <h2 id={titre} className="mfl-titre mfl-titre--proprietaire" data-titre-proprietaires>{titreProprietaires(lu?.proprietaires)}</h2>
                <p className="mfl-sous-titre" data-titre-locataire>{lu?.titre ?? `Fiche locataire — ${libelle}`}</p>
              </>
            ) : <h2 id={titre} className="mfl-titre" data-titre-locataire>{lu?.titre ?? `Fiche locataire — ${libelle}`}</h2>}
          </div>
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
              {/* 🔴 Arno (27/10/2026) — le bloc 2 de « Nouveau locataire », celui du Dossier de location de la ligne (le même contenu). */}
              <section className="loc-section" aria-labelledby="mfl-2" data-bloc-bien-locataire>
                <h3 id="mfl-2"><span className="loc-num">2</span>Le bien loué</h3>
                {bloc3.etat.sorte === 'non_rattache' ? (
                  <p className="loc-alerte loc-alerte--orange" role="status" data-bloc2-non-rattache>Dossier non rattaché — à rattacher d’abord.</p>
                ) : bloc3.etat.sorte === 'erreur' ? (
                  <p className="gst-erreur" role="alert">{bloc3.etat.motif}</p>
                ) : bloc3.etat.sorte !== 'ok' ? (
                  <p className="gst-info" role="status">Lecture du bien loué…</p>
                ) : (
                  <ContenuBienLoue l={bloc3.etat.l} onCaracteristiques={() => setCaracteristiques(true)} repere="fiche-locataire-bien" />
                )}
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
              {/* 🔴 Arno (26/10/2026) — le bloc 4 de « Nouveau locataire », sur la ligne de suivi du bail (pré-rempli si validé, vide sinon). */}
              <section className="loc-section" aria-labelledby="mfl-4" data-bloc-suivi-locataire data-suivi-commercial>
                <h3 id="mfl-4"><span className="loc-num">4</span>{TITRE_BLOC[4]}</h3>
                <ContenuSuiviLocataire s={bloc4} ecran={ECRAN_FICHE_LOCATAIRE}
                  loyer={bloc3.etat.sorte === 'ok' ? bloc3.etat.conditions?.loyer : undefined}
                  onTtcLocataire={(t) => {
                    // La règle de « Nouveau locataire » : les honoraires locataire du suivi SONT les honoraires agence des sommes dues.
                    if (bloc3.etat.sorte === 'ok' && bloc3.etat.conditions !== null) {
                      const c = bloc3.etat.conditions;
                      bloc3.poserConditions({ ...c, sommes: { ...c.sommes, honorairesAgence: t }, agenceManuel: t !== '' });
                    }
                  }} />
              </section>
            </>
          )}
        </section>
        <div className="mfl-pied">
          {ok !== null && <p className="mfl-ok" role="status" data-fiche-enregistree>{ok}</p>}
          {/* 🔴 26/10/2026 — « Reste à renseigner » du suivi commercial : une ligne, la liste dans une bulle (`LigneManques`). */}
          <LigneManques manques={bloc4.manques} attributs={{ 'data-manques-suivi': '' }} />
          <p className="loc-muet" data-etat-fiche style={{ margin: 0 }}>{changements.length === 0 ? 'Aucune modification.' : `${changements.length} modification${changements.length > 1 ? 's' : ''} à enregistrer.`}</p>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!aEnregistrer || envoi} onClick={enregistrer} data-enregistrer-fiche>
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
                  {bloc4.changements.length > 0 && <RecapSuivi changements={bloc4.changements} creation={false} />}
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
                  {issue.sorte === 'conflit' && <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { setIssue(null); setN((x) => x + 1); trace.relire(); void bloc3.lire(false); void bloc4.lire(); }} data-recharger>Recharger</button>}
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
.mfl-titres{display:flex;flex-direction:column;gap:2px;min-width:0}
.mfl-titre--proprietaire{font-size:1.45rem}
.mfl-sous-titre{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-muted);overflow-wrap:anywhere}
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
