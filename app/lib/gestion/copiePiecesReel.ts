/**
 * MODULE « GESTION » — LOT DRIVE-2 : LA COPIE, POUR DE VRAI. IMPUR (base, MinIO, Drive).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 TOUTE ÉCRITURE DRIVE PASSE PAR LE GARDE-FOU DE DRIVE-1, sans exception : le dépôt d'un fichier, la création
 * d'un dossier « AAAA / MM » à la demande, et la mise à la corbeille d'une copie douteuse. Le parent doit être sous
 * la racine ET avoir été créé par ce programme. Un refus est journalisé et fait échouer la pièce, jamais passer.
 *
 * 🔴 LA MISE À LA CORBEILLE EST LE SEUL GESTE DE SUPPRESSION DE CE LOT, et il est doublement borné : uniquement sur
 * un fichier que le programme a lui-même créé ET enregistré en base (on relit la ligne avant d'agir), et uniquement
 * parce que sa copie n'a pas pu être vérifiée. Le laisser en place donnerait un doublon dont personne ne saurait
 * lequel est bon. On met à la CORBEILLE (`trashed: true`), jamais `files.delete` : c'est réversible d'un clic.
 *
 * 🔴 AUCUN EFFACEMENT SUR MINIO. Ce lot COPIE. Le vidage est le lot DRIVE-3, séparé, et rien ici ne l'anticipe :
 * `supprimer` n'est même pas importé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { createHash } from 'node:crypto';
import { query } from '../db/client';
import { recuperer } from '../stockage';
import { copiePiecesDisponible } from './schema';
import { MIME_DOSSIER } from './drive';
import {
  indexer, nettoyerNom, verifierEcriture, type IndexArbre, type NoeudArbre,
} from './driveGardeFou';
import { journaliserRefus } from './driveEcriture';
import { enregistrerNoeud } from './driveArbreRepo';
import { verifierCopie, type Verification } from './copiePieces';

const API = 'https://www.googleapis.com/drive/v3';
const API_TELEVERSEMENT = 'https://www.googleapis.com/upload/drive/v3/files';
/** Morceau d'envoi reprenable. Multiple de 256 Kio exigé par l'API ; 8 Mio est le compromis usuel. */
export const MORCEAU_OCTETS = 8 * 1024 * 1024;

/**
 * 🔴 EN DESSOUS DE CE SEUIL, ON ENVOIE EN UNE SEULE REQUÊTE (« multipart »). MESURÉ le 26/09/2026 sur les vraies
 * pièces : un aller-retour vers Google coûte 226 ms, la lecture MinIO 5 ms. L'envoi REPRENABLE en fait DEUX — et
 * vers deux hôtes différents (l'ouverture de session répond une URL sur un autre domaine), donc deux poignées de
 * main TLS. Résultat mesuré : 2,4 s par pièce, soit 17 h pour les 26 396 — une nuit n'y suffit pas.
 *
 * Or la pièce MÉDIANE fait 96 Ko et seules 416 dépassent 5 Mo : payer un protocole de reprise pour 96 Ko, c'est
 * payer la sécurité d'une coupure sur un transfert qui dure un dixième de seconde. Au-dessus du seuil, l'envoi
 * reprenable reprend tous ses droits — c'est là qu'il sert vraiment.
 *
 * ⚠️ LA VÉRIFICATION EST LA MÊME DANS LES DEUX CAS : md5 et taille rendus par Drive, comparés à l'original. Le
 * chemin d'envoi change, la garantie non.
 */
export const SEUIL_MULTIPART_OCTETS = 8 * 1024 * 1024;

export interface DepsCopie {
  fetch: typeof fetch;
  attendre?: (ms: number) => Promise<void>;
}

export type IssueCopie =
  | { ok: true; driveFileId: string; md5: string | null; taille: number; lien: string | null; verification: Verification }
  | { ok: false; refuse: boolean; motif: string };

const dormir = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

/** L'empreinte MD5 d'un contenu — celle que Drive rend, donc celle qu'on doit calculer pour comparer. */
export function md5De(contenu: Buffer | Uint8Array): string {
  return createHash('md5').update(contenu).digest('hex');
}

/**
 * DÉPOSE UNE PIÈCE DANS UN DOSSIER DE NOTRE ARBORESCENCE, EN ENVOI REPRENABLE, ET VÉRIFIE CE QUI EST ARRIVÉ.
 *
 * ⚠️ `fields` DEMANDE EXPLICITEMENT `md5Checksum` ET `size` : sans eux dans la requête, Drive ne les rend pas, et
 * la vérification serait impossible — on croirait avoir vérifié.
 */
export async function copierPiece(
  o: {
    parentDriveId: string; nom: string; description: string;
    typeMime: string | null; octets: Uint8Array; md5Attendu: string;
  },
  index: IndexArbre,
  jeton: string,
  deps: DepsCopie,
): Promise<IssueCopie> {
  const verdict = verifierEcriture({ operation: 'deposer', parentDriveId: o.parentDriveId }, index);
  if (!verdict.ok) {
    await journaliserRefus({ operation: 'deposer', parentDriveId: o.parentDriveId, nom: o.nom }, verdict, 'copie automatique');
    return { ok: false, refuse: true, motif: verdict.motif };
  }

  const type = (o.typeMime ?? '').trim() || 'application/octet-stream';
  const champs = 'id,name,webViewLink,md5Checksum,size';
  const metadonnees = { name: nettoyerNom(o.nom), description: o.description, parents: [o.parentDriveId] };

  // ── LE CHEMIN COURT : une seule requête, pour l'écrasante majorité des pièces. ──
  if (o.octets.byteLength <= SEUIL_MULTIPART_OCTETS) {
    const frontiere = `svav-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    const tete = `--${frontiere}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`
      + `${JSON.stringify(metadonnees)}\r\n--${frontiere}\r\nContent-Type: ${type}\r\n\r\n`;
    const pied = `\r\n--${frontiere}--\r\n`;
    const corps = Buffer.concat([Buffer.from(tete, 'utf8'), Buffer.from(o.octets), Buffer.from(pied, 'utf8')]);

    const res = await deps.fetch(
      `${API_TELEVERSEMENT}?uploadType=multipart&supportsAllDrives=true&fields=${champs}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': `multipart/related; boundary=${frontiere}` },
        body: tampon(corps),
      });
    if (!res.ok) return { ok: false, refuse: false, motif: await motif(res, 'le dépôt') };
    return conclure((await res.json().catch(() => ({}))) as Record<string, unknown>, o.octets.byteLength, o.md5Attendu);
  }

  const p = new URLSearchParams({
    uploadType: 'resumable',
    fields: champs,
    supportsAllDrives: 'true',
  });

  // ── ① Ouvrir la session. Les métadonnées partent ICI, et nulle part ailleurs. ──
  const ouverture = await deps.fetch(`${API_TELEVERSEMENT}?${p}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': type,
      'X-Upload-Content-Length': String(o.octets.byteLength),
    },
    body: JSON.stringify(metadonnees),
  });
  if (!ouverture.ok) {
    return { ok: false, refuse: false, motif: await motif(ouverture, 'l’ouverture du dépôt') };
  }
  const session = ouverture.headers.get('location') ?? ouverture.headers.get('Location');
  if (session === null) return { ok: false, refuse: false, motif: 'Google n’a pas ouvert de session de dépôt.' };

  // ── ② Pousser le contenu, morceau par morceau. ──
  const total = o.octets.byteLength;
  let corpsFinal: Record<string, unknown> | null = null;

  if (total === 0) {
    const res = await deps.fetch(session, { method: 'PUT', headers: { 'Content-Range': 'bytes */0' }, body: tampon(new Uint8Array(0)) });
    if (!res.ok) return { ok: false, refuse: false, motif: await motif(res, 'le dépôt') };
    corpsFinal = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  } else {
    let debut = 0;
    for (let garde = 0; debut < total && garde < 10_000; garde += 1) {
      const fin = Math.min(debut + MORCEAU_OCTETS, total);
      const res = await deps.fetch(session, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${debut}-${fin - 1}/${total}` },
        body: tampon(o.octets.subarray(debut, fin)),
      });
      // 308 = « morceau reçu, continue ». On repart de CE QUE DRIVE DIT avoir reçu, jamais de ce qu'on croit avoir
      //   envoyé : c'est tout l'intérêt de l'envoi reprenable.
      if (res.status === 308) {
        const recu = res.headers.get('range') ?? res.headers.get('Range');
        const borne = recu !== null ? Number(recu.split('-')[1]) : NaN;
        debut = Number.isFinite(borne) ? borne + 1 : fin;
        continue;
      }
      if (!res.ok) return { ok: false, refuse: false, motif: await motif(res, 'le dépôt') };
      corpsFinal = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      break;
    }
    if (corpsFinal === null) {
      return { ok: false, refuse: false, motif: 'Le dépôt n’a pas abouti après de nombreux morceaux.' };
    }
  }

  return conclure(corpsFinal, total, o.md5Attendu);
}

/**
 * CE QUE DRIVE A RENDU, VÉRIFIÉ. Commun aux deux chemins d'envoi — c'est ce qui garantit que le raccourci du
 * chemin court n'affaiblit AUCUNE garantie.
 */
function conclure(corps: Record<string, unknown>, tailleEnvoyee: number, md5Attendu: string): IssueCopie {
  const driveFileId = typeof corps.id === 'string' ? corps.id : '';
  if (driveFileId === '') return { ok: false, refuse: false, motif: 'Drive n’a pas rendu d’identifiant de fichier.' };

  const md5Rendu = typeof corps.md5Checksum === 'string' ? corps.md5Checksum : null;
  const tailleRendue = corps.size === undefined ? null : Number(corps.size);
  return {
    ok: true, driveFileId, md5: md5Rendu, taille: tailleRendue ?? tailleEnvoyee,
    lien: typeof corps.webViewLink === 'string' ? corps.webViewLink : null,
    verification: verifierCopie({ md5Attendu, md5Rendu, tailleAttendue: tailleEnvoyee, tailleRendue }),
  };
}

/**
 * MET À LA CORBEILLE UN FICHIER QUE NOUS AVONS CRÉÉ — le seul geste de suppression de ce lot.
 *
 * 🔴 DOUBLEMENT BORNÉ : l'appelant ne le propose que pour une copie NON VÉRIFIÉE dont il vient de relire la ligne
 * en base, et le garde-fou vérifie que le DOSSIER qui la contient est bien à nous. Et c'est la CORBEILLE
 * (`trashed: true`), pas `files.delete` : réversible d'un clic pendant 30 jours.
 */
export async function corbeillerFichier(
  o: { driveFileId: string; parentDriveId: string },
  index: IndexArbre,
  jeton: string,
  deps: DepsCopie,
): Promise<{ ok: boolean; motif?: string }> {
  const verdict = verifierEcriture(
    { operation: 'supprimer', parentDriveId: o.parentDriveId }, index);
  if (!verdict.ok) {
    await journaliserRefus(
      { operation: 'supprimer', parentDriveId: o.parentDriveId, cibleDriveId: o.driveFileId }, verdict, 'copie automatique');
    return { ok: false, motif: verdict.motif };
  }
  const res = await deps.fetch(`${API}/files/${o.driveFileId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  return res.ok ? { ok: true } : { ok: false, motif: await motif(res, 'la mise à la corbeille') };
}

/**
 * LE DOSSIER « 00 Non rattachés / AAAA / MM », CRÉÉ À LA DEMANDE.
 *
 * 🔴 IL PASSE PAR LE MÊME CHEMIN QUE TOUT LE RESTE : garde-fou, création, puis enregistrement dans la liste
 * blanche — sans quoi le mois suivant ne pourrait rien y déposer. L'index rendu est MIS À JOUR, pour que la
 * même passe puisse s'en servir immédiatement.
 */
export async function dossierPeriode(
  o: { parentDriveId: string; nom: string; cle: string; chemin: string },
  noeuds: NoeudArbre[],
  jeton: string,
  deps: DepsCopie,
): Promise<{ ok: true; driveId: string } | { ok: false; refuse: boolean; motif: string }> {
  const index = indexer(noeuds);
  const verdict = verifierEcriture({ operation: 'creer_dossier', parentDriveId: o.parentDriveId }, index);
  if (!verdict.ok) {
    await journaliserRefus({ operation: 'creer_dossier', parentDriveId: o.parentDriveId, nom: o.nom }, verdict, 'copie automatique');
    return { ok: false, refuse: true, motif: verdict.motif };
  }

  const res = await deps.fetch(`${API}/files?supportsAllDrives=true&fields=id,name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nettoyerNom(o.nom), mimeType: MIME_DOSSIER, parents: [o.parentDriveId] }),
  });
  if (!res.ok) return { ok: false, refuse: false, motif: await motif(res, 'la création du dossier de période') };
  const j = (await res.json()) as { id?: string; name?: string };
  const id = j.id ?? '';
  if (id === '') return { ok: false, refuse: false, motif: 'Drive n’a pas rendu d’identifiant pour ce dossier.' };

  await enregistrerNoeud({
    driveId: id, parentDriveId: o.parentDriveId, sorte: 'periode', cle: o.cle,
    nom: j.name ?? o.nom, chemin: o.chemin,
  });
  noeuds.push({ driveId: id, parentDriveId: o.parentDriveId, sorte: 'periode', nom: j.name ?? o.nom, chemin: o.chemin });
  return { ok: true, driveId: id };
}

/** Les octets d'une pièce, lus sur MinIO, avec leur empreinte MD5. LECTURE SEULE — rien n'est effacé. */
export async function octetsDeLaPiece(cleStockage: string): Promise<{ octets: Buffer; md5: string }> {
  const octets = await recuperer(cleStockage);
  return { octets, md5: md5De(octets) };
}

/** Mémorise une copie VÉRIFIÉE (ou douteuse : `verifieLe` nul), et journalise. */
export async function enregistrerCopie(o: {
  pieceId: number; driveFileId: string; driveDossierId: string; dossierNom: string; lien: string | null;
  md5: string | null; taille: number; verifie: boolean; regle: string; confiance: string; compte: string;
}): Promise<void> {
  await query(
    `INSERT INTO gestion_piece_drive
       (piece_id, drive_file_id, drive_dossier_id, dossier_nom, web_view_link, depose_par_libelle,
        md5, taille_octets, verifie_le, origine, regle_tri, confiance_tri, compte_google)
     VALUES ($1,$2,$3,$4,$5,'copie automatique',$6,$7,${'$8'},'copie',$9,$10,$11)
     ON CONFLICT (piece_id, drive_dossier_id) DO UPDATE SET
       drive_file_id = EXCLUDED.drive_file_id, web_view_link = EXCLUDED.web_view_link,
       md5 = EXCLUDED.md5, taille_octets = EXCLUDED.taille_octets, verifie_le = EXCLUDED.verifie_le,
       regle_tri = EXCLUDED.regle_tri, confiance_tri = EXCLUDED.confiance_tri, depose_le = now()`,
    [o.pieceId, o.driveFileId, o.driveDossierId, o.dossierNom, o.lien, o.md5, o.taille,
      o.verifie ? new Date() : null, o.regle, o.confiance, o.compte]);
}

/** Ce que la base sait déjà des pièces déjà parties — lu EN UNE FOIS, pas une requête par pièce. */
export async function depotsConnus(): Promise<Map<number, { driveFileId: string; driveDossierId: string; verifie: boolean }>> {
  if (!(await copiePiecesDisponible())) return new Map();
  const { rows } = await query<{ piece_id: string; drive_file_id: string; drive_dossier_id: string; verifie: boolean }>(
    `SELECT DISTINCT ON (piece_id) piece_id, drive_file_id, drive_dossier_id, (verifie_le IS NOT NULL) AS verifie
       FROM gestion_piece_drive
      ORDER BY piece_id, (verifie_le IS NOT NULL) DESC, depose_le DESC`);
  const m = new Map<number, { driveFileId: string; driveDossierId: string; verifie: boolean }>();
  for (const r of rows) {
    m.set(Number(r.piece_id), { driveFileId: r.drive_file_id, driveDossierId: r.drive_dossier_id, verifie: r.verifie });
  }
  return m;
}

/** Un motif LISIBLE, avec le début du corps de la réponse : « HTTP 403 » seul n'apprend rien. */
async function motif(res: Response, quoi: string): Promise<string> {
  const texte = await res.text().catch(() => '');
  if (res.status === 401) return `La connexion Google a expiré (${quoi}).`;
  if (res.status === 403) return `Google a refusé ${quoi} (403) : ${texte.slice(0, 200)}`;
  if (res.status === 404) return `Le dossier visé n’existe plus dans le Drive (${quoi}).`;
  if (res.status === 429 || res.status >= 500) return `Drive n’a pas répondu (${res.status}, ${quoi}) — à réessayer.`;
  return `Google a refusé ${quoi} (code ${res.status}) : ${texte.slice(0, 200)}`;
}

/** Le corps binaire d'une requête, converti explicitement plutôt que forcé par un `as never`. PUR. */
function tampon(vue: Uint8Array): ArrayBuffer {
  return vue.buffer.slice(vue.byteOffset, vue.byteOffset + vue.byteLength) as ArrayBuffer;
}

/** La pause entre deux copies, respectée par la boucle. */
export const respirerCopie = (deps: DepsCopie, ms: number): Promise<void> => (deps.attendre ?? dormir)(ms);
