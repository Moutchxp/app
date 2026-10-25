'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { scoreRecherche, segmentsSurlignes } from '../../../../lib/location/rechercheListe';

/**
 * ══ LOCATION — LA LISTE DE CHOIX D'UN COLLÈGUE (Arno, 23/10/2026) ══════════════════════════════════════════════════════════
 * Le menu natif s'ouvrait décalé et en bleu système. Celle-ci s'ouvre EXACTEMENT sous le champ, de sa largeur ; survol et
 * sélection dans le rouge de l'interface, une coche rouge sur l'élément choisi ; clavier (flèches, Début / Fin, Entrée, Échap —
 * qui ne ferme QUE la liste, jamais la fenêtre autour), recherche par frappe ; rôles ARIA (combobox / listbox / option) ; des
 * lignes de 44 px au doigt. Un compte désactivé n'est montré que s'il est déjà choisi, marqué « désactivé ».
 * Arno (23/10/2026) : le surlignage est VERT — celui de l'entrée active du menu de gauche (fond vert pâle, texte vert foncé).
 * Réutilisable : collègue de rattachement, « collègue directement », négociateur.
 */
export interface OptionChoix {
  id: number | string; libelle: string; actif?: boolean;
  /**
   * Arno (24/10/2026) — un choix MONTRÉ mais pas choisissable (ex. un apporteur « à rattacher »), suivi de sa `mention`. À la
   * différence d'un compte désactivé (`actif: false`), il est toujours dans la liste : l'information reste visible.
   */
  bloque?: boolean;
  mention?: string;
  /**
   * 🔴 Arno (24/10/2026, 419) — le GROUPE du choix (ex. « Internes », « Partenaires externes ») : un intitulé non choisissable s'affiche
   * au début de chaque groupe (les choix d'un même groupe se suivent). Absent : aucun intitulé (la liste d'avant).
   */
  groupe?: string;
  /** 🔴 Arno (25/10/2026) — le texte cherchable EN PLUS du libellé (nom, prénom, société, téléphones, e-mails), en mode `recherche`. */
  recherche?: string;
}

/**
 * 🔴 Arno (25/10/2026) — LE MODE RECHERCHE (l'apporteur d'affaires, partout) : à l'ouverture, un champ de recherche en tête du menu ; la
 * liste se filtre à la frappe (accents et casse ignorés, tous les mots, téléphone), meilleurs résultats d'abord, groupes gardés, terme
 * surligné ; ↑ ↓ Entrée Échap. Aucun résultat : « + Créer « texte » » (`onCreer`, la création rapide pré-remplie) et « Ouvrir
 * l'annuaire » (`onAnnuaire`). Le choix `+` de l'hôte (« + Nouvel apporteur… ») devient « + Créer « texte » » quand un texte est tapé.
 */
export interface RechercheListe { placeholder?: string; onCreer?: (texte: string) => void; onAnnuaire?: () => void }

/**
 * ══ 🔴 Arno (25/10/2026) — LE MENU EN SURIMPRESSION, PLACÉ INTELLIGEMMENT ══════════════════════════════════════════════════════════
 * Le menu s'ouvre en position FIXE (au-dessus de tout, sans décaler la page ni l'agrandir) : SOUS le champ s'il reste la place d'au
 * moins ~6 options + 24 px avant le bas de l'écran, sinon AU-DESSUS (ou du côté le plus grand si aucun ne suffit) ; hauteur bornée
 * (défilement interne) ; jamais à moins de 16 px d'un bord. Il suit le champ au défilement et au redimensionnement. Il reste dans
 * l'arbre de la page (pas de portail) : il garde le thème (clair / sombre) et les styles de l'écran. PUR.
 */
export const LIGNE_OPTION_PX = 44;
export const MARGE_BORD_PX = 16;
export const MARGE_BAS_PX = 24;
export const HAUTEUR_MAX_MENU_PX = 320;
export interface PlacementMenu { sens: 'bas' | 'haut'; left: number; width: number; top?: number; bottom?: number; maxHeight: number }
export function placementMenu(champ: { top: number; bottom: number; left: number; width: number }, ecran: { largeur: number; hauteur: number }, nbOptions: number): PlacementMenu {
  const voulu = Math.min(HAUTEUR_MAX_MENU_PX, Math.min(nbOptions, 6) * LIGNE_OPTION_PX + 10);
  const dessous = ecran.hauteur - champ.bottom - 4 - MARGE_BAS_PX;
  const dessus = champ.top - 4 - MARGE_BORD_PX;
  const sens: 'bas' | 'haut' = dessous >= voulu || dessous >= dessus ? 'bas' : 'haut';
  const width = Math.min(champ.width, ecran.largeur - 2 * MARGE_BORD_PX);
  const left = Math.min(Math.max(champ.left, MARGE_BORD_PX), ecran.largeur - MARGE_BORD_PX - width);
  const place = sens === 'bas' ? dessous : dessus;
  const maxHeight = Math.max(LIGNE_OPTION_PX + 10, Math.min(HAUTEUR_MAX_MENU_PX, place));
  return sens === 'bas'
    ? { sens, left, width, top: champ.bottom + 4, maxHeight }
    : { sens, left, width, bottom: ecran.hauteur - champ.top + 4, maxHeight };
}

/** L'heure de la frappe (recherche par frappe) : hors du composant, appelée seulement par les gestes du clavier. */
const maintenant = (): number => Date.now();

const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ListeChoix({ options, valeur, onChange, vide = '— choisir —', libelle, classe, donnees, desactive = false, teinte = 'vert', recherche }: {
  options: readonly OptionChoix[];
  /** L'id choisi ('' : aucun). */
  valeur: string;
  onChange: (id: string) => void;
  /** Le libellé de « aucun » (null : pas de choix vide). */
  vide?: string | null;
  /** Le nom accessible de la liste. */
  libelle?: string;
  /** La classe du champ (pour qu'il ait l'allure des autres champs de l'écran). */
  classe?: string;
  /** Les attributs `data-…` du champ (les repères des tests et du banc). */
  donnees?: Record<string, string>;
  /** Arno (24/10/2026) — le champ inactif (ex. une prime sans « Nouvelle gestion ») : ni ouverture, ni clavier. */
  desactive?: boolean;
  /** Arno (24/10/2026) — le surlignage et la coche : VERT (défaut, annuaire), ou ROUGE (le bloc « Suivi commercial »). */
  teinte?: 'vert' | 'rouge';
  /** 🔴 25/10/2026 — le mini moteur de recherche (voir `RechercheListe`). Absent : la liste d'avant. */
  recherche?: RechercheListe;
}) {
  const id = useId();
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const tampon = useRef<{ texte: string; t: number }>({ texte: '', t: 0 });
  const racine = useRef<HTMLDivElement | null>(null);
  const liste = useRef<HTMLUListElement | null>(null);
  const champ = useRef<HTMLButtonElement | null>(null);
  // Les choix : « aucun » (si permis), les comptes actifs, et un compte désactivé seulement s'il est le choix en cours.
  const choix: { id: string; libelle: string; desactive: boolean; bloque?: boolean; groupe?: string; recherche?: string }[] = [
    ...(vide === null ? [] : [{ id: '', libelle: vide, desactive: false }]),
    ...options.filter((o) => o.actif !== false || String(o.id) === valeur).map((o) => ({
      id: String(o.id), libelle: `${o.libelle}${o.actif === false ? ' (compte désactivé)' : ''}${o.mention ?? ''}`, desactive: o.actif === false || o.bloque === true, ...(o.bloque === true ? { bloque: true } : {}),
      ...(o.groupe !== undefined ? { groupe: o.groupe } : {}), ...(o.recherche !== undefined ? { recherche: o.recherche } : {}),
    })),
  ];
  const courant = choix.find((c) => c.id === valeur);
  // 🔴 25/10/2026 — le mode recherche : les choix AFFICHÉS (filtrés, triés, groupes gardés) ; sans texte, la liste entière.
  const [q, setQ] = useState('');
  const saisie = useRef<HTMLInputElement | null>(null);
  const cherche = recherche !== undefined && q.trim() !== '';
  const affiches = !cherche ? choix : (() => {
    const notes = choix.filter((c) => c.id !== '' && c.id !== '+').map((c, rang) => ({ c, rang, note: scoreRecherche(c.libelle, c.recherche ?? '', q) }))
      .filter((x): x is { c: (typeof choix)[number]; rang: number; note: number } => x.note !== null);
    // Les groupes gardés (leurs choix se suivent), le groupe du meilleur résultat d'abord ; dans un groupe, les meilleurs d'abord.
    const groupes = [...new Set(notes.map((x) => x.c.groupe ?? ''))];
    const meilleur = (g: string): number => Math.max(...notes.filter((x) => (x.c.groupe ?? '') === g).map((x) => x.note));
    groupes.sort((a, b) => meilleur(b) - meilleur(a) || groupes.indexOf(a) - groupes.indexOf(b));
    const tries = groupes.flatMap((g) => notes.filter((x) => (x.c.groupe ?? '') === g).sort((a, b) => b.note - a.note || a.rang - b.rang).map((x) => x.c));
    const plus = choix.find((c) => c.id === '+');
    return [...tries, ...(plus !== undefined && tries.length > 0 ? [{ ...plus, libelle: recherche?.onCreer ? `+ Créer « ${q.trim()} »` : plus.libelle }] : [])];
  })();
  const aucun = cherche && affiches.length === 0;
  // Le champ prend le focus à l'ouverture (Safari ne le donne pas à un bouton cliqué) : le clavier et Échap vont à la liste.
  const ouvrir = (texte = ''): void => {
    if (desactive) return;
    setQ(texte);
    setActif(texte !== '' ? 0 : Math.max(0, choix.findIndex((c) => c.id === valeur)));
    setOuvert(true);
    if (recherche === undefined) champ.current?.focus();
  };
  const fermer = (): void => { setOuvert(false); setQ(''); };
  const choisir = (i: number): void => {
    const c = affiches[i];
    if (c && !c.desactive) {
      if (c.id === '+' && cherche && recherche?.onCreer) recherche.onCreer(q.trim()); else onChange(c.id);
    }
    fermer();
    champ.current?.focus();
  };
  // Le champ de recherche prend le focus à l'ouverture (le clavier y va).
  useEffect(() => { if (ouvert && recherche !== undefined) saisie.current?.focus(); }, [ouvert, recherche]);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent | TouchEvent): void => { if (racine.current && !racine.current.contains(e.target as Node)) { setOuvert(false); setQ(''); } };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('touchstart', dehors);
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('touchstart', dehors); };
  }, [ouvert]);
  useEffect(() => {
    if (ouvert) liste.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [ouvert, actif]);
  // 🔴 25/10/2026 — la place du menu (fixe), recalculée à l'ouverture, au défilement (de la page ou d'un conteneur) et au redimensionnement.
  const [place, setPlace] = useState<PlacementMenu | null>(null);
  const nbChoix = Math.max(affiches.length, 1) + (recherche !== undefined ? 1 : 0);
  useLayoutEffect(() => {
    if (!ouvert) return;
    const placer = (): void => {
      const r = champ.current?.getBoundingClientRect();
      if (r === undefined) return;
      setPlace(placementMenu({ top: r.top, bottom: r.bottom, left: r.left, width: r.width }, { largeur: window.innerWidth, hauteur: window.innerHeight }, nbChoix));
    };
    placer();
    window.addEventListener('scroll', placer, true);
    window.addEventListener('resize', placer);
    return () => { window.removeEventListener('scroll', placer, true); window.removeEventListener('resize', placer); };
  }, [ouvert, nbChoix]);
  const options_ = (surligner: boolean) => affiches.map((c, i) => [
    c.groupe !== undefined && c.groupe !== affiches[i - 1]?.groupe && (
      <li key={`groupe-${c.groupe}`} role="presentation" className="lch-groupe" data-groupe-choix={c.groupe}>{c.groupe}</li>
    ),
    <li key={c.id || 'vide'} id={`${id}-${i}`} role="option" aria-selected={c.id === valeur} aria-disabled={c.desactive || undefined} data-index={i} data-option={c.id} data-bloque={c.bloque ? '' : undefined}
      className={['lch-option', i === actif ? 'lch-option--actif' : '', c.id === valeur ? 'lch-option--choisi' : '', c.desactive ? 'lch-option--desactive' : '', c.id === '' ? 'lch-vide' : ''].filter(Boolean).join(' ')}
      onMouseEnter={() => setActif(i)} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.preventDefault(); choisir(i); }}>
      <span className="lch-coche" aria-hidden="true">{c.id === valeur ? '✓' : ''}</span>
      <span>{surligner && cherche && c.id !== '+'
        ? segmentsSurlignes(c.libelle, q).map((x, k) => (x.fort ? <mark key={k} className="lch-surligne">{x.t}</mark> : <span key={k}>{x.t}</span>))
        : c.libelle}</span>
    </li>,
  ]);
  const style: CSSProperties | undefined = !ouvert || place === null ? undefined : {
    position: 'fixed', left: place.left, width: place.width, maxHeight: place.maxHeight, right: 'auto',
    ...(place.sens === 'bas' ? { top: place.top, bottom: 'auto' } : { top: 'auto', bottom: place.bottom }),
  };
  const clavierRecherche = (e: KeyboardEvent<HTMLInputElement>): void => {
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); champ.current?.focus(); return; }
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      setActif((a) => Math.min(affiches.length - 1, Math.max(0, a + (k === 'ArrowDown' ? 1 : -1))));
      return;
    }
    if (k === 'Enter') { e.preventDefault(); if (affiches.length > 0) choisir(actif); else if (recherche?.onCreer && q.trim() !== '') { recherche.onCreer(q.trim()); fermer(); } return; }
    if (k === 'Tab') fermer();
  };
  const clavier = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const k = e.key;
    if (k === 'Escape') { if (ouvert) { e.preventDefault(); e.stopPropagation(); fermer(); } return; }
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      if (!ouvert) { ouvrir(); return; }
      setActif((a) => Math.min(affiches.length - 1, Math.max(0, a + (k === 'ArrowDown' ? 1 : -1))));
      return;
    }
    if (k === 'Home' || k === 'End') { if (ouvert) { e.preventDefault(); setActif(k === 'Home' ? 0 : affiches.length - 1); } return; }
    // En mode recherche, une lettre tapée sur le champ fermé ouvre la recherche avec elle.
    if (recherche !== undefined && k.length === 1 && k !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); ouvrir(k); return; }
    if (k === 'Enter' || k === ' ') {
      if (k === ' ' && tampon.current.texte !== '' && maintenant() - tampon.current.t < 700) { /* une espace dans une recherche */ } else {
        e.preventDefault();
        if (ouvert) choisir(actif); else ouvrir();
        return;
      }
    }
    if (k === 'Tab') { fermer(); return; }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // La recherche par frappe : les lettres tapées à la suite désignent le premier choix qui commence ainsi.
      const t = maintenant();
      tampon.current = { texte: (t - tampon.current.t < 700 ? tampon.current.texte : '') + norm(k), t };
      const i = choix.findIndex((c) => c.id !== '' && norm(c.libelle).startsWith(tampon.current.texte));
      if (i >= 0) { if (!ouvert) setOuvert(true); setActif(i); }
    }
  };
  return (
    <div className={`lch${teinte === 'rouge' ? ' lch--rouge' : ''}`} ref={racine}>
      <style>{CSS_LISTE_CHOIX}</style>
      <button type="button" ref={champ} className={`lch-champ ${classe ?? ''}`} disabled={desactive} data-valeur={valeur} role="combobox" aria-haspopup="listbox" aria-expanded={ouvert} aria-controls={`${id}-liste`}
        aria-label={libelle} aria-activedescendant={ouvert ? `${id}-${actif}` : undefined} onClick={() => (ouvert ? setOuvert(false) : ouvrir())} onKeyDown={clavier} {...donnees}>
        <span className={courant === undefined || courant.id === '' ? 'lch-vide' : undefined}>{courant === undefined ? (vide ?? '') : courant.libelle}</span>
        <svg className="lch-chevron" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      {ouvert && recherche === undefined && (
        <ul className="lch-liste" role="listbox" id={`${id}-liste`} aria-label={libelle} ref={liste} data-liste-choix data-sens={place?.sens} style={style}>
          {options_(false)}
        </ul>
      )}
      {ouvert && recherche !== undefined && (
        <div className="lch-liste lch-panneau" data-panneau-recherche data-sens={place?.sens} style={style}>
          <input ref={saisie} className="lch-recherche" type="search" value={q} placeholder={recherche.placeholder ?? 'Rechercher…'} aria-label={`Rechercher : ${libelle ?? ''}`}
            role="searchbox" aria-controls={`${id}-liste`} aria-activedescendant={affiches.length > 0 ? `${id}-${actif}` : undefined} autoComplete="off"
            onChange={(e) => { setQ(e.target.value); setActif(0); }} onKeyDown={clavierRecherche} data-recherche-liste />
          <ul className="lch-resultats" role="listbox" id={`${id}-liste`} aria-label={libelle} ref={liste} data-liste-choix>
            {options_(true)}
          </ul>
          {aucun && (
            <div className="lch-aucun" role="status" data-aucun-resultat>
              <p>Aucun résultat pour « {q.trim()} ».</p>
              {recherche.onCreer && <button type="button" className="lch-action" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { const t = q.trim(); fermer(); recherche.onCreer?.(t); }} data-creer-depuis-recherche>+ Créer « {q.trim()} »</button>}
              {recherche.onAnnuaire && <button type="button" className="lch-action" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { fermer(); recherche.onAnnuaire?.(); }} data-annuaire-depuis-recherche>Ouvrir l’annuaire</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const CSS_LISTE_CHOIX = `
.lch{position:relative;width:100%;min-width:0}
.lch-champ{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:44px;box-sizing:border-box;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-size:.95rem;font-weight:400;color:var(--color-svv-ink);background:var(--color-svv-surface);text-align:left;cursor:pointer}
.lch-champ>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lch-champ:focus-visible,.lch-champ[aria-expanded="true"]{outline:2px solid var(--color-svv-red);outline-offset:1px}
.lch-chevron{flex:0 0 auto;color:var(--color-svv-muted)}
.lch-vide{color:var(--color-svv-muted)}
.lch-liste{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:1000;box-sizing:border-box;margin:0;padding:4px;list-style:none;max-height:264px;overflow:auto;background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:10px;box-shadow:0 18px 40px -16px color-mix(in srgb, var(--color-svv-ink) 30%, transparent)}
/* « .lch-liste > » : la liste vit parfois dans une autre liste (les fiches de l'annuaire) — leurs styles de <li> ne s'y appliquent pas. */
.lch-liste>.lch-option{display:flex;align-items:center;gap:8px;min-height:44px;margin:0;padding:0 8px;border:0;border-radius:8px;background:none;box-shadow:none;cursor:pointer;color:var(--color-svv-ink);font-size:.95rem;font-weight:400}
.lch-liste>.lch-option--actif{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.lch-liste>.lch-option--choisi{font-weight:700;color:var(--color-svv-green-ink)}
.lch-liste>.lch-option--desactive{cursor:not-allowed;color:var(--color-svv-muted)}
.lch-liste>.lch-groupe{margin:6px 0 2px;padding:4px 8px 2px;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--color-svv-muted);cursor:default}
.lch-coche{width:16px;flex:0 0 16px;color:var(--color-svv-green-ink);font-weight:800}
.lch-champ:disabled{opacity:.6;cursor:not-allowed}
/* 🔴 25/10/2026 — le mode recherche : le champ en tête du menu (il reste en place), la liste défile dessous ; le terme surligné. */
.lch-panneau{display:flex;flex-direction:column;gap:4px;overflow:hidden}
.lch-recherche{flex:0 0 auto;min-height:44px;box-sizing:border-box;width:100%;border:1px solid var(--color-svv-line-strong);border-radius:8px;padding:0 10px;font:inherit;font-size:.95rem;color:var(--color-svv-ink);background:var(--color-svv-field)}
.lch-recherche:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:0}
.lch-resultats{flex:1 1 auto;min-height:0;overflow:auto;margin:0;padding:0;list-style:none}
.lch-resultats>.lch-option{display:flex;align-items:center;gap:8px;min-height:44px;margin:0;padding:0 8px;border:0;border-radius:8px;background:none;box-shadow:none;cursor:pointer;color:var(--color-svv-ink);font-size:.95rem;font-weight:400}
.lch-resultats>.lch-option--actif{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.lch-resultats>.lch-option--choisi{font-weight:700;color:var(--color-svv-green-ink)}
.lch-resultats>.lch-option--desactive{cursor:not-allowed;color:var(--color-svv-muted)}
.lch-resultats>.lch-groupe{margin:6px 0 2px;padding:4px 8px 2px;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--color-svv-muted);cursor:default}
.lch-surligne{background:color-mix(in srgb, var(--color-svv-or) 45%, transparent);color:inherit;border-radius:3px;padding:0 1px}
.lch-aucun{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:6px 8px;color:var(--color-svv-muted);font-size:.92rem}
.lch-aucun p{margin:0}
.lch-action{min-height:44px;border:0;background:none;padding:0 4px;font:inherit;font-weight:700;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer}
.lch--rouge .lch-resultats>.lch-option--actif{background:var(--color-svv-red-soft);color:var(--color-svv-red)}
.lch--rouge .lch-resultats>.lch-option--choisi{color:var(--color-svv-red)}
/* Arno (24/10/2026) — la teinte ROUGE (le rouge de l'interface), pour le bloc « Suivi commercial » ; le vert reste ailleurs. */
.lch--rouge .lch-liste>.lch-option--actif{background:var(--color-svv-red-soft);color:var(--color-svv-red)}
.lch--rouge .lch-liste>.lch-option--choisi{color:var(--color-svv-red)}
.lch--rouge .lch-coche{color:var(--color-svv-red)}
.lch--rouge .lch-liste>.lch-option--desactive{background:none;color:var(--color-svv-muted)}
`;
