'use client';

import { useEffect, useState } from 'react';
import type { ContexteRedactionEcran } from './Redaction';

/**
 * ══ 🔴🔴 LE CONTEXTE D'ÉCRITURE DE LA BOÎTE GESTION, PARTAGÉ (Arno, 27/11/2026, 12h37) ═════════════════════════════════════════════════════
 * « chaque historique de bien (Gestion ET Location) propose le même bouton […] Réutilise le module d'écriture existant de la boîte Gestion (pas
 * de copie) ». La lecture de /api/admin/gestion/redaction (signature, droit d'envoi, sondes de migration) était écrite dans GestionVue : elle
 * est DÉPLACÉE ici (contexteRedactionLu), et GestionVue l'appelle ; la Location prend le même contexte par useContexteRedaction.
 */
export function contexteRedactionLu(c: ContexteRedactionEcran & { brouillons?: number }): ContexteRedactionEcran {
  return {
    schemaPret: c.schemaPret, peutEnvoyer: c.peutEnvoyer === true, jetonPresent: c.jetonPresent === true,
    signature: c.signature ?? '', nomExpediteur: c.nomExpediteur || 'CRITERIMMO',
    adresseGestion: c.adresseGestion || 'gestion@criterimmo.fr',
    delaiAnnulationS: typeof c.delaiAnnulationS === 'number' ? c.delaiAnnulationS : 10,
    // LOT 5-PJ-ENVOI — absent d'une réponse plus ancienne que ce lot ⇒ aucune zone de pièces, comme avant.
    piecesDisponibles: c.piecesDisponibles === true,
    /**
     * ══ 🔴 LES SONDES DE SCHÉMA SONT RECOPIÉES UNE À UNE, et ce n'est pas du zèle ═══════════════════════
     *
     * Cet objet est reconstruit champ par champ (jamais étalé) : tout ce qui n'est pas NOMMÉ ici n'atteint
     * jamais l'éditeur. Trois réponses de la route s'y perdaient depuis le lot REDACTION-GMAIL, sans que
     * rien ne le dise — `htmlDisponible`, `classementDisponible` (le champ « Classer ce mail » d'un nouveau
     * message, jamais affiché) et `signatureHtml`.
     *
     * 🔴🔴 `signatureHtml` EST RÉTABLIE — LOT ETOILE-ET-SIGNATURE, ET LA RAISON D'AVANT ÉTAIT FAUSSE.
     *
     * Le lot précédent l'avait laissée de côté en concluant que ces images « ne sont servies qu'à une
     * session Google ». MESURÉ DEPUIS : c'est l'inverse. Adresse nue depuis notre SERVEUR → 200, image/png,
     * 1 933 / 835 / 1 600 octets ; la MÊME adresse avec un jeton Google → 403. Ce n'était pas une question
     * d'identité, mais de qui appelle : le navigateur n'y arrive pas, le serveur si.
     *
     * D'où le chemin en deux temps de ce lot : la route rend une signature dont les images passent par
     * NOTRE route (`signaturePourEcran`), et l'envoi les incorpore au message en `cid:`. Le logo s'affiche
     * dans l'éditeur, et il part avec le message sans aucun lien externe.
     */
    signatureHtml: typeof c.signatureHtml === 'string' ? c.signatureHtml : '',
    htmlDisponible: c.htmlDisponible === true,
    classementDisponible: c.classementDisponible === true,
    // 🔴 LOT RATTACHER-EN-ECRIVANT — la 281 : sans elle le bouton « Interne » de la modale reste grisé.
    interneDisponible: c.interneDisponible === true,
    /**
     * 🔴 LOT LECTURE-HTML-FIL-TROMBONE — migration 276. Absente ⇒ jeter un brouillon redevient « Supprimer
     * le brouillon », sans bandeau « Annuler » : on ne promet pas un retour qu'on ne peut pas tenir.
     */
    corbeilleBrouillon: c.corbeilleBrouillon === true,
  };
}

/** Le contexte d'écriture pour un écran hors de la boîte Gestion (fiche commune ouverte depuis la Location, écran de sortie). `null` : pas encore
 *  lu, ou illisible — aucun bouton d'écriture ne s'affiche alors (se taire vaut mieux que proposer un geste incertain). */
export function useContexteRedaction(): ContexteRedactionEcran | null {
  const [contexte, setContexte] = useState<ContexteRedactionEcran | null>(null);
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/redaction', { cache: 'no-store' });
        if (!res.ok || annule) return;
        const c = (await res.json()) as ContexteRedactionEcran & { brouillons?: number };
        if (annule || typeof c.schemaPret !== 'boolean') return;
        setContexte(contexteRedactionLu(c));
      } catch { /* aucun bouton d'écriture */ }
    })();
    return () => { annule = true; };
  }, []);
  return contexte;
}
