/**
 * ══ 🔴🔴 LOT PARTIES-SYNDIC-ET-IMMEUBLE — DÉCOMPTE DES PARTIES RECLASSÉES « SYNDIC & IMMEUBLE », LECTURE SEULE ══════
 *
 * Pour chaque bien dont la copropriété a une fiche syndic : les adresses de son historique que la fiche syndic
 * reconnaît (cabinet, contacts, carnet de l'immeuble — par l'e-mail, puis par le téléphone de la signature), et la
 * catégorie qu'elles avaient AVANT ce lot dans le bloc PARTIES (fiche du bien + rangements, la même fusion que
 * l'écran). Le décompte dit combien passent de « Tiers indépendant » (et de « Non affecté ») à « Syndic & immeuble »,
 * répartis par rôle ; un propriétaire ou un locataire du bien garde son rôle et est compté à part.
 *
 * 🔒 AUCUNE ÉCRITURE : ni en base (garde ci-dessous), ni sur disque — le résultat sort sur la console.
 * Usage : npx tsx --conditions=react-server --env-file=.env app/scripts/audit-parties-syndic.ts
 */
import { readFileSync } from 'node:fs';
import { query } from '../lib/db/client';
import { ficheLot } from '../lib/gestion/annuaireRepo';
import { categoriesDuBien } from '../lib/gestion/familleDestinataire';
import { coordonneesDesParties, lireCategoriesDuBien } from '../lib/gestion/partieCategorieRepo';
import { personnesSyndicalesDesBiens, syndicauxDuBien } from '../lib/gestion/partiesSyndicRepo';
import { syndicalPrimeSur } from '../lib/gestion/partiesSyndic';
import type { CategoriePartie } from '../lib/gestion/historiqueBien';

const VERBES_INTERDITS = ['INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE', 'ALTER ', 'CREATE ', 'DROP ', 'COMMIT'];

function GARDE_LECTURE_SEULE(): void {
  const code = readFileSync(new URL(import.meta.url).pathname, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.includes('VERBES_INTERDITS'))
    .join('\n')
    .toUpperCase();
  const trouves = VERBES_INTERDITS.filter((v) => code.includes(v));
  if (trouves.length > 0) {
    console.error(`ARRÊT : ce script d'audit contient un verbe d'écriture (${trouves.join(', ')}). Rien n'a été lu.`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  GARDE_LECTURE_SEULE();
  const { rows: lots } = await query<{ id: string; cle: string }>(
    `SELECT lo.id::text, lo.wippimmo_id AS cle FROM gestion_annuaire_lot lo
      WHERE lo.absent_le IS NULL AND lo.wippimmo_id IS NOT NULL ORDER BY lo.id`);
  const personnes = await personnesSyndicalesDesBiens(lots.map((l) => l.cle));
  const avecFiche = lots.filter((l) => (personnes.get(l.cle) ?? []).length > 0);

  const passages: Array<{ lot: string; adresse: string; avant: string; role: string; nom: string }> = [];
  const gardes: Array<{ lot: string; adresse: string; avant: string; role: string }> = [];
  for (const l of avecFiche) {
    const coordonnees = await coordonneesDesParties(l.cle);
    const syndicaux = await syndicauxDuBien(l.cle,
      new Map(coordonnees.map((c) => [c.adresse.trim().toLowerCase(), c.telephone])));
    if (syndicaux.length === 0) continue;
    /* La catégorie d'AVANT ce lot : la fiche du bien, puis les rangements retenus (même fusion que l'écran). */
    const fiche = await ficheLot(Number(l.id));
    const rangees = new Map<string, CategoriePartie>();
    for (const p of await lireCategoriesDuBien(l.cle)) {
      const c = p.retenue?.categorie;
      if (c === 'proprietaire' || c === 'locataire' || c === 'independant') rangees.set(p.adresse.trim().toLowerCase(), c);
    }
    const avant = categoriesDuBien(fiche.etat === 'ok' ? fiche.data : null, rangees);
    for (const s of syndicaux) {
      const c = avant.get(s.adresse);
      const mot = c === undefined ? 'Non affecté' : c === 'independant' ? 'Tiers indépendant' : c;
      if (syndicalPrimeSur(c)) passages.push({ lot: l.cle, adresse: s.adresse, avant: mot, role: s.role, nom: s.nom });
      else gardes.push({ lot: l.cle, adresse: s.adresse, avant: mot, role: s.role });
    }
  }

  const compter = (liste: typeof passages, de: string) => {
    const parRole = new Map<string, number>();
    for (const p of liste.filter((x) => x.avant === de)) parRole.set(p.role, (parRole.get(p.role) ?? 0) + 1);
    return parRole;
  };
  console.log(`Biens examinés : ${lots.length} — dont ${avecFiche.length} avec une fiche syndic ou un carnet d'immeuble`);
  for (const de of ['Tiers indépendant', 'Non affecté']) {
    const liste = passages.filter((p) => p.avant === de);
    const personnesDistinctes = new Set(liste.map((p) => p.adresse)).size;
    console.log(`« ${de} » → « Syndic & immeuble » : ${liste.length} partie(s) de bien, ${personnesDistinctes} personne(s) distincte(s)`);
    for (const [role, n] of compter(passages, de)) console.log(`  · ${role} : ${n}`);
  }
  console.log(`Reconnues mais gardées dans leur rôle de client (propriétaire / locataire l'emporte) : ${gardes.length}`);
  for (const p of passages) console.log(`  · lot ${p.lot} — ${p.adresse} : ${p.avant} → ${p.role} (${p.nom})`);
  for (const g of gardes) console.log(`  · lot ${g.lot} — ${g.adresse} : reste ${g.avant} (aussi ${g.role})`);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
