'use client';

/* 🔴 MODULES PURS UNIQUEMENT : ce composant vit dans le navigateur (garde `clientBoundary.guard.test.ts`). */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { SEUIL_RECHERCHE_COLLEGUES } from '../../../../lib/gestion/ouvreurEvenement';

/**
 * ══ 🔴🔴 LA FENÊTRE « OUVERT PAR » (Arno, 27/11/2026, 11h01, point 2) ══════════════════════════════════════════════════════════════════════════
 *
 * « Pour la sélection des collègues, il faut une fenêtre qui s'ouvre avec tous les utilisateurs qui ont accès aux tuiles Gestion et Location. »
 *   · TOUS les comptes ayant accès à Gestion ou à Location, même sans événement, triés par NOM, « Prénom NOM », avec leur nombre d'événements ;
 *   · une case par personne, plusieurs possibles, « Tout sélectionner » / « Aucun », une recherche au-delà de 8 noms ;
 *   · « Appliquer » et « Annuler » pleine largeur ; Échap = Annuler ; plein écran à 390 px.
 * ⚠️ AUCUNE ÉCRITURE : la fenêtre remonte les clés choisies ; c'est la ligne de filtres (et l'adresse de la page) qui les garde.
 */
export function FenetreOuvertPar({ collegues, choisis, onAppliquer, onAnnuler }: {
  collegues: readonly { cle: string; mot: string; n: number }[];
  choisis: readonly string[];
  onAppliquer: (cles: string[]) => void;
  onAnnuler: () => void;
}) {
  const titreId = useId();
  const [coches, setCoches] = useState<Set<string>>(() => new Set(choisis));
  const [recherche, setRecherche] = useState('');
  const premier = useRef<HTMLInputElement | null>(null);
  const annulerRef = useRef(onAnnuler);
  annulerRef.current = onAnnuler;
  useEffect(() => {
    premier.current?.focus();
    const clavier = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); annulerRef.current(); } };
    document.addEventListener('keydown', clavier);
    return () => document.removeEventListener('keydown', clavier);
  }, []);
  const plat = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const avecRecherche = collegues.length > SEUIL_RECHERCHE_COLLEGUES;
  const visibles = useMemo(() => (avecRecherche && recherche.trim() !== ''
    ? collegues.filter((c) => plat(c.mot).includes(plat(recherche.trim()))) : collegues), [collegues, recherche, avecRecherche]);
  const basculer = (cle: string) => setCoches((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });

  return (
    <div className="fop-voile" onClick={(e) => { if (e.target === e.currentTarget) onAnnuler(); }} data-fop-voile>
      <style>{CSS_FENETRE_OUVERT_PAR}</style>
      <div className="fop-fenetre" role="dialog" aria-modal="true" aria-labelledby={titreId} data-fop>
        <h3 className="fop-titre" id={titreId}>Ouvert par</h3>
        <p className="fop-aide">Les collègues qui ont accès à Gestion ou à Location. Cochez-en un ou plusieurs.</p>
        {avecRecherche && (
          <label className="fop-recherche"><span>Rechercher un collègue</span>
            <input ref={premier} type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} data-fop-recherche /></label>)}
        <div className="fop-tous">
          <button type="button" className="fop-lien" onClick={() => setCoches(new Set(collegues.map((c) => c.cle)))} data-fop-tout>Tout sélectionner</button>
          <button type="button" className="fop-lien" onClick={() => setCoches(new Set())} data-fop-aucun>Aucun</button>
        </div>
        <ul className="fop-liste" data-fop-liste>
          {visibles.map((c, i) => (
            <li key={c.cle}>
              <label className="fop-case" data-fop-collegue={c.cle}>
                <input ref={!avecRecherche && i === 0 ? premier : undefined} type="checkbox" checked={coches.has(c.cle)} onChange={() => basculer(c.cle)} />
                <span className="fop-nom">{c.mot}</span>
                <span className="fop-n" aria-label={`${c.n} événement${c.n > 1 ? 's' : ''}`}>{c.n}</span>
              </label>
            </li>))}
          {visibles.length === 0 && <li className="fop-vide">Aucun collègue ne correspond à cette recherche.</li>}
        </ul>
        <div className="fop-gestes">
          <button type="button" className="svv-btn svv-btn-primary gst-btn fop-plein"
            onClick={() => onAppliquer(collegues.map((c) => c.cle).filter((k) => coches.has(k)))} data-fop-appliquer>Appliquer</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn fop-plein" onClick={onAnnuler} data-fop-annuler>Annuler</button>
        </div>
      </div>
    </div>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit DANS un litteral de gabarit (piege TS1005 du depot). Couleurs : les jetons du theme (clair / sombre). */
const CSS_FENETRE_OUVERT_PAR = `
.fop-voile{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,14,20,.55)}
.fop-fenetre{display:flex;flex-direction:column;gap:10px;width:min(460px,100%);max-height:calc(100vh - 32px);box-sizing:border-box;padding:18px 18px 16px;
  border-radius:12px;background:var(--color-svv-surface);color:var(--color-svv-ink);border:1px solid var(--color-svv-line);box-shadow:0 18px 48px rgba(0,0,0,.35)}
.fop-titre{margin:0;font-size:1.05rem;font-weight:800}
.fop-aide{margin:0;font-size:.85rem;color:var(--color-svv-muted)}
.fop-recherche{display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:700}
.fop-recherche input{min-height:44px;box-sizing:border-box;width:100%;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);padding:8px 10px;font:inherit;font-weight:400}
.fop-tous{display:flex;gap:16px}
.fop-lien{background:none;border:0;padding:0;min-height:36px;font:inherit;font-size:.9rem;font-weight:700;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer}
.fop-liste{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1 1 auto;min-height:0;border-top:1px solid var(--color-svv-line);border-bottom:1px solid var(--color-svv-line)}
.fop-liste > li{border-bottom:1px solid var(--color-svv-line)}
.fop-liste > li:last-child{border-bottom:0}
.fop-case{display:flex;align-items:center;gap:12px;min-height:48px;padding:0 4px;cursor:pointer}
.fop-case input{width:20px;height:20px;flex:0 0 auto}
.fop-nom{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.fop-n{flex:0 0 auto;min-width:2ch;text-align:right;font-size:.85rem;font-weight:700;color:var(--color-svv-muted);font-variant-numeric:tabular-nums}
.fop-vide{padding:12px 4px;color:var(--color-svv-muted);font-size:.9rem}
.fop-gestes{display:flex;flex-direction:column;gap:8px}
.fop-plein{width:100%;min-height:44px;box-sizing:border-box;margin:0}
@media (max-width:600px){
  .fop-voile{padding:0;align-items:stretch}
  .fop-fenetre{width:100%;max-height:none;height:100%;border-radius:0;border:0}
}
`;
