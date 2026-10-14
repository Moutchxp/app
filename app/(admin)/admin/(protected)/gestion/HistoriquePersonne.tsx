'use client';

import { useEffect, useState } from 'react';
import { CSS_HISTORIQUE } from './HistoriqueCible';
import { CSS_HISTORIQUE_DU_BIEN, HistoriqueDuBien, type PersonneHistorique } from './HistoriqueDuBien';
import { CSS_VIE_DU_BIEN } from './VieDuBien';
import { CSS_ANNUAIRE } from './Annuaire';
import { motSorte } from './EncartRattachement';
import type { ContexteRedactionEcran } from './Redaction';
import type { Cible } from '../../../../lib/gestion/rattachement';
import type { CategoriePartie } from '../../../../lib/gestion/historiqueBien';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-PERSONNE (Arno, 14/10/2026) — L'HISTORIQUE D'UNE FICHE PROPRIÉTAIRE OU LOCATAIRE ════════════════
 *
 * DEMANDE D'ARNO : « TOUS les mails échangés entre CE propriétaire et nous, et eux seuls […] Présentation et comportement
 * STRICTEMENT IDENTIQUES à la liste de mails de l'historique d'un bien […] Un seul composant partagé pour les trois
 * historiques (bien, propriétaire, locataire), seule la sélection des mails change. » Même chose pour le locataire.
 *
 * 🔴 CET ÉCRAN N'A QU'UN EN-TÊTE À LUI (« ← Écran partagé », « Réception », la nature et le nom de la fiche — gardés,
 * décision d'Arno, point 9) : tout le reste EST `HistoriqueDuBien`, monté avec `personne`. Les mails sont choisis par
 * les adresses de la fiche (`echanges=1`), toutes personnes de la fiche comprises.
 *
 * ⚠️ RETIRÉS DE CET ÉCRAN, avec l'accord d'Arno (14/10/2026) : « Inclure les mails de ses N logements » et « Regrouper
 * par logement » (1), « Interlocuteurs » (5), « N propositions non confirmées » — elles restent dans « À rattacher »
 * (6). Remplacés par leurs équivalents de l'historique d'un bien : la barre OPTIONS (4), les cartes de mail (7), le
 * compteur et les pages (8), le message de liste vide (10). Gardés : les dates Du / Au, dans « Période » (3), et la
 * ligne des logements occupés d'un locataire (2).
 */
export function HistoriquePersonne({
  cible, maintenant, redaction = null, onRetour, onReception, onOuvrirFil, onGesteMail, onOuvrirLogement,
}: {
  cible: Cible & { sorte: 'proprietaire' | 'locataire' };
  maintenant: Date;
  redaction?: ContexteRedactionEcran | null;
  onRetour: () => void;
  onReception?: () => void;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  onGesteMail?: (message: string, options?: { rechargerTout?: boolean }) => void;
  /** Ouvrir l'historique d'un logement occupé (fiche du bien, sur son historique). */
  onOuvrirLogement?: (cle: string) => void;
}) {
  const cle = cible.cle ?? '';
  const texte = `${cible.sorte === 'proprietaire' ? 'proprio' : 'locataire'}-${cle}`;
  const [fiche, setFiche] = useState<{
    titre: string; sousTitre: string | null; adresses: string[];
    occupations: { cle: string; libelle: string; depuis: string | null; jusqua: string | null }[];
  } | null>(null);
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

  /* 🔴 LES COULEURS DES FAMILLES, comme sur un bien : les adresses de la fiche portent SA famille (propriétaire, ou
     locataire — « ancien locataire » quand plus aucune occupation n'est en cours). Les autres restent grises. */
  const famille: CategoriePartie = cible.sorte === 'proprietaire' ? 'proprietaire'
    : (fiche?.occupations ?? []).some((o) => o.jusqua === null) || (fiche?.occupations ?? []).length === 0
      ? 'locataire' : 'ancien_locataire';
  const categories = new Map<string, CategoriePartie>((fiche?.adresses ?? []).map((a) => [a.toLowerCase(), famille]));
  const personne: PersonneHistorique | null = fiche === null ? null : {
    sorte: cible.sorte, cle, nom: fiche.titre, adresses: fiche.adresses,
    ...(cible.sorte === 'locataire' ? { occupations: fiche.occupations } : {}),
    ...(onOuvrirLogement !== undefined ? { onOuvrirLogement } : {}),
  };

  return (
    <section className="hst hpe" aria-labelledby="hst-titre" data-historique-personne={cible.sorte}>
      <style>{CSS_HISTORIQUE}</style>
      <div className="hst-entete">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRetour}>← Écran partagé</button>
        {onReception !== undefined && (
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onReception}>Réception</button>
        )}
        <div className="hst-identite">
          <span className="hst-sorte">{motSorte(cible.sorte)}</span>
          <h2 className="hst-titre" id="hst-titre">{fiche?.titre ?? '…'}</h2>
          {fiche?.sousTitre && <p className="hst-sous">{fiche.sousTitre}</p>}
        </div>
      </div>
      {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}
      {personne !== null && (
        <div className="ann">
          <style>{CSS_ANNUAIRE}</style>
          <style>{CSS_VIE_DU_BIEN}</style>
          <style>{CSS_HISTORIQUE_DU_BIEN}</style>
          <HistoriqueDuBien key={texte} lotCle={texte} personne={personne}
            maintenant={maintenant} occupations={[]} categories={categories}
            redaction={redaction} onGesteMail={onGesteMail} onOuvrirFil={onOuvrirFil} />
        </div>
      )}
    </section>
  );
}
