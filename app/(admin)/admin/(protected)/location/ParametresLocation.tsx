'use client';

import { ENTETE_CONFIRMATION } from '../../../../lib/location/confirmationEnregistrement';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { ecrireEtatModale, lireEtatModale, PARAM_MODALE, useRechercheAdresse } from './etatModaleParametres';
import { DELAI_MAX_MOIS, DELAI_MIN_MOIS, dureeMois, verifierDelai } from '../../../../lib/gestion/finGestion';
import { usePathname } from 'next/navigation';
import { verifierDestinataires, type Destinataire } from '../../../../lib/location/mailNouvelleLocation';
import { refusVersionBareme, type VersionBareme } from '../../../../lib/location/honorairesProprietaire';
import { erreurLigne } from './EnvoiAdhocMonga';
import { CSS_ONGLETS_SUIVI, OngletApporteurs, OngletCommissions } from './OngletsSuivi';

/**
 * ══ 🔴🔴 LOCATION — L'ESPACE DE CONFIGURATION (roue crantée) (Arno, 21/10/2026) ═════════════════════════════════════════════
 * Sur la page d'ACCUEIL du module Location seulement, une icône roue crantée dans la barre blanche du haut, sous le lien rouge
 * « Déconnexion » (libellé accessible « Paramètres Location », cible ≥ 44 px), visible des ADMINISTRATEURS uniquement. Au clic :
 * une modale à deux onglets, plein écran au téléphone, « Enregistrer » / « Annuler » en bas à droite.
 *   · « Destinataires du mail » : la liste par défaut du mail « Nouvelle location » — modifier, supprimer, « + Ajouter »,
 *     réordonner, contrôle du format ; la personne qui envoie reçoit toujours une copie d'office ;
 *   · « Barèmes d'honoraires » : les tarifs au m² (zone très tendue, zone tendue, autres zones, état des lieux). 🔴 « Enregistrer »
 *     crée une NOUVELLE VERSION (« Applicable à partir du », aujourd'hui par défaut, jamais antérieure à la précédente) ; une
 *     version utilisée par un bail ne se modifie pas ; une version FUTURE jamais utilisée se corrige ; l'historique est affiché.
 * Le serveur (`/api/admin/location/parametres`) relit le rôle à chaque appel et applique les mêmes règles ; le verrou est en base.
 */

const API = '/api/admin/location/parametres';
export const ACCUEIL_LOCATION = '/admin/location';

interface Parametres {
  archivage?: { mois: number; disponible: boolean };
  destinataires: Destinataire[]; destinatairesSaisis: { le: string; par: string } | null;
  versions: VersionBareme[]; aujourdhui: string; manquantes: string[];
}
export type Onglet = 'destinataires' | 'baremes' | 'archivage' | 'apporteurs' | 'commissions';
/** Arno (22/10/2026, 406) — les onglets du suivi de l'activité enregistrent par leurs propres boutons (une ligne = un geste). */
const ONGLETS_SUIVI: readonly Onglet[] = ['apporteurs', 'commissions'];
interface SaisieBareme { depuis: string; tresTendue: string; tendue: string; autre: string; etatDesLieux: string; source: string }

const dateFr = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const virgule = (t: string): string => t.replace('.', ',');
let compteur = 0;

/**
 * Arno (23/10/2026) — l'ANNUAIRE DES APPORTEURS à portée de main : la MÊME modale que la roue, ouverte sur l'onglet « Apporteurs »
 * (création, collègue de rattachement). Un seul écran à maintenir. `rendu` dessine le déclencheur (une brique, un lien).
 */
/**
 * ══ 🔴 Arno (24/10/2026) — L'ÉTAT DE LA MODALE EST DANS L'ADRESSE ═══════════════════════════════════════════════════════════════
 * « On navigue et on valide autant qu'on veut DANS la modale » : son ouverture, son onglet, la carte et le panneau ouverts sont portés
 * par l'URL (`?parametres=apporteurs&apporteur=123&panneau=rattachement`). Un rechargement de la page — quelle qu'en soit la cause
 * (rafraîchissement, « Fast Refresh » du serveur de développement, retour arrière) — la rouvre EXACTEMENT au même endroit. L'adresse
 * est réécrite sur place (`history.replaceState`) : aucune navigation, aucun remontage de la page.
 */
export function OuvrirAnnuaireApporteurs({ rendu, onFerme }: { rendu: (ouvrir: () => void) => ReactNode; onFerme?: () => void }) {
  const recherche = useRechercheAdresse();
  const [local, setLocal] = useState<boolean | null>(null);
  const etat = lireEtatModale(recherche);
  const ouvert = local ?? etat.onglet !== null;
  return (
    <>
      {rendu(() => { setLocal(true); ecrireEtatModale({ [PARAM_MODALE]: 'apporteurs' }); })}
      {ouvert && <ModaleParametresLocation ongletInitial={etat.onglet ?? 'apporteurs'} url
        onFermer={() => { setLocal(false); ecrireEtatModale({ [PARAM_MODALE]: null, apporteur: null, panneau: null }); onFerme?.(); }} />}
    </>
  );
}

/** La roue (dans la barre du haut) : rien hors de l'accueil Location, rien pour un compte qui n'est pas administrateur. */
export function RoueParametresLocation({ administrateur }: { administrateur: boolean }) {
  const chemin = usePathname();
  const recherche = useRechercheAdresse();
  const [local, setLocal] = useState<boolean | null>(null);
  if (!administrateur || chemin !== ACCUEIL_LOCATION) return null;
  const etat = lireEtatModale(recherche);
  const ouvert = local ?? etat.onglet !== null;
  return (
    <>
      <style>{CSS_PARAMETRES}</style>
      <button type="button" className="plo-roue" aria-label="Paramètres Location" title="Paramètres Location" onClick={() => { setLocal(true); ecrireEtatModale({ [PARAM_MODALE]: 'destinataires' }); }} data-roue-parametres>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M19.14 12.94a7.07 7.07 0 0 0 .05-.94 7.07 7.07 0 0 0-.05-.94l2.03-1.58a.48.48 0 0 0 .12-.62l-1.92-3.32a.48.48 0 0 0-.59-.21l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 13.93 2h-3.86a.48.48 0 0 0-.48.41l-.36 2.54a7 7 0 0 0-1.62.94l-2.39-.96a.48.48 0 0 0-.59.21L2.71 8.46a.48.48 0 0 0 .12.62l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.48.48 0 0 0-.12.62l1.92 3.32c.12.22.38.3.59.21l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.04.24.24.41.48.41h3.86c.24 0 .44-.17.48-.41l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96c.22.09.47 0 .59-.21l1.92-3.32a.48.48 0 0 0-.12-.62l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
        </svg>
      </button>
      {ouvert && <ModaleParametresLocation ongletInitial={etat.onglet ?? 'destinataires'} url
        onFermer={() => { setLocal(false); ecrireEtatModale({ [PARAM_MODALE]: null, apporteur: null, panneau: null }); }} />}
    </>
  );
}

export function ModaleParametresLocation({ onFermer, ongletInitial = 'destinataires', url = false }: { onFermer: () => void; ongletInitial?: Onglet;
  /** L'état (onglet, carte, panneau) suit l'adresse (voir `lireEtatModale`). */
  url?: boolean }) {
  const titre = useId();
  const [onglet, setOnglet] = useState<Onglet>(ongletInitial);
  const [lu, setLu] = useState<Parametres | null>(null);
  const [lecture, setLecture] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const [liste, setListe] = useState<(Destinataire & { cle: number })[]>([]);
  const [bareme, setBareme] = useState<SaisieBareme | null>(null);
  const [corrigee, setCorrigee] = useState<VersionBareme | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  /** Arno (21/10/2026, 405) — le délai d'archivage saisi (mois). */
  const [delai, setDelai] = useState('24');
  const fermerRef = useRef<HTMLButtonElement | null>(null);

  const depuisVersion = (v: VersionBareme | undefined, jour: string): SaisieBareme => ({
    depuis: jour, tresTendue: virgule(v?.tresTendue ?? ''), tendue: virgule(v?.tendue ?? ''), autre: virgule(v?.autre ?? ''),
    etatDesLieux: virgule(v?.etatDesLieux ?? ''), source: '',
  });
  useEffect(() => {
    let vivant = true;
    fetch(API, { headers: { Accept: 'application/json' } }).then((r) => r.json()).then((d: { etat?: string; data?: Parametres; message?: string }) => {
      if (!vivant) return;
      if (d.etat !== 'ok' || d.data === undefined) { setLecture(d.message ?? 'Lecture impossible.'); return; }
      setLu(d.data);
      if (d.data.archivage) setDelai(String(d.data.archivage.mois));
      setListe(d.data.destinataires.map((x) => ({ ...x, cle: ++compteur })));
      // Pré-rempli avec les valeurs de la version EN VIGUEUR aujourd'hui (la plus récente qui a commencé), à la date du jour.
      const enVigueur = d.data.versions.find((v) => v.depuis <= d.data!.aujourdhui) ?? d.data.versions[0];
      setBareme(depuisVersion(enVigueur, d.data.aujourdhui));
      setCorrigee(null);
    }).catch(() => { if (vivant) setLecture('Lecture impossible : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [n]);
  useEffect(() => { fermerRef.current?.focus(); }, []);
  const fermer = useCallback(() => { if (!envoi) onFermer(); }, [envoi, onFermer]);
  /**
   * 🔴 Arno (24/10/2026) — la modale ne se ferme QUE par la croix, le clic en dehors ou « Annuler ». Échap ne ferme que l'élément
   * interne ouvert (une liste, un panneau, un formulaire) : plus jamais la modale. Le clic en dehors : seulement s'il COMMENCE et FINIT
   * hors de la fenêtre (un glisser depuis un champ, une sélection de texte qui déborde, ne ferment rien).
   */
  const clicDehors = useRef(false);

  const erreurs = liste.map((_, i) => erreurLigne(liste, i));
  const deplacer = (i: number, sens: -1 | 1): void => {
    setListe((l) => { const j = i + sens; if (j < 0 || j >= l.length) return l; const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c; });
    setMotif(null); setInfo(null);
  };
  const refusBareme = lu === null || bareme === null ? null
    : refusVersionBareme({ depuis: bareme.depuis, versions: lu.versions, aujourdhui: lu.aujourdhui, ...(corrigee === null ? {} : { corrigee }) });

  const poster = async (corps: Record<string, unknown>, reussite: string): Promise<void> => {
    setEnvoi(true); setMotif(null); setInfo(null);
    try {
      // 🔴 Arno (24/10/2026) — rester sur place : la modale confirme elle-même (message sous le bouton), sans la fenêtre verte de la tuile
      // (son « Voir la fiche » rechargeait la page et faisait quitter la modale).
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', [ENTETE_CONFIRMATION]: 'propre' }, body: JSON.stringify(corps) });
      const d = await r.json() as { etat?: string; motif?: string; message?: string };
      if (d.etat === 'ok') { setInfo(reussite); setN((x) => x + 1); return; }
      setMotif(d.etat === 'sans_schema' ? 'Mise à jour de la base à appliquer (migration 395) : rien n’a été enregistré.'
        : d.etat === 'inconnu' ? 'Cette version n’existe plus.' : d.motif ?? d.message ?? 'Enregistrement refusé.');
    } catch {
      setMotif('Enregistrement impossible : le serveur n’a pas répondu. Rien n’a été modifié.');
    } finally {
      setEnvoi(false);
    }
  };
  const enregistrer = async (): Promise<void> => {
    if (onglet === 'archivage') {
      const v = verifierDelai(delai);
      if (!v.ok) { setMotif(v.motif); return; }
      await poster({ action: 'archivage-delai', mois: v.mois }, `Délai d’archivage enregistré : ${dureeMois(v.mois)} après la fin de gestion.`);
      return;
    }
    if (onglet === 'destinataires') {
      const v = verifierDestinataires(liste.map((x) => ({ adresse: x.adresse, libelle: x.libelle })));
      if (!v.ok) { setMotif(v.motif); return; }
      await poster({ action: 'destinataires', liste: v.liste }, 'Liste des destinataires enregistrée.');
      return;
    }
    if (bareme === null) return;
    if (refusBareme !== null) { setMotif(refusBareme); return; }
    await poster({ action: corrigee === null ? 'bareme' : 'corriger-bareme', ...(corrigee === null ? {} : { id: corrigee.id }), ...bareme },
      corrigee === null ? 'Nouvelle version du barème enregistrée.' : 'Version corrigée.');
  };

  const champBareme = (k: keyof SaisieBareme, mot: string, type: 'date' | 'texte' | 'tarif' = 'tarif') => (
    <label className="plo-champ" data-champ-bareme={k}>
      <span>{mot}</span>
      <span className="plo-saisie">
        <input type={type === 'date' ? 'date' : 'text'} inputMode={type === 'tarif' ? 'decimal' : undefined} value={bareme?.[k] ?? ''}
          onChange={(e) => { const v = e.target.value; setBareme((b) => (b === null ? b : { ...b, [k]: v })); setMotif(null); setInfo(null); }} />
        {type === 'tarif' && <span className="plo-unite">€/m²</span>}
      </span>
    </label>
  );

  return (
    <div className="plo-voile" onMouseDown={(e) => { clicDehors.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (clicDehors.current && e.target === e.currentTarget) fermer(); clicDehors.current = false; }} data-voile-parametres>
      <style>{CSS_PARAMETRES + CSS_ONGLETS_SUIVI}</style>
      <div className="plo-fenetre" role="dialog" aria-modal="true" aria-labelledby={titre} data-modale-parametres>
        <header className="plo-tete">
          <h2 id={titre}>Paramètres Location</h2>
          <button ref={fermerRef} type="button" className="plo-x" aria-label="Fermer" onClick={fermer}>×</button>
        </header>
        <div className="plo-onglets" role="tablist" aria-label="Paramètres">
          {([['destinataires', 'Destinataires du mail'], ['baremes', 'Barèmes d’honoraires'], ['archivage', 'Archivage des fins de gestion'],
            ['apporteurs', 'Apporteurs'], ['commissions', 'Commissions']] as const).map(([k, mot]) => (
            <button key={k} type="button" role="tab" aria-selected={onglet === k} className="plo-onglet" data-onglet={k}
              onClick={() => { setOnglet(k); setMotif(null); setInfo(null); if (url) ecrireEtatModale({ [PARAM_MODALE]: k, apporteur: null, panneau: null }); }}>{mot}</button>
          ))}
        </div>
        <div className="plo-corps" role="tabpanel">
          {onglet === 'apporteurs' ? <OngletApporteurs url={url} /> : onglet === 'commissions' ? <OngletCommissions /> : lu === null ? <p className="plo-muet" role="status">{lecture ?? 'Lecture…'}</p> : (
            <>
              {lu.manquantes.length > 0 && <p className="plo-alerte" role="status" data-parametres-sans-migration>Mise à jour de la base à appliquer (migration {lu.manquantes.join(', ')}) :
                la configuration se lit, mais rien ne s’enregistre tant qu’elle n’est pas appliquée.</p>}
              {onglet === 'archivage' ? (
                <section data-onglet-archivage>
                  <label className="plo-champ" data-champ-archivage>Archivage des fins de gestion (mois après la date de fin)
                    <input type="number" min={DELAI_MIN_MOIS} max={DELAI_MAX_MOIS} step={1} inputMode="numeric" value={delai}
                      onChange={(e) => { setDelai(e.target.value); setMotif(null); setInfo(null); }} data-delai-archivage /></label>
                  <p className="plo-muet plo-petit-texte">Un bien en « Gestion terminée » est archivé automatiquement à sa date de fin + ce délai (par défaut 24 mois) :
                    il quitte la Gestion et son dossier Drive passe dans « Inactifs ». Un changement vaut pour les biens PAS ENCORE archivés, jamais pour ceux qui le sont.</p>
                  {lu.archivage?.disponible === false && <p className="plo-alerte" role="status">Mise à jour de la base à appliquer (migration 405) : le délai ne s’enregistre pas encore.</p>}
                </section>
              ) : onglet === 'destinataires' ? (
                <section data-onglet-destinataires>
                  <p className="plo-note">Les destinataires du mail « Nouvelle location » (bouton « Envoi ADHOC &amp; MONGA »), dans l’ordre d’envoi.
                    <strong> La personne qui envoie reçoit toujours une copie, automatiquement</strong> : inutile de l’ajouter ici.</p>
                  <ol className="plo-liste">
                    {liste.map((d, i) => (
                      <li key={d.cle} data-destinataire-defaut={i}>
                        <label className="plo-champ"><span>Adresse e-mail</span>
                          <input type="email" value={d.adresse} aria-invalid={erreurs[i] !== null} data-adresse
                            onChange={(e) => { const v = e.target.value; setListe((l) => l.map((x) => (x.cle === d.cle ? { ...x, adresse: v } : x))); setMotif(null); setInfo(null); }} /></label>
                        <label className="plo-champ"><span>Libellé</span>
                          <input value={d.libelle} data-libelle
                            onChange={(e) => { const v = e.target.value; setListe((l) => l.map((x) => (x.cle === d.cle ? { ...x, libelle: v } : x))); setMotif(null); setInfo(null); }} /></label>
                        <span className="plo-gestes">
                          <button type="button" className="plo-petit" aria-label={`Monter ${d.adresse || 'cette ligne'}`} disabled={i === 0} onClick={() => deplacer(i, -1)} data-monter>↑</button>
                          <button type="button" className="plo-petit" aria-label={`Descendre ${d.adresse || 'cette ligne'}`} disabled={i === liste.length - 1} onClick={() => deplacer(i, 1)} data-descendre>↓</button>
                          <button type="button" className="plo-petit" aria-label={`Supprimer ${d.adresse || 'cette ligne'}`} onClick={() => { setListe((l) => l.filter((x) => x.cle !== d.cle)); setMotif(null); setInfo(null); }} data-supprimer>×</button>
                        </span>
                        {erreurs[i] !== null && <p className="plo-erreur" role="alert">{erreurs[i]}</p>}
                      </li>
                    ))}
                  </ol>
                  <button type="button" className="svv-btn svv-btn-outline gst-btn plo-ajout" onClick={() => { setListe((l) => [...l, { adresse: '', libelle: '', cle: ++compteur }]); setInfo(null); }} data-ajouter>+ Ajouter</button>
                  {lu.destinatairesSaisis !== null && <p className="plo-muet plo-petit-texte">Dernière modification le {dateFr(lu.destinatairesSaisis.le)} par {lu.destinatairesSaisis.par}.</p>}
                </section>
              ) : (
                <section data-onglet-baremes>
                  <p className="plo-note">Les tarifs TTC au m² de surface habitable appliqués automatiquement aux honoraires propriétaire.
                    <strong> « Enregistrer » crée une nouvelle version</strong> : les versions existantes et les honoraires déjà enregistrés ne changent jamais.
                    Un nouveau calcul prend la version en vigueur à la date d’entrée du locataire.</p>
                  {corrigee !== null && (
                    <p className="plo-alerte" role="status" data-correction>Correction de la version applicable à partir du {dateFr(corrigee.depuis)} (future, jamais utilisée).{' '}
                      <button type="button" className="plo-lien" onClick={() => { setCorrigee(null); setBareme(depuisVersion(lu.versions.find((v) => v.depuis <= lu.aujourdhui) ?? lu.versions[0], lu.aujourdhui)); setMotif(null); }}>Revenir à une nouvelle version</button></p>
                  )}
                  <div className="plo-grille">
                    {champBareme('tresTendue', 'Zone très tendue')}
                    {champBareme('tendue', 'Zone tendue')}
                    {champBareme('autre', 'Autres zones')}
                    {champBareme('etatDesLieux', 'État des lieux')}
                    {champBareme('depuis', 'Applicable à partir du', 'date')}
                    {champBareme('source', 'Source (arrêté, décret… — facultatif)', 'texte')}
                  </div>
                  {refusBareme !== null && <p className="plo-erreur" role="alert" data-refus-bareme>{refusBareme}</p>}
                  <h3 className="plo-h3">Historique des versions</h3>
                  <ol className="plo-versions" data-historique-baremes>
                    {lu.versions.map((v) => {
                      const enVigueur = v === (lu.versions.find((x) => x.depuis <= lu.aujourdhui) ?? null);
                      const corrigeable = v.baux === 0 && v.depuis > lu.aujourdhui;
                      return (
                        <li key={v.id} data-version={v.id}>
                          <p className="plo-version-titre"><strong>Applicable à partir du {dateFr(v.depuis)}</strong>
                            {enVigueur && <span className="plo-pastille plo-pastille--vigueur">en vigueur</span>}
                            {v.depuis > lu.aujourdhui && <span className="plo-pastille">à venir</span>}</p>
                          <p className="plo-version-valeurs">Très tendue {virgule(v.tresTendue)} · tendue {virgule(v.tendue)} · autres {virgule(v.autre)} · état des lieux {virgule(v.etatDesLieux)} (€/m²)</p>
                          <p className="plo-muet plo-petit-texte">
                            <span data-baux-version>{v.baux === 0 ? 'Aucun bail' : `${v.baux} ${v.baux > 1 ? 'baux' : 'bail'}`}</span> · créée le {dateFr(v.saisiLe)} par {v.saisiPar}
                            {v.corrigeLe !== null && ` · corrigée le ${dateFr(v.corrigeLe)} par ${v.corrigePar ?? ''}`} · {v.source}</p>
                          {corrigeable ? (
                            <button type="button" className="svv-btn svv-btn-outline gst-btn plo-corriger" data-corriger-version={v.id}
                              onClick={() => { setCorrigee(v); setBareme({ depuis: v.depuis, tresTendue: virgule(v.tresTendue), tendue: virgule(v.tendue), autre: virgule(v.autre), etatDesLieux: virgule(v.etatDesLieux), source: v.source }); setMotif(null); setInfo(null); }}>Corriger</button>
                          ) : <p className="plo-muet plo-petit-texte" data-verrou-version>🔒 {v.baux > 0 ? 'Utilisée par un bail : ne se modifie pas.' : 'Déjà en vigueur : ne se modifie pas.'}</p>}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}
            </>
          )}
        </div>
        <footer className="plo-pied">
          {motif !== null && <p className="plo-erreur" role="alert" data-motif-parametres>{motif}</p>}
          {info !== null && <p className="plo-ok" role="status" data-info-parametres>{info}</p>}
          <div className="plo-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={fermer} disabled={envoi} data-annuler-parametres>Annuler</button>
            {/* Apporteurs / Commissions : chaque ligne enregistre par son propre bouton — pas de « Enregistrer » global (il ne ferait rien). */}
            {!ONGLETS_SUIVI.includes(onglet) && (
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void enregistrer(); }}
                disabled={envoi || lu === null || (onglet === 'archivage' ? lu.archivage?.disponible !== true : lu.manquantes.length > 0) || (onglet === 'baremes' && refusBareme !== null)} data-enregistrer-parametres>
                {envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Jetons du thème ; cibles ≥ 44 px ; plein écran au téléphone ; boutons en bas à droite. */
export const CSS_PARAMETRES = `
/* Arno (21/10/2026) : sur la ligne du bandeau, juste à droite de l'heure, SANS CADRE plus haut que les autres éléments —
   la cible reste de 44 px ; la marge négative l'empêche de rehausser la barre. */
.plo-roue{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;margin:-8px -6px;border:0;border-radius:10px;background:transparent;color:var(--color-svv-muted);cursor:pointer;flex:0 0 auto}
.plo-roue:hover{color:var(--color-svv-ink);background:var(--color-svv-surface)}
.plo-roue:focus-visible{outline:3px solid var(--color-svv-line-strong-hover);outline-offset:2px}
.plo-voile{position:fixed;inset:0;z-index:80;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);display:flex;align-items:center;justify-content:center;padding:24px}
.plo-fenetre{background:var(--color-svv-surface);color:var(--color-svv-ink);border-radius:18px;width:min(780px,100%);max-height:calc(100vh - 48px);display:flex;flex-direction:column;box-shadow:0 30px 60px -20px color-mix(in srgb, var(--color-svv-ink) 45%, transparent);overflow:hidden;text-align:left;font-weight:400}
.plo-tete{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px 8px}
.plo-tete h2{margin:0;font-size:1.2rem}
.plo-x{width:44px;height:44px;border:0;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-ink);font-size:1.4rem;cursor:pointer}
.plo-onglets{display:flex;gap:6px;padding:0 20px;border-bottom:1px solid var(--color-svv-line);overflow-x:auto;flex-shrink:0}
.plo-onglet{appearance:none;border:0;border-bottom:3px solid transparent;background:transparent;color:var(--color-svv-muted);font:inherit;font-weight:800;padding:10px 12px;min-height:44px;cursor:pointer;white-space:nowrap}
.plo-onglet[aria-selected="true"]{color:var(--color-svv-ink);border-bottom-color:var(--color-svv-red)}
.plo-corps{padding:16px 20px;overflow-y:auto;min-height:0;display:flex;flex-direction:column;gap:12px}
.plo-note{margin:0 0 10px;line-height:1.5}
.plo-muet{color:var(--color-svv-muted)}
.plo-petit-texte{margin:4px 0 0;font-size:.85rem;overflow-wrap:anywhere}
.plo-alerte{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber);border:1px solid var(--color-svv-amber)}
.plo-liste,.plo-versions{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column;gap:8px}
.plo-liste li{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto;gap:8px;align-items:end;padding:10px;border:1px solid var(--color-svv-line);border-radius:12px}
.plo-gestes{display:flex;gap:4px}
.plo-petit{width:44px;height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);font-size:1.1rem;cursor:pointer}
.plo-petit:disabled{opacity:.4;cursor:not-allowed}
.plo-champ{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:.8rem;font-weight:700;color:var(--color-svv-muted)}
.plo-champ input{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-size:.95rem;color:var(--color-svv-ink);background:var(--color-svv-surface);min-width:0;width:100%;box-sizing:border-box}
.plo-champ input[aria-invalid="true"]{border-color:var(--color-svv-red)}
.plo-saisie{display:flex;align-items:center;gap:6px}
.plo-unite{color:var(--color-svv-muted);font-weight:700;white-space:nowrap}
.plo-grille{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin-bottom:6px}
.plo-erreur{grid-column:1 / -1;margin:0;color:var(--color-svv-red);font-weight:700;font-size:.9rem}
.plo-ok{margin:0;color:var(--color-svv-green-ink);font-weight:700}
.plo-ajout{min-height:44px;align-self:flex-start}
.plo-h3{margin:14px 0 6px;font-size:1rem}
.plo-versions li{padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:12px}
.plo-version-titre{margin:0;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.plo-version-valeurs{margin:4px 0 0}
.plo-pastille{font-size:.72rem;font-weight:800;text-transform:uppercase;border-radius:999px;padding:2px 8px;background:var(--color-svv-field);border:1px solid var(--color-svv-line-strong)}
.plo-pastille--vigueur{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border-color:transparent}
.plo-corriger{margin-top:6px;min-height:44px;width:auto !important}
.plo-lien{appearance:none;border:0;background:none;color:var(--color-svv-red);font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;min-height:44px;padding:0}
.plo-pied{flex-shrink:0;border-top:1px solid var(--color-svv-line);padding:12px 20px;display:flex;flex-direction:column;gap:8px}
.plo-boutons{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
.plo-boutons .gst-btn,.plo-boutons button{min-height:44px;width:auto;flex:0 0 auto}
.plo-ajout{width:auto !important}
@media (max-width:640px){
  .plo-voile{padding:0;align-items:stretch}
  .plo-fenetre{width:100%;max-height:none;height:100%;border-radius:0}
  .plo-liste li{grid-template-columns:minmax(0,1fr)}
  .plo-grille{grid-template-columns:minmax(0,1fr)}
}
`;
