/**
 * N6-A — SCRIPT JETABLE de RECON (lecture seule) : que contient un mail « permis » dont les pièces > 25 Mo ont été remplacées
 * par des liens Google Drive ? Réutilise `creerClientBoite` (imap.ts) TEL QUEL — aucune modification de la brique IMAP, aucune
 * écriture, aucun dépôt, aucun e-mail. NON câblé (recon uniquement). Lancer : npx tsx app/scripts/recon-mail-drive.ts
 */
import '../lib/chargerEnv';
import { lireCompteImap } from '../lib/email';
import { creerClientBoite } from '../lib/email/imap';

const RE_DRIVE = /https?:\/\/(?:drive|docs)\.google\.com\/[^\s"'<>\\)]+/gi;

function normaliserObjet(o: string | null | undefined): string {
  return (o ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^\s*(re|fwd|fw|tr)\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
}

/** Classe une URL Drive : identifiant de FICHIER exploitable, DOSSIER, ou page de partage indéterminée. */
function classerUrl(u: string): string {
  let m: RegExpMatchArray | null;
  if ((m = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/))) return `FICHIER (file/d) id=${m[1]}`;
  if ((m = u.match(/[?&]id=([a-zA-Z0-9_-]+)/))) return `FICHIER (?id=) id=${m[1]}`;
  if ((m = u.match(/\/(?:document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/))) return `FICHIER (docs éditeur) id=${m[1]}`;
  if ((m = u.match(/\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/))) return `DOSSIER (folders) id=${m[1]}`;
  return 'INDÉTERMINÉ (page de partage ?)';
}

function urlsDe(txt: string | undefined | null): string[] {
  if (!txt) return [];
  return [...new Set((txt.match(RE_DRIVE) ?? []).map((u) => u.replace(/&amp;/g, '&')))];
}

/** Fenêtre HTML autour d'une URL pour voir la structure/le nom de fichier voisin (bornée, texte dé-balisé pour lisibilité). */
function contexte(html: string, url: string): string {
  const i = html.indexOf(url.replace(/&/g, '&amp;')) >= 0 ? html.indexOf(url.replace(/&/g, '&amp;')) : html.indexOf(url);
  if (i < 0) return '(non retrouvée telle quelle dans le HTML)';
  const seg = html.slice(Math.max(0, i - 300), i + 120);
  return seg.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main(): Promise<void> {
  const compte = lireCompteImap('');
  if (compte === null) { console.error('[recon] compte IMAP par défaut absent (SMTP_*/IMAP_*).'); process.exitCode = 2; return; }
  console.log(`[recon] IMAP ${compte.host}:${compte.port} user=${compte.user}`);

  const client = creerClientBoite(compte);
  await client.ouvrir();
  try {
    const depuis = new Date('2026-08-14T00:00:00Z');
    const uids = await client.chercher({ depuis, from: 'a.jorel@sansvisavis.com' });
    console.log(`[recon] ${uids.length} message(s) FROM a.jorel@sansvisavis.com depuis le 14/08 : uids ${uids.join(', ') || '(aucun)'}`);

    for (const uid of uids) {
      const mb = await client.telechargerMessage(uid);
      const objet = mb.message.objet ?? '';
      const estPermis = normaliserObjet(objet) === 'permis';
      console.log('\n' + '═'.repeat(90));
      console.log(`UID ${uid} | date ${mb.recuLe.toISOString()} | de ${mb.message.deAdresse} | objet « ${objet} »${estPermis ? '  ← PERMIS' : ''}`);

      // Q1 — pièces MIME de type pièce jointe
      console.log(`\n[Q1] pièces jointes MIME : ${mb.pieces.length}`);
      for (const p of mb.pieces) console.log(`      · ${p.nomFichier} — ${p.typeMime ?? '?'} — ${p.tailleOctets ?? '?'} octets`);

      // Q2/Q3 — URL Drive dans text/plain et text/html
      const uPlain = urlsDe(mb.message.corpsTexte);
      const uHtml = urlsDe(mb.message.corpsHtml);
      console.log(`\n[Q2] text/plain : ${mb.message.corpsTexte ? mb.message.corpsTexte.length + ' car.' : 'ABSENT'} — ${uPlain.length} URL Drive`);
      for (const u of uPlain) console.log(`      RAW ${u}\n          → ${classerUrl(u)}`);
      console.log(`[Q2] text/html  : ${mb.message.corpsHtml ? mb.message.corpsHtml.length + ' car.' : 'ABSENT'} — ${uHtml.length} URL Drive`);
      for (const u of uHtml) {
        console.log(`      RAW ${u}\n          → ${classerUrl(u)}`);
        if (mb.message.corpsHtml) console.log(`          contexte: …${contexte(mb.message.corpsHtml, u)}…`);
      }

      // Q4 — trace structurée ailleurs : en-têtes bruts (on liste les clés + celles potentiellement liées aux pièces/Drive)
      const entetes = mb.message.entetes ?? {};
      const cles = Object.keys(entetes);
      console.log(`\n[Q4] en-têtes (${cles.length}) : ${cles.join(', ')}`);
      for (const k of cles) {
        if (/attach|drive|google|x-|content-type/i.test(k)) console.log(`      ${k}: ${entetes[k].slice(0, 200)}`);
      }

      // Q5 — noms de fichiers ailleurs : heuristique sur le HTML (Gmail affiche le nom près du lien)
      const noms = new Set<string>();
      if (mb.message.corpsHtml) for (const m of mb.message.corpsHtml.matchAll(/([\w %.\-()]+\.(?:pdf|zip|docx?|xlsx?|jpe?g|png|dwg|tiff?))/gi)) noms.add(m[1].trim());
      if (mb.message.corpsTexte) for (const m of mb.message.corpsTexte.matchAll(/([\w %.\-()]+\.(?:pdf|zip|docx?|xlsx?|jpe?g|png|dwg|tiff?))/gi)) noms.add(m[1].trim());
      console.log(`\n[Q5] noms de fichiers repérés dans le corps : ${noms.size ? [...noms].map((n) => `« ${n} »`).join(', ') : '(aucun)'}`);
    }
  } finally {
    await client.fermer();
  }
}

void main().catch((e) => { console.error('[recon] échec', e); process.exitCode = 1; });
