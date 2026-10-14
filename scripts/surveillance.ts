/**
 * ══ npm run surveillance — SURVEILLANCE DU SERVEUR, ÊTRE PRÉVENU PAR MAIL (lot SURVEILLANCE DU SERVEUR) ══
 *
 *   npm run surveillance                          → une passe : contrôles, puis mails dus (apparition / rappel 6 h /
 *                                                    résolu / récapitulatif de 8 h). Lancé toutes les 5 min par
 *                                                    svav-surveillance.timer.
 *   npm run surveillance -- --unite=svav-veille.service
 *                                                  → échec d'une unité (svav-alerte@.service, via OnFailure=) : mail
 *                                                    immédiat avec les 30 dernières lignes de son journal.
 *   npm run surveillance -- --essai [--unite=…]   → affiche les contrôles et les mails qui partiraient, SANS rien
 *                                                    envoyer et SANS toucher au fichier d'état.
 *
 * Observe seulement : ne redémarre rien, n'écrit jamais en base. Logique et garde-fous : `app/lib/ops/surveillance.ts`.
 * Réglages (`.env`, tous facultatifs) : SURVEILLANCE_DESTINATAIRE, SURVEILLANCE_URL, SURVEILLANCE_SAUVEGARDES_LOCALES,
 * SURVEILLANCE_OVH, SURVEILLANCE_RECAP (oui/non), SURVEILLANCE_RECAP_HEURE, SURVEILLANCE_ETAT (fichier d'état).
 * Mail : compte SMTP par défaut (SMTP_* + MAIL_FROM). Un envoi raté s'écrit dans le journal système, sans boucle.
 * Code de sortie : toujours 0 sauf panne de la surveillance elle-même — un problème observé n'est pas un échec.
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lireConfigEmail, obtenirTransporteur } from '../app/lib/email';
import { ENTETE_AUTO_EMISSION, VALEUR_AUTO_EMISSION } from '../app/lib/email/enteteAuto';
import {
  controler, executer, lireEtat, lireReglages, planifier, planifierEchecUnite, rendreEssai, type Envoi, type Etat, type Expedier,
} from '../app/lib/ops/surveillance';
import { finDuJournal, sondesSysteme } from '../app/lib/ops/surveillanceSysteme';

const ESSAI = process.argv.includes('--essai');
const UNITE = process.argv.find((a) => a.startsWith('--unite='))?.slice('--unite='.length).trim() || null;
const FICHIER_ETAT = (process.env.SURVEILLANCE_ETAT ?? '').trim() || '/var/lib/svav-surveillance/etat.json';

async function lireFichierEtat(): Promise<Etat> {
  try { return lireEtat(await fs.readFile(FICHIER_ETAT, 'utf8')); } catch { return lireEtat(null); }
}

/** Écriture atomique (fichier temporaire puis renommage) : une passe coupée ne laisse jamais un état à moitié écrit. */
async function ecrireFichierEtat(e: Etat): Promise<void> {
  await fs.mkdir(path.dirname(FICHIER_ETAT), { recursive: true });
  const tmp = `${FICHIER_ETAT}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(e, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, FICHIER_ETAT);
}

function expediteur(destinataire: string): Expedier {
  return async (mail) => {
    const config = lireConfigEmail();
    if (!config) throw new Error('compte SMTP par défaut non configuré (SMTP_* ou MAIL_FROM manquant)');
    await obtenirTransporteur(config).sendMail({
      from: config.from, to: destinataire, subject: mail.sujet, text: mail.corps,
      headers: { [ENTETE_AUTO_EMISSION]: VALEUR_AUTO_EMISSION },
    });
  };
}

async function main(): Promise<void> {
  const reglages = lireReglages(process.env);
  const maintenant = new Date();
  const machine = os.hostname();
  const etat = await lireFichierEtat();

  let envois: Envoi[];
  let controles = null;
  if (UNITE) {
    const e = planifierEchecUnite(etat, UNITE, await finDuJournal(UNITE), maintenant, machine);
    envois = e ? [e] : [];
    if (!e) console.log(`[surveillance] échec de ${UNITE} déjà signalé il y a moins de 6 h : pas de nouveau mail.`);
  } else {
    controles = await controler(sondesSysteme(process.env.DATABASE_URL), reglages, maintenant);
    envois = planifier(etat, controles, maintenant, reglages, machine);
  }

  if (ESSAI) {
    console.log(rendreEssai(controles, envois, reglages.destinataire));
    return;
  }

  if (controles) {
    const n = controles.problemes.length;
    console.log(`[surveillance] ${controles.lignes.length} contrôles, ${n} problème(s)${n ? ` : ${controles.problemes.map((p) => p.titre).join(' ; ')}` : ''}.`);
  }
  const apres = await executer(etat, envois, expediteur(reglages.destinataire), maintenant, (m) => console.error(m));
  if (apres !== etat) await ecrireFichierEtat(apres);
}

main().catch((e) => {
  console.error('[surveillance] panne de la surveillance :', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
