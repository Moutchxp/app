/**
 * CLI `gestion:google:verifier` — LOT 5-GOOGLE : la connexion de `gestion@criterimmo.fr` répond-elle ?
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 STRICTEMENT EN LECTURE. Trois questions, trois requêtes GET, et rien d'autre :
 *   ① quel compte est connecté (Drive `about`) ;
 *   ①bis un message LU par son Message-ID (`--message=<id>`), pour confirmer que `gmail.modify` est accordée ;
 *   ② quelles signatures Gmail existent, et leurs premiers mots (`settings/sendAs`) ;
 *   ③ quels Drive partagés sont visibles — LES NOMS SEULEMENT (`drives`).
 * AUCUN envoi, AUCUNE écriture, AUCUN fichier créé, AUCUN fichier listé. Ce script ne peut rien casser : c'est
 * précisément ce qui permet de le relancer autant de fois qu'on veut quand quelque chose cloche.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔒 Le jeton n'est jamais affiché : on en dit la longueur, jamais la valeur.
 *
 * Usage : npm run gestion:google:verifier
 */
import '../lib/chargerEnv';
import {
  COMPTE_GESTION, chercherParMessageId, estCompteAttendu, lireCompte, lireIdentifiants, lireMessageGmail,
  lireSignatures, listerDrivesPartages, masquerJeton, rafraichirJeton, resumerSignature,
} from '../lib/gestion/google';
import { cheminJeton, lireJeton } from '../lib/gestion/googleJeton';

const P = '[gestion:google:verifier]';

async function main(): Promise<void> {
  const identifiants = lireIdentifiants();
  if (identifiants === null) {
    console.error(`${P} Aucun identifiant de client OAuth dans .env. Voir docs/GUIDE_CONNEXION_GOOGLE_GESTION.md`);
    process.exitCode = 2;
    return;
  }

  const jeton = lireJeton();
  if (jeton === null) {
    console.error(`${P} Pas encore autorisé : aucun jeton trouvé (${cheminJeton()}).`);
    console.error(`${P} Lance d’abord : npm run gestion:google:autoriser`);
    process.exitCode = 2;
    return;
  }

  console.log('');
  console.log(`${P} Jeton   : ${masquerJeton(jeton.refreshToken)}`);
  if (jeton.compte) console.log(`${P} Écrit pour : ${jeton.compte}${jeton.obtenuLe ? ` — le ${jeton.obtenuLe.slice(0, 10)}` : ''}`);
  console.log('');

  const acces = await rafraichirJeton({ identifiants, refreshToken: jeton.refreshToken }, { fetch });
  if (!acces.ok) {
    console.error(`${P} ❌ ${acces.motif}`);
    console.error(`${P}    Refaire : npm run gestion:google:autoriser`);
    process.exitCode = 1;
    return;
  }

  // ── ① LE COMPTE ────────────────────────────────────────────────────────────────────────────────────────────────
  const compte = await lireCompte(acces.valeur, { fetch });
  if (!compte.ok) { console.error(`${P} ❌ ${compte.motif}`); process.exitCode = 1; return; }
  const bonCompte = estCompteAttendu(compte.valeur.email);
  console.log(`${P} ① Compte connecté : ${compte.valeur.email}${compte.valeur.nom ? ` (${compte.valeur.nom})` : ''} ${bonCompte ? '✅' : '❌'}`);
  if (!bonCompte) {
    console.error(`${P}    ATTENDU : ${COMPTE_GESTION}. Refais l’autorisation avec la bonne boîte.`);
    process.exitCode = 1;
    return;
  }

  // ── ①bis UN MESSAGE LU, pour confirmer `gmail.modify` ──────────────────────────────────────────────────────────
  // 🔴 LECTURE SEULE : on cherche le message le plus récent de la boîte et on lit ses MÉTADONNÉES (ses libellés).
  //   Aucun libellé n'est posé, aucun message n'est modifié. C'est le seul moyen de confirmer que la portée
  //   `gmail.modify` a bien été accordée — une signature lisible ne le prouve pas (elle relève d'une autre portée).
  const idMessage = (process.argv.find((a) => a.startsWith('--message=')) ?? '').slice('--message='.length).trim();
  if (idMessage === '') {
    console.log(`${P} ①bis Lecture d’un message : non demandée (ajoute --message=<Message-ID> pour l’essayer).`);
  } else {
    const trouve = await chercherParMessageId(acces.valeur, idMessage, { fetch });
    if (!trouve.ok) {
      console.log(`${P} ①bis Lecture d’un message : ❌ ${trouve.motif}`);
    } else if (trouve.valeur === null) {
      console.log(`${P} ①bis Lecture d’un message : aucun message ne porte ce Message-ID dans la boîte.`);
    } else {
      const lu = await lireMessageGmail(acces.valeur, trouve.valeur.id, { fetch });
      console.log(lu.ok
        ? `${P} ①bis Lecture d’un message : ✅ trouvé, ${lu.valeur.libelles.length} libellé(s) — aucune modification faite.`
        : `${P} ①bis Lecture d’un message : ❌ ${lu.motif}`);
    }
  }

  // ── ② LES SIGNATURES ───────────────────────────────────────────────────────────────────────────────────────────
  const sigs = await lireSignatures(acces.valeur, { fetch });
  if (!sigs.ok) {
    console.log(`${P} ② Signatures : ❌ ${sigs.motif}`);
  } else if (sigs.valeur.length === 0) {
    console.log(`${P} ② Signatures : aucune adresse d’envoi rendue par Gmail.`);
  } else {
    console.log(`${P} ② Signatures Gmail (${sigs.valeur.length} adresse(s) d’envoi) :`);
    for (const s of sigs.valeur) {
      const resume = resumerSignature(s.signature);
      const marque = s.parDefaut ? ' [par défaut]' : '';
      console.log(`${P}    · ${s.adresse}${marque} — ${resume === '' ? 'aucune signature configurée' : `« ${resume} »`}`);
    }
  }

  // ── ③ LES DRIVE PARTAGÉS (noms seulement) ──────────────────────────────────────────────────────────────────────
  const drives = await listerDrivesPartages(acces.valeur, { fetch });
  if (!drives.ok) {
    console.log(`${P} ③ Drive partagés : ❌ ${drives.motif}`);
  } else if (drives.valeur.length === 0) {
    console.log(`${P} ③ Drive partagés : aucun visible par ce compte.`);
    console.log(`${P}    (Si « Gestion locative » existe, vérifie que ${COMPTE_GESTION} y est bien membre.)`);
  } else {
    console.log(`${P} ③ Drive partagés visibles (noms seulement, aucun fichier listé) :`);
    for (const n of drives.valeur) console.log(`${P}    · ${n}`);
  }

  console.log('');
  console.log(`${P} ✅ Vérification terminée. Aucun envoi, aucune écriture, aucun fichier créé.`);
  console.log('');
}

void main().catch((e) => {
  console.error(`${P} échec`, e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
