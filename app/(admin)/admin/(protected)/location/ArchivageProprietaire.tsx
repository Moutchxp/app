'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API, CSS_LOCATION_ECRANS, EtatLecture, envoyer, phraseMail, useLecture } from './commun';
import { CSS_RESULTATS } from './AccueilLocation';
import { CSS_MODALE_ARCHIVAGE, ModaleArchivage } from './ModaleArchivage';
import { QuestionOrigine } from './QuestionOrigine';
import { FicheCommuneLocation } from '../gestion/FicheCommune';
import { aplatirResultats, type LigneAccueil, type ResultatsAccueil } from '../../../../lib/location/recherchePortefeuille';
import {
  BANDEAU_TOUS_LES_BIENS, dateFr, etatBouton, motVacant, LIBELLE_BOUTON, LIBELLE_FINAL_BIENS, libelleBien, libelleSortirBiens, phraseArchivage, phraseSortieBiens,
  QUESTION_ORIGINE_BIENS, tousChoisis, type ApercuArchivage, type BienASortir, type EtatBouton, type OrigineArchivage,
} from '../../../../lib/location/archivage';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';

/**
 * ══ 🔴🔴 TUILE LOCATION — « SUPPRIMER UN PROPRIÉTAIRE » (/admin/location/proprietaires/archiver), Arno 18/10/2026 ═════
 *
 * « Au départ, l'écran est presque vide : uniquement une ligne de moteur de recherche, spécialisé sur les PROPRIÉTAIRES
 * (nom, prénom, téléphone, e-mail, adresse d'un bien du portefeuille), résultats en direct, pastille rouge propriétaire.
 * Clic sur un propriétaire → la FICHE PROPRIÉTAIRE COMMUNE de la Gestion (même composant, sans écriture de mail), avec
 * navigation vers les fiches détail de chacun de ses biens. Tout en haut, toujours visibles (collants) : la ligne de
 * recherche, puis juste dessous le GROS BOUTON de la fonction, puis la fiche propriétaire ou la fiche du bien consulté. »
 *
 * Le gros bouton suit l'occupation de TOUS ses biens (aperçu du serveur, même calcul que l'écriture) :
 *   · aucune location en cours → ROUGE « Archiver le propriétaire et son historique » → confirmation simple ;
 *   · au moins une → ORANGE d'alerte → modale des biens occupés → « Confirmer l'archivage du propriétaire et de ses biens » ;
 *   · puis, sur les deux chemins, la DERNIÈRE QUESTION (origine de l'archivage) dans la même étape → « Archiver
 *     définitivement » — le seul clic qui écrit (Arno, 18/10/2026) ;
 *   · déjà archivé → « Réactiver le propriétaire et ses biens ».
 * ARCHIVER = SORTIR DU PORTEFEUILLE : rien n'est effacé (cf. `sortirDuPortefeuille`).
 */
const DELAI_FRAPPE_MS = 200;

/** `refusFiche` : le motif quand le compte n'a pas le droit Gestion (la fiche commune l'exige) ; `null` = fiche permise. */
/**
 * `mode` (Arno, 18/10/2026) : `'proprietaire'` = « Supprimer un propriétaire et tous ses biens » (l'archivage, inchangé) ;
 * `'biens'` = « Supprimer un des biens d'un propriétaire » : ses biens actifs listés, chacun avec « Sortir de la gestion »
 * (sélection), et le gros bouton collant « Sortir N bien(s) de la gestion ».
 */
export function EcranArchivageProprietaire({ refusFiche, mode = 'proprietaire' }: { refusFiche: string | null; mode?: 'proprietaire' | 'biens' }) {
  const [texte, setTexte] = useState('');
  const [terme, setTerme] = useState('');
  const [actif, setActif] = useState(-1);
  const [choisi, setChoisi] = useState<number | null>(null);
  const [vue, setVue] = useState<FicheUrl | null>(null);
  const [version, setVersion] = useState(0);
  const listeRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setTerme(texte.trim()), DELAI_FRAPPE_MS);
    return () => clearTimeout(t);
  }, [texte]);
  const recherche = useLecture<ResultatsAccueil>(terme.length >= 2 ? `proprietairesArchivage=${encodeURIComponent(terme)}` : null);
  const lignes: LigneAccueil[] = recherche.etat.etat === 'ok' ? aplatirResultats(recherche.etat.data) : [];
  const ouvert = terme.length >= 2;
  useEffect(() => { setActif(-1); }, [terme]);

  const apercu = useLecture<ApercuArchivage>(choisi === null ? null : `apercuArchivage=${choisi}&sujet=proprietaire`);
  const [choix, setChoix] = useState<number[]>([]);
  const biensLus = useLecture<BienASortir[]>(mode === 'biens' && choisi !== null ? `biensPourSortie=${choisi}&v=${version}` : null);

  const choisir = useCallback((id: number): void => {
    setChoisi(id);
    setChoix([]);
    setVue({ sorte: 'proprietaire', id });
    setTexte(''); setTerme(''); setActif(-1);
    window.scrollTo({ top: 0 });
  }, []);
  const vider = (): void => { setTexte(''); setTerme(''); setActif(-1); };
  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') { e.preventDefault(); vider(); return; }
    if (lignes.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif((i) => Math.min(lignes.length - 1, i + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActif((i) => Math.max(0, i - 1)); return; }
    if (e.key === 'Enter') {
      const l = lignes[actif >= 0 ? actif : 0];
      if (l !== undefined) { e.preventDefault(); choisir(l.id); }
    }
  };
  // La fiche commune ouvre ses liens ICI : un bien (ou un locataire) s'affiche sous le gros bouton ; un autre
  // propriétaire devient le propriétaire choisi ; « retour » ramène à la fiche du propriétaire choisi.
  const ouvrir = useCallback((f: FicheUrl | null): void => {
    if (f === null) { if (choisi !== null) setVue({ sorte: 'proprietaire', id: choisi }); }
    else if (f.sorte === 'proprietaire') choisir(f.id);
    else setVue(f);
    window.scrollTo({ top: 0 });
  }, [choisi, choisir]);
  const apres = useCallback((): void => { apercu.rafraichir(); setVersion((v) => v + 1); }, [apercu]);
  const titreEcran = mode === 'biens' ? 'Supprimer un des biens d’un propriétaire' : 'Supprimer un propriétaire';

  return (
    <div className="loc-page arc-page">
      <style>{CSS_LOCATION_ECRANS + CSS_RESULTATS + CSS_ECRAN_ARCHIVAGE + CSS_MODALE_ARCHIVAGE}</style>
      <p className="loc-retour"><a href="/admin/location/proprietaires/supprimer">← Supprimer un propriétaire ou un bien</a></p>
      <h1 className="arc-cache">{titreEcran}</h1>
      <div className="arc-collant" data-collant>
        <div className="arc-recherche">
          <label className="loc-recherche loc-recherche--large">
            <span aria-hidden="true">🔎</span>
            <input value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={auClavier} autoFocus type="search"
              placeholder="Propriétaire : nom, prénom, téléphone, e-mail ou adresse d’un de ses biens"
              aria-label="Chercher un propriétaire (nom, prénom, téléphone, e-mail ou adresse d’un de ses biens)"
              role="combobox" aria-expanded={ouvert && lignes.length > 0} aria-controls="arc-resultats" aria-autocomplete="list"
              aria-activedescendant={actif >= 0 ? `arc-res-${actif}` : undefined} />
            {texte !== '' && <button type="button" className="loc-vider" aria-label="Vider la recherche" onClick={vider}>×</button>}
          </label>
          {ouvert && (
            <div className="loc-panneau arc-panneau" data-panneau>
              {recherche.etat.etat !== 'ok' ? <EtatLecture etat={recherche.etat} />
                : lignes.length === 0 ? <p className="loc-muet loc-panneau-vide">Aucun propriétaire ne correspond à « {terme} ».</p>
                  : (
                    <ul className="loc-res" id="arc-resultats" role="listbox" ref={listeRef}>
                      {lignes.map((l, i) => (
                        <li key={l.id} role="presentation">
                          {i === lignes.findIndex((x) => x.ancien) && <p className="loc-res-separateur">Anciens — archivés (réactivation possible)</p>}
                          <button type="button" id={`arc-res-${i}`} role="option" aria-selected={i === actif} data-index={i} data-groupe="proprietaires"
                            className={`loc-res-ligne arc-res-ligne${l.ancien ? ' loc-res-ligne--ancien' : ''}`}
                            onMouseEnter={() => setActif(i)} onClick={() => choisir(l.id)}>
                            <span className={`loc-res-type loc-res-type--${l.ancien ? 'ancien' : 'proprietaires'}`}>{l.ancien ? 'Ancien · Propriétaire' : 'Propriétaire'}</span>
                            <strong className="loc-res-nom">{l.titre}</strong>
                            <span className="loc-res-infos">
                              <span className="loc-res-tel">{l.telephone ?? ''}</span>
                              <span className="loc-res-mail">{l.email ?? ''}</span>
                              <span className="loc-res-adr">{l.adresse ?? ''}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
            </div>
          )}
        </div>
        {choisi !== null && mode === 'proprietaire' && <BoutonArchivage etat={apercu.etat} apres={apres} />}
        {choisi !== null && mode === 'biens' && (
          <BoutonSortieBiens proprietaireId={choisi} apercuProprietaire={apercu.etat} biens={biensLus.etat} choix={choix}
            apres={() => { setChoix([]); apres(); }} />
        )}
      </div>
      {choisi !== null && mode === 'biens' && apercu.etat.etat === 'ok' && apercu.etat.data.sortie === null && (
        <SelectionBiens etat={biensLus.etat} choix={choix}
          onBascule={(id) => setChoix((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))} />
      )}
      {choisi !== null && vue !== null && (
        <section className="arc-fiche" aria-label="Fiche consultée" data-fiche-consultee={vue.sorte}>
          {vue.sorte !== 'proprietaire' && (
            <p className="arc-fil"><button type="button" className="arc-lien" onClick={() => ouvrir(null)}>← Revenir à la fiche du propriétaire</button></p>
          )}
          {refusFiche === null
            ? <FicheCommuneLocation key={`${vue.sorte}-${vue.id}-${version}`} fiche={vue} ouvrir={ouvrir} sansRetour sansBarreAnnuaire />
            : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{refusFiche}</div>}
        </section>
      )}
    </div>
  );
}

type Lecture = ReturnType<typeof useLecture<ApercuArchivage>>['etat'];

/** Le GROS BOUTON de la fonction, et ce qu'il ouvre (confirmation simple, modale des biens occupés, réactivation). */
function BoutonArchivage({ etat, apres }: { etat: Lecture; apres: () => void }) {
  const [confirmer, setConfirmer] = useState(false);
  const [etapeOrigine, setEtapeOrigine] = useState(false);
  const [modale, setModale] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);
  const a = etat.etat === 'ok' ? etat.data : null;
  const cle = a === null ? null : `${a.id}-${a.sortie?.le ?? ''}`;
  useEffect(() => { setConfirmer(false); setModale(false); setMotif(null); }, [cle]);
  if (etat.etat === 'erreur') return <EtatLecture etat={etat} />;
  if (a === null) return <button type="button" className="arc-gros arc-gros--attente" disabled>Chargement…</button>;
  const e: EtatBouton = etatBouton(a);

  // 🔴 RIEN N'EST ÉCRIT avant « Archiver définitivement » : c'est le seul geste qui envoie la sortie (avec son origine).
  const agir = async (action: 'sortir' | 'reactiver', confirmeOccupation = false, origine?: OrigineArchivage): Promise<void> => {
    setEnvoi(true); setMotif(null);
    const r = await envoyer({ action, sujet: 'proprietaire', id: a.id, ...(confirmeOccupation ? { confirmeOccupation: true } : {}), ...(origine === undefined ? {} : { origine }) });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    const d = (r.data ?? {}) as { biens?: number; locations?: number; locataires?: number };
    const motMail = phraseMail(r.mail) === null ? '' : ` ${phraseMail(r.mail)}`;
    setBilan((action === 'reactiver' ? `${a.nom} est réactivé, avec ses biens archivés en même temps.`
      : [`${a.nom} est archivé`, d.biens ? `${d.biens} bien(s) / annexe(s)` : null, d.locations ? `${d.locations} location(s) close(s) aujourd’hui` : null,
        d.locataires ? `${d.locataires} locataire(s) archivé(s)` : null].filter((x) => x !== null).join(' · ') + ' — rien n’a été effacé.') + motMail);
    setConfirmer(false); setModale(false);
    apres();
  };
  const date = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="arc-action" data-bouton-archivage={e}>
      {e === 'reactiver' && a.sortie !== null && (
        <p className="loc-sortie arc-etat" role="status" data-archive>
          <span><strong>Archivé le {date(a.sortie.le)}{a.sortie.par === null ? '' : ` par ${a.sortie.par}`}{a.sortie.origine ? ` — ${a.sortie.origine}` : ''}</strong>
            {' '}· la fiche, ses biens et tout leur historique restent consultables ; rien n’a été effacé.</span>
        </p>
      )}
      <button type="button" className={`arc-gros arc-gros--${e}`} disabled={envoi}
        onClick={() => { setBilan(null); setMotif(null); if (e === 'reactiver') void agir('reactiver'); else if (e === 'alerte') setModale(true); else { setConfirmer(true); setEtapeOrigine(false); } }}>
        {e === 'alerte' && <span aria-hidden="true" className="arc-pictogramme">⚠</span>}{LIBELLE_BOUTON[e]}
      </button>
      {confirmer && e === 'archiver' && etapeOrigine && (
        <div className="loc-confirmation arc-confirmation" role="alertdialog" aria-label="Dernière question avant l’archivage définitif" data-etape="origine">
          <QuestionOrigine envoi={envoi} motif={motif} onRetour={() => { setEtapeOrigine(false); setMotif(null); }} onArchiver={(o) => void agir('sortir', false, o)} />
        </div>
      )}
      {confirmer && e === 'archiver' && !etapeOrigine && (
        <div className="loc-confirmation arc-confirmation" role="alertdialog" aria-label="Confirmer l’archivage">
          <p style={{ margin: '0 0 6px' }}><strong>Archiver {a.nom} et son historique ?</strong>{' '}
            {a.biens.length === 0 ? 'Aucun bien ne sort avec lui.' : `${a.biens.length} bien(s) et annexe(s) sortent avec lui.`}</p>
          {a.partages.length > 0 && (
            <p className="arc-note-ligne" data-biens-partages>Non archivé{a.partages.length > 1 ? 's' : ''}, détenu{a.partages.length > 1 ? 's' : ''} aussi par un autre propriétaire actif : {a.partages.map((p) => `${libelleBien(p)} (avec ${p.autres.join(', ')})`).join(' ; ')}.</p>
          )}
          <p className="loc-muet" style={{ margin: '0 0 8px' }}>{phraseArchivage('proprietaire')}</p>
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setConfirmer(false)}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => setEtapeOrigine(true)} data-confirmer-archivage>Confirmer l’archivage</button>
          </div>
        </div>
      )}
      {modale && e === 'alerte' && (
        <ModaleArchivage apercu={a} envoi={envoi} motif={motif} demanderOrigine onConfirmer={(o) => void agir('sortir', true, o)} onAnnuler={() => { setModale(false); setMotif(null); }} />
      )}
      {motif !== null && !modale && !(confirmer && etapeOrigine) && <p className="cp-refus" role="alert">{motif}</p>}
      {bilan !== null && <p className="gst-info arc-bilan" role="status">{bilan}</p>}
    </div>
  );
}

/**
 * ══ « SUPPRIMER UN DES BIENS » : LA SÉLECTION (Arno, 18/10/2026) ════════════════════════════════════════════════════════
 * Tous les biens actifs du propriétaire ; sous chacun, « Sortir de la gestion » qui le SÉLECTIONNE (bascule : rouge avec ✓,
 * un nouveau clic le retire). Rien n'est écrit ici.
 */
function SelectionBiens({ etat, choix, onBascule }: {
  etat: ReturnType<typeof useLecture<BienASortir[]>>['etat']; choix: number[]; onBascule: (id: number) => void;
}) {
  if (etat.etat !== 'ok') return <EtatLecture etat={etat} />;
  const biens = etat.data;
  return (
    <section className="arc-biens" aria-label="Biens de ce propriétaire" data-selection-biens>
      <h2 className="arc-biens-titre">Biens de ce propriétaire <span className="loc-pastille">{biens.length}</span></h2>
      {biens.length === 0 ? <p className="loc-muet">Aucun bien actif : rien à sortir de la gestion.</p> : (
        <ul className="arc-biens-liste">
          {biens.map((b) => {
            const pris = choix.includes(b.lotId);
            return (
              <li key={b.lotId} className={`arc-bien-carte${pris ? ' arc-bien-carte--choisi' : ''}`} data-bien={b.lotId}>
                {/* Format UNIQUE (Arno, 18/10/2026) : adresse (2 lignes réservées) · type · occupation · compléments · bouton en bas. */}
                <strong className="arc-bien-adresse">{libelleBien(b)}</strong>
                <span className="arc-bien-type loc-muet">{b.nature ?? 'Type non renseigné'}</span>
                <div className="arc-bien-occupation" data-occupation={b.locataires.length > 0 ? 'loue' : 'vacant'}>
                  {/* Arno (18/10/2026) : UNE FICHE LOCATAIRE = UNE LIGNE (deux au plus si le nom est long), chacune surlignée ;
                      la date (entrée ou sortie) sur sa propre ligne, sous la liste. */}
                  {b.locataires.length > 0 ? (<>
                    <span>Loué à :</span>
                    <ul className="arc-noms">
                      {b.locataires.map((n) => <li key={n}><mark className="arc-surligne arc-surligne--en-place" data-en-place>{n}</mark></li>)}
                    </ul>
                    <span className="loc-muet" data-entree-le>{dateFr(b.entree) === null ? 'Date d’entrée non renseignée' : `Entré(e) dans les lieux le ${dateFr(b.entree)}`}</span>
                  </>) : (<>
                    <span className="arc-vacant" data-vacant>{motVacant(b.famille)}</span>
                    {b.derniersLocataires.length > 0 ? (<>
                      <span>{b.derniersLocataires.length > 1 ? 'Derniers locataires :' : 'Dernier locataire :'}</span>
                      <ul className="arc-noms">
                        {b.derniersLocataires.map((n) => <li key={n}><mark className="arc-surligne arc-surligne--ancien" data-dernier>{n}</mark></li>)}
                      </ul>
                      <span className="loc-muet" data-sortie-le>{dateFr(b.derniereSortie) === null ? 'date de sortie inconnue' : `Sorti(e) le ${dateFr(b.derniereSortie)}`}</span>
                    </>) : <span className="loc-muet" data-jamais-loue>Aucun locataire connu</span>}
                  </>)}
                </div>
                {(b.annexes.length > 0 || b.autresProprietaires.length > 0) && (
                  <div className="arc-bien-plus">
                    {b.annexes.length > 0 && (
                      <span className="loc-muet">Annexes (sortent avec lui) : {b.annexes.map((a) => `${a.libelle}${a.detachee ? ' (détachée)' : ''}`).join(' · ')}</span>
                    )}
                    {b.autresProprietaires.length > 0 && (
                      <span className="arc-note-ligne">Autre propriétaire actif : {b.autresProprietaires.join(', ')} — le bien sortira pour tous.</span>
                    )}
                  </div>
                )}
                <button type="button" className="arc-choisir" aria-pressed={pris} data-choisir={b.lotId} onClick={() => onBascule(b.lotId)}>
                  {pris ? '✓ Sortir de la gestion' : 'Sortir de la gestion'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Le GROS BOUTON du mode « biens » : « Sortir N bien(s) de la gestion » (grisé sans sélection). Biens occupés ⇒ la même
 * fenêtre d'alerte que l'archivage, limitée à la sélection ; sinon confirmation simple ; puis l'ORIGINE (« …de ce(s) bien(s) »).
 * TOUS les biens choisis ⇒ bandeau, et EXACTEMENT le parcours de l'archivage du propriétaire (le serveur bascule aussi).
 * Propriétaire déjà archivé ⇒ l'état archivé et « Réactiver », comme l'autre mode.
 */
function BoutonSortieBiens({ proprietaireId, apercuProprietaire, biens, choix, apres }: {
  proprietaireId: number; apercuProprietaire: Lecture; biens: ReturnType<typeof useLecture<BienASortir[]>>['etat']; choix: number[]; apres: () => void;
}) {
  const [apercu, setApercu] = useState<ApercuArchivage | null>(null);
  const [etape, setEtape] = useState<'confirmer' | 'origine' | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);
  const cleChoix = choix.slice().sort((a, b) => a - b).join(',');
  useEffect(() => { setApercu(null); setEtape(null); setMotif(null); }, [cleChoix]);
  if (apercuProprietaire.etat === 'ok' && apercuProprietaire.data.sortie !== null) return <BoutonArchivage etat={apercuProprietaire} apres={apres} />;
  const liste = biens.etat === 'ok' ? biens.data : [];
  const tous = tousChoisis(liste, choix);
  const n = choix.length;

  const ouvrir = async (): Promise<void> => {
    setBilan(null); setMotif(null);
    if (tous) {
      if (apercuProprietaire.etat !== 'ok') return;
      setApercu(apercuProprietaire.data);
      setEtape(apercuProprietaire.data.occupees.length > 0 ? null : 'confirmer');
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch(`${API}?apercuSortieBiens=${proprietaireId}&lots=${choix.join(',')}`, { cache: 'no-store' });
      const d = await res.json() as { etat?: string; data?: ApercuArchivage; motif?: string; message?: string };
      if (d.etat === 'ok' && d.data !== undefined) { setApercu(d.data); setEtape(d.data.occupees.length > 0 ? null : 'confirmer'); }
      else setMotif(d.motif ?? d.message ?? 'Lecture impossible.');
    } catch {
      setMotif('Lecture impossible : le serveur n’a pas répondu. Rien n’a été modifié.');
    }
    setEnvoi(false);
  };
  // 🔴 RIEN N'EST ÉCRIT avant « Sortir définitivement » (ou « Archiver définitivement » quand tous les biens sont choisis).
  const sortir = async (origine: OrigineArchivage, confirmeOccupation: boolean): Promise<void> => {
    setEnvoi(true); setMotif(null);
    const r = await envoyer({ action: 'sortir-biens', proprietaireId, lotIds: choix, origine, ...(confirmeOccupation ? { confirmeOccupation: true } : {}) });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    const d = (r.data ?? {}) as { biens?: number; locations?: number; locataires?: number; proprietaireArchive?: boolean };
    setBilan([d.proprietaireArchive ? 'Le propriétaire et ses biens sont archivés' : `${d.biens ?? 0} bien(s) / annexe(s) sorti(s) de la gestion`,
      d.locations ? `${d.locations} location(s) close(s) aujourd’hui` : null, d.locataires ? `${d.locataires} locataire(s) archivé(s)` : null]
      .filter((x) => x !== null).join(' · ') + ' — rien n’a été effacé.' + (phraseMail(r.mail) === null ? '' : ` ${phraseMail(r.mail)}`));
    setApercu(null); setEtape(null);
    apres();
  };
  const occupe = apercu !== null && apercu.occupees.length > 0;
  const motsBiens = apercu?.portee === 'biens';
  return (
    <div className="arc-action" data-bouton-sortie-biens={n}>
      {tous && <p className="arc-bandeau-tous" role="alert" data-tous-les-biens>{BANDEAU_TOUS_LES_BIENS}</p>}
      <button type="button" className="arc-gros arc-gros--archiver" disabled={n === 0 || envoi} onClick={() => void ouvrir()}>
        {libelleSortirBiens(n)}
      </button>
      {apercu !== null && !occupe && etape === 'confirmer' && (
        <div className="loc-confirmation arc-confirmation" role="alertdialog" aria-label="Confirmer la sortie">
          <p style={{ margin: '0 0 6px' }}><strong>{motsBiens ? `${libelleSortirBiens(n)} ?` : `Archiver ${apercu.nom} et son historique ?`}</strong>{' '}
            {motsBiens ? `${apercu.biens.length} bien(s) et annexe(s) sortent.` : `${apercu.biens.length} bien(s) et annexe(s) sortent avec lui.`}</p>
          {apercu.partages.length > 0 && (
            <p className="arc-note-ligne" data-biens-partages>{motsBiens
              ? `Autre propriétaire actif, le bien sort pour tous : ${apercu.partages.map((p) => `${libelleBien(p)} (avec ${p.autres.join(', ')})`).join(' ; ')}.`
              : `Non archivé${apercu.partages.length > 1 ? 's' : ''}, détenu${apercu.partages.length > 1 ? 's' : ''} aussi par un autre propriétaire actif : ${apercu.partages.map((p) => `${libelleBien(p)} (avec ${p.autres.join(', ')})`).join(' ; ')}.`}</p>
          )}
          <p className="loc-muet" style={{ margin: '0 0 8px' }}>{motsBiens ? phraseSortieBiens() : phraseArchivage('proprietaire')}</p>
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setApercu(null); setEtape(null); }}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setEtape('origine')} data-confirmer-archivage>
              {motsBiens ? 'Confirmer la sortie' : 'Confirmer l’archivage'}</button>
          </div>
        </div>
      )}
      {apercu !== null && !occupe && etape === 'origine' && (
        <div className="loc-confirmation arc-confirmation" role="alertdialog" aria-label="Dernière question" data-etape="origine">
          <QuestionOrigine envoi={envoi} motif={motif} onRetour={() => { setEtape('confirmer'); setMotif(null); }} onArchiver={(o) => void sortir(o, false)}
            {...(motsBiens ? { question: QUESTION_ORIGINE_BIENS, libelleFinal: LIBELLE_FINAL_BIENS } : {})} />
        </div>
      )}
      {apercu !== null && occupe && (
        <ModaleArchivage apercu={apercu} envoi={envoi} motif={motif} demanderOrigine
          onConfirmer={(o) => { if (o !== undefined) void sortir(o, true); }} onAnnuler={() => { setApercu(null); setMotif(null); }} />
      )}
      {motif !== null && apercu === null && <p className="cp-refus" role="alert">{motif}</p>}
      {bilan !== null && <p className="gst-info arc-bilan" role="status">{bilan}</p>}
    </div>
  );
}

/**
 * Le bandeau COLLANT (recherche + gros bouton) reste en haut au défilement ; la fiche passe dessous. Couleurs du thème :
 * rouge de l'agence, orange d'alerte du thème (`--color-svv-urgence-orange`, texte de surface 4,60:1), blanc.
 */
export const CSS_ECRAN_ARCHIVAGE = `
.arc-cache{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.arc-collant{position:sticky;top:0;z-index:40;display:flex;flex-direction:column;gap:12px;padding:10px 0 12px;background:var(--color-svv-bg);border-bottom:1px solid var(--color-svv-line)}
/* Une confirmation (ou la dernière question) ouverte : le bandeau ne colle plus — collé et plus haut que l'écran, son bas
   (le bouton final) deviendrait inatteignable au téléphone. Il recolle dès qu'elle se ferme. */
.arc-collant:has(.arc-confirmation){position:static}
.arc-recherche{position:relative}
.arc-panneau{top:calc(100% + 6px);max-height:min(60vh, 520px);z-index:45}
.arc-res-ligne{width:100%;border:0;background:transparent;font:inherit;text-align:left;cursor:pointer;border-radius:10px}
.arc-action{display:flex;flex-direction:column;gap:10px}
.arc-gros{box-sizing:border-box;width:100%;min-height:64px;padding:16px 22px;border-radius:18px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:1.2rem;font-weight:800;line-height:1.25;text-align:center;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px}
.arc-gros:disabled{cursor:default;opacity:.75}
.arc-gros--archiver{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface)}
.arc-gros--alerte{background:var(--color-svv-urgence-orange);border-color:var(--color-svv-urgence-orange);color:var(--color-svv-surface)}
.arc-gros--reactiver{background:var(--color-svv-field);border-color:var(--color-svv-ink);color:var(--color-svv-ink)}
.arc-gros--attente{color:var(--color-svv-muted)}
.arc-pictogramme{font-size:1.3rem;line-height:1}
.arc-etat{margin:0}
.arc-confirmation{margin:0}
.arc-note-ligne{margin:0 0 6px;padding:8px 10px;border-radius:8px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber)}
.arc-bilan{margin:0}
.arc-bandeau-tous{margin:0;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-urgence-orange);background:var(--color-svv-amber-soft);color:var(--color-svv-amber);font-weight:700}
.arc-biens{display:flex;flex-direction:column;gap:10px}
.arc-biens-titre{margin:0;font-size:1rem;font-weight:800;display:flex;align-items:center;gap:8px}
.arc-biens-liste{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:12px}
.arc-biens-liste{align-items:stretch}
.arc-bien-carte{display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:14px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-surface);min-width:0;overflow-wrap:anywhere;height:100%;box-sizing:border-box}
.arc-bien-adresse{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.35;min-height:2.7em}
.arc-bien-occupation{display:flex;flex-direction:column;gap:2px}
.arc-bien-plus{display:flex;flex-direction:column;gap:4px}
.arc-surligne{border-radius:4px;padding:0 4px;font-weight:700;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.arc-noms{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.arc-noms li{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4;min-width:0}
.arc-surligne--en-place{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.arc-surligne--ancien{background:var(--color-svv-violet-soft);color:var(--color-svv-violet)}
.arc-vacant{color:var(--color-svv-red);font-weight:800}
.arc-bien-carte .arc-choisir{margin-top:auto}
.arc-bien-carte--choisi{border-color:var(--color-svv-red);box-shadow:0 0 0 3px var(--color-svv-red-soft)}
.arc-choisir{margin-top:4px;min-height:44px;padding:8px 14px;border-radius:12px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-weight:800;cursor:pointer}
.arc-choisir[aria-pressed="true"]{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface)}
.arc-fiche{display:flex;flex-direction:column;gap:8px;min-width:0}
.arc-fil{margin:0}
.arc-lien{border:0;background:none;padding:6px 0;font:inherit;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer;min-height:44px}
@media (max-width:640px){
  .arc-gros{font-size:1.05rem;min-height:56px;padding:12px 14px;border-radius:14px}
  .arc-collant{gap:8px;padding:6px 0 8px}
}
`;
