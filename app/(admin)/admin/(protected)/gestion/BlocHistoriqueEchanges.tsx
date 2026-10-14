'use client';

import { useEffect, useState } from 'react';
import { HistoriqueDuBien, type PersonneHistorique } from './HistoriqueDuBien';
import type { ContexteRedactionEcran } from './Redaction';
import type { CategoriePartie } from '../../../../lib/gestion/historiqueBien';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-ECHANGES-FICHE-LOCATAIRE (Arno, 14/10/2026) — LE BLOC « HISTORIQUE DES ÉCHANGES », UNE FOIS ═════
 *
 * DEMANDE D'ARNO : sur la fiche d'un locataire, « remplacer le bloc “VIE DU BIEN” par EXACTEMENT le même bloc
 * “HISTORIQUE DES ÉCHANGES” que sur la fiche propriétaire, avec toutes ses fonctions […] NE PAS COPIER-COLLER : extrais le
 * bloc propriétaire en UN composant partagé, paramétré par son périmètre de mails ».
 *
 * 🔴 CE COMPOSANT EST CE QUE `HistoriquePersonne` MONTAIT SOUS SON EN-TÊTE, déplacé tel quel : `HistoriqueDuBien`
 * monté avec `personne` (couleurs de la famille de la fiche, aucune occupation de bien) et la lecture de la fiche. La
 * fiche propriétaire le reçoit avec le périmètre « échanges » et rend donc, au nœud près, ce qu'elle rendait avant.
 *
 * ⚠️ IL NE REND AUCUN CADRE NI AUCUNE FEUILLE DE STYLE : c'est l'HÔTE qui les monte (`HistoriquePersonne` son cadre `.ann`
 * et ses trois feuilles, à l'identique ; la fiche de l'annuaire les a déjà). Les rendre ici aurait imbriqué un second
 * `.ann` dans la fiche, et fait importer `Annuaire` par un composant qu'`Annuaire` importe — une dépendance circulaire.
 *
 * 🔴 LE PÉRIMÈTRE EST LE SEUL PARAMÈTRE QUI CHANGE LA SÉLECTION :
 *   · `{ sorte: 'echanges' }` — les mails échangés avec la ou les personnes de la fiche (leurs adresses) ;
 *   · `{ sorte: 'bien', cle, bienNouveauMessage }` — les mails rattachés à ce bien (la fiche locataire : ceux de son
 *     logement, la règle de « Vie du bien », inchangée), et « Nouveau message » rattaché d'office à ce bien.
 */
export type PerimetreEchanges =
  | { sorte: 'echanges' }
  | { sorte: 'bien'; cle: string; bienNouveauMessage: { lotId: number; cle: string; libelle: string } | null }
  /**
   * 🔴🔴 LOT HISTORIQUE-ECHANGES-ANCIEN-LOCATAIRE (Arno, 14/10/2026) — la fiche d'un ANCIEN locataire : les mails des
   * logements qu'il a loués (tous), vus par défaut « Pendant sa location ». Les logements et leurs dates sont ceux que la
   * route rend pour la fiche (`fiche.occupations`) — les mêmes que la requête. « Nouveau message » : son dernier logement.
   */
  | { sorte: 'logements'; bienNouveauMessage: { lotId: number; cle: string; libelle: string } | null };

/** Ce que la route `/historique` dit d'une fiche de personne (titre, adresses actives, logements occupés). */
export interface FichePersonneLue {
  titre: string;
  sousTitre: string | null;
  adresses: string[];
  occupations: { cle: string; libelle: string; depuis: string | null; jusqua: string | null }[];
}

/** La clé d'écran d'une fiche de personne : `proprio-…` ou `locataire-…`. PUR. */
export function texteFichePersonne(sorte: 'proprietaire' | 'locataire', cle: string): string {
  return `${sorte === 'proprietaire' ? 'proprio' : 'locataire'}-${cle}`;
}

/**
 * 🔴 LES COULEURS DES FAMILLES, comme sur un bien : les adresses de la fiche portent SA famille (propriétaire, ou
 * locataire — « ancien locataire » quand plus aucune occupation n'est en cours). Les autres restent grises. PUR.
 */
export function categoriesDeLaFichePersonne(
  sorte: 'proprietaire' | 'locataire', fiche: FichePersonneLue | null,
): Map<string, CategoriePartie> {
  const famille: CategoriePartie = sorte === 'proprietaire' ? 'proprietaire'
    : (fiche?.occupations ?? []).some((o) => o.jusqua === null) || (fiche?.occupations ?? []).length === 0
      ? 'locataire' : 'ancien_locataire';
  return new Map<string, CategoriePartie>((fiche?.adresses ?? []).map((a) => [a.toLowerCase(), famille]));
}

/**
 * La `personne` que reçoit `HistoriqueDuBien`, selon le périmètre. PUR.
 *
 * ⚠️ PÉRIMÈTRE « ÉCHANGES » : exactement l'objet d'avant ce lot (occupations du locataire, lien vers ses logements).
 * ⚠️ PÉRIMÈTRE « BIEN » : ni occupations ni lien — la fiche locataire porte déjà ses logements en cartes au-dessus,
 * et le bloc de la fiche propriétaire n'a pas cette ligne. Le bloc est donc bien « le même que la fiche propriétaire ».
 */
export function personneDuBloc(
  sorte: 'proprietaire' | 'locataire', cle: string, fiche: FichePersonneLue, perimetre: PerimetreEchanges,
  onOuvrirLogement?: (cle: string) => void,
): PersonneHistorique {
  const base = { sorte, cle, nom: fiche.titre, adresses: fiche.adresses };
  if (perimetre.sorte === 'bien') {
    return { ...base, perimetreBien: perimetre.cle, bienNouveauMessage: perimetre.bienNouveauMessage };
  }
  if (perimetre.sorte === 'logements') {
    return { ...base, logementsLoues: fiche.occupations, bienNouveauMessage: perimetre.bienNouveauMessage };
  }
  return {
    ...base,
    ...(sorte === 'locataire' ? { occupations: fiche.occupations } : {}),
    ...(onOuvrirLogement !== undefined ? { onOuvrirLogement } : {}),
  };
}

/**
 * La lecture de la fiche (titre, adresses, logements), par la route de l'historique. Ce que `HistoriquePersonne`
 * faisait au montage, au caractère près ; partagé pour que la fiche locataire lise les MÊMES adresses.
 */
export function useFichePersonne(sorte: 'proprietaire' | 'locataire', cle: string): {
  fiche: FichePersonneLue | null; erreur: string | null;
} {
  const texte = texteFichePersonne(sorte, cle);
  const [fiche, setFiche] = useState<FichePersonneLue | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/historique?cible=${encodeURIComponent(texte)}&echanges=1&taille=1`,
          { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string; message?: string;
          data?: { titre?: string; sousTitre?: string | null; adresses?: string[];
            occupations?: { cle: string; libelle: string; depuis: string | null; jusqua: string | null }[] };
        };
        if (!vivant) return;
        if (d.etat !== 'ok' || d.data === undefined) {
          setErreur(d.etat === 'inconnue' ? 'Cette fiche n’existe pas (ou plus) dans l’annuaire.'
            : d.etat === 'sans_schema' ? 'Historique pas encore installé : la mise à jour de la base reste à appliquer.'
              : (d.message ?? 'Lecture impossible.'));
          return;
        }
        setFiche({
          titre: d.data.titre ?? '', sousTitre: d.data.sousTitre ?? null,
          adresses: Array.isArray(d.data.adresses) ? d.data.adresses : [],
          occupations: Array.isArray(d.data.occupations) ? d.data.occupations : [],
        });
      } catch {
        if (vivant) setErreur('Lecture impossible : le serveur n’a pas répondu.');
      }
    })();
    return () => { vivant = false; };
  }, [texte]);

  return { fiche, erreur };
}

/** LE BLOC « HISTORIQUE DES ÉCHANGES » : ce que la fiche propriétaire montrait, paramétré par son périmètre. */
export function BlocHistoriqueEchanges({
  sorte, cle, fiche, perimetre, maintenant, redaction = null, onGesteMail, onOuvrirFil, onOuvrirLogement,
}: {
  sorte: 'proprietaire' | 'locataire';
  /** La clé WIPPIMMO de la fiche. */
  cle: string;
  fiche: FichePersonneLue;
  perimetre: PerimetreEchanges;
  maintenant: Date;
  redaction?: ContexteRedactionEcran | null;
  onGesteMail?: (message: string, options?: { rechargerTout?: boolean }) => void;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /** Ouvrir l'historique d'un logement occupé (périmètre « échanges » d'un locataire seulement). */
  onOuvrirLogement?: (cle: string) => void;
}) {
  const texte = texteFichePersonne(sorte, cle);
  const personne = personneDuBloc(sorte, cle, fiche, perimetre, onOuvrirLogement);
  /* ⚠️ LA CLÉ PORTE LE PÉRIMÈTRE : changer de logement remonte le moteur à neuf, comme changer de fiche. */
  const clef = perimetre.sorte === 'bien' ? `${texte}|lot-${perimetre.cle}`
    : perimetre.sorte === 'logements' ? `${texte}|loues` : texte;
  return (
    <HistoriqueDuBien key={clef} lotCle={texte} personne={personne}
      maintenant={maintenant} occupations={[]} categories={categoriesDeLaFichePersonne(sorte, fiche)}
      redaction={redaction} onGesteMail={onGesteMail} onOuvrirFil={onOuvrirFil} />
  );
}
