'use client';

import { useContexteRedaction } from './useContexteRedaction';
import { useState } from 'react';
import { BlocHistoriqueEchanges, useFichePersonne } from './BlocHistoriqueEchanges';
import { CSS_HISTORIQUE_DU_BIEN } from './HistoriqueDuBien';
import { CSS_VIE_DU_BIEN } from './VieDuBien';
import { CSS_ANNUAIRE } from './Annuaire';

/**
 * ══ LE BLOC « HISTORIQUE DES ÉCHANGES » D'UN LOGEMENT, EN LECTURE SEULE (écran de sortie de la Location, Arno 19/10/2026) ══
 *
 * LE composant partagé de la fiche locataire (`BlocHistoriqueEchanges`, périmètre « bien »), monté EXACTEMENT comme le fait
 * `HistoriquePersonne` (enveloppe `ann` et ses trois feuilles de style) — aucune copie, aucune variante. Il vit ICI, dans la
 * Gestion, pour que la Location ne recopie aucune brique de fiche (règle « une seule fiche », `aucuneFicheEnDouble.test.ts`).
 * 🔴🔴 (Arno, 27/11/2026, 12h37) l'ÉCRITURE y est désormais ouverte (même module que la Gestion). AVANT : LECTURE SEULE comme partout dans la Location : aucun contexte de rédaction (`redaction={null}` : ni Écrire, ni Répondre, ni
 * Transférer) ; le serveur refuse en outre tout envoi venu d'une page /admin/location (`requeteDepuisLaLocation`).
 * ⚠️ RENDU SEULEMENT UNE FOIS LA FICHE LUE (côté client) : ses feuilles de style ne passent jamais par le rendu serveur.
 */
export function HistoriqueEchangesDuLogementLecture({ locataireCle, lotCle, nom, lotId = null, adresse = null }: {
  /** 🔴🔴 (Arno, 27/11/2026, 12h37) le logement, pour « Écrire un mail » classé sur ce bien ; absent : « Répondre » seulement. */
  lotId?: number | null;
  adresse?: string | null;
  /** La clé WIPPIMMO du locataire (adresses de la fiche, couleurs). */
  locataireCle: string;
  /** La clé WIPPIMMO du logement : les mails de CE logement. */
  lotCle: string;
  /** Le nom affiché si la fiche ne se lit pas. */
  nom: string;
}) {
  const { fiche, erreur } = useFichePersonne('locataire', locataireCle);
  const redaction = useContexteRedaction(); // 🔴🔴 (Arno, 27/11/2026, 12h37) le module d'écriture de la Gestion, ici aussi
  const [maintenant] = useState(() => new Date());
  if (fiche === null && erreur === null) return <p className="gst-info" role="status">Chargement de l’historique des échanges…</p>;
  const lue = fiche ?? { titre: nom, sousTitre: null, adresses: [], occupations: [] };
  return (
    <>
      {erreur !== null && <p className="gst-note" role="status">Adresses de la fiche non lues : {erreur}</p>}
      <div className="ann" data-bloc-historique-partage>
        <style>{CSS_ANNUAIRE}</style>
        <style>{CSS_VIE_DU_BIEN}</style>
        <style>{CSS_HISTORIQUE_DU_BIEN}</style>
        <BlocHistoriqueEchanges sorte="locataire" cle={locataireCle} fiche={lue}
          perimetre={{ sorte: 'bien', cle: lotCle, bienNouveauMessage: lotId === null ? null : { lotId, cle: lotCle, libelle: adresse ?? lotCle } }}
          maintenant={maintenant} redaction={redaction} />
      </div>
    </>
  );
}
