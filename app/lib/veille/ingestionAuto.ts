/**
 * FRAÎCHEUR / F6 — cœur PUR + orchestrateur INJECTABLE de l'ingestion automatique nocturne. Le SEUL lot de la série F qui
 * EXÉCUTE une ingestion → vigilance maximale. Atteint par le CLI `veille:run` (executerVeille → étape isolée) : ce module NE
 * DOIT PAS importer `server-only` (précédent incident du 09/08).
 *
 * Règles verrouillées : interrupteurs à false par défaut ; fenêtre nocturne (défaut 3h-6h) ; hors fenêtre → attente, jamais de
 * rattrapage en journée ; une ingestion par tick ; une tentative par source et par nuit ; garde-fou disque AVEC MARGE ; toute
 * exécution laisse une trace. Les I/O sont injectées (`DepsIngestionAuto`) → les tests ne lancent JAMAIS une vraie ingestion.
 */

/**
 * ⚠️ WHITELIST DE SÉCURITÉ EXPLICITE — les sources RÉELLEMENT automatisables (cas a strict : complet, outillé, sans étape
 * manuelle). Pour un lot qui LANCE un processus, on ne DÉRIVE JAMAIS « peut s'exécuter seul » d'une prose parsée : un typo dans
 * docs/PROTOCOLES_REINGESTION.md pourrait sinon activer l'auto-ingestion de BD TOPO bâtiment (bascule édition-spécifique qui
 * touche la table du moteur de verdict) ou de Patrimoine (psql manuel). Ces cas (b)/(c) sont EXCLUS à dessein — liste en dur ASSUMÉE.
 */
export const SOURCES_AUTOMATISABLES = ['dila', 'prada', 'sitadel', 'cadastre'] as const;
export type SourceAuto = (typeof SOURCES_AUTOMATISABLES)[number];

/** Vrai si `cle` est une source automatisable (garde de type). */
export function estAutomatisable(cle: string): cle is SourceAuto {
  return (SOURCES_AUTOMATISABLES as readonly string[]).includes(cle);
}

/**
 * MARGE de sécurité disque, NOMMÉE et COMMENTÉE : on n'exécute que si (espace requis + MARGE) tient. Un import qui remplit le
 * disque au dernier octet casse PostgreSQL (WAL, fichiers temporaires de tri), pas seulement l'ingestion. 5 Go, indépendant du
 * « libre » du jour : la règle doit tenir le jour où Arno n'aura plus 88 Gi mais 10.
 */
export const MARGE_DISQUE_OCTETS = 5 * 1024 ** 3;

/** Espace transitoire requis par source (téléchargement + extraction), HORS marge. Dérivé des volumes documentés en F5. */
export const DISQUE_REQUIS_OCTETS: Record<SourceAuto, number> = {
  sitadel: 1 * 1024 ** 3, // ~880 Mo de CSV
  dila: 500 * 1024 ** 2, // ~360 Mo (all_latest.tar.bz2)
  cadastre: 150 * 1024 ** 2, // ~35 Mo/dép + extraction
  prada: 50 * 1024 ** 2, // petit CSV
};

/** Espace libre EXIGÉ pour une source = requis + marge de sécurité. */
export function requisAvecMarge(source: SourceAuto): number {
  return DISQUE_REQUIS_OCTETS[source] + MARGE_DISQUE_OCTETS;
}

/** Un millésime cadastre est une donnée EXTERNE (lue sur etalab) → motif STRICT à valider avant tout passage en argument. */
export const MILLESIME_DATE_MOTIF = /^\d{4}-\d{2}-\d{2}$/;
/** Liste de départements « NN,NN,… » — validée avant passage en argument (jamais concaténée dans un shell). */
export const DEPTS_MOTIF = /^\d{2}(,\d{2})*$/;

/** Fenêtre nocturne : `now` est-il dans [début, fin) ? Gère une fenêtre qui traverse minuit (début > fin). */
export function dansFenetre(now: Date, debut: number, fin: number): boolean {
  const h = now.getHours();
  if (debut === fin) return false; // fenêtre vide → jamais (sûr)
  if (debut < fin) return h >= debut && h < fin; // même jour (ex. 3..6)
  return h >= debut || h < fin; // traverse minuit (ex. 23..2)
}

/** Clé de nuit 'YYYY-MM-DD' : pour une fenêtre traversant minuit, les heures après minuit comptent pour la nuit de la veille. */
export function nuitCourante(now: Date, debut: number, fin: number): string {
  const d = new Date(now);
  if (debut > fin && now.getHours() < fin) d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

/** Valide les arguments du spawn cadastre (données externes) — refuse plutôt que de transmettre tel quel. */
export function validerArgsCadastre(millesime: string, depts: string): { ok: true } | { ok: false; erreur: string } {
  if (!MILLESIME_DATE_MOTIF.test(millesime)) return { ok: false, erreur: `millésime cadastre invalide/absent : « ${millesime} » — exécution refusée` };
  if (!DEPTS_MOTIF.test(depts)) return { ok: false, erreur: `départements invalides : « ${depts} »` };
  return { ok: true };
}

// ── Orchestrateur injectable ──────────────────────────────────────────────────

export interface ConfigIngestionAuto {
  fenetre: { debut: number; fin: number };
  actifs: Record<SourceAuto, boolean>;
}

export interface DepsIngestionAuto {
  maintenant(): Date;
  /** Config : interrupteurs + fenêtre. Migration absente → tout false (repli sûr). */
  config(): Promise<ConfigIngestionAuto>;
  /** Sources ayant une mise à jour actionnable (détectée périmée ET procédure réelle). */
  actionnables(): Promise<Set<string>>;
  /** Une tentative existe-t-elle déjà pour (source, nuit) ? Table absente → true (bloque : pas de trace, pas d'exécution). */
  dejaTentee(source: string, nuit: string): Promise<boolean>;
  /** Octets libres sur le volume, ou null si indéterminable (traité comme insuffisant : on ne remplit jamais le disque). */
  disqueLibre(): Promise<number | null>;
  journaliserRefus(source: string, nuit: string, motif: string, detail: string): Promise<void>;
  journaliserDebut(source: string, nuit: string, debut: Date): Promise<number | null>;
  journaliserFin(id: number | null, fin: Date, resultat: 'succes' | 'echec', erreur: string | null): Promise<void>;
  /** LANCE l'ingestion réelle (fonction lib, ou spawn CLI pour cadastre). Le SEUL endroit qui exécute. */
  executerRunner(source: SourceAuto): Promise<{ ok: boolean; erreur: string | null }>;
}

export interface ResultatIngestionAuto {
  agi: 'rien' | 'hors_fenetre' | 'refus' | 'succes' | 'echec';
  source?: string;
  motif?: string;
}

/**
 * Une passe d'ingestion auto (appelée à chaque tick de la veille, sous le verrou consultatif global → jamais concurrente).
 * Agit sur AU PLUS UNE source par tick (la première éligible). Hors fenêtre → attente. Défauts config tout-false → rien.
 */
export async function executerIngestionAuto(deps: DepsIngestionAuto): Promise<ResultatIngestionAuto> {
  const cfg = await deps.config();
  const now = deps.maintenant();
  if (!dansFenetre(now, cfg.fenetre.debut, cfg.fenetre.fin)) return { agi: 'hors_fenetre' }; // attente, aucun rattrapage

  const nuit = nuitCourante(now, cfg.fenetre.debut, cfg.fenetre.fin);
  const actionnables = await deps.actionnables();

  for (const source of SOURCES_AUTOMATISABLES) {
    if (!cfg.actifs[source]) continue; // interrupteur OFF (défaut)
    if (!actionnables.has(source)) continue; // pas de mise à jour actionnable
    if (await deps.dejaTentee(source, nuit)) continue; // une tentative par source et par nuit

    // Premier candidat éligible → on agit sur LUI SEUL (une ingestion par tick).
    const libre = await deps.disqueLibre();
    const requis = requisAvecMarge(source);
    if (libre === null || libre < requis) {
      // GARDE-FOU DISQUE bloquant : on n'exécute pas, on trace un refus (qui consomme la tentative de la nuit → pas de boucle).
      await deps.journaliserRefus(source, nuit, 'disque_insuffisant', `libre=${libre ?? 'inconnu'} requis=${requis}`);
      return { agi: 'refus', source, motif: 'disque_insuffisant' };
    }

    const id = await deps.journaliserDebut(source, nuit, deps.maintenant()); // pessimiste : un plantage laisse la tentative tracée
    try {
      const r = await deps.executerRunner(source);
      await deps.journaliserFin(id, deps.maintenant(), r.ok ? 'succes' : 'echec', r.ok ? null : r.erreur);
      return { agi: r.ok ? 'succes' : 'echec', source };
    } catch (e) {
      await deps.journaliserFin(id, deps.maintenant(), 'echec', e instanceof Error ? e.message : String(e));
      return { agi: 'echec', source, motif: 'exception' };
    }
  }
  return { agi: 'rien' };
}

// ── Modèle d'affichage (écran Sources) ─────────────────────────────────────────

export interface StatutSourceAuto {
  cle: string;
  nom: string;
  /** Dans la whitelist → porte un interrupteur ; sinon « manuelle uniquement ». */
  automatisable: boolean;
  actif: boolean;
  /** Si non automatisable : raison courte (« étape manuelle requise » = cas b ; « aucune procédure connue » = cas c). */
  raisonManuelle: string | null;
  /** Activée + actionnable + pas encore tentée cette nuit → l'écran dit « se fera cette nuit ». */
  enAttenteCetteNuit: boolean;
  dernier: { resultat: string; motif: string | null; finiLe: string | null } | null;
}

export interface EtatAutomatisation {
  fenetre: { debut: number; fin: number };
  sources: StatutSourceAuto[];
}

/**
 * Construit le modèle d'affichage. PUR. `avecCommande` = sources dont le protocole F5 a un bloc de commande → sert à distinguer
 * la raison (b) « étape manuelle requise » de (c) « aucune procédure connue » pour les sources NON automatisables.
 */
export function construireEtatAutomatisation(p: {
  sources: { cle: string; nom: string }[];
  actionnables: Set<string>;
  avecCommande: Set<string>;
  fenetre: { debut: number; fin: number };
  actifs: Record<string, boolean>;
  dernierParSource: Record<string, { resultat: string; motif: string | null; finiLe: string | null; nuit: string } | undefined>;
  nuit: string;
}): EtatAutomatisation {
  const sources = p.sources.map((s): StatutSourceAuto => {
    if (!estAutomatisable(s.cle)) {
      const raison = p.avecCommande.has(s.cle) ? 'étape manuelle requise' : 'aucune procédure connue';
      return { cle: s.cle, nom: s.nom, automatisable: false, actif: false, raisonManuelle: raison, enAttenteCetteNuit: false, dernier: null };
    }
    const actif = p.actifs[s.cle] === true;
    const d = p.dernierParSource[s.cle];
    const tenteeCetteNuit = d?.nuit === p.nuit;
    const enAttente = actif && p.actionnables.has(s.cle) && !tenteeCetteNuit;
    return {
      cle: s.cle, nom: s.nom, automatisable: true, actif, raisonManuelle: null,
      enAttenteCetteNuit: enAttente,
      dernier: d ? { resultat: d.resultat, motif: d.motif, finiLe: d.finiLe } : null,
    };
  });
  return { fenetre: p.fenetre, sources };
}
