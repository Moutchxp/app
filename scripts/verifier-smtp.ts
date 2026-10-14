/**
 * ══ npm run smtp:verifier — LES COMPTES D'ENVOI SONT-ILS UTILISABLES ? SANS RIEN ENVOYER (lot PRÉPARATIFS DE BASCULE) ══
 *
 *   npm run smtp:verifier                              → SMTP (défaut + « personne »), API Gmail de gestion@, Agenda
 *   npm run smtp:verifier -- --agenda=prenom@domaine   → l'agenda à lire (défaut : a.jorel@sansvisavis.com)
 *   npm run smtp:verifier -- --sans-gmail --sans-agenda
 *
 * Aucun mail envoyé (SMTP : connexion + authentification, puis QUIT), aucune écriture Gmail ni Agenda, aucun accès Drive.
 * Règles et garde-fous : `app/lib/ops/verifierEnvois.ts`. À lancer depuis la racine du dépôt (`.env` lu dans le dossier
 * courant), sous l'utilisateur du service (le jeton Gmail est cherché dans SON dossier personnel).
 * Code de sortie : 0 si tout est OK, 1 sinon.
 */
import 'dotenv/config';
import { lireCompteSmtp, obtenirTransporteur } from '../app/lib/email';
import { cheminJeton, lireJeton } from '../app/lib/gestion/googleJeton';
import { COMPTE_GESTION, lireIdentifiants, rafraichirJeton } from '../app/lib/gestion/google';
import { jetonAgendaPour } from '../app/lib/gestion/agendaDelegue';
import { COMPTES_SMTP, verifierAgenda, verifierCompteSmtp, verifierGmail, type ResultatVerification } from '../app/lib/ops/verifierEnvois';

const args = new Set(process.argv.slice(2).filter((a) => !a.includes('=')));
const agenda = (process.argv.find((a) => a.startsWith('--agenda='))?.split('=')[1] ?? 'a.jorel@sansvisavis.com').trim();

async function main(): Promise<void> {
  const resultats: ResultatVerification[] = [];

  for (const { nom, infixe } of COMPTES_SMTP) {
    // Le transport de PRODUCTION (mêmes réglages), réduit à verify() et close().
    resultats.push(await verifierCompteSmtp(nom, lireCompteSmtp(infixe), (c) => {
      const t = obtenirTransporteur(c);
      return { verify: () => t.verify(), close: () => t.close() };
    }));
  }

  if (!args.has('--sans-gmail')) {
    resultats.push(await verifierGmail({
      fetch,
      compteAttendu: COMPTE_GESTION,
      jetonAcces: async (f) => {
        const jeton = lireJeton();
        if (!jeton) return { ok: false, motif: `aucun jeton Gmail (GOOGLE_GESTION_REFRESH_TOKEN ou ${cheminJeton()})` };
        const ident = lireIdentifiants();
        if (!ident) return { ok: false, motif: 'client OAuth absent (GOOGLE_GESTION_CLIENT_ID/SECRET ou GOOGLE_DRIVE_CLIENT_ID/SECRET)' };
        return rafraichirJeton({ identifiants: ident, refreshToken: jeton.refreshToken }, { fetch: f });
      },
    }));
  }

  if (!args.has('--sans-agenda')) {
    resultats.push(await verifierAgenda(agenda, {
      fetch,
      jetonAgenda: (adresse, f) => jetonAgendaPour(adresse, { fetch: f }),
      maintenant: () => new Date(),
    }));
  }

  for (const r of resultats) console.log(`${r.ok ? 'OK    ' : 'ÉCHEC '} ${r.quoi}\n       ${r.detail}`);
  const echecs = resultats.filter((r) => !r.ok).length;
  console.log(`\n${resultats.length - echecs} OK, ${echecs} en échec. Aucun message envoyé, aucune écriture.`);
  process.exitCode = echecs > 0 ? 1 : 0;
}

main().catch((e) => { console.error('[smtp:verifier] échec :', e instanceof Error ? e.message : e); process.exitCode = 1; });
