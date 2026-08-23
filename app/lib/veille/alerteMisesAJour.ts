import type { AffichageProtocoles } from '../admin/protocolesReingestion';

/**
 * FRAÎCHEUR / G4 — alerte e-mail « bases prêtes à être mises à jour », GROUPÉE et RARE. Cœur PUR (empreinte anti-spam +
 * composition du message) + orchestrateur INJECTABLE. Lot qui ENVOIE réellement → étape ISOLÉE dans executerVeille (ses erreurs
 * restent les siennes). Atteint par le CLI `veille:run` → ce module NE DOIT PAS importer `server-only`.
 *
 * Règle anti-spam : un e-mail part UNIQUEMENT quand une NOUVELLE source apparaît dans le jeu en attente. Liste identique → rien ;
 * liste qui rétrécit → aucun e-mail mais empreinte absorbée (pour qu'un retour ré-alerte) ; liste vide → jamais.
 */

/** Une source en attente de mise à jour, enrichie de tout ce qu'il faut pour agir SANS ouvrir l'admin. */
export interface SourceEnAttente {
  cle: string;
  nom: string;
  millesimeBase: string;   // millésime actuellement en base
  editionDistante: string; // édition plus récente détectée
  automatisee: boolean;    // interrupteur d'ingestion nocturne (F6) actif → rien à faire à la main
  commande: string | null; // bloc de commande TIRÉ du parseur F5 (null si automatisée)
  espaceDisque: string | null; // ligne « ESPACE DISQUE REQUIS » TIRÉE du parseur F5 (null si automatisée)
}

/** Empreinte de la liste = cles TRIÉES jointes par « | » (déterministe ET décodable pour retrouver le set précédent). */
export function empreinteDe(cles: string[]): string {
  return [...cles].sort().join('|');
}

/** Décode une empreinte en liste de cles. null/'' → []. */
export function decoderEmpreinte(empreinte: string | null): string[] {
  return empreinte ? empreinte.split('|').filter(Boolean) : [];
}

/** Commande de réingestion d'une source, LUE dans les protocoles F5 (jamais réécrite ici). null si absente. */
export function commandeProtocole(protocoles: AffichageProtocoles, cle: string): string | null {
  const s = protocoles.sections.find((x) => x.present && x.cle === cle);
  if (!s || !s.present) return null;
  const cmd = s.elements.find((e) => e.type === 'commande');
  return cmd && cmd.type === 'commande' ? cmd.commande : null;
}

/** Ligne « ESPACE DISQUE REQUIS » d'une source, LUE dans les protocoles F5. null si absente. */
export function espaceDisqueProtocole(protocoles: AffichageProtocoles, cle: string): string | null {
  const s = protocoles.sections.find((x) => x.present && x.cle === cle);
  if (!s || !s.present) return null;
  const p = s.elements.find((e) => e.type === 'prose' && e.texte.includes('ESPACE DISQUE REQUIS'));
  return p && p.type === 'prose' ? p.texte.trim() : null;
}

/**
 * Compose l'e-mail (sujet + corps texte brut, sobre, lisible sur téléphone). Le SUJET porte le nombre de bases et un marqueur
 * INTERNE « [Données SVAV] » pour ne JAMAIS être confondu, dans la boîte, avec une relance partie vers une mairie. Une source
 * automatisée dit qu'elle s'ingérera seule et n'affiche AUCUNE commande ; si TOUTES le sont, le message reste informatif et ne
 * demande aucun geste (pas une fausse liste de travail).
 */
export function composerAlerteMaj(sources: SourceEnAttente[]): { sujet: string; corps: string } {
  const n = sources.length;
  const s = n > 1 ? 's' : '';
  const sujet = `[Données SVAV] ${n} base${s} de données prête${s} à être mise${s} à jour`;

  const aGeste = sources.filter((x) => !x.automatisee);
  const lignes: string[] = [];
  lignes.push('Bonjour,', '');
  lignes.push(`${n} base${s} de données ${n > 1 ? 'sont prêtes' : 'est prête'} à être mise${s} à jour.`, '');

  for (const src of sources) {
    lignes.push(`— ${src.nom} : millésime en base ${src.millesimeBase}, édition disponible ${src.editionDistante}.`);
    if (src.automatisee) {
      lignes.push('   Automatisée : elle s’ingérera d’elle-même la nuit prochaine, rien à faire.');
    } else {
      if (src.espaceDisque) lignes.push(`   ${src.espaceDisque}`);
      if (src.commande) {
        lignes.push('   Commande à coller (application Terminal de macOS, fenêtre neuve) :');
        for (const l of src.commande.split('\n')) lignes.push(`     ${l}`);
      }
    }
    lignes.push('');
  }

  if (aGeste.length === 0) {
    lignes.push('Rien à faire de votre part : toutes ces mises à jour sont automatisées et partiront cette nuit.');
  } else {
    lignes.push('Protocoles complets : écran « Sources de données » de l’admin, ou docs/PROTOCOLES_REINGESTION.md.');
  }
  lignes.push('', '— Sans Vis-à-Vis (message automatique interne)');

  return { sujet, corps: lignes.join('\n') };
}

// ── Orchestrateur injectable ──────────────────────────────────────────────────

export interface DepsAlerteMaj {
  /** Interrupteur DÉDIÉ + destinataire (config_veille.alerte_maj_active + alerte_email). Migration absente → active:false. */
  config(): Promise<{ active: boolean; email: string }>;
  /** Empreinte de la dernière liste traitée (config_veille.alerte_maj_empreinte), ou null. */
  empreintePrecedente(): Promise<string | null>;
  /** Le jeu EN ATTENTE (misesAJourActionnables), enrichi — la MÊME base que les capsules G3 / la pastille. */
  enAttente(): Promise<SourceEnAttente[]>;
  /** Écrit l'empreinte (marquée sur succès d'envoi, OU absorbée quand la liste rétrécit). */
  majEmpreinte(empreinte: string): Promise<void>;
  journaliser(empreinte: string, destinataire: string, sujet: string, resultat: 'envoyee' | 'erreur', erreur: string | null): Promise<void>;
  /** Envoi RÉEL (SMTP) — injecté ; les tests ne l'appellent jamais avec un vrai transport. */
  envoyer(destinataire: string, sujet: string, corps: string): Promise<void>;
}

export type IssueAlerteMaj = 'desactive' | 'sans_email' | 'liste_vide' | 'inchange' | 'absorbe' | 'envoye' | 'echec';

/**
 * Une passe d'alerte (par tick, sous le verrou global → jamais concurrente). Envoie AU PLUS un e-mail. Empreinte marquée
 * seulement sur SUCCÈS ; un échec journalise l'erreur complète et LAISSE l'empreinte (le prochain tick réessaiera une fois).
 */
export async function executerAlerteMisesAJour(deps: DepsAlerteMaj): Promise<{ issue: IssueAlerteMaj }> {
  const cfg = await deps.config();
  if (!cfg.active) return { issue: 'desactive' }; // interrupteur off (défaut) → rien
  if (!cfg.email) return { issue: 'sans_email' }; // pas de destinataire configuré → rien

  const sources = await deps.enAttente();
  const empS = empreinteDe(sources.map((x) => x.cle));
  const E = (await deps.empreintePrecedente()) ?? '';

  if (sources.length === 0) {
    if (empS !== E) await deps.majEmpreinte(empS); // liste redevenue vide → on absorbe (jamais d'e-mail sur liste vide)
    return { issue: 'liste_vide' };
  }
  if (empS === E) return { issue: 'inchange' }; // liste identique → aucun rappel, quel que soit le nombre de ticks

  const nouvelles = sources.map((x) => x.cle).filter((c) => !decoderEmpreinte(E).includes(c));
  if (nouvelles.length === 0) {
    // La liste a seulement RÉTRÉCI (des sources ont été ingérées) → aucun e-mail, mais empreinte mise à jour pour ré-alerter au retour.
    await deps.majEmpreinte(empS);
    return { issue: 'absorbe' };
  }

  // Une NOUVELLE source est apparue → un e-mail (contenu = tout le jeu courant).
  const { sujet, corps } = composerAlerteMaj(sources);
  try {
    await deps.envoyer(cfg.email, sujet, corps);
    await deps.majEmpreinte(empS); // marquée SEULEMENT après succès (jamais deux envois pour la même empreinte)
    await deps.journaliser(empS, cfg.email, sujet, 'envoyee', null);
    return { issue: 'envoye' };
  } catch (e) {
    const erreur = e instanceof Error ? e.message : String(e);
    await deps.journaliser(empS, cfg.email, sujet, 'erreur', erreur); // erreur complète journalisée
    return { issue: 'echec' }; // empreinte NON marquée → l'alerte n'est pas perdue ; le prochain tick réessaiera
  }
}
