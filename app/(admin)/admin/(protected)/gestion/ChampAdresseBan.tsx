'use client';

import { ChampAdresseOfficielle } from '../../../../components/adresse/ChampAdresseOfficielle';
import type { AdresseOfficielle } from '../../../../components/adresse/adresseOfficielle';
import { adresseDepuisBan, MOT_ADRESSE_NON_VERIFIEE } from '../../../../lib/gestion/saisieFiche';

/**
 * ══ 🔴🔴 LOT FICHE-SAISIE-UNIFORME — L'ADRESSE, AVEC LES PROPOSITIONS DE LA BASE ADRESSE NATIONALE ═══════════
 *
 * ARNO (01/10/2026) : « Réutilise l'auto-complétion d'adresse qui existe déjà dans l'app (Base Adresse Nationale, l’API Adresse). Pas de
 * nouveau fournisseur. On tape dans ADRESSE → propositions ajustées au fil de la frappe (délai court, 5 à 7 résultats, flèches ↑↓ + Entrée, clic). Un
 * choix remplit Adresse (numéro + voie), Code postal et Commune (en majuscules). »
 *
 * 🔴🔴 (Arno, 20/11/2026, lot 7a : « une seule auto-complétion, une seule écriture partout ») CE CHAMP EST UN EMBALLAGE DU COMPOSANT UNIQUE
 * (`components/adresse/ChampAdresseOfficielle`) : la source, le clavier, la liste et l'affichage sont les siens ; ici ne restent que l'habillage de
 * l'administration (`CSS_CHAMP_ADRESSE`), la mention « adresse non vérifiée » et le découpage « voie / code postal / commune » que les fiches
 * enregistrent (`adresseDepuisBan`, inchangé). Le choix porte aussi le FORMAT UNIQUE complet (second argument d'`onChoisir`).
 *
 * ⚠️ LA SAISIE LIBRE RESTE POSSIBLE, toujours : la BAN propose, elle ne dispose pas.
 */

/** Arno : « 5 à 7 résultats ». Sept : la liste tient sous le champ sans masquer les champs suivants. */
const RESULTATS = 7;
/** Arno : « délai court ». 250 ms — assez pour ne pas appeler à chaque lettre, trop peu pour se voir. */
const DELAI_MS = 250;
/** En dessous, une requête rendrait la moitié de la France : on n'interroge pas. */
const MINIMUM_FRAPPE = 3;

export interface ChoixAdresse { voie: string; codePostal: string; commune: string }

/** Le choix tel que les fiches l'enregistrent (la valeur de la BAN, découpée comme avant) — PUR. */
export function choixDepuisOfficielle(a: AdresseOfficielle): ChoixAdresse {
  const d = adresseDepuisBan({ label: a.libelle, name: a.voie, postcode: a.codePostal, city: a.commune });
  return { voie: d?.voie ?? a.voie, codePostal: d?.codePostal ?? a.codePostal, commune: d?.commune ?? a.commune };
}

export function ChampAdresseBan({ valeur, onChange, onChoisir, verifiee, manque, id, exemple = '12 rue de l’Église…' }: {
  /** Le texte d'exemple (gris). Absent ⇒ celui de la Gestion, inchangé ; la tuile Location passe « ex. … » (Arno, 18/10/2026). */
  exemple?: string;
  valeur: string;
  /** La frappe libre. L'appelant reste maître du champ — c'est lui qui tient l'état de la fiche. */
  onChange: (v: string) => void;
  /** Une proposition retenue : les TROIS champs partent ensemble ; le second argument est le format unique complet. */
  onChoisir: (a: ChoixAdresse, officielle: AdresseOfficielle) => void;
  /** Vrai quand l'adresse affichée vient d'un choix dans la liste. Faux ⇒ petite mention discrète. */
  verifiee: boolean;
  /** Le mot « ce champ est obligatoire », rendu par l'appelant — la règle de complétude reste chez lui. */
  manque?: React.ReactNode;
  id?: string;
}) {
  return (
    <ChampAdresseOfficielle id={id} valeur={valeur} onChange={onChange} exemple={exemple} limite={RESULTATS} delai={DELAI_MS} minimum={MINIMUM_FRAPPE}
      onChoisir={(a) => onChoisir(choixDepuisOfficielle(a), a)}
      apresListe={({ ouvert, cherche }) => (
        <>
          {manque}
          {/* 🔴 LA MENTION DISCRÈTE — seulement si une adresse a été tapée sans être choisie, et jamais pendant qu'on cherche. Elle n'interdit rien. */}
          {!verifiee && !ouvert && !cherche && valeur.trim() !== '' && <span className="cab-note">{MOT_ADRESSE_NON_VERIFIEE}</span>}
        </>
      )} />
  );
}

/** Le style, posé par l'écran qui monte le champ — comme partout dans ce module. */
export const CSS_CHAMP_ADRESSE = `
.cab-enveloppe{position:relative;display:block}
/* 🔴 (Arno, 24/11/2026, fiche Copropriété, « Une autre adresse » : « il faut faire un vrai champ de saisie visible […] qui prend toute la largeur de
   la colonne ») LE CHAMP PAR DÉFAUT DU COMPOSANT est un vrai champ : pleine largeur, bordure, hauteur et marges des champs des fiches. Spécificité NULLE
   (:where) : un écran qui habille déjà « cp-saisie » (Location, Gestion, Transaction, adresses à vérifier) garde exactement son rendu ; seul l'écran
   qui ne l'habillait pas (la fiche Copropriété : le champ y était nu, sans bordure, sur 196 px) prend celui-ci. */
:where(.cab-enveloppe > input.cp-saisie){box-sizing:border-box;width:100%;max-width:100%;min-height:44px;padding:8px 10px;
  border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.88rem;font-weight:400}
.cab-liste{position:absolute;z-index:40;left:0;right:0;top:100%;margin:.15rem 0 0;padding:.2rem;list-style:none;
  max-height:15rem;overflow:auto;border:1px solid var(--color-svv-line);border-radius:.5rem;
  background:var(--color-svv-surface);box-shadow:0 6px 18px rgba(0,0,0,.18)}
.cab-prop{display:block;width:100%;padding:.35rem .5rem;border:0;border-radius:.35rem;background:none;
  text-align:left;font-size:.82rem;color:var(--color-svv-ink);cursor:pointer}
.cab-prop--vise{background:var(--color-svv-field)}
.cab-note{display:block;margin-top:.2rem;font-size:.72rem;color:var(--color-svv-muted);font-style:italic}
`;
