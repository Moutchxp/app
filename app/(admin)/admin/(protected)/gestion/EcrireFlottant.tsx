'use client';

import { useCallback, useState, type ReactNode } from 'react';
import type { BrouillonEcran, ContexteRedactionEcran } from './Redaction';
import { FenetresRedaction, useFenetresRedaction } from './FenetresRedaction';
import { preparerBrouillon } from '../../../../lib/gestion/redaction';
import { preremplirDemande, type DemandeEcriture, type EcrireDepuisGestionFn } from '../../../../lib/gestion/mailSyndic';

/**
 * ══ 🔴🔴 ÉCRIRE À UN CONTACT DEPUIS gestion@, HORS DE LA BOÎTE (Arno, 27/11/2026, 22h17) ════════════════════════════════════════════════════════════
 * « C'est le DROIT D'ENVOI qui décide, pas la tuile » (règle de 7b5715a6) : dans la Location, les « Écrire » d'une fiche (contacts de l'annuaire, du
 * syndic) ouvraient la messagerie de l'ordinateur (mailto) au lieu du module de la boîte Gestion. Ils ouvrent désormais LE MÊME « Nouveau message »
 * pré-adressé que la boîte (`brouillonAdresse`, partagé avec PleinEcranBoite ; préremplissage d'une fiche syndic par `preremplirDemande`), dans les
 * MÊMES fenêtres flottantes (`FenetresRedaction`). Sans droit d'envoi : `onEcrire` absent — l'« Écrire » d'avant (mailto) reste, rien n'est retiré.
 */

/** Le « Nouveau message » pré-adressé de la boîte Gestion (même signature, même brouillon). PUR. */
export function brouillonAdresse(email: string, redaction: ContexteRedactionEcran, autres: readonly string[] = []): BrouillonEcran {
  // 🔴 (Arno, 28/11/2026, 12h17, point 2) plusieurs adresses sélectionnées : UN mail, toutes en « À » (sans doublon, majuscules ignorées)
  const a = [email, ...autres].map((x) => x.trim()).filter((x, i, l) => x !== '' && l.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  return {
    ...preparerBrouillon('nouveau', null, { adresseGestion: redaction.adresseGestion, signature: redaction.signature }),
    a,
    id: null,
  };
}

/** Le brouillon d'une demande d'écriture (adresse seule, ou fiche syndic à préremplir), avec la clé de sa fenêtre. */
export async function brouillonDeLaDemande(demande: DemandeEcriture, redaction: ContexteRedactionEcran): Promise<{ cle: string; brouillon: BrouillonEcran }> {
  const email = typeof demande === 'string' ? demande : demande.email;
  const adresse = brouillonAdresse(email, redaction, typeof demande === 'string' ? [] : demande.contexte.autres ?? []);
  if (typeof demande === 'string') return { cle: `nouveau:${email}`, brouillon: adresse };
  const b = await preremplirDemande(demande, adresse, { texte: redaction.signature, html: redaction.signatureHtml });
  return { cle: `nouveau:${email}:${Date.now()}`, brouillon: b };
}

/** Le geste « Écrire depuis gestion@ » d'un écran hors de la boîte, et ses fenêtres. `onEcrire` absent sans droit d'envoi. */
export function useEcrireFlottant(redaction: ContexteRedactionEcran | null): { onEcrire: EcrireDepuisGestionFn | undefined; fenetres: ReactNode } {
  const fen = useFenetresRedaction();
  const [refus, setRefus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const peut = redaction !== null && redaction.schemaPret && redaction.peutEnvoyer;
  const { ouvrirFenetre } = fen;
  const onEcrire = useCallback((email: string, contexte?: Parameters<EcrireDepuisGestionFn>[1]) => {
    if (redaction === null || email.trim() === '') return;
    void brouillonDeLaDemande(contexte === undefined ? email : { email, contexte }, redaction).then(({ cle, brouillon }) => setRefus(ouvrirFenetre(cle, brouillon)));
  }, [redaction, ouvrirFenetre]);
  const fenetres = !peut ? null : <>
    {refus !== null && <p className="cp-refus" role="alert" data-ecrire-flottant-refus>{refus}</p>}
    {message !== null && <p className="gst-info" role="status" data-ecrire-flottant-message>{message}</p>}
    {fen.fenetres.length > 0 && (
      <FenetresRedaction fenetres={fen.fenetres} brouillons={fen.brouillons} contexte={redaction} fermetures={fen.fermetures}
        onChange={fen.majBrouillon} onEtat={fen.changerLEtat} onFermer={fen.fermerLa} onDemanderFermeture={fen.demanderFermeture}
        onEnvoye={(cle) => fen.fermerLa(cle)} onGeste={(m) => { if (m.trim() !== '') setMessage(m); }} />)}
  </>;
  return { onEcrire: peut ? onEcrire : undefined, fenetres };
}
