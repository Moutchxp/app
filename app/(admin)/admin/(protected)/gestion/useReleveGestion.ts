'use client';

import { useState } from 'react';

/**
 * LOT 3 — bouton « Relever maintenant » du module Gestion. RECOPIE du patron `useReleveBoite` (module Permis) — et non un
 * partage : les deux routes, leurs compteurs et leurs messages sont différents, et un hook commun aurait couplé deux
 * modules qui n'ont aucune raison d'évoluer ensemble. Ce qui est repris, c'est la LOGIQUE éprouvée : verrou anti-double-
 * clic, POST, traduction honnête du résultat, rafraîchissement seulement après un vrai succès.
 *
 * ⚠️ La route reste gardée SERVEUR (`exigerCompteActif`, qui relit la base). Ce hook n'est qu'une commodité d'écran.
 */
export type MessageReleve = { ton: 'ok' | 'info' | 'erreur'; texte: string };

/** Forme de la réponse de /api/admin/gestion/relever. Type SEUL, déclaré côté client (rien n'est importé d'un module serveur). */
export type CompteursReleve = {
  messagesLus: number; captures: number; dejaConnus: number; exclus: number;
  recus: number; envoyes: number; filsCrees: number; filsFusionnes: number;
  piecesDeposees: number; piecesNonDeposees: number; echecsLecture: number;
  plafondAtteint: boolean; resteAVoir: number;
};
export type ReponseReleve =
  | { resultat: 'ok'; resume: string; compteurs: CompteursReleve }
  | { resultat: 'occupe' | 'inactif' | 'erreur'; message: string };

/**
 * PURE — traduit le statut HTTP et le corps en message d'écran. QUATRE cas distincts, parce que les confondre envoie
 * chercher un bug là où il n'y en a pas :
 *   · 401/403 → la SESSION ou le DROIT, jamais la boîte ;
 *   · `occupe` → une passe tourne déjà : ce n'est ni un échec ni un succès, c'est « repasse dans un instant » ;
 *   · `inactif` → aucune boîte configurée : rien à relever, et ce n'est pas une erreur ;
 *   · `ok` → les compteurs, et surtout le RESTE À VOIR quand le plafond a mordu — sans quoi on croirait avoir tout pris.
 * `succes` dit à l'appelant s'il doit recharger l'écran (rien n'a changé dans les autres cas).
 */
export function messageReleveGestion(status: number, corps: ReponseReleve | null): { message: MessageReleve; succes: boolean } {
  if (status === 401 || status === 403) {
    return { message: { ton: 'erreur', texte: 'Session expirée ou droit retiré : reconnectez-vous.' }, succes: false };
  }
  if (!corps) return { message: { ton: 'erreur', texte: 'La relève a échoué.' }, succes: false };
  if (corps.resultat === 'ok') {
    const c = corps.compteurs;
    const pieces = c.piecesNonDeposees > 0 ? ` ${c.piecesNonDeposees} pièce(s) non déposée(s), trace conservée.` : '';
    const reste = c.plafondAtteint ? ` Plafond atteint : ${c.resteAVoir} message(s) restent à relever — relancez pour continuer.` : '';
    const illisibles = c.echecsLecture > 0 ? ` ${c.echecsLecture} message(s) illisible(s), ignoré(s).` : '';
    return {
      message: {
        ton: 'ok',
        texte: `Relève terminée : ${c.messagesLus} message(s) lu(s), ${c.captures} capturé(s) (${c.recus} reçu(s), ${c.envoyes} envoyé(s)), ${c.exclus} tenu(s) hors de la file, ${c.dejaConnus} déjà connu(s), ${c.piecesDeposees} pièce(s) déposée(s).${pieces}${illisibles}${reste}`,
      },
      succes: true,
    };
  }
  if (corps.resultat === 'occupe' || corps.resultat === 'inactif') {
    return { message: { ton: 'info', texte: corps.message }, succes: false };
  }
  return { message: { ton: 'erreur', texte: corps.message ?? 'La relève a échoué.' }, succes: false };
}

/** Lance UNE passe. Verrou `enCours` = pas de double-clic, donc pas de double passe. Résultat toujours affiché, jamais un silence. */
export function useReleveGestion(apresReleve?: () => void) {
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<MessageReleve | null>(null);

  async function releverMaintenant() {
    if (enCours) return;
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/gestion/relever', { method: 'POST' });
      // 401/403 : le corps ne porte pas `resultat` → on le distingue AVANT tout parsing d'une panne de boîte.
      const corps = res.status === 401 || res.status === 403 ? null : ((await res.json()) as ReponseReleve);
      const { message: m, succes } = messageReleveGestion(res.status, corps);
      setMessage(m);
      if (succes) apresReleve?.();
    } catch {
      setMessage({ ton: 'erreur', texte: 'Relève impossible : le serveur n’a pas répondu.' });
    } finally {
      setEnCours(false);
    }
  }

  return { enCours, message, releverMaintenant };
}
