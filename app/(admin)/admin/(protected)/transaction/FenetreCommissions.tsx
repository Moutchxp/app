'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { dossiersConcernes, ETIQUETTE, estVersee, type AffaireCout, type AffaireSolde, type CategorieCout, type DetailCommissions, type DetailSolde,
  type LigneCout, type SectionCa } from '../../../../lib/transaction/detailCommissions';
import { LIBELLE_SOCIETE, type Societe } from '../../../../lib/transaction/modele';
import { ESPACE, eur, MOT_UNITE, useAffichage, type UniteAffichage } from './commun';

/**
 * ══ 🔴 LOT AL (Arno, 29/10/2026) — LA FENÊTRE « COMMISSIONS VERSÉES » ══════════════════════════════════════════════════════════════════
 * Ouverte par la tuile (qui ne se déploie plus) : tout ce que la tuile détaillait, et plus fin — chaque ligne, chaque affaire. Deux
 * présentations, « Par transaction » | « Par catégorie » (par défaut), le dernier choix retenu dans le navigateur. Lecture seule : un
 * observateur peut l'ouvrir. Les chiffres viennent de `detailCommissions` : le total = celui de la tuile, au centime, dans les deux modes.
 * 🔴 LOT AN — « N dossiers concernés » sous le total ; « Par transaction » ne montre que les affaires avec au moins une commission versée (les
 * blocs « Aucune commission versée » sont retirés, accord d'Arno). La même coque sert la fenêtre « Solde net » (`FenetreSolde`, lot AO).
 */

export type ModeFenetre = 'transaction' | 'categorie';
export const CLE_MODE_FENETRE = 'trx-commissions-versees-mode';
/** 🔴 LOT AO — le choix de la fenêtre « Solde net », retenu séparément. */
export const CLE_MODE_FENETRE_SOLDE = 'trx-solde-net-mode';
const lireMode = (cle: string): ModeFenetre => {
  try { return window.localStorage.getItem(cle) === 'transaction' ? 'transaction' : 'categorie'; } catch { return 'categorie'; }
};
const ecrireMode = (cle: string, m: ModeFenetre): void => {
  try { window.localStorage.setItem(cle, m); } catch { /* préférence d'affichage seulement : la fenêtre marche sans */ }
};
const date = (d: string): string => d.split('-').reverse().join('/');
/** « 1 dossier », « 3 dossiers » (+ « concerné(s) »). PUR. */
export const motDossiers = (n: number, concernes: boolean): string => `${n} dossier${n > 1 ? 's' : ''}${concernes ? ` concerné${n > 1 ? 's' : ''}` : ''}`;

/** Les deux textes d'un montant en centimes, dans l'ordre affiché (🔴 LOT AM : l'unité choisie d'abord). PUR. */
const textes = (u: UniteAffichage, htC: number, ttcC: number): [string, string] => {
  const t = (x: UniteAffichage): string => `${eur((x === 'ttc' ? ttcC : htC) / 100)}${ESPACE}${MOT_UNITE[x]}`;
  return u === 'ttc' ? [t('ttc'), t('ht')] : [t('ht'), t('ttc')];
};

/**
 * Un montant : l'unité choisie (« HT | TTC » de l'onglet, lot AM) en gras, l'autre dessous entre parenthèses (présentation du lot W) ;
 * en rouge s'il est comptabilisé (versé), en vert la commission d'une vente (CA), en gris sinon.
 */
function Montant({ htC, ttcC, versee, recu = false, donnees, apres }: { htC: number; ttcC: number; versee: boolean; recu?: boolean; donnees?: Record<string, string>; apres?: ReactNode }) {
  const [grand, petit] = textes(useAffichage(), htC, ttcC);
  return (
    <span className={versee ? 'trx-fc-montant trx-rouge' : recu ? 'trx-fc-montant trx-vert' : 'trx-fc-montant trx-fc-info'} {...donnees}>
      <strong>{grand}</strong><span className="trx-mt-petit">({petit})</span>{apres}
    </span>
  );
}

/**
 * 🔴 LOT AN — LA COQUE D'UNE FENÊTRE DE DÉTAIL : titre, total (grand / petit selon « HT | TTC »), « N dossiers », le choix « Par transaction |
 * Par catégorie » (retenu sous `cleMode`), le corps défilant, le pied ; fermeture par la croix, Échap ou un clic hors de la fenêtre.
 */
function CoqueFenetre({ titre, donnee, totalHtC, totalTtcC, sens, motTotal, dossiers, cleMode, corps, pied, onFermer }: {
  titre: string; donnee: string; totalHtC: number; totalTtcC: number; sens: 'verse' | 'recu'; motTotal?: string; dossiers: string; cleMode: string;
  corps: (mode: ModeFenetre) => ReactNode; pied: ReactNode; onFermer: () => void;
}) {
  const [mode, setMode] = useState<ModeFenetre>(() => lireMode(cleMode));
  const fermer = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    fermer.current?.focus();
    const touche = (e: KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onFermer]);
  const choisir = (m: ModeFenetre): void => { setMode(m); ecrireMode(cleMode, m); };
  const totalHaut = textes(useAffichage(), totalHtC, totalTtcC);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="trx-fc-voile" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_FENETRE_COMMISSIONS}</style>
      <div className="trx-fc-modale" role="dialog" aria-modal="true" aria-labelledby={`${donnee}-titre`} {...{ [`data-${donnee}`]: '' }}>
        <div className="trx-fc-haut">
          <div className="trx-fc-entete">
            <div className="trx-fc-entete-texte">
              <h2 id={`${donnee}-titre`}>{titre}</h2>
              <span className={`trx-fc-montant trx-fc-montant--gauche ${sens === 'verse' ? 'trx-rouge' : 'trx-vert'}`} data-fenetre-total-haut>
                <strong>{totalHaut[0]}{motTotal === undefined ? '' : ` ${motTotal}`}</strong><span className="trx-mt-petit">({totalHaut[1]})</span></span>
            </div>
            <button type="button" className="trx-fc-fermer" ref={fermer} onClick={onFermer} aria-label="Fermer" data-fermer-fenetre>×</button>
          </div>
          <p className="trx-fc-dossiers" data-dossiers>{dossiers}</p>
          <div className="trx-fc-modes" role="group" aria-label="Présentation">
            <button type="button" className="trx-unite" aria-pressed={mode === 'transaction'} onClick={() => choisir('transaction')} data-mode-fenetre="transaction">Par transaction</button>
            <button type="button" className="trx-unite" aria-pressed={mode === 'categorie'} onClick={() => choisir('categorie')} data-mode-fenetre="categorie">Par catégorie</button>
          </div>
        </div>
        <div className="trx-fc-corps" data-mode-actif={mode}>{corps(mode)}</div>
        <div className="trx-fc-pied trx-somme--finale" data-pied-fenetre>{pied}</div>
      </div>
    </div>,
    document.querySelector('.svv-adm-root') ?? document.body,
  );
}

/** Le nom d'une affaire : un lien qui ferme la fenêtre et déplie sa carte. */
function lienAffaire(titres: Record<number, string>, onAller: (id: number) => void): (id: number) => ReactNode {
  return function lien(id: number): ReactNode {
    return <a className="trx-fc-affaire" href={`?vente=${id}`} onClick={(e) => { e.preventDefault(); onAller(id); }} data-aller-affaire={id}>{titres[id] ?? `Vente n° ${id}`}</a>;
  };
}
const sousTitre = (d: string | null, recueDe: Societe | null): ReactNode => (
  <span className={d === null ? 'trx-fc-sous trx-a-renseigner' : 'trx-fc-sous'}>{d === null ? 'Date du compromis : à renseigner' : `Compromis du ${date(d)}`}{recueDe !== null ? ` · inter-cabinet reçu de ${LIBELLE_SOCIETE[recueDe]}` : ''}</span>
);

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
  const qui = societe === null ? 'CRITERIMMO et MACJ' : LIBELLE_SOCIETE[societe];
  const affaire = lienAffaire(titres, onAller);
  const concernees = dossiersConcernes(detail);
  const ligneCategorie = (l: LigneCout, i: number) => (
    <li key={i} className="trx-fc-ligne" data-ligne-cout={l.cle}>
      <span className="trx-fc-quoi"><span data-qui>{l.qui}</span><span className="trx-fc-sep" aria-hidden="true"> · </span>{affaire(l.venteId)}</span>
      <Montant htC={l.htC} ttcC={l.ttcC} versee={estVersee(l.cle)} />
    </li>
  );
  const section = (c: CategorieCout, info: boolean) => (
    <section key={c.cle} className={info ? 'trx-fc-section trx-fc-section--info' : 'trx-fc-section'} data-categorie={c.cle} aria-label={c.libelle}>
      <div className={info ? 'trx-fc-tete' : 'trx-fc-tete trx-somme'}>
        <h3 className={c.cle === 'a-renseigner' ? 'trx-alerte' : undefined}>{c.libelle}</h3>
        <Montant htC={c.htC} ttcC={c.ttcC} versee={!info} donnees={{ 'data-sous-total': c.cle }} />
      </div>
      {c.lignes.length === 0 ? <p className="trx-fc-aucune" data-aucune={c.cle}>Aucune</p> : <ul className="trx-fc-lignes">{c.lignes.map(ligneCategorie)}</ul>}
    </section>
  );
  // LOT AN — seules les affaires avec au moins une commission versée (leurs internes non déduits restent montrés, en gris).
  const bloc = (a: AffaireCout) => {
    const versees = a.lignes.filter((l) => estVersee(l.cle));
    const infos = a.lignes.filter((l) => !estVersee(l.cle));
    return (
      <section key={a.id} className="trx-fc-section" data-affaire={a.id} aria-label={titres[a.id] ?? a.libelle}>
        <div className="trx-fc-tete trx-fc-tete--affaire">
          <span className="trx-fc-titre-affaire"><h3>{affaire(a.id)}</h3>{sousTitre(a.dateCompromis, a.recueDe)}</span>
          <Montant htC={Math.round(a.commissionHt * 100)} ttcC={Math.round(a.commissionTtc * 100)} versee={false} recu donnees={{ 'data-commission-affaire': String(a.id) }} apres={<small>commission de la vente</small>} />
        </div>
        <ul className="trx-fc-lignes">
          {[...versees, ...infos].map((l, i) => (
            <li key={i} className={estVersee(l.cle) ? 'trx-fc-ligne' : 'trx-fc-ligne trx-fc-info'} data-ligne-cout={l.cle}>
              <span className="trx-fc-quoi"><span className="trx-fc-etiquette" data-etiquette>{ETIQUETTE[l.cle]}</span><span data-qui>{l.qui}</span></span>
              <Montant htC={l.htC} ttcC={l.ttcC} versee={estVersee(l.cle)} />
            </li>
          ))}
        </ul>
        <div className="trx-fc-sous-total trx-somme"><span>Versé sur cette affaire</span><Montant htC={a.verseHtC} ttcC={a.verseTtcC} versee donnees={{ 'data-verse-affaire': String(a.id) }} /></div>
      </section>
    );
  };
  const mention = autreSociete && <p className="trx-fc-mention" data-detail="autre-societe">Négociateurs de l’autre société : rémunérés par elle — non comptés ici</p>;
  return (
    <CoqueFenetre titre={`Commissions versées — ${qui} — compromis en cours`} donnee="fenetre-commissions" totalHtC={detail.totalHtC} totalTtcC={detail.totalTtcC} sens="verse" motTotal="versées"
      dossiers={motDossiers(concernees.length, true)} cleMode={CLE_MODE_FENETRE} onFermer={onFermer}
      pied={<><span>Total versé</span><Montant htC={detail.totalHtC} ttcC={detail.totalTtcC} versee donnees={{ 'data-fenetre-total': '' }} /></>}
      corps={(mode) => (mode === 'categorie' ? <>
        {detail.versees.map((c) => section(c, false))}
        <div className="trx-fc-a-part" data-non-deduits>
          {detail.infos.map((c) => section(c, true))}
          {mention}
        </div>
      </> : <>
        {concernees.length === 0 ? <p className="trx-fc-aucune" data-aucune-affaire>Aucun dossier concerné.</p> : concernees.map(bloc)}
        {mention}
      </>)} />
  );
}

/**
 * 🔴 LOT AO (Arno) — LA FENÊTRE « SOLDE NET » (ouverte par sa tuile) : le Chiffre d'affaires (= la tuile CA), chaque catégorie de commissions
 * versées (les MÊMES objets que la fenêtre « Commissions versées » : aucune copie de calcul), puis « = Solde net » (= la tuile) ; à part, en
 * gris, les internes non déduits. Ou une affaire par bloc : son CA, ses commissions versées, son solde. CA − sous-totaux = solde, au centime.
 * (La fenêtre « Chiffre d'affaires » du lot AN est retirée, accord d'Arno : son contenu utile est ici.)
 */
export function FenetreSolde({ detail, societe, autreSociete, titres, onFermer, onAller }: {
  detail: DetailSolde; societe: Societe | null; autreSociete: boolean; titres: Record<number, string>; onFermer: () => void; onAller: (id: number) => void;
}) {
  const qui = societe === null ? 'CRITERIMMO et MACJ' : LIBELLE_SOCIETE[societe];
  const affaire = lienAffaire(titres, onAller);
  const { ca, couts } = detail;
  const u = useAffichage();
  // « dont ventes portées » et « dont reçu en inter-cabinet de … » : les sections du CA qui y comptent (non vides, ou la seule de la société vue).
  const dont = ca.sections.filter((c) => c.compte && (c.lignes.length > 0 || c.cle === `portee-${societe}`));
  const motDont = (c: SectionCa): string => (c.cle.startsWith('recu-') ? `dont reçu en inter-cabinet de ${LIBELLE_SOCIETE[c.cle.slice('recu-'.length) as Societe]}`
    : societe === null ? `dont ventes portées par ${LIBELLE_SOCIETE[c.cle.slice('portee-'.length) as Societe]}` : 'dont ventes portées');
  const categorie = (c: CategorieCout) => (
    <section key={c.cle} className="trx-fc-section" data-categorie-solde={c.cle} aria-label={c.libelle}>
      <div className="trx-fc-tete trx-somme">
        <h3>− {c.libelle}</h3>
        {c.lignes.length === 0
          ? <span className="trx-fc-montant trx-fc-info" data-aucun-solde={c.cle}><span>Aucun</span><strong>{eur(0)}</strong></span>
          : <Montant htC={c.htC} ttcC={c.ttcC} versee donnees={{ 'data-sous-total-solde': c.cle }} />}
      </div>
      {c.lignes.length > 0 && <ul className="trx-fc-lignes">{c.lignes.map((l, i) => (
        <li key={i} className="trx-fc-ligne" data-ligne-solde={l.cle}>
          <span className="trx-fc-quoi"><span data-qui>{l.qui}</span><span className="trx-fc-sep" aria-hidden="true"> · </span>{affaire(l.venteId)}</span>
          <Montant htC={l.htC} ttcC={l.ttcC} versee />
        </li>))}</ul>}
    </section>
  );
  const info = (c: CategorieCout) => (
    <section key={c.cle} className="trx-fc-section trx-fc-section--info" data-info-solde={c.cle} aria-label={c.libelle}>
      <div className="trx-fc-tete"><h3 className={c.cle === 'a-renseigner' ? 'trx-alerte' : undefined}>{c.libelle}</h3><Montant htC={c.htC} ttcC={c.ttcC} versee={false} /></div>
      {c.lignes.length === 0 ? <p className="trx-fc-aucune">Aucun</p> : <ul className="trx-fc-lignes">{c.lignes.map((l, i) => (
        <li key={i} className="trx-fc-ligne"><span className="trx-fc-quoi"><span data-qui>{l.qui}</span><span className="trx-fc-sep" aria-hidden="true"> · </span>{affaire(l.venteId)}</span>
          <Montant htC={l.htC} ttcC={l.ttcC} versee={false} /></li>))}</ul>}
    </section>
  );
  const mention = autreSociete && <p className="trx-fc-mention" data-detail="autre-societe">Négociateurs de l’autre société : rémunérés par elle — non comptés ici</p>;
  const total = <><span>= Solde net de {qui}</span><Montant htC={detail.totalHtC} ttcC={detail.totalTtcC} versee={false} recu donnees={{ 'data-fenetre-total': '' }} /></>;
  const bloc = (a: AffaireSolde) => (
    <section key={a.id} className="trx-fc-section" data-affaire-solde={a.id} aria-label={titres[a.id] ?? a.libelle}>
      <div className="trx-fc-tete trx-fc-tete--affaire">
        <span className="trx-fc-titre-affaire"><h3>{affaire(a.id)}</h3>{sousTitre(a.dateCompromis, a.recueDe)}</span>
      </div>
      <ul className="trx-fc-lignes">
        <li className="trx-fc-ligne" data-ca-affaire-solde={a.id}><span className="trx-fc-quoi">CA de {qui} sur cette affaire</span><Montant htC={a.caHtC} ttcC={a.caTtcC} versee={false} recu /></li>
        {a.couts.map((l, i) => (
          <li key={i} className="trx-fc-ligne" data-ligne-solde={l.cle}>
            <span className="trx-fc-quoi"><span className="trx-fc-etiquette trx-rouge" data-etiquette>{ETIQUETTE[l.cle]}</span><span data-qui>{l.qui}</span></span>
            <Montant htC={l.htC} ttcC={l.ttcC} versee />
          </li>))}
      </ul>
      <div className="trx-fc-sous-total trx-somme"><span>= Solde net de l’affaire</span><Montant htC={a.soldeHtC} ttcC={a.soldeTtcC} versee={false} recu donnees={{ 'data-solde-affaire': String(a.id) }} /></div>
    </section>
  );
  return (
    <CoqueFenetre titre={`Solde net — ${qui} — compromis en cours`} donnee="fenetre-solde" totalHtC={detail.totalHtC} totalTtcC={detail.totalTtcC} sens="recu"
      dossiers={motDossiers(detail.affaires.length, false)} cleMode={CLE_MODE_FENETRE_SOLDE} onFermer={onFermer} pied={total}
      corps={(mode) => (mode === 'categorie' ? <>
        {/* La ligne de la tuile, passée ici (lot AO) : ce que le solde mesure. */}
        <p className="trx-fc-mention" data-solde-explication>CA {MOT_UNITE[u]} − commissions versées {MOT_UNITE[u]}</p>
        <section className="trx-fc-section" data-solde-ca aria-label={`Chiffre d’affaires de ${qui}`}>
          <div className="trx-fc-tete trx-somme"><h3>Chiffre d’affaires de {qui}</h3><Montant htC={ca.totalHtC} ttcC={ca.totalTtcC} versee={false} recu donnees={{ 'data-ca-solde': '' }} /></div>
          <ul className="trx-fc-lignes">{dont.map((c) => (
            <li key={c.cle} className="trx-fc-ligne trx-fc-info" data-solde-dont={c.cle}><span className="trx-fc-quoi">{motDont(c)}</span><Montant htC={c.htC} ttcC={c.ttcC} versee={false} /></li>))}</ul>
          {/* Nos deux sociétés : le CA de chacune, sa part reçue comprise (ce que disait la tuile « Chiffre d'affaires »). */}
          {ca.parSociete !== null && (
            <p className="trx-fc-mention" data-ca-par-societe>{(['criterimmo', 'macj'] as const).map((x) => <span key={x} data-ca-societe={x}>CA {LIBELLE_SOCIETE[x]} : {textes(u, ca.parSociete![x].htC, ca.parSociete![x].ttcC).join(' (')})</span>)
              .flatMap((x, i) => (i === 0 ? [x] : [<span key={`sep-${i}`} aria-hidden="true">{' · '}</span>, x]))} — part reçue comprise</p>)}
        </section>
        {couts.versees.map(categorie)}
        <div className="trx-fc-total-ca trx-somme--finale" data-total-solde>{total}</div>
        <div className="trx-fc-a-part" data-non-deduits>
          {couts.infos.map(info)}
          {mention}
        </div>
      </> : <>
        <p className="trx-fc-mention" data-solde-explication>CA {MOT_UNITE[u]} − commissions versées {MOT_UNITE[u]}</p>
        {detail.affaires.length === 0 ? <p className="trx-fc-aucune" data-aucune-affaire>Aucun compromis en cours.</p> : detail.affaires.map(bloc)}
        {mention}
      </>)} />
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
.trx-fc-tete.trx-somme{margin:-4px -6px 0;padding:6px}
.trx-fc-sous-total.trx-somme{padding:6px;border-top:0;margin:4px -6px -4px}
.trx-fc-total-ca.trx-somme--finale{border-radius:10px}
.trx-fc-sous-total{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:baseline;padding-top:6px;border-top:1px solid var(--color-svv-line-strong);font-weight:700}
.trx-fc-a-part{display:flex;flex-direction:column;gap:12px;margin-top:4px;padding-top:12px;border-top:2px dashed var(--color-svv-line-strong)}
.trx-fc-section--info{background:var(--color-svv-field);color:var(--color-svv-muted)}
.trx-fc-section--info h3{color:var(--color-svv-muted)}
.trx-fc-section--info h3.trx-alerte{color:var(--color-svv-red)}
.trx-fc-mention{margin:0;color:var(--color-svv-muted);font-size:.9rem}
.trx-fc-dossiers{margin:0;font-size:.92rem;font-weight:700;color:var(--color-svv-muted)}
.trx-fc-total-ca{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:baseline;padding:10px 12px;border-top:2px solid var(--color-svv-line-strong);font-weight:800}
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
