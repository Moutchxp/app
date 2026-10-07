'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';
import {
  rangSuivant, suggestionsAnnuaire, type PersonnePourSuggestion, type SuggestionAnnuaire,
} from '../../../../lib/gestion/suggestionAnnuaire';

/**
 * ══ 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 3 — LA BARRE DE RECHERCHE ANNUAIRE DE L'ACCUEIL ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO (07/10/2026) : « à la place du bloc retiré, juste au-dessus des deux colonnes : un grand champ de saisie
 * sur toute la largeur, avec le libellé “Annuaire” à sa droite. Pendant la saisie, une liste de suggestions des
 * contacts de l'annuaire. Clic sur un locataire → ouvre directement la fiche locataire ; clic sur un propriétaire
 * → la fiche propriétaire. Clavier : flèches haut/bas, Entrée, Échap. “Aucun contact trouvé” si rien ne
 * correspond. »
 *
 * 🔴 AUCUNE SECONDE RECHERCHE — c'est la demande, mot pour mot. Cette barre interroge
 * `/api/admin/gestion/annuaire?q=…`, la MÊME route et la MÊME fonction (`rechercherPersonnes`) que l'écran
 * Annuaire : elle accepte déjà un nom, une adresse, une commune, un téléphone, un e-mail, un numéro de lot, sans
 * accent ni casse. Écrire ici un filtre « maison » aurait donné deux annuaires qui ne trouvent pas les mêmes gens.
 *
 * 🔴 ET AUCUNE SECONDE FICHE : le clic rend un `FicheUrl` — `{ sorte: 'proprietaire' | 'locataire', id }` —, que
 * l'écran passe tel quel à `Annuaire`, exactement comme un clic dans ses propres résultats.
 *
 * ⚠️ UNE SUGGESTION PAR RÔLE, et le rangement est fait par le module PUR `suggestionAnnuaire` : une personne à la
 * fois propriétaire et locataire paraît DEUX fois, chacune menant à SA fiche. C'est la demande d'Arno, et c'est
 * aussi la seule façon de ne pas avoir à choisir à sa place.
 *
 * ⚠️ LES AUTRES RÔLES (syndic, artisan…) N'EXISTENT PAS DANS CET ANNUAIRE. Il ne connaît que des propriétaires et
 * des locataires (`RolePersonne`) ; les partenaires internes vivent ailleurs et n'ont pas de fiche d'annuaire.
 * On n'en invente donc aucune — c'est dit à Arno plutôt que fabriqué.
 *
 * 🔒 Aucun jeton, aucune donnée en cache : la route répond `private, no-store`, et cette barre ne garde rien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que la route rend. On ne lit QUE ce qu'on affiche — le reste de la personne ne nous regarde pas. */
interface ReponseAnnuaire {
  etat?: string;
  data?: { personnes?: PersonnePourSuggestion[] };
}

/**
 * ⚠️ UN DÉLAI AVANT D'INTERROGER : taper « martin » lancerait six recherches, dont cinq jetées. 250 ms est le
 * temps d'une frappe courante — assez pour ne pas doubler les appels, assez court pour que la liste suive.
 */
const DELAI_MS = 250;
/** En dessous de deux lettres, la recherche rendrait la moitié de l'annuaire : on ne la lance pas. */
const MINIMUM = 2;

export function BarreAnnuaire({ onFiche }: { onFiche: (f: FicheUrl) => void }) {
  const [texte, setTexte] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestionAnnuaire[] | null>(null);
  const [rang, setRang] = useState(-1);
  const [occupe, setOccupe] = useState(false);
  const idListe = useId();
  const champ = useRef<HTMLInputElement | null>(null);

  /**
   * 🔴 LA RECHERCHE, APRÈS LE DÉLAI, ET ANNULABLE. `annule` garde la réponse d'une frappe abandonnée hors de
   * l'écran : sans lui, une réponse lente écraserait le résultat d'une frappe plus récente.
   */
  useEffect(() => {
    const t = texte.trim();
    if (t.length < MINIMUM) { setSuggestions(null); setRang(-1); return; }
    let annule = false;
    setOccupe(true);
    const minuteur = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/gestion/annuaire?q=${encodeURIComponent(t)}`, { cache: 'no-store' });
          const d = (await res.json().catch(() => ({}))) as ReponseAnnuaire;
          if (annule) return;
          /* ⚠️ `sans_schema` ET LES ERREURS RENDENT UNE LISTE VIDE, pas une liste absente : l'écran dit alors
             « Aucun contact trouvé » plutôt que de laisser le champ muet. */
          setSuggestions(suggestionsAnnuaire(d.etat === 'ok' ? (d.data?.personnes ?? []) : []));
          setRang(-1);
        } catch {
          if (!annule) { setSuggestions([]); setRang(-1); }
        } finally {
          if (!annule) setOccupe(false);
        }
      })();
    }, DELAI_MS);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [texte]);

  const ouvrir = (s: SuggestionAnnuaire): void => {
    setTexte(''); setSuggestions(null); setRang(-1);
    onFiche(s.fiche);
  };

  /**
   * 🔴 LE CLAVIER, EN ENTIER (Arno) : flèches pour parcourir, Entrée pour ouvrir, Échap pour refermer. Le
   * déplacement lui-même vient du module PUR (`rangSuivant`), parce que c'est la partie qui se trompe.
   *
   * ⚠️ ENTRÉE SANS SÉLECTION NE FAIT RIEN plutôt que d'ouvrir la première : on n'ouvre pas une fiche que
   * personne n'a désignée.
   */
  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    const liste = suggestions ?? [];
    if (e.key === 'Escape') { setSuggestions(null); setRang(-1); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setRang((r) => rangSuivant(r, liste.length, e.key === 'ArrowDown' ? 'bas' : 'haut'));
      return;
    }
    if (e.key === 'Enter' && rang >= 0 && liste[rang] !== undefined) {
      e.preventDefault();
      ouvrir(liste[rang]);
    }
  };

  const liste = suggestions ?? [];
  return (
    <div className="gst-annuaire">
      <style>{CSS_BARRE_ANNUAIRE}</style>
      {/* ⚠️ LE CHAMP PORTE SON NOM POUR LE LECTEUR D'ÉCRAN AUSSI : le libellé « Annuaire » est posé à DROITE,
          comme Arno le demande, et `aria-label` dit la même chose à qui ne le voit pas. */}
      <input ref={champ} type="search" className="gst-annuaire-champ"
        value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={auClavier}
        placeholder="Chercher un locataire, un propriétaire, une adresse…"
        aria-label="Chercher dans l’annuaire"
        role="combobox" aria-expanded={liste.length > 0} aria-controls={idListe}
        aria-autocomplete="list"
        aria-activedescendant={rang >= 0 && liste[rang] !== undefined ? `${idListe}-${rang}` : undefined} />
      <span className="gst-annuaire-mot" aria-hidden="true">Annuaire</span>

      {/* ⚠️ RIEN TANT QU'ON N'A PAS CHERCHÉ : `suggestions === null` veut dire « on n'a pas encore demandé », et
          c'est différent de « on a demandé et il n'y a rien ». Afficher « Aucun contact » sur un champ vide
          apprendrait à ignorer la phrase. */}
      {suggestions !== null && (
        liste.length === 0
          ? <p className="gst-annuaire-vide" role="status">
            {occupe ? 'Recherche…' : 'Aucun contact trouvé.'}
          </p>
          : (
            <ul className="gst-annuaire-liste" id={idListe} role="listbox" aria-label="Contacts trouvés">
              {liste.map((s, i) => (
                <li key={s.cle} id={`${idListe}-${i}`} role="option" aria-selected={i === rang}>
                  {/* ⚠️ `onMouseDown` ET NON `onClick` : le champ perd le focus au clic, ce qui referme la liste
                      avant que le clic n'aboutisse. `onMouseDown` part avant le `blur`. */}
                  <button type="button"
                    className={`gst-annuaire-item${i === rang ? ' gst-annuaire-item--vise' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); ouvrir(s); }}
                    onMouseEnter={() => setRang(i)}>
                    <span className="gst-annuaire-nom">{s.nom}</span>
                    <span className="gst-annuaire-role">{s.mot}</span>
                    {/* 🔴 L'ADRESSE DISTINGUE LES HOMONYMES, et elle ne porte PAS le numéro de lot (Arno). */}
                    {s.lieu !== null && <span className="gst-annuaire-lieu">{s.lieu}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )
      )}
    </div>
  );
}

/**
 * ⚠️ AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul terminerait.
 *
 * LE CHAMP PREND TOUTE LA LARGEUR et le mot « Annuaire » se pose a sa DROITE (Arno). La liste se pose PAR-DESSUS
 * les deux colonnes (position absolue) : la pousser vers le bas ferait sauter tout l'ecran a chaque frappe.
 */
const CSS_BARRE_ANNUAIRE = `
.gst-annuaire{position:relative;display:flex;align-items:center;gap:.6rem;margin:0 0 .8rem}
.gst-annuaire-champ{flex:1 1 auto;min-width:0;height:44px;padding:0 12px;font-size:16px;
  border:1px solid var(--color-svv-line);border-radius:10px;background:var(--color-svv-surface);
  color:var(--color-svv-ink)}
.gst-annuaire-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.gst-annuaire-mot{flex:0 0 auto;font-size:15px;font-weight:700;color:var(--color-svv-ink)}
.gst-annuaire-liste,.gst-annuaire-vide{position:absolute;top:48px;left:0;right:0;z-index:30;
  margin:0;padding:0;list-style:none;max-height:min(60vh,380px);overflow:auto;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;
  box-shadow:0 8px 24px rgba(0,0,0,.12)}
.gst-annuaire-vide{padding:10px 12px;font-size:.88rem;color:var(--color-svv-muted)}
.gst-annuaire-item{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;width:100%;min-height:44px;
  padding:8px 12px;text-align:left;background:none;border:0;cursor:pointer;color:inherit;font:inherit}
.gst-annuaire-item--vise,.gst-annuaire-item:hover{background:var(--color-svv-field)}
.gst-annuaire-item:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.gst-annuaire-nom{font-weight:700;color:var(--color-svv-ink)}
.gst-annuaire-role{font-size:.72rem;font-weight:700;letter-spacing:.03em;padding:1px 7px;border-radius:999px;
  color:var(--color-svv-bg);background:var(--color-svv-ink)}
.gst-annuaire-lieu{font-size:.82rem;color:var(--color-svv-muted)}
/* Sur telephone, le mot passe sous le champ plutot que de le comprimer a rien. */
@media (max-width: 560px){
  .gst-annuaire{flex-wrap:wrap}
  .gst-annuaire-mot{order:-1}
}
`;
