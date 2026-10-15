/**
 * Script d'administration des comptes (M3). Exécuté par `tsx` depuis VS Code via les entrées npm :
 *   npm run admin:creer   -- --identifiant a.jorel@sansvisavis.com --role administrateur --prenom Arnaud --nom Jorel
 *   npm run admin:reset    -- --identifiant a.jorel@sansvisavis.com
 *   npm run admin:secours  -- --identifiant a.jorel@sansvisavis.com   (RÉACTIVATION SEULE d'un compte existant)
 *   npm run admin:desactiver -- --identifiant x@sansvisavis.com      (désactive un compte, administrateur compris)
 *   npm run admin:reactiver  -- --identifiant x@sansvisavis.com      (réactive un compte désactivé)
 *   npm run admin:lister
 *
 * `admin:creer` exige --prenom et --nom (non vides) ; les comptes créés par la CLI ont
 * `doit_changer_mot_de_passe = false` (Arno choisit lui-même le mot de passe — seule la future UICréation, Lot C,
 * posera true). `admin:secours` NE CRÉE PLUS de compte : un identifiant inconnu est refusé.
 *
 * 🔴 CORDE DE RAPPEL UNIQUE depuis le 15/10/2026 (décision d'Arno, audit point A) : la voie de secours NAVIGATEUR
 * (identifiant vide + mot de passe partagé) est RETIRÉE de la page de connexion. Si Arno ne peut plus se connecter,
 * c'est `npm run admin:secours` sur le serveur (via SSH) — procédure : docs/BASCULE_CHECKLIST.md, « Si je ne peux plus
 * me connecter ». `admin:secours-hash` (qui armait la voie navigateur) est supprimée avec elle.
 *
 * Le mot de passe est TOUJOURS saisi en clavier MASQUÉ (jamais en argument de ligne de commande — il resterait
 * dans l'historique shell) et n'est jamais affiché ni loggé. DATABASE_URL est lu depuis .env (via client.ts).
 * Aucune suppression : le script ne touche QUE la ligne du compte visé, par identifiant exact. En production,
 * exige une confirmation interactive explicite.
 */
import readline from 'node:readline';
import { creerCompte, reinitialiserMotDePasse, secours, listerComptes, desactiverCompteCli, reactiverCompteCli, ErreurCompte } from '../lib/admin/comptes';
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

/**
 * AUDIT POINT 11 — confirmation d'un geste sur un compte : on montre le compte, puis il faut RETAPER son adresse (pas un
 * simple « oui » : on ne désactive pas le mauvais compte par une touche Entrée trop rapide).
 */
async function confirmerParIdentifiant(identifiant: string, geste: string): Promise<void> {
  const c = (await listerComptes()).find((x) => x.identifiant.toLowerCase() === identifiant.toLowerCase());
  if (c) console.log(`Compte : ${c.identifiant} — ${c.prenom} ${c.nom}, ${c.role}, ${c.actif ? 'actif' : 'inactif'}.`);
  const r = await lireLigne(`Pour ${geste} ce compte, retapez son adresse : `);
  if (r.toLowerCase() !== identifiant.toLowerCase()) throw new ErreurCompte('Annulé (adresse non confirmée).');
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
  // NB : `DATABASE_URL` est requis pour TOUTES les sous-commandes : ce script importe statiquement la couche DB
  // (`comptes` → `db/client`, qui lève au chargement si la var manque). En pratique la var vient de `.env` (chargé par
  // `dotenv/config` dans `client.ts`) — la commande fonctionne donc dans le repo.
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
    case 'desactiver': {
      const identifiant = exigerIdentifiant();
      await gardeProduction();
      await confirmerParIdentifiant(identifiant, 'DÉSACTIVER');
      const issue = await desactiverCompteCli(identifiant);
      if (issue === 'introuvable') throw new ErreurCompte(`Aucun compte « ${identifiant} ».`);
      if (issue === 'dernier_administrateur') throw new ErreurCompte('Refusé : c’est le DERNIER administrateur actif (sinon plus personne ne pourrait administrer).');
      console.log(issue === 'deja' ? `= ${identifiant} était déjà désactivé.` : `✓ ${identifiant} désactivé ; ses sessions ouvertes sont coupées. (Journalisé.)`);
      break;
    }
    case 'reactiver': {
      const identifiant = exigerIdentifiant();
      await gardeProduction();
      await confirmerParIdentifiant(identifiant, 'RÉACTIVER');
      const issue = await reactiverCompteCli(identifiant);
      if (issue === 'introuvable') throw new ErreurCompte(`Aucun compte « ${identifiant} ».`);
      console.log(issue === 'deja' ? `= ${identifiant} était déjà actif.` : `✓ ${identifiant} réactivé (même rôle, mêmes droits, même mot de passe). (Journalisé.)`);
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
      console.error('Sous-commande inconnue. Utilisez : creer | reset | secours | desactiver | reactiver | lister.');
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
