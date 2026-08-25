import type { CSSProperties, ReactNode } from 'react';

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
}

const cell: CSSProperties = { padding: '.35rem .5rem', borderBottom: '1px solid var(--color-svv-line)', fontSize: 13, textAlign: 'left', verticalAlign: 'top' };
const muted: CSSProperties = { color: 'var(--color-svv-muted)', fontSize: 12 };

/** Phrase d'aide : la file « Projection » et son rôle (intervalle entre réception des pièces et apparition du bâti). */
export const AIDE_PROJECTION = 'Onglet « Analyse et projection » : à la réception des pièces, on INSTRUIT le permis (caractéristiques, bâtiments déclarés) PUIS on reconstitue l’emprise au sol des futurs bâtiments (neuve / extension) avant que BD TOPO ne les voie. Une reconstitution, jamais une mesure ; elle n’alimente ni le verdict ni l’altitude.';

export function TableProjection({ file, ouvert, onOuvrir, renderDetail }: {
  file: LigneProjectionAffichee[];
  ouvert: number | null;
  onOuvrir: (dossierId: number) => void;
  renderDetail: () => ReactNode;
}) {
  if (file.length === 0) return <p style={muted}>Aucun permis en attente de projection. La file est vide.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...cell, ...muted, fontWeight: 700 }}>Permis</th>
            <th style={{ ...cell, ...muted, fontWeight: 700 }}>Commune</th>
            <th style={{ ...cell, ...muted, fontWeight: 700 }}>Nature</th>
            <th style={{ ...cell, ...muted, fontWeight: 700 }}>Bâtiments</th>
            <th style={{ ...cell, ...muted, fontWeight: 700 }}>Pièces reçues</th>
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
