'use client';

import { useEffect, useState } from 'react';
import { CSS_LOCATION_ECRANS, EtatLecture, liste, useLecture } from './commun';
import { GROUPES, LIBELLE_GROUPE, type Groupe, type ResultatsAccueil } from '../../../../lib/location/recherchePortefeuille';

/**
 * ══ 🔴🔴 TUILE LOCATION — L'ACCUEIL (/admin/location), REFONTE DU 17/10/2026 ═══════════════════════════════════════
 * Demande d'Arno : « EN HAUT : un seul moteur de recherche, sur toute la largeur » (propriétaires, locataires, syndics
 * par nom / téléphone / e-mail ; adresse des seuls biens du portefeuille), résultats instantanés groupés par type ;
 * « EN DESSOUS : 3 GROSSES CASES » — propriétaires / biens, locataires, outils de suivi.
 * 🔴 Les onglets, les listes et les boutons de l'ancien accueil ne sont pas perdus : ils sont DÉPLACÉS dans ces trois
 * écrans (accord d'Arno pour ce déplacement) — `ListesLocation.tsx`, « + Nouveau propriétaire + bien », « Honoraires ».
 */
const LIEN: Record<Groupe, (id: number) => string> = {
  proprietaires: (id) => `/admin/location/proprietaire/${id}`,
  locataires: (id) => `/admin/location/locataire/${id}`,
  syndics: (id) => `/admin/location/syndic/${id}`,
  biens: (id) => `/admin/location/bien/${id}`,
};

export const CASES = [
  { href: '/admin/location/proprietaires', titre: ['Ajouter / supprimer', 'un propriétaire / bien'],
    phrase: 'Créer un propriétaire avec son bien et ses annexes ; les listes des propriétaires et des biens (annexes en arbre), actifs et anciens.' },
  { href: '/admin/location/locataires', titre: ['Ajouter / supprimer', 'un locataire'],
    phrase: 'Créer un locataire rattaché à un bien, avec alerte de doublon dès la saisie ; la liste des locataires, actifs et anciens.' },
  { href: '/admin/location/outils', titre: ['Outils', 'de suivi'],
    phrase: 'Les outils de pilotage de la location : honoraires de gestion, et ceux qui viendront.' },
] as const;

export function AccueilLocation() {
  const [texte, setTexte] = useState('');
  const [terme, setTerme] = useState('');
  // Instantané pendant la frappe : la recherche part 200 ms après la dernière touche (un appel par intention).
  useEffect(() => {
    const t = setTimeout(() => setTerme(texte.trim()), 200);
    return () => clearTimeout(t);
  }, [texte]);
  const recherche = useLecture<ResultatsAccueil>(terme.length >= 2 ? `q=${encodeURIComponent(terme)}` : null);

  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS}</style>
      <label className="loc-recherche loc-recherche--large">
        <span aria-hidden="true">🔎</span>
        <input value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus type="search"
          placeholder="Propriétaire, locataire, syndic (nom, téléphone, e-mail) ou adresse d’un bien du portefeuille"
          aria-label="Chercher un propriétaire, un locataire, un syndic ou un bien du portefeuille" />
      </label>

      {terme.length >= 2 && (
        <section className="loc-bloc" aria-label="Résultats de la recherche" data-resultats>
          {recherche.etat.etat !== 'ok' ? <EtatLecture etat={recherche.etat} /> : (() => {
            const r = recherche.etat.data;
            const groupes = GROUPES.filter((g) => liste(r[g]).length > 0);
            if (groupes.length === 0) return <p className="loc-muet">Aucun propriétaire, locataire, syndic ni bien du portefeuille ne correspond à « {terme} ».</p>;
            return (
              <div className="loc-groupes">
                {groupes.map((g) => (
                  <div key={g} className="loc-groupe" data-groupe={g}>
                    <h3>{LIBELLE_GROUPE[g]} <span className="loc-pastille">{liste(r[g]).length}</span></h3>
                    <ul className="loc-liste">
                      {liste(r[g]).map((x) => (
                        <li key={x.id}>
                          <a href={LIEN[g](x.id)}>{x.titre}</a>
                          {x.detail !== null && <span className="loc-muet">{x.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {r.tronque && <p className="loc-muet">D’autres fiches correspondent : précisez la recherche.</p>}
              </div>
            );
          })()}
        </section>
      )}

      {/* Arno (17/10/2026) : cases DEUX FOIS plus hautes, titres sur deux lignes — sur l'accueil seulement. */}
      <ul className="loc-cases loc-cases--accueil" aria-label="Espaces de la Location">
        {CASES.map((c) => (
          <li key={c.href}>
            <a className="loc-case" href={c.href} data-case={c.href}>
              <span className="loc-case-titre">{c.titre.map((l) => <span key={l} className="loc-case-ligne">{l}</span>)}</span>
              <span className="loc-case-phrase">{c.phrase}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
