/**
 * ══ 🔴🔴 LES ENTRÉES FANTÔMES DU REGISTRE DES DÉPÔTS — LA LIGNE DE COMMANDE ══════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « Si le registre ou l'index gardent l'ancien emplacement après un déplacement :
 * corrige, et nettoie les entrées fantômes existantes (simulation, nombre et exemples, puis application). Une
 * entrée fantôme = fileId dont les parents réels Drive ne correspondent plus, ou fichier à la corbeille ou
 * absent. »
 *
 * 🔴 CE FICHIER NE CONTIENT PLUS LA RÈGLE — LOT FANTOMES-APRES-INDEXATION. Elle vit dans
 * `lib/gestion/fantomesEmplacements`, parce que le BALAYAGE l'appelle désormais après chaque passe `changes.list`
 * (décision d'Arno). Deux écritures de la même détection auraient fini par ne plus corriger la même chose — et
 * c'est la ligne de commande, celle qu'on lance rarement, qui aurait pris du retard.
 *
 * Il reste donc ce qu'une ligne de commande doit être : la PORTE vers Google, l'affichage, et le choix d'écrire.
 *
 * 🔒🔒 SANS `--appliquer`, CE SCRIPT N'ÉCRIT RIEN — ni en base, ni ailleurs. C'est le mode par défaut.
 * 🔒🔒 IL N'ÉCRIT JAMAIS DANS LE DRIVE, ET IL NE SAIT PAS LE FAIRE : il n'émet que des `files.get`, et aucun
 * module d'écriture Drive n'est importé. Aucune ligne n'est SUPPRIMÉE de la base, jamais.
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/nettoyer-emplacements-fantomes.ts              # simule, n'écrit rien
 *   npx tsx --env-file=.env app/scripts/nettoyer-emplacements-fantomes.ts --max=50     # borne les `files.get`
 *   npx tsx --env-file=.env app/scripts/nettoyer-emplacements-fantomes.ts --appliquer
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { query } from '../lib/db/client';
import {
  journaliserFantomes, nettoyerFantomes, phraseBilanFantomes, VERIFICATIONS_MAX, type DepsFantomes,
} from '../lib/gestion/fantomesEmplacements';

/** 🔒 Le compte qui LIT, avec la délégation qui existe déjà — le même que le balayage de l'index. */
const SUJET = 'a.jorel@sansvisavis.com';
const API = 'https://www.googleapis.com/drive/v3';
/** 🔒 Les champs demandés, et pas un de plus. Aucun ne porte de contenu. */
const CHAMPS = 'id,name,parents,trashed';

const APPLIQUER = process.argv.includes('--appliquer');
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) ?? '').slice(6)) || VERIFICATIONS_MAX;

/**
 * LA PORTE VERS GOOGLE — un seul `fetch`, sans option de méthode, donc un `GET`.
 *
 * ⚠️ LE NOM DES DOSSIERS EST MÉMORISÉ : plusieurs fantômes peuvent partager le même dossier d'arrivée, et
 * redemander son nom à chaque ligne serait un appel pour rien.
 */
export function depsReelles(jeton: string): DepsFantomes {
  const h = { Authorization: `Bearer ${jeton}` };
  const noms = new Map<string, string>();
  const lire = async (chemin: string): Promise<{ ok: true; j: Record<string, unknown> } | { ok: false; statut: number }> => {
    const r = await fetch(`${API}/${chemin}`, { headers: h });
    if (!r.ok) return { ok: false, statut: r.status };
    return { ok: true, j: (await r.json()) as Record<string, unknown> };
  };
  return {
    lireFichier: async (id) => {
      const r = await lire(`files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=${CHAMPS}`);
      if (!r.ok) return r;
      return {
        ok: true,
        valeur: {
          nom: String(r.j.name ?? ''),
          parents: (r.j.parents as string[] | undefined) ?? [],
          trashed: r.j.trashed === true,
        },
      };
    },
    nomDossier: async (id) => {
      const deja = noms.get(id);
      if (deja !== undefined) return deja;
      const r = await lire(`files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name`);
      if (!r.ok) return null;
      const nom = String(r.j.name ?? '').trim();
      if (nom !== '') noms.set(id, nom);
      return nom === '' ? null : nom;
    },
  };
}

async function main(): Promise<void> {
  const j = await jetonPourSubject(SUJET);
  if (!j.ok) { console.error('🔴 jeton Drive indisponible :', j.motif); process.exit(1); }

  const { rows: vives } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM gestion_piece_drive WHERE disparu_le IS NULL AND btrim(drive_file_id) <> ''`);
  console.log(`registre : ${vives[0]?.n ?? '?'} lignes vives`);
  console.log(`${APPLIQUER ? '🔴 APPLICATION' : 'SIMULATION'} — vérification de chaque candidat chez Google\n`);

  const bilan = await nettoyerFantomes(depsReelles(j.jeton), {
    appliquer: APPLIQUER, max: MAX, dire: (l) => console.log(l),
  });
  console.log(`\n${phraseBilanFantomes(bilan, APPLIQUER)}`);
  if (APPLIQUER) await journaliserFantomes(bilan, true);
  else console.log('Aucune écriture. Relancer avec --appliquer pour corriger.');
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
