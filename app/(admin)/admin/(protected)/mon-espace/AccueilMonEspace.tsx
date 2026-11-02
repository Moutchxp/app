'use client';

import { ESPACE, FournisseurConsolide, MOT_UNITE, signePct, useAffichage, useConsolide } from '../transaction/commun';
import { Explication, GrapheMois, LigneDesMois, type useLigneDesMois } from '../transaction/EcransTransaction';
import { eur } from '../../../../lib/transaction/format';
import { moisSoulignes } from '../../../../lib/transaction/periodeAnnees';
import { motSansN1Pour, NOMS_MOIS, type DonneesSociete } from '../../../../lib/transaction/modele';
import type { MesAffaires } from '../../../../lib/mon-espace/mesAffaires';
import { totauxDuChoix } from '../../../../lib/mon-espace/statistiques';
import { periodeMois, sourceMoisPerso, tuilesAgence, tuilesPerso, type ChoixAccueil, type Montant } from '../../../../lib/mon-espace/accueil';
import { ListeAffairesPeriode, type RendreCarte } from './ListeAffairesPeriode';

/**
 * ══ 🔴 MON ESPACE (Arno, 02/11/2026) — L'ACCUEIL AU FORMAT « LE MOIS » DU SUIVI CA ══════════════════════════════════════════════════════════════════
 * Les briques de l'onglet « Le mois » des pages Transaction, telles quelles : la rangée des mois et « Mois | Période | Année » (`LigneDesMois`,
 * `useLigneDesMois` : « Année » par défaut, les mois écoulés soulignés en rouge), les tuiles (mêmes classes), le graphique « Mois par mois ».
 *   · LE GRAPHIQUE : celui de la page du Suivi CA (`GrapheMois`, en « Vendu + compromis » : vendu en bas, compromis au-dessus, N−1 hachuré,
 *     Mensuel / Cumul, l'encadré de détail) — en mode agence sur la structure (avec « CA net ») ; en « Mon espace » sur MES chiffres
 *     (`sourceMoisPerso` : le vendu de « Mes statistiques », mes compromis en cours, ma part ; sans « CA net », non défini pour un espace) ;
 *   · « Mon espace » : mes tuiles (celles de « Mes statistiques », `tuilesPerso`) ; 4ᵉ tuile : « Mes compromis en cours » (ma part, décision 6) ;
 *   · MODE AGENCE : les tuiles de « Le mois » (`tuilesAgence`) ; 4ᵉ tuile : « CA net cumulé ».
 * Une tuile ouvre l'onglet qui liste ses affaires. La ligne des mois (`ligne`) est tenue par l'écran (l'onglet « Année(s) » ouvre un mois) ;
 * l'année se choisit dans l'onglet « Année(s) » (décision 9 d'Arno : la liste « Année » au-dessus de la rangée des mois est retirée).
 * L'écart entre les blocs : `tdb loc-page`, les classes de la page d'une structure du Suivi CA (`.tdb` : 18 px) ; `data-transaction` : sa marque, à
 * laquelle tiennent des règles de son graphique (largeur des onglets de mesure, encadré).
 */
export function AccueilMonEspace({ data, ligne, onOuvrir, carte }: { data: MesAffaires; ligne: ReturnType<typeof useLigneDesMois>;
  onOuvrir: (o: 'compromis' | 'ventes') => void;
  /** La carte d'une affaire (celle de l'onglet « Compromis ») : la liste sous le graphique. */
  carte: RendreCarte }) {
  const jour = data.aujourdhui;
  const u = useAffichage();
  const cons = useConsolide();
  const { annee, mois, decoupage, periodeVue, refusPeriode, choisirMois, choisirDecoupage } = ligne;
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
  // 4ᵉ tuile « Mon espace » : ma part des compromis en cours (décision 6) ; projection = mon CA acté de l'année + ce prévisionnel.
  const anCourant = Number(jour.slice(0, 4));
  const prev = { ht: data.compteurs.compromis.ca.htC / 100, ttc: data.compteurs.compromis.ca.ttcC / 100 };
  const acte = totauxDuChoix(s, { mode: 'annee', annee: anCourant, mois: 1, periode: [1] }, jour).n.ca;
  const projection = { ht: (acte.htC + data.compteurs.compromis.ca.htC) / 100, ttc: (acte.ttcC + data.compteurs.compromis.ca.ttcC) / 100 };
  return (
    <div className="mes-accueil tdb loc-page" data-transaction={agence?.cle ?? 'moi'} data-accueil-mon-espace={agence?.cle ?? 'moi'}>
      <LigneDesMois annee={annee} mois={mois} jour={jour} decoupage={decoupage} moisChoisis={moisPeriodeAnnee} onMois={choisirMois} onDecoupage={choisirDecoupage} />
      {decoupage === 'periode' && refusPeriode && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins un mois reste choisi.</p>}
      <ul className={`tdb-tuiles trx-tuiles-alignees${agence === null && t.net !== undefined ? ' trx-tuiles-gestion' : ''}`} aria-label={`L’essentiel — ${moisMot} ${annee}`} data-tuiles-accueil>
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
        {t.net !== undefined && (
          <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes')} data-tuile="ca-net-cumul">
            <span className="tdb-tuile-mot">{agence === null ? `Mon CA net ${MOT}` : mot(`CA net ${MOT}`)} cumulé {annee} ({t.cumul.mot}){agence !== null && <Explication sorte="net" />}</span>
            <strong className="tdb-tuile-valeur" data-ca-net-cumul>{grand(t.net.valeur)}</strong>
            <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(t.net.valeur)}</small>
            <span className="tdb-tuile-n1" data-tuile-n1="ca-net">{n1(t.net.n1, t.net.pct)}</span></button></li>
        )}
        {agence === null && (
          <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('compromis')} data-tuile="mes-compromis">
            <span className="tdb-tuile-mot">Mes compromis en cours ({MOT}) <small className="trx-tuile-explication">ma part, le prévisionnel</small></span>
            <strong className="tdb-tuile-valeur" data-valeur-tuile="previsionnel">{grand(prev)}</strong>
            <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(prev)}</small>
            <span className="tdb-tuile-n1" data-tuile-nb-compromis>{data.compteurs.compromis.nb} compromis</span>
            <span className="tdb-tuile-n1" data-tuile-projection>Projection {anCourant} : {grand({ ht: acte.htC / 100, ttc: acte.ttcC / 100 })} acté + {grand(prev)} = {grand(projection)}</span></button></li>
        )}
      </ul>
      {/* Le graphique de la page du Suivi CA (« Vendu + compromis ») ; « Mon espace » : sur mes chiffres, aux intitulés d'une page non consolidée. */}
      <FournisseurConsolide value={agence === null ? false : agence.cle === 'tous'}>
        <GrapheMois d={dSoc ?? sansDonnees(jour)} tout={dSoc ?? sansDonnees(jour)} annee={annee} mois={mois} jour={jour} mode="tous" series={null} onMois={choisirMois}
          moisSeul={decoupage === 'mois'} periodeAnnee={moisPeriodeAnnee} rouges={rouges} finPeriode={decoupage === 'periode' ? t.cumul.fin : null}
          {...(dSoc === null ? { source: sourceMoisPerso(s, annee) } : {})} />
      </FournisseurConsolide>
      {/* Les affaires qui font exactement ces cartes et ce graphique (la sélection de la rangée ; un clic sur un mois la change, la liste suit). */}
      {/* Décision 15 (Arno, 02/11/2026) : dans « Mois », les « Vendus » seuls (les compromis restent dans le graphique et l'onglet « Compromis »). */}
      <ListeAffairesPeriode data={data} periode={periodeMois(choix, agence === null, jour)} libelle={`${moisMot} ${annee}`} carte={carte} avecCompromis={false} />
    </div>
  );
}

/** Aucune vente : les graphiques du Suivi CA, quand leurs chiffres viennent d'une source (« Mon espace »), ne lisent rien d'autre. */
export const sansDonnees = (jour: string): DonneesSociete => ({ disponible: true, societe: null, aujourdhui: jour, ventes: [], retrocessions: [], aRattacher: [] });
