'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS } from './commun';
import { CSS_CARTES, FormulaireCarte, type ChampsSaisis, type FicheAEditer } from '../gestion/CartesPersonnes';
import { CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';
import { CSS_CONDITIONS } from './ConditionsEntree';
import { BlocSuiviCommercial, CSS_SUIVI_COMMERCIAL, ttcDepuisHt, useParametresSuivi } from './SuiviCommercial';
import { CSS_ENTRETIEN, versEnvoiEntretien, versSaisieEntretien, type SaisieEntretien } from './EntretienBien';
import { ModaleIssue } from './ModaleIssue';
import { CSS_MODALE_CARACTERISTIQUES, ModaleCaracteristiquesBien } from './ModaleCaracteristiquesBien';
import { conditionsApresRelecture, ContenuConditionsBail, CSS_CONDITIONS_BAIL } from './BlocConditionsBail';
import { versSaisieConditions, type SaisieConditions } from '../../../../lib/location/conditionsEntree';
import { ficheFormatee } from '../../../../lib/gestion/saisieFiche';
import { changementsCarte, saisieDesChangements, type CarteApres } from '../../../../lib/gestion/traceFiche';
import {
  changementsDossier, ECRAN_DOSSIER, refusDossier, TITRE_BLOC, type CarteLocataireDossier, type ChangementDossier, type LectureDossier,
  type NomsDossier, type SaisieDossier, type SuiviDossier,
} from '../../../../lib/location/dossierLocation';

/**
 * ══ 🔴🔴 « DOSSIER DE LOCATION » (Arno, 24/10/2026) — LE FORMULAIRE « NOUVEAU LOCATAIRE » ROUVERT EN MODIFICATION ════════════════
 * Les 4 blocs de « Nouveau locataire » (mêmes composants : cartes, conditions d'entrée, entretien, suivi commercial), PRÉ-REMPLIS avec
 * les données réelles du bail, dans la grande modale de « Modifier le bien ». Rien n'est créé : chaque partie modifiée met à jour ce
 * qui existe (voir `dossierLocationRepo`). Barre du bas : « Annuler » et « Enregistrer les modifications » — pas d'envoi à ADHOC &
 * MONGA. « Enregistrer les modifications » est inactif tant que rien n'a changé, puis montre les SEULS champs modifiés, par bloc
 * (« Confirmer » / « Revenir »). Modifié par ailleurs depuis l'ouverture : refus explicite, rien n'est écrasé. Le formulaire de
 * création (`CreationLocataire`) n'est pas touché.
 */
const API = '/api/admin/gestion/annuaire/location';

/** La carte de la fiche, avec les changements déjà validés dans le dossier (non encore enregistrés). */
function carteCourante(c: CarteLocataireDossier, champs: CarteApres | undefined): FicheAEditer & { id: number } {
  if (champs === undefined) return c;
  return {
    ...c,
    ...(champs.civilite !== undefined ? { civilite: champs.civilite } : {}), ...(champs.prenom !== undefined ? { prenom: champs.prenom } : {}),
    ...(champs.nom !== undefined ? { nom: champs.nom } : {}), ...(champs.qualite !== undefined ? { qualite: champs.qualite } : {}),
    ...(champs.adresse !== undefined ? { adresse: champs.adresse } : {}), ...(champs.codePostal !== undefined ? { codePostal: champs.codePostal } : {}),
    ...(champs.commune !== undefined ? { commune: champs.commune } : {}), ...(champs.note !== undefined ? { note: champs.note } : {}),
    ...(champs.coordonnees !== undefined ? { contacts: champs.coordonnees.map((x, i) => ({ id: -(i + 1), sorte: x.sorte, affichage: x.valeur, libelle: (x as { libelle?: string }).libelle ?? null })) } : {}),
  };
}
const formatee = (c: FicheAEditer): FicheAEditer => ({ ...c, ...ficheFormatee({ civilite: c.civilite ?? '', nom: c.nom, prenom: c.prenom ?? '', adresse: c.adresse ?? '', codePostal: c.codePostal ?? '', commune: c.commune ?? '' }) });

export function ModaleDossierLocation({ activiteId, onFermer, onEnregistre, onRelire }: { activiteId: number; onFermer: () => void; onEnregistre: () => void;
  /** 🔴 Arno (25/10/2026) — l'origine modifiée dans son flux : la page derrière se relit, la modale reste ouverte. */
  onRelire?: () => void }) {
  const titreId = useId();
  const fenetre = useRef<HTMLDivElement | null>(null);
  const [lecture, setLecture] = useState<LectureDossier | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [n, setN] = useState(0);
  // La saisie : les cartes modifiées (seuls leurs champs modifiés), les conditions, l'entretien, le suivi, les deux TTC du bloc 4.
  const [cartes, setCartes] = useState<Record<number, CarteApres>>({});
  const [enEdition, setEnEdition] = useState<number | null>(null);
  const [conditions, setConditions] = useState<SaisieConditions | null>(null);
  const [entretien, setEntretien] = useState<SaisieEntretien | null>(null);
  const [suivi, setSuivi] = useState<SuiviDossier | null>(null);
  const [ttc, setTtc] = useState<{ proprietaire: string; locataire: string }>({ proprietaire: '', locataire: '' });
  const [issue, setIssue] = useState<null | { sorte: 'recap' } | { sorte: 'conflit'; motif: string } | { sorte: 'erreur'; motif: string } | { sorte: 'note'; motif: string } | { sorte: 'abandon' }>(null);
  const [envoi, setEnvoi] = useState(false);
  const [caracteristiques, setCaracteristiques] = useState(false);
  const lectureVue = useRef<LectureDossier | null>(null);
  const parametres = useParametresSuivi();

  /* La lecture ; `garder` : relire la base (version, valeurs) en GARDANT la saisie en cours (après « Caractéristiques du bien »). */
  const appliquer = useCallback((d: { etat?: string; data?: LectureDossier } | null, garder: boolean): void => {
    if (d === null) { setErreur('Ce dossier n’a pas pu être lu : le serveur n’a pas répondu.'); return; }
    if (d.etat !== 'ok' || d.data === undefined) {
      setErreur(d.etat === 'non_rattache' ? 'Dossier non rattaché — à rattacher d’abord.' : d.etat === 'sans_schema' ? 'La base n’est pas à jour pour ce dossier (migration 407).' : 'Ce dossier n’a pas pu être lu.');
      return;
    }
    {
      const l = d.data;
      const avant = lectureVue.current?.conditions?.valeurs.chargesCopro ?? null;
      lectureVue.current = l;
      setLecture(l);
      setErreur(null);
      if (garder) {
        /* 🔴 Arno (25/10/2026) — « Paiement des charges » modifié dans la fiche du bien (« Caractéristiques du bien loué ») : la saisie
           SUIT la fiche relue, sauf un choix fait ici à la main (gardé, et signalé « différent de la fiche du bien »). */
        setConditions((c) => conditionsApresRelecture(c, avant, l.conditions?.valeurs.chargesCopro));
        return;
      }
      setCartes({});
      setConditions(l.conditions === null ? null : versSaisieConditions(l.conditions.valeurs, l.conditions.loyer));
      setEntretien(l.entretien === null ? null : versSaisieEntretien(l.entretien.aPrevoir, l.entretien.entretiens as Parameters<typeof versSaisieEntretien>[1]));
      setSuivi(l.suivi);
      // Les TTC du bloc 4 : déduits des HT ENREGISTRÉS sur la ligne (le HT qu'ils redonnent est exactement celui-là : aucun écart
      // inventé à l'ouverture) ; modifier le TTC locataire modifie aussi les honoraires agence des sommes dues (la règle du formulaire).
      const ttcHt = (ht: string): string => ttcDepuisHt(ht) ?? '';
      setTtc({ proprietaire: ttcHt(l.suivi.honoProprietaireHt), locataire: ttcHt(l.suivi.honoLocataireHt) });
      setN((x) => x + 1);
    }
  }, []);
  const charger = useCallback((): Promise<{ etat?: string; data?: LectureDossier } | null> =>
    fetch(`${API}?dossierLocation=${activiteId}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: LectureDossier }>).catch(() => null), [activiteId]);
  const lire = useCallback(async (garder: boolean): Promise<void> => { appliquer(await charger(), garder); }, [appliquer, charger]);
  /* 🔴 Arno (25/10/2026) — l'ORIGINE enregistrée dans son propre flux (« Modifier », double validation) : la version et les champs d'origine
     relus, le reste de la saisie GARDÉ (le bouton du dossier n'écrase jamais l'origine qui vient d'être confirmée). */
  const origineRelue = useCallback(async (): Promise<void> => {
    const d = await charger();
    if (d === null || d.etat !== 'ok' || d.data === undefined) return;
    const l = d.data;
    lectureVue.current = l;
    setLecture(l);
    setSuivi((s) => (s === null ? s : { ...s, origineContact: l.suivi.origineContact, origineContactPrecision: l.suivi.origineContactPrecision, collegueId: l.suivi.collegueId,
      apporteurId: l.suivi.apporteurId, apporteurTaux: l.suivi.apporteurTaux, commissionApporteur: l.suivi.commissionApporteur, apporteurMode: l.suivi.apporteurMode,
      apporteurTauxGestion: l.suivi.apporteurTauxGestion }));
    onRelire?.();
  }, [charger, onRelire]);
  useEffect(() => {
    let vivant = true;
    void charger().then((d) => { if (vivant) appliquer(d, false); });
    return () => { vivant = false; };
  }, [charger, appliquer]);
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, []);

  const saisie: SaisieDossier | null = lecture === null || suivi === null ? null : {
    version: lecture.version,
    locataires: Object.entries(cartes).map(([id, champs]) => ({ id: Number(id), champs })),
    conditions,
    entretien: entretien === null ? null : (() => { const e = versEnvoiEntretien(entretien); return { aPrevoir: e.entretienAPrevoir, entretiens: e.entretiens }; })(),
    suivi,
  };
  const noms: NomsDossier = useMemo(() => {
    const lu = parametres.lu;
    const n = (l: readonly { id: number; libelle?: string; nom?: string }[] | undefined, id: number): string => {
      const x = (l ?? []).find((y) => y.id === id);
      return x?.libelle ?? x?.nom ?? `n° ${id}`;
    };
    return { negociateur: (id) => n(lu?.negociateurs, id), collegue: (id) => n(lu?.collegues, id), apporteur: (id) => n(lu?.apporteurs, id) };
  }, [parametres.lu]);
  const changements: ChangementDossier[] = lecture === null || saisie === null ? [] : changementsDossier(lecture, saisie, noms);
  const fermer = useCallback((): void => {
    if (changements.length > 0) { setIssue({ sorte: 'abandon' }); return; }
    onFermer();
  }, [changements.length, onFermer]);
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      if (fenetre.current?.querySelector('.cp-form') != null) return;
      fermer();
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [fermer]);

  const enregistrer = (): void => {
    if (lecture === null || saisie === null || changements.length === 0) return;
    const refus = refusDossier(lecture, saisie);
    if (refus !== null) { setIssue({ sorte: 'erreur', motif: refus }); return; }
    setIssue({ sorte: 'recap' });
  };
  const confirmer = async (): Promise<void> => {
    if (saisie === null || envoi) return;
    setEnvoi(true);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-svav-confirmation': 'propre' },
        body: JSON.stringify({ action: 'modifier-dossier-location', id: activiteId, saisie, ecran: ECRAN_DOSSIER }) });
      const d = await r.json().catch(() => ({})) as { etat?: string; motif?: string; data?: { note?: string } };
      // 🔴 Arno (25/10/2026) — enregistré, mais le « Type de bien » n'a pas été reporté sur la fiche (lots de familles différentes) : dit.
      if (d.etat === 'ok' && typeof d.data?.note === 'string') { setIssue({ sorte: 'note', motif: d.data.note }); return; }
      if (d.etat === 'ok') { setIssue(null); onEnregistre(); return; }
      if (d.etat === 'conflit') { setIssue({ sorte: 'conflit', motif: d.motif ?? 'Ce dossier a été modifié depuis son ouverture : rechargez-le.' }); return; }
      setIssue({ sorte: 'erreur', motif: d.motif ?? 'Les modifications n’ont pas été enregistrées.' });
    } catch {
      setIssue({ sorte: 'erreur', motif: 'Les modifications n’ont pas été enregistrées : le serveur n’a pas répondu.' });
    } finally { setEnvoi(false); }
  };

  const l = lecture;
  return (
    <div className="mcb-voile">
      <style>{CSS_MODALE_CARACTERISTIQUES + CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CARTES + CSS_CHAMP_ADRESSE + CSS_CONDITIONS + CSS_CONDITIONS_BAIL + CSS_ENTRETIEN + CSS_SUIVI_COMMERCIAL + CSS_DOSSIER}</style>
      <div className="mcb-fenetre" ref={fenetre} role="dialog" aria-modal="true" aria-labelledby={titreId} data-modale-dossier-location={activiteId}>
        <div className="mdl-tete">
          <h2 id={titreId} className="mdl-titre">{l?.titre ?? 'Dossier de location'}</h2>
          <button type="button" className="svv-btn svv-btn-outline gst-btn mdl-fermer" onClick={fermer} data-fermer-dossier>Fermer</button>
        </div>
        {erreur !== null && <p className="gst-erreur" role="alert" data-dossier-erreur>{erreur}</p>}
        {l === null || suivi === null ? (erreur === null && <p className="gst-info" role="status">Lecture du dossier…</p>) : (
          <div className="loc-page loc-ample mdl-page" key={n}>
            <section className="loc-section" aria-labelledby="mdl-1" data-bloc-dossier="1">
              <h3 id="mdl-1"><span className="loc-num">1</span>Le ou les locataires</h3>
              <p className="loc-section-phrase">Les cartes des locataires du bail : « Modifier » une carte, puis « Enregistrer les modifications » en bas.</p>
              <div className="mdl-cartes">
                {l.locataires.map((c) => {
                  const courante = carteCourante(c, cartes[c.id]);
                  if (enEdition === c.id) {
                    return (
                      <article key={c.id} className="cp-carte cp-carte--edition" data-carte-dossier={c.id}>
                        <FormulaireCarte p={courante} refus={null} onAnnuler={() => setEnEdition(null)}
                          onEnregistrer={async (champs: ChampsSaisis) => {
                            // Seuls les champs qui diffèrent de la FICHE (mise en forme comprise) restent : rien n'est encore écrit.
                            const ch = changementsCarte(formatee(c), champs);
                            setCartes((x) => { const y = { ...x }; if (ch.length === 0) delete y[c.id]; else y[c.id] = saisieDesChangements(champs, ch); return y; });
                            setEnEdition(null);
                          }} />
                      </article>
                    );
                  }
                  return (
                    <article key={c.id} className={`cp-carte mdl-carte${cartes[c.id] !== undefined ? ' mdl-carte--modifiee' : ''}`} data-carte-dossier={c.id}>
                      <div className="mdl-carte-tete">
                        <strong>{[courante.civilite, (courante.nom ?? '').toUpperCase(), courante.prenom].filter((x) => x).join(' ')}</strong>
                        {cartes[c.id] !== undefined && <span className="mdl-badge" data-carte-modifiee>modifiée</span>}
                        <button type="button" className="svv-btn svv-btn-outline gst-btn mdl-modifier-carte" onClick={() => setEnEdition(c.id)} data-modifier-carte={c.id}>Modifier</button>
                      </div>
                      <dl className="mdl-carte-dl">
                        <div><dt>Adresse</dt><dd>{[courante.adresse, [courante.codePostal, courante.commune].filter((x) => x).join(' ')].filter((x) => x).join(', ') || '—'}</dd></div>
                        {courante.contacts.map((k) => <div key={k.id}><dt>{k.libelle ?? (k.sorte === 'email' ? 'E-mail' : 'Téléphone')}</dt><dd>{k.affichage}</dd></div>)}
                        {courante.qualite && <div><dt>Qualité</dt><dd>{courante.qualite}</dd></div>}
                        {courante.note && <div><dt>Note</dt><dd>{courante.note}</dd></div>}
                      </dl>
                    </article>
                  );
                })}
              </div>
              {l.contacts.length > 0 && (
                <div className="mdl-contacts" data-contacts-dossier>
                  <p className="loc-muet" style={{ margin: '8px 0 4px' }}>Contacts du locataire (modifiables depuis leur fiche) :</p>
                  <ul>{l.contacts.map((k) => <li key={k.id}>{k.libelle}{k.qualite ? ` — ${k.qualite}` : ''}</li>)}</ul>
                </div>
              )}
            </section>

            <section className="loc-section" aria-labelledby="mdl-2" data-bloc-dossier="2">
              <h3 id="mdl-2"><span className="loc-num">2</span>Le bien loué</h3>
              <p className="mdl-bien"><strong>{l.bien.titre}</strong></p>
              <ul className="mdl-lots" data-lots-dossier>{l.lots.map((x) => <li key={x.id}>{x.libelle}</li>)}</ul>
              <p className="loc-muet" data-entree-dossier>Date d’entrée : {l.entree === null ? '—' : l.entree.split('-').reverse().join('/')} · un bail ne change ni de bien ni de date ici.</p>
              <button type="button" className="svv-btn svv-btn-outline gst-btn loc-bouton-bien" onClick={() => setCaracteristiques(true)} data-caracteristiques-bien="dossier">Caractéristiques du bien loué</button>
            </section>

            <section className="loc-section" aria-labelledby="mdl-3" data-bloc-dossier="3">
              <h3 id="mdl-3"><span className="loc-num">3</span>Conditions d’entrée et sommes dues</h3>
              {/* 🔴 Arno (25/10/2026) — le contenu du bloc 3, partagé avec la « Fiche locataire » du Suivi du mois (aucune copie). */}
              <ContenuConditionsBail l={l} conditions={conditions} onConditions={setConditions} entretien={entretien} onEntretien={setEntretien} />
            </section>

            <section className="loc-section" aria-labelledby="mdl-4" data-bloc-dossier="4" data-suivi-commercial>
              <h3 id="mdl-4"><span className="loc-num">4</span>Suivi commercial</h3>
              <BlocSuiviCommercial valeur={suivi} onChange={(v) => setSuivi({ ...v, categoriePrime: v.categoriePrime })} parametres={parametres} lotId={l.lotId}
                locataireIds={l.locataires.map((x) => x.id)} ttcProprietaire={ttc.proprietaire} ttcLocataire={ttc.locataire}
                onTtcProprietaire={(t) => setTtc((x) => ({ ...x, proprietaire: t }))}
                onTtcLocataire={(t) => {
                  setTtc((x) => ({ ...x, locataire: t }));
                  // La règle de « Nouveau locataire » : les honoraires locataire du suivi SONT les honoraires agence des sommes dues.
                  setConditions((c) => (c === null ? c : { ...c, sommes: { ...c.sommes, honorairesAgence: t } }));
                }}
                manque={null} loyer={conditions?.loyer} sansPreremplissage origineFlux={{ activiteId, onEnregistree: () => { void origineRelue(); } }} />
            </section>

            <div className="loc-collant mdl-collant" data-collant>
              <p className="loc-manques" role="status" data-etat-dossier>
                {changements.length === 0 ? 'Aucune modification.' : `${changements.length} modification${changements.length > 1 ? 's' : ''} à enregistrer.`}</p>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={fermer} data-annuler-dossier>Annuler</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={enregistrer} disabled={changements.length === 0 || envoi || enEdition !== null}
                data-enregistrer-dossier title={changements.length === 0 ? 'Aucune modification à enregistrer.' : enEdition !== null ? 'Une carte est encore ouverte.' : undefined}>
                {envoi ? 'Enregistrement…' : 'Enregistrer les modifications'}</button>
            </div>
          </div>
        )}
      </div>
      {caracteristiques && l !== null && (
        <ModaleCaracteristiquesBien lotId={l.lotId} retourMot="Dossier de location" trace={{ ecran: ECRAN_DOSSIER }}
          onFermer={() => setCaracteristiques(false)} onEnregistre={() => { setCaracteristiques(false); void lire(true); }} />
      )}
      {issue?.sorte === 'recap' && (
        <ModaleIssue sorte="attention" titre="Enregistrer les modifications ?" onFermer={() => setIssue(null)}
          actions={[{ libelle: 'Revenir', onClick: () => setIssue(null), repere: 'revenir-dossier' },
            { libelle: envoi ? 'Enregistrement…' : 'Confirmer', onClick: () => { void confirmer(); }, principal: true, repere: 'confirmer-dossier' }]}>
          <div data-recap-dossier>
            {([1, 3, 4] as const).filter((b) => changements.some((c) => c.bloc === b)).map((b) => (
              <div key={b} className="mdl-recap-bloc" data-recap-bloc={b}>
                <p className="mdl-recap-titre">{b}. {TITRE_BLOC[b]}</p>
                <ul className="eden-liste">{changements.filter((c) => c.bloc === b).map((c) => <li key={c.champ} data-recap-champ>{`${c.champ} : ${c.avant} → ${c.apres}`}</li>)}</ul>
              </div>
            ))}
          </div>
        </ModaleIssue>
      )}
      {issue?.sorte === 'conflit' && (
        <ModaleIssue sorte="attention" titre="Dossier modifié par ailleurs" onFermer={() => setIssue(null)} notes={[issue.motif]}
          actions={[{ libelle: 'Revenir à la saisie', onClick: () => setIssue(null), repere: 'revenir-conflit' },
            { libelle: 'Recharger', onClick: () => { setIssue(null); void lire(false); }, principal: true, repere: 'recharger-dossier' }]} />
      )}
      {issue?.sorte === 'note' && (
        <ModaleIssue sorte="attention" titre="Modifications enregistrées — à compléter" onFermer={() => { setIssue(null); onEnregistre(); }} notes={[issue.motif]}
          actions={[{ libelle: 'Fermer', onClick: () => { setIssue(null); onEnregistre(); }, principal: true, repere: 'fermer-note-dossier' }]} />
      )}
      {issue?.sorte === 'erreur' && (
        <ModaleIssue sorte="erreur" titre="Modifications non enregistrées" onFermer={() => setIssue(null)} notes={[issue.motif]}
          actions={[{ libelle: 'Fermer', onClick: () => setIssue(null), principal: true, repere: 'fermer-erreur-dossier' }]} />
      )}
      {issue?.sorte === 'abandon' && (
        <ModaleIssue sorte="attention" titre="Abandonner les modifications ?" onFermer={() => setIssue(null)}
          notes={[`${changements.length} modification${changements.length > 1 ? 's' : ''} non enregistrée${changements.length > 1 ? 's' : ''} : fermer les perdra.`]}
          actions={[{ libelle: 'Revenir à la saisie', onClick: () => setIssue(null), principal: true, repere: 'revenir-abandon' },
            { libelle: 'Abandonner', onClick: () => { setIssue(null); onFermer(); }, repere: 'abandonner-dossier' }]} />
      )}
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. */
const CSS_DOSSIER = `
.mdl-tete{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:0 4px}
.mdl-titre{margin:0;font-size:1.15rem;font-weight:800;color:var(--color-svv-ink);overflow-wrap:anywhere}
.mdl-fermer{width:auto;min-height:44px;margin:0;flex:0 0 auto}
.mdl-page{padding-bottom:0}
.mdl-cartes{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.mdl-carte{padding:12px 14px}
.mdl-carte--modifiee{border-color:var(--color-svv-amber)}
.mdl-carte-tete{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.mdl-carte-tete strong{flex:1 1 auto;overflow-wrap:anywhere}
.mdl-modifier-carte{width:auto;min-height:40px;margin:0;padding:0 12px}
.mdl-badge{padding:1px 8px;border-radius:999px;background:var(--color-svv-amber-soft);color:var(--color-svv-ink);font-size:.72rem;font-weight:800}
.mdl-carte-dl{margin:0;display:flex;flex-direction:column;gap:4px;font-size:.88rem}
.mdl-carte-dl div{display:flex;gap:8px}
.mdl-carte-dl dt{flex:0 0 90px;color:var(--color-svv-muted);font-weight:700}
.mdl-carte-dl dd{margin:0;overflow-wrap:anywhere}
.mdl-contacts ul,.mdl-lots{margin:0;padding-left:18px}
.mdl-bien{margin:0 0 6px}
.mdl-recap-bloc{margin:0 0 8px}
.mdl-recap-titre{margin:0 0 4px;font-weight:800}
`;
