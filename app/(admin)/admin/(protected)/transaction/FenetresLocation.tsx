'use client';

import type { ReactNode } from 'react';
import { NOMS_MOIS } from '../../../../lib/transaction/modele';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import { detailCoutsLocation, moinsC, parDateDecroissante, plusC, titreBail, totauxLocation, variableNegociateur, type CoutsLocation, type LigneLocationCa } from '../../../../lib/transaction/locationCa';
import type { MoisChoisi } from '../../../../lib/transaction/periodeMois';
import { classeSens, ESPACE, eur, MOT_UNITE, useAffichage } from './commun';
import { CategorieRepliable, CoqueFenetre, Montant } from './FenetreCommissions';

/**
 * ══ 🔴 LOT LO6 (Arno, 01/11/2026) — « SUIVI CHIFFRE D'AFFAIRES › LOCATION » : LES FENÊTRES DES TUILES 3 ET 4 ═══════════════════════════════════
 * Les fenêtres « Commissions versées » / « Solde net » de la Transaction vente (lots AL, AO) : la même coque (`CoqueFenetre` : croix, Échap, clic
 * hors de la fenêtre, plein écran défilant au téléphone, « Par bail | Par catégorie » retenu dans le navigateur), le même `Montant` (« HT | TTC »,
 * coûts en rouge, gris à 0). LECTURE SEULE (un observateur les ouvre). Aucun calcul : les montants des lignes (`montantsLigne`, lot LO5) et les
 * totaux des tuiles (`totauxLocation` → `sommesLocation`) ; le total de chaque fenêtre = sa tuile, au centime.
 * Le nom d'un bail : la fenêtre se ferme et sa carte se déplie dans « Les baux ».
 */
export const CLE_MODE_COUTS_LOCATION = 'trx-location-couts-mode';
export const CLE_MODE_NET_LOCATION = 'trx-location-net-mode';

/** « 1 bail », « 3 baux » (+ « concerné(s) »). PUR. */
export const motBaux = (n: number, concernes: boolean): string => `${n} ba${n > 1 ? 'ux' : 'il'}${concernes ? ` concerné${n > 1 ? 's' : ''}` : ''}`;
const dateFr = (iso: string): string => iso.split('-').reverse().join('/');
const signe = (l: LigneLocationCa): string => (l.dateSupposee ? `Signé en ${NOMS_MOIS[l.mois - 1].toLowerCase()} ${l.annee}` : `Signé le ${dateFr(l.date)}`);

/** Un petit montant dans l'unité choisie (les baux d'un apporteur, sous son cumul). */
function MontantPetit({ m, donnees }: { m: MontantC; donnees?: Record<string, string> }) {
  const u = useAffichage();
  return <span className={`trx-fl-petit-montant ${classeSens('verse', m.htC, m.ttcC)}`} {...donnees}>{eur((u === 'ht' ? m.htC : m.ttcC) / 100)}{ESPACE}{MOT_UNITE[u]}</span>;
}
/** Une catégorie vide : « Aucune », à 0 (gris). */
const aucune = (cle: string): ReactNode => <p className="trx-fc-aucune" data-aucune={cle}>Aucune</p>;

export function useLienBail(onAller: (id: number) => void): (l: LigneLocationCa) => ReactNode {
  return function lien(l: LigneLocationCa): ReactNode {
    return <a className="trx-fc-affaire" href={`#bail-${l.id}`} onClick={(e) => { e.preventDefault(); onAller(l.id); }} data-aller-bail={l.id}>{titreBail(l)}</a>;
  };
}
const sep = <span className="trx-fc-sep" aria-hidden="true"> · </span>;

/** La catégorie « Primes de nouvelle gestion » : le sous-total en rouge, puis un bail par ligne (bien · locataire · négociateur · montant). */
export function SectionPrimes({ lignes, total, lien, moins, ouverte = false, inclus, dont = false, apres = null }: { lignes: readonly LigneLocationCa[]; total: MontantC; lien: (l: LigneLocationCa) => ReactNode; moins: boolean; ouverte?: boolean;
  /** 🔴 LOT LO11 — la prime d'un mois avec salaires chargés : montrée en gris, « inclus dans les salaires », non comptée dans le sous-total. */
  inclus?: (l: LigneLocationCa) => boolean;
  /**
   * 🔴 Arno (02/11/2026) — sous le « Variable du négociateur (primes incluses) » : « dont primes de nouvelle gestion », en retrait, SANS « − » et
   * non comptée (le variable la contient déjà) ; rien n'est retiré, la somme des lignes « − » tombe sur le total.
   */
  dont?: boolean; apres?: ReactNode }) {
  const verse = !dont;
  return (
    // 🔴 LOT LG3 — fermée à l'ouverture de la fenêtre : le nom et le sous-total ; un clic montre les baux
    <CategorieRepliable cle="primes" classe={dont ? 'trx-fc-section trx-fc-dont' : undefined}
      donnees={{ 'data-categorie-location': 'primes', 'aria-label': dont ? 'dont primes de nouvelle gestion' : 'Primes de nouvelle gestion', ...(dont ? { 'data-dont-primes': '' } : {}) }}
      titre={<>{dont ? 'dont primes de nouvelle gestion (sans TVA)' : <>{moins ? '− ' : ''}Primes de nouvelle gestion (sans TVA)</>}{apres}</>}
      montant={<Montant htC={total.htC} ttcC={total.ttcC} versee={verse} donnees={{ 'data-sous-total-location': 'primes' }} />} ouverteInitiale={ouverte}>
      {lignes.length === 0 ? aucune('primes') : <ul className="trx-fc-lignes">{lignes.map((l) => (
        <li key={l.id} className={inclus?.(l) ? 'trx-fc-ligne trx-fc-info' : 'trx-fc-ligne'} data-ligne-prime={l.id}>
          <span className="trx-fc-quoi">{lien(l)}{sep}<span data-locataire>{l.locataire || 'locataire à renseigner'}</span>{sep}<span data-nego>{l.negociateur.nom}</span>
            {inclus?.(l) && <small className="trx-fc-sous" data-inclus-salaires> — inclus dans les salaires</small>}</span>
          <Montant htC={l.primeC.htC} ttcC={l.primeC.ttcC} versee={verse && !inclus?.(l)} />
        </li>))}</ul>}
    </CategorieRepliable>
  );
}

/** La catégorie « Commissions d'apporteurs » : le sous-total en rouge, puis un apporteur par ligne (son cumul ; dessous, en petit, ses baux). */
export function SectionApporteurs({ lignes, total, lien, moins, ouverte = false }: { lignes: readonly LigneLocationCa[]; total: MontantC; lien: (l: LigneLocationCa) => ReactNode; moins: boolean; ouverte?: boolean }) {
  const groupes = detailCoutsLocation(lignes).groupesApporteurs;
  return (
    <CategorieRepliable cle="apporteurs" donnees={{ 'data-categorie-location': 'apporteurs', 'aria-label': 'Commissions d’apporteurs' }} titre={<>{moins ? '− ' : ''}Commissions d’apporteurs (sans TVA pour les particuliers)</>}
      montant={<Montant htC={total.htC} ttcC={total.ttcC} versee donnees={{ 'data-sous-total-location': 'apporteurs' }} />} ouverteInitiale={ouverte}>
      {groupes.length === 0 ? aucune('apporteurs') : <ul className="trx-fc-lignes">{groupes.map((g) => (
        <li key={g.nom} className="trx-fc-ligne" data-groupe-apporteur={g.nom}>
          <span className="trx-fc-quoi"><strong data-qui>{g.nom}</strong><small className="trx-fc-sous">{motBaux(g.lignes.length, false)}</small>
            <ul className="trx-fl-sous-lignes">{g.lignes.map((l) => (
              <li key={l.id} data-bail-apporteur={l.id}>{lien(l)}{sep}<MontantPetit m={l.apporteurC} /></li>))}</ul></span>
          <Montant htC={g.total.htC} ttcC={g.total.ttcC} versee donnees={{ 'data-cumul-apporteur': g.nom }} />
        </li>))}</ul>}
    </CategorieRepliable>
  );
}

/** L'en-tête d'un bloc « Par bail » : le nom du bail (lien), sa date ; à droite, son CA. */
function TeteBail({ l, lien }: { l: LigneLocationCa; lien: (l: LigneLocationCa) => ReactNode }) {
  return (
    <div className="trx-fc-tete trx-fc-tete--affaire">
      <span className="trx-fc-titre-affaire"><h3>{lien(l)}</h3><span className="trx-fc-sous" data-signe>{signe(l)}</span></span>
      <Montant htC={l.caC.htC} ttcC={l.caC.ttcC} versee={false} recu donnees={{ 'data-ca-bail': String(l.id) }} apres={<small>CA du bail</small>} />
    </div>
  );
}

/**
 * 🔴 LOT LO11 — les coûts de la période, mois par mois, à la règle d'Arno (`coutsLocation`) : `total` (la tuile) et chaque mois (ses salaires, ses
 * rétrocessions). Un mois avec salaires chargés : ses primes et son variable sont montrés, « inclus dans les salaires », non déduits.
 */
export interface CoutsFenetre { total: CoutsLocation; mois: readonly { m: MoisChoisi; c: CoutsLocation }[];
  /** 🔴 LOT LO12 — « Sans salaires » : les salaires saisis montrés en gris, « non comptés » (non déduits) ; titres « hors salaires ». */
  sans?: boolean }
const hors = (couts: CoutsFenetre): string => (couts.sans ? ' hors salaires' : '');
const moisFr = (m: MoisChoisi): string => `${NOMS_MOIS[m.mois - 1]} ${m.annee}`;
const nonNul = (m: MontantC): boolean => m.htC !== 0 || m.ttcC !== 0;
/** Le mois d'une ligne a-t-il des salaires chargés saisis ? */
const avecSalaires = (couts: CoutsFenetre) => (l: LigneLocationCa): boolean => couts.mois.some((x) => x.m.annee === l.annee && x.m.mois === l.mois && x.c.moisAvecSalaires > 0);
const inclusMot = (tout: MontantC, deduit: MontantC, en: (m: MontantC) => string): ReactNode => (tout.htC === deduit.htC ? null
  : <small className="trx-fc-sous" data-inclus-salaires> — dont {en(moinsC(tout, deduit))} inclus dans les salaires</small>);

/**
 * 🔴 Arno (02/11/2026) — le variable d'un bail, montré avec sa prime de gestion (`variableNegociateur`), comme UNE ligne de coût ; la prime suit,
 * en sous-ligne « dont », sans « − » et non comptée : le « Versé » et le « CA net » du bail sont la somme exacte des lignes comptées.
 */
const variableDuBail = (l: LigneLocationCa): MontantC => variableNegociateur(l.variableC, l.primeC);
const ligneDontPrime = (l: LigneLocationCa, inc: boolean): ReactNode => (!nonNul(l.primeC) ? null
  : <li className="trx-fc-ligne trx-fc-info trx-fc-dont" data-cout-bail="prime" data-dont-prime>
    <span className="trx-fc-quoi"><span className="trx-fc-etiquette" data-etiquette>dont prime</span><span data-qui>{l.negociateur.nom}</span>
      {inc && <small className="trx-fc-sous" data-inclus-salaires> — inclus dans les salaires</small>}</span>
    <Montant htC={l.primeC.htC} ttcC={l.primeC.ttcC} versee={false} /></li>);

/** Les catégories « Variable du négociateur » et « Salaires chargés » : un mois par ligne. */
function SectionsVariableSalaires({ couts, moins, primes }: { couts: CoutsFenetre; moins: boolean;
  /** 🔴 Arno (02/11/2026) — la sous-ligne « dont primes de nouvelle gestion », posée juste sous le variable qui les contient. */
  primes: ReactNode }) {
  const u = useAffichage();
  const en = (m: MontantC): string => `${eur((u === 'ht' ? m.htC : m.ttcC) / 100)}${ESPACE}${MOT_UNITE[u]}`;
  const t = couts.total;
  // 🔴 Arno (02/11/2026) — le variable, primes de gestion incluses : la seule ligne qui les compte ; elles suivent en « dont »
  const vTout = variableNegociateur(t.variable, t.primes); const vDeduit = variableNegociateur(t.variableDeduit, t.primesDeduites);
  const moisV = couts.mois.filter((x) => nonNul(variableNegociateur(x.c.variable, x.c.primes)));
  const moisS = couts.mois.filter((x) => x.c.moisAvecSalaires > 0);
  const moisSaisis = couts.mois.filter((x) => x.c.moisSaisis > 0);
  return <>
    <CategorieRepliable cle="variable" donnees={{ 'data-categorie-location': 'variable', 'aria-label': 'Variable du négociateur' }}
      titre={<>{moins ? '− ' : ''}Variable du négociateur (sans TVA, primes incluses){inclusMot(vTout, vDeduit, en)}</>}
      montant={<Montant htC={vDeduit.htC} ttcC={vDeduit.ttcC} versee donnees={{ 'data-sous-total-location': 'variable' }} />}>
      {moisV.length === 0 ? aucune('variable') : <ul className="trx-fc-lignes">{moisV.map(({ m, c }) => (
        <li key={`${m.annee}-${m.mois}`} className={c.moisAvecSalaires > 0 ? 'trx-fc-ligne trx-fc-info' : 'trx-fc-ligne'} data-ligne-variable={`${m.annee}-${m.mois}`}>
          <span className="trx-fc-quoi">{moisFr(m)}{c.moisAvecSalaires > 0 && <small className="trx-fc-sous" data-inclus-salaires> — inclus dans les salaires</small>}</span>
          <Montant htC={variableNegociateur(c.variable, c.primes).htC} ttcC={variableNegociateur(c.variable, c.primes).ttcC} versee={c.moisAvecSalaires === 0} /></li>))}</ul>}
    </CategorieRepliable>
    {primes}
    {couts.sans ? <CategorieRepliable cle="salaires" donnees={{ 'data-categorie-location': 'salaires', 'aria-label': 'Salaires chargés — non comptés' }}
      titre={<span className="loc-muet">Salaires chargés (sans TVA) — non comptés</span>}
      montant={<span className="loc-muet" data-sous-total-location="salaires-non-comptes">{en(t.salairesSaisis)}</span>}>
      {moisSaisis.length === 0 ? <p className="trx-fc-aucune" data-aucune="salaires">Aucun mois saisi</p> : <ul className="trx-fc-lignes">{moisSaisis.map(({ m, c }) => (
        <li key={`${m.annee}-${m.mois}`} className="trx-fc-ligne trx-fc-info" data-ligne-salaires={`${m.annee}-${m.mois}`}><span className="trx-fc-quoi">{moisFr(m)}<small className="trx-fc-sous"> — non comptés</small></span>
          <Montant htC={c.salairesSaisis.htC} ttcC={c.salairesSaisis.ttcC} versee={false} /></li>))}</ul>}
    </CategorieRepliable>
    : <CategorieRepliable cle="salaires" donnees={{ 'data-categorie-location': 'salaires', 'aria-label': 'Salaires chargés' }} titre={<>{moins ? '− ' : ''}Salaires chargés (sans TVA)</>}
      montant={<Montant htC={t.salaires.htC} ttcC={t.salaires.ttcC} versee donnees={{ 'data-sous-total-location': 'salaires' }} />}>
      {moisS.length === 0 ? <p className="trx-fc-aucune" data-aucune="salaires">Aucun mois saisi</p> : <ul className="trx-fc-lignes">{moisS.map(({ m, c }) => (
        <li key={`${m.annee}-${m.mois}`} className="trx-fc-ligne" data-ligne-salaires={`${m.annee}-${m.mois}`}><span className="trx-fc-quoi">{moisFr(m)}</span>
          <Montant htC={c.salaires.htC} ttcC={c.salaires.ttcC} versee /></li>))}</ul>}
    </CategorieRepliable>}
  </>;
}

/** Les blocs « hors bail » du mode « Par bail » : les rétrocessions (qui diminuent le variable) et les salaires chargés de chaque mois. */
function BlocsHorsBail({ couts }: { couts: CoutsFenetre }) {
  const sal = couts.mois.filter((x) => x.c.moisAvecSalaires > 0);
  if (sal.length === 0) return null;
  return (
    <section className="trx-fc-section" data-hors-bail="salaires" aria-label="Salaires chargés">
      <div className="trx-fc-tete trx-fc-tete--affaire"><span className="trx-fc-titre-affaire"><h3>Salaires chargés (hors bail)</h3></span></div>
      <ul className="trx-fc-lignes">{sal.map(({ m, c }) => (
        <li key={`${m.annee}-${m.mois}`} className="trx-fc-ligne"><span className="trx-fc-quoi">{moisFr(m)}</span><Montant htC={c.salaires.htC} ttcC={c.salaires.ttcC} versee /></li>))}</ul>
    </section>
  );
}

/** Tuile 3 — « Coûts — [période] » (🔴 LOT LO11 : ex « Primes et rétrocessions ») : primes, apporteurs, variable, salaires chargés, à la règle. */
export function FenetreCoutsLocation({ lignes, lib, onFermer, onAller, couts, reperes }: { lignes: readonly LigneLocationCa[]; lib: string; onFermer: () => void; onAller: (id: number) => void; couts: CoutsFenetre;
  /** 🔴 LOT LO13 — ce qui a quitté la tuile (les familles, N−1), montré dans les deux modes. */
  reperes?: ReactNode }) {
  const d = detailCoutsLocation(lignes);
  const lien = useLienBail(onAller);
  const u = useAffichage();
  const en = (m: MontantC): string => `${eur((u === 'ht' ? m.htC : m.ttcC) / 100)}${ESPACE}${MOT_UNITE[u]}`;
  const t = couts.total;
  const inclus = avecSalaires(couts);
  const bauxCouts = parDateDecroissante(lignes).filter((l) => nonNul(l.primeC) || nonNul(l.apporteurC) || nonNul(l.variableC));
  const bloc = (l: LigneLocationCa) => {
    const inc = inclus(l);
    const verse = plusC(plusC(l.apporteurC, inc ? { htC: 0, ttcC: 0 } : l.primeC), inc ? { htC: 0, ttcC: 0 } : l.variableC);
    const ligneC = (cle: string, mot: string, qui: string, m: MontantC, compte: boolean) => (!nonNul(m) ? null
      : <li className={compte ? 'trx-fc-ligne' : 'trx-fc-ligne trx-fc-info'} data-cout-bail={cle}>
        <span className="trx-fc-quoi"><span className={compte ? 'trx-fc-etiquette trx-rouge' : 'trx-fc-etiquette'} data-etiquette>{mot}</span><span data-qui>{qui}</span>
          {!compte && <small className="trx-fc-sous" data-inclus-salaires> — inclus dans les salaires</small>}</span>
        <Montant htC={m.htC} ttcC={m.ttcC} versee={compte} /></li>);
    return (
      <section key={l.id} className="trx-fc-section" data-bail-couts={l.id} aria-label={titreBail(l)}>
        <TeteBail l={l} lien={lien} />
        <ul className="trx-fc-lignes">
          {ligneC('apporteur', 'Apporteur', l.apporteur ?? 'Apporteur', l.apporteurC, true)}
          {ligneC('variable', 'Variable (primes incluses)', l.negociateur.nom, variableDuBail(l), !inc)}
          {ligneDontPrime(l, inc)}
        </ul>
        <div className="trx-fc-sous-total trx-somme"><span>Versé sur ce bail</span><Montant htC={verse.htC} ttcC={verse.ttcC} versee donnees={{ 'data-verse-bail': String(l.id) }} /></div>
      </section>
    );
  };
  const retroDeduit = couts.mois.filter((x) => x.c.moisAvecSalaires === 0).reduce((s, x) => plusC(s, moinsC(lignes.filter((l) => l.annee === x.m.annee && l.mois === x.m.mois).reduce((y, l) => plusC(y, l.variableC), { htC: 0, ttcC: 0 }), x.c.variable)), { htC: 0, ttcC: 0 });
  return (
    <CoqueFenetre titre={`Coûts${hors(couts)} — ${lib}`} donnee="fenetre-couts-location" totalHtC={t.couts.htC} totalTtcC={t.couts.ttcC} sens="verse" motTotal="de coûts"
      dossiers={motBaux(d.baux.length, true)} cleMode={CLE_MODE_COUTS_LOCATION} motTransaction="Par bail" onFermer={onFermer}
      pied={<><span>Total des coûts</span><Montant htC={t.couts.htC} ttcC={t.couts.ttcC} versee donnees={{ 'data-fenetre-total': '' }} /></>}
      corps={(mode) => <>
        <style>{CSS_FENETRES_LOCATION}</style>
        {mode === 'categorie' ? <>
          {/* 🔴 Arno (02/11/2026) — apporteurs, variable (primes incluses) puis « dont primes », salaires : les lignes comptées font le total */}
          <SectionApporteurs lignes={lignes} total={d.apporteurs} lien={lien} moins={false} />
          <SectionsVariableSalaires couts={couts} moins={false} primes={<SectionPrimes lignes={d.lignesPrimes} total={t.primesDeduites} lien={lien} moins={false} inclus={inclus} dont
            apres={inclusMot(t.primes, t.primesDeduites, en)} />} />
        </> : bauxCouts.length === 0 && t.salaires.htC === 0 ? <p className="trx-fc-aucune" data-aucun-bail>Aucun coût sur la période.</p> : <>
          {bauxCouts.map(bloc)}
          {nonNul(retroDeduit) && <section className="trx-fc-section" data-hors-bail="retrocessions" aria-label="Rétrocessions">
            <div className="trx-fc-tete trx-fc-tete--affaire"><span className="trx-fc-titre-affaire"><h3>Rétrocessions des négociateurs (hors bail)</h3></span></div>
            <ul className="trx-fc-lignes"><li className="trx-fc-ligne"><span className="trx-fc-quoi">− rétrocessions (diminuent le variable)</span>
              <Montant htC={-retroDeduit.htC} ttcC={-retroDeduit.ttcC} versee={false} recu donnees={{ 'data-retro-hors-bail': '' }} /></li></ul></section>}
          <BlocsHorsBail couts={couts} />
        </>}
        {reperes}
      </>} />
  );
}

/** Tuile 4 — « CA net — [période] », ordre comptable : CA brut − apporteurs = CA net d'apporteurs − primes − variable − salaires chargés = CA net. */
export function FenetreNetLocation({ lignes, lib, onFermer, onAller, couts, reperes }: { lignes: readonly LigneLocationCa[]; lib: string; onFermer: () => void; onAller: (id: number) => void; couts: CoutsFenetre;
  /** 🔴 LOT LO13 — ce qui a quitté la tuile (CA net d'apporteurs, N−1), montré dans les deux modes. */
  reperes?: ReactNode }) {
  const T = totauxLocation(lignes);
  const d = detailCoutsLocation(lignes);
  const lien = useLienBail(onAller);
  const u = useAffichage();
  const en = (m: MontantC): string => `${eur((u === 'ht' ? m.htC : m.ttcC) / 100)}${ESPACE}${MOT_UNITE[u]}`;
  const t = couts.total;
  const inclus = avecSalaires(couts);
  const total = <><span>= CA net{hors(couts)}</span><Montant htC={t.net.htC} ttcC={t.net.ttcC} versee={false} recu donnees={{ 'data-fenetre-total': '' }} /></>;
  const ligneCout = (cle: string, etiquette: string, qui: string, m: MontantC, compte = true) => (
    <li className={compte ? 'trx-fc-ligne' : 'trx-fc-ligne trx-fc-info'} data-cout-bail={cle}>
      <span className="trx-fc-quoi"><span className={compte ? 'trx-fc-etiquette trx-rouge' : 'trx-fc-etiquette'} data-etiquette>{compte ? '− ' : ''}{etiquette}</span><span data-qui>{qui}</span>
        {!compte && <small className="trx-fc-sous" data-inclus-salaires> — inclus dans les salaires</small>}</span>
      <Montant htC={m.htC} ttcC={m.ttcC} versee={compte} /></li>
  );
  const bloc = (l: LigneLocationCa) => {
    const inc = inclus(l);
    const net = moinsC(moinsC(moinsC(l.caC, l.apporteurC), inc ? { htC: 0, ttcC: 0 } : l.primeC), inc ? { htC: 0, ttcC: 0 } : l.variableC);
    return (
      <section key={l.id} className="trx-fc-section" data-bail-net={l.id} aria-label={titreBail(l)}>
        <TeteBail l={l} lien={lien} />
        <ul className="trx-fc-lignes">
          {ligneCout('apporteur', 'Apporteur', l.apporteur ?? 'aucun', l.apporteurC)}
          {ligneCout('variable', 'Variable (primes incluses)', l.negociateur.nom, variableDuBail(l), !inc)}
          {ligneDontPrime(l, inc)}
        </ul>
        <div className="trx-fc-sous-total trx-somme"><span>= CA net du bail</span><Montant htC={net.htC} ttcC={net.ttcC} versee={false} recu donnees={{ 'data-net-bail': String(l.id) }} /></div>
      </section>
    );
  };
  const retroDeduit = couts.mois.filter((x) => x.c.moisAvecSalaires === 0).reduce((s, x) => plusC(s, moinsC(lignes.filter((l) => l.annee === x.m.annee && l.mois === x.m.mois).reduce((y, l) => plusC(y, l.variableC), { htC: 0, ttcC: 0 }), x.c.variable)), { htC: 0, ttcC: 0 });
  return (
    <CoqueFenetre titre={`CA net${hors(couts)} — ${lib}`} donnee="fenetre-net-location" totalHtC={t.net.htC} totalTtcC={t.net.ttcC} sens="recu"
      dossiers={motBaux(T.nb, false)} cleMode={CLE_MODE_NET_LOCATION} motTransaction="Par bail" onFermer={onFermer} pied={total}
      corps={(mode) => <>
        <style>{CSS_FENETRES_LOCATION}</style>
        {mode === 'categorie' ? <>
          <CategorieRepliable cle="ca" donnees={{ 'data-net-ca': '', 'aria-label': 'CA brut' }} titre="CA brut"
            montant={<Montant htC={T.ca.htC} ttcC={T.ca.ttcC} versee={false} recu donnees={{ 'data-net-ca-montant': '' }} />}>
            <p className="trx-fc-mention" data-net-parts>dont propriétaire {en(T.proprietaire)} · locataire {en(T.locataire)}</p>
          </CategorieRepliable>
          <SectionApporteurs lignes={lignes} total={d.apporteurs} lien={lien} moins />
          <div className="trx-fc-total-ca trx-somme" data-net-apporteurs><span>= CA net d’apporteurs</span>
            <Montant htC={T.netApporteurs.htC} ttcC={T.netApporteurs.ttcC} versee={false} recu donnees={{ 'data-net-apporteurs-montant': '' }} /></div>
          <SectionsVariableSalaires couts={couts} moins primes={<SectionPrimes lignes={d.lignesPrimes} total={t.primesDeduites} lien={lien} moins inclus={inclus} dont
            apres={inclusMot(t.primes, t.primesDeduites, en)} />} />
          <div className="trx-fc-total-ca trx-somme--finale" data-total-net>{total}</div>
        </> : T.nb === 0 && t.salaires.htC === 0 ? <p className="trx-fc-aucune" data-aucun-bail>Aucun bail sur la période.</p> : <>
          {parDateDecroissante(lignes).map(bloc)}
          {nonNul(retroDeduit) && <section className="trx-fc-section" data-hors-bail="retrocessions" aria-label="Rétrocessions">
            <div className="trx-fc-tete trx-fc-tete--affaire"><span className="trx-fc-titre-affaire"><h3>Rétrocessions des négociateurs (hors bail)</h3></span></div>
            <ul className="trx-fc-lignes"><li className="trx-fc-ligne"><span className="trx-fc-quoi">+ rétrocessions (diminuent le variable)</span>
              <Montant htC={retroDeduit.htC} ttcC={retroDeduit.ttcC} versee={false} recu donnees={{ 'data-retro-hors-bail': '' }} /></li></ul></section>}
          {couts.mois.some((x) => x.c.moisAvecSalaires > 0) && <section className="trx-fc-section" data-hors-bail="salaires" aria-label="Salaires chargés">
            <div className="trx-fc-tete trx-fc-tete--affaire"><span className="trx-fc-titre-affaire"><h3>− Salaires chargés (hors bail)</h3></span></div>
            <ul className="trx-fc-lignes">{couts.mois.filter((x) => x.c.moisAvecSalaires > 0).map(({ m, c }) => (
              <li key={`${m.annee}-${m.mois}`} className="trx-fc-ligne"><span className="trx-fc-quoi">{moisFr(m)}</span><Montant htC={c.salaires.htC} ttcC={c.salaires.ttcC} versee /></li>))}</ul></section>}
        </>}
        {reperes}
      </>} />
  );
}

/**
 * ══ 🔴 LOT LO13 (Arno) — Tuile 1 — « CA brut — [période] » : la même coque (croix, Échap, clic dehors, plein écran au téléphone, « Par bail | Par
 * catégorie »). Par catégorie : honoraires propriétaire, honoraires locataire, = CA brut ; par bail : les deux honoraires de chaque bail. Dessous,
 * dans les deux modes, `reperes` : ce qui a quitté les tuiles 1 et 2 (baux, cumul, même période un an plus tôt, CA brut mois par mois). Aucun
 * calcul : les montants des lignes et les totaux de la page (`totauxLocation`).
 */
export const CLE_MODE_CA_LOCATION = 'trx-location-ca-mode';
export function FenetreCaLocation({ lignes, lib, onFermer, onAller, reperes }: { lignes: readonly LigneLocationCa[]; lib: string; onFermer: () => void; onAller: (id: number) => void; reperes?: ReactNode }) {
  const T = totauxLocation(lignes);
  const lien = useLienBail(onAller);
  const total = <><span>= CA brut</span><Montant htC={T.ca.htC} ttcC={T.ca.ttcC} versee={false} recu donnees={{ 'data-fenetre-total': '' }} /></>;
  const parts = [{ cle: 'proprietaire', mot: 'Honoraires propriétaire', m: (l: LigneLocationCa) => l.proprietaireC, t: T.proprietaire },
    { cle: 'locataire', mot: 'Honoraires locataire', m: (l: LigneLocationCa) => l.locataireC, t: T.locataire }] as const;
  const baux = parDateDecroissante(lignes);
  return (
    <CoqueFenetre titre={`CA brut — ${lib}`} donnee="fenetre-ca-location" totalHtC={T.ca.htC} totalTtcC={T.ca.ttcC} sens="recu"
      dossiers={motBaux(T.nb, false)} cleMode={CLE_MODE_CA_LOCATION} motTransaction="Par bail" onFermer={onFermer} pied={total}
      corps={(mode) => <>
        <style>{CSS_FENETRES_LOCATION}</style>
        {mode === 'categorie' ? <>
          {parts.map((p) => (
            <CategorieRepliable key={p.cle} cle={p.cle} donnees={{ 'data-categorie-location': p.cle, 'aria-label': p.mot }} titre={p.mot}
              montant={<Montant htC={p.t.htC} ttcC={p.t.ttcC} versee={false} recu donnees={{ 'data-sous-total-location': p.cle }} />}>
              {baux.filter((l) => nonNul(p.m(l))).length === 0 ? aucune(p.cle) : <ul className="trx-fc-lignes">{baux.filter((l) => nonNul(p.m(l))).map((l) => (
                <li key={l.id} className="trx-fc-ligne" data-ligne-ca={`${p.cle}-${l.id}`}>
                  <span className="trx-fc-quoi">{lien(l)}{sep}<span data-qui>{p.cle === 'proprietaire' ? l.proprietaire || '—' : l.locataire || 'locataire à renseigner'}</span></span>
                  <Montant htC={p.m(l).htC} ttcC={p.m(l).ttcC} versee={false} recu /></li>))}</ul>}
            </CategorieRepliable>
          ))}
          <div className="trx-fc-total-ca trx-somme--finale" data-total-ca>{total}</div>
        </> : baux.length === 0 ? <p className="trx-fc-aucune" data-aucun-bail>Aucun bail sur la période.</p> : baux.map((l) => (
          <section key={l.id} className="trx-fc-section" data-bail-ca={l.id} aria-label={titreBail(l)}>
            <TeteBail l={l} lien={lien} />
            <ul className="trx-fc-lignes">
              <li className="trx-fc-ligne"><span className="trx-fc-quoi"><span className="trx-fc-etiquette" data-etiquette>Propriétaire</span><span data-qui>{l.proprietaire || '—'}</span></span>
                <Montant htC={l.proprietaireC.htC} ttcC={l.proprietaireC.ttcC} versee={false} recu /></li>
              <li className="trx-fc-ligne"><span className="trx-fc-quoi"><span className="trx-fc-etiquette" data-etiquette>Locataire</span><span data-qui>{l.locataire || 'locataire à renseigner'}</span></span>
                <Montant htC={l.locataireC.htC} ttcC={l.locataireC.ttcC} versee={false} recu /></li>
            </ul>
          </section>
        ))}
        {reperes}
      </>} />
  );
}

/** 🔴 LOT LO13 — le bloc « Repères » d'une fenêtre : ce qui a quitté la tuile, une ligne par information (le mot à gauche, la valeur à droite). */
export function Reperes({ titre = 'Repères', lignes, donnee }: { titre?: string; donnee: string; lignes: readonly { cle: string; mot: ReactNode; valeur: ReactNode }[] }) {
  return (
    <section className="trx-fc-section trx-fl-reperes" data-reperes={donnee} aria-label={titre}>
      <div className="trx-fc-tete"><h3>{titre}</h3></div>
      <ul className="trx-fc-lignes">{lignes.map((x) => (
        <li key={x.cle} className="trx-fc-ligne" data-repere={x.cle}><span className="trx-fc-quoi">{x.mot}</span>{x.valeur}</li>))}</ul>
    </section>
  );
}

export const CSS_FENETRES_LOCATION = `
.trx-fl-sous-lignes{list-style:none;margin:0;padding:0;flex:1 0 100%;display:flex;flex-direction:column;font-size:.85rem;color:var(--color-svv-muted)}
.trx-fl-sous-lignes li{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 6px}
.trx-fl-sous-lignes .trx-fc-affaire{font-weight:600;min-height:32px}
.trx-fl-petit-montant{white-space:nowrap}
.trx-fc-total-ca.trx-somme{border-radius:10px}
.trx-fl-reperes .trx-fc-ligne{grid-template-columns:minmax(6.5rem,max-content) minmax(0,1fr)}
.trx-fl-reperes .trx-fc-quoi{color:var(--color-svv-ink)}
.trx-fl-reperes .trx-fc-ligne>:last-child{justify-self:end;text-align:right;min-width:0}
.trx-fl-texte{font-weight:600;overflow-wrap:anywhere}
`;
