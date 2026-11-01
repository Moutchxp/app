'use client';

import type { ReactNode } from 'react';
import { NOMS_MOIS } from '../../../../lib/transaction/modele';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import { detailCoutsLocation, parDateDecroissante, titreBail, totauxLocation, type LigneLocationCa } from '../../../../lib/transaction/locationCa';
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
export function SectionPrimes({ lignes, total, lien, moins, ouverte = false }: { lignes: readonly LigneLocationCa[]; total: MontantC; lien: (l: LigneLocationCa) => ReactNode; moins: boolean; ouverte?: boolean }) {
  return (
    // 🔴 LOT LG3 — fermée à l'ouverture de la fenêtre : le nom et le sous-total ; un clic montre les baux
    <CategorieRepliable cle="primes" donnees={{ 'data-categorie-location': 'primes', 'aria-label': 'Primes de nouvelle gestion' }} titre={<>{moins ? '− ' : ''}Primes de nouvelle gestion</>}
      montant={<Montant htC={total.htC} ttcC={total.ttcC} versee donnees={{ 'data-sous-total-location': 'primes' }} />} ouverteInitiale={ouverte}>
      {lignes.length === 0 ? aucune('primes') : <ul className="trx-fc-lignes">{lignes.map((l) => (
        <li key={l.id} className="trx-fc-ligne" data-ligne-prime={l.id}>
          <span className="trx-fc-quoi">{lien(l)}{sep}<span data-locataire>{l.locataire || 'locataire à renseigner'}</span>{sep}<span data-nego>{l.negociateur.nom}</span></span>
          <Montant htC={l.primeC.htC} ttcC={l.primeC.ttcC} versee />
        </li>))}</ul>}
    </CategorieRepliable>
  );
}

/** La catégorie « Commissions d'apporteurs » : le sous-total en rouge, puis un apporteur par ligne (son cumul ; dessous, en petit, ses baux). */
export function SectionApporteurs({ lignes, total, lien, moins, ouverte = false }: { lignes: readonly LigneLocationCa[]; total: MontantC; lien: (l: LigneLocationCa) => ReactNode; moins: boolean; ouverte?: boolean }) {
  const groupes = detailCoutsLocation(lignes).groupesApporteurs;
  return (
    <CategorieRepliable cle="apporteurs" donnees={{ 'data-categorie-location': 'apporteurs', 'aria-label': 'Commissions d’apporteurs' }} titre={<>{moins ? '− ' : ''}Commissions d’apporteurs</>}
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

/** Tuile 3 — « Primes et rétrocessions — [période] ». */
export function FenetreCoutsLocation({ lignes, lib, onFermer, onAller }: { lignes: readonly LigneLocationCa[]; lib: string; onFermer: () => void; onAller: (id: number) => void }) {
  const d = detailCoutsLocation(lignes);
  const lien = useLienBail(onAller);
  const bloc = (l: LigneLocationCa) => {
    const verse = { htC: l.primeC.htC + l.apporteurC.htC, ttcC: l.primeC.ttcC + l.apporteurC.ttcC };
    return (
      <section key={l.id} className="trx-fc-section" data-bail-couts={l.id} aria-label={titreBail(l)}>
        <TeteBail l={l} lien={lien} />
        <ul className="trx-fc-lignes">
          {(l.primeC.htC !== 0 || l.primeC.ttcC !== 0) && <li className="trx-fc-ligne" data-cout-bail="prime">
            <span className="trx-fc-quoi"><span className="trx-fc-etiquette trx-rouge" data-etiquette>Prime</span><span data-qui>{l.negociateur.nom}</span></span>
            <Montant htC={l.primeC.htC} ttcC={l.primeC.ttcC} versee /></li>}
          {(l.apporteurC.htC !== 0 || l.apporteurC.ttcC !== 0) && <li className="trx-fc-ligne" data-cout-bail="apporteur">
            <span className="trx-fc-quoi"><span className="trx-fc-etiquette trx-rouge" data-etiquette>Apporteur</span><span data-qui>{l.apporteur ?? 'Apporteur'}</span></span>
            <Montant htC={l.apporteurC.htC} ttcC={l.apporteurC.ttcC} versee /></li>}
        </ul>
        <div className="trx-fc-sous-total trx-somme"><span>Versé sur ce bail</span><Montant htC={verse.htC} ttcC={verse.ttcC} versee donnees={{ 'data-verse-bail': String(l.id) }} /></div>
      </section>
    );
  };
  return (
    <CoqueFenetre titre={`Primes et rétrocessions — ${lib}`} donnee="fenetre-couts-location" totalHtC={d.total.htC} totalTtcC={d.total.ttcC} sens="verse" motTotal="versées"
      dossiers={motBaux(d.baux.length, true)} cleMode={CLE_MODE_COUTS_LOCATION} motTransaction="Par bail" onFermer={onFermer}
      pied={<><span>Total versé</span><Montant htC={d.total.htC} ttcC={d.total.ttcC} versee donnees={{ 'data-fenetre-total': '' }} /></>}
      corps={(mode) => <>
        <style>{CSS_FENETRES_LOCATION}</style>
        {mode === 'categorie' ? <>
          <SectionPrimes lignes={d.lignesPrimes} total={d.primes} lien={lien} moins={false} />
          <SectionApporteurs lignes={lignes} total={d.apporteurs} lien={lien} moins={false} />
        </> : d.baux.length === 0 ? <p className="trx-fc-aucune" data-aucun-bail>Aucune prime ni rétrocession sur la période.</p> : d.baux.map(bloc)}
      </>} />
  );
}

/** Tuile 4 — « CA net — [période] », dans l'ordre comptable : CA brut − apporteurs = CA net d'apporteurs − primes = CA net. */
export function FenetreNetLocation({ lignes, lib, onFermer, onAller }: { lignes: readonly LigneLocationCa[]; lib: string; onFermer: () => void; onAller: (id: number) => void }) {
  const T = totauxLocation(lignes);
  const d = detailCoutsLocation(lignes);
  const lien = useLienBail(onAller);
  const u = useAffichage();
  const en = (m: MontantC): string => `${eur((u === 'ht' ? m.htC : m.ttcC) / 100)}${ESPACE}${MOT_UNITE[u]}`;
  const total = <><span>= CA net</span><Montant htC={T.net.htC} ttcC={T.net.ttcC} versee={false} recu donnees={{ 'data-fenetre-total': '' }} /></>;
  const ligneCout = (cle: string, etiquette: string, qui: string, m: MontantC) => (
    <li className="trx-fc-ligne" data-cout-bail={cle}>
      <span className="trx-fc-quoi"><span className="trx-fc-etiquette trx-rouge" data-etiquette>− {etiquette}</span><span data-qui>{qui}</span></span>
      <Montant htC={m.htC} ttcC={m.ttcC} versee /></li>
  );
  const bloc = (l: LigneLocationCa) => (
    <section key={l.id} className="trx-fc-section" data-bail-net={l.id} aria-label={titreBail(l)}>
      <TeteBail l={l} lien={lien} />
      <ul className="trx-fc-lignes">
        {ligneCout('apporteur', 'Apporteur', l.apporteur ?? 'aucun', l.apporteurC)}
        {ligneCout('prime', 'Prime', l.negociateur.nom, l.primeC)}
      </ul>
      <div className="trx-fc-sous-total trx-somme"><span>= CA net du bail</span><Montant htC={l.netC.htC} ttcC={l.netC.ttcC} versee={false} recu donnees={{ 'data-net-bail': String(l.id) }} /></div>
    </section>
  );
  return (
    <CoqueFenetre titre={`CA net — ${lib}`} donnee="fenetre-net-location" totalHtC={T.net.htC} totalTtcC={T.net.ttcC} sens="recu"
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
          <SectionPrimes lignes={d.lignesPrimes} total={d.primes} lien={lien} moins />
          <div className="trx-fc-total-ca trx-somme--finale" data-total-net>{total}</div>
        </> : T.nb === 0 ? <p className="trx-fc-aucune" data-aucun-bail>Aucun bail sur la période.</p> : parDateDecroissante(lignes).map(bloc)}
      </>} />
  );
}

export const CSS_FENETRES_LOCATION = `
.trx-fl-sous-lignes{list-style:none;margin:0;padding:0;flex:1 0 100%;display:flex;flex-direction:column;font-size:.85rem;color:var(--color-svv-muted)}
.trx-fl-sous-lignes li{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 6px}
.trx-fl-sous-lignes .trx-fc-affaire{font-weight:600;min-height:32px}
.trx-fl-petit-montant{white-space:nowrap}
.trx-fc-total-ca.trx-somme{border-radius:10px}
`;
