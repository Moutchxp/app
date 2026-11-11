'use client';

import { useEffect, useRef } from 'react';
import { useLecture } from './commun';
import { useContextePreavis } from './preavisSynchro';
import type { EncartLogement } from '../../../../lib/location/sortieLocataires';
import type { LignePreavisAccueil } from '../../../../lib/location/preavis';
import { aUnEmail, MOTIF_AUCUN_EMAIL_LOCATAIRE, rendezVousBloque } from '../../../../lib/location/emailLocataireRequis';
import { prenomNom } from '../../../../lib/location/mailsPreavisSortie';

/**
 * ══ 🔴🔴 RÈGLE BLOQUANTE À L'ÉCRAN — AUCUN LOCATAIRE AVEC UN E-MAIL, AUCUN RENDEZ-VOUS (Arno, 11/11/2026) ═══════════════════════════════════════
 * Les adresses des locataires DU PRÉAVIS, lues dans l'encart du logement (mêmes règles que les mails : adresses en vigueur). Relues au RETOUR
 * sur la fenêtre (la fiche complétée dans un autre onglet) sans recharger la page. Bloqué : le message rouge et, pour chaque locataire sans
 * e-mail, « compléter la fiche de Prénom NOM » (sa fiche, dans un nouvel onglet). Le serveur refuse aussi : l'écran ne fait que prévenir.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export interface EmailsLocataires { pret: boolean; bloque: boolean; sansEmail: { locataireId: number; nom: string }[] }

export function useEmailsLocataires(l: Pick<LignePreavisAccueil, 'occupationId' | 'occupationIds'>, actif = true): EmailsLocataires {
  const { base } = useContextePreavis();
  const lu = useLecture<EncartLogement>(actif ? `encartBail=${l.occupationId}` : null, base);
  const relire = useRef(lu.rafraichir);
  useEffect(() => { relire.current = lu.rafraichir; }, [lu.rafraichir]);
  useEffect(() => {
    if (!actif) return;
    const auRetour = (): void => { if (document.visibilityState !== 'hidden') relire.current(); };
    window.addEventListener('focus', auRetour);
    document.addEventListener('visibilitychange', auRetour);
    return () => { window.removeEventListener('focus', auRetour); document.removeEventListener('visibilitychange', auRetour); };
  }, [actif]);
  if (!actif || lu.etat.etat !== 'ok') return { pret: false, bloque: false, sansEmail: [] };
  const locs = (lu.etat.data.coordonnees?.locataires ?? []).filter((x) => l.occupationIds.includes(x.occupationId));
  return {
    pret: true, bloque: rendezVousBloque(locs),
    sansEmail: locs.filter((x) => !aUnEmail(x.emails)).map((x) => ({ locataireId: x.locataireId, nom: prenomNom({ nom: x.nom, prenom: x.prenom ?? null }) })),
  };
}

/** Le message rouge et les liens vers les fiches à compléter ; rien quand le rendez-vous est permis. */
export function BlocageEmailLocataires({ e }: { e: EmailsLocataires }) {
  if (!e.bloque) return null;
  return (
    <div className="cev-alerte elr-alerte" role="alert" data-blocage-email-locataire>
      <style>{CSS_EMAIL_LOCATAIRE_REQUIS}</style>
      <p style={{ margin: 0 }}>{MOTIF_AUCUN_EMAIL_LOCATAIRE}</p>
      {e.sansEmail.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {e.sansEmail.map((x) => (
            <li key={x.locataireId}>
              <a href={`/admin/location/locataire/${x.locataireId}`} target="_blank" rel="noopener" data-completer-fiche-locataire={x.locataireId}>compléter la fiche de {x.nom}</a>
            </li>))}
        </ul>
      )}
    </div>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Le rouge PROPRE au bloc : il paraît partout (fenêtres ET formulaire de la ligne), sans dépendre d'une autre feuille. */
export const CSS_EMAIL_LOCATAIRE_REQUIS = `
.elr-alerte{color:var(--color-svv-red);font-weight:800;overflow-wrap:anywhere}
.elr-alerte a{color:var(--color-svv-red);text-decoration:underline;display:inline-flex;align-items:center;min-height:32px}
`;
