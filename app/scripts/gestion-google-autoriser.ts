/**
 * CLI `gestion:google:autoriser` — LOT 5-GOOGLE : autoriser UNE FOIS l'application à agir au nom de
 * `gestion@criterimmo.fr` (envoi, lecture des signatures, Drive partagé).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 C'EST UN HUMAIN QUI AUTORISE. Ce script ouvre une page de consentement Google et attend ; personne d'autre
 * qu'Arno, connecté à gestion@criterimmo.fr, ne peut cliquer « Autoriser ». Le script ne détient aucun mot de passe et
 * n'en demande aucun.
 *
 * 🔴 IL REFUSE D'ENREGISTRER UN AUTRE COMPTE. Après l'échange du code, il demande à Google QUI vient d'autoriser. Si
 * ce n'est pas gestion@criterimmo.fr, rien n'est écrit et le message dit quoi faire. Sans ce contrôle, une session
 * Chrome ouverte sur un compte personnel ferait écrire l'application au nom de quelqu'un d'autre — et cela ne se
 * verrait qu'au premier mail parti de la mauvaise adresse.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ REDIRECTION LOOPBACK, jamais `urn:ietf:wg:oauth:2.0:oob` (supprimée par Google en 2022) : un mini-serveur local
 * sur `http://127.0.0.1:<port libre>` capte le paramètre `code`. Pour un client « application de bureau », le loopback
 * est accepté sans déclaration préalable ; si Google le refuse, le script AFFICHE l'URI exacte à déclarer, au lieu de
 * contourner. Même choix que `drive:autoriser` (chantier N6-B), pour la même raison.
 *
 * 🔒 LE JETON N'EST JAMAIS AFFICHÉ NI JOURNALISÉ. Il est écrit dans un fichier hors dépôt, en 0600 (`googleJeton.ts`).
 * Le script n'imprime que sa longueur.
 *
 * Usage : npm run gestion:google:autoriser
 */
import '../lib/chargerEnv';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  COMPTE_GESTION, echangerCode, estCompteAttendu, lireCompte, lireIdentifiants, masquerJeton, PORTEES_GESTION,
  urlConsentement,
} from '../lib/gestion/google';
import { cheminJeton, ecrireJeton } from '../lib/gestion/googleJeton';

const P = '[gestion:google:autoriser]';

/** Le message de refus, en toutes lettres : ce qui s'est passé, et le geste EXACT qui le répare. PUR. */
export function messageMauvaisCompte(trouve: string): string[] {
  return [
    '',
    `${P} ❌ REFUS — ce n’est pas la bonne boîte.`,
    `${P}    Compte qui vient d’autoriser : ${trouve}`,
    `${P}    Compte attendu              : ${COMPTE_GESTION}`,
    `${P}    RIEN n’a été enregistré.`,
    '',
    `${P} Quoi faire : dans la fenêtre Google, choisis « Utiliser un autre compte » et connecte-toi avec`,
    `${P} ${COMPTE_GESTION}. Puis relance : npm run gestion:google:autoriser`,
    '',
  ];
}

function main(): void {
  const identifiants = lireIdentifiants();
  if (identifiants === null) {
    console.error(`${P} Aucun identifiant de client OAuth trouvé.`);
    console.error(`${P} Renseigne dans .env soit GOOGLE_GESTION_CLIENT_ID + GOOGLE_GESTION_CLIENT_SECRET,`);
    console.error(`${P} soit les GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET déjà en place (le même client convient).`);
    console.error(`${P} Voir docs/GUIDE_CONNEXION_GOOGLE_GESTION.md`);
    process.exitCode = 2;
    return;
  }

  const state = randomUUID();
  let port = 0;

  const serveur = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    // Le navigateur demande aussi /favicon.ico : on l'ignore sans bruit, sinon le script croirait à un échec.
    if (!url.searchParams.has('code') && !url.searchParams.has('error')) { res.statusCode = 204; res.end(); return; }
    const erreur = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    const etatRecu = url.searchParams.get('state');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>Autorisation reçue. Vous pouvez fermer cet onglet et revenir au Terminal.</p>');

    void (async () => {
      try {
        if (erreur) throw new Error(`Google a refusé : ${erreur}`);
        if (etatRecu !== state) throw new Error('Contrôle anti-CSRF échoué (state invalide) — relance la commande.');
        if (!code) throw new Error('Aucun paramètre « code » reçu.');

        const redirectUri = `http://127.0.0.1:${port}`;
        const jetons = await echangerCode({ identifiants, code, redirectUri }, { fetch });
        if (!jetons.ok) throw new Error(jetons.motif);

        // 🔴 LE CONTRÔLE QUI COMPTE : qui vient d'autoriser ? On le demande AVANT d'écrire quoi que ce soit.
        const compte = await lireCompte(jetons.valeur.accessToken, { fetch });
        if (!compte.ok) throw new Error(compte.motif);
        if (!estCompteAttendu(compte.valeur.email)) {
          for (const l of messageMauvaisCompte(compte.valeur.email)) console.error(l);
          process.exitCode = 1;
          return;
        }

        const chemin = cheminJeton();
        ecrireJeton({
          refreshToken: jetons.valeur.refreshToken,
          compte: compte.valeur.email,
          obtenuLe: new Date().toISOString(),
          portees: [...PORTEES_GESTION],
        }, chemin);

        console.log(`\n${P} ✅ AUTORISATION ENREGISTRÉE.`);
        console.log(`${P}    Compte  : ${compte.valeur.email}${compte.valeur.nom ? ` (${compte.valeur.nom})` : ''}`);
        console.log(`${P}    Jeton   : ${masquerJeton(jetons.valeur.refreshToken)}`);
        console.log(`${P}    Fichier : ${chemin}  (droits 0600, hors du dossier du projet)`);
        console.log(`${P}    Portées : ${PORTEES_GESTION.join('  ')}`);
        console.log(`\n${P} Étape suivante — vérifier que tout répond :`);
        console.log(`${P}    npm run gestion:google:verifier\n`);
      } catch (e) {
        console.error(`\n${P} ÉCHEC :`, e instanceof Error ? e.message : String(e));
        console.error(`${P} Rien n’a été enregistré. Voir docs/GUIDE_CONNEXION_GOOGLE_GESTION.md\n`);
        process.exitCode = 1;
      } finally {
        serveur.close();
      }
    })();
  });

  serveur.listen(0, '127.0.0.1', () => {
    const adr = serveur.address();
    port = typeof adr === 'object' && adr !== null ? adr.port : 0;
    const redirectUri = `http://127.0.0.1:${port}`;
    const lien = urlConsentement({ clientId: identifiants.clientId, redirectUri, state });
    console.log('');
    console.log(`${P} Client OAuth utilisé : ${identifiants.source === 'gestion' ? 'dédié (GOOGLE_GESTION_CLIENT_*)' : 'celui du Drive existant (GOOGLE_DRIVE_CLIENT_*)'}`);
    console.log(`${P} Portées demandées, et rien de plus :`);
    for (const p of PORTEES_GESTION) console.log(`${P}    · ${p}`);
    console.log('');
    console.log(`${P} 1) OUVRE CETTE ADRESSE dans Chrome (tu y es déjà connecté à ${COMPTE_GESTION}) :`);
    console.log('');
    console.log(`   ${lien}`);
    console.log('');
    console.log(`${P} 2) Choisis bien le compte ${COMPTE_GESTION}, puis clique « Continuer » / « Autoriser ».`);
    console.log(`${P}    En attente du retour sur ${redirectUri} …`);
    console.log(`${P}    Si Google refuse l’adresse de redirection : déclare EXACTEMENT celle-ci dans la console`);
    console.log(`${P}    Google (Identifiants → ton client OAuth « Application de bureau ») : ${redirectUri}`);
  });
}

main();
