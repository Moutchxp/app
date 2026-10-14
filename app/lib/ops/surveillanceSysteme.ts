/**
 * Sondes RÉELLES de la surveillance du serveur (`surveillance.ts`) : systemctl, journalctl, fichiers, montages, disque,
 * HTTPS, base. TOUT EST EN LECTURE : aucune commande qui agit (seulement `systemctl show` / `list-units` et
 * `journalctl`), base ouverte en `default_transaction_read_only=on`. Non testé par `npm test` (aucun réseau, aucun
 * système) : la logique testée est dans `surveillance.ts`.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { Client } from 'pg';
import type { EtatUnite, Sondes } from './surveillance';

const DELAI_COMMANDE_MS = 20_000;
/** Un montage réseau qui ne répond plus ne doit pas figer la passe. */
const DELAI_DISQUE_DISTANT_MS = 30_000;

function lancer(programme: string, args: string[]): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    execFile(programme, args, { timeout: DELAI_COMMANDE_MS, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      // `systemctl show` répond 0 même pour une unité absente ; `list-units` aussi. Un code ≠ 0 est donc une vraie panne.
      if (err) rejeter(new Error(`${programme} ${args.join(' ')} : ${(stderr || err.message).trim()}`));
      else resoudre(stdout);
    });
  });
}

function avecDelai<T>(p: Promise<T>, ms: number, quoi: string): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    const t = setTimeout(() => rejeter(new Error(`${quoi} : pas de réponse en ${ms / 1000} s`)), ms);
    p.then((v) => { clearTimeout(t); resoudre(v); }, (e) => { clearTimeout(t); rejeter(e); });
  });
}

async function plusRecent(fichiers: string[]): Promise<Date | null> {
  let max: Date | null = null;
  for (const f of fichiers) {
    try {
      const s = await fs.stat(f);
      if (!max || s.mtime > max) max = s.mtime;
    } catch { /* disparu entre-temps */ }
  }
  return max;
}

async function lireDossier(d: string): Promise<import('node:fs').Dirent[]> {
  try { return await fs.readdir(d, { withFileTypes: true }); } catch { return []; }
}

/** Les fichiers svav-*.tar.zst.age à la racine du point de montage et un niveau en dessous. */
async function archivesOvh(point: string): Promise<string[]> {
  const trouves: string[] = [];
  const estArchive = (n: string) => n.startsWith('svav-') && n.endsWith('.tar.zst.age');
  for (const e of await lireDossier(point)) {
    const p = path.join(point, e.name);
    if (e.isFile() && estArchive(e.name)) trouves.push(p);
    else if (e.isDirectory()) for (const s of await lireDossier(p)) if (s.isFile() && estArchive(s.name)) trouves.push(path.join(p, s.name));
  }
  return trouves;
}

export function sondesSysteme(databaseUrl: string | undefined): Sondes {
  return {
    async etatUnite(unite: string): Promise<EtatUnite> {
      const sortie = await lancer('systemctl', ['show', unite, '-p', 'LoadState,ActiveState,SubState,UnitFileState', '--no-pager']);
      const v: Record<string, string> = {};
      for (const ligne of sortie.split('\n')) {
        const i = ligne.indexOf('=');
        if (i > 0) v[ligne.slice(0, i)] = ligne.slice(i + 1).trim();
      }
      return { charge: v.LoadState ?? '', actif: v.ActiveState ?? '', sousEtat: v.SubState ?? '', fichier: v.UnitFileState ?? '' };
    },

    async unitesSvavEnEchec(): Promise<string[]> {
      const sortie = await lancer('systemctl', ['list-units', '--all', '--state=failed', '--no-legend', '--plain', '--no-pager', 'svav-*']);
      return sortie.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((u) => u && u.startsWith('svav-'));
    },

    async site(url: string, delaiMs: number) {
      const debut = Date.now();
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(delaiMs), redirect: 'follow', cache: 'no-store' });
        await r.arrayBuffer().catch(() => undefined);
        return { statut: r.status, dureeMs: Date.now() - debut };
      } catch (e) {
        return { statut: null, dureeMs: Date.now() - debut, erreur: e instanceof Error ? (e.cause instanceof Error ? `${e.message} (${e.cause.message})` : e.message) : String(e) };
      }
    },

    certificat(url: string) {
      const { hostname, port } = new URL(url);
      return new Promise((resoudre) => {
        const s = tls.connect({ host: hostname, port: Number(port) || 443, servername: hostname, rejectUnauthorized: false, timeout: 10_000 }, () => {
          const c = s.getPeerCertificate();
          const expireLe = c && c.valid_to ? new Date(c.valid_to) : null;
          const erreur = s.authorized ? undefined : `certificat refusé : ${String(s.authorizationError)}`;
          s.end();
          resoudre({ expireLe: expireLe && !Number.isNaN(expireLe.getTime()) ? expireLe : null, erreur });
        });
        s.on('timeout', () => { s.destroy(); resoudre({ expireLe: null, erreur: 'pas de réponse TLS en 10 s' }); });
        s.on('error', (e) => resoudre({ expireLe: null, erreur: e.message }));
      });
    },

    async derniereSauvegardeLocale(dossier: string) {
      const fichiers = (await lireDossier(dossier)).filter((e) => e.isDirectory()).map((e) => path.join(dossier, e.name, 'TERMINEE'));
      return plusRecent(fichiers);
    },

    async estMonte(point: string) {
      const montages = await fs.readFile('/proc/self/mounts', 'utf8');
      const cible = point.replace(/\/+$/, '');
      // Les espaces des points de montage sont écrits « \040 » dans /proc/self/mounts.
      return montages.split('\n').some((l) => (l.split(' ')[1] ?? '').replace(/\\040/g, ' ') === cible);
    },

    async derniereSauvegardeOvh(point: string) {
      return avecDelai((async () => plusRecent(await archivesOvh(point)))(), DELAI_DISQUE_DISTANT_MS, `lecture de ${point}`);
    },

    async occupation(chemin: string) {
      const s = await avecDelai(fs.statfs(chemin), DELAI_DISQUE_DISTANT_MS, `taille de ${chemin}`);
      const utilises = s.blocks - s.bfree;
      const total = utilises + s.bavail; // comme df : l'espace réservé à root ne compte pas comme disponible
      return total > 0 ? utilises / total : 0;
    },

    async base(releve: boolean) {
      if (!databaseUrl) throw new Error('DATABASE_URL absente');
      const client = new Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 10_000,
        statement_timeout: 10_000,
        options: '-c default_transaction_read_only=on',
        application_name: 'svav-surveillance',
      });
      await client.connect();
      try {
        await client.query('SELECT 1');
        if (!releve) return { derniereReleveOk: null };
        const { rows } = await client.query<{ fin: Date | null }>(
          `SELECT max(termine_le) AS fin FROM gestion_releve_run WHERE resultat = 'ok'`);
        return { derniereReleveOk: rows[0]?.fin ?? null };
      } finally {
        await client.end().catch(() => undefined);
      }
    },
  };
}

/** Les 30 dernières lignes du journal d'une unité (lecture seule). */
export async function finDuJournal(unite: string, lignes = 30): Promise<string> {
  try {
    return await lancer('journalctl', ['-u', unite, '-n', String(lignes), '--no-pager', '-o', 'short-iso']);
  } catch (e) {
    return `(journal illisible : ${e instanceof Error ? e.message : String(e)})`;
  }
}
