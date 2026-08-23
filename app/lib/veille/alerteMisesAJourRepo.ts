// PAS de `server-only` : ce module est atteint par le CLI `veille:run` (executerVeille → alerte G4). Il réutilise les mêmes
// lectures/fonctions que l'écran Sources et la pastille G3, pour un jeu EN ATTENTE strictement identique.
import { query } from '../db/client';
import { lireSourcesFraicheur } from '../admin/sourcesFraicheurRepo';
import { construireEtatSources } from '../admin/sourcesFraicheur';
import { lireDetections } from './detectionRepo';
import { lireFichierProtocoles } from '../admin/protocolesRepo';
import { construireAffichageProtocoles } from '../admin/protocolesReingestion';
import { misesAJourActionnables } from '../admin/pastilleSources';
import { lireConfigIngestionAuto } from './ingestionAutoRepo';
import { commandeProtocole, espaceDisqueProtocole, type DepsAlerteMaj, type SourceEnAttente } from './alerteMisesAJour';

/**
 * FRAÎCHEUR / G4 — I/O de l'alerte (server-only INTERDIT, cf. en-tête). Tout est RÉSILIENT à l'ordre d'application : migration
 * 144 absente → alerte_maj_active illisible → active:false → AUCUN envoi. Le journal est protégé par to_regclass.
 */

type Requete = <R>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;
const q: Requete = <R>(text: string, params?: unknown[]) => query(text, params) as unknown as Promise<{ rows: R[] }>;

/** Interrupteur dédié + destinataire. Migration 144 absente (colonne manquante) → défaut SÛR (inactif). */
export async function lireConfigAlerteMaj(req: Requete = q): Promise<{ active: boolean; email: string }> {
  try {
    const { rows } = await req<{ alerte_maj_active: boolean; alerte_email: string | null }>(
      `SELECT alerte_maj_active, alerte_email FROM config_veille WHERE id = 1`,
    );
    const r = rows[0];
    if (!r) return { active: false, email: '' };
    return { active: r.alerte_maj_active === true, email: (r.alerte_email ?? '').trim() };
  } catch (e) {
    console.error('[alerte-maj] config indisponible → alerte désactivée (migration 144 pas appliquée ?)', e);
    return { active: false, email: '' }; // REPLI SÛR : aucun envoi
  }
}

async function empreintePrecedente(req: Requete = q): Promise<string | null> {
  try {
    const { rows } = await req<{ e: string | null }>(`SELECT alerte_maj_empreinte AS e FROM config_veille WHERE id = 1`);
    return rows[0]?.e ?? null;
  } catch {
    return null; // colonne absente → comme « jamais notifié » (mais l'envoi reste bloqué par config inactive)
  }
}

async function majEmpreinte(empreinte: string, req: Requete = q): Promise<void> {
  await req(`UPDATE config_veille SET alerte_maj_empreinte = $1 WHERE id = 1`, [empreinte]);
}

async function journalExiste(req: Requete = q): Promise<boolean> {
  try {
    const { rows } = await req<{ t: string | null }>(`SELECT to_regclass('public.alerte_maj_journal') AS t`);
    return rows[0]?.t != null;
  } catch {
    return false;
  }
}

async function journaliser(empreinte: string, destinataire: string, sujet: string, resultat: 'envoyee' | 'erreur', erreur: string | null, req: Requete = q): Promise<void> {
  if (!(await journalExiste(req))) return;
  try {
    await req(
      `INSERT INTO alerte_maj_journal (empreinte, destinataire, sujet, resultat, erreur) VALUES ($1, $2, $3, $4, $5)`,
      [empreinte, destinataire, sujet, resultat, erreur],
    );
  } catch (e) {
    console.error('[alerte-maj] journal impossible', e);
  }
}

/** Le jeu EN ATTENTE, enrichi — MÊMES lectures/fonctions que l'écran Sources et la pastille (misesAJourActionnables). */
export async function enAttenteAlerteMaj(): Promise<SourceEnAttente[]> {
  const [lectures, detections, texte, cfgAuto] = await Promise.all([
    lireSourcesFraicheur(), lireDetections(), lireFichierProtocoles(), lireConfigIngestionAuto(),
  ]);
  const lignes = construireEtatSources(lectures, new Date(), detections);
  const protocoles = construireAffichageProtocoles(texte);
  const actifsAuto = cfgAuto.actifs as Record<string, boolean>;

  return misesAJourActionnables(lignes, protocoles).map((l): SourceEnAttente => {
    const automatisee = actifsAuto[l.cle] === true;
    return {
      cle: l.cle,
      nom: l.nom,
      millesimeBase: l.millesimeAffiche,
      editionDistante: l.detection?.statut === 'mise_a_jour' ? l.detection.editionDistante : '(inconnue)',
      automatisee,
      commande: automatisee ? null : commandeProtocole(protocoles, l.cle),
      espaceDisque: automatisee ? null : espaceDisqueProtocole(protocoles, l.cle),
    };
  });
}

/** Envoi RÉEL via le compte SMTP par défaut (from = MAIL_FROM). Import DYNAMIQUE : garde nodemailer hors du graphe statique du CLI. */
async function envoyerReel(destinataire: string, sujet: string, corps: string): Promise<void> {
  const { lireConfigEmail, obtenirTransporteur, envoyerAlerte } = await import('../email');
  const cfg = lireConfigEmail();
  if (cfg === null) throw new Error('compte SMTP par défaut non configuré (SMTP_* / MAIL_FROM)');
  await envoyerAlerte(obtenirTransporteur(cfg), cfg.from, { to: destinataire, sujet, corps });
}

/** Dépendances RÉELLES de l'orchestrateur (production). */
export function depsReellesAlerteMisesAJour(): DepsAlerteMaj {
  return {
    config: () => lireConfigAlerteMaj(),
    empreintePrecedente: () => empreintePrecedente(),
    enAttente: enAttenteAlerteMaj,
    majEmpreinte: (empreinte) => majEmpreinte(empreinte),
    journaliser: (empreinte, destinataire, sujet, resultat, erreur) => journaliser(empreinte, destinataire, sujet, resultat, erreur),
    envoyer: (destinataire, sujet, corps) => envoyerReel(destinataire, sujet, corps),
  };
}
