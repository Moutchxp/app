'use client';

import type { ReactNode } from 'react';
import { montantAffiche, useAffichage } from '../transaction/commun';
import type { MesAffaires, VenteMonEspace } from '../../../../lib/mon-espace/mesAffaires';
import { affairesAgence, affairesPerso, apporteursPeriode, negociateursPeriode, type PeriodeListe } from '../../../../lib/mon-espace/accueil';
import { TableNegociateurs } from '../transaction/EcransTransaction';
import type { LigneApporteur } from '../../../../lib/transaction/modele';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import type { LigneTableauApporteur } from '../../../../lib/mon-espace/compromisCartes';

/** La carte d'une affaire : CELLE de l'onglet « Compromis » (mêmes gestes, mêmes droits), rendue par l'écran ; `montant` : ce qu'elle compte ici. */
export type RendreCarte = (v: VenteMonEspace, section: 'compromis' | 'vente', montant?: { m: MontantC; mot?: string }) => ReactNode;

/**
 * ══ 🔴 MON ESPACE (Arno, 02/11/2026) — LA LISTE DES AFFAIRES SOUS LE GRAPHIQUE (onglets « Mois » et « Année(s) ») ═════════════════════════════════
 * Exactement les affaires des cartes et du graphique pour la sélection en cours (`affairesPerso` / `affairesAgence`) : « Vendus » (leur total = la
 * carte « CA », leur nombre = la carte « Ventes », au centime) puis « Compromis » (la part au-dessus du vendu dans le graphique). Chaque affaire :
 * la carte de l'onglet « Compromis » ; son montant : MA part en « Mon espace » (décision 1 ; aucun montant d'un autre, décision 2), sa carte en
 * mode agence. Tri : date décroissante. Le Suivi CA n'est pas touché.
 * 🔴 Décision 15 — l'onglet « Mois » : les « Vendus » seuls (`avecCompromis` faux) ; 🔴 D20 (03/11/2026) — « Année(s) » aussi.
 * 🔴 D21 (03/11/2026) — « Apporteurs d'affaires » suit EXACTEMENT la sélection (`periode`) : les rétrocessions saisies dans ses mois, plus celles
 * rattachées aux ventes listées (`apporteursPeriode`) — Année, Période, plusieurs années, Tout ; Mois, Période, Année.
 * 🔴 Décision 14 — sous la liste, sur la même sélection : « Par apporteur d'affaires » (le tableau de l'ancien onglet « Mes statistiques », lecture
 * seule, `parApporteur` du Suivi CA) et, en mode agence, « Par négociateur » (LE tableau de l'« Espace par négociateur » du Suivi CA).
 */
export function ListeAffairesPeriode({ data, periode, libelle, carte, avecCompromis = true }: { data: MesAffaires; periode: PeriodeListe; libelle: string; carte: RendreCarte;
  avecCompromis?: boolean }) {
  const u = useAffichage();
  const agence = data.agence ?? null;
  const a = agence === null ? affairesPerso(data.ventes, periode, data.aujourdhui)
    : affairesAgence({ societe: agence.societe, ventes: data.ventes, retrocessions: data.retrocessions ?? [], statutsNegociateurs: data.statutsNegociateurs }, periode, data.aujourdhui);
  const total = (m: MontantC): string => montantAffiche(u, m.htC / 100, m.ttcC / 100);
  const mot = agence === null ? 'ma part' : undefined;
  const groupe = (cle: 'vendus' | 'compromis', titre: string, xs: typeof a.vendus, t: MontantC) => (
    <div className="mes-liste-groupe" data-groupe-periode={cle}>
      <h4 className="mes-liste-titre">{titre} <span className="loc-muet">({xs.length})</span> — <strong data-total-groupe={cle}>{total(t)}</strong></h4>
      {xs.length === 0 ? <p className="loc-muet mes-vide" data-groupe-vide={cle}>{cle === 'vendus' ? 'Aucune vente signée sur cette période.' : 'Aucun compromis en cours sur cette période.'}</p>
        : <div className="trx-cartes mes-cartes">{xs.map((x) => carte(x.v, cle === 'vendus' ? 'vente' : 'compromis', { m: x.m, ...(mot === undefined ? {} : { mot }) }))}</div>}
    </div>
  );
  return (
    <>
    <section className="tdb-section mes-liste-periode" aria-labelledby="mes-liste-periode-titre" data-liste-periode>
      <h3 id="mes-liste-periode-titre">Les affaires — {libelle}</h3>
      {a.vendus.length === 0 && (!avecCompromis || a.compromis.length === 0)
        ? <p className="loc-muet mes-vide" data-liste-periode-vide>Aucune affaire sur cette période.</p>
        : <>{groupe('vendus', 'Vendus', a.vendus, a.totalVendus)}{avecCompromis && groupe('compromis', 'Compromis', a.compromis, a.totalCompromis)}</>}
    </section>
    {agence !== null && (() => {
      const n = negociateursPeriode({ societe: agence.societe, retrocessions: data.retrocessions ?? [], statutsNegociateurs: data.statutsNegociateurs }, a.vendus.map((x) => x.v));
      return (
        <section className="tdb-section" aria-labelledby="mes-negociateurs-periode" data-bloc="negociateurs-periode-mon-espace">
          <h3 id="mes-negociateurs-periode">Par négociateur — {libelle}</h3>
          {/* un nom ou un montant ouvre la liste de la période, juste au-dessus */}
          <TableNegociateurs lignes={n.lignes} espace={n.espace} periode={libelle} onDetail={() => {
            const l = document.querySelector('[data-liste-periode]');
            if (l !== null && typeof (l as HTMLElement).scrollIntoView === 'function') (l as HTMLElement).scrollIntoView({ block: 'start' });
          }} />
        </section>
      );
    })()}
    <TableauParApporteur lignes={apporteursPeriode(data.retrocessions ?? [], a.vendus.map((x) => x.v), data.ventes, periode).map(ligneDuSuiviCa)} libelle={libelle} agence={agence !== null} />
    </>
  );
}

/** Une ligne du Suivi CA (`parApporteur`, montants HT) en ligne du tableau : le TTC comme avant (HT × 1,2). PUR. */
export const ligneDuSuiviCa = (a: LigneApporteur): LigneTableauApporteur => ({ apporteur: a.apporteur, ids: a.ventesIds,
  ca: { ht: a.caApporteHt, ttc: a.caApporteHt * 1.2 }, verse: { ht: a.retroHt, ttc: a.retroHt * 1.2 } });
/** 🔴 D28 — les mots du tableau : ventes actées (« Mois », « Année(s) ») ou compromis en cours (onglet « Compromis »). */
const MOTS_TABLEAU = {
  ventes: { titre: 'ventes actées', nb: 'Ventes', ca: 'CA des ventes apportées', verse: 'Rétrocessions versées', bloc: 'mes-apporteurs', id: 'mes-apporteurs' },
  compromis: { titre: 'compromis en cours', nb: 'Compromis', ca: 'Honoraires des compromis apportés', verse: 'Commissions à verser', bloc: 'apporteurs-compromis', id: 'mes-apporteurs-compromis' },
} as const;

/**
 * « Par apporteur d'affaires » (déplacé de l'ancien onglet « Mes statistiques ») : lecture seule. 🔴 D28 (Arno, 03/11/2026) — le même composant
 * pour les ventes actées de la période (« Mois », « Année(s) » : « … — ventes actées ») et les compromis en cours (onglet « Compromis ») ; un total en bas.
 */
export function TableauParApporteur({ lignes, libelle, agence, sorte = 'ventes' }: { lignes: readonly LigneTableauApporteur[]; libelle: string | null; agence: boolean;
  sorte?: keyof typeof MOTS_TABLEAU }) {
  const u = useAffichage();
  const M = MOTS_TABLEAU[sorte];
  const total = lignes.reduce((t, a) => ({ nb: t.nb + a.ids.length, ca: { ht: t.ca.ht + a.ca.ht, ttc: t.ca.ttc + a.ca.ttc }, verse: { ht: t.verse.ht + a.verse.ht, ttc: t.verse.ttc + a.verse.ttc } }),
    { nb: 0, ca: { ht: 0, ttc: 0 }, verse: { ht: 0, ttc: 0 } });
  // une affaire comptée pour deux apporteurs ne l'est qu'une fois dans le total
  const affaires = new Set(lignes.flatMap((a) => a.ids)).size;
  const vide = sorte === 'compromis' ? (agence ? 'Aucune commission d’apporteur sur les compromis en cours.' : 'Aucune commission d’apporteur sur vos compromis en cours.')
    : agence ? 'Aucune rétrocession d’apporteur sur la période.' : 'Aucune rétrocession d’apporteur sur vos ventes de la période.';
  return (
    <section className="tdb-section" aria-labelledby={M.id} data-bloc={M.bloc}>
      <h3 id={M.id}>Par apporteur d’affaires — {libelle === null ? M.titre : `${libelle} — ${M.titre}`}</h3>
      {lignes.length === 0 ? <p className="loc-muet" data-apporteurs-vide>{vide}</p> : (
        <div className="mes-table-defile">
        <table className="tdb-table mes-table-apporteurs">
          <thead><tr><th scope="col">Apporteur</th><th scope="col">{M.nb}</th><th scope="col">{M.ca}</th><th scope="col">{M.verse}</th></tr></thead>
          <tbody>{lignes.map((a) => (
            <tr key={a.apporteur} data-apporteur={a.apporteur}>
              <th scope="row">{a.apporteur}</th><td data-mot={M.nb}>{a.ids.length}</td>
              <td data-mot={M.ca}>{montantAffiche(u, a.ca.ht, a.ca.ttc)}</td>
              <td data-mot={M.verse} className="trx-rouge" data-verse-apporteur>{montantAffiche(u, a.verse.ht, a.verse.ttc)}</td>
            </tr>))}</tbody>
          <tfoot><tr data-total-apporteurs>
            <th scope="row">Total</th><td data-mot={M.nb}>{affaires}</td>
            <td data-mot={M.ca}>{montantAffiche(u, total.ca.ht, total.ca.ttc)}</td>
            <td data-mot={M.verse} className="trx-rouge" data-total-verse>{montantAffiche(u, total.verse.ht, total.verse.ttc)}</td>
          </tr></tfoot>
        </table>
        </div>
      )}
    </section>
  );
}

export const CSS_LISTE_PERIODE = `
.mes-liste-periode{display:flex;flex-direction:column;gap:12px}
.mes-liste-periode h3{margin:0}
.mes-liste-groupe{display:flex;flex-direction:column;gap:8px}
.mes-liste-titre{margin:0;font-size:1rem}
.mes-liste-titre strong{color:var(--color-svv-green)}
.mes-table-apporteurs td,.mes-table-apporteurs th{text-align:left}
/* D28 - le tableau defile dans son cadre au telephone (jamais la page) ; la ligne de total en gras */
.mes-table-defile{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
.mes-table-apporteurs tfoot th,.mes-table-apporteurs tfoot td{font-weight:700;border-top:2px solid var(--color-svv-line)}
`;
