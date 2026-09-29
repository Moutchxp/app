/**
 * LOT ETOILE-ET-SIGNATURE — RATTRAPER LES ÉTOILES EN LISANT GMAIL. Commande : `npm run gestion:etoiles:rattraper`.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ELLE FAIT, ET CE QU'ELLE NE FAIT PAS.
 *
 * Elle fait exactement ce que fait la relève à chaque passe : elle relit `is:starred` chez Gmail et fait coïncider
 * `gestion_message.etoile_le`. AUCUNE ÉTOILE N'EST POSÉE NI RETIRÉE DANS GMAIL — la boîte est lue, jamais écrite.
 * C'est la consigne d'Arno, mot pour mot : « rattrape les écarts en lisant Gmail ; aucune étoile n'est posée ni
 * retirée de ton propre chef ».
 *
 * ⚠️ ELLE EXISTE PARCE QUE LA PREMIÈRE PASSE EST LONGUE : 611 étoiles, donc 611 lectures d'en-tête. La lancer à la
 * main une fois évite d'attendre la relève suivante, et donne les NOMBRES avant/après qu'Arno a demandés.
 *
 * 🔒 LECTURE SEULE CÔTÉ GOOGLE : `messages.list` puis `format=metadata` sur le seul en-tête `Message-Id`. Aucun
 * corps rapatrié, aucun libellé touché.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { config } from 'dotenv';
config();
import { query } from '../lib/db/client';
import { mapConcurrenceBornee } from '../lib/concurrence';
import { lireEnteteGmail, listerEtoilesGmail } from '../lib/gestion/google';
import { jetonAccesGestion } from '../lib/gestion/jetonAcces';
import { reconcilierEtoiles } from '../lib/gestion/etoileGmailRepo';
import { etoileGmailDisponible } from '../lib/gestion/schema';

async function compter(): Promise<{ messages: number; fils: number }> {
  const { rows } = await query<{ m: number; f: number }>(
    `SELECT count(*)::int AS m, count(DISTINCT fil_id)::int AS f
       FROM gestion_message WHERE etoile_le IS NOT NULL`);
  return { messages: rows[0]?.m ?? 0, fils: rows[0]?.f ?? 0 };
}

async function main(): Promise<void> {
  if (!await etoileGmailDisponible()) {
    console.log('Migration 277 non appliquée : la colonne `etoile_le` n’existe pas. Rien à faire.');
    return;
  }
  const avant = await compter();
  console.log(`AVANT — chez nous : ${avant.messages} message(s) étoilé(s), ${avant.fils} échange(s).`);

  const jeton = await jetonAccesGestion();
  if (jeton.etat !== 'ok') { console.error('Google indisponible :', jeton.motif); process.exitCode = 1; return; }

  const liste = await listerEtoilesGmail(jeton.jeton, { fetch });
  if (!liste.ok) { console.error(liste.motif); process.exitCode = 1; return; }
  console.log(`GMAIL — ${liste.valeur.length} message(s) étoilé(s).`);

  const entetes = await mapConcurrenceBornee(liste.valeur, 5,
    (m) => lireEnteteGmail(jeton.jeton, m.id, { fetch }));
  const rates = entetes.filter((r) => !r.ok).length;
  if (rates > 0) {
    // 🔴 ON NE RÉCONCILIE JAMAIS SUR UNE LECTURE INCOMPLÈTE : ce serait retirer l'étoile de ce qu'on n'a pas lu.
    console.error(`${rates} en-tête(s) illisible(s) sur ${liste.valeur.length} — rien n’a été écrit.`);
    process.exitCode = 1;
    return;
  }
  const ids = entetes.map((r) => (r.ok ? r.valeur.messageIdRfc : null)).filter((m): m is string => m !== null);

  const r = await reconcilierEtoiles(ids);
  if (r === null) { console.error('Réconciliation impossible.'); process.exitCode = 1; return; }
  if (r.refuse === 'aucune_correspondance') {
    console.error('REFUSÉE : Gmail porte des étoiles, aucune ne correspond chez nous. Rien n’a été retiré.');
    process.exitCode = 1;
    return;
  }
  const apres = await compter();
  console.log(`ÉCRIT — ${r.poses} étoile(s) posée(s), ${r.retires} retirée(s).`);
  console.log(`APRÈS — chez nous : ${apres.messages} message(s) étoilé(s), ${apres.fils} échange(s).`);
  const inconnus = liste.valeur.length - apres.messages;
  if (inconnus > 0) {
    console.log(`⚠️ ${inconnus} message(s) étoilé(s) chez Gmail ne sont pas dans notre base (jamais relevés, ou `
      + 'venus d’un autre dossier). Ils apparaîtront s’ils sont capturés un jour.');
  }
}

main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
