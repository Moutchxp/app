/**
 * ══ 🔴🔴 « ADRESSES MULTIPLES D'UNE COPROPRIÉTÉ », LOT 3 — LA REPRISE RÉELLE DES BÂTIMENTS PAR ADRESSE (Arno, 17/11/2026) ══════════════════════════════
 *
 * Le plan du rapport à blanc (`batiments-par-adresse.ts`, validé par Arno) est APPLIQUÉ : `appliquerPlanBatiments` (rien n'est effacé). À BLANC par
 * défaut (le plan seul, rien d'écrit) ; `--reel` écrit. Refus sans la migration 490. Sauvegarder d'abord le registre et les liens des biens
 * (dans .captures/sauvegardes/, datés) — ce script ne le fait pas lui-même.
 * Le rapport va dans `.captures/copropriete/` (ou `--rapport=<fichier ou dossier>`).
 * Usage : npx tsx --conditions=react-server --env-file=.env app/scripts/batiments-par-adresse-reprise.ts [--reel] [--rapport=…]
 */
import { writeFileSync } from 'node:fs';
import { query } from '../lib/db/client';
import { planBatimentsParAdresse, texteRapportBatiments, type BatimentLu, type BienRelie, type CoproLue, type PreuveDigicode } from '../lib/gestion/batimentsParAdresse';
import { appliquerPlanBatiments } from '../lib/gestion/batimentsParAdresseRepo';
import { cheminRapport } from '../lib/ops/rapportScript';

const AUTEUR = { id: null, libelle: 'reprise des bâtiments par adresse (automatique)' };

async function main(): Promise<void> {
  const reel = process.argv.includes('--reel');
  const { rows: c } = await query<{ id: string; libelle: string; cle: string }>('SELECT id::text, libelle, cle_immeuble AS cle FROM gestion_copropriete ORDER BY id');
  const { rows: sec } = await query<{ copro: string; cle: string; libelle: string }>(
    'SELECT copropriete_id::text AS copro, cle_immeuble AS cle, libelle FROM gestion_copropriete_adresse WHERE retire_le IS NULL ORDER BY id');
  const copros: CoproLue[] = c.map((x) => ({ id: Number(x.id), libelle: x.libelle,
    adresses: [{ cle: x.cle, libelle: x.libelle }, ...sec.filter((a) => a.copro === x.id).map((a) => ({ cle: a.cle, libelle: a.libelle }))] }));
  const { rows: b } = await query<{ id: string; copro: string; cle: string; libelle: string; adresse: string | null }>(
    `SELECT b.id::text, b.copropriete_id::text AS copro, b.batiment_cle AS cle, b.batiment_libelle AS libelle, b.adresse_cle AS adresse
       FROM gestion_copropriete_batiment b ORDER BY b.copropriete_id, b.id`);
  const batiments: BatimentLu[] = b.map((x) => ({ id: Number(x.id), coproId: Number(x.copro), cle: x.cle, libelle: x.libelle, adresseCle: x.adresse }));
  const digicodes: PreuveDigicode[] = (await query<{ a: string; b: string }>(
    `SELECT DISTINCT adresse_cle AS a, batiment_cle AS b FROM gestion_digicode WHERE batiment_cle <> '' AND annule_le IS NULL`)).rows.map((x) => ({ adresseCle: x.a, batimentCle: x.b }));
  const biens: BienRelie[] = (await query<{ id: string; bat: string; immeuble: string | null; adresse: string | null }>(
    `SELECT id::text, copropriete_batiment_id::text AS bat, immeuble, adresse FROM gestion_annuaire_lot WHERE copropriete_batiment_id IS NOT NULL AND absent_le IS NULL ORDER BY id`)).rows
    .map((x) => ({ lotId: Number(x.id), batimentId: Number(x.bat), immeuble: x.immeuble, adresse: x.adresse }));
  const plan = planBatimentsParAdresse(copros, batiments, digicodes, biens);
  const base = (await query<{ b: string }>('SELECT current_database() AS b')).rows[0]?.b ?? '?';
  const quand = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  let texte = texteRapportBatiments(plan, base, quand);
  if (reel) {
    const r = await appliquerPlanBatiments(plan, AUTEUR);
    texte = texte.replace('RAPPORT À BLANC — LES BÂTIMENTS', 'RAPPORT DE REPRISE — LES BÂTIMENTS').replace('AUCUNE ÉCRITURE : ce rapport dit ce que la reprise ferait ; rien n’est repris avant la validation d’Arno.',
      `REPRISE RÉELLE (validée par Arno) : ${r.notees} adresse(s) notée(s), ${r.separes} séparation(s), ${r.nouveaux} nouveau(x) bâtiment(s), ${r.biensSuivis} bien(s) qui suivent leur adresse ; rien effacé.`);
  }
  const demande = process.argv.find((a) => a.startsWith('--rapport='))?.slice('--rapport='.length) ?? null;
  const chemin = cheminRapport({ nomScript: 'copropriete', demande, prefixe: reel ? 'batiments-par-adresse-reprise' : 'batiments-par-adresse-a-blanc' });
  writeFileSync(chemin, texte, 'utf8');
  console.log(texte.split('\n').slice(0, 14).join('\n'));
  console.log(`\nRapport complet : ${chemin}`);
}
void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
