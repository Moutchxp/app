/**
 * Script d'administration des comptes (M3). Exécuté par `tsx` depuis VS Code via les entrées npm :
 *   npm run admin:creer   -- --identifiant a.jorel@sansvisavis.com --role administrateur --prenom Arnaud --nom Jorel
 *   npm run admin:reset    -- --identifiant a.jorel@sansvisavis.com
 *   npm run admin:secours  -- --identifiant a.jorel@sansvisavis.com   (RÉACTIVATION SEULE d'un compte existant)
 *   npm run admin:secours-hash                                        (HASH argon2 du secret break-glass → ligne .env)
 *   npm run admin:lister
 *
 * `admin:creer` exige --prenom et --nom (non vides) ; les comptes créés par la CLI ont
 * `doit_changer_mot_de_passe = false` (Arno choisit lui-même le mot de passe — seule la future UICréation, Lot C,
 * posera true). `admin:secours` NE CRÉE PLUS de compte : un identifiant inconnu est refusé (la vraie corde de
 * rappel est la voie de secours NAVIGATEUR, mot de passe partagé, indépendante de la base).
 *
 * Le mot de passe est TOUJOURS saisi en clavier MASQUÉ (jamais en argument de ligne de commande — il resterait
 * dans l'historique shell) et n'est jamais affiché ni loggé. DATABASE_URL est lu depuis .env (via client.ts).
 * Aucune suppression : le script ne touche QUE la ligne du compte visé, par identifiant exact. En production,
 * exige une confirmation interactive explicite.
 */
import readline from 'node:readline';
import { creerCompte, reinitialiserMotDePasse, secours, listerComptes, ErreurCompte } from '../lib/admin/comptes';
import { hacher } from '../lib/admin/motDePasse';
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

/** Valeur texte OBLIGATOIRE d'un flag `--nom` (ex. --prenom, --nom), non vide après trim. Vérifié AVANT la
 *  saisie du mot de passe : on ne fait pas taper (deux fois) un mot de passe pour rejeter ensuite. */
function exigerTexte(nom: string): string {
  const v = arg(nom);
  if (!v || v.trim().length === 0) throw new ErreurCompte(`--${nom} <valeur> requis (non vide).`);
  return v.trim();
}

function exigerRole(): RoleAdmin {
  const r = arg('role');
  if (r !== 'administrateur' && r !== 'collaborateur') {
    throw new ErreurCompte("--role administrateur|collaborateur requis.");
  }
  return r;
}

async function main(): Promise<void> {
  // NB : `DATABASE_URL` est requis pour TOUTES les sous-commandes, y compris `secours-hash` — non parce que ce
  // dernier écrit en base (il n'écrit RIEN : il ne fait que hacher un secret), mais parce que ce script importe
  // statiquement la couche DB (`comptes` → `db/client`, qui lève au chargement si la var manque). En pratique la
  // var vient de `.env` (chargé par `dotenv/config` dans `client.ts`) — la commande fonctionne donc dans le repo.
  if (!process.env.DATABASE_URL) {
    throw new ErreurCompte('DATABASE_URL manquant — ré-exportez-le depuis .env (ex. `source .env`) puis relancez.');
  }
  const sous = process.argv[2];

  switch (sous) {
    case 'creer': {
      const identifiant = exigerIdentifiantEmail();
      const role = exigerRole();
      const prenom = exigerTexte('prenom'); // validés AVANT la saisie du mot de passe
      const nom = exigerTexte('nom');
      await gardeProduction();
      const mdp = await saisirMotDePasse();
      const c = await creerCompte(identifiant, role, mdp, prenom, nom);
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
      // RÉACTIVATION SEULE : un identifiant inconnu est refusé par `secours` (ErreurCompte) — aucune création.
      const identifiant = exigerIdentifiantEmail();
      await gardeProduction();
      const mdp = await saisirMotDePasse();
      const c = await secours(identifiant, mdp);
      console.log(`✓ Secours : ${c.identifiant} → administrateur actif, toutes permissions, mot de passe réinitialisé.`);
      break;
    }
    case 'secours-hash': {
      // Génère le HASH argon2 du SECRET break-glass (voie de secours du login), ENCODÉ EN BASE64. Le base64 est
      // IMMUNISÉ contre l'expansion de variables de `@next/env` (aucun `$` dans son alphabet), contrairement au
      // hash argon2 brut `$argon2id$…` qui était mutilé au runtime Next → 401. N'écrit RIEN en base, ne LOGGE
      // JAMAIS le secret en clair (saisie MASQUÉE + confirmation). Sortie = la ligne .env à coller par Arno.
      // (Le hash est public/sans danger : il ne révèle pas le secret ; c'est un argon2id salé.)
      const secret = await saisirMotDePasse(); // masqué + confirmation ; refuse vide / non concordant
      const h = await hacher(secret);
      const b64 = Buffer.from(h, 'utf8').toString('base64'); // base64 → aucun `$` → pas d'expansion @next/env
      console.log('\nColle cette ligne dans .env (puis redémarre) — le secret n’est jamais affiché :\n');
      console.log(`ADMIN_PASSWORD_ARGON2_B64=${b64}`);
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
        const identite = `${c.prenom} ${c.nom}`;
        console.log(`- ${c.identifiant.padEnd(28)} ${identite.padEnd(24)} ${c.role.padEnd(15)} ${c.actif ? 'actif  ' : 'inactif'}  perms: ${perms}  dernière connexion: ${cx}`);
      }
      break;
    }
    default:
      console.error('Sous-commande inconnue. Utilisez : creer | reset | secours | secours-hash | lister.');
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
