import type { CSSProperties, ReactNode } from 'react';
import type { EtatTitreFamille } from '../../../../lib/permis/etatFamilleProjection'; // RATT-1 — état porté par la ligne de titre d'une famille

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
  projectionValidee: boolean;   // RATT-1 — projection validée ? (titre « Bâtiments et projection ») — false par construction dans cette file
  testeEnAnalyse: boolean;      // LOT 51 — présent via le marqueur « testé en analyse » (partiel tenu ouvert) → l'UI propose « Renvoyer ce permis dans l'onglet En cours »
}

/**
 * RATT-1 — TITRE d'une famille de l'onglet « Analyse et projection » avec son ÉTAT en continuité (comme « Complétude des pièces — dossier
 * incomplet »). PUR. L'ÉTAT est porté par le TEXTE ; la couleur (rouge/vert existants, ou muted en neutre) n'est qu'un appui. Aucune
 * teinte nouvelle. Visible SANS déplier la famille (posé sur la ligne de titre du bloc repliable).
 */
export function TitreFamilleEtat({ base, etat }: { base: string; etat: EtatTitreFamille }) {
  const style: CSSProperties = etat.ton === 'rouge' ? { color: 'var(--color-svv-red)', fontWeight: 700 }
    : etat.ton === 'vert' ? { color: 'var(--color-svv-green-ink)', fontWeight: 700 }
    : { color: 'var(--color-svv-muted)', fontWeight: 400 };
  return <span>{base}<span style={style}> — {etat.texte}</span></span>;
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

export function TableProjection({ file, ouvert, onOuvrir, renderDetail, libellePermis = 'Permis' }: {
  file: LigneProjectionAffichee[];
  ouvert: number | null;
  onOuvrir: (dossierId: number) => void;
  renderDetail: () => ReactNode;
  // LOT 54 — en-tête de la 1re colonne. Défaut « Permis » (file normale). Le tableau des dossiers EN TEST reçoit
  //   « Test permis "En cours" » → c'est le SEUL signal qui distingue les deux blocs (plus de groupe/pli au-dessus).
  libellePermis?: string;
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
            return (
              <tr key={l.dossierId} style={estOuvert ? { background: 'var(--color-svv-field)' } : undefined}>
                <td style={cell} colSpan={estOuvert ? 5 : 1}>
                  <button type="button" onClick={() => onOuvrir(l.dossierId)} aria-expanded={estOuvert}
                    style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, color: 'var(--color-svv-red)', fontWeight: 600, fontSize: 13 }}>
                    {estOuvert ? '▲ ' : '▼ '}{l.numDau}
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

/** Bouton « Valider la projection » : ne bloque pas, il FAIT AVANCER (le permis quitte la file, passe en suivi). Actif ssi peutValider.
 *  PROJ-3b : `aucunBatiment` (aucun corps déclaré) → message qui renvoie à l'instruction (« + ajouter un bâtiment » ci-dessus). */
export function BoutonValiderProjection({ peutValider, libelle, enCours, onValider, aucunBatiment = false }: {
  peutValider: boolean; libelle: string; enCours: boolean; onValider: () => void; aucunBatiment?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      <div style={muted}>{libelle}</div>
      <button type="button" className="svv-btn" style={{ width: 'auto' }} disabled={enCours || !peutValider} onClick={onValider}>
        Valider la projection
      </button>
      {!peutValider && <div style={{ ...muted, color: 'var(--color-svv-red)' }}>
        {aucunBatiment
          ? 'Déclarez au moins un bâtiment (« + ajouter un bâtiment » ci-dessus) avant de valider la projection.'
          : 'Chaque bâtiment doit avoir une emprise tracée ou une projection ignorée avant de valider.'}
      </div>}
    </div>
  );
}
