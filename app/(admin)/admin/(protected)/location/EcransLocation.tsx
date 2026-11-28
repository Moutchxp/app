'use client';

import { LienRetour } from '../_composants/NavigationRetour';
import { FiltreOrigineACompleter } from './FiltreOrigineACompleter';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, EtatLecture, liste, useLecture } from './commun';
import { TableauBordSuivi } from './TableauBordSuivi';
import { PAGE_PARAMETRES } from './parametresAdresse';
import { aRattacher, type Apporteur } from '../../../../lib/location/suivi/suivi';
import { useEffect, useState } from 'react';
import { useContexteRedaction } from '../gestion/useContexteRedaction';
import { useEcrireFlottant } from '../gestion/EcrireFlottant';
import { adressePostaleSyndic, lienModifierSyndic, type FicheSyndicLocation } from '../../../../lib/location/adressesCoproSyndic';
import { libelleEnGestion } from '../../../../lib/location/lotsVacants';
import { BoutonCopier, CSS_BOUTON_COPIER } from '../gestion/BoutonCopier';
import { BoutonEcrireSelection, CaseMail, CSS_SELECTION_MAILS, FournisseurSelectionMails, useEtatSelectionMails } from '../gestion/SelectionMails';
import { lienAppel, telephoneLisible } from '../../../../lib/gestion/telephoneAffichage';

/**
 * ══ 🔴🔴 TUILE LOCATION — LES TROIS ÉCRANS DE L'ACCUEIL (refonte du 17/10/2026) ════════════════════════════════════
 * ① « Ajouter / supprimer un propriétaire / bien » · ② « Ajouter / supprimer un locataire » · ③ « Outils de suivi ».
 * Ce qui était sur l'ancien accueil (onglets, listes, boutons) est ICI, déplacé, pas perdu.
 */
export function EcranProprietairesBiens() {
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION}</style>
      <p className="loc-retour"><LienRetour href="/admin/location" mot="Location" /></p>
      {/* Arno (17/10/2026) : titre → légende, puis légende → 2 gros boutons, EXACTEMENT les espacements de l'accueil (titre →
          légende, puis moteur de recherche → 3 grosses cases). D'où les MÊMES classes d'en-tête que l'accueil (`svv-page-*`,
          celles d'`EnTetePage`), puis le MÊME espace réservé que sous le moteur (`loc-zone-resultats`, vide). */}
      <header className="svv-page-head loc-tete-comme-accueil">
        <div className="svv-page-head-ligne"><h1 className="svv-page-title">Propriétaires et biens</h1></div>
        <p className="svv-page-sub">Créer un propriétaire avec son bien et ses annexes ; « supprimer » = sortir du portefeuille (rien n’est effacé).</p>
      </header>
      <div className="loc-zone-resultats loc-zone-resultats--vide" aria-hidden="true" data-espace-accueil />
      {/* « 2 GROS BOUTONS côte à côte, chacun la moitié de la largeur (empilés au téléphone) », avec le MÊME effet 3D que les
          3 cases de l'accueil. Retirés sur décision d'Arno (17/10/2026) : le bouton « + Nouveau propriétaire + bien » (doublon de
          ces 2 boutons) et le tableau Propriétaires / Biens (onglets, Actifs / Anciens, liste paginée) — les fiches, anciens
          compris, s'ouvrent par le moteur de recherche de l'accueil. Confirmé par Arno le 17/11/2026, après relecture de ses notes :
          « les retraits du 17/10 […] étaient bien SES décisions (règle « une seule fiche propriétaire, locataire et bien : celles de la
          Gestion » et accueil Location en 3 grosses cases) ». */}
      {/* Arno (18/10/2026) : TROIS grosses cases — « Supprimer un propriétaire / un bien » (NOUVELLE, en première position, SEULE à porter
          la trame rouge), puis « Créer un nouveau propriétaire » et « Ajouter un nouveau bien », en blanc. Effet 3D sur les trois. */}
      <ul className="loc-gros-boutons loc-gros-boutons--3d loc-gros-boutons--trois" aria-label="Propriétaires et biens">
        <li><a className="loc-gros-bouton loc-gros-bouton--plein" href="/admin/location/proprietaires/supprimer" data-gros="supprimer-proprietaire">
          Supprimer un propriétaire / un bien<small>Archiver un propriétaire et tous ses biens, ou sortir un ou plusieurs de ses biens de la gestion : rien n’est effacé, réactivable.</small></a></li>
        <li><a className="loc-gros-bouton" href="/admin/location/nouveau-proprietaire" data-gros="proprietaire">
          Créer un nouveau propriétaire<small>Une carte de contact par personne (couple, copropriétaires, SCI…), puis son bien.</small></a></li>
        <li><a className="loc-gros-bouton" href="/admin/location/nouveau-bien" data-gros="bien">
          Ajouter un nouveau bien<small>Pour un propriétaire déjà connu : adresse, logement, copropriété, annexes, DPE…</small></a></li>
      </ul>
      {/* 🔴 Arno (25/10/2026, 425) — le filtre « Origine à compléter » (replié) : les propriétaires dont l'origine du contact reste à compléter. */}
      <FiltreOrigineACompleter lien={(id) => `/admin/location/proprietaire/${id}`} />
    </div>
  );
}

/**
 * ══ « SUPPRIMER UN PROPRIÉTAIRE » → L'ÉCRAN INTERMÉDIAIRE (/admin/location/proprietaires/supprimer), Arno 18/10/2026 ══════
 * Deux gros boutons côte à côte (empilés au téléphone), même style et même effet 3D que les autres cases, TOUS DEUX en trame
 * ROUGE (Arno, 18/10/2026) : le propriétaire et tous ses biens (l'archivage existant, inchangé) ; un des biens (mode « biens »).
 */
export function EcranSupprimerChoix() {
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION}</style>
      <p className="loc-retour"><LienRetour href="/admin/location/proprietaires" mot="Propriétaires et biens" /></p>
      <header className="svv-page-head loc-tete-comme-accueil">
        <div className="svv-page-head-ligne"><h1 className="svv-page-title">Supprimer un propriétaire ou un bien</h1></div>
        <p className="svv-page-sub">Supprimer = sortir de la gestion (du portefeuille) : rien n’est effacé, tout reste consultable et se réactive.</p>
      </header>
      <div className="loc-zone-resultats loc-zone-resultats--vide" aria-hidden="true" data-espace-accueil />
      <ul className="loc-gros-boutons loc-gros-boutons--3d" aria-label="Que supprimer ?">
        <li><a className="loc-gros-bouton loc-gros-bouton--plein" href="/admin/location/proprietaires/archiver" data-gros="supprimer-tout">
          Supprimer un propriétaire et tous ses biens<small>Le propriétaire est archivé avec ses biens et leurs annexes ; les locations en cours sont closes.</small></a></li>
        <li><a className="loc-gros-bouton loc-gros-bouton--plein" href="/admin/location/proprietaires/archiver?mode=biens" data-gros="supprimer-biens">
          Supprimer un des biens d’un propriétaire<small>Choisir un ou plusieurs biens à sortir de la gestion ; le propriétaire reste actif.</small></a></li>
      </ul>
    </div>
  );
}

/**
 * ══ ② « AJOUTER OU SUPPRIMER UN LOCATAIRE » (/admin/location/locataires), Arno 18-19/10/2026 ══════════════════════════════
 * La MISE EN PAGE EXACTE de « Supprimer un propriétaire ou un bien » (`EcranSupprimerChoix`) : lien retour, titre,
 * sous-titre, le même espace réservé, puis les DEUX GROSSES CARTES côte à côte (empilées au téléphone), même composant,
 * même effet 3D — « Supprimer » en trame rouge, « Ajouter » en blanc — et RIEN en dessous.
 * 🔴 RETIRÉS DE CET ÉCRAN, sur demande explicite d'Arno (18/10/2026), et de lui seul : la liste des locataires (onglets
 * « Actifs » / « Anciens », compteur, lignes) et le bouton « + Nouveau locataire ». Rien n'est perdu : les fiches, anciennes
 * comprises, s'ouvrent par le moteur de recherche de l'accueil ; le formulaire de création s'ouvre par la carte « Ajouter ».
 * Le code de la liste (`ListesLocation.tsx`) et ses routes de données restent en place.
 */
export function EcranLocataires() {
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION}</style>
      <p className="loc-retour"><LienRetour href="/admin/location" mot="Location" /></p>
      <header className="svv-page-head loc-tete-comme-accueil">
        <div className="svv-page-head-ligne"><h1 className="svv-page-title">Ajouter ou supprimer un locataire</h1></div>
        <p className="svv-page-sub">Supprimer = sortir du logement : rien n’est effacé, tout reste consultable.</p>
      </header>
      <div className="loc-zone-resultats loc-zone-resultats--vide" aria-hidden="true" data-espace-accueil />
      <ul className="loc-gros-boutons loc-gros-boutons--3d" aria-label="Ajouter ou supprimer un locataire">
        <li><a className="loc-gros-bouton loc-gros-bouton--plein" href="/admin/location/locataires/supprimer" data-gros="supprimer-locataires">
          Supprimer un/des locataire(s)<small>Faire sortir un ou plusieurs locataires d’un logement : sortie partielle ou totale, datée ; rien n’est effacé.</small></a></li>
        {/* Arno (18/10/2026) : « Ajouter » mène au formulaire de création EXISTANT (l'ancien « + Nouveau locataire ») ; la page
            « à venir » (/admin/location/locataires/ajouter) reste dans le code, sans lien vers elle. */}
        <li><a className="loc-gros-bouton" href="/admin/location/nouveau-locataire" data-gros="ajouter-locataires">
          Ajouter un/des locataire(s)<small>Faire entrer un ou plusieurs locataires dans un logement.</small></a></li>
      </ul>
    </div>
  );
}

export const BRIQUES_SUIVI = [
  { cle: 'mois', href: '/admin/location/outils/mois', titre: 'Suivi du mois',
    phrase: 'Une feuille par mois : les locations signées, les nouvelles gestions, les mandats perdus, le bas de feuille et les apporteurs du mois.' },
  { cle: 'annee', href: '/admin/location/outils/annee', titre: 'Suivi annuel',
    phrase: 'Le cumul de l’année et ses courbes, les apporteurs, la gestion récurrente, les indicateurs, les négociateurs et l’export .xlsx.' },
] as const;

/**
 * Arno (23/10/2026) — la 3ᵉ brique : l'ANNUAIRE DES APPORTEURS (la même modale que la roue, ouverte sur « Apporteurs »), avec le
 * nombre d'apporteurs et, en orange, ceux « à rattacher ». Comme la roue : réservé aux administrateurs (le serveur l'exige).
 */
function BriqueAnnuaire({ administrateur }: { administrateur: boolean }) {
  const [compte, setCompte] = useState<{ total: number; aRattacher: number } | null | 'erreur'>(null);
  useEffect(() => {
    if (!administrateur) return;
    let vivant = true;
    fetch('/api/admin/location/suivi', { cache: 'no-store' }).then((r) => r.json()).then((d: { etat?: string; data?: { apporteurs?: Apporteur[]; annuaire?: boolean } }) => {
      if (!vivant) return;
      const ap = Array.isArray(d.data?.apporteurs) ? d.data!.apporteurs!.filter((a) => !a.archive) : null;
      setCompte(d.etat === 'ok' && ap !== null ? { total: ap.length, aRattacher: d.data?.annuaire === true ? ap.filter(aRattacher).length : 0 } : 'erreur');
    }).catch(() => { if (vivant) setCompte('erreur'); });
    return () => { vivant = false; };
  }, [administrateur]);
  if (!administrateur) {
    return <div className="loc-case" data-brique="annuaire"><span className="loc-case-titre">Annuaire des apporteurs</span>
      <span className="loc-case-phrase">Réservé aux administrateurs (création d’un apporteur, collègue de rattachement).</span></div>;
  }
  // 🔴 Arno (25/10/2026) — depuis Outils de suivi, l'annuaire s'ouvre en PAGE (« Paramètres Location », onglet Apporteurs), plus en modale.
  return (
      <a className="loc-case loc-case--bouton" href={`${PAGE_PARAMETRES}?onglet=apporteurs`} data-brique="annuaire">
        <span className="loc-case-titre">Annuaire des apporteurs</span>
        <span className="loc-case-phrase">Créer un apporteur, le rattacher à un collègue, voir son cumul.</span>
        <span className="loc-case-phrase" data-compte-apporteurs>{compte === null ? 'Lecture…' : compte === 'erreur' ? 'Nombre indisponible.' : (
          <>{compte.total} apporteur{compte.total > 1 ? 's' : ''}{compte.aRattacher > 0 && <> · <strong className="loc-orange" data-compte-a-rattacher>{compte.aRattacher} à rattacher</strong></>}</>)}</span>
      </a>
  );
}

/** « Suivi du mois » / « Suivi annuel » : le tableau de bord, dans sa vue. */
export function EcranSuiviActivite({ vue, administrateur = false }: { vue: 'mois' | 'annee'; administrateur?: boolean }) {
  return (
    <div className="loc-page loc-ample">
      <style>{CSS_LOCATION_ECRANS}</style>
      <p className="loc-retour" style={{ margin: 0 }}><LienRetour href="/admin/location/outils" mot="Outils de suivi" /></p>
      <EnTeteLocation retour={false} titre={vue === 'mois' ? 'Suivi du mois' : 'Suivi annuel'}
        sous={vue === 'mois' ? 'La feuille d’un mois, sur le modèle du suivi mensuel.' : 'L’année : cumul, apporteurs, gestion, indicateurs, négociateurs, export.'} />
      <TableauBordSuivi vue={vue} administrateur={administrateur} />
    </div>
  );
}

export function EcranOutils({ administrateur }: { administrateur: boolean }) {
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS}</style>
      <EnTeteLocation titre="Outils de suivi" sous="Le tableau de bord de l’activité location, et les outils de pilotage." />
      {/* Arno (23/10/2026) — DEUX GROSSES BRIQUES, le style des cases de l'accueil Location : « Suivi du mois » (section A et la
          feuille du mois) et « Suivi annuel » (sections B à G). Le tableau de bord du 22/10 y est RÉPARTI, rien n'est retiré. */}
      <ul className="loc-cases loc-cases--accueil" aria-label="Le suivi de l’activité">
        {BRIQUES_SUIVI.map((b) => (
          <li key={b.href}>
            <a className="loc-case" href={b.href} data-brique={b.cle}>
              <span className="loc-case-titre">{b.titre}</span>
              <span className="loc-case-phrase">{b.phrase}</span>
            </a>
          </li>
        ))}
        <li><BriqueAnnuaire administrateur={administrateur} /></li>
      </ul>
      <h3 style={{ margin: '8px 0 0', fontSize: '1.05rem' }}>Autres outils</h3>
      <ul className="loc-cases">
        {administrateur ? (
          <li>
            <a className="loc-case" href="/admin/location/honoraires" data-outil="honoraires">
              <span className="loc-case-titre">Honoraires de gestion</span>
              <span className="loc-case-phrase">Loyer de départ × taux de gestion, par lot, par propriétaire et pour l’agence, au mois et à l’année (administrateurs).</span>
            </a>
          </li>
        ) : (
          <li><p className="loc-bloc loc-muet">« Honoraires de gestion » est réservé aux administrateurs.</p></li>
        )}
      </ul>
    </div>
  );
}

/* « Supprimer » = sortir du portefeuille : `BlocSortie` vit désormais dans la FICHE COMMUNE (`gestion/SectionsLocationFiche`),
   section repliable « Location » — règle d'Arno du 17/10/2026, une seule fiche dans l'application. */

/** La fiche d'un syndic dans la Location : les données de la Gestion, en lecture (aucune copie).
 *  🔴🔴 (Arno, 27/11/2026, 22h17) ses e-mails ne sont plus en lecture seule : « Écrire depuis gestion@ » (le module de la boîte Gestion, fenêtre
 *  flottante) quand le compte a le DROIT D'ENVOI — la règle de 7b5715a6 ; sans lui, l'adresse reste telle quelle. */
export function FicheSyndicLocationVue({ id }: { id: number }) {
  const { etat } = useLecture<FicheSyndicLocation>(`syndic=${id}`);
  const ecrire = useEcrireFlottant(useContexteRedaction());
  const boutonEcrire = (email: string | null | undefined) => (ecrire.onEcrire === undefined || !email || !email.includes('@') ? null
    : <> <button type="button" className="svv-btn svv-btn-outline gst-btn loc-ecrire-syndic" onClick={() => ecrire.onEcrire?.(email.trim(), { syndicId: id, lotId: null })}
        data-ecrire-syndic={email}>Écrire depuis gestion@</button></>);
  // 🔴 (Arno, 28/11/2026, 12h17, point 2) les adresses cochées → UN mail (le même module, le même droit d'envoi)
  const selection = useEtatSelectionMails();
  const ecrirePlusieurs = ecrire.onEcrire === undefined ? undefined
    : (emails: string[]) => { if (emails.length > 0) ecrire.onEcrire?.(emails[0], { syndicId: id, lotId: null, autres: emails.slice(1) }); };
  /* 🔴🔴 Arno (28/11/2026, 12h17, point 2) — « mettre le numéro de téléphone et le mail sur des lignes séparées, pas en enfilade, autant de lignes que de
     téléphones et de mails ; dans le prolongement de chaque ligne un bouton copier ; un bouton "Écrire depuis gestion@" en face de chaque adresse mail ». */
  const lignesCoordonnees = (tels: readonly string[], mails: readonly string[]) => (
    <ul className="loc-coord-lignes">
      {tels.map((t, i) => {
        const lisible = telephoneLisible(t); const lien = lienAppel(t);
        return (
          <li key={`t${i}-${t}`} data-ligne-tel={lisible}>
            <span className="loc-coord-valeur">{lien !== null ? <a href={lien}>{lisible}</a> : lisible}</span>
            <span className="loc-coord-actions"><BoutonCopier valeur={lisible} quoi={`le numéro ${lisible}`} /></span>
          </li>);
      })}
      {mails.map((m, i) => (
        <li key={`m${i}-${m}`} data-ligne-mail={m.trim()}>
          <span className="loc-coord-valeur">{m.trim()}</span>
          <span className="loc-coord-actions">
            <BoutonCopier valeur={m.trim()} quoi={`l’adresse ${m.trim()}`} />
            {ecrire.onEcrire !== undefined && m.includes('@') && <CaseMail email={m} />}
            {boutonEcrire(m)}
          </span>
        </li>))}
    </ul>);
  if (etat.etat !== 'ok') {
    return <div className="loc-page"><style>{CSS_LOCATION_ECRANS}</style><EnTeteLocation titre="Syndic" /><EtatLecture etat={etat} /></div>;
  }
  const s = etat.data;
  const telsStandard = [s.telephone, s.telephone2].filter((x): x is string => !!x && x.trim() !== '');
  const adresse = adressePostaleSyndic(s);
  return (
    <FournisseurSelectionMails selection={selection}>
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS + CSS_BOUTON_COPIER + CSS_SELECTION_MAILS + CSS_COORDONNEES_SYNDIC}</style>
      <EnTeteLocation titre={s.nom} sous={<span className="loc-pastille">Syndic</span>} />
      {ecrire.fenetres}
      {/* 🔴🔴 Arno (28/11/2026, 12h54, point 1) — « réorganiser ce premier bloc qui est plein de vide et exploite mal l'espace ; le rendre plus cohérent ;
          l'adresse postale du syndic doit être présente » : deux colonnes à l'ordinateur (gauche : adresse complète, puis note ; droite : téléphones, puis
          e-mails, une ligne par valeur), marges serrées ; au téléphone, empilé : adresse, téléphones, e-mails, note. */}
      <section className="loc-bloc" data-coordonnees-syndic>
        <h3>Coordonnées</h3>
        <dl className="loc-coord-bloc">
          <div className="loc-coord-zone loc-coord-zone--adresse" data-zone="adresse"><dt className="loc-muet">Adresse</dt><dd>
            {adresse.lignes.length === 0 ? <span className="loc-muet">non renseignée</span>
              : adresse.lignes.map((l) => <span key={l} className="loc-coord-adresse-ligne">{l}</span>)}
            {adresse.incomplete && <span className="loc-adresse-incomplete" data-adresse-incomplete>Adresse incomplète — <a href={lienModifierSyndic(s.id)}>à compléter</a></span>}
          </dd></div>
          <div className="loc-coord-zone loc-coord-zone--tels" data-zone="telephones"><dt className="loc-muet">{telsStandard.length > 1 ? 'Téléphones' : 'Téléphone'}</dt><dd>
            {telsStandard.length === 0 ? <span className="loc-muet">non renseigné</span> : lignesCoordonnees(telsStandard, [])}</dd></div>
          <div className="loc-coord-zone loc-coord-zone--mails" data-zone="emails"><dt className="loc-muet">E-mail</dt><dd>
            {(s.email ?? '').trim() === '' ? <span className="loc-muet">non renseigné</span> : lignesCoordonnees([], [s.email as string])}</dd></div>
          <div className="loc-coord-zone loc-coord-zone--note" data-zone="note"><dt className="loc-muet">Note</dt><dd>{s.note ?? <span className="loc-muet">non renseignée</span>}</dd></div>
        </dl>
      </section>
      {ecrirePlusieurs !== undefined && <BoutonEcrireSelection onEcrire={ecrirePlusieurs} />}
      <section className="loc-bloc">
        <h3>Contacts <span className="loc-pastille">{liste(s.contacts).length}</span></h3>
        {liste(s.contacts).length === 0 ? <p className="loc-muet">Aucun contact.</p> : (
          <ul className="loc-liste">
            {liste(s.contacts).map((c) => (
              <li key={c.id} className="loc-contact-syndic" data-contact-syndic={c.id}>
                <span><strong>{[c.civilite, c.prenom, c.nom].filter((x) => x).join(' ') || 'Contact'}</strong>{c.titre ? <span className="loc-muet"> · {c.titre}</span> : null}</span>
                {lignesCoordonnees(liste(c.coordonnees).filter((k) => k.sorte === 'telephone').map((k) => k.valeur),
                  liste(c.coordonnees).filter((k) => k.sorte === 'email').map((k) => k.valeur))}
              </li>
            ))}
          </ul>
        )}
      </section>
      {/* 🔴🔴 Arno (28/11/2026, 12h17, point 3) — « le nombre de copropriétés que ce syndic gère dans notre portefeuille, puis la liste des copropriétés : un
          bloc par copropriété avec en première position le nom de la résidence s'il existe, ensuite l'adresse principale, ensuite les adresses
          complémentaires, et en face de chaque adresse le nombre de lots en gestion à cette adresse, avec le total des lots en gestion de la copropriété ».
          Le décompte par BIENS (ad11dca5 / a5107e9c), biens en gestion seulement ; un clic sur l'encadré ouvre la fiche copropriété. Les liens vers
          chaque bien (point 4) restent, en bas de l'encadré. */}
      <section className="loc-bloc" data-copros-suivies>
        {/* 🔴 Arno (28/11/2026, 13h06) — « justifier à droite dans sa ligne l'information "4 logements en gestion", alignée à droite par rapport au nombre
            de lots indiqué en dessous ("1 lot"), et utiliser la même police que le texte "1 lot" » : le titre à gauche, le décompte à droite (plus de « · ») */}
        <h3 className="loc-copros-tete"><span>Copropriétés suivies : {liste(s.coproprietes).length}</span>
          {s.resumeCopros !== undefined && <span className="loc-copros-compte loc-copro-n" data-copros-compte>{libelleEnGestion(s.resumeCopros.detail)}</span>}</h3>
        {liste(s.coproprietes).length === 0 ? <p className="loc-muet">Aucune copropriété en cours.</p> : (
          <ul className="loc-copros">
            {liste(s.coproprietes).map((c) => {
              const r = s.resumeCopros?.copros.find((x) => x.id === c.id) ?? null;
              const adresses = r?.adresses ?? [{ libelle: c.libelle, principale: true, biens: -1, teteIds: [] }, ...liste(c.adresses).map((a) => ({ libelle: a.libelle, principale: false, biens: -1, teteIds: [] }))];
              const ouvrir = () => { window.location.assign(`/admin/location/coproprietes?ouvrir=${encodeURIComponent(c.cle)}`); };
              return (
                <li key={c.id} className="loc-copro" data-copro={c.cle} role="link" tabIndex={0} title="Ouvrir la fiche de la copropriété"
                  onClick={(e) => { if ((e.target as HTMLElement).closest('a')) return; ouvrir(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !(e.target as HTMLElement).closest('a')) ouvrir(); }}>
                  {r?.nom && <p className="loc-copro-nom" data-copro-nom>{r.nom}</p>}
                  <ul className="loc-copro-adresses" data-adresses-copro={c.cle}>
                    {adresses.map((a, i) => (
                      <li key={`${i}-${a.libelle}`} data-adresse-copro={a.libelle} className={a.principale ? 'loc-copro-principale' : undefined}>
                        <span className="loc-copro-adresse">{a.libelle}{i === 0 ? <span className="loc-muet">{[c.codePostal, c.commune].filter((x) => x).length > 0 ? ` · ${[c.codePostal, c.commune].filter((x) => x).join(' ')}` : ''}</span> : null}</span>
                        {a.biens >= 0 && <span className="loc-copro-n" data-lots-adresse={a.biens}>{a.biens} lot{a.biens > 1 ? 's' : ''}</span>}
                      </li>))}
                  </ul>
                  {r !== null && <p className="loc-copro-total" data-copro-total>Total : {libelleEnGestion(r.detail)}</p>}
                  {liste(c.lots).length === 0 ? <p className="loc-muet loc-copro-biens">aucun bien de l’annuaire</p> : (
                    <p className="loc-muet loc-copro-biens" data-biens-copro={c.cle}>Fiches des biens : {liste(c.lots).map((l, j) => (
                      <span key={l.id}>{j > 0 ? ', ' : ''}<a href={`/admin/location/bien/${l.id}`}>bien {l.numero.startsWith('app-') ? `n° ${l.id}` : l.numero}</a></span>))}</p>)}
                </li>);
            })}
          </ul>
        )}
      </section>
      <p className="loc-muet">Fiche tenue dans la Gestion (même données) : elle se modifie depuis l’écran des syndics de la Gestion.</p>
    </div>
    </FournisseurSelectionMails>
  );
}

/* 🔴 (Arno, 28/11/2026, 12h17, point 2) une ligne par téléphone et par e-mail : la valeur, puis ses boutons dans le prolongement, alignés d'une ligne à
   l'autre (une grille de deux colonnes) ; au téléphone, les boutons passent sous la valeur si la place manque. AUCUN ACCENT GRAVE dans ce littéral. */
const CSS_COORDONNEES_SYNDIC = `
.loc-coord-lignes{list-style:none;margin:2px 0 0;padding:0;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:10px;row-gap:2px;align-items:center}
.loc-coord-lignes > li{display:contents}
.loc-coord-valeur{min-width:0;overflow-wrap:anywhere}
/* 🔴 (Arno, 28/11/2026, 12h54, point 2) « justifier à droite » : « Copier », la case, « Écrire depuis gestion@ » regroupés sur le bord DROIT du bloc,
   à la même place d'une ligne à l'autre (un téléphone : « Copier » seul, à droite) ; au téléphone, sous la valeur, toujours à droite */
.loc-coord-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;justify-self:end;gap:4px 6px;min-height:32px}
.loc-coord-actions .loc-ecrire-syndic{width:auto;min-height:32px;padding:2px 12px;white-space:nowrap;margin:0}
/* 🔴 (Arno, 28/11/2026, 12h54, point 1) le bloc Coordonnées : deux colonnes serrées (adresse puis note ; téléphones puis e-mails) ; au téléphone, empilé */
.loc-coord-bloc{margin:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);column-gap:22px;row-gap:8px;align-items:start}
.loc-coord-zone{min-width:0;display:flex;flex-direction:column;gap:2px}
.loc-coord-zone > dt{font-size:.82rem}
.loc-coord-zone > dd{margin:0;display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.loc-coord-zone--adresse{grid-column:1;grid-row:1}
.loc-coord-zone--note{grid-column:1;grid-row:2}
.loc-coord-zone--tels{grid-column:2;grid-row:1}
.loc-coord-zone--mails{grid-column:2;grid-row:2}
.loc-adresse-incomplete{color:var(--color-svv-orange);font-weight:700;font-size:.86rem}
.loc-adresse-incomplete a{color:inherit}
@media (max-width:760px){.loc-coord-bloc{grid-template-columns:minmax(0,1fr)}
  .loc-coord-zone--adresse,.loc-coord-zone--tels,.loc-coord-zone--mails,.loc-coord-zone--note{grid-column:1;grid-row:auto}}
.loc-liste > li.loc-contact-syndic{display:block}
.loc-contact-syndic > .loc-coord-lignes{margin-top:4px}
/* 🔴 (Arno, 28/11/2026, 12h17, point 3) un ENCADRÉ par copropriété, bien dissocié des autres : bord, fond, espacement */
.loc-copros{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.loc-copro{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border:1px solid var(--color-svv-line-strong);border-radius:12px;background:var(--color-svv-field);cursor:pointer}
.loc-copro:hover,.loc-copro:focus-visible{border-color:var(--color-svv-ink);outline:none}
.loc-copro-nom{margin:0;font-weight:800;font-size:1rem;color:var(--color-svv-ink)}
.loc-copro-adresses{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.loc-copro-adresses > li{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-width:0}
.loc-copro-adresse{min-width:0;overflow-wrap:anywhere}
.loc-copro-principale .loc-copro-adresse{font-weight:700}
.loc-copro-n{flex:0 0 auto;white-space:nowrap;font-weight:700;color:var(--color-svv-ink)}
.loc-copro-total{margin:2px 0 0;padding-top:6px;border-top:1px solid var(--color-svv-line);font-weight:700;color:var(--color-svv-ink)}
.loc-copro-biens{margin:0;font-size:.82rem}
.loc-copros-tete{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 12px;padding-right:15px}
.loc-copros-tete > .loc-copros-compte{margin-left:auto;text-align:right;white-space:normal;min-width:0;max-width:100%}
@media (max-width:560px){.loc-coord-lignes{grid-template-columns:minmax(0,1fr)}.loc-coord-actions{margin-bottom:4px;justify-self:stretch}}
`;
