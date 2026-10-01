/**
 * ══ 🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — NETTOYER LES PROPOSITIONS NÉES DE NOTRE PROPRE SIGNATURE ══════════
 *
 * Demande d'Arno (point 2) : « Recalcule les propositions existantes polluées par cette adresse, sans toucher aux
 * rattachements manuels, et donne-moi le nombre avant / après. »
 *
 *   npm run gestion:propositions:agence                → SIMULATION : elle compte, elle n'écrit rien
 *   npm run gestion:propositions:agence -- --appliquer  → elle réexamine les conversations concernées
 *
 * ═══ CE QU'ELLE VISE, ET RIEN DE PLUS ═══════════════════════════════════════════════════════════════════════════
 *
 * Les lots dont l'ADRESSE est celle de l'agence (le lot 494, « 2 Rue Mars et Roty »), et les conversations où le
 * moteur les a proposés. Mesuré le 01/10/2026 : 2 226 propositions vivantes sur le seul lot 494, toutes nées de
 * notre signature citée au bas des réponses.
 *
 * 🔴 ELLE NE SUPPRIME RIEN ET NE RETIRE RIEN ELLE-MÊME. Elle REJOUE le moteur sur ces conversations
 * (`examinerFilsPrecis`), avec le texte désormais débarrassé des citations. C'est le moteur qui conclut, et ses
 * garde-fous valent comme toujours : un lien confirmé À LA MAIN survit, un candidat rejeté ne ressuscite pas.
 *
 * 🔴 LE RETRAIT EST SIGNÉ « nettoyage des signatures de l'agence ». Quand 2 226 propositions disparaissent le même
 * jour, personne ne doit avoir à deviner pourquoi six mois plus tard — c'est la leçon du 28/09/2026.
 */
import { query } from '../lib/db/client';
import { citeUneAdresseAgence } from '../lib/gestion/adressesAgence';
import {
  COMPTES_VIDES, chargerLibelles, examinerFilsPrecis, type ComptesPasse,
} from '../lib/gestion/rattachementRepo';
import { rattachementsDisponibles } from '../lib/gestion/schema';

const P = '  ';

/** Les lots dont l'adresse EST celle de l'agence. LECTURE SEULE. */
async function lotsDeLAgence(): Promise<{ cle: string; libelle: string }[]> {
  const { rows } = await query<{ cle: string; adresse: string | null; commune: string | null }>(
    'SELECT wippimmo_id AS cle, adresse, commune FROM gestion_annuaire_lot');
  return rows
    .filter((l) => citeUneAdresseAgence(`${l.adresse ?? ''} ${l.commune ?? ''}`))
    .map((l) => ({ cle: l.cle, libelle: `${l.adresse ?? ''}, ${l.commune ?? ''} — lot ${l.cle}` }));
}

/** Combien de propositions vivantes portent ces lots, et combien de liens y ont été CONFIRMÉS. LECTURE SEULE. */
async function compter(cles: readonly string[]): Promise<{ proposes: number; confirmes: number; fils: number }> {
  const { rows } = await query<{ proposes: string; confirmes: string; fils: string }>(
    `SELECT count(*) FILTER (WHERE r.statut = 'propose')::text AS proposes,
            count(*) FILTER (WHERE r.statut = 'confirme')::text AS confirmes,
            count(DISTINCT m.fil_id)::text AS fils
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.cible_sorte = 'lot' AND r.cible_cle = ANY($1::text[]) AND r.statut IN ('propose', 'confirme')`,
    [cles]);
  const r = rows[0];
  return { proposes: Number(r?.proposes ?? 0), confirmes: Number(r?.confirmes ?? 0), fils: Number(r?.fils ?? 0) };
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  if (!(await rattachementsDisponibles())) {
    console.error('Migration 257 absente : rien à faire.');
    process.exit(1);
  }

  const lots = await lotsDeLAgence();
  console.log('\nLES LOTS À L’ADRESSE DE L’AGENCE');
  for (const l of lots) console.log(`${P}· ${l.libelle}`);
  if (lots.length === 0) { console.log(`${P}(aucun)`); return; }

  const cles = lots.map((l) => l.cle);
  const avant = await compter(cles);
  console.log('\nAVANT');
  console.log(`${P}propositions vivantes   ${avant.proposes}`);
  console.log(`${P}liens CONFIRMÉS         ${avant.confirmes}   (ils ne bougeront pas)`);
  console.log(`${P}conversations touchées  ${avant.fils}`);

  const { rows: fils } = await query<{ fil_id: string }>(
    `SELECT DISTINCT m.fil_id::text AS fil_id
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.cible_sorte = 'lot' AND r.cible_cle = ANY($1::text[]) AND r.statut = 'propose'
        AND m.fil_id IS NOT NULL`, [cles]);
  const filIds = fils.map((f) => Number(f.fil_id));

  if (!appliquer) {
    console.log(`\n🔵 SIMULATION — ${filIds.length} conversation(s) seraient réexaminées. `
      + 'Rien n’a été écrit. Relancez avec --appliquer.');
    return;
  }

  console.log(`\n🔴 RÉEXAMEN de ${filIds.length} conversation(s)…`);
  const comptes: ComptesPasse = { ...COMPTES_VIDES };
  const libelles = await chargerLibelles();
  // Par paquets : une seule transaction par mail, mais une seule lecture de catalogue par paquet.
  const PAQUET = 200;
  for (let i = 0; i < filIds.length; i += PAQUET) {
    await examinerFilsPrecis(filIds.slice(i, i + PAQUET), libelles, comptes, true, {
      auteur: 'nettoyage des signatures de l’agence',
      motif: 'l’adresse venait de notre propre signature, citée dans le mail',
    });
    process.stdout.write(`${P}${Math.min(i + PAQUET, filIds.length)} / ${filIds.length}\r`);
  }

  const apres = await compter(cles);
  console.log('\n\nAPRÈS');
  console.log(`${P}propositions vivantes   ${apres.proposes}`);
  console.log(`${P}liens CONFIRMÉS         ${apres.confirmes}`);
  console.log(`\n${P}messages réexaminés     ${comptes.messagesVus}`);
  console.log(`${P}liens retirés           ${comptes.liensRetires}`);

  console.log(apres.confirmes === avant.confirmes
    ? `\n✅ liens confirmés : ${avant.confirmes} → ${apres.confirmes} (aucun rattachement manuel touché)`
    : `\n🔴 ATTENTION : les liens confirmés ont changé (${avant.confirmes} → ${apres.confirmes})`);
  if (apres.confirmes !== avant.confirmes) process.exit(1);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
