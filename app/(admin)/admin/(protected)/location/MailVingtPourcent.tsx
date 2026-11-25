'use client';

import { useEffect, useState } from 'react';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from '../gestion/Redaction';
import { preparerBrouillon } from '../../../../lib/gestion/redaction';
import { brouillonNouveauDepuisLeBien } from '../../../../lib/gestion/nouveauMessageBien';
import { brouillonMailSyndic, formulePour } from '../../../../lib/gestion/mailSyndic';
import { destinatairesModeleVingt, MODELES_VINGT, refusUnLocataireParMail, suggestionsDeLaSortie, texteModeleVingt, type CleModeleVingt } from '../../../../lib/location/mailVingtPourcent';
import type { LigneVingtPourcent } from '../../../../lib/location/vingtPourcent';
import { ListeChoix } from './ListeChoix';

/**
 * ══ 🔴🔴 « ENVOYER UN MAIL » DANS LA LIGNE DÉPLIÉE DE « 20 % À RESTITUER » (Arno, 25/11/2026) ═══════════════════════════════════════════════════════
 * « notre module d'envoi de mail EXISTANT (même composant que le reste de l'application, pas de copie) s'ouvre juste en dessous, à l'intérieur de la
 * ligne dépliée ». C'est `Redaction`, monté comme le « Nouveau message » de l'historique d'un bien sur sa fiche (Gestion) : brouillon neuf
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

/**
 * 🔴🔴 (Arno, 25/11/2026, point 4) « chaque mail envoyé est inscrit dans l'historique […] du bien […], comme les autres mails de l'application (même
 * mécanisme, journal) » : le bien de la ligne part comme CIBLE EXPLICITE (sans `origine` — jamais écartée par le filet de l'envoi `ciblesCoherentes`,
 * même pour un mail au seul syndic) ; la route la pose (`gestion_envoi_cible`) puis en fait un rattachement CONFIRMÉ dès que le mail envoyé est
 * capturé (`appliquerCiblesEnAttente`) — l'historique du bien. Les personnes (locataire, propriétaire, contact du syndic) le retrouvent par leurs
 * adresses, et la copropriété par ses biens (décision 3A) ; la route écrit aussi sa ligne de `gestion_journal`. 🔴 (25/11/2026) SEUL ce bien : toute autre cible est écartée. PUR.
 */
export function ciblesAvecLeBien<C extends { sorte?: string; id?: number | null; cle?: string | null; origine?: unknown }>(
  cibles: readonly C[] | undefined, l: Pick<LigneVingtPourcent, 'lotId' | 'lotCle' | 'logement'>,
): Array<{ sorte: 'lot'; cle: string | null; id: number; libelle: string }> {
  // 🔴🔴 (Arno, 25/11/2026) « il ne peut pas y avoir d'autre choix que celui qui concerne le bien auquel était rattaché le locataire avant sa sortie » :
  //    LE SEUL bien de la ligne (toute autre cible, venue des destinataires ou d'ailleurs, est écartée)
  const existant = (cibles ?? []).find((c) => c.sorte === 'lot' && (c.id === l.lotId || (l.lotCle != null && c.cle === l.lotCle))) as (C & { libelle?: string }) | undefined;
  return [{ sorte: 'lot', cle: l.lotCle ?? existant?.cle ?? null, id: l.lotId, libelle: existant?.libelle ?? l.logement ?? `Bien ${l.lotId}` }];
}

/** 🔴 (Arno, 25/11/2026) le libellé du classement verrouillé : « [adresse du bien], lot n° … » (les numéros s'ils sont sur la fiche). PUR. */
export function libelleBienVerrouille(l: Pick<LigneVingtPourcent, 'lotId' | 'logement' | 'numLots'>): string {
  const lots = [...new Set((l.numLots ?? []).map((x) => x.trim()).filter((x) => x !== ''))];
  const adresse = l.logement ?? `Bien ${l.lotId}`;
  return lots.length === 0 ? adresse : `${adresse}, ${lots.length > 1 ? 'lots' : 'lot'} n° ${lots.length > 1 ? `${lots.slice(0, -1).join(', ')} et ${lots[lots.length - 1]}` : lots[0]}`;
}

/** Le brouillon neuf du module : le « Nouveau message » de la colonne, le bien de la ligne pré-coché, ses adresses proposées. */
export async function brouillonDeLaLigne(l: LigneVingtPourcent, contexte: ContexteRedactionEcran): Promise<BrouillonEcran> {
  const base: BrouillonEcran = {
    ...preparerBrouillon('nouveau', null, { adresseGestion: contexte.adresseGestion, signature: contexte.signature }),
    id: null, a: [],
  };
  const b = await brouillonNouveauDepuisLeBien(base, { lotId: l.lotId, cle: l.lotCle ?? '', libelle: l.logement ?? `Bien ${l.lotId}` },
    { texte: contexte.signature, html: contexte.signatureHtml });
  return { ...(b as BrouillonEcran), cibles: ciblesAvecLeBien(b.cibles, l) as BrouillonEcran['cibles'], vingtPourcent: { sortieId: l.sortieId } };
}

/**
 * Le module déplié. « Fermer » (ou un nouveau clic sur « Envoyer un mail », compteur `fermeture` de la ligne) passe par LA porte de l'éditeur
 * (`fermetureDemandee`, comme la croix de la colonne) : c'est lui qui décide du brouillon commencé ; il rend la main par `onFerme`.
 */
const sansDoublon = (x: readonly string[]): string[] => [...new Map(x.filter((a) => a.trim() !== '').map((a) => [a.trim().toLowerCase(), a.trim()])).values()];

/**
 * 🔴🔴 (Arno, 25/11/2026) LES BROUILLONS D'UN MODÈLE : un par envoi (le modèle d en ouvre un PAR LOCATAIRE). Les destinataires sont pris dans les
 * propositions du bien (syndic : pastille rose ; propriétaires : leurs adresses propres), à défaut dans les coordonnées de la ligne ; la formule
 * d'appel est celle de nos autres mails (`formulePour`, recalculée par le module si l'on change « À ») ; la signature, celle du compte. PUR.
 */
export function brouillonsDuModele(base: BrouillonEcran, l: LigneVingtPourcent, cle: CleModeleVingt, signature: { texte?: string | null; html?: string | null }): BrouillonEcran[] {
  const lignes = (base.suggestionsBien ?? []).flatMap((g) => g.lignes);
  const syndics = sansDoublon(lignes.filter((x) => x.ton === 'syndic').map((x) => x.adresse));
  const proprietairesBien = sansDoublon(lignes.filter((x) => x.ton === 'proprietaire' && x.propre).map((x) => x.adresse));
  const proprietaires = proprietairesBien.length > 0 ? proprietairesBien
    : sansDoublon((l.contacts?.proprietaires ?? []).map((p) => p.email ?? '').filter((x) => x !== ''));
  const noms = (gens: readonly { nom: string }[] | undefined, repli: readonly string[]): string[] => ((gens ?? []).length > 0 ? gens!.map((p) => p.nom) : [...repli]);
  const { objet, texte } = texteModeleVingt(cle, {
    // 🔴 (Arno, 25/11/2026) l'adresse du bien (une seule fois), le nom de la copropriété (cité s'il diffère), les lots, bâtiment et étage de la fiche
    logement: l.logement ?? `Bien ${l.lotId}`, coproNom: l.copropriete?.nom ?? null, numLots: l.numLots ?? [], batiment: l.batiment ?? null, etage: l.etage ?? null,
    exercice: l.suivi.exercice, ago: l.suivi.etat === 'ok' ? l.suivi.ago : null, dateSortie: l.dateSortie,
    locataires: noms(l.contacts?.locataires, l.locataires),
    // 🔴 (Arno, 25/11/2026) les propriétaires « civilité Prénom NOM » (fiche)
    proprietaires: (l.contacts?.proprietaires ?? []).map((p) => p.nomCivil ?? p.nom),
  });
  const civilites = base.appel?.civilites ?? {};
  return destinatairesModeleVingt(cle, { syndics, proprietaires, locataires: adressesDesLocataires(l) }).map((d) => {
    const formule = formulePour(d.a, civilites);
    const c = brouillonMailSyndic({ objet, surlignage: null, corps: `${formule}\n\n${texte}\n\n\n` }, signature);
    return { ...base, id: null, a: d.a, cc: d.cc, cci: [], objet: c.objet, corps: c.corps, corpsHtml: c.corpsHtml, surlignageObjet: null,
      appel: { formule, civilites }, vingtPourcent: { sortieId: l.sortieId, modele: cle } };
  });
}

export function ModuleMailLigne({ l, mail, fermeture, onFermer }: { l: LigneVingtPourcent; mail: MailVingt; fermeture: number; onFermer: () => void }) {
  const [brouillons, setBrouillons] = useState<BrouillonEcran[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fermer, setFermer] = useState(0);
  // 🔴 (Arno, 25/11/2026) le modèle choisi : il remplace le(s) brouillon(s) par le sien (destinataires d'office, modifiables) ; `generation` remonte l'éditeur
  const [base, setBase] = useState<BrouillonEcran | null>(null);
  const [modele, setModele] = useState<CleModeleVingt | ''>('');
  const [generation, setGeneration] = useState(0);
  const choisir = (cle: CleModeleVingt | ''): void => {
    if (base === null) return;
    setModele(cle);
    setBrouillons(cle === '' ? [base] : brouillonsDuModele(base, l, cle, { texte: mail.contexte.signature, html: mail.contexte.signatureHtml }));
    setGeneration((g) => g + 1);
  };
  const demande = fermeture + fermer;
  // rien d'ouvert dans l'éditeur (lecture en cours ou en échec) : fermer, c'est replier
  useEffect(() => { if (demande > 0 && (brouillons === null || brouillons.length === 0)) onFermer(); }, [demande]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let vivant = true;
    brouillonDeLaLigne(l, mail.contexte)
      .then((b) => { if (vivant) { setBase(b); setBrouillons([b]); } })
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
      {base !== null && (
        <div className="vgp-mail-modele">
          <span>Modèle de texte</span>
          {/* la liste VERTE de la Location (jamais de <select> natif, règle d'Arno du 24/10/2026) */}
          <ListeChoix options={MODELES_VINGT.map((m) => ({ id: m.cle, libelle: m.libelle }))} valeur={modele} vide="Message libre" libelle="Modèle de texte"
            onChange={(id) => choisir(id as CleModeleVingt | '')} donnees={{ 'data-vgp-mail-modele': '' }} />
          <span className="loc-muet vgp-aide">Le modèle remplace le message en cours ; destinataires et texte restent modifiables.{modele === 'locataire' && (brouillons ?? []).length > 1 ? ' Un mail par locataire : un module chacun.' : ''}</span>
        </div>)}
      {(brouillons ?? []).map((b, i) => {
        const refus = refusUnLocataireParMail(locataires, [...b.a, ...b.cc, ...b.cci]);
        return (
          <div key={`${generation}:${i}`} className="vgp-mail-module" data-vgp-mail-module={i}>
            {/* 🔴 le contrôle à l'écran : le même motif que le refus du serveur */}
            {refus !== null && <p className="cp-refus" role="alert" data-vgp-mail-refus>{refus}</p>}
            <Redaction brouillon={b} contexte={mail.contexte} lotFiche={l.lotId} fermetureDemandee={demande} classementVerrouille={{ libelle: libelleBienVerrouille(l) }}
              filtreSuggestions={(g) => suggestionsDeLaSortie(g, l.contacts?.locataires.map((x) => ({ nom: x.nom, emails: x.emails ?? (x.email !== null ? [x.email] : []) })) ?? [])}
              onChange={(nb) => setBrouillons((bs) => (bs ?? []).map((x, j) => (j === i ? { ...nb, cibles: ciblesAvecLeBien(nb.cibles, l) as BrouillonEcran['cibles'], interne: false, vingtPourcent: x.vingtPourcent ?? { sortieId: l.sortieId } } : x)))}
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
