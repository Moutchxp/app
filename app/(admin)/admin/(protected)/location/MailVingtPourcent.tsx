'use client';

import { useEffect, useState } from 'react';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from '../gestion/Redaction';
import { preparerBrouillon } from '../../../../lib/gestion/redaction';
import { brouillonNouveauDepuisLeBien } from '../../../../lib/gestion/nouveauMessageBien';
import { refusUnLocataireParMail } from '../../../../lib/location/mailVingtPourcent';
import type { LigneVingtPourcent } from '../../../../lib/location/vingtPourcent';

/**
 * ══ 🔴🔴 « ENVOYER UN MAIL » DANS LA LIGNE DÉPLIÉE DE « 20 % À RESTITUER » (Arno, 25/11/2026) ═══════════════════════════════════════════════════════
 * « notre module d'envoi de mail EXISTANT (même composant que le reste de l'application, pas de copie) s'ouvre juste en dessous, à l'intérieur de la
 * ligne dépliée ». C'est `Redaction`, monté comme le « Nouveau message » de l'historique d'un bien (HistoriqueDuBien) : brouillon neuf
 * (`preparerBrouillon`), le bien pré-coché et ses adresses proposées en couleurs (`brouillonNouveauDepuisLeBien` : clients du bien, contacts du syndic
 * de la copropriété, contacts de l'immeuble — mêmes pastilles qu'ailleurs), la saisie libre d'une adresse comme partout.
 * Décisions d'Arno du 25/11/2026 : seulement côté Gestion (1A : la Location n'envoie pas, garde-fou inchangé) ; un module par locataire, contrôle à
 * l'écran (l'avertissement ci-dessous) ET au serveur (la marque `vingtPourcent`, relue par la route d'envoi).
 */

export type GesteMail = (message: string, options?: { rechargerTout?: boolean }) => void;
/** Ce que la Gestion passe à l'écran pour que l'on puisse écrire (absent : la Location ; `null` : la Gestion sans droit d'envoi). */
export interface MailVingt { contexte: ContexteRedactionEcran; onGeste?: GesteMail }

/** Les adresses de chaque locataire de la ligne (toutes, sinon la première). PUR. */
export const adressesDesLocataires = (l: Pick<LigneVingtPourcent, 'contacts'>): string[][] =>
  (l.contacts?.locataires ?? []).map((p) => p.emails ?? (p.email !== null ? [p.email] : []));

/** Le brouillon neuf du module : le « Nouveau message » de la colonne, le bien de la ligne pré-coché, ses adresses proposées. */
export async function brouillonDeLaLigne(l: LigneVingtPourcent, contexte: ContexteRedactionEcran): Promise<BrouillonEcran> {
  const base: BrouillonEcran = {
    ...preparerBrouillon('nouveau', null, { adresseGestion: contexte.adresseGestion, signature: contexte.signature }),
    id: null, a: [],
  };
  const b = await brouillonNouveauDepuisLeBien(base, { lotId: l.lotId, cle: l.lotCle ?? '', libelle: l.logement ?? `Bien ${l.lotId}` },
    { texte: contexte.signature, html: contexte.signatureHtml });
  return { ...(b as BrouillonEcran), vingtPourcent: { sortieId: l.sortieId } };
}

/**
 * Le module déplié. « Fermer » (ou un nouveau clic sur « Envoyer un mail », compteur `fermeture` de la ligne) passe par LA porte de l'éditeur
 * (`fermetureDemandee`, comme la croix de la colonne) : c'est lui qui décide du brouillon commencé ; il rend la main par `onFerme`.
 */
export function ModuleMailLigne({ l, mail, fermeture, onFermer }: { l: LigneVingtPourcent; mail: MailVingt; fermeture: number; onFermer: () => void }) {
  const [brouillons, setBrouillons] = useState<BrouillonEcran[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fermer, setFermer] = useState(0);
  const demande = fermeture + fermer;
  // rien d'ouvert dans l'éditeur (lecture en cours ou en échec) : fermer, c'est replier
  useEffect(() => { if (demande > 0 && (brouillons === null || brouillons.length === 0)) onFermer(); }, [demande]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let vivant = true;
    brouillonDeLaLigne(l, mail.contexte)
      .then((b) => { if (vivant) setBrouillons([b]); })
      .catch(() => { if (vivant) setErreur('Le module d’envoi n’a pas pu s’ouvrir : réessayez.'); });
    return () => { vivant = false; };
    // une ouverture = un brouillon ; la ligne relue ne le refait pas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // le dernier module refermé (ou envoyé) replie la ligne — prévenir la ligne HORS de la mise à jour d'état (jamais pendant un rendu)
  const retirer = (i: number): void => {
    const n = (brouillons ?? []).filter((_, j) => j !== i);
    setBrouillons(n);
    if (n.length === 0) onFermer();
  };
  const locataires = adressesDesLocataires(l);
  return (
    <div className="vgp-mail" data-vgp-mail={l.sortieId}>
      {erreur !== null && <p className="cp-refus" role="alert">{erreur}</p>}
      {brouillons === null && erreur === null && <p className="loc-muet" role="status">Ouverture du module…</p>}
      {(brouillons ?? []).map((b, i) => {
        const refus = refusUnLocataireParMail(locataires, [...b.a, ...b.cc, ...b.cci]);
        return (
          <div key={i} className="vgp-mail-module" data-vgp-mail-module={i}>
            {/* 🔴 le contrôle à l'écran : le même motif que le refus du serveur */}
            {refus !== null && <p className="cp-refus" role="alert" data-vgp-mail-refus>{refus}</p>}
            <Redaction brouillon={b} contexte={mail.contexte} lotFiche={l.lotId} fermetureDemandee={demande}
              onChange={(nb) => setBrouillons((bs) => (bs ?? []).map((x, j) => (j === i ? { ...nb, vingtPourcent: { sortieId: l.sortieId } } : x)))}
              onFerme={() => retirer(i)}
              onEnvoye={() => retirer(i)}
              onGeste={(m, o) => mail.onGeste?.(m, o)} />
          </div>
        );
      })}
      <div className="vgp-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setFermer((n) => n + 1)} data-vgp-mail-fermer>Fermer</button>
      </div>
    </div>
  );
}
