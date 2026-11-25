'use client';

import { useEffect, useState } from 'react';
import { MessageConversation, CSS_CONVERSATION } from '../gestion/Conversation';
import { CSS_PIECES } from '../gestion/PiecesJointes';
import { CSS_PIECES_CONVERSATION } from '../gestion/PiecesDeLaConversation';
import { chargerCorpsDuMessage } from '../gestion/chargerCorps';
import type { MessageDeFil } from '../../../../lib/gestion/carteRepo';
import type { VoieRedaction } from '../../../../lib/gestion/redaction';
import { MODELES_VINGT } from '../../../../lib/location/mailVingtPourcent';
import type { LigneVingtPourcent, MailVingtEnvoye } from '../../../../lib/location/vingtPourcent';

/**
 * ══ 🔴🔴 « ÉCHANGES » DE LA LIGNE DÉPLIÉE DE « 20 % À RESTITUER » (Arno, 25/11/2026) ═════════════════════════════════════════════════════════════
 * « la conversation doit aussi être préservée et construite ici dans la ligne dépliée du locataire ; on doit pouvoir consulter l'intégralité de la
 * conversation (mail par mail) avec le syndic, les propriétaires et les locataires ; les mails échangés doivent se présenter comme dans la boîte mail
 * habituelle (même principe, même présentation). »
 * - LA CONVERSATION D'UNE LIGNE = les fils de la boîte Gestion ouverts par les mails partis de son module (migration 515 : envoi → mail capturé → fil),
 *   réponses comprises (une réponse rejoint le fil par ses en-têtes de réponse, comme dans la boîte), du plus ancien au plus récent, tous fils mêlés.
 * - LA PRÉSENTATION est celle de la boîte : chaque mail est rendu par `MessageConversation` (la carte de la conversation Gestion — pas de copie),
 *   dépliable, pièces jointes comprises ; son contenu est lu au dépliage (`chargerCorpsDuMessage`, la même lecture). Lecture par la route du fil
 *   (`/api/admin/gestion/fils/[id]/messages`, droit Gestion) : rien n'est écrit.
 * - « Répondre » sur chaque mail (Gestion seulement) : `onRepondre` — le module d'écriture de la ligne s'ouvre en réponse, dans le même fil.
 * - Un mail parti mais pas encore capturé par la relève : une ligne simple (quand, à qui, le modèle), « dans la conversation dès la prochaine relève ».
 */

/** Le libellé d'un modèle (« Message libre » sinon). PUR. */
export const libelleModeleVingt = (m: string | null): string => MODELES_VINGT.find((x) => x.cle === m)?.libelle ?? 'Message libre';
const dateFr = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Les mails de plusieurs fils en UNE conversation : sans doublon, du plus ancien au plus récent (puis par numéro). PUR. */
export function fusionnerEchanges(fils: ReadonlyArray<{ filId: number; messages: readonly MessageDeFil[] }>): Array<{ filId: number; m: MessageDeFil }> {
  const vus = new Map<number, { filId: number; m: MessageDeFil }>();
  for (const f of fils) for (const m of f.messages) if (!vus.has(m.messageId)) vus.set(m.messageId, { filId: f.filId, m });
  return [...vus.values()].sort((a, b) => (a.m.recuLe < b.m.recuLe ? -1 : a.m.recuLe > b.m.recuLe ? 1 : a.m.messageId - b.m.messageId));
}

type Corps = { texte: string | null; html: string | null; cssMail?: string };

export function EchangesLigne({ l, maintenant, onRepondre }: {
  /** une ligne de l'écran, ou une restitution faite (🔴 25/11 : les échanges suivent la sortie) */
  l: Pick<LigneVingtPourcent, 'mails' | 'echanges'>; maintenant: Date;
  /** « Répondre » sur un mail (absent : la Location, qui n'écrit pas) : la voie, le mail, son fil, son contenu déjà lu. */
  onRepondre?: (voie: VoieRedaction, m: MessageDeFil, filId: number, corps: { texte?: string | null; html?: string | null }) => void;
}) {
  const fils = l.echanges?.fils ?? [];
  const enAttente = (l.mails ?? []).filter((m) => m.filId == null);
  const [lus, setLus] = useState<Array<{ filId: number; m: MessageDeFil }> | null>(fils.length === 0 ? [] : null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [deplies, setDeplies] = useState<Set<number>>(new Set());
  const [corps, setCorps] = useState<Map<number, Corps>>(new Map());
  const cleFils = fils.join(',');
  const deplier = async (m: MessageDeFil, ouvrir: boolean): Promise<void> => {
    setDeplies((s) => { const n = new Set(s); if (ouvrir) n.add(m.messageId); else n.delete(m.messageId); return n; });
    if (ouvrir && !corps.has(m.messageId)) {
      const c = await chargerCorpsDuMessage(m.messageId);
      if (c !== undefined) setCorps((s) => new Map(s).set(m.messageId, c));
    }
  };
  useEffect(() => {
    if (fils.length === 0) { setLus([]); return; }
    let vivant = true;
    void (async () => {
      try {
        const reponses = await Promise.all(fils.map(async (filId) => {
          const res = await fetch(`/api/admin/gestion/fils/${filId}/messages`, { cache: 'no-store' });
          if (!res.ok) throw new Error(res.status === 403 ? 'droit' : 'lecture');
          const d = (await res.json()) as { messages?: MessageDeFil[] };
          return { filId, messages: d.messages ?? [] };
        }));
        if (!vivant) return;
        const tous = fusionnerEchanges(reponses);
        setLus(tous);
        // comme dans la boîte : le dernier mail est ouvert
        const dernier = tous.at(-1);
        if (dernier !== undefined) void deplier(dernier.m, true);
      } catch (e) {
        if (vivant) setErreur((e as Error).message === 'droit' ? 'Les échanges se lisent avec le droit Gestion.' : 'Lecture des échanges impossible : réessayez.');
      }
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clé des fils suffit
  }, [cleFils]);
  // 🔴🔴 (Arno, 25/11/2026, niveau 2) « Échanges (N) » toujours là sur la ligne dépliée ; sans échange : « Aucun échange pour l'instant »
  if (fils.length === 0 && enAttente.length === 0) {
    return (
      <section className="vgp-echanges" data-vgp-echanges={0} aria-label="Échanges">
        <style>{CSS_ECHANGES}</style>
        <p className="vgp-coord-titre vgp-echanges-titre">Échanges (0)</p>
        <p className="loc-muet vgp-echanges-aucun" data-vgp-echanges-aucun>Aucun échange pour l’instant</p>
      </section>);
  }
  const envoiDe = (messageId: number): MailVingtEnvoye | undefined => (l.mails ?? []).find((x) => x.messageId === messageId);
  const nombre = l.echanges?.nombre ?? (lus?.length ?? 0) + enAttente.length;
  return (
    <section className="vgp-echanges" data-vgp-echanges={nombre} aria-label="Échanges">
      <style>{CSS_CONVERSATION}{CSS_PIECES}{CSS_PIECES_CONVERSATION}{CSS_ECHANGES}</style>
      <p className="vgp-coord-titre vgp-echanges-titre">Échanges ({nombre})</p>
      {erreur !== null && <p className="cp-refus" role="alert" data-vgp-echanges-erreur>{erreur}</p>}
      {lus === null && erreur === null && <p className="loc-muet" role="status">Lecture des échanges…</p>}
      {(lus ?? []).map(({ filId, m }) => {
        const envoi = envoiDe(m.messageId);
        const c = corps.get(m.messageId);
        return (
          <div key={m.messageId} className="vgp-echange" data-vgp-echange={m.messageId} data-vgp-echange-sens={m.sens}>
            {envoi !== undefined && (
              <p className="vgp-echange-origine" data-vgp-echange-modele={envoi.modele ?? ''}>Envoyé depuis cette page — {libelleModeleVingt(envoi.modele)}
                {envoi.lien !== null && <>{' — '}<a href={envoi.lien} data-vgp-mail-lien>Voir dans l’historique</a></>}</p>)}
            <MessageConversation message={m} maintenant={maintenant} filId={filId} ouvert={deplies.has(m.messageId)}
              corpsCharge={c?.texte} htmlCharge={c?.html} cssMailCharge={c?.cssMail}
              onBasculer={() => void deplier(m, !deplies.has(m.messageId))}
              onRepondre={onRepondre !== undefined ? (voie) => onRepondre(voie, m, filId, { texte: c?.texte, html: c?.html }) : undefined} />
          </div>);
      })}
      {enAttente.map((e, i) => (
        <p key={`att-${i}`} className="vgp-coord-ligne vgp-echange-attente" data-vgp-echange-attente={i}>
          {dateFr(e.le.slice(0, 10))} à {e.le.slice(11, 16)} — {e.a.length > 0 ? e.a.join(', ') : '—'}{e.copies > 0 ? ` (+ ${e.copies} en copie)` : ''} — {libelleModeleVingt(e.modele)}
          {' — '}<span className="loc-muet">dans la conversation dès la prochaine relève</span>
        </p>))}
    </section>
  );
}

const CSS_ECHANGES = `
.vgp-echanges{display:flex;flex-direction:column;gap:8px;min-width:0;margin-top:4px}
.vgp-echanges-titre{margin:0}
.vgp-echanges-aucun{margin:0}
.vgp-echange{display:flex;flex-direction:column;gap:2px;min-width:0}
.vgp-echange-origine{margin:0;font-size:.75rem;font-weight:700;color:var(--color-svv-muted);overflow-wrap:anywhere}
`;
