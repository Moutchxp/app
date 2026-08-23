import type { CSSProperties, ReactNode } from 'react';
import {
  DEPARTEMENTS,
  resumeCouverture,
  texteReingestion,
  type Couverture,
  type Departement,
  type EtatDetection,
  type LigneSource,
} from '../../../../lib/admin/sourcesFraicheur';
import { preparerCommande, aUneProcedure, TERMINAL_RAPPEL } from '../../../../lib/admin/commandeReingestion';
import { BoutonCopier } from '../permis/BoutonCopier';

/**
 * FRAÎCHEUR DES DONNÉES — rendu PUR (lot 1/3). Aucun état, aucun effet, aucune I/O → testable en Node via
 * `renderToStaticMarkup`. Trois blocs : le tableau (une ligne par source), la grille de couverture par département
 * (sources spatiales), et une ligne de contexte en clair. Les règles d'honnêteté sont portées par le modèle
 * (`sourcesFraicheur.ts`) ; ici on ne fait que les afficher sans les contredire (jamais « à jour », substitut visible).
 * Mobile-first : le tableau défile horizontalement dans son conteneur (jamais de débordement de page), la couverture
 * se replie en pastilles qui reviennent à la ligne. AUCUN bleu, focus rouge, pas d'interaction au survol seul.
 */

const cellule: CSSProperties = { padding: '.5rem .6rem', fontSize: 13, verticalAlign: 'top', borderBottom: '1px solid var(--color-svv-line)' };
const enTete: CSSProperties = { ...cellule, textAlign: 'left', fontWeight: 700, color: 'var(--color-svv-muted)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.02em' };

/** Millésime OU substitut OU état vide/indisponible — jamais trompeur : un substitut se lit comme un substitut. */
function CelluleMillesime({ ligne }: { ligne: LigneSource }) {
  if (ligne.indisponible) return <span style={{ color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>lecture indisponible</span>;
  if (ligne.vide) return <span style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}>aucune donnée en base</span>;
  if (ligne.estSubstitut) {
    return (
      <span style={{ color: 'var(--color-svv-muted)' }}>
        {ligne.millesimeAffiche} <span style={{ fontSize: 11, fontStyle: 'italic' }}>(substitut, pas un millésime)</span>
      </span>
    );
  }
  return <strong style={{ color: 'var(--color-svv-ink)', fontVariantNumeric: 'tabular-nums' }}>{ligne.millesimeAffiche}</strong>;
}

/** Âge en jours de ce qu'on a — JAMAIS « à jour » : sans date fiable, « inconnu ». */
function CelluleAge({ ligne }: { ligne: LigneSource }) {
  if (ligne.vide || ligne.indisponible) return <span style={{ color: 'var(--color-svv-muted)' }}>—</span>;
  if (ligne.ageJours === null) return <span style={{ color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>inconnu</span>;
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{ligne.ageJours} j</span>;
}

/** Édition distante détectée (lot 2). Règle d'honnêteté : un échec dit « non vérifié depuis N j », JAMAIS « à jour ». */
function CelluleDetection({ ligne, onToggle }: { ligne: LigneSource; onToggle?: (source: string, actif: boolean) => void }) {
  const d: EtatDetection | undefined = ligne.detection;
  if (!d) return <span style={{ color: 'var(--color-svv-muted)' }}>—</span>;

  let corps: ReactNode;
  if (d.statut === 'a_jour') {
    corps = <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>à jour</span>;
  } else if (d.statut === 'mise_a_jour') {
    corps = <span style={{ color: 'var(--color-svv-red)', fontWeight: 700 }}>⚠ mise à jour disponible — {d.editionDistante}</span>;
  } else if (d.statut === 'non_verifiable') {
    corps = <span style={{ color: 'var(--color-svv-muted)' }} title={d.motif}>non vérifiable <span style={{ fontSize: 11, fontStyle: 'italic' }}>({d.motif})</span></span>;
  } else if (d.statut === 'echec') {
    const n = d.depuisJours;
    corps = <span style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}>non vérifié{n !== null ? ` depuis ${n} j` : ''}</span>;
  } else if (d.statut === 'desactive') {
    corps = <span style={{ color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>surveillance désactivée</span>;
  } else {
    corps = <span style={{ color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>jamais vérifié</span>;
  }

  // Réglage par source : seules les sources DÉTECTABLES portent l'interrupteur (une non détectable n'a rien à surveiller).
  const bascule = ligne.detectable ? (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-svv-muted)', cursor: 'pointer', marginTop: 4 }}>
      <input
        type="checkbox"
        checked={d.statut !== 'desactive'}
        onChange={(e) => onToggle?.(ligne.cle, e.target.checked)}
        aria-label={`Surveiller ${ligne.nom}`}
      />
      surveiller
    </label>
  ) : null;

  return <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 0 }}>{corps}{bascule}</span>;
}

/** Le tableau : une ligne par source, dans l'ordre du modèle (LiDAR en tête). Défile dans son conteneur sur mobile. */
export function TableauSources({ lignes, onToggle }: { lignes: LigneSource[]; onToggle?: (source: string, actif: boolean) => void }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--color-svv-line)', borderRadius: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 860 }}>
        <thead>
          <tr>
            <th style={enTete}>Source</th>
            <th style={enTete}>Ce qu’elle sert</th>
            <th style={enTete}>Millésime en base</th>
            <th style={enTete}>Âge</th>
            <th style={enTete}>Édition distante</th>
            <th style={enTete}>Surveillance</th>
            <th style={enTete}>Réingestion</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.cle}>
              <td style={{ ...cellule, fontWeight: 700, color: 'var(--color-svv-ink)', whiteSpace: 'nowrap' }}>{l.nom}</td>
              <td style={{ ...cellule, color: 'var(--color-svv-muted)', minWidth: 180 }}>{l.sert}</td>
              <td style={cellule}><CelluleMillesime ligne={l} /></td>
              <td style={cellule}><CelluleAge ligne={l} /></td>
              <td style={{ ...cellule, minWidth: 190 }}><CelluleDetection ligne={l} onToggle={onToggle} /></td>
              <td style={cellule}>
                {l.surveillance
                  ? <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>oui</span>
                  : <span style={{ color: 'var(--color-svv-muted)' }}>non</span>}
              </td>
              <td style={{ ...cellule, whiteSpace: 'nowrap' }}>
                <span style={l.reingestion.mode === 'inexistante' ? { color: 'var(--color-svv-red)', fontWeight: 600 } : { color: 'var(--color-svv-ink)' }}>
                  {texteReingestion(l.reingestion)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STYLE_COUV: Record<Couverture, CSSProperties> = {
  present: { background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)', borderColor: 'var(--color-svv-green)' },
  partiel: { background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)', borderColor: 'var(--color-svv-red)', borderStyle: 'dashed' },
  absent: { background: 'transparent', color: 'var(--color-svv-muted)', borderColor: 'var(--color-svv-line)' },
};
const SYMBOLE: Record<Couverture, string> = { present: '✓', partiel: '~', absent: '·' };
const MOT: Record<Couverture, string> = { present: 'présent', partiel: 'partiel', absent: 'absent' };

/** Une pastille de couverture : symbole + n° de département + libellé accessible (jamais la couleur SEULE). */
function PastilleDept({ dept, etat }: { dept: Departement; etat: Couverture }) {
  const style: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 44, minHeight: 28, justifyContent: 'center',
    padding: '2px 8px', borderRadius: 8, border: '1px solid', fontSize: 12, fontWeight: 600, ...STYLE_COUV[etat],
  };
  return (
    <span style={style} aria-label={`${dept} : ${MOT[etat]}`} title={`${dept} : ${MOT[etat]}`}>
      <span aria-hidden="true">{SYMBOLE[etat]}</span>
      <span>{dept}</span>
    </span>
  );
}

/** Grille de couverture : une carte par source SPATIALE, ses 8 départements en pastilles qui reviennent à la ligne. */
export function GrilleCouverture({ lignes }: { lignes: LigneSource[] }) {
  const spatiales = lignes.filter((l) => l.couverture);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-svv-muted)' }}>
        <span aria-hidden="true">✓</span> présent · <span aria-hidden="true">~</span> partiel · <span aria-hidden="true">·</span> absent
      </p>
      {spatiales.map((l) => (
        <div key={l.cle} className="svv-card" style={{ padding: '.7rem .85rem' }}>
          <div style={{ fontWeight: 700, color: 'var(--color-svv-ink)', marginBottom: 6, fontSize: 13 }}>{l.nom}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DEPARTEMENTS.map((d) => (
              <PastilleDept key={d} dept={d} etat={l.couverture![d]} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Ligne de contexte en clair : le LiDAR est la seule source du verdict, et le verdict n'existe que là où il couvre. */
export function LigneContexte({ lignes }: { lignes: LigneSource[] }) {
  const { departementsLidar, departementsBati } = resumeCouverture(lignes);
  const zoneLidar = departementsLidar.length > 0
    ? `une zone limitée du ${departementsLidar.join(', ')} (aujourd’hui ≈ 1 km² au-dessus d’Asnières)`
    : 'aucune zone';
  return (
    <p className="svv-page-note" style={{ fontSize: 13, lineHeight: 1.5 }}>
      <strong>Seul le LiDAR entre dans le verdict.</strong> Il ne couvre que {zoneLidar} :
      un certificat n’est possible que là où le LiDAR existe. Les autres sources vont jusqu’à{' '}
      {departementsBati.length} département{departementsBati.length > 1 ? 's' : ''} et servent à éclairer et à détecter
      les changements, mais aucune n’entre dans le verdict.
    </p>
  );
}

/** Motif d'ABSENCE de commande pour une source (le pendant honnête du bouton : on dit toujours POURQUOI il n'y est pas). */
function motifSansCommande(ligne: LigneSource): string {
  const d = ligne.detection;
  if (ligne.reingestion.mode === 'automatique') return 'réingestion automatique — rien à préparer';
  if (ligne.reingestion.mode === 'inexistante') {
    return d?.statut === 'mise_a_jour'
      ? 'mise à jour disponible, mais AUCUNE procédure de réingestion — manque à combler'
      : 'aucune procédure de réingestion';
  }
  // Procédure manuelle existante, mais pas de mise à jour confirmée :
  if (!d || d.statut === 'a_jour') return 'déjà à jour — rien à préparer';
  if (d.statut === 'non_verifiable') return 'non vérifiable — aucune comparaison possible';
  if (d.statut === 'echec') return 'vérification en échec — mise à jour non confirmée';
  if (d.statut === 'desactive') return 'surveillance désactivée';
  return 'jamais vérifié — mise à jour non confirmée';
}

/** Une ligne de la section réingestion : soit le bloc « Préparer la commande », soit le motif de son absence. */
function LigneReingestion({ ligne, cheminDepot }: { ligne: LigneSource; cheminDepot: string }) {
  const actionnable = ligne.detection?.statut === 'mise_a_jour' && aUneProcedure(ligne.cle);
  const edition = ligne.detection?.statut === 'mise_a_jour' ? ligne.detection.editionDistante : null;
  const prep = actionnable ? preparerCommande(ligne.cle, edition, cheminDepot) : null;

  return (
    <div className="svv-card" style={{ padding: '.7rem .85rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, color: 'var(--color-svv-ink)', fontSize: 13 }}>{ligne.nom}</span>
        {!prep && <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>{motifSansCommande(ligne)}</span>}
      </div>
      {prep && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--color-svv-red)', fontSize: 13 }}>
            Préparer la commande{ligne.detection?.statut === 'mise_a_jour' ? ` — mise à jour ${ligne.detection.editionDistante}` : ''}
          </summary>
          {prep.avertissement && (
            <p role="note" style={{ margin: '8px 0 4px', fontSize: 12, lineHeight: 1.45, color: 'var(--color-svv-red)', fontWeight: 600 }}>
              ⚠ {prep.avertissement}
            </p>
          )}
          <p style={{ margin: '4px 0', fontSize: 11.5, color: 'var(--color-svv-muted)' }}>{TERMINAL_RAPPEL}</p>
          <pre style={{
            margin: '4px 0 8px', padding: '.6rem .7rem', overflowX: 'auto', fontSize: 12.5, lineHeight: 1.5,
            background: 'var(--color-svv-field)', border: '1px solid var(--color-svv-line)', borderRadius: 8,
            whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}>{prep.commande}</pre>
          <BoutonCopier valeur={prep.commande} libelle="Copier la commande" />
        </details>
      )}
    </div>
  );
}

/**
 * Section RÉINGESTION (lot 3) — pour chaque source, soit le bloc copiable « Préparer la commande » (quand une mise à jour
 * est disponible ET qu'une procédure existe), soit le motif de son absence. La tuile n'exécute RIEN : elle prépare, l'humain
 * colle dans un terminal. `cheminDepot` = chemin ABSOLU du dépôt (fourni par le serveur).
 */
export function SectionReingestion({ lignes, cheminDepot }: { lignes: LigneSource[]; cheminDepot: string }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {lignes.map((l) => (
        <LigneReingestion key={l.cle} ligne={l} cheminDepot={cheminDepot} />
      ))}
    </div>
  );
}
