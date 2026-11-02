'use client';

import { useEffect, useState } from 'react';
import { ecrireAdresse, ESPACE, FournisseurConsolide, MOT_UNITE, parametre, signePct, useAffichage, useConsolide } from '../transaction/commun';
import { Explication, GrapheAnnees, GrapheMois, LigneDesAnnees, libelleAnnees, moisRougesDeLAnnee, type useLigneDesAnnees } from '../transaction/EcransTransaction';
import { sansDonnees } from './AccueilMonEspace';
import { eur } from '../../../../lib/transaction/format';
import { anneesSoulignees } from '../../../../lib/transaction/periodeAnnees';
import { motSansN1Pour, type DonneesSociete } from '../../../../lib/transaction/modele';
import type { MesAffaires } from '../../../../lib/mon-espace/mesAffaires';
import { totauxDuChoix } from '../../../../lib/mon-espace/statistiques';
import { periodeAnnees, sourceAnneesPerso, sourceMoisPerso, tuilesAnneesAgence, tuilesAnneesPerso, type Montant } from '../../../../lib/mon-espace/accueil';
import { ListeAffairesPeriode, type RendreCarte } from './ListeAffairesPeriode';

/**
 * ══ 🔴 MON ESPACE (Arno, 02/11/2026) — L'ONGLET « ANNÉE(S) » AU FORMAT DU SUIVI CA ═════════════════════════════════════════════════════════════════
 * Les briques de « L'année » des pages Transaction : la rangée des années et « Année | Période | Tout » (`LigneDesAnnees`, `useLigneDesAnnees`, les
 * années soulignées en rouge), les quatre tuiles (mêmes classes), et LES GRAPHIQUES DE LA PAGE DU SUIVI CA (« Vendu + compromis ») : « Année par
 * année » (`GrapheAnnees` : une année s'ouvre d'un clic ; Annuel / Cumul) et, au choix de l'échelle, « Mois par mois » de l'année (`GrapheMois` :
 * un mois ouvre l'onglet « Mois »).
 *   · « Mon espace » : mes chiffres (« Mes statistiques », `tuilesAnneesPerso` ; graphiques : `sourceAnneesPerso` / `sourceMoisPerso`, ma part,
 *     sans « CA net ») ; 4ᵉ tuile : « Mes compromis en cours » (ma part, décision 6) ;
 *   · mode agence : les tuiles de « L'année » (`tuilesAnneesAgence`) et les graphiques sur la structure (avec « CA net ») ; 4ᵉ tuile : « CA net ».
 */
type LigneAnnees = ReturnType<typeof useLigneDesAnnees>;
export function AnneesMonEspace({ data, ligne, annees, onOuvrirMois, onOuvrir, carte }: { data: MesAffaires; ligne: LigneAnnees; annees: readonly number[];
  onOuvrirMois: (a: number, m: number) => void; onOuvrir: (o: 'compromis' | 'ventes', annee?: number) => void;
  /** La carte d'une affaire (celle de l'onglet « Compromis ») : la liste sous le graphique. */
  carte: RendreCarte }) {
  const jour = data.aujourdhui;
  const u = useAffichage();
  const cons = useConsolide();
  const [echelle, setEchelle] = useState<'annees' | 'mois'>(() => (parametre('graphe') === 'mois' ? 'mois' : 'annees'));
  useEffect(() => { ecrireAdresse({ graphe: echelle === 'mois' ? 'mois' : null }); }, [echelle]);
  const { choixA, refusAnnees, choisirAnnee, choisirDecoupageAnnees, anneesVisibles } = ligne;
  if (choixA === null) return null;
  const agence = data.agence ?? null;
  const s = data.statistiques ?? { annees: [] };
  const visibles = anneesVisibles ?? annees;
  const enTout = choixA.decoupage === 'tout';
  const sel = enTout ? [...visibles] : [...choixA.annees].sort((a, b) => a - b);
  const annee = choixA.annee;
  const dSoc: DonneesSociete | null = agence === null ? null : { disponible: data.disponible, societe: agence.societe, aujourdhui: jour, ventes: data.ventes,
    retrocessions: data.retrocessions ?? [], aRattacher: [], statutsNegociateurs: data.statutsNegociateurs, nomsNegociateurs: data.nomsNegociateurs };
  const t = dSoc === null ? tuilesAnneesPerso(s, sel, enTout, jour) : tuilesAnneesAgence(dSoc, sel, enTout, jour);
  const MOT = MOT_UNITE[u];
  const mot = (x: string): string => (agence === null ? x : cons(x));
  const grand = (m: Montant): string => eur(u === 'ht' ? m.ht : m.ttc);
  const petit = (m: Montant): string => `(${eur(u === 'ht' ? m.ttc : m.ht)}${ESPACE}${MOT_UNITE[u === 'ht' ? 'ttc' : 'ht']})`;
  const lib = enTout ? 'toutes les années' : libelleAnnees(choixA);
  const toutes = `Toutes les années (${visibles[0]} → ${visibles.at(-1)})`;
  const enN1 = sel.length === 1 ? `en ${sel[0] - 1}` : 'un an plus tôt';
  const sansN1 = motSansN1Pour(sel[0] ?? annee, 'vendu');
  const n1 = (x: Montant | null, pct: number | null): string => (enTout ? toutes : x === null ? sansN1 : `${grand(x)} ${enN1} (${signePct(pct)})`);
  // 4ᵉ tuile « Mon espace » : ma part des compromis en cours (décision 6) ; projection = mon CA acté de l'année en cours + ce prévisionnel.
  const anCourant = Number(jour.slice(0, 4));
  const prev = { ht: data.compteurs.compromis.ca.htC / 100, ttc: data.compteurs.compromis.ca.ttcC / 100 };
  const acte = totauxDuChoix(s, { mode: 'annee', annee: anCourant, mois: 1, periode: [1] }, jour).n.ca;
  const choixEchelle = (
    <div className="trx-unites trx-choix-echelle" role="group" aria-label="L’échelle du graphique" data-echelle-choix={echelle}>
      <button type="button" className="trx-unite" aria-pressed={echelle === 'annees'} onClick={() => setEchelle('annees')} data-echelle="annees">Année par année</button>
      <button type="button" className="trx-unite" aria-pressed={echelle === 'mois'} onClick={() => setEchelle('mois')} data-echelle="mois">Mois par mois — {annee}</button>
    </div>
  );
  const rougesMois = moisRougesDeLAnnee(annee, anneesSoulignees(choixA.decoupage, annee, sel, visibles), jour);
  return (
    <div className="mes-annees tdb loc-page" data-transaction={agence?.cle ?? 'moi'} data-annees-mon-espace={agence?.cle ?? 'moi'}>
      <LigneDesAnnees annees={visibles} decoupage={choixA.decoupage} annee={annee} choisies={sel} onAnnee={choisirAnnee} onDecoupage={choisirDecoupageAnnees} />
      {choixA.decoupage === 'periode' && refusAnnees && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins une année reste choisie.</p>}
      <ul className={`tdb-tuiles trx-tuiles-alignees${agence === null && t.net !== undefined ? ' trx-tuiles-gestion' : ''}`} aria-label={`L’essentiel — ${lib}`} data-tuiles-annees>
        <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes', annee)} data-tuile="ca-annee">
          <span className="tdb-tuile-mot">{mot(`CA ${MOT}`)} — {lib}{agence !== null && <Explication sorte="ca" />}</span>
          <strong className="tdb-tuile-valeur" data-valeur-tuile="ca-annee">{grand(t.ca.valeur)}</strong>
          <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(t.ca.valeur)}</small>
          <span className="tdb-tuile-n1" data-tuile-n1="ca">{n1(t.ca.n1, t.ca.pct)}</span></button></li>
        <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes', annee)} data-tuile="ventes-annee">
          <span className="tdb-tuile-mot">Ventes — {lib}</span><strong className="tdb-tuile-valeur" data-valeur-tuile="nombre-annee">{t.nb.valeur}</strong>
          <span className="tdb-tuile-n1" data-tuile-n1="nombre">{enTout ? toutes : t.nb.n1 === null ? sansN1 : `${t.nb.n1} ${enN1}`}</span></button></li>
        <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes', annee)} data-tuile="ca-a-date">
          <span className="tdb-tuile-mot">{enTout ? <>{mot(`CA ${MOT}`)} — à date (toutes les années)</> : <>{mot(`CA ${MOT}`)} — {lib} à date</>}{agence !== null && <Explication sorte="ca" />}</span>
          <strong className="tdb-tuile-valeur" data-valeur-tuile="a-date">{grand(t.aDate.valeur)}</strong>
          <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(t.aDate.valeur)}</small>
          <span className="tdb-tuile-n1" data-tuile-n1="a-date">{n1(t.aDate.n1, t.aDate.pct)}</span></button></li>
        {t.net !== undefined && (
          <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes', annee)} data-tuile="ca-net-annee">
            <span className="tdb-tuile-mot">{agence === null ? `Mon CA net ${MOT}` : mot(`CA net ${MOT}`)} — {lib}{agence !== null && <Explication sorte="net" />}</span>
            <strong className="tdb-tuile-valeur" data-ca-net-annee>{grand(t.net.valeur)}</strong>
            <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(t.net.valeur)}</small>
            <span className="tdb-tuile-n1" data-tuile-n1="ca-net">{n1(t.net.n1, t.net.pct)}</span></button></li>
        )}
        {agence === null && (
          <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('compromis')} data-tuile="mes-compromis">
            <span className="tdb-tuile-mot">Mes compromis en cours ({MOT}) <small className="trx-tuile-explication">ma part, le prévisionnel</small></span>
            <strong className="tdb-tuile-valeur" data-valeur-tuile="previsionnel">{grand(prev)}</strong>
            <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(prev)}</small>
            <span className="tdb-tuile-n1" data-tuile-nb-compromis>{data.compteurs.compromis.nb} compromis</span>
            <span className="tdb-tuile-n1" data-tuile-projection>Projection {anCourant} : {grand({ ht: acte.htC / 100, ttc: acte.ttcC / 100 })} acté + {grand(prev)} = {grand({ ht: acte.htC / 100 + prev.ht, ttc: acte.ttcC / 100 + prev.ttc })}</span></button></li>
        )}
      </ul>
      <FournisseurConsolide value={agence === null ? false : agence.cle === 'tous'}>
        {echelle === 'annees'
          ? <GrapheAnnees d={dSoc ?? sansDonnees(jour)} tout={dSoc ?? sansDonnees(jour)} annees={visibles} selection={sel} comparaison={enTout ? toutes : null} annee={annee}
            decoupage={choixA.decoupage} jour={jour} mode="tous" series={null} onAnnee={choisirAnnee} entete={choixEchelle} {...(dSoc === null ? { source: sourceAnneesPerso(s) } : {})} />
          : <GrapheMois d={dSoc ?? sansDonnees(jour)} tout={dSoc ?? sansDonnees(jour)} annee={annee} mois={0} jour={jour} mode="tous" series={null} onMois={(m) => onOuvrirMois(annee, m)}
            moisSeul={false} periodeAnnee={null} rouges={rougesMois} entete={choixEchelle} {...(dSoc === null ? { source: sourceMoisPerso(s, annee) } : {})} />}
      </FournisseurConsolide>
      {/* Les affaires qui font exactement ces cartes et ce graphique (les années choisies ; un clic sur une année la change, la liste suit). */}
      <ListeAffairesPeriode data={data} periode={periodeAnnees(sel, agence === null, jour)} libelle={lib} carte={carte} />
    </div>
  );
}
