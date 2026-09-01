import type { CSSProperties } from 'react';
import { dureeRun, traduireStatut, type RunVeille } from '../../../../lib/sitadel/planification';

/**
 * Composants de rendu PURS de l'onglet « Automatisation » (chantier S11b) — aucun état, aucun effet → testables en Node
 * via `renderToStaticMarkup`. Français simple, sans jargon. Le bandeau d'avertissement « ordonnanceur peut-être absent »
 * et la traduction des statuts vivent ici pour être verrouillés par des tests.
 */
const carte: CSSProperties = { padding: '.7rem .85rem', borderRadius: '.6rem', fontSize: 13, lineHeight: 1.5 };

/** Bandeau d'état en tête : actif/éteint, dernier passage, prochain passage, millésime en base. */
export function BandeauEtat({ autoActive, dernierRun, prochainPhrase, millesimeBase }: {
  autoActive: boolean; dernierRun: RunVeille | null; prochainPhrase: string; millesimeBase: string | null;
}) {
  const style: CSSProperties = autoActive
    ? { ...carte, background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' }
    : { ...carte, background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)' };
  const dernier = dernierRun
    ? `${dernierRun.demarreLe ?? '—'} — ${traduireStatut(dernierRun.statut)}`
    : 'aucun passage enregistré';
  return (
    <div role="status" style={style}>
      <div><strong>{autoActive ? 'Automatisation active' : 'Automatisation éteinte'}.</strong></div>
      <div>Dernier passage : {dernier}.</div>
      <div>Prochain passage : {prochainPhrase}.</div>
      <div>Millésime actuellement en base : {millesimeBase ?? 'aucun'}.</div>
    </div>
  );
}

/** Avertissement quand l'ordonnanceur semble absent (le back a déjà calculé `suspect`/`message`). Rien si non suspect. */
export function AvertissementOrdonnanceur({ suspect, message }: { suspect: boolean; message: string }) {
  if (!suspect) return null;
  return (
    <div role="alert" style={{ ...carte, background: 'var(--color-svv-red-soft)', color: 'var(--color-svv-red)', fontWeight: 600 }}>
      ⚠ {message} Consultez <code>ops/README.md</code> pour l’installer.
    </div>
  );
}

/** Alarme ROUGE (gravité maximale) : échecs consécutifs. Reprend le message d'erreur RÉEL du dernier échec. */
export function AlerteEchecs({ alerte, phrase }: { alerte: boolean; phrase: string }) {
  if (!alerte) return null;
  return (
    <div role="alert" style={{ ...carte, background: 'var(--color-svv-red-soft)', color: 'var(--color-svv-red)', fontWeight: 600 }}>
      ⛔ {phrase} L’ingestion échoue à répétition — vérifie l’identifiant du jeu de données ou l’endpoint DiDo.
    </div>
  );
}

/** Alarme ORANGE (information, pas une panne) : millésime figé. Texte prudent. Rien si pas d'alerte. */
export function AlerteMillesimeFige({ alerte, phrase }: { alerte: boolean; phrase: string }) {
  if (!alerte) return null;
  return (
    <div role="status" style={{ ...carte, background: 'var(--color-svv-amber-soft)', color: 'var(--color-svv-amber)', fontWeight: 600 }}>
      ⓘ {phrase}
    </div>
  );
}

/** Une ligne de l'historique des passages (statut traduit, durée, millésimes, nouveaux, erreur). */
export function LigneHistorique({ run }: { run: RunVeille }) {
  const td: CSSProperties = { padding: '.35rem .5rem', borderBottom: '1px solid var(--color-svv-line)', verticalAlign: 'top' };
  return (
    <tr>
      <td style={td}>{run.demarreLe ?? '—'}</td>
      <td style={td}>{run.declencheur}</td>
      <td style={td}>{traduireStatut(run.statut)}</td>
      <td style={td}>{run.millesimeDetecte ?? '—'}{run.millesimeIngere ? ` → ${run.millesimeIngere}` : ''}</td>
      <td style={td}>{run.dossiersNouveaux ?? '—'}</td>
      <td style={td}>{dureeRun(run.demarreLe, run.finiLe)}</td>
      <td style={{ ...td, color: run.erreur ? 'var(--color-svv-red)' : 'inherit' }}>{run.erreur ?? run.message ?? ''}</td>
    </tr>
  );
}
