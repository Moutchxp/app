'use client';

import { useState } from 'react';
import { BlocHistoriqueEchanges, useFichePersonne } from './BlocHistoriqueEchanges';
import { CSS_HISTORIQUE_DU_BIEN } from './HistoriqueDuBien';
import { CSS_VIE_DU_BIEN } from './VieDuBien';
import { CSS_ANNUAIRE } from './Annuaire';
import { MOTIF_ENVOI_DEPUIS_LOCATION } from '../../../../lib/gestion/contexteLocation';

/**
 * ══ LE BLOC « HISTORIQUE DES ÉCHANGES » D'UN LOGEMENT, EN LECTURE SEULE (écran de sortie de la Location, Arno 19/10/2026) ══
 *
 * LE composant partagé de la fiche locataire (`BlocHistoriqueEchanges`, périmètre « bien »), monté EXACTEMENT comme le fait
 * `HistoriquePersonne` (enveloppe `ann` et ses trois feuilles de style) — aucune copie, aucune variante. Il vit ICI, dans la
 * Gestion, pour que la Location ne recopie aucune brique de fiche (règle « une seule fiche », `aucuneFicheEnDouble.test.ts`).
 * LECTURE SEULE comme partout dans la Location : aucun contexte de rédaction (`redaction={null}` : ni Écrire, ni Répondre, ni
 * Transférer) ; le serveur refuse en outre tout envoi venu d'une page /admin/location (`requeteDepuisLaLocation`).
 * ⚠️ RENDU SEULEMENT UNE FOIS LA FICHE LUE (côté client) : ses feuilles de style ne passent jamais par le rendu serveur.
 */
export function HistoriqueEchangesDuLogementLecture({ locataireCle, lotCle, nom }: {
  /** La clé WIPPIMMO du locataire (adresses de la fiche, couleurs). */
  locataireCle: string;
  /** La clé WIPPIMMO du logement : les mails de CE logement. */
  lotCle: string;
  /** Le nom affiché si la fiche ne se lit pas. */
  nom: string;
}) {
  const { fiche, erreur } = useFichePersonne('locataire', locataireCle);
  const [maintenant] = useState(() => new Date());
  if (fiche === null && erreur === null) return <p className="gst-info" role="status">Chargement de l’historique des échanges…</p>;
  const lue = fiche ?? { titre: nom, sousTitre: null, adresses: [], occupations: [] };
  return (
    <>
      <p className="fco-note" role="note" style={{ margin: 0, fontSize: '.85rem', color: 'var(--color-svv-muted)' }}>{MOTIF_ENVOI_DEPUIS_LOCATION}</p>
      {erreur !== null && <p className="gst-note" role="status">Adresses de la fiche non lues : {erreur}</p>}
      <div className="ann" data-bloc-historique-partage>
        <style>{CSS_ANNUAIRE}</style>
        <style>{CSS_VIE_DU_BIEN}</style>
        <style>{CSS_HISTORIQUE_DU_BIEN}</style>
        <BlocHistoriqueEchanges sorte="locataire" cle={locataireCle} fiche={lue}
          perimetre={{ sorte: 'bien', cle: lotCle, bienNouveauMessage: null }} maintenant={maintenant} redaction={null} />
      </div>
    </>
  );
}
