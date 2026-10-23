import { existsSync, lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cheminRapport, RACINE_PROJET } from './rapportScript';

/**
 * ══ 🔴🔴 LE CACHE `.next` NE REMPLIT PLUS LE DISQUE (Arno, 23/10/2026) ══════════════════════════════════════════════════════════════
 *
 * Le 23/10/2026, `.next` avait grossi jusqu'à 119 Go et rempli le disque du Mac (plus aucune écriture possible). Décision d'Arno :
 * « Au lancement de npm run dev, mesure .next ; au-delà de 10 Go, vide uniquement le cache avant de démarrer, et note-le dans
 * .captures/surveiller-next/ (date, taille avant / après). » Pas de surveillance continue.
 *   · LE CACHE = `.next/cache` (webpack, images) et `.next/dev/cache` (Turbopack, le bundler de `next dev` en Next 16) : ils se
 *     reconstruisent seuls ; rien d'autre de `.next` n'est touché ;
 *   · JAMAIS sous un serveur vivant : si le verrou de `next dev` (`.next/dev/lock`) désigne un processus en marche, rien n'est vidé
 *     (le serveur lit ce cache) — la note le dit ;
 *   · une ligne de rapport seulement quand le seuil est dépassé (vidé, ou différé).
 */
export const SEUIL_CACHE_NEXT_OCTETS = 10 * 1024 ** 3;
export const CACHES_NEXT = ['.next/cache', '.next/dev/cache'] as const;

/** La taille d'un dossier, en octets, sans suivre les liens symboliques (`.next/dev/node_modules` en porte). Absent : 0. */
export function tailleDossier(chemin: string): number {
  if (!existsSync(chemin)) return 0;
  let total = 0;
  const pile = [chemin];
  while (pile.length > 0) {
    const c = pile.pop()!;
    let s;
    try { s = lstatSync(c); } catch { continue; }
    if (s.isSymbolicLink()) continue;
    if (s.isDirectory()) {
      let noms: string[] = [];
      try { noms = readdirSync(c); } catch { continue; }
      for (const n of noms) pile.push(join(c, n));
    } else total += s.size;
  }
  return total;
}

/** Le serveur `next dev` en marche sur ce projet (son verrou désigne un processus vivant), ou `null`. */
export function serveurDevVivant(racine: string, vivant: (pid: number) => boolean = processusVivant): { pid: number; port: number | null } | null {
  const verrou = join(racine, '.next/dev/lock');
  if (!existsSync(verrou)) return null;
  try {
    const l = JSON.parse(readFileSync(verrou, 'utf8')) as { pid?: unknown; port?: unknown };
    const pid = typeof l.pid === 'number' && Number.isInteger(l.pid) && l.pid > 0 ? l.pid : null;
    if (pid === null || !vivant(pid)) return null;
    return { pid, port: typeof l.port === 'number' ? l.port : null };
  } catch { return null; }
}

function processusVivant(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** « 12,4 Go » / « 310 Mo » — pour la note. PUR. */
export function enMots(octets: number): string {
  const go = octets / 1024 ** 3;
  if (go >= 1) return `${go.toFixed(1).replace('.', ',')} Go`;
  return `${Math.round(octets / 1024 ** 2)} Mo`;
}

export interface IssuePurge {
  /** Tout `.next`, avant et après. */
  avant: number; apres: number;
  geste: 'sous-le-seuil' | 'vide' | 'differe';
  vides: string[];
  rapport: string | null;
  serveur: { pid: number; port: number | null } | null;
}

/** Mesure `.next` ; au-delà du seuil, vide les SEULS dossiers de cache (sauf sous un serveur vivant) et le note. */
export function purgerCacheNext(o: { racine?: string; seuil?: number; maintenant?: Date; vivant?: (pid: number) => boolean } = {}): IssuePurge {
  const racine = o.racine ?? RACINE_PROJET;
  const seuil = o.seuil ?? SEUIL_CACHE_NEXT_OCTETS;
  const avant = tailleDossier(join(racine, '.next'));
  if (avant <= seuil) return { avant, apres: avant, geste: 'sous-le-seuil', vides: [], rapport: null, serveur: null };
  const serveur = serveurDevVivant(racine, o.vivant);
  const vides: string[] = [];
  if (serveur === null) {
    for (const c of CACHES_NEXT) {
      const chemin = join(racine, c);
      if (!existsSync(chemin)) continue;
      rmSync(chemin, { recursive: true, force: true });
      vides.push(c);
    }
  }
  const apres = serveur === null ? tailleDossier(join(racine, '.next')) : avant;
  const quand = (o.maintenant ?? new Date()).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const lignes = serveur === null
    ? [`${quand} — .next : ${enMots(avant)} avant, ${enMots(apres)} après (seuil ${enMots(seuil)}).`, `Vidé : ${vides.join(', ') || 'aucun dossier de cache présent'}.`]
    : [`${quand} — .next : ${enMots(avant)} (seuil ${enMots(seuil)}) : NON vidé, un serveur next dev est en marche (pid ${serveur.pid}${serveur.port ? `, port ${serveur.port}` : ''}).`,
      'Arrêtez-le puis relancez npm run dev : le cache sera vidé avant le démarrage.'];
  const rapport = cheminRapport({ nomScript: 'surveiller-next', prefixe: 'purge-cache', racine, maintenant: o.maintenant });
  writeFileSync(rapport, `${lignes.join('\n')}\n`);
  return { avant, apres, geste: serveur === null ? 'vide' : 'differe', vides, rapport, serveur };
}
