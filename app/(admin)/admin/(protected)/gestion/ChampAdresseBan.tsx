'use client';

import { useEffect, useRef, useState } from 'react';
import { adresseDepuisBan, MOT_ADRESSE_NON_VERIFIEE, type AdresseProposee } from '../../../../lib/gestion/saisieFiche';

/**
 * ══ 🔴🔴 LOT FICHE-SAISIE-UNIFORME — L'ADRESSE, AVEC LES PROPOSITIONS DE LA BASE ADRESSE NATIONALE ═══════════
 *
 * ARNO (01/10/2026) : « Réutilise l'auto-complétion d'adresse qui existe déjà dans l'app (Planche cadastrale /
 * Base Adresse Nationale, api-adresse.data.gouv.fr). Pas de nouveau fournisseur. On tape dans ADRESSE →
 * propositions ajustées au fil de la frappe (délai court, 5 à 7 résultats, flèches ↑↓ + Entrée, clic). Un choix
 * remplit Adresse (numéro + voie), Code postal et Commune (en majuscules). »
 *
 * ═══ 🔴 MÊME FOURNISSEUR, ET POURQUOI UN AUTRE COMPOSANT ════════════════════════════════════════════════════
 *
 * `app/components/AdresseAutocomplete.tsx` interroge DÉJÀ `api-adresse.data.gouv.fr`, et c'est bien lui la
 * référence : aucun nouveau fournisseur n'entre ici. Mais il appartient à l'application grand public — habillage
 * Tailwind, pas de navigation au clavier, et il rend une `{ label, lat, lon }` faite pour recentrer une carte.
 * Ce lot a besoin de TROIS CHAMPS remplis et des flèches ↑↓ ; le réécrire là-bas aurait changé l'écran des
 * internautes pour un besoin d'administration.
 *
 * 🔴 CE QUI EST PARTAGÉ EST CE QUI DOIT L'ÊTRE : le découpage d'une réponse BAN en « voie / code postal /
 * commune » vit dans le module PUR `saisieFiche.ts`, éprouvable sans réseau — et c'est là qu'est la règle.
 *
 * ⚠️ LA SAISIE LIBRE RESTE POSSIBLE, toujours. « adresse étrangère, lieu-dit, BAN indisponible. Dans ce cas, pas
 * de blocage : un petit “adresse non vérifiée” discret. » Rien n'est jamais refusé ici — la BAN propose, elle ne
 * dispose pas.
 */

/** Arno : « 5 à 7 résultats ». Sept : la liste tient sous le champ sans masquer les champs suivants. */
const RESULTATS = 7;

/** Arno : « délai court ». 250 ms — assez pour ne pas appeler à chaque lettre, trop peu pour se voir. */
const DELAI_MS = 250;

/** En dessous, une requête rendrait la moitié de la France : on n'interroge pas. */
const MINIMUM_FRAPPE = 3;

export interface ChoixAdresse { voie: string; codePostal: string; commune: string }

export function ChampAdresseBan({ valeur, onChange, onChoisir, verifiee, manque, id }: {
  valeur: string;
  /** La frappe libre. L'appelant reste maître du champ — c'est lui qui tient l'état de la fiche. */
  onChange: (v: string) => void;
  /** Une proposition retenue : les TROIS champs partent ensemble. */
  onChoisir: (a: ChoixAdresse) => void;
  /** Vrai quand l'adresse affichée vient d'un choix dans la liste. Faux ⇒ petite mention discrète. */
  verifiee: boolean;
  /** Le mot « ce champ est obligatoire », rendu par l'appelant — la règle de complétude reste chez lui. */
  manque?: React.ReactNode;
  id?: string;
}) {
  const [propositions, setPropositions] = useState<AdresseProposee[]>([]);
  const [vise, setVise] = useState(-1);
  const [cherche, setCherche] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVol = useRef<AbortController | null>(null);

  /**
   * ⚠️ ON ANNULE LA REQUÊTE PRÉCÉDENTE. Sans cela, deux frappes rapprochées font revenir les réponses dans le
   * désordre, et la liste finit par montrer les propositions d'un texte qu'on a déjà effacé.
   */
  const demander = (q: string): void => {
    enVol.current?.abort();
    const ctrl = new AbortController();
    enVol.current = ctrl;
    setCherche(true);
    void (async () => {
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}`
          + `&limit=${RESULTATS}&autocomplete=1`,
          { signal: ctrl.signal });
        const d = (await res.json()) as {
          features?: { properties?: { label?: string; name?: string; postcode?: string; city?: string } }[];
        };
        const liste = (d.features ?? [])
          .map((f) => adresseDepuisBan(f.properties ?? {}))
          .filter((a): a is AdresseProposee => a !== null);
        setPropositions(liste);
        setVise(-1);
      } catch {
        /* 🔴 LA BAN INDISPONIBLE N'EST PAS UNE PANNE DE LA FICHE. On vide la liste, on ne dit rien, et la saisie
           libre continue — c'est exactement le cas qu'Arno nomme (« BAN indisponible »). */
        setPropositions([]);
      } finally {
        if (!ctrl.signal.aborted) setCherche(false);
      }
    })();
  };

  const taper = (v: string): void => {
    onChange(v);
    if (minuteur.current) clearTimeout(minuteur.current);
    if (v.trim().length < MINIMUM_FRAPPE) { setPropositions([]); setVise(-1); return; }
    minuteur.current = setTimeout(() => demander(v), DELAI_MS);
  };

  const retenir = (a: AdresseProposee): void => {
    setPropositions([]);
    setVise(-1);
    onChoisir({ voie: a.voie, codePostal: a.codePostal, commune: a.commune });
  };

  /**
   * ══ 🔴 LES FLÈCHES ET ENTRÉE (Arno) ═══════════════════════════════════════════════════════════════════════
   *
   * ⚠️ `preventDefault` SUR ENTRÉE, ET SEULEMENT QUAND UNE PROPOSITION EST VISÉE : le champ vit dans un
   * formulaire, et sans cela Entrée l'ENVERRAIT au lieu de choisir l'adresse. Quand rien n'est visé, on laisse
   * passer — la touche doit garder son sens ordinaire.
   *
   * ⚠️ ÉCHAP FERME LA LISTE SANS RIEN CHOISIR, et ne vide pas le champ : on referme une proposition, on n'efface
   * pas ce qu'on vient de taper.
   */
  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (propositions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setVise((i) => (i + 1) % propositions.length); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setVise((i) => (i <= 0 ? propositions.length - 1 : i - 1));
      return;
    }
    if (e.key === 'Escape') { setPropositions([]); setVise(-1); return; }
    if (e.key === 'Enter' && vise >= 0 && vise < propositions.length) {
      e.preventDefault();
      retenir(propositions[vise]);
    }
  };

  useEffect(() => () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    enVol.current?.abort();
  }, []);

  const ouvert = propositions.length > 0;
  return (
    <div className="cab-enveloppe">
      <input
        id={id}
        className="cp-saisie"
        value={valeur}
        onChange={(e) => taper(e.target.value)}
        onKeyDown={auClavier}
        /* ⚠️ UN PETIT DÉLAI AVANT DE FERMER : sans lui, le clic sur une proposition part APRÈS le `blur`, la
           liste a déjà disparu, et rien ne se passe. C'est le piège classique des listes de suggestions. */
        onBlur={() => setTimeout(() => { setPropositions([]); setVise(-1); }, 150)}
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert}
        aria-autocomplete="list"
        aria-controls="cab-liste"
        aria-activedescendant={vise >= 0 ? `cab-prop-${vise}` : undefined}
        placeholder="12 rue de l’Église…"
      />
      {ouvert && (
        <ul className="cab-liste" id="cab-liste" role="listbox">
          {propositions.map((a, i) => (
            <li key={`${a.etiquette}-${i}`} id={`cab-prop-${i}`} role="option" aria-selected={i === vise}>
              <button
                type="button"
                className={`cab-prop${i === vise ? ' cab-prop--vise' : ''}`}
                /* `onMouseDown` ET NON `onClick` : il part AVANT le `blur` du champ, donc avant que la liste ne
                   se referme. Le même piège, refermé par l'autre bout. */
                onMouseDown={(e) => { e.preventDefault(); retenir(a); }}
                onMouseEnter={() => setVise(i)}>
                {a.etiquette}
              </button>
            </li>
          ))}
        </ul>
      )}
      {manque}
      {/* 🔴 LA MENTION DISCRÈTE — elle n'apparaît QUE si une adresse a été tapée sans être choisie, et jamais
          pendant qu'on cherche : la voir clignoter à chaque lettre en ferait une alarme, alors que c'est une
          note. Elle n'interdit rien : « pas de blocage » (Arno). */}
      {!verifiee && !ouvert && !cherche && valeur.trim() !== '' && (
        <span className="cab-note">{MOT_ADRESSE_NON_VERIFIEE}</span>
      )}
    </div>
  );
}

/** Le style, posé par l'écran qui monte le champ — comme partout dans ce module. */
export const CSS_CHAMP_ADRESSE = `
.cab-enveloppe{position:relative;display:block}
.cab-liste{position:absolute;z-index:40;left:0;right:0;top:100%;margin:.15rem 0 0;padding:.2rem;list-style:none;
  max-height:15rem;overflow:auto;border:1px solid var(--color-svv-line);border-radius:.5rem;
  background:var(--color-svv-surface);box-shadow:0 6px 18px rgba(0,0,0,.18)}
.cab-prop{display:block;width:100%;padding:.35rem .5rem;border:0;border-radius:.35rem;background:none;
  text-align:left;font-size:.82rem;color:var(--color-svv-ink);cursor:pointer}
.cab-prop--vise{background:var(--color-svv-field)}
.cab-note{display:block;margin-top:.2rem;font-size:.72rem;color:var(--color-svv-muted);font-style:italic}
`;
