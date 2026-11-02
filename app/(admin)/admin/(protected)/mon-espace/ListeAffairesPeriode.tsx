'use client';

import type { ReactNode } from 'react';
import { montantAffiche, useAffichage } from '../transaction/commun';
import type { MesAffaires, VenteMonEspace } from '../../../../lib/mon-espace/mesAffaires';
import { affairesAgence, affairesPerso, type PeriodeListe } from '../../../../lib/mon-espace/accueil';
import type { MontantC } from '../../../../lib/transaction/partAgence';

/** La carte d'une affaire : CELLE de l'onglet « Compromis » (mêmes gestes, mêmes droits), rendue par l'écran ; `montant` : ce qu'elle compte ici. */
export type RendreCarte = (v: VenteMonEspace, section: 'compromis' | 'vente', montant?: { m: MontantC; mot?: string }) => ReactNode;

/**
 * ══ 🔴 MON ESPACE (Arno, 02/11/2026) — LA LISTE DES AFFAIRES SOUS LE GRAPHIQUE (onglets « Mois » et « Année(s) ») ═════════════════════════════════
 * Exactement les affaires des cartes et du graphique pour la sélection en cours (`affairesPerso` / `affairesAgence`) : « Vendus » (leur total = la
 * carte « CA », leur nombre = la carte « Ventes », au centime) puis « Compromis » (la part au-dessus du vendu dans le graphique). Chaque affaire :
 * la carte de l'onglet « Compromis » ; son montant : MA part en « Mon espace » (décision 1 ; aucun montant d'un autre, décision 2), sa carte en
 * mode agence. Tri : date décroissante. Le Suivi CA n'est pas touché.
 */
export function ListeAffairesPeriode({ data, periode, libelle, carte }: { data: MesAffaires; periode: PeriodeListe; libelle: string; carte: RendreCarte }) {
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
    <section className="tdb-section mes-liste-periode" aria-labelledby="mes-liste-periode-titre" data-liste-periode>
      <h3 id="mes-liste-periode-titre">Les affaires — {libelle}</h3>
      {a.vendus.length === 0 && a.compromis.length === 0
        ? <p className="loc-muet mes-vide" data-liste-periode-vide>Aucune affaire sur cette période.</p>
        : <>{groupe('vendus', 'Vendus', a.vendus, a.totalVendus)}{groupe('compromis', 'Compromis', a.compromis, a.totalCompromis)}</>}
    </section>
  );
}

export const CSS_LISTE_PERIODE = `
.mes-liste-periode{display:flex;flex-direction:column;gap:12px}
.mes-liste-periode h3{margin:0}
.mes-liste-groupe{display:flex;flex-direction:column;gap:8px}
.mes-liste-titre{margin:0;font-size:1rem}
.mes-liste-titre strong{color:var(--color-svv-green)}
`;
