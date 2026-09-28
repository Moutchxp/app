import { query } from '../db/client';
import { chargerConfigGestion } from './config';
import type { AncrageFil, DepsEnvoiComplet } from './envoi';
import { envoyerViaGmail } from './envoiGmail';
import { depsPiecesEnvoi, piecesDeLEnvoi } from './piecesEnvoiCablage';
import { COMPTE_GESTION, lireIdentifiants, rafraichirJeton } from './google';
import { lireJeton } from './googleJeton';
import { actionJournalEnvoi, cibleJournalEnvoi, commentaireJournalEnvoi } from './journalEnvoi';
import { motifLisible } from './motifEchec';
import { finaliserEnvoi, marquerBrouillonEnvoye, ouvrirEnvoi } from './redactionRepo';
import { journalEnvoiDisponible } from './schema';

/**
 * MODULE « GESTION » — LOT ENVOI-ARRIERE-PLAN : LE CÂBLAGE RÉEL D'UN ENVOI, EN UN SEUL ENDROIT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CE FICHIER EXISTE. Il y a désormais DEUX appelants de `envoyerMessage` : la route (envoi synchrone,
 * quand la migration 271 n'est pas là) et le travailleur de fond (file d'envoi). Recopier le câblage dans les deux
 * donnerait deux façons d'envoyer un mail — donc deux à surveiller, et un jour deux comportements. Le jeton, le
 * journal, les pièces, la finalisation : tout cela vit ici, une fois.
 *
 * ⚠️ CE FICHIER NE DÉCIDE RIEN. L'ordre des gestes reste dans `envoi.ts` ; ce qui est ici n'est que le monde réel
 * (Google, base, stockage) branché sur les points d'injection.
 *
 * 🔒 LE JETON DE gestion@ NE SORT PAS D'ICI, et il n'y a qu'UN endroit qui sait le rafraîchir — celui-ci.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * CE À QUOI ON RÉPOND, lu dans le message d'origine : son `Message-ID`, sa chaîne `References`. C'est ce qui range
 * la réponse DANS le fil chez le correspondant — sans quoi le mail arrive orphelin, et personne ne voit de quoi on
 * parle.
 *
 * ⚠️ DÉPLACÉ ICI AU LOT ENVOI-ARRIERE-PLAN : la route n'est plus seule à envoyer, le travailleur de fond en a
 * besoin aussi, et deux copies de cette lecture divergeraient.
 */
export async function ancrageDuMessage(messageId: number | null): Promise<AncrageFil> {
  if (messageId === null) return { messageIdRfc: null, references: null, threadId: null };
  const { rows } = await query<{ message_id: string | null; references_brut: string | null }>(
    `SELECT message_id, references_brut FROM gestion_message WHERE id = $1`, [messageId]);
  return {
    messageIdRfc: rows[0]?.message_id?.trim() || null,
    references: rows[0]?.references_brut?.trim() || null,
    threadId: null, // Gmail retrouve le fil par les en-têtes ; on ne stocke pas encore son identifiant de fil.
  };
}

/** Ce que l'appelant doit fournir : la vérification du droit, et de quoi ancrer la réponse dans son fil. */
export interface CablageEnvoi {
  /**
   * 🔴 LE DROIT, RELU EN BASE À CHAQUE FOIS. La route le lit depuis la session ; le travailleur de fond le lit
   * depuis l'auteur enregistré dans la file. Un droit retiré entre le clic et l'envoi différé DOIT couper l'envoi :
   * c'est précisément le cas que la relecture en base existe pour attraper.
   */
  peutEnvoyer(): Promise<boolean>;
  ancrage(repondAMessageId: number | null): Promise<AncrageFil>;
  /** D'où vient l'envoi, pour les journaux du serveur. « route » ou « file ». */
  origine: string;
}

export function depsEnvoiReel(c: CablageEnvoi): DepsEnvoiComplet {
  const identifiants = lireIdentifiants();

  const deps: DepsEnvoiComplet = {
    peutEnvoyer: c.peutEnvoyer,
    jetonAcces: async () => {
      const jeton = lireJeton();
      if (identifiants === null || jeton === null) return null;
      try {
        const acces = await rafraichirJeton({ identifiants, refreshToken: jeton.refreshToken }, { fetch });
        return acces.ok ? acces.valeur : null;
      } catch {
        return null; // Google injoignable : on ne prétend pas envoyer, et le brouillon reste où il est
      }
    },
    expediteur: async () => {
      const config = await chargerConfigGestion();
      return { adresse: config.adresseGestion || COMPTE_GESTION, nom: 'Gestion' };
    },
    // Les PIÈCES, lues au dernier moment (voir `envoi.ts`). `deps.jetonAcces` est réemployé tel quel : un seul
    //   endroit sait rafraîchir le jeton de gestion@, et il n'y en aura jamais deux.
    pieces: (d) => piecesDeLEnvoi(d, depsPiecesEnvoi(() => deps.jetonAcces())),
    ancrage: c.ancrage,
    ouvrirEnvoi,
    envoyer: (o) => envoyerViaGmail(o, { fetch }),
    finaliser: finaliserEnvoi,
    marquerBrouillonEnvoye,
    journaliser: async (l) => {
      const cible = cibleJournalEnvoi({
        envoiId: l.envoiId, filId: null, repondAMessageId: null,
        envoiPermis: await journalEnvoiDisponible(),
      });
      if (cible === null) {
        // Aucun rangement à la fois VRAI et permis : on ne fabrique pas une ligne fausse, on le DIT au serveur.
        console.warn('[gestion/%s] journal métier non écrit : aucune entité permise. envoi=%d', c.origine, l.envoiId);
        return;
      }
      await query(
        `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [cible.entite, cible.entiteId, actionJournalEnvoi(l.issue),
          commentaireJournalEnvoi(l), l.auteur.id, l.auteur.libelle]);
    },
    // 🔴 LE JOURNAL DU SERVEUR, jamais l'écran. Un geste d'après-envoi manqué est une comptabilité en retard, pas
    //   un mail perdu : rien à refaire pour Arno, et c'est nous qui devons le voir.
    incident: (etape, e) => {
      const m = motifLisible(e);
      console.error('[gestion/%s] LE MESSAGE EST PARTI mais « %s » a échoué (%s) — à rattraper à la main : %s',
        c.origine, etape, m.etiquette, e instanceof Error ? e.message : String(e));
    },
    maintenant: () => new Date(),
    alea: () => crypto.randomUUID().replace(/-/g, ''),
  };
  return deps;
}
