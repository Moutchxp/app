'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { LienRetour, naviguerRetour, retourVersOrigine } from '../_composants/NavigationRetour';
import { CSS_LOCATION_ECRANS, EtatLecture, useLecture } from './commun';
import { API_PREAVIS_LOCATION, ContextePreavis } from './preavisSynchro';
import { FenetrePrevisite } from './PrevisiteAccueil';
import { cheminRetourPrevisite } from '../../../../lib/location/cheminCompteRendu';
import type { LignePreavisAccueil } from '../../../../lib/location/preavis';

/**
 * ══ 🔴🔴 Arno (15/11/2026, 5e retour du test iPhone) — LA PAGE « COMPTE RENDU PRÉ-VISITE » ═════════════════════════════════════════════════
 * Le formulaire n'est plus une fenêtre posée sur la Location : c'est cette page, et RIEN d'autre n'est rendu derrière (aucune frise, aucun
 * bloc « Locataires en préavis »). Les données sont celles du préavis (`preavisEnCours`, la même lecture que la Location) ; le formulaire est
 * LE MÊME composant qu'avant (`FenetrePrevisite`, mode page) : présence, texte, photos, dictaphone, récapitulatif, double validation.
 *   · « ← Retour » et « Annuler » : la page d'origine (la Location dans son état : ligne dépliée…) ; sans origine connue (lien d'un mail) :
 *     la Location, la ligne du préavis dépliée ;
 *   · après l'envoi : retour à la Location, où la fenêtre de résultat habituelle s'affiche (ce qui a été fait, les mails partis).
 */
interface Donnees { disponible?: boolean; lignes?: LignePreavisAccueil[] }

/** Pourquoi le formulaire ne s'ouvre pas (préavis introuvable, rendez-vous pas commencé, compte rendu déjà fait). PUR. */
export function motifSansFormulaire(l: LignePreavisAccueil | null): string | null {
  if (l === null) return 'Ce préavis n’est plus en cours : le compte rendu ne peut plus être saisi.';
  const p = l.previsite ?? null;
  if (p === null || p.rdv === null) return 'Aucune pré-visite n’est programmée pour ce préavis.';
  if (p.statut === 'effectuee') return 'Le compte rendu de cette pré-visite est déjà enregistré : « Voir le compte rendu » depuis la Location.';
  if (p.statut !== 'programmee') return 'La pré-visite de ce préavis n’est plus programmée : le compte rendu ne peut pas être saisi.';
  if (!p.rdvPasse) return 'Le compte rendu s’ouvre dès le début du rendez-vous de pré-visite.';
  return null;
}

/**
 * 🔴 Arno (15/11/2026) — LE FOND JUSQU'AU BORD INFÉRIEUR, EN SOMBRE AUSSI : les couleurs du thème n'existent qu'à partir de la racine de l'admin
 * (`.svv-adm-root[data-theme]`) ; `html` et `body` restaient clairs, visibles au rebond du défilement et sous le clavier iOS. Tant que la page est
 * montée, ils prennent la couleur de fond du formulaire telle que le thème la RÉSOUT (jeton `--color-svv-surface`), relue à chaque changement de
 * thème ; rendus tels quels en quittant la page.
 */
export function useFondDeLaPage(): void {
  useEffect(() => {
    const racine = document.querySelector('.svv-adm-root');
    if (racine === null) return;
    const html = document.documentElement; const corps = document.body;
    const avant = [html.style.backgroundColor, corps.style.backgroundColor];
    const recopier = (): void => {
      const c = getComputedStyle(racine).getPropertyValue('--color-svv-surface').trim();
      if (c !== '') { html.style.backgroundColor = c; corps.style.backgroundColor = c; }
    };
    recopier();
    const mo = new MutationObserver(recopier);
    mo.observe(racine, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    mq?.addEventListener?.('change', recopier);
    return () => { mo.disconnect(); mq?.removeEventListener?.('change', recopier); html.style.backgroundColor = avant[0]; corps.style.backgroundColor = avant[1]; };
  }, []);
}

export function PageCompteRendu({ occupationId }: { occupationId: number }) {
  useFondDeLaPage();
  const lu = useLecture<Donnees>('preavisEnCours=1', API_PREAVIS_LOCATION);
  const contexte = useMemo(() => ({ base: API_PREAVIS_LOCATION, ecriture: true }), []);
  const retour = cheminRetourPrevisite(occupationId);
  const revenir = useCallback((): void => { if (!retourVersOrigine()) naviguerRetour.vers(retour); }, [retour]);
  const d = lu.etat.etat === 'ok' ? lu.etat.data : null;
  const l = d !== null && Array.isArray(d.lignes) ? d.lignes.find((x) => x.occupationIds.includes(occupationId)) ?? null : null;
  const motif = d === null ? null : motifSansFormulaire(l);
  return (
    <ContextePreavis.Provider value={contexte}>
      <div className="pvv-page" data-page-compte-rendu={occupationId}>
        <style>{CSS_LOCATION_ECRANS}</style>
        <LienRetour href={retour} />
        {d === null ? <EtatLecture etat={lu.etat} />
          : motif !== null || l === null || !l.previsite ? <div className="svv-card" role="status" data-cr-impossible>{motif}</div>
            : <FenetrePrevisite page geste="compte_rendu" l={l} p={l.previsite} onFermer={revenir} />}
      </div>
    </ContextePreavis.Provider>
  );
}
