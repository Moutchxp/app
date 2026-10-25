'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreationBien } from '../location/CreationBien';
import { ModaleIssue } from '../location/ModaleIssue';
import type { LectureFiche } from '../../../../lib/location/ficheBienEntiereRepo';
import type { FicheLot } from '../../../../lib/gestion/annuaireRepo';
import { lignesResume } from '../../../../lib/location/resumeBienLignes';
import { annoncerBienModifie, useVersionBien, type ImportBien } from './EditionEncart';
import { BlocTraceFiche, CSS_TRACE_FICHE, useTraceFiche } from '../location/TraceFiche';
import { motifConflitFiche, type EcranTrace } from '../../../../lib/gestion/traceFiche';

/**
 * ══ 🔴🔴 « MODIFIER » LA FICHE DU BIEN : LA PAGE « AJOUTER UN NOUVEAU BIEN », À L'IDENTIQUE (Arno, 23/10/2026) ═════════════════════
 *
 * « Un clic sur “Modifier” du bloc Caractéristiques doit afficher DIRECTEMENT la page “Ajouter un nouveau bien” de la tuile Location,
 * présentation STRICTEMENT identique (mêmes blocs numérotés, mêmes cartes, mêmes boutons, mêmes largeurs, même barre du bas), SAUF le
 * bloc 1 “Propriétaire(s)” […] Tout est pré-rempli. Un seul écran. » Une PAGE, donc, et non un calque : `/admin/location/bien/[id]/modifier`
 * et `/admin/gestion/bien/[id]/modifier` rendent ce composant dans la même `<section className="gst-page">` que `nouveau-bien` — même
 * mise en page, mêmes largeurs —, et ce composant rend `CreationBien` (le MÊME composant que la page d'origine, en mode modification).
 * « Annuler » et la fin de l'enregistrement reviennent à la fiche. L'empreinte du bien est relue toutes les quelques secondes : si elle
 * change pendant la saisie, le formulaire le dit (« Ce bien a été modifié par ailleurs — recharger ? »).
 */
const API = '/api/admin/gestion/annuaire/location';

/**
 * Arno (24/10/2026) — `modale` : le MÊME formulaire ouvert dans une grande modale (« Caractéristiques du bien loué » de « Nouveau
 * locataire ») ; « Annuler », Échap et le lien de l'en-tête la referment sans rien écrire, l'enregistrement la referme et prévient
 * l'hôte (qui relit le bien). Absent : la page, qui revient à la fiche (comportement inchangé).
 */
export function ModifierFicheBien({ lotId, retour, modale, trace, blocApres }: { lotId: number; retour: { href: string; mot: string };
  /** 🔴 425 — un bloc ajouté sous « Statut du bien » (le bloc 9 « Origine du contact », depuis le Suivi du mois). */
  blocApres?: (numero: number) => React.ReactNode;
  modale?: { onFermer: () => void; onEnregistre: () => void };
  /**
   * 🔴 Arno (24/10/2026, 417) — ouvert depuis un écran TRACÉ (« Suivi du mois ») : « Dernière modification » et l'historique de la
   * fiche au-dessus du formulaire ; l'écran et la session au journal (une ligne par champ) ; un conflit dit qui et quand ;
   * « Enregistrer les modifications » inactif tant que rien n'a changé. Absent : l'écran d'avant, inchangé.
   */
  trace?: { ecran: EcranTrace } }) {
  const router = useRouter();
  const [lecture, setLecture] = useState<LectureFiche | null>(null);
  const [importe, setImporte] = useState<ImportBien | undefined>(undefined);
  const [refus, setRefus] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const versionDistante = useVersionBien(lotId);
  const historique = useTraceFiche('lot', lotId, trace !== undefined);
  const relireTrace = historique.relire;
  // Une empreinte distante qui change (modification par ailleurs) : la trace se relit, pour dire QUI et QUAND.
  useEffect(() => { if (trace !== undefined && versionDistante !== null) relireTrace(); }, [trace, versionDistante, relireTrace]);
  const lire = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch(`${API}?ficheEntiere=${lotId}`, { cache: 'no-store' });
      const d = await r.json() as { etat?: string; data?: LectureFiche };
      if (d.etat === 'ok' && d.data) { setLecture(d.data); setRefus(null); setN((x) => x + 1); return; }
      setRefus(d.etat === 'inconnu' ? 'Ce bien n’existe pas (ou plus).' : d.etat === 'sans_schema' ? 'La base de données n’est pas à jour pour modifier ce bien.' : 'La fiche du bien n’a pas pu être lue.');
    } catch { setRefus('La fiche du bien n’a pas pu être lue : le serveur n’a pas répondu.'); }
  }, [lotId]);
  useEffect(() => { void lire(); }, [lire]);
  // Les valeurs de l'import WIPPIMMO que l'encart affiche quand la Location est vide : DITES dans le formulaire, jamais recopiées.
  useEffect(() => {
    let vivant = true;
    void fetch(`/api/admin/gestion/annuaire?lot=${lotId}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: FicheLot }>)
      .then((d) => {
        if (!vivant || d.etat !== 'ok' || d.data === undefined) return;
        const imp = lignesResume({ nature: d.data.nature, typeBien: d.data.typeBien, surfaceM2: d.data.surfaceM2 }, undefined);
        setImporte({ type: imp.type, meuble: imp.meuble, pieces: imp.pieces, surface: imp.surfaces[0]?.m2 ?? null });
      }).catch(() => {});
    return () => { vivant = false; };
  }, [lotId]);
  const fermerModale = modale?.onFermer;
  const revenir = useCallback((): void => { if (fermerModale !== undefined) fermerModale(); else router.push(retour.href); }, [router, retour.href, fermerModale]);
  if (lecture === null) {
    return refus === null ? <p className="loc-muet" role="status">Lecture de la fiche du bien…</p> : (
      <ModaleIssue sorte="erreur" titre="Modification impossible" onFermer={revenir}
        echec={{ quoi: 'Le formulaire ne s’ouvre pas.', pourquoi: refus, faire: 'Revenez à la fiche, puis réessayez dans un instant.', conserve: 'Rien n’a été modifié.' }}
        actions={[{ libelle: 'Revenir à la fiche', onClick: revenir, principal: true, repere: 'fermer-lecture' }]} />
    );
  }
  return (
    <>
      <style>{CSS_MODIFIER_FICHE_BIEN + (trace !== undefined ? CSS_TRACE_FICHE : '')}</style>
      {trace !== undefined && <BlocTraceFiche trace={historique} />}
      <CreationBien key={`${lecture.version}-${n}`} proprietairesInitiaux={[]}
        modification={{
          lotId, lecture, versionDistante, importe, retour, ...(modale !== undefined ? { dansModale: true } : {}), ...(blocApres !== undefined ? { blocApres } : {}),
          onFermer: revenir,
          onEnregistre: () => { annoncerBienModifie(lotId); if (modale !== undefined) modale.onEnregistre(); else revenir(); },
          onRecharger: () => { void lire(); if (trace !== undefined) relireTrace(); },
          ...(trace !== undefined ? { detailConflit: motifConflitFiche(historique.derniere), desactiverSansChangement: true } : {}),
          enregistrer: async (saisie) => {
            const r = await fetch(API, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'x-svav-confirmation': 'propre' },
              body: JSON.stringify({ action: 'modifier-fiche-bien', id: lotId, saisie, ...(trace !== undefined ? { ecran: trace.ecran } : {}) }),
            });
            const corps = await r.json().catch(() => ({})) as { etat?: string };
            if (trace !== undefined && corps.etat === 'conflit') relireTrace();
            return { statut: r.status, corps };
          },
          occupationsDe: async (annexeId) => {
            const r = await fetch(`${API}?apercuArchivage=${annexeId}&sujet=bien`, { cache: 'no-store' });
            const d = await r.json() as { data?: { occupees?: unknown[] } };
            return Array.isArray(d.data?.occupees) ? d.data.occupees.length : 0;
          },
        }} />
    </>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; rien ne deborde. */
export const CSS_MODIFIER_FICHE_BIEN = `
.mfb-conflit{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0;padding:10px 14px;border-radius:14px;border:1px solid var(--color-svv-amber);background:var(--color-svv-amber-soft);color:var(--color-svv-ink);font-weight:700;overflow-wrap:anywhere}
.mfb-conflit .svv-btn{min-height:44px;width:auto;margin:0}
.mfb-sortie{opacity:.7}
.mfb-sortie .loc-annexe-titre{text-decoration:line-through}
.mfb-note{margin:0;color:var(--color-svv-muted);font-size:.9rem;overflow-wrap:anywhere}
.mfb-fige input:disabled{opacity:1;color:var(--color-svv-muted)}
`;
