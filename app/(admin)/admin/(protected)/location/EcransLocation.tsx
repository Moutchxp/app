'use client';

import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, EtatLecture, liste, useLecture } from './commun';
import type { FicheSyndic } from '../../../../lib/gestion/syndics';
import { TableauBordSuivi } from './TableauBordSuivi';

/**
 * ══ 🔴🔴 TUILE LOCATION — LES TROIS ÉCRANS DE L'ACCUEIL (refonte du 17/10/2026) ════════════════════════════════════
 * ① « Ajouter / supprimer un propriétaire / bien » · ② « Ajouter / supprimer un locataire » · ③ « Outils de suivi ».
 * Ce qui était sur l'ancien accueil (onglets, listes, boutons) est ICI, déplacé, pas perdu.
 */
export function EcranProprietairesBiens() {
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION}</style>
      <p className="loc-retour"><a href="/admin/location">← Location</a></p>
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
          compris, s'ouvrent par le moteur de recherche de l'accueil. */}
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
      <p className="loc-retour"><a href="/admin/location/proprietaires">← Propriétaires et biens</a></p>
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
      <p className="loc-retour"><a href="/admin/location">← Location</a></p>
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

/** « Suivi du mois » / « Suivi annuel » : le tableau de bord, dans sa vue. */
export function EcranSuiviActivite({ vue }: { vue: 'mois' | 'annee' }) {
  return (
    <div className="loc-page loc-ample">
      <style>{CSS_LOCATION_ECRANS}</style>
      <p className="loc-retour" style={{ margin: 0 }}><a href="/admin/location/outils">← Outils de suivi</a></p>
      <EnTeteLocation retour={false} titre={vue === 'mois' ? 'Suivi du mois' : 'Suivi annuel'}
        sous={vue === 'mois' ? 'La feuille d’un mois, sur le modèle du suivi mensuel.' : 'L’année : cumul, apporteurs, gestion, indicateurs, négociateurs, export.'} />
      <TableauBordSuivi vue={vue} />
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
      <ul className="loc-cases loc-cases--accueil loc-cases--deux" aria-label="Le suivi de l’activité">
        {BRIQUES_SUIVI.map((b) => (
          <li key={b.href}>
            <a className="loc-case" href={b.href} data-brique={b.cle}>
              <span className="loc-case-titre">{b.titre}</span>
              <span className="loc-case-phrase">{b.phrase}</span>
            </a>
          </li>
        ))}
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

/** La fiche d'un syndic dans la Location : les données de la Gestion, en lecture (aucune copie). */
export function FicheSyndicLocationVue({ id }: { id: number }) {
  const { etat } = useLecture<FicheSyndic>(`syndic=${id}`);
  if (etat.etat !== 'ok') {
    return <div className="loc-page"><style>{CSS_LOCATION_ECRANS}</style><EnTeteLocation titre="Syndic" /><EtatLecture etat={etat} /></div>;
  }
  const s = etat.data;
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS}</style>
      <EnTeteLocation titre={s.nom} sous={<span className="loc-pastille">Syndic</span>} />
      <section className="loc-bloc">
        <h3>Coordonnées</h3>
        <dl className="loc-grille" style={{ margin: 0 }}>
          {[['Adresse', [s.adresse, [s.codePostal, s.ville].filter((x) => x).join(' ')].filter((x) => x).join(', ') || null],
            ['Téléphone', [s.telephone, s.telephone2].filter((x) => x).join(' · ') || null], ['E-mail', s.email], ['Note', s.note]]
            .map(([mot, val]) => (
              <div key={mot}><dt className="loc-muet">{mot}</dt><dd style={{ margin: 0 }}>{val ?? <span className="loc-muet">non renseigné</span>}</dd></div>
            ))}
        </dl>
      </section>
      <section className="loc-bloc">
        <h3>Contacts <span className="loc-pastille">{liste(s.contacts).length}</span></h3>
        {liste(s.contacts).length === 0 ? <p className="loc-muet">Aucun contact.</p> : (
          <ul className="loc-liste">
            {liste(s.contacts).map((c) => (
              <li key={c.id}>
                <span><strong>{[c.civilite, c.prenom, c.nom].filter((x) => x).join(' ') || 'Contact'}</strong>{c.titre ? <span className="loc-muet"> · {c.titre}</span> : null}</span>
                <span className="loc-muet">{liste(c.coordonnees).map((k) => k.valeur).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="loc-bloc">
        <h3>Copropriétés suivies <span className="loc-pastille">{liste(s.coproprietes).length}</span></h3>
        {liste(s.coproprietes).length === 0 ? <p className="loc-muet">Aucune copropriété en cours.</p> : (
          <ul className="loc-liste">
            {liste(s.coproprietes).map((c) => (
              <li key={c.id} style={{ display: 'block' }}>
                <p style={{ margin: '0 0 4px' }}><strong>{c.libelle}</strong> <span className="loc-muet">{[c.codePostal, c.commune].filter((x) => x).join(' ')}</span></p>
                <p className="loc-muet" style={{ margin: 0 }}>
                  {liste(c.lots).length === 0 ? 'aucun bien de l’annuaire' : liste(c.lots).map((l, i) => (
                    <span key={l.id}>{i > 0 ? ' · ' : ''}<a href={`/admin/location/bien/${l.id}`}>{l.adresse ?? `bien ${l.numero}`}</a></span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="loc-muet">Fiche tenue dans la Gestion (même données) : elle se modifie depuis l’écran des syndics de la Gestion.</p>
    </div>
  );
}
