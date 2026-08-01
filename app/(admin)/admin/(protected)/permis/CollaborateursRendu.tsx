import type { CSSProperties } from 'react';

/**
 * Composants de rendu PURS de l'onglet « Collaborateurs » (chantier S8a) — aucun état, aucun effet → testables en Node
 * via `renderToStaticMarkup`. ⚠️ Rappel S12b : tout compteur venant du serveur est lu avec un repli `?? 0` (un décompte à
 * zéro est une information, jamais une absence qui plante l'écran).
 */

export interface CollaborateurLigne {
  id: number; nom: string; prenom: string; fonction: string; email: string; actif: boolean;
  nbPC: number; nbPD: number; nbEnAttente: number;
}
export interface Eligibilite {
  nbEligibles: number; nbTotal: number;
  inaptes: { id: number; nom: string; raisons: string[] }[];
}

const nb = (n: number | null | undefined): string => (n ?? 0).toLocaleString('fr-FR');
const carte: CSSProperties = { padding: '.6rem .8rem', borderRadius: '.6rem', fontSize: 13, lineHeight: 1.45 };

/** Bandeau d'éligibilité : combien de collaborateurs peuvent recevoir une demande, et QUI est inapte (identité incomplète). */
export function BandeauEligibilite({ eligibilite }: { eligibilite: Eligibilite }) {
  const complet = eligibilite.inaptes.length === 0;
  const style: CSSProperties = complet
    ? { ...carte, background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' }
    : { ...carte, background: '#fff4e0', color: '#8a5a00' };
  return (
    <div role="status" style={style}>
      <strong>{eligibilite.nbEligibles} collaborateur(s) éligible(s)</strong> au tourniquet (sur {eligibilite.nbTotal}).
      {eligibilite.inaptes.length > 0 && (
        <ul style={{ margin: '.35rem 0 0', paddingLeft: '1.1rem' }}>
          {eligibilite.inaptes.map((x) => (
            <li key={x.id}><strong>{x.nom}</strong> inéligible : {x.raisons.join(' ; ')}.</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Une ligne de la liste des collaborateurs (compteurs PC/PD/en attente + badge actif/désactivé + bouton de bascule). */
export function LigneCollaborateur({ c, onToggle }: { c: CollaborateurLigne; onToggle: (id: number, actif: boolean) => void }) {
  const td: CSSProperties = { padding: '.35rem .5rem', borderBottom: '1px solid var(--color-svv-line)', verticalAlign: 'top' };
  return (
    <tr style={{ opacity: c.actif ? 1 : 0.55 }}>
      <td style={td}>{c.prenom} {c.nom}</td>
      <td style={td}>{c.fonction}</td>
      <td style={td}>{c.email}</td>
      <td style={td}>
        <span style={{ fontSize: 12, fontWeight: 700, color: c.actif ? 'var(--color-svv-green-ink)' : 'var(--color-svv-muted)' }}>
          {c.actif ? 'actif' : 'désactivé'}
        </span>
      </td>
      <td style={td}>{nb(c.nbPC)}</td>
      <td style={td}>{nb(c.nbPD)}</td>
      <td style={td}>{nb(c.nbEnAttente)}</td>
      <td style={td}>
        <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }} onClick={() => onToggle(c.id, !c.actif)}>
          {c.actif ? 'désactiver' : 'réactiver'}
        </button>
      </td>
    </tr>
  );
}
