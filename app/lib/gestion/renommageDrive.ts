import { trierCopiesARenommer, type CopieDrive, type RefusRenommage } from './nomUsagePiece';

/**
 * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — LE SEUL MODULE QUI SAIT RENOMMER DANS GOOGLE DRIVE ══════════════════════
 *
 * DÉCISION D'ARNO DU 30/09/2026, ET C'EST UN CHANGEMENT DE RÈGLE : l'application peut désormais renommer dans le
 * Drive, mais UNIQUEMENT les fichiers qu'elle a elle-même créés — les copies de « 00 Arrivée des mails » et les
 * fichiers déposés par « Ranger » ou « Copier », dont les identifiants sont dans notre base. Jamais un autre
 * fichier. Jamais rien sous 🔴🔴 « Documents clients scannés » ni dans son sous-arbre.
 *
 * ═══ POURQUOI UN FICHIER À PART, ET PAS UNE FONCTION DE `drive.ts` ══════════════════════════════════════════════
 *
 * Parce que `drive.ts` porte un garde statique qui compte les verbes HTTP de son source et refuse tout ce qui
 * n'est pas `POST` — c'est lui qui garantit que le module d'accès ne sait ni supprimer, ni renommer, ni partager.
 * Y ajouter un `PATCH` aurait désarmé cette garantie pour TOUT le module. C'est le raisonnement qui a déjà donné
 * `driveMouvement.ts` (le déplacement) : un verbe nouveau, un fichier nouveau, un garde nouveau.
 *
 * ═══ 🔒 CE QUE CE MODULE NE PEUT PAS FAIRE, PAR CONSTRUCTION ════════════════════════════════════════════════════
 *
 *   · UNE SEULE ÉCRITURE : `PATCH` sur `files/{id}` avec `name`, et RIEN d'autre dans le corps. Pas de `parents`,
 *     pas de `trashed`, pas de `permissions` — un garde statique compte les verbes et cherche les mots.
 *   · AUCUNE LECTURE DE REGISTRE : la liste des identifiants renommables est FOURNIE par l'appelant. Ce module ne
 *     peut donc pas se tromper sur ce qu'il lit, puisqu'il ne lit rien.
 *   · AUCUN IDENTIFIANT EN DUR : surtout pas celui de l'archive.
 *
 * 🔴 ET LE MAIL D'ORIGINE N'EST JAMAIS TOUCHÉ. Gmail ne permet pas de renommer une pièce jointe, et c'est très
 * bien ainsi : le nom d'origine reste la trace de ce que le correspondant a envoyé.
 */

const API_FICHIERS = 'https://www.googleapis.com/drive/v3/files';

export interface DepsRenommage { fetch: typeof fetch }

export type IssueRenommage =
  | { ok: true; driveFileId: string; nom: string }
  | { ok: false; driveFileId: string; motif: string };

/**
 * ══ 🔴 RENOMMER UN FICHIER — `files.update` AVEC `name`, ET RIEN D'AUTRE ═══════════════════════════════════════
 *
 * ⚠️ `supportsAllDrives` EST OBLIGATOIRE : les fichiers vivent dans un Drive PARTAGÉ, et sans ce paramètre
 * l'API répond « File not found » sur un fichier qui existe — une erreur qui envoie chercher au mauvais endroit.
 *
 * ⚠️ LE CORPS NE PORTE QUE `name`. Y ajouter un champ, même juste, ferait de cette fonction autre chose qu'un
 * renommage — et le garde statique le dirait.
 */
export async function renommerFichierDrive(
  o: { accessToken: string; driveFileId: string; nom: string },
  deps: DepsRenommage,
): Promise<IssueRenommage> {
  const id = o.driveFileId.trim();
  const nom = o.nom.trim();
  if (id === '') return { ok: false, driveFileId: id, motif: 'identifiant de fichier vide' };
  if (nom === '') return { ok: false, driveFileId: id, motif: 'nom vide : rien à écrire' };

  const url = `${API_FICHIERS}/${encodeURIComponent(id)}`
    + '?supportsAllDrives=true&fields=id%2Cname';
  const res = await deps.fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${o.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nom }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return {
      ok: false, driveFileId: id,
      motif: `Google a refusé le renommage (HTTP ${res.status})${detail === '' ? '' : ` : ${detail.slice(0, 200)}`}`,
    };
  }
  return { ok: true, driveFileId: id, nom };
}

export interface BilanRenommage {
  /** Les copies effectivement renommées. */
  faits: string[];
  /** Ce qui n'a pas été renommé, et pourquoi — refus de sécurité comme échecs réseau. */
  refus: RefusRenommage[];
}

/**
 * ══ 🔴🔴 ALIGNER TOUTES LES COPIES D'UNE PIÈCE SUR SON NOM D'USAGE ════════════════════════════════════════════
 *
 * 🔴 LES DEUX CONTRÔLES PASSENT AVANT LE MOINDRE APPEL RÉSEAU, et ils sont faits par le module PUR
 * (`trierCopiesARenommer`) : l'identifiant est dans NOTRE registre, et la chaîne de parents est hors de la
 * production. Une écriture émise puis regrettée ne se rattrape pas.
 *
 * 🔴 UN REFUS N'ARRÊTE PAS LES AUTRES (demande d'Arno, mot pour mot). Un refus, c'est une copie qu'on ne touche
 * pas ; les autres doivent quand même porter le bon nom. S'arrêter au premier laisserait la pièce avec trois noms
 * au lieu de deux — exactement ce que ce lot répare.
 *
 * ⚠️ EN SÉRIE, PAS EN PARALLÈLE : une pièce a deux ou trois copies, jamais cinquante. Les lancer ensemble
 * gagnerait quelques centaines de millisecondes et rendrait le journal illisible en cas d'échec partiel.
 */
export async function alignerCopiesSurLeNom(
  o: {
    accessToken: string;
    nom: string;
    copies: readonly CopieDrive[];
    /** 🔒 LE REGISTRE : les identifiants que le programme a lui-même créés. Fourni, jamais lu ici. */
    registre: ReadonlySet<string>;
    productionConnue?: ReadonlySet<string>;
  },
  deps: DepsRenommage,
): Promise<BilanRenommage> {
  const { aRenommer, refus } = trierCopiesARenommer(o.copies, o.registre, o.productionConnue ?? new Set());
  const faits: string[] = [];
  const echecs: RefusRenommage[] = [...refus];

  for (const c of aRenommer) {
    try {
      const r = await renommerFichierDrive(
        { accessToken: o.accessToken, driveFileId: c.driveFileId, nom: o.nom }, deps);
      if (r.ok) faits.push(r.driveFileId); else echecs.push({ driveFileId: r.driveFileId, motif: r.motif });
    } catch (e) {
      // ⚠️ UN RÉSEAU QUI TOMBE EST UN REFUS COMME UN AUTRE : il se note, il n'interrompt pas les suivantes.
      echecs.push({ driveFileId: c.driveFileId, motif: e instanceof Error ? e.message : String(e) });
    }
  }
  return { faits, refus: echecs };
}
