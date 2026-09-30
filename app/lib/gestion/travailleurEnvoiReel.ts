import { envoyerMessage } from './envoi';
import { ancrageDuMessage, depsEnvoiReel } from './envoiReel';
// ⚠️ `gardeEnvoiCompte`, PAS `gardeEnvoi` : ce dernier porte `server-only` et la relève continue tourne sous tsx.
import { compteePeutEnvoyer } from './gardeEnvoiCompte';
import { lireContenuFichier, lireMetadonnees } from './drive';
import { jetonPourSubject } from './driveDelegue';
import { deposerPieceBrouillon, recuperer } from '../stockage';
import { TAILLE_MAX_TOTALE } from './piecesEnvoi';
import {
  etatDesPieces, lignesAPrendre, lireDemande, marquerAlerte, marquerEchec, marquerEnvoye, marquerPiece,
  mettreEnFile, piecesAPrendre, remettreEnAttente, remettreEnBrouillon,
} from './fileEnvoiRepo';
import { passeEnvoi, type DepsTravailleur, type RapportPasse } from './travailleurEnvoi';
import { fileEnvoiDisponible } from './schema';
import { query } from '../db/client';

/**
 * MODULE « GESTION » — LOT ENVOI-ARRIERE-PLAN : LE TRAVAILLEUR, BRANCHÉ SUR LE MONDE RÉEL.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE DRIVE EST LU, JAMAIS ÉCRIT. Ce fichier n'appelle que `files.get` (métadonnées) et `alt=media` (octets) —
 * par `lireMetadonnees` et `lireContenuFichier`, les deux mêmes fonctions que la route de l'écran. Pas un
 * `files.create`, pas un `files.update`, pas un `permissions.create`. Un test statique le vérifie sur ce SOURCE.
 *
 * 🔴 ET LE VERDICT « JOINDRE » N'EST PAS REJOUÉ ICI, parce qu'il l'a déjà été AU CLIC, par la route qui a accepté
 * la pièce (`/api/admin/gestion/drive/fichiers`, qui remonte la chaîne des parents et refuse tout ce qui est sous
 * « Documents clients scannés »). Une pièce de ce dossier ne peut donc pas entrer dans la file : elle est refusée
 * avant d'y arriver. Rejouer le verdict ici demanderait une seconde copie de la règle, qui divergerait un jour.
 *
 * 🔴 L'ENVOI PASSE PAR `envoyerMessage`, exactement comme l'envoi synchrone : une seule façon d'envoyer un mail
 * dans toute l'application, donc une seule à surveiller. `envoiReel.ts` tient le câblage commun.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** L'adresse qui reçoit les alertes. C'est NOTRE boîte : une alerte ne sort jamais du cabinet. */
export const ADRESSE_ALERTE = 'gestion@criterimmo.fr';

/** La racine des liens mis dans une alerte. Réglable par l'environnement — un lien doit être cliquable. */
function racineWeb(): string {
  return (process.env.SVAV_URL_PUBLIQUE ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * RÉCUPÈRE LES OCTETS D'UNE PIÈCE DU DRIVE ET LES DÉPOSE CHEZ NOUS.
 *
 * ⚠️ LÈVE en cas d'échec : c'est le travailleur qui décide s'il faut réessayer ou renoncer, et il a besoin de la
 * cause pour l'écrire dans l'alerte. Avaler l'erreur ici la remplacerait par un silence.
 */
async function recupererDepuisDrive(p: { id: number; nom: string; driveId: string }): Promise<void> {
  const { rows } = await query<{ brouillon_id: string; source_compte: string | null }>(
    `SELECT brouillon_id::text, source_compte FROM gestion_brouillon_piece WHERE id = $1`, [p.id]);
  const brouillonId = rows[0] ? Number(rows[0].brouillon_id) : null;
  if (brouillonId === null) throw new Error('la pièce n’est plus rattachée à un brouillon');

  /**
   * 🔴🔴 LE DRIVE EST LU AU NOM DE LA PERSONNE QUI A DEMANDÉ LA PIÈCE, jamais au nom de `gestion@`.
   *
   * C'est tout le modèle de droits du module : Google applique les droits du COLLABORATEUR, dossier par dossier,
   * exactement comme sur drive.google.com. En tâche de fond il n'y a plus de session — lire avec le jeton de
   * `gestion@` irait chercher des fichiers que le demandeur n'a peut-être pas le droit de voir. D'où la colonne
   * `source_compte`, posée au clic, et un jeton redemandé POUR ELLE ici.
   *
   * ⚠️ SANS ADRESSE, ON REFUSE. Se rabattre sur un autre compte serait précisément l'élargissement qu'on évite.
   */
  const compte = (rows[0]?.source_compte ?? '').trim();
  if (compte === '') throw new Error('le compte Google d’origine de cette pièce est inconnu');
  const acces = await jetonPourSubject(compte, { fetch });
  if (!acces.ok) throw new Error(acces.motif);
  const jeton = acces.jeton;

  const meta = await lireMetadonnees(jeton, p.driveId, { fetch });
  if (!meta.ok) throw new Error(meta.motif);

  const contenu = await lireContenuFichier(jeton, p.driveId, { fetch }, TAILLE_MAX_TOTALE);
  if (!contenu.ok) throw new Error(contenu.motif);

  const depot = await deposerPieceBrouillon(contenu.valeur, meta.valeur.typeMime || null, {
    brouillonId, tailleMaxOctets: TAILLE_MAX_TOTALE,
  });
  if (!depot.depose) throw new Error(depot.motif);

  await marquerPiece(p.id, { etat: 'prete', cleStockage: depot.cle, taille: contenu.valeur.byteLength });
}

/**
 * ══ 🔴 L'ALERTE PART PAR LA FILE, COMME N'IMPORTE QUEL MAIL ══════════════════════════════════════════════════════
 *
 * Et non par un second chemin d'envoi : un chemin de secours qu'on n'emprunte qu'en cas de panne est un chemin
 * qu'on ne teste jamais, et qui tombe le jour où l'on en a besoin. L'alerte emprunte donc la file — son objet
 * commence par le préfixe qui la fait reconnaître, et `doitAlerter` refuse alors d'alerter sur elle.
 *
 * ⚠️ SANS BROUILLON ni pièce : elle est prête tout de suite, donc elle partira à la passe suivante — c'est-à-dire
 * dans la même passe, puisque le travailleur reprend la file après avoir traité les pièces.
 */
async function alerterParLaFile(a: { objet: string; corps: string }): Promise<void> {
  await mettreEnFile({
    cleIdempotence: `alerte-${crypto.randomUUID().replace(/-/g, '')}`,
    brouillonId: null, filId: null, repondAMessageId: null, voie: 'nouveau',
    a: [ADRESSE_ALERTE], cc: [], cci: [],
    objet: a.objet, corps: a.corps, corpsHtml: null, cibles: [],
  }, { id: null, libelle: 'alerte automatique' });
}

export function depsTravailleurReel(): DepsTravailleur {
  return {
    piecesAPrendre,
    recupererPiece: recupererDepuisDrive,
    // ⚠️ `recupererDepuisDrive` pose déjà « prete » avec la clé et la taille réelle ; ce marquage-ci sert aux
    //   ÉCHECS et aux reprises, où le travailleur seul sait s'il faut réessayer ou renoncer.
    marquerPiece: async (id, m) => { if (m.etat !== 'prete') await marquerPiece(id, m); },
    lignesAPrendre,
    etatDesPieces: async (l) => etatDesPieces(l.brouillonId),
    remettreEnAttente,
    envoyer: async (l) => {
      const d = await lireDemande(l.id);
      if (d === null) return { ok: false, motif: 'la demande d’envoi a disparu' };
      const auteur = { id: d.auteurId, libelle: d.auteurLibelle };
      const issue = await envoyerMessage({
        cleIdempotence: d.cleIdempotence,
        brouillonId: d.brouillonId, filId: d.filId, repondAMessageId: d.repondAMessageId,
        a: d.a, cc: d.cc, cci: d.cci, objet: d.objet, corps: d.corps, voie: d.voie,
        corpsHtml: d.corpsHtml,
        cibles: d.cibles as never,
        // 🔴 LOT RATTACHER-EN-ECRIVANT — l'intention « Interne » survit à la file, et arrive jusqu'à l'envoi.
        interne: d.interne === true,
      }, auteur, depsEnvoiReel({
        // 🔴 LE DROIT EST RELU EN BASE, pour l'auteur enregistré : un droit retiré entre le clic et l'envoi
        //   différé coupe l'envoi. C'est le cas que cette relecture existe précisément pour attraper.
        peutEnvoyer: () => compteePeutEnvoyer(d.auteurId),
        ancrage: ancrageDuMessage,
        origine: 'file',
      }));
      return issue.ok ? { ok: true, envoiId: issue.envoi.id } : { ok: false, motif: issue.motif };
    },
    marquerEnvoye,
    marquerEchec,
    remettreEnBrouillon: async (l) => remettreEnBrouillon(l.brouillonId),
    alerter: async (a) => alerterParLaFile({ objet: a.objet, corps: a.corps }),
    marquerAlerte,
    lienBrouillon: (b) => (b === null
      ? `${racineWeb()}/admin/gestion?etiquette=brouillons`
      : `${racineWeb()}/admin/gestion?etiquette=brouillons&brouillon=${b}`),
    incident: (etape, e) => {
      console.error('[gestion/file] %s a échoué : %s', etape, e instanceof Error ? e.message : String(e));
    },
    maintenant: () => new Date(),
  };
}

/**
 * ══ 🔴 UNE PASSE, APPELÉE DE TROIS ENDROITS ══════════════════════════════════════════════════════════════════════
 *   ① juste après un clic sur « Envoyer » — pour que le mail parte dans la seconde, sans attendre la relève ;
 *   ② à chaque tour de la relève continue (une passe par minute) — le FILET DE SÉCURITÉ demandé par Arno ;
 *   ③ au démarrage du serveur, par la première relève venue — c'est ce qui fait reprendre les envois en attente.
 *
 * 🔴 ELLE NE JETTE JAMAIS. Appelée en tâche de fond depuis une route, une exception remonterait dans le vide et
 * deviendrait un `unhandledRejection` — c'est-à-dire, selon la configuration de Node, un processus qui s'arrête.
 * Une file qui ne se vide pas est un incident ; un serveur qui tombe est une panne.
 */
export async function passeFileEnvoi(): Promise<RapportPasse | null> {
  try {
    if (!(await fileEnvoiDisponible())) return null;
    return await passeEnvoi(depsTravailleurReel());
  } catch (e) {
    console.error('[gestion/file] passe interrompue : %s', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * LANCE UNE PASSE SANS L'ATTENDRE. C'est ce qu'appelle la route d'envoi, juste après avoir mis en file.
 *
 * ⚠️ `void` ASSUMÉ : la réponse est déjà partie vers le navigateur quand celle-ci commence. Si le processus meurt
 * avant la fin, la ligne reste en base et la relève la reprendra — c'est exactement ce contre quoi la file existe.
 */
export function lancerPasseEnFond(): void {
  void passeFileEnvoi();
}
