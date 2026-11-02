'use client';

import { ESPACE, MOT_UNITE, signePct, useAffichage, useConsolide } from '../transaction/commun';
import { Explication, GrapheMois, LigneDesMois, useLigneDesMois } from '../transaction/EcransTransaction';
import { ListeChoix } from '../location/ListeChoix';
import { GrapheMoisStats } from './MesStatistiques';
import { eur } from '../../../../lib/transaction/format';
import { moisSoulignes } from '../../../../lib/transaction/periodeAnnees';
import { motSansN1Pour, NOMS_MOIS, type DonneesSociete } from '../../../../lib/transaction/modele';
import type { MesAffaires } from '../../../../lib/mon-espace/mesAffaires';
import { totauxDuChoix } from '../../../../lib/mon-espace/statistiques';
import { tuilesAgence, tuilesPerso, type ChoixAccueil, type Montant } from '../../../../lib/mon-espace/accueil';

/**
 * ══ 🔴 MON ESPACE (Arno, 02/11/2026) — L'ACCUEIL AU FORMAT « LE MOIS » DU SUIVI CA ══════════════════════════════════════════════════════════════════
 * Les briques de l'onglet « Le mois » des pages Transaction, telles quelles : la rangée des mois et « Mois | Période | Année » (`LigneDesMois`,
 * `useLigneDesMois` : « Année » par défaut, les mois écoulés soulignés en rouge), les tuiles (mêmes classes), le graphique « Mois par mois ».
 *   · « Mon espace » : mes chiffres (ceux de « Mes statistiques », `tuilesPerso`) ; le graphique de « Mes statistiques » (`GrapheMoisStats` :
 *     CA | Nombre de ventes, N−1 hachuré, Mensuel / Cumul) ; 4ᵉ tuile : « Mes compromis en cours » (ma part, décision 6) et la projection ;
 *   · MODE AGENCE : les tuiles de « Le mois » (`tuilesAgence`) et SON graphique (`GrapheMois`, avec « CA net ») ; 4ᵉ tuile : « CA net cumulé ».
 * Une tuile ouvre l'onglet qui liste ses affaires.
 */
export function AccueilMonEspace({ data, onOuvrir }: { data: MesAffaires; onOuvrir: (o: 'compromis' | 'ventes') => void }) {
  const jour = data.aujourdhui;
  const u = useAffichage();
  const cons = useConsolide();
  const { annee, setAnnee, mois, decoupage, periodeVue, refusPeriode, choisirMois, choisirDecoupage } = useLigneDesMois(jour);
  const agence = data.agence ?? null;
  const s = data.statistiques ?? { annees: [] };
  const moisPeriodeAnnee = periodeVue === null ? null : periodeVue.map((m) => m.mois);
  const choix: ChoixAccueil = { decoupage, annee, mois, moisPeriode: moisPeriodeAnnee ?? [mois] };
  const dSoc: DonneesSociete | null = agence === null ? null : { disponible: data.disponible, societe: agence.societe, aujourdhui: jour, ventes: data.ventes,
    retrocessions: data.retrocessions ?? [], aRattacher: [], statutsNegociateurs: data.statutsNegociateurs, nomsNegociateurs: data.nomsNegociateurs };
  const t = dSoc === null ? tuilesPerso(s, choix, jour) : tuilesAgence(dSoc, choix, jour);
  // L'unité choisie : le grand montant, l'autre en petit entre parenthèses (comme les tuiles du Suivi CA).
  const grand = (m: Montant): string => eur(u === 'ht' ? m.ht : m.ttc);
  const petit = (m: Montant): string => `(${eur(u === 'ht' ? m.ttc : m.ht)}${ESPACE}${MOT_UNITE[u === 'ht' ? 'ttc' : 'ht']})`;
  const MOT = MOT_UNITE[u];
  // Mode agence : les intitulés du Suivi CA (FUSION : « consolidé ») ; « Mon espace » : les miens.
  const mot = (x: string): string => (agence === null ? x : cons(x));
  const moisMot = decoupage === 'annee' ? 'année' : decoupage === 'periode' ? 'période' : NOMS_MOIS[mois - 1].toLowerCase();
  const sansN1 = motSansN1Pour(annee, 'vendu');
  const n1 = (x: Montant | null, pct: number | null): string => (x === null ? sansN1 : `${grand(x)} en ${annee - 1} (${signePct(pct)})`);
  const rouges = decoupage === 'mois' ? null : moisSoulignes(decoupage, annee, mois, moisPeriodeAnnee, jour);
  const annees = [...new Set([...s.annees.map((x) => x.annee), annee])].sort((a, b) => b - a);
  // 4ᵉ tuile « Mon espace » : ma part des compromis en cours (décision 6) ; projection = mon CA acté de l'année + ce prévisionnel.
  const anCourant = Number(jour.slice(0, 4));
  const prev = { ht: data.compteurs.compromis.ca.htC / 100, ttc: data.compteurs.compromis.ca.ttcC / 100 };
  const acte = totauxDuChoix(s, { mode: 'annee', annee: anCourant, mois: 1, periode: [1] }, jour).n.ca;
  const projection = { ht: (acte.htC + data.compteurs.compromis.ca.htC) / 100, ttc: (acte.ttcC + data.compteurs.compromis.ca.ttcC) / 100 };
  const courante = rouges !== null ? (rouges.includes(mois) ? mois : rouges.at(-1) ?? 0) : mois;
  return (
    <div className="mes-accueil" data-accueil-mon-espace={agence?.cle ?? 'moi'}>
      <form className="tdb-filtres" aria-label="Filtres" onSubmit={(e) => e.preventDefault()}>
        <label className="tdb-champ">Année
          <ListeChoix options={annees.map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
            onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-filtre': 'annee' }} /></label>
      </form>
      <LigneDesMois annee={annee} mois={mois} jour={jour} decoupage={decoupage} moisChoisis={moisPeriodeAnnee} onMois={choisirMois} onDecoupage={choisirDecoupage} />
      {decoupage === 'periode' && refusPeriode && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins un mois reste choisi.</p>}
      <ul className="tdb-tuiles trx-tuiles-alignees" aria-label={`L’essentiel — ${moisMot} ${annee}`} data-tuiles-accueil>
        <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes')} data-tuile="ca-mois">
          <span className="tdb-tuile-mot">{mot(`CA ${MOT}`)} — {moisMot}{agence !== null && <Explication sorte="ca" />}</span>
          <strong className="tdb-tuile-valeur" data-valeur-tuile="ca">{grand(t.ca.valeur)}</strong>
          <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(t.ca.valeur)}</small>
          <span className="tdb-tuile-n1" data-tuile-n1="ca">{n1(t.ca.n1, t.ca.pct)}</span></button></li>
        <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes')} data-tuile="ventes-mois">
          <span className="tdb-tuile-mot">Ventes — {moisMot}</span><strong className="tdb-tuile-valeur" data-valeur-tuile="nombre">{t.nb.valeur}</strong>
          <span className="tdb-tuile-n1" data-tuile-n1="nombre">{t.nb.n1 === null ? sansN1 : `${t.nb.n1} en ${annee - 1}`}</span></button></li>
        <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes')} data-tuile="cumul" data-borne-cumul={t.cumul.fin}>
          <span className="tdb-tuile-mot">{mot(`CA ${MOT}`)} cumulé {annee} ({t.cumul.mot}){agence !== null && <Explication sorte="ca" />}</span>
          <strong className="tdb-tuile-valeur" data-valeur-tuile="cumul">{grand(t.cumul.valeur)}</strong>
          <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(t.cumul.valeur)}</small>
          <span className="tdb-tuile-n1" data-tuile-n1="cumul">{n1(t.cumul.n1, t.cumul.pct)}</span></button></li>
        {t.net !== undefined ? (
          <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes')} data-tuile="ca-net-cumul">
            <span className="tdb-tuile-mot">{mot(`CA net ${MOT}`)} cumulé {annee} ({t.cumul.mot})<Explication sorte="net" /></span>
            <strong className="tdb-tuile-valeur" data-ca-net-cumul>{grand(t.net.valeur)}</strong>
            <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(t.net.valeur)}</small>
            <span className="tdb-tuile-n1" data-tuile-n1="ca-net">{n1(t.net.n1, t.net.pct)}</span></button></li>
        ) : (
          <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('compromis')} data-tuile="mes-compromis">
            <span className="tdb-tuile-mot">Mes compromis en cours ({MOT}) <small className="trx-tuile-explication">ma part, le prévisionnel</small></span>
            <strong className="tdb-tuile-valeur" data-valeur-tuile="previsionnel">{grand(prev)}</strong>
            <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(prev)}</small>
            <span className="tdb-tuile-n1" data-tuile-nb-compromis>{data.compteurs.compromis.nb} compromis</span>
            <span className="tdb-tuile-n1" data-tuile-projection>Projection {anCourant} : {grand({ ht: acte.htC / 100, ttc: acte.ttcC / 100 })} acté + {grand(prev)} = {grand(projection)}</span></button></li>
        )}
      </ul>
      {dSoc !== null
        ? <GrapheMois d={dSoc} tout={dSoc} annee={annee} mois={mois} jour={jour} mode="vendu" series={null} onMois={choisirMois} moisSeul={decoupage === 'mois'}
          periodeAnnee={moisPeriodeAnnee} rouges={rouges} finPeriode={decoupage === 'periode' ? t.cumul.fin : null} />
        : <GrapheMoisStats s={s} annee={annee} jour={jour} id="accueil-histo" bloc="accueil-mois" rouges={rouges} motCa="CA" motCaTitre="mon CA" motNombre="Nombre de ventes"
          courante={courante} selectionCumul={decoupage === 'mois' ? mois : 0} onChoisir={choisirMois} cumulCliquable />}
    </div>
  );
}
