'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CSS_LOCATION_ECRANS, EtatLecture, envoyer, useLecture } from './commun';
import { CSS_RESULTATS } from './AccueilLocation';
import { CSS_MODALE_ARCHIVAGE, ModaleArchivage } from './ModaleArchivage';
import { FicheCommuneLocation } from '../gestion/FicheCommune';
import { aplatirResultats, type LigneAccueil, type ResultatsAccueil } from '../../../../lib/location/recherchePortefeuille';
import {
  etatBouton, LIBELLE_BOUTON, libelleBien, phraseArchivage, type ApercuArchivage, type EtatBouton,
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
 *   · déjà archivé → « Réactiver le propriétaire et ses biens ».
 * ARCHIVER = SORTIR DU PORTEFEUILLE : rien n'est effacé (cf. `sortirDuPortefeuille`).
 */
const DELAI_FRAPPE_MS = 200;

/** `refusFiche` : le motif quand le compte n'a pas le droit Gestion (la fiche commune l'exige) ; `null` = fiche permise. */
export function EcranArchivageProprietaire({ refusFiche }: { refusFiche: string | null }) {
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

  const choisir = useCallback((id: number): void => {
    setChoisi(id);
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

  return (
    <div className="loc-page arc-page">
      <style>{CSS_LOCATION_ECRANS + CSS_RESULTATS + CSS_ECRAN_ARCHIVAGE + CSS_MODALE_ARCHIVAGE}</style>
      <p className="loc-retour"><a href="/admin/location/proprietaires">← Propriétaires et biens</a></p>
      <h1 className="arc-cache">Supprimer un propriétaire</h1>
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
        {choisi !== null && <BoutonArchivage etat={apercu.etat} apres={apres} />}
      </div>
      {choisi !== null && vue !== null && (
        <section className="arc-fiche" aria-label="Fiche consultée" data-fiche-consultee={vue.sorte}>
          {vue.sorte !== 'proprietaire' && (
            <p className="arc-fil"><button type="button" className="arc-lien" onClick={() => ouvrir(null)}>← Revenir à la fiche du propriétaire</button></p>
          )}
          {refusFiche === null
            ? <FicheCommuneLocation key={`${vue.sorte}-${vue.id}-${version}`} fiche={vue} ouvrir={ouvrir} sansRetour />
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

  const agir = async (action: 'sortir' | 'reactiver', confirmeOccupation = false): Promise<void> => {
    setEnvoi(true); setMotif(null);
    const r = await envoyer({ action, sujet: 'proprietaire', id: a.id, ...(confirmeOccupation ? { confirmeOccupation: true } : {}) });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    const d = (r.data ?? {}) as { biens?: number; locations?: number; locataires?: number };
    setBilan(action === 'reactiver' ? `${a.nom} est réactivé, avec ses biens archivés en même temps.`
      : [`${a.nom} est archivé`, d.biens ? `${d.biens} bien(s) / annexe(s)` : null, d.locations ? `${d.locations} location(s) close(s) aujourd’hui` : null,
        d.locataires ? `${d.locataires} locataire(s) archivé(s)` : null].filter((x) => x !== null).join(' · ') + ' — rien n’a été effacé.');
    setConfirmer(false); setModale(false);
    apres();
  };
  const date = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="arc-action" data-bouton-archivage={e}>
      {e === 'reactiver' && a.sortie !== null && (
        <p className="loc-sortie arc-etat" role="status" data-archive>
          <span><strong>Archivé</strong> le {date(a.sortie.le)}{a.sortie.par === null ? '' : ` par ${a.sortie.par}`} — la fiche, ses biens et tout leur historique restent consultables ; rien n’a été effacé.</span>
        </p>
      )}
      <button type="button" className={`arc-gros arc-gros--${e}`} disabled={envoi}
        onClick={() => { setBilan(null); setMotif(null); if (e === 'reactiver') void agir('reactiver'); else if (e === 'alerte') setModale(true); else setConfirmer(true); }}>
        {e === 'alerte' && <span aria-hidden="true" className="arc-pictogramme">⚠</span>}{LIBELLE_BOUTON[e]}
      </button>
      {confirmer && e === 'archiver' && (
        <div className="loc-confirmation arc-confirmation" role="alertdialog" aria-label="Confirmer l’archivage">
          <p style={{ margin: '0 0 6px' }}><strong>Archiver {a.nom} et son historique ?</strong>{' '}
            {a.biens.length === 0 ? 'Aucun bien ne sort avec lui.' : `${a.biens.length} bien(s) et annexe(s) sortent avec lui.`}</p>
          {a.partages.length > 0 && (
            <p className="arc-note-ligne" data-biens-partages>Non archivé{a.partages.length > 1 ? 's' : ''}, détenu{a.partages.length > 1 ? 's' : ''} aussi par un autre propriétaire actif : {a.partages.map((p) => `${libelleBien(p)} (avec ${p.autres.join(', ')})`).join(' ; ')}.</p>
          )}
          <p className="loc-muet" style={{ margin: '0 0 8px' }}>{phraseArchivage('proprietaire')}</p>
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setConfirmer(false)}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => void agir('sortir')} data-confirmer-archivage>Confirmer l’archivage</button>
          </div>
        </div>
      )}
      {modale && e === 'alerte' && (
        <ModaleArchivage apercu={a} envoi={envoi} motif={motif} onConfirmer={() => void agir('sortir', true)} onAnnuler={() => setModale(false)} />
      )}
      {motif !== null && !modale && <p className="cp-refus" role="alert">{motif}</p>}
      {bilan !== null && <p className="gst-info arc-bilan" role="status">{bilan}</p>}
    </div>
  );
}

/**
 * Le bandeau COLLANT (recherche + gros bouton) reste en haut au défilement ; la fiche passe dessous. Couleurs du thème :
 * rouge de l'agence, orange d'alerte du thème (`--color-svv-urgence-orange`, texte de surface 4,60:1), blanc.
 */
const CSS_ECRAN_ARCHIVAGE = `
.arc-cache{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.arc-collant{position:sticky;top:0;z-index:40;display:flex;flex-direction:column;gap:12px;padding:10px 0 12px;background:var(--color-svv-bg);border-bottom:1px solid var(--color-svv-line)}
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
.arc-fiche{display:flex;flex-direction:column;gap:8px;min-width:0}
.arc-fil{margin:0}
.arc-lien{border:0;background:none;padding:6px 0;font:inherit;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer;min-height:44px}
@media (max-width:640px){
  .arc-gros{font-size:1.05rem;min-height:56px;padding:12px 14px;border-radius:14px}
  .arc-collant{gap:8px;padding:6px 0 8px}
}
`;
