'use client';

import type { ReactNode } from 'react';
import { montantAffiche, useAffichage } from '../transaction/commun';
import type { MesAffaires, VenteMonEspace } from '../../../../lib/mon-espace/mesAffaires';
import { affairesAgence, affairesPerso, apporteursPeriode, negociateursPeriode, type PeriodeListe } from '../../../../lib/mon-espace/accueil';
import { TableNegociateurs } from '../transaction/EcransTransaction';
import type { LigneApporteur } from '../../../../lib/transaction/modele';
import type { MontantC } from '../../../../lib/transaction/partAgence';

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
    <TableauParApporteur lignes={apporteursPeriode(data.retrocessions ?? [], a.vendus.map((x) => x.v), data.ventes, periode)} libelle={libelle} agence={agence !== null} />
    </>
  );
}

/** « Par apporteur d'affaires » (déplacé de l'ancien onglet « Mes statistiques », tel quel) : lecture seule. */
export function TableauParApporteur({ lignes, libelle, agence }: { lignes: readonly LigneApporteur[]; libelle: string; agence: boolean }) {
  const u = useAffichage();
  return (
    <section className="tdb-section" aria-labelledby="mes-apporteurs" data-bloc="mes-apporteurs">
      <h3 id="mes-apporteurs">Par apporteur d’affaires — {libelle}</h3>
      {lignes.length === 0 ? <p className="loc-muet" data-apporteurs-vide>{agence ? 'Aucune rétrocession d’apporteur sur la période.' : 'Aucune rétrocession d’apporteur sur vos ventes de la période.'}</p> : (
        <table className="tdb-table mes-table-apporteurs">
          <thead><tr><th scope="col">Apporteur</th><th scope="col">Ventes</th><th scope="col">CA des ventes apportées</th><th scope="col">Rétrocessions versées</th></tr></thead>
          <tbody>{lignes.map((a) => (
            <tr key={a.apporteur} data-apporteur={a.apporteur}>
              <th scope="row">{a.apporteur}</th><td data-mot="Ventes">{a.ventesIds.length}</td>
              <td data-mot="CA des ventes apportées">{montantAffiche(u, a.caApporteHt, a.caApporteHt * 1.2)}</td>
              <td data-mot="Rétrocessions versées" className="trx-rouge">{montantAffiche(u, a.retroHt, a.retroHt * 1.2)}</td>
            </tr>))}</tbody>
        </table>
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
`;
