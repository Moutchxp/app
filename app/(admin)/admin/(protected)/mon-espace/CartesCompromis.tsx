'use client';

import { ESPACE, MOT_UNITE, useAffichage } from '../transaction/commun';
import { eur } from '../../../../lib/transaction/format';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import type { CartesCompromis as Cartes } from '../../../../lib/mon-espace/compromisCartes';

/**
 * ══ 🔴 D27 (Arno, 03/11/2026) — LES 4 CARTES EN TÊTE DE L'ONGLET « COMPROMIS » ═══════════════════════════════════════════════════════════════════
 * Les tuiles grises des onglets « Mois » et « Année(s) » (mêmes classes, mêmes règles de grille : `.tdb-tuiles`, `.tdb-tuile`, le montant dans l'unité
 * choisie, l'autre en petit), sur les compromis en cours affichés (`cartesCompromis`) : « Volume d'affaires », « Compromis en cours », « Reversé »
 * (dont collègues · dont négociateurs · dont apporteurs), « Chiffre d'affaires net » (= 1 − 3 : la somme des « reste » ; « Mon espace » : ma part
 * nette). Aucune période : les compromis en cours à la date du jour. Lecture seule (aucun geste).
 */
export function CartesCompromis({ c, agence }: { c: Cartes; agence: boolean }) {
  const u = useAffichage();
  const MOT = MOT_UNITE[u];
  const grand = (m: MontantC): string => eur((u === 'ht' ? m.htC : m.ttcC) / 100);
  const petit = (m: MontantC): string => `(${eur((u === 'ht' ? m.ttcC : m.htC) / 100)}${ESPACE}${MOT_UNITE[u === 'ht' ? 'ttc' : 'ht']})`;
  const montant = (cle: string, m: MontantC) => <>
    <strong className="tdb-tuile-valeur" data-valeur-compromis={cle}>{grand(m)}</strong>
    <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(m)}</small>
  </>;
  return (
    <div className="mes-compromis-tete" data-cartes-compromis={agence ? 'agence' : 'moi'}>
      <ul className="tdb-tuiles trx-tuiles-alignees" aria-label="Les compromis en cours, en chiffres">
        <li><div className="tdb-tuile" data-tuile="volume">
          <span className="tdb-tuile-mot">Volume d’affaires ({MOT})</span>{montant('volume', c.volume)}
          <span className="tdb-tuile-n1">{agence ? 'tous les compromis en cours' : 'les affaires entières'}</span></div></li>
        <li><div className="tdb-tuile" data-tuile="nombre-compromis">
          <span className="tdb-tuile-mot">Compromis en cours</span><strong className="tdb-tuile-valeur" data-valeur-compromis="nombre">{c.nb}</strong>
          <span className="tdb-tuile-n1">à la date du jour</span></div></li>
        <li><div className="tdb-tuile" data-tuile="reverse">
          <span className="tdb-tuile-mot">Reversé / partagé ({MOT})</span>{montant('reverse', c.reverse)}
          <span className="tdb-tuile-n1" data-reverse-detail>
            <span data-dont="collegues">dont collègues {grand(c.collegues)}</span> · <span data-dont="negociateurs">dont négociateurs {grand(c.negociateurs)}</span> · <span data-dont="apporteurs">dont apporteurs {grand(c.apporteurs)}{c.apporteurs.htC === c.apporteurs.ttcC && c.apporteurs.htC > 0 ? ' sans TVA' : ''}</span>
            {/* 🔴 D31-3 (retrait autorisé par Arno) — la mention « dont TVA non récupérable (apporteurs) » n'est plus ici ; le montant de la carte la
                compte toujours en TTC (D29), et elle reste écrite dans la fiche de la vente, le Résultat et les coûts */}
          </span></div></li>
        <li><div className="tdb-tuile" data-tuile="net-compromis">
          <span className="tdb-tuile-mot">Chiffre d’affaires net ({MOT})</span>{montant('net', c.net)}
          <span className="tdb-tuile-n1">{agence ? 'volume − reversé = la somme des « reste »' : 'ma part nette'}</span></div></li>
      </ul>
    </div>
  );
}

// Les règles de grille des tuiles de « Mois » / « Année(s) » ; au téléphone, deux colonnes (exigence d'Arno, D27), une seule sous 300 px.
export const CSS_CARTES_COMPROMIS = `
.mes-compromis-tete{container-type:inline-size;container-name:mes-compromis-tete;margin:0 0 1rem}
.mes-compromis-tete .tdb-tuiles{grid-template-columns:repeat(4,minmax(0,1fr))}
@container mes-compromis-tete (max-width:900px){ .mes-compromis-tete .tdb-tuiles{grid-template-columns:repeat(2,minmax(0,1fr))} }
@container mes-compromis-tete (max-width:260px){ .mes-compromis-tete .tdb-tuiles{grid-template-columns:minmax(0,1fr)} }
.mes-compromis-tete .tdb-tuile>*{overflow-wrap:anywhere;white-space:normal}
/* des cartes de lecture (div, pas des boutons) : la largeur 100 % de .tdb-tuile compte le rembourrage (le bouton le fait d'office), aucun effet de survol */
.mes-compromis-tete .tdb-tuile{box-sizing:border-box;cursor:default}
.mes-compromis-tete .tdb-tuile:hover{transform:none;box-shadow:none}
.mes-compromis-tete [data-reverse-detail]{font-size:.78rem}
`;
