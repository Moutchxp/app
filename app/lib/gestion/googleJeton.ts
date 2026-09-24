/**
 * LOT 5-GOOGLE — OÙ DORT LE JETON DE gestion@, et sous quelles conditions.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 HORS DÉPÔT, PAR DÉFAUT ET PAR CONSTRUCTION. Le fichier vit dans `~/.config/sansvisavis/`, c'est-à-dire ailleurs que
 * le dossier du projet : il ne peut donc être committé par aucun `git add` distrait, ni emporté par une copie du dépôt.
 * C'est plus sûr que `.env` (qui est dans le dossier, et ne tient que par une ligne de `.gitignore`), et cela laisse
 * intact le jeton Drive existant, qui lui vit dans `.env` et auquel rien d'ici ne touche.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 CE FICHIER TOUCHE AU DISQUE (`node:fs`), donc le NAVIGATEUR ne doit jamais l'atteindre — webpack refuserait de
 * construire la page, et toute l'application tomberait (incident du 24/09/2026). Il n'est importé que par les deux CLI
 * d'autorisation et de vérification ; un test le vérifie sur le graphe réel, faute de quoi le garde de frontière
 * cliente ne l'attraperait pas (il ne surveille que `pg` et `server-only`).
 *
 * DROITS 0600 : lisible et modifiable par le seul propriétaire. Un jeton lisible par tout le compte est un jeton
 * qu'une autre application peut prendre.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Ce que le fichier contient. Volontairement minimal : un jeton, une adresse, une date, les portées accordées. */
export interface JetonGestion {
  refreshToken: string;
  compte: string;
  obtenuLe: string;
  portees: string[];
}

/**
 * Le chemin du fichier. `GOOGLE_GESTION_JETON_FICHIER` le déplace (hébergement, poste partagé) ; sans elle, le
 * dossier de configuration de l'utilisateur. Le chemin est rendu ABSOLU pour ne dépendre d'aucun répertoire courant :
 * un job planifié n'en a pas (leçon du chantier S11a, cf. `chargerEnv`).
 */
export function cheminJeton(
  env: Record<string, string | undefined> = process.env, maison: string = homedir(),
): string {
  const force = (env.GOOGLE_GESTION_JETON_FICHIER ?? '').trim();
  return force !== '' ? force : join(maison, '.config', 'sansvisavis', 'google-gestion.json');
}

/**
 * ENREGISTRE le jeton. Crée le dossier s'il manque, écrit, puis RESSERRE les droits à 0600 — dans cet ordre, sinon le
 * fichier existe une fraction de seconde en lecture pour tout le monde.
 */
export function ecrireJeton(jeton: JetonGestion, chemin: string = cheminJeton()): void {
  mkdirSync(dirname(chemin), { recursive: true, mode: 0o700 });
  writeFileSync(chemin, `${JSON.stringify(jeton, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(chemin, 0o600);
}

/**
 * LIT le jeton. DEUX SOURCES, dans cet ordre : la variable `GOOGLE_GESTION_REFRESH_TOKEN` si elle existe (c'est ainsi
 * qu'un hébergement fournit ses secrets), puis le fichier. `null` = pas encore autorisé — ce n'est pas une panne, et
 * l'écran doit pouvoir le dire tel quel.
 *
 * Un fichier illisible ou abîmé rend `null` plutôt que de jeter : une autorisation à refaire n'est pas un plantage.
 */
export function lireJeton(
  env: Record<string, string | undefined> = process.env, chemin: string = cheminJeton(env),
): JetonGestion | null {
  const parEnv = (env.GOOGLE_GESTION_REFRESH_TOKEN ?? '').trim();
  if (parEnv !== '') {
    return { refreshToken: parEnv, compte: (env.GOOGLE_GESTION_COMPTE ?? '').trim(), obtenuLe: '', portees: [] };
  }
  if (!existsSync(chemin)) return null;
  try {
    const brut = JSON.parse(readFileSync(chemin, 'utf8')) as Partial<JetonGestion>;
    const t = (brut.refreshToken ?? '').trim();
    if (t === '') return null;
    return {
      refreshToken: t,
      compte: (brut.compte ?? '').trim(),
      obtenuLe: (brut.obtenuLe ?? '').trim(),
      portees: Array.isArray(brut.portees) ? brut.portees.map(String) : [],
    };
  } catch {
    return null;
  }
}
