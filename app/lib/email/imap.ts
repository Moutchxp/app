/**
 * ADAPTATEUR IMAP (chantier R3) — SEUL fichier qui importe imapflow/mailparser. Implémente le contrat `ClientBoite` de
 * releveReponses.ts. SERVEUR only.
 *
 * ⚠️ LECTURE STRICTE, règle non négociable : la boîte est ouverte en `readOnly` (EXAMINE) ; on ne pose/retire JAMAIS de
 * flag (pas de \Seen), on ne déplace RIEN, on ne supprime RIEN. C'est la vraie boîte professionnelle de l'utilisateur.
 */
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { CompteImap } from './index';
import type { ClientBoite, MessageBoite, PieceMeta, CritereRecherche } from '../veille/releveReponses';
import type { ClientApprofondi } from '../veille/releveApprofondie';
import type { MessageEntrant } from '../veille/rattachementReponse';
import type { PartieRapport } from '../veille/rapportRejet';

function versMessageBoite(parsed: ParsedMail, uid: number): MessageBoite {
  const from = parsed.from?.value?.[0];
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : parsed.references
      ? [parsed.references]
      : undefined;

  // En-têtes bruts (nom → valeur) pour estRebondNonRemise / estAccuseAutomatique (Content-Type, Auto-Submitted…), valeur telle quelle.
  const entetes: Record<string, string> = {};
  for (const { key, line } of parsed.headerLines) {
    const i = line.indexOf(':');
    entetes[key] = i === -1 ? '' : line.slice(i + 1).trim();
  }

  const message: MessageEntrant = {
    messageId: (parsed.messageId ?? '').trim(),
    inReplyTo: parsed.inReplyTo,
    references,
    deAdresse: from?.address ?? '',
    objet: parsed.subject,
    corpsTexte: parsed.text,
    corpsHtml: parsed.html || undefined, // L1 : conserve le corps HTML (mailparser renvoie `false` si absent) → porte souvent le lien
    entetes,
  };

  // Les sous-parties de RAPPORT (message/rfc822, text/rfc822-headers, message/delivery-status) ne sont PAS des pièces
  // jointes « métier » : on les sort des pièces et on les expose à part pour l'analyse DSN (rapportRejet).
  const estPartieRapport = (ct: string): boolean => /delivery-status|rfc822/i.test(ct);
  const pieces: PieceMeta[] = parsed.attachments
    .filter((a) => !estPartieRapport(a.contentType ?? ''))
    .map((a) => ({
      nomFichier: a.filename && a.filename.trim() !== '' ? a.filename : '(sans nom)',
      typeMime: a.contentType ?? null,
      tailleOctets: typeof a.size === 'number' ? a.size : null,
      contenu: Buffer.from(a.content), // R4 : le contenu brut (déposé tel quel plus tard ; jamais ouvert ni parsé ici)
    }));
  const partiesRapport: PartieRapport[] = parsed.attachments
    .filter((a) => estPartieRapport(a.contentType ?? ''))
    .map((a) => ({ typeMime: a.contentType ?? '', contenu: Buffer.from(a.content).toString('utf8') }));

  const deNom = from?.name && from.name.trim() !== '' ? from.name : null;
  return { uid, message, recuLe: parsed.date ?? new Date(), deNom, pieces, partiesRapport };
}

/** Construit un ClientBoite réel sur INBOX en lecture seule. Ne relève que ; n'écrit jamais dans la boîte. */
export function creerClientBoite(compte: CompteImap): ClientBoite {
  const client = new ImapFlow({
    host: compte.host,
    port: compte.port,
    secure: compte.tls,
    auth: { user: compte.user, pass: compte.pass },
    logger: false,
  });

  return {
    async ouvrir(): Promise<void> {
      await client.connect();
      await client.mailboxOpen('INBOX', { readOnly: true }); // EXAMINE : aucune modification de la boîte
    },
    async chercher(criteres: CritereRecherche): Promise<number[]> {
      // Recherche SERVEUR : SINCE + éventuellement FROM (imapflow n'accepte qu'UNE chaîne `from` → un appel par domaine).
      const critere: { since: Date; from?: string } = { since: criteres.depuis };
      if (criteres.from !== undefined && criteres.from !== '') critere.from = criteres.from;
      const uids = await client.search(critere, { uid: true });
      return uids === false ? [] : uids;
    },
    async chercherReferences(depuis: Date, references: string[]): Promise<number[]> {
      // R3e — recherche TEXT (en-têtes + corps ; une mairie cite souvent le n° de dossier dans le CORPS). imapflow accepte
      //   `or: [{text}, …]` (RFC 3501 §6.4.4). On procède par LOTS pour éviter un OU trop profond que certains serveurs
      //   refusent, puis on fait l'UNION dédupliquée des UID (comme pour les domaines).
      const TAILLE_LOT = 10;
      const uids = new Set<number>();
      for (let i = 0; i < references.length; i += TAILLE_LOT) {
        const lot = references.slice(i, i + TAILLE_LOT).filter((r) => r.trim() !== '');
        if (lot.length === 0) continue;
        const critere = lot.length === 1
          ? { since: depuis, text: lot[0] }
          : { since: depuis, or: lot.map((r) => ({ text: r })) };
        const res = await client.search(critere, { uid: true });
        if (res !== false) for (const u of res) uids.add(u);
      }
      return [...uids].sort((a, b) => a - b);
    },
    async messageIds(uids: number[]): Promise<Map<number, string>> {
      // P1 — fetch LÉGER (enveloppe seule, PAS le corps) pour connaître le Message-ID de chaque UID → le plafond chronologique
      //   écarte les déjà-vus avant de tronquer. Lecture stricte (aucun flag posé). Un UID sans Message-ID → absent de la Map.
      const map = new Map<number, string>();
      if (uids.length === 0) return map;
      for await (const msg of client.fetch(uids.join(','), { envelope: true }, { uid: true })) {
        const mid = msg.envelope?.messageId;
        if (typeof mid === 'string' && mid.trim() !== '') map.set(msg.uid, mid);
      }
      return map;
    },
    async telechargerMessage(uid: number): Promise<MessageBoite> {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      if (msg === false || !msg.source) throw new Error(`message uid ${uid} introuvable ou sans source`);
      const parsed = await simpleParser(msg.source);
      return versMessageBoite(parsed, uid);
    },
    async fermer(): Promise<void> {
      try { await client.logout(); } catch { /* best-effort : la fermeture ne doit pas faire échouer la relève */ }
    },
  };
}

/**
 * Client MULTI-BOÎTES pour la relève APPROFONDIE (chantier R6) : liste TOUTES les boîtes et les ouvre une à une, TOUJOURS en
 * `readOnly` (EXAMINE) — INBOX comme indésirables. Même règle de LECTURE STRICTE que `creerClientBoite` : aucun flag posé,
 * rien de déplacé ni supprimé. Les boîtes non sélectionnables (\Noselect, simples conteneurs) sont écartées de la liste.
 */
export function creerClientApprofondi(compte: CompteImap): ClientApprofondi {
  const client = new ImapFlow({
    host: compte.host,
    port: compte.port,
    secure: compte.tls,
    auth: { user: compte.user, pass: compte.pass },
    logger: false,
  });

  return {
    async ouvrir(): Promise<void> {
      await client.connect(); // connexion seule : chaque boîte est ouverte ensuite par ouvrirBoite()
    },
    async listerBoites(): Promise<string[]> {
      const boites = await client.list();
      // On écarte les conteneurs non sélectionnables (\Noselect) : les ouvrir échouerait.
      return boites.filter((b) => !b.flags.has('\\Noselect')).map((b) => b.path);
    },
    async ouvrirBoite(chemin: string): Promise<void> {
      await client.mailboxOpen(chemin, { readOnly: true }); // EXAMINE : aucune modification de la boîte
    },
    async chercher(criteres: CritereRecherche): Promise<number[]> {
      const critere: { since: Date; from?: string } = { since: criteres.depuis };
      if (criteres.from !== undefined && criteres.from !== '') critere.from = criteres.from;
      const uids = await client.search(critere, { uid: true });
      return uids === false ? [] : uids;
    },
    async telechargerMessage(uid: number): Promise<MessageBoite> {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      if (msg === false || !msg.source) throw new Error(`message uid ${uid} introuvable ou sans source`);
      const parsed = await simpleParser(msg.source);
      return versMessageBoite(parsed, uid);
    },
    async fermer(): Promise<void> {
      try { await client.logout(); } catch { /* best-effort : la fermeture ne doit pas faire échouer la relève */ }
    },
  };
}
