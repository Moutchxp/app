/**
 * ══ 🔴🔴 LOT GESTION-FENETRES-SUIVI (Arno, 16/10/2026) — LE LISERÉ « À PARTIR D'ICI : … » D'UN MAIL. Module PUR ══════════
 *
 * DEMANDE D'ARNO : « Jamais deux liserés pour le même mail. Un mail ne peut porter qu'UNE seule matérialisation (texte
 * rouge + les deux liserés) : celle de la DERNIÈRE fenêtre de suivi validée sur ce mail. Les fenêtres remplacées restent
 * en base (historique), elles ne s'affichent plus. » Et la bulle ⓘ du liseré, en deux parties : « Avant » = le
 * rattachement EFFECTIF du mail précédent dans la conversation ; « Après » = la dernière configuration validée sur ce mail.
 *
 * ═══ LA CAUSE DU DOUBLE LISERÉ (fil 36646) ═══════════════════════════════════════════════════════════════════════════
 *   Le geste « Interne — ce mail et la suite » écrit DEUX traces au même instant : une fenêtre de suivi de sorte
 *   `interne` (`gestion_fil_periode`) ET des marques « Interne » de portée `suite` (`gestion_message_interne`). L'écran
 *   rendait une accolade pour chacune (`changementsDuFil` d'un côté, `accoladeInterneSuite` de l'autre), toutes deux au
 *   même mail : deux liserés identiques. Rien n'est faux en base ; c'est l'affichage qui doit n'en garder qu'une.
 *
 * ═══ LA RÈGLE ═════════════════════════════════════════════════════════════════════════════════════════════════════════
 *   · Par mail, UNE seule matérialisation : la plus récente (`le`).
 *   · Une fenêtre de suivi et une marque « Interne » posées par le MÊME geste (à moins de cinq secondes) : la fenêtre
 *     l'emporte — c'est elle qui porte la configuration validée. Une marque n'est gardée que si elle est STRICTEMENT plus
 *     récente que toute fenêtre de ce mail (ou s'il n'y en a pas : données d'avant les fenêtres « Interne »).
 *   · La règle du premier mail (jamais de liseré dessus) reste celle des producteurs (`changementsDuFil`,
 *     `accoladeInterneSuite`) : ce filtre ne fait qu'en retirer.
 */

export const MEME_GESTE_MS = 5000;

const temps = (le: string | null | undefined): number => {
  const t = le == null ? Number.NaN : new Date(le).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
};

/** Ce qu'il faut pour départager deux matérialisations du même mail. */
export interface Materialisation {
  depuisMessageId: number;
  le: string | null;
}

/**
 * UNE MATÉRIALISATION PAR MAIL. `fenetres` = les repères des fenêtres de suivi vivantes ; `marques` = les accolades des
 * marques « Interne » pour la suite. Rend les deux listes filtrées, dans leur ordre d'origine. PUR.
 */
export function uneMaterialisationParMail<F extends Materialisation, M extends Materialisation>(
  fenetres: readonly F[], marques: readonly M[],
): { fenetres: F[]; marques: M[] } {
  const plusRecente = <T extends Materialisation>(liste: readonly T[]): Map<number, T> => {
    const m = new Map<number, T>();
    for (const x of liste) {
      const deja = m.get(x.depuisMessageId);
      if (deja === undefined || temps(x.le) > temps(deja.le)) m.set(x.depuisMessageId, x);
    }
    return m;
  };
  const f = plusRecente(fenetres);
  const mq = plusRecente(marques);
  for (const [mail, marque] of mq) {
    const fenetre = f.get(mail);
    if (fenetre === undefined) continue;
    /* La marque ne l'emporte que si elle est posée APRÈS la fenêtre, par un autre geste. */
    if (temps(marque.le) > temps(fenetre.le) + MEME_GESTE_MS) f.delete(mail);
    else mq.delete(mail);
  }
  const gardeF = new Set(f.values());
  const gardeM = new Set(mq.values());
  return { fenetres: fenetres.filter((x) => gardeF.has(x)), marques: marques.filter((x) => gardeM.has(x)) };
}

/** Le mail qui précède `messageId` dans la conversation (`mails` dans l'ordre CHRONOLOGIQUE), ou `null`. PUR. */
export function mailPrecedent(mails: readonly number[], messageId: number): number | null {
  const i = mails.indexOf(messageId);
  return i > 0 ? mails[i - 1] : null;
}

/**
 * LE RATTACHEMENT EFFECTIF D'UN MAIL, pour la partie « Avant » de la bulle. Les signaux sont ceux de la capsule de statut
 * (`capsuleDuMessage`) : des biens rattachés l'emportent, puis « Interne », puis « Hors gestion » ; sinon le mail est
 * « À classer » et la bulle dit « Aucun rattachement ».
 */
export interface SignauxAvant {
  messageId: number;
  interne: boolean;
  horsGestion: boolean;
}

export const TITRE_AVANT_LISERE = 'Avant';
export const TITRE_APRES_LISERE = 'Après';
export const AUCUN_RATTACHEMENT = 'Aucun rattachement';
export const SOUS_TITRE_AVANT_LISERE = 'Rattachement du mail précédent';

/** Le mot de l'« Avant » quand le mail précédent n'a aucun bien rattaché. PUR. */
export function motAvantSansBien(s: Pick<SignauxAvant, 'interne' | 'horsGestion'>): string {
  if (s.interne) return 'Interne';
  return s.horsGestion ? 'Hors gestion' : AUCUN_RATTACHEMENT;
}
