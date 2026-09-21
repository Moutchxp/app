'use client';

import { useState } from 'react';
import { messageErreurCartouche } from './compteRendu'; // source UNIQUE du wording « session expirée » (dette du 401)

/**
 * HOOK PARTAGÉ de la relève manuelle de la boîte (bouton « Relever la boîte maintenant »). UNE seule implémentation, utilisée par
 * l'onglet Réglages ET l'onglet Réponses (jamais une copie) : même route `/api/admin/permis/relever`, mêmes messages. Le rendu du
 * bouton reste PROPRE à chaque écran (Réglages : encart d'aide ; Réponses : pleine largeur au-dessus de « État de la relève ») ; ici
 * on ne partage que la LOGIQUE (verrou anti-double-clic, POST, traduction du résultat, rafraîchissement optionnel après succès).
 *
 * ⚠️ La route reste gardée par `exigerAdministrateur` (garde SERVEUR inchangée) : ce hook ne fait AUCUN envoi (lecture + classement).
 */
export type MessageReleve = { ton: 'ok' | 'info' | 'erreur'; texte: string };

// Forme de la réponse de /api/admin/permis/relever. Type SEUL, déclaré côté client (on n'importe rien d'un module serveur).
type CompteursReleve = { messagesLus: number; retenus: number; rattaches: number; enregistrees: number; depotsGed: number; echecsDepot: number };
export type ReponseReleve =
  | { resultat: 'ok'; compteurs: CompteursReleve }
  | { resultat: 'inactif'; message: string }
  | { resultat: 'erreur'; message: string };

/**
 * PURE — traduit le STATUS HTTP + le corps de la réponse en message d'écran, avec TROIS cas honnêtes et DISTINCTS :
 *  - SESSION EXPIRÉE (401/403 : la garde admin a refusé faute de session valide) → message « reconnectez-vous », traité AVANT le
 *    corps et n'accusant JAMAIS la boîte (dette « mensonge d'interface 401 » ; même wording que `messageErreurCartouche`).
 *  - ÉCHEC de la relève (connexion à la boîte, erreur interne : resultat 'erreur') → message d'échec du serveur, tel quel.
 *  - SUCCÈS (resultat 'ok') → compteurs. `succes` dit à l'appelant s'il doit rafraîchir l'écran (rien n'a changé sinon).
 * `inactif` (aucune boîte configurée) n'est pas une erreur : message d'info, sans rafraîchissement.
 */
export function messageReleve(status: number, corps: ReponseReleve | null): { message: MessageReleve; succes: boolean } {
  if (status === 401 || status === 403) return { message: { ton: 'erreur', texte: messageErreurCartouche(status) }, succes: false };
  if (!corps) return { message: { ton: 'erreur', texte: 'La relève a échoué.' }, succes: false };
  if (corps.resultat === 'ok') {
    const c = corps.compteurs;
    const suffixe = c.echecsDepot > 0 ? ` — ${c.echecsDepot} pièce(s) non versée(s) (voir les archives).` : '.';
    return {
      message: { ton: 'ok', texte: `Relève terminée : ${c.messagesLus} message(s) lu(s), ${c.rattaches} rattaché(s), ${c.enregistrees} enregistré(s), ${c.depotsGed} pièce(s) versée(s) en GED${suffixe}` },
      succes: true,
    };
  }
  if (corps.resultat === 'inactif') return { message: { ton: 'info', texte: corps.message }, succes: false };
  return { message: { ton: 'erreur', texte: corps.message ?? 'La relève a échoué.' }, succes: false };
}

/**
 * Lance la relève de la boîte. Verrou `releveEnCours` = pas de double-clic (donc pas de double relève). Résultat affiché en clair,
 * succès comme échec — jamais un silence. `apresReleve` (optionnel) est appelé UNIQUEMENT après un succès : l'écran Réponses s'y
 * abonne pour se rafraîchir sans recharger la page ; l'écran Réglages ne passe rien.
 */
export function useReleveBoite(apresReleve?: () => void) {
  const [releveEnCours, setReleveEnCours] = useState(false);
  const [releveMsg, setReleveMsg] = useState<MessageReleve | null>(null);

  async function releverBoiteMaintenant() {
    if (releveEnCours) return;
    setReleveEnCours(true);
    setReleveMsg(null);
    try {
      const res = await fetch('/api/admin/permis/relever', { method: 'POST' });
      // 401/403 = session expirée : NE PAS lire le corps comme une réponse de relève (il ne porte pas `resultat`) → on le distingue
      //   d'une panne de boîte AVANT tout parsing.
      const corps = res.status === 401 || res.status === 403 ? null : ((await res.json()) as ReponseReleve);
      const { message, succes } = messageReleve(res.status, corps);
      setReleveMsg(message);
      if (succes) apresReleve?.();
    } catch {
      setReleveMsg({ ton: 'erreur', texte: 'Relève impossible : le serveur n’a pas répondu.' });
    } finally {
      setReleveEnCours(false);
    }
  }

  return { releveEnCours, releveMsg, releverBoiteMaintenant };
}
