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
import type { MessageEntrant } from '../veille/rattachementReponse';
import type { PartieRapport } from '../veille/rapportRejet';

function versMessageBoite(parsed: ParsedMail, uid: number): MessageBoite {
  const from = parsed.from?.value?.[0];
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : parsed.references
      ? [parsed.references]
      : undefined;

  // En-têtes bruts (nom → valeur) pour estAccuseDeRebond (Content-Type, Auto-Submitted…), valeur telle quelle.
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
