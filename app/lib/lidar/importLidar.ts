/**
 * ══ IMPORT LiDAR HD — L'ORCHESTRATION DU CHARGEMENT (lot du 14/10/2026) ═══════════════════════════════════════════════════
 *
 * Testable PAR INJECTION : aucun réseau, aucune base, aucun fichier ici — tout passe par `DepsChargement`
 * (`scripts/lidar-import.ts` câble les vrais). Ce module tient les règles :
 *   · NE SUPPRIME JAMAIS une dalle : une dalle PRÉSENTE est sautée ; une dalle INCOHÉRENTE (trou ou doublon de tuiles)
 *     n'est jamais touchée, seulement signalée — on ne « répare » pas en effaçant ;
 *   · UNE DALLE = UNE TRANSACTION, les deux couches ensemble (`deps.importer`) : une coupure ne laisse jamais une dalle à
 *     moitié en base ; relancer reprend où on en était (les dalles déjà chargées sont présentes, donc sautées) ;
 *   · la présence est RE-VÉRIFIÉE dans la transaction (`importer` rend « deja_presente ») : deux lancements simultanés ne
 *     chargent jamais deux fois la même dalle ;
 *   · un échec sur une dalle est ISOLÉ (journalisé, compté), les autres continuent ;
 *   · les fichiers téléchargés d'une dalle sont effacés une fois la dalle importée (ou trouvée déjà présente).
 */
import { COUCHES, nomDalle, type CoucheLidar, type Dalle, type EtatDalle } from './grilleLidar';

export interface EvenementJournal {
  dalle: string;
  etape: 'sautee' | 'incoherente' | 'telechargee' | 'verifiee' | 'importee' | 'deja_presente' | 'echec';
  detail?: string;
}

export interface DepsChargement {
  /** État en base de chaque dalle demandée (clé = `nomDalle`). */
  etats(dalles: readonly Dalle[]): Promise<Map<string, EtatDalle>>;
  /** Télécharge une couche d'une dalle dans le dossier temporaire ; rend le chemin du fichier complet. */
  telecharger(dalle: Dalle, couche: CoucheLidar): Promise<string>;
  /** Contrôle d'intégrité du fichier (format, emprise, pixel, nodata, SRID) ; rend un motif si refusé. */
  verifier(dalle: Dalle, couche: CoucheLidar, chemin: string): Promise<{ ok: true } | { ok: false; motif: string }>;
  /** Importe les deux couches de la dalle dans UNE transaction ; « deja_presente » si elle est apparue entre-temps. */
  importer(dalle: Dalle, fichiers: Readonly<Record<CoucheLidar, string>>): Promise<'importee' | 'deja_presente'>;
  /** Efface les fichiers temporaires de la dalle (jamais autre chose). */
  effacer(chemins: readonly string[]): Promise<void>;
  journal(e: EvenementJournal): void;
}

export interface BilanChargement {
  demandees: number;
  sautees: number;
  incoherentes: string[];
  importees: number;
  dejaPresentes: number;
  echecs: { dalle: string; motif: string }[];
}

async function chargerUne(dalle: Dalle, deps: DepsChargement): Promise<'importee' | 'deja_presente'> {
  const nom = nomDalle(dalle);
  const fichiers: Partial<Record<CoucheLidar, string>> = {};
  // En cas d'échec, les fichiers déjà téléchargés restent pour diagnostic ; la reprise les re-télécharge (et les écrase).
  for (const couche of COUCHES) {
    const chemin = await deps.telecharger(dalle, couche);
    fichiers[couche] = chemin;
    deps.journal({ dalle: nom, etape: 'telechargee', detail: `${couche} ${chemin}` });
    const v = await deps.verifier(dalle, couche, chemin);
    if (!v.ok) throw new Error(`${couche} refusé : ${v.motif}`);
    deps.journal({ dalle: nom, etape: 'verifiee', detail: couche });
  }
  const issue = await deps.importer(dalle, fichiers as Record<CoucheLidar, string>);
  deps.journal({ dalle: nom, etape: issue });
  await deps.effacer(Object.values(fichiers) as string[]); // après import réussi (ou dalle déjà là) seulement
  return issue;
}

/**
 * Charge les dalles ABSENTES parmi `dalles`, `paralleles` à la fois. Rend le bilan. Ne lève jamais pour une dalle en
 * échec (isolée) ; ne lève que si l'état des dalles ne peut pas être lu.
 */
export async function chargerDalles(dalles: readonly Dalle[], paralleles: number, deps: DepsChargement): Promise<BilanChargement> {
  const etats = await deps.etats(dalles);
  const bilan: BilanChargement = { demandees: dalles.length, sautees: 0, incoherentes: [], importees: 0, dejaPresentes: 0, echecs: [] };
  const aCharger: Dalle[] = [];
  for (const d of dalles) {
    const nom = nomDalle(d);
    const etat = etats.get(nom) ?? 'absente';
    if (etat === 'presente') { bilan.sautees += 1; deps.journal({ dalle: nom, etape: 'sautee' }); continue; }
    if (etat === 'incoherente') { bilan.incoherentes.push(nom); deps.journal({ dalle: nom, etape: 'incoherente', detail: 'jamais touchée : à examiner à la main' }); continue; }
    aCharger.push(d);
  }

  let suivant = 0;
  const travailleur = async (): Promise<void> => {
    while (suivant < aCharger.length) {
      const d = aCharger[suivant];
      suivant += 1;
      try {
        const issue = await chargerUne(d, deps);
        if (issue === 'importee') bilan.importees += 1; else bilan.dejaPresentes += 1;
      } catch (e) {
        const motif = e instanceof Error ? e.message : String(e);
        bilan.echecs.push({ dalle: nomDalle(d), motif });
        deps.journal({ dalle: nomDalle(d), etape: 'echec', detail: motif });
      }
    }
  };
  const n = Math.max(1, Math.min(Math.floor(paralleles) || 1, aCharger.length || 1));
  await Promise.all(Array.from({ length: n }, () => travailleur()));
  return bilan;
}
