'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { adresseAffichee } from '../../lib/adresse/libelleAffiche';
import { libelleAdresse, sourceBan, type AdresseOfficielle, type ChercherAdresses } from './adresseOfficielle';

/**
 * ══ 🔴🔴 LE COMPOSANT UNIQUE D'AUTO-COMPLÉTION D'ADRESSE (Arno, 20/11/2026, « Adresse officielle BAN », lot 7a) ════════════════════════════════════
 *
 * Règle d'Arno : « une seule auto-complétion, une seule écriture partout ». TOUS les champs d'adresse de l'application sont ce composant, ou un
 * emballage de lui qui ne fait que l'habiller (`ChampAdresseBan` de l'administration, `AdresseAutocomplete` du site public, la rue du cabinet syndic,
 * la planche des parcelles) — un garde (`champAdresseUnique.guard.test.ts`) fait échouer la suite sinon.
 *   • la SOURCE est unique (`sourceBan` : l'API Adresse, et la Base locale en repli là où l'emballage le demande) ;
 *   • la LISTE, le CHAMP APRÈS LE CHOIX et les rappels passent par la fonction d'affichage unique (« 1 villa des Lilas, 92400 Courbevoie ») ;
 *   • le choix rend le FORMAT UNIQUE (`AdresseOfficielle` : identifiant BAN, libellé, numéro et indice, code postal, INSEE, commune) — la valeur que
 *     l'appelant enregistre reste celle de la BAN.
 * Le clavier (↑ ↓ Entrée Échap), la requête annulée à chaque frappe et le petit délai avant de fermer sont ceux qu'Arno a validés (01/10/2026).
 */
export interface ApparenceChamp {
  enveloppe?: { className?: string; style?: CSSProperties };
  champ?: { className?: string; style?: CSSProperties };
  liste?: { className?: string; style?: CSSProperties };
  /** une proposition : sa classe, et celle de la proposition visée au clavier */
  proposition?: { className?: string; viseeClassName?: string; style?: (i: number, visee: boolean) => CSSProperties; texteClassName?: string };
  /** l'élément de liste qui porte la proposition */
  ligne?: { className?: string; style?: (i: number) => CSSProperties };
}

export function ChampAdresseOfficielle({ valeur, onChange, onChoisir, id, exemple, apparence = {}, chercher, limite = 7, delai = 250, minimum = 3,
  chercherAuFocus = false, fermerAuDepart = true, apresListe = null, siVide = null, onClavier, attributs = {}, listeId = 'cab-liste', prefixeOption = 'cab-prop',
  affichageChoisi, fermerSur }: {
  valeur: string;
  /** la frappe libre ; l'appelant reste maître du champ */
  onChange: (v: string) => void;
  /** une proposition retenue, au format unique */
  onChoisir: (a: AdresseOfficielle) => void;
  id?: string;
  exemple?: string;
  apparence?: ApparenceChamp;
  /** la source ; absente : l'API Adresse (`sourceBan`) */
  chercher?: ChercherAdresses;
  limite?: number; delai?: number; minimum?: number;
  /** chercher dès qu'on entre dans un champ déjà rempli (la rue d'un syndic enregistré) */
  chercherAuFocus?: boolean;
  /** fermer la liste quand on quitte le champ (le site public la laissait ouverte) */
  fermerAuDepart?: boolean;
  /** ce que l'emballage montre sous la liste (la mention « adresse non vérifiée ») ; reçoit l'état de la recherche */
  apresListe?: ((e: { ouvert: boolean; cherche: boolean }) => ReactNode) | null;
  /** ce qui s'affiche quand une recherche n'a rien trouvé (la planche des parcelles) */
  siVide?: ReactNode;
  /** une touche que le composant n'a pas prise (Entrée sans proposition visée…) */
  onClavier?: (e: KeyboardEvent<HTMLInputElement>) => void;
  attributs?: Record<string, string | number | boolean | undefined>;
  listeId?: string;
  prefixeOption?: string;
  /** le texte montré dans le champ juste après un choix ; absent : `valeur` passée par la fonction d'affichage unique */
  affichageChoisi?: (valeur: string) => string;
  /** une valeur qui, quand elle change, ferme la liste (la planche valide un texte libre par « Localiser ») */
  fermerSur?: unknown;
}) {
  const [propositions, setPropositions] = useState<AdresseOfficielle[]>([]);
  const [vise, setVise] = useState(-1);
  const [cherche, setCherche] = useState(false);
  const [vide, setVide] = useState(false);
  // l'adresse vient d'être CHOISIE : le champ la montre par la fonction d'affichage ; la première frappe rend la main au texte tapé
  const [choisi, setChoisi] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVol = useRef<AbortController | null>(null);
  const source = useRef<ChercherAdresses>(chercher ?? sourceBan({ limite }));
  source.current = chercher ?? source.current;

  /** ⚠️ ON ANNULE LA REQUÊTE PRÉCÉDENTE : deux frappes rapprochées feraient revenir les réponses dans le désordre. */
  const demander = (q: string): void => {
    enVol.current?.abort();
    const ctrl = new AbortController();
    enVol.current = ctrl;
    setCherche(true);
    void (async () => {
      try {
        const liste = (await source.current(q, ctrl.signal)).slice(0, limite);
        if (ctrl.signal.aborted) return;
        setPropositions(liste); setVide(liste.length === 0); setVise(-1);
      } catch {
        // 🔴 LA BAN indisponible N'EST PAS UNE PANNE : la liste se vide, la saisie libre continue
        if (!ctrl.signal.aborted) { setPropositions([]); setVide(false); }
      } finally {
        if (!ctrl.signal.aborted) setCherche(false);
      }
    })();
  };
  const programmer = (v: string): void => {
    if (minuteur.current) clearTimeout(minuteur.current);
    if (v.trim().length < minimum) { enVol.current?.abort(); setPropositions([]); setVide(false); setVise(-1); return; }
    minuteur.current = setTimeout(() => demander(v), delai);
  };
  const taper = (v: string): void => { setChoisi(false); onChange(v); programmer(v); };
  const fermer = (): void => { setPropositions([]); setVide(false); setVise(-1); };
  const retenir = (a: AdresseOfficielle): void => { if (minuteur.current) clearTimeout(minuteur.current); enVol.current?.abort(); fermer(); setChoisi(true); onChoisir(a); };

  /** ⚠️ `preventDefault` sur Entrée SEULEMENT quand une proposition est visée ; Échap ferme sans rien choisir ni vider le champ. */
  const auClavier = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (propositions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setVise((i) => (i + 1) % propositions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setVise((i) => (i <= 0 ? propositions.length - 1 : i - 1)); return; }
      if (e.key === 'Escape') { fermer(); onClavier?.(e); return; }
      if (e.key === 'Enter' && vise >= 0 && vise < propositions.length) { e.preventDefault(); retenir(propositions[vise]); return; }
    }
    onClavier?.(e);
  };

  useEffect(() => () => { if (minuteur.current) clearTimeout(minuteur.current); enVol.current?.abort(); }, []);
  useEffect(() => { if (fermerSur === undefined) return; if (minuteur.current) clearTimeout(minuteur.current); enVol.current?.abort(); fermer(); }, [fermerSur]); // eslint-disable-line react-hooks/exhaustive-deps

  const ouvert = propositions.length > 0;
  const affiche = choisi ? (affichageChoisi ?? adresseAffichee)(valeur) : valeur;
  const a = apparence;
  return (
    <div className={a.enveloppe?.className ?? 'cab-enveloppe'} style={a.enveloppe?.style}>
      <input
        id={id}
        className={a.champ?.className ?? 'cp-saisie'}
        style={a.champ?.style}
        value={affiche}
        onChange={(e) => taper(e.target.value)}
        onKeyDown={auClavier}
        onFocus={() => { if (chercherAuFocus && !choisi) programmer(valeur); }}
        /* ⚠️ UN PETIT DÉLAI AVANT DE FERMER : sans lui, le clic sur une proposition part APRÈS le départ du champ, et rien ne se passe. */
        onBlur={() => { if (fermerAuDepart) setTimeout(fermer, 150); }}
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert}
        aria-autocomplete="list"
        aria-controls={listeId}
        aria-activedescendant={vise >= 0 ? `${prefixeOption}-${vise}` : undefined}
        placeholder={exemple}
        {...attributs}
      />
      {ouvert && (
        <ul className={a.liste?.className ?? 'cab-liste'} style={a.liste?.style} id={listeId} role="listbox">
          {propositions.map((p, i) => (
            <li key={`${p.banId ?? p.libelle}-${i}`} id={`${prefixeOption}-${i}`} role="option" aria-selected={i === vise} className={a.ligne?.className} style={a.ligne?.style?.(i)}>
              <button
                type="button"
                className={`${a.proposition?.className ?? 'cab-prop'}${i === vise ? ` ${a.proposition?.viseeClassName ?? 'cab-prop--vise'}` : ''}`}
                style={a.proposition?.style?.(i, i === vise)}
                /* `onMouseDown` ET NON `onClick` : il part AVANT le départ du champ, donc avant que la liste ne se referme. */
                onMouseDown={(e) => { e.preventDefault(); retenir(p); }}
                /* le clic seul (clavier sur le bouton, lecteurs d'écran) : la même retenue ; après un appui, la liste est déjà fermée */
                onClick={() => retenir(p)}
                onMouseEnter={() => setVise(i)}
                data-adresse-proposition={p.banId ?? ''}>
                {a.proposition?.texteClassName ? <span className={a.proposition.texteClassName}>{libelleAdresse(p)}</span> : libelleAdresse(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!ouvert && vide && !cherche && valeur.trim().length >= minimum && siVide}
      {apresListe?.({ ouvert, cherche })}
    </div>
  );
}
