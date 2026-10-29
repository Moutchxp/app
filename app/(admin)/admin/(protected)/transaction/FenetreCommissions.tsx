'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ETIQUETTE, estVersee, type AffaireCout, type CategorieCout, type DetailCommissions, type LigneCout } from '../../../../lib/transaction/detailCommissions';
import { LIBELLE_SOCIETE, type Societe } from '../../../../lib/transaction/modele';
import { eur } from './commun';

/**
 * ══ 🔴 LOT AL (Arno, 29/10/2026) — LA FENÊTRE « COMMISSIONS VERSÉES » ══════════════════════════════════════════════════════════════════
 * Ouverte par la tuile (qui ne se déploie plus) : tout ce que la tuile détaillait, et plus fin — chaque ligne, chaque affaire. Deux
 * présentations, « Par transaction » | « Par catégorie » (par défaut), le dernier choix retenu dans le navigateur. Lecture seule : un
 * observateur peut l'ouvrir. Les chiffres viennent de `detailCommissions` : le total = celui de la tuile, au centime, dans les deux modes.
 */

export type ModeFenetre = 'transaction' | 'categorie';
export const CLE_MODE_FENETRE = 'trx-commissions-versees-mode';
const lireMode = (): ModeFenetre => {
  try { return window.localStorage.getItem(CLE_MODE_FENETRE) === 'transaction' ? 'transaction' : 'categorie'; } catch { return 'categorie'; }
};
const ecrireMode = (m: ModeFenetre): void => {
  try { window.localStorage.setItem(CLE_MODE_FENETRE, m); } catch { /* préférence d'affichage seulement : la fenêtre marche sans */ }
};
const date = (d: string): string => d.split('-').reverse().join('/');

/** Un montant : HT en gras, TTC dessous (présentation du lot W) ; en rouge s'il est comptabilisé, en gris sinon. */
function Montant({ htC, ttcC, versee, donnees }: { htC: number; ttcC: number; versee: boolean; donnees?: Record<string, string> }) {
  return (
    <span className={versee ? 'trx-fc-montant trx-rouge' : 'trx-fc-montant trx-fc-info'} {...donnees}>
      <strong>{eur(htC / 100)} HT</strong><span>({eur(ttcC / 100)} TTC)</span>
    </span>
  );
}

export function FenetreCommissions({ detail, societe, autreSociete, titres, onFermer, onAller }: {
  detail: DetailCommissions;
  /** La société vue ; null : nos deux sociétés (CA global). */
  societe: Societe | null;
  /** Une vente porte un négociateur de l'autre société (la mention « rémunérés par elle — non comptés ici »). */
  autreSociete: boolean;
  /** Le titre d'une affaire, comme sur sa carte. */
  titres: Record<number, string>;
  onFermer: () => void;
  /** Le nom d'une affaire : la fenêtre se ferme et sa carte se déplie. */
  onAller: (id: number) => void;
}) {
  const [mode, setMode] = useState<ModeFenetre>(lireMode);
  const fermer = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    fermer.current?.focus();
    const touche = (e: KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onFermer]);
  const choisir = (m: ModeFenetre): void => { setMode(m); ecrireMode(m); };
  const qui = societe === null ? 'CRITERIMMO et MACJ' : LIBELLE_SOCIETE[societe];
  const affaire = (id: number): ReactNode => (
    <a className="trx-fc-affaire" href={`?vente=${id}`} onClick={(e) => { e.preventDefault(); onAller(id); }} data-aller-affaire={id}>{titres[id] ?? `Vente n° ${id}`}</a>
  );
  const ligneCategorie = (l: LigneCout, i: number) => (
    <li key={i} className="trx-fc-ligne" data-ligne-cout={l.cle}>
      <span className="trx-fc-quoi"><span data-qui>{l.qui}</span><span className="trx-fc-sep" aria-hidden="true"> · </span>{affaire(l.venteId)}</span>
      <Montant htC={l.htC} ttcC={l.ttcC} versee={estVersee(l.cle)} />
    </li>
  );
  const section = (c: CategorieCout, info: boolean) => (
    <section key={c.cle} className={info ? 'trx-fc-section trx-fc-section--info' : 'trx-fc-section'} data-categorie={c.cle} aria-label={c.libelle}>
      <div className="trx-fc-tete">
        <h3 className={c.cle === 'a-renseigner' ? 'trx-alerte' : undefined}>{c.libelle}</h3>
        <Montant htC={c.htC} ttcC={c.ttcC} versee={!info} donnees={{ 'data-sous-total': c.cle }} />
      </div>
      {c.lignes.length === 0 ? <p className="trx-fc-aucune" data-aucune={c.cle}>Aucune</p> : <ul className="trx-fc-lignes">{c.lignes.map(ligneCategorie)}</ul>}
    </section>
  );
  const bloc = (a: AffaireCout) => {
    const versees = a.lignes.filter((l) => estVersee(l.cle));
    const infos = a.lignes.filter((l) => !estVersee(l.cle));
    return (
      <section key={a.id} className="trx-fc-section" data-affaire={a.id} aria-label={titres[a.id] ?? a.libelle}>
        <div className="trx-fc-tete trx-fc-tete--affaire">
          <span className="trx-fc-titre-affaire">
            <h3>{affaire(a.id)}</h3>
            <span className={a.dateCompromis === null ? 'trx-fc-sous trx-a-renseigner' : 'trx-fc-sous'}>{a.dateCompromis === null ? 'Date du compromis : à renseigner' : `Compromis du ${date(a.dateCompromis)}`}{a.recueDe !== null ? ` · inter-cabinet reçu de ${LIBELLE_SOCIETE[a.recueDe]}` : ''}</span>
          </span>
          <span className="trx-fc-montant" data-commission-affaire={a.id}><strong>{eur(a.commissionHt)} HT</strong><span>({eur(a.commissionTtc)} TTC)</span><small>commission de la vente</small></span>
        </div>
        {a.lignes.length > 0 && (
          <ul className="trx-fc-lignes">
            {[...versees, ...infos].map((l, i) => (
              <li key={i} className={estVersee(l.cle) ? 'trx-fc-ligne' : 'trx-fc-ligne trx-fc-info'} data-ligne-cout={l.cle}>
                <span className="trx-fc-quoi"><span className="trx-fc-etiquette" data-etiquette>{ETIQUETTE[l.cle]}</span><span data-qui>{l.qui}</span></span>
                <Montant htC={l.htC} ttcC={l.ttcC} versee={estVersee(l.cle)} />
              </li>
            ))}
          </ul>
        )}
        {versees.length === 0
          ? <p className="trx-fc-aucune" data-aucune-versee={a.id}>Aucune commission versée</p>
          : <div className="trx-fc-sous-total"><span>Versé sur cette affaire</span><Montant htC={a.verseHtC} ttcC={a.verseTtcC} versee donnees={{ 'data-verse-affaire': String(a.id) }} /></div>}
      </section>
    );
  };
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="trx-fc-voile" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_FENETRE_COMMISSIONS}</style>
      <div className="trx-fc-modale" role="dialog" aria-modal="true" aria-labelledby="trx-fc-titre" data-fenetre-commissions>
        <div className="trx-fc-haut">
          <div className="trx-fc-entete">
            <div className="trx-fc-entete-texte">
              <h2 id="trx-fc-titre">Commissions versées — {qui} — compromis en cours</h2>
              <span className="trx-fc-montant trx-fc-montant--gauche trx-rouge" data-fenetre-total-haut><strong>{eur(detail.totalTtcC / 100)} TTC versées</strong><span>{eur(detail.totalHtC / 100)} HT</span></span>
            </div>
            <button type="button" className="trx-fc-fermer" ref={fermer} onClick={onFermer} aria-label="Fermer" data-fermer-fenetre>×</button>
          </div>
          <div className="trx-fc-modes" role="group" aria-label="Présentation">
            <button type="button" className="trx-unite" aria-pressed={mode === 'transaction'} onClick={() => choisir('transaction')} data-mode-fenetre="transaction">Par transaction</button>
            <button type="button" className="trx-unite" aria-pressed={mode === 'categorie'} onClick={() => choisir('categorie')} data-mode-fenetre="categorie">Par catégorie</button>
          </div>
        </div>
        <div className="trx-fc-corps" data-mode-actif={mode}>
          {mode === 'categorie' ? <>
            {detail.versees.map((c) => section(c, false))}
            <div className="trx-fc-a-part" data-non-deduits>
              {detail.infos.map((c) => section(c, true))}
              {autreSociete && <p className="trx-fc-mention" data-detail="autre-societe">Négociateurs de l’autre société : rémunérés par elle — non comptés ici</p>}
            </div>
          </> : <>
            {detail.affaires.length === 0 ? <p className="trx-fc-aucune" data-aucune-affaire>Aucun compromis en cours.</p> : detail.affaires.map(bloc)}
            {autreSociete && <p className="trx-fc-mention" data-detail="autre-societe">Négociateurs de l’autre société : rémunérés par elle — non comptés ici</p>}
          </>}
        </div>
        <div className="trx-fc-pied">
          <span>Total versé</span>
          <Montant htC={detail.totalHtC} ttcC={detail.totalTtcC} versee donnees={{ 'data-fenetre-total': '' }} />
        </div>
      </div>
    </div>,
    document.querySelector('.svv-adm-root') ?? document.body,
  );
}

export const CSS_FENETRE_COMMISSIONS = `
.trx-fc-voile{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:16px;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent)}
.trx-fc-modale{box-sizing:border-box;width:min(760px, 100%);max-height:min(92vh, calc(100dvh - 32px));display:flex;flex-direction:column;overflow:hidden;background:var(--color-svv-surface);color:var(--color-svv-ink);border-radius:16px;box-shadow:0 12px 40px color-mix(in srgb, var(--color-svv-ink) 28%, transparent)}
.trx-fc-haut{flex:0 0 auto;display:flex;flex-direction:column;gap:10px;padding:16px 20px 12px;border-bottom:1px solid var(--color-svv-line)}
.trx-fc-entete{display:flex;align-items:flex-start;gap:12px}
.trx-fc-entete-texte{flex:1 1 auto;min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px}
.trx-fc-entete h2{margin:0;font-size:1.1rem;font-weight:800;line-height:1.3;min-width:0;overflow-wrap:anywhere}
.trx-fc-fermer{appearance:none;flex:0 0 auto;width:44px;height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:1.5rem;line-height:1;cursor:pointer}
.trx-fc-fermer:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-fc-modes{display:inline-flex;align-self:flex-start;border:1px solid var(--color-svv-line-strong);border-radius:10px;overflow:hidden}
.trx-fc-modes .trx-unite{min-width:0}
.trx-fc-corps{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:12px;padding:14px 20px}
.trx-fc-section{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:12px}
.trx-fc-tete{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:baseline}
.trx-fc-tete h3{margin:0;font-size:.98rem;font-weight:800;min-width:0;overflow-wrap:anywhere}
.trx-fc-titre-affaire{display:flex;flex-direction:column;gap:2px;min-width:0}
.trx-fc-sous{font-size:.85rem;color:var(--color-svv-muted)}
.trx-fc-lignes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.trx-fc-ligne{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:baseline;padding:6px 0;border-top:1px solid var(--color-svv-line)}
.trx-fc-quoi{min-width:0;overflow-wrap:anywhere;display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 6px}
.trx-fc-sep{color:var(--color-svv-muted)}
.trx-fc-affaire{color:var(--color-svv-red);font-weight:700;text-decoration:underline;display:inline-flex;align-items:center;min-height:44px}
.trx-fc-etiquette{display:inline-block;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.02em;padding:2px 6px;border-radius:6px;border:1px solid var(--color-svv-line-strong);color:var(--color-svv-muted)}
.trx-fc-montant{display:flex;flex-direction:column;align-items:flex-end;text-align:right;white-space:nowrap}
.trx-fc-montant > span{font-size:.88rem}
.trx-fc-montant small{font-size:.75rem;color:var(--color-svv-muted)}
.trx-fc-montant--gauche{align-items:flex-start;text-align:left}
.trx-fc-info,.trx-fc-info .trx-fc-etiquette{color:var(--color-svv-muted)}
.trx-fc-aucune{margin:0;color:var(--color-svv-muted);font-style:italic}
.trx-fc-sous-total{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:baseline;padding-top:6px;border-top:1px solid var(--color-svv-line-strong);font-weight:700}
.trx-fc-a-part{display:flex;flex-direction:column;gap:12px;margin-top:4px;padding-top:12px;border-top:2px dashed var(--color-svv-line-strong)}
.trx-fc-section--info{background:var(--color-svv-field);color:var(--color-svv-muted)}
.trx-fc-section--info h3{color:var(--color-svv-muted)}
.trx-fc-section--info h3.trx-alerte{color:var(--color-svv-red)}
.trx-fc-mention{margin:0;color:var(--color-svv-muted);font-size:.9rem}
.trx-fc-pied{flex:0 0 auto;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:baseline;padding:12px 20px 16px;border-top:1px solid var(--color-svv-line-strong);font-weight:800}
@media (max-width:640px){
  .trx-fc-voile{padding:0;align-items:stretch}
  .trx-fc-modale{width:100%;max-height:none;height:100dvh;border-radius:0}
  .trx-fc-haut,.trx-fc-corps{padding-left:16px;padding-right:16px}
  .trx-fc-pied{padding-left:16px;padding-right:16px}
  .trx-fc-modes{align-self:stretch}
  .trx-fc-modes .trx-unite{flex:1 1 0}
}
`;
