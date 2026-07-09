/**
 * Script d'administration des comptes (M3 Lot 2). Exécuté par `tsx` depuis VS Code via les entrées npm :
 *   npm run admin:creer   -- --identifiant arno --role administrateur
 *   npm run admin:reset    -- --identifiant arno
 *   npm run admin:secours  -- --identifiant arno        (corde de rappel, idempotent)
 *   npm run admin:lister
 *
 * Le mot de passe est TOUJOURS saisi en clavier MASQUÉ (jamais en argument de ligne de commande — il resterait
 * dans l'historique shell) et n'est jamais affiché ni loggé. DATABASE_URL est lu depuis .env (via client.ts).
 * Aucune suppression : le script ne touche QUE la ligne du compte visé, par identifiant exact. En production,
 * exige une confirmation interactive explicite.
 */
import readline from 'node:readline';
import { creerCompte, reinitialiserMotDePasse, secours, listerComptes, ErreurCompte } from '../lib/admin/comptes';
import { estEmailValide } from '../lib/admin/email';
import { closePool } from '../lib/db/client';
import type { RoleAdmin } from '../lib/admin/session';

/** Valeur d'un flag `--nom valeur` dans argv (ou undefined). */
function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Lecture d'une ligne visible (confirmations). */
function lireLigne(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, (r) => { rl.close(); resolve(r.trim()); }));
}

/** Lecture MASQUÉE (aucun caractère écho à l'écran). */
function lireMasque(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Neutralise l'écho : n'écrit que les sauts de ligne, jamais les caractères saisis.
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (s.includes('\n')) process.stdout.write('\n');
  };
  return new Promise((resolve) => rl.question(prompt, (r) => { rl.close(); resolve(r); }));
}

/** Demande + confirme un mot de passe masqué. Refuse si vide ou non concordant. */
async function saisirMotDePasse(): Promise<string> {
  const p1 = await lireMasque('Mot de passe : ');
  if (p1.length === 0) throw new ErreurCompte('Mot de passe vide refusé.');
  const p2 = await lireMasque('Confirmer     : ');
  if (p1 !== p2) throw new ErreurCompte('Les deux saisies ne correspondent pas.');
  return p1;
}

/** En production, exige une confirmation explicite avant toute écriture. */
async function gardeProduction(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    const r = await lireLigne('⚠ NODE_ENV=production. Tapez « oui » pour continuer : ');
    if (r.toLowerCase() !== 'oui') throw new ErreurCompte('Annulé (production non confirmée).');
  }
}

function exigerIdentifiant(): string {
  const id = arg('identifiant');
  if (!id || id.trim().length === 0) throw new ErreurCompte('--identifiant <valeur> requis.');
  return id.trim();
}

/**
 * Comme `exigerIdentifiant`, mais impose le format ADRESSE E-MAIL (creer/secours). Le refus est levé AVANT
 * toute saisie de mot de passe : inutile d'infliger la double frappe masquée pour rejeter ensuite.
 */
function exigerIdentifiantEmail(): string {
  const id = exigerIdentifiant();
  if (!estEmailValide(id)) {
    throw new ErreurCompte(`« ${id} » n'est pas une adresse e-mail valide (ex. prenom@exemple.fr).`);
  }
  return id;
}

function exigerRole(): RoleAdmin {
  const r = arg('role');
  if (r !== 'administrateur' && r !== 'collaborateur') {
    throw new ErreurCompte("--role administrateur|collaborateur requis.");
  }
  return r;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new ErreurCompte('DATABASE_URL manquant — ré-exportez-le depuis .env (ex. `source .env`) puis relancez.');
  }
  const sous = process.argv[2];

  switch (sous) {
    case 'creer': {
      const identifiant = exigerIdentifiantEmail();
      const role = exigerRole();
      await gardeProduction();
      const mdp = await saisirMotDePasse();
      const c = await creerCompte(identifiant, role, mdp);
      console.log(`✓ Compte créé : ${c.identifiant} (${c.role}, ${c.actif ? 'actif' : 'inactif'}).`);
      break;
    }
    case 'reset': {
      const identifiant = exigerIdentifiant();
      await gardeProduction();
      const mdp = await saisirMotDePasse();
      const c = await reinitialiserMotDePasse(identifiant, mdp);
      console.log(`✓ Mot de passe réinitialisé pour ${c.identifiant}.`);
      break;
    }
    case 'secours': {
      const identifiant = exigerIdentifiantEmail();
      await gardeProduction();
      const mdp = await saisirMotDePasse();
      const c = await secours(identifiant, mdp);
      console.log(`✓ Secours (${c.action}) : ${c.identifiant} → administrateur actif, toutes permissions.`);
      break;
    }
    case 'lister': {
      const comptes = await listerComptes();
      if (comptes.length === 0) {
        console.log('(aucun compte)');
        break;
      }
      for (const c of comptes) {
        const perms = Object.entries(c.perms).filter(([, v]) => v).map(([k]) => k).join(', ') || '—';
        const cx = c.derniere_connexion_a ?? 'jamais';
        console.log(`- ${c.identifiant.padEnd(20)} ${c.role.padEnd(15)} ${c.actif ? 'actif  ' : 'inactif'}  perms: ${perms}  dernière connexion: ${cx}`);
      }
      break;
    }
    default:
      console.error('Sous-commande inconnue. Utilisez : creer | reset | secours | lister.');
      process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    // ErreurCompte = message métier propre ; autre = erreur technique (jamais le mot de passe).
    console.error(`✗ ${err instanceof ErreurCompte ? err.message : (err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
