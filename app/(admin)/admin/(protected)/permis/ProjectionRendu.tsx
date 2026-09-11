import type { CSSProperties, ReactNode } from 'react';
import type { EtatTitreFamille } from '../../../../lib/permis/etatFamilleProjection'; // RATT-1 — état porté par la ligne de titre d'une famille
import type { CasBilanComparatif } from '../../../../lib/permis/comparatifParcelles'; // PL-ÉTAT — cas du bilan déclaré ↔ sélectionné (état SAUVEGARDÉ de la planche)
import { clotureVisible } from './CaracteristiquesRendu'; // COMPLÉMENT — SOURCE UNIQUE : n° VERT ⟺ bouton de clôture disponible
import { estValidationAcquise } from '../../../../lib/permis/rattachementGroupes'; // COMPLÉMENT — « franchi le process » par ligne (alt + emprise validées)

/**
 * PROJ-2c — RENDU PUR (renderToStaticMarkup) de la file « Projection » : le tableau des permis éligibles (documents obtenus,
 * nature neuve/extension), une ligne par permis, dépliable vers le tracé. AUCUN état ici — la Vue pilote l'ouverture et la validation.
 */

export interface LigneProjectionAffichee {
  dossierId: number;
  numDau: string;
  communeNom: string | null;
  natureLibelle: string;
  nbBatiments: number;
  satisfaitLe: string | null;
  nbCorpsSansAltitude: number;  // RATT-1 — bâtiments déclarés sans altitude de sommet (titre « Caractéristiques du permis »)
  nbBatimentsValide: number | null; // BAT-2 — nombre de bâtiments VALIDÉ (BAT-1) ; null = jamais validé → sous-section « Caractéristiques et bâtiments d'origine » (état de cohérence porté par la mère)
  nbCorpsSansAltValidee: number;    // COMPLÉMENT — bâtiments sans altitude de sommet VALIDÉE ; avec le suivant, décide si le n° passe au vert (validable = les deux à 0)
  nbCorpsSansEmpriseValidee: number; // COMPLÉMENT — bâtiments sans emprise VALIDÉE
  projectionValidee: boolean;   // RATT-1 — projection validée ? (titre « Bâtiments et projection ») — false par construction dans cette file
  testeEnAnalyse: boolean;      // LOT 51 — présent via le marqueur « testé en analyse » (partiel tenu ouvert) → l'UI propose « Renvoyer ce permis dans l'onglet En cours »
  plancheEtat: { selectionValidee: boolean; cas: CasBilanComparatif } | null; // PL-ÉTAT — état SAUVEGARDÉ de la « Planche cadastrale » (ligne visible sans déplier) ; null si indisponible → titre nu
}

/**
 * RATT-1 — TITRE d'une famille de l'onglet « Analyse et projection » avec son ÉTAT en continuité (comme « Complétude des pièces — dossier
 * incomplet »). PUR. L'ÉTAT est porté par le TEXTE ; la couleur (rouge/vert existants, ou muted en neutre) n'est qu'un appui. Aucune
 * teinte nouvelle. Visible SANS déplier la famille (posé sur la ligne de titre du bloc repliable).
 * BAT-2b — créneau `aide` OPTIONNEL (ReactNode, stylé par l'appelant) inséré ENTRE le titre et l'état : sert à CONSERVER un suffixe d'aide
 *   existant (ex. « — un par immeuble, mesurés sur les plans » de la section 4) tout en AJOUTANT l'état après lui. Absent → rendu strictement
 *   inchangé (les appelants sans `aide` — mère, Bâtiments, Planche — ne bougent pas).
 * BAT-2c — `base` accepte un ReactNode (pas seulement une chaîne) : permet un titre stylé (ex. « Permis {numDau} » en chasse fixe) porteur de
 *   son état. Élargissement SÛR : une chaîne reste un ReactNode valide, les appelants existants ne changent pas.
 */
export function TitreFamilleEtat({ base, etat, aide }: { base: ReactNode; etat: EtatTitreFamille; aide?: ReactNode }) {
  const style: CSSProperties = etat.ton === 'rouge' ? { color: 'var(--color-svv-red)', fontWeight: 700 }
    : etat.ton === 'vert' ? { color: 'var(--color-svv-green-ink)', fontWeight: 700 }
    : { color: 'var(--color-svv-muted)', fontWeight: 400 };
  return <span>{base}{aide != null ? <> {aide}</> : null}<span style={style}> — {etat.texte}</span></span>;
}

const cell: CSSProperties = { padding: '.35rem .5rem', borderBottom: '1px solid var(--color-svv-line)', fontSize: 13, textAlign: 'left', verticalAlign: 'top' };
const muted: CSSProperties = { color: 'var(--color-svv-muted)', fontSize: 12 };
// LOT 55 — en-tête de colonne : jamais de retour à la ligne (surtout « Test permis « En cours » », le libellé le plus long).
const enteteCell: CSSProperties = { ...cell, ...muted, fontWeight: 700, whiteSpace: 'nowrap' };

// LOT 55 — largeurs de colonnes DÉTERMINISTES et PARTAGÉES, définies UNE SEULE FOIS. Comme les deux tableaux de l'onglet
//   « Analyse et projection » (dossiers en test / file ordinaire) sont le MÊME composant, ce colgroup les dote de colonnes
//   strictement alignées. `table-layout: fixed` fait lire ces largeurs (et non plus le contenu, qui divergeait d'un tableau
//   à l'autre). La 1re colonne (30 %) accueille « Test permis « En cours » » sur une seule ligne. `MIN_WIDTH_TABLE` garantit
//   cette place : en dessous, le wrapper `overflowX: 'auto'` (déjà présent) fait DÉFILER — comportement responsive existant
//   conservé, aucun débordement nouveau sur desktop (où width:100% ≥ min-width).
const LARGEURS_COLONNES = ['30%', '19%', '21%', '12%', '18%'];
const MIN_WIDTH_TABLE = 700;

/** Phrase d'aide : la file « Projection » et son rôle (intervalle entre réception des pièces et apparition du bâti). */
export const AIDE_PROJECTION = 'Onglet « Analyse et projection » : à la réception des pièces, on INSTRUIT le permis (caractéristiques, bâtiments déclarés) PUIS on reconstitue l’emprise au sol des futurs bâtiments (neuve / extension) avant que BD TOPO ne les voie. Une reconstitution, jamais une mesure ; elle n’alimente ni le verdict ni l’altitude.';

export function TableProjection({ file, ouvert, onOuvrir, renderDetail, libellePermis = 'Permis', modePassage = 'automatique', tousValidesOuvert = null }: {
  file: LigneProjectionAffichee[];
  ouvert: number | null;
  onOuvrir: (dossierId: number) => void;
  renderDetail: () => ReactNode;
  // LOT 54 — en-tête de la 1re colonne. Défaut « Permis » (file normale). Le tableau des dossiers EN TEST reçoit
  //   « Test permis "En cours" » → c'est le SEUL signal qui distingue les deux blocs (plus de groupe/pli au-dessus).
  libellePermis?: string;
  // COMPLÉMENT — le n° passe au VERT quand le permis est VALIDABLE (= le bouton de clôture s'affiche), via la SOURCE UNIQUE `clotureVisible`.
  //   `tousValidesOuvert` (état LIVE du dossier ouvert, remonté par « Bâtiments et projection ») prime sur les comptes de la file → le n° du
  //   dossier ouvert suit son bouton sans latence ; les autres lignes dérivent de leurs comptes de validation.
  modePassage?: 'automatique' | 'cloture_manuelle';
  tousValidesOuvert?: boolean | null;
}) {
  if (file.length === 0) return <p style={muted}>Aucun permis en attente de projection. La file est vide.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: MIN_WIDTH_TABLE, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
        <colgroup>
          {LARGEURS_COLONNES.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={enteteCell}>{libellePermis}</th>
            <th style={enteteCell}>Commune</th>
            <th style={enteteCell}>Nature</th>
            <th style={enteteCell}>Bâtiments</th>
            <th style={enteteCell}>Pièces reçues</th>
          </tr>
        </thead>
        <tbody>
          {file.map((l) => {
            const estOuvert = l.dossierId === ouvert;
            // COMPLÉMENT — VALIDABLE (n° vert) ⟺ bouton de clôture disponible : MÊME calcul `clotureVisible`. `tousValides` = état LIVE du
            //   dossier ouvert (prime) sinon comptes de la file. `dejaPasse` = false par construction (la file exclut les permis passés).
            const tousValides = (estOuvert && tousValidesOuvert !== null) ? tousValidesOuvert : estValidationAcquise(l.nbBatiments, l.nbCorpsSansAltValidee, l.nbCorpsSansEmpriseValidee);
            const validable = clotureVisible(modePassage, tousValides, l.projectionValidee ?? false);
            return (
              <tr key={l.dossierId} style={estOuvert ? { background: 'var(--color-svv-field)' } : undefined}>
                <td style={cell} colSpan={estOuvert ? 5 : 1}>
                  {/* COMPLÉMENT — n° VERT (même token que « Projection validée ») quand validable, rouge sinon ; le chevron suit. Le ✓ est un
                      signal NON coloré (l'info ne repose pas sur la seule couleur, pour la liste fermée où le n° est le seul indice). */}
                  <button type="button" onClick={() => onOuvrir(l.dossierId)} aria-expanded={estOuvert}
                    title={validable ? 'Prêt à être envoyé en Rattachement' : undefined}
                    style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, color: validable ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)', fontWeight: 600, fontSize: 13 }}>
                    {estOuvert ? '▲ ' : '▼ '}{l.numDau}{validable ? ' ✓' : ''}
                  </button>
                  {estOuvert && <div style={{ marginTop: '.5rem' }}>{renderDetail()}</div>}
                </td>
                {!estOuvert && <>
                  <td style={cell}>{l.communeNom ?? <span style={muted}>—</span>}</td>
                  <td style={cell}>{l.natureLibelle}</td>
                  <td style={cell}>{l.nbBatiments}</td>
                  <td style={cell}>{l.satisfaitLe ?? <span style={muted}>—</span>}</td>
                </>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// COMPLÉMENT (07/09/2026) — le bouton GLOBAL « Valider la projection » (jadis `BoutonValiderProjection`) a été RETIRÉ : vestige du geste
//   qui finalisait toute la projection d'un coup sur la seule COUVERTURE (tracé/ignoré), sans exiger la validation PAR BÂTIMENT — un 2e
//   chemin d'écriture sur permis_projection, la divergence qu'on corrige. La validation passe désormais par la chaîne par bâtiment
//   (enregistrer → valider → modifier, BlocTraceEmprise) et la clôture « Valider le permis — envoyer en Rattachement » (ProjectionVue).
