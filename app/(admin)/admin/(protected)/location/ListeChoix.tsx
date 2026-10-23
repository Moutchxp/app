'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

/**
 * ══ LOCATION — LA LISTE DE CHOIX D'UN COLLÈGUE (Arno, 23/10/2026) ══════════════════════════════════════════════════════════
 * Le menu natif s'ouvrait décalé et en bleu système. Celle-ci s'ouvre EXACTEMENT sous le champ, de sa largeur ; survol et
 * sélection dans le rouge de l'interface, une coche rouge sur l'élément choisi ; clavier (flèches, Début / Fin, Entrée, Échap —
 * qui ne ferme QUE la liste, jamais la fenêtre autour), recherche par frappe ; rôles ARIA (combobox / listbox / option) ; des
 * lignes de 44 px au doigt. Un compte désactivé n'est montré que s'il est déjà choisi, marqué « désactivé ».
 * Arno (23/10/2026) : le surlignage est VERT — celui de l'entrée active du menu de gauche (fond vert pâle, texte vert foncé).
 * Réutilisable : collègue de rattachement, « collègue directement », négociateur.
 */
export interface OptionChoix { id: number | string; libelle: string; actif?: boolean }

const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ListeChoix({ options, valeur, onChange, vide = '— choisir —', libelle, classe, donnees }: {
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
}) {
  const id = useId();
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const tampon = useRef<{ texte: string; t: number }>({ texte: '', t: 0 });
  const racine = useRef<HTMLDivElement | null>(null);
  const liste = useRef<HTMLUListElement | null>(null);
  const champ = useRef<HTMLButtonElement | null>(null);
  // Les choix : « aucun » (si permis), les comptes actifs, et un compte désactivé seulement s'il est le choix en cours.
  const choix: { id: string; libelle: string; desactive: boolean }[] = [
    ...(vide === null ? [] : [{ id: '', libelle: vide, desactive: false }]),
    ...options.filter((o) => o.actif !== false || String(o.id) === valeur).map((o) => ({ id: String(o.id), libelle: o.libelle, desactive: o.actif === false })),
  ];
  const courant = choix.find((c) => c.id === valeur);
  // Le champ prend le focus à l'ouverture (Safari ne le donne pas à un bouton cliqué) : le clavier et Échap vont à la liste.
  const ouvrir = (): void => { setActif(Math.max(0, choix.findIndex((c) => c.id === valeur))); setOuvert(true); champ.current?.focus(); };
  const choisir = (i: number): void => { const c = choix[i]; if (c && !c.desactive) onChange(c.id); setOuvert(false); };
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent | TouchEvent): void => { if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('touchstart', dehors);
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('touchstart', dehors); };
  }, [ouvert]);
  useEffect(() => {
    if (ouvert) liste.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [ouvert, actif]);
  const clavier = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const k = e.key;
    if (k === 'Escape') { if (ouvert) { e.preventDefault(); e.stopPropagation(); setOuvert(false); } return; }
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      if (!ouvert) { ouvrir(); return; }
      setActif((a) => Math.min(choix.length - 1, Math.max(0, a + (k === 'ArrowDown' ? 1 : -1))));
      return;
    }
    if (k === 'Home' || k === 'End') { if (ouvert) { e.preventDefault(); setActif(k === 'Home' ? 0 : choix.length - 1); } return; }
    if (k === 'Enter' || k === ' ') {
      if (k === ' ' && tampon.current.texte !== '' && Date.now() - tampon.current.t < 700) { /* une espace dans une recherche */ } else {
        e.preventDefault();
        if (ouvert) choisir(actif); else ouvrir();
        return;
      }
    }
    if (k === 'Tab') { setOuvert(false); return; }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // La recherche par frappe : les lettres tapées à la suite désignent le premier choix qui commence ainsi.
      const t = Date.now();
      tampon.current = { texte: (t - tampon.current.t < 700 ? tampon.current.texte : '') + norm(k), t };
      const i = choix.findIndex((c) => c.id !== '' && norm(c.libelle).startsWith(tampon.current.texte));
      if (i >= 0) { if (!ouvert) setOuvert(true); setActif(i); }
    }
  };
  return (
    <div className="lch" ref={racine}>
      <style>{CSS_LISTE_CHOIX}</style>
      <button type="button" ref={champ} className={`lch-champ ${classe ?? ''}`} role="combobox" aria-haspopup="listbox" aria-expanded={ouvert} aria-controls={`${id}-liste`}
        aria-label={libelle} aria-activedescendant={ouvert ? `${id}-${actif}` : undefined} onClick={() => (ouvert ? setOuvert(false) : ouvrir())} onKeyDown={clavier} {...donnees}>
        <span className={courant === undefined || courant.id === '' ? 'lch-vide' : undefined}>{courant === undefined ? (vide ?? '') : `${courant.libelle}${courant.desactive ? ' (désactivé)' : ''}`}</span>
        <svg className="lch-chevron" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      {ouvert && (
        <ul className="lch-liste" role="listbox" id={`${id}-liste`} aria-label={libelle} ref={liste} data-liste-choix>
          {choix.map((c, i) => (
            <li key={c.id || 'vide'} id={`${id}-${i}`} role="option" aria-selected={c.id === valeur} aria-disabled={c.desactive || undefined} data-index={i} data-option={c.id}
              className={['lch-option', i === actif ? 'lch-option--actif' : '', c.id === valeur ? 'lch-option--choisi' : '', c.desactive ? 'lch-option--desactive' : '', c.id === '' ? 'lch-vide' : ''].filter(Boolean).join(' ')}
              onMouseEnter={() => setActif(i)} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.preventDefault(); choisir(i); }}>
              <span className="lch-coche" aria-hidden="true">{c.id === valeur ? '✓' : ''}</span>
              <span>{c.libelle}{c.desactive ? ' (désactivé)' : ''}</span>
            </li>
          ))}
        </ul>
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
.lch-liste{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:30;margin:0;padding:4px;list-style:none;max-height:264px;overflow:auto;background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:10px;box-shadow:0 18px 40px -16px color-mix(in srgb, var(--color-svv-ink) 30%, transparent)}
/* « .lch-liste > » : la liste vit parfois dans une autre liste (les fiches de l'annuaire) — leurs styles de <li> ne s'y appliquent pas. */
.lch-liste>.lch-option{display:flex;align-items:center;gap:8px;min-height:44px;margin:0;padding:0 8px;border:0;border-radius:8px;background:none;box-shadow:none;cursor:pointer;color:var(--color-svv-ink);font-size:.95rem;font-weight:400}
.lch-liste>.lch-option--actif{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.lch-liste>.lch-option--choisi{font-weight:700;color:var(--color-svv-green-ink)}
.lch-liste>.lch-option--desactive{cursor:not-allowed;color:var(--color-svv-muted)}
.lch-coche{width:16px;flex:0 0 16px;color:var(--color-svv-green-ink);font-weight:800}
`;
