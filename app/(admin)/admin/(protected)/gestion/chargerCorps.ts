/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 5 — LE CORPS D'UN MESSAGE, CHARGÉ AU DÉPLIAGE. UN SEUL CHEMIN ══════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Le mail déplié (triangle ▸) affiche l'INTÉGRALITÉ du nouveau message
 * (aujourd'hui il est coupé : “Par ailleurs, avez-vou”), SANS l'historique cité en dessous. Réutilise la
 * détection de citation déjà utilisée dans la Conversation, pas de second chemin. »
 *
 * ═══ 🔴 POURQUOI CE FICHIER EXISTE, ET CE QU'IL N'EST PAS ═════════════════════════════════════════════════════════
 *
 * Cette fonction vivait DANS `Conversation.tsx`, sans être exportée. Le bloc « Historique du bien » en a
 * désormais besoin, et il y avait trois façons de faire :
 *   · la RECOPIER — deux chemins pour la même lecture, c'est-à-dire exactement ce qu'Arno interdit ;
 *   · importer `Conversation.tsx` depuis la ligne de courrier — cela aurait tiré la conversation entière (sa
 *     rédaction, ses fenêtres, ses gestes) dans le paquet de la fiche d'un bien, pour une seule requête ;
 *   · la DÉPLACER ici. C'est ce qui est fait : un seul corps de fonction, deux appelants.
 *
 * ⚠️ CE N'EST PAS UN MODULE « PUR » ET IL N'A PAS À L'ÊTRE : il fait une requête. Il reste donc à côté des
 * composants qui l'emploient, et non dans `lib/gestion`, où les modules sont soit purs, soit serveur. Le
 * placer là-bas aurait brouillé une frontière que ce dépôt tient avec deux gardes.
 *
 * ⚠️ AUCUN IMPORT : la fonction ne dépend de rien, et ce fichier ne tire donc rien dans aucun paquet.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que la route rend, tel que les deux écrans le lisent. */
export interface CorpsCharge {
  texte: string | null;
  html: string | null;
  cssMail?: string;
}

/**
 * Le corps d'UN message. `null` dans un champ = rien à afficher ; `undefined` en retour = la lecture a échoué.
 *
 * 🔴 LOT BIEN-RATTACHE — ELLE RAMÈNE AUSSI LE HTML, DÉJÀ ASSAINI PAR LE SERVEUR. 1 180 mails en base n'ont QUE de
 * la mise en forme ; ils affichaient « affichage à venir » au lieu de leur contenu.
 *
 * 🔴🔴 LOT CADRE-ISOLE-MAILS — `cssMail` EST LA FEUILLE D'EN-TÊTE DU MAIL, déjà filtrée par le serveur
 * (`@import`, `url(` externe, `expression(` et toute sortie de balise refusés). Elle n'est posée QUE dans le
 * cadre isolé, jamais dans la page.
 *
 * ⚠️ ABSENTE D'UNE RÉPONSE PLUS ANCIENNE QUE CE LOT ⇒ chaîne vide : le cadre s'affiche alors sans la feuille du
 * mail, c'est-à-dire exactement comme avant ce lot.
 *
 * ⚠️ `undefined` ET `{ texte: null }` NE DISENT PAS LA MÊME CHOSE, et les deux appelants s'en servent : le
 * premier veut dire « on n'a pas pu lire » (on garde alors ce qu'on avait), le second « ce message n'a pas de
 * texte ». Les confondre ferait disparaître un contenu à la moindre coupure de réseau.
 */
export async function chargerCorpsDuMessage(messageId: number): Promise<CorpsCharge | undefined> {
  try {
    const res = await fetch(`/api/admin/gestion/messages/${messageId}/corps`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    const d = (await res.json()) as { corps?: string | null; html?: string | null; cssMail?: string | null };
    return { texte: d.corps ?? null, html: d.html ?? null, cssMail: d.cssMail ?? '' };
  } catch {
    return undefined;
  }
}
