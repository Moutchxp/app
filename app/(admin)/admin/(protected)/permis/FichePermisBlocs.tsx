'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BlocTraceEmprise } from './BlocTraceEmprise';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { BlocPiecesPermis } from './BlocPiecesPermis';
import { BlocCompletude } from './BlocCompletude';
import { BlocFilEchanges } from './BlocFilEchanges';
import { BlocRepliable } from './BlocRepliable';
import { PlancheParcelles } from './PlancheParcelles'; // PL-A — planche cadastrale (lecture seule), à côté du schéma du bâti
import { TitreFamilleEtat, type LigneProjectionAffichee } from './ProjectionRendu';
import type { DonneesLiseuse } from './LiseusePieces'; // P3 (perfo) — donnée /emprise partagée (bloc Bâtiments → liseuse de la planche), anti-doublon
import type { VerdictProjection } from '../../../../lib/permis/projectionBatiments';
import type { EtatTitreFamille, ComptesCaracteristiquesPermis } from '../../../../lib/permis/etatFamilleProjection';
import type { FraicheurBatimentsLive } from './statutBatimentsProjection';
import { etatsFichePermis, type BadgesFiche } from './etatsFichePermis'; // SOURCE UNIQUE des titres de famille (partagée avec ProjectionVue pour la clôture) ; BadgesFiche = titres calculés côté Rattachement (LOT 3-B)

/**
 * LOT 1 (parité fiche permis) — PILE PARTAGÉE des 6 blocs de la fiche d'un permis, EXTRAITE de `ProjectionVue.renderDetail` (jusque-là
 * une fonction en ligne couplée à ~15 états). Empile : Complétude, Historique des échanges, Caractéristiques du permis (+ ses 4 sous-lignes),
 * Bâtiments et projection (emprise), Planche cadastrale, Pièces du permis. Elle porte l'ÉTAT et la GLUE PROPRES à ces blocs (liseuse partagée,
 * état de planche, accès à l'emprise depuis la capsule, compteurs de rafraîchissement) et REMONTE au parent, via callbacks, ce qu'il lui faut
 * pour alimenter le badge de sa ligne (en-tête / comptes / fraîcheur / verdict / ouverture des bâtiments). PERF-1 préservé : tout bloc coûteux
 * est monté au dépliage (render-prop de `BlocRepliable`), seule la complétude fait une lecture légère au rendu.
 *
 * Ce composant NE contient AUCUNE action propre à un onglet : la clôture (« Valider le permis — envoyer en Rattachement »), la carte de test,
 * l'auto-analyse et le retour « En cours » restent AUTOUR de lui, dans le parent. Il expose deux emplacements OPAQUES (`piedCaracteristiques`,
 * `piedBatiments`) où le parent GLISSE ce qu'il veut (en Analyse : le bouton de clôture) ; en Rattachement ils sont vides (lot 2).
 *
 * `mode`/`edition` préparent le lot 2 : en 'rattachement', la saisie est en CONSULTATION tant que « Modifier » n'a pas déverrouillé l'édition
 * (`edition`). En 'analyse', tout est éditable — comportement STRICTEMENT identique à l'ancien in-line.
 */
export function FichePermisBlocs({
  dossierId,
  row = null,
  mode,
  edition = false,
  enteteProjection = null,
  comptesLive = null,
  fraicheurBat = null,
  onEntete,
  onComptes,
  onFraicheur,
  onVerdict,
  onBatimentsOuvert,
  onRafraichirFile,
  rafraichirApresAnalyse = 0,
  piedCaracteristiques,
  piedBatiments,
  empriseConsultation,
  etatsRattachement = null,
}: {
  dossierId: number;
  row?: LigneProjectionAffichee | null; // Analyse : la ligne de file (repli des badges). Rattachement : null (titres nus, cf. mode).
  mode: 'analyse' | 'rattachement';
  edition?: boolean; // 'rattachement' : édition déverrouillée par « Modifier » (lot 2). 'analyse' : ignoré (toujours éditable).
  // ÉTAT PARTAGÉ (contrôlé par le parent) : Analyse le détient pour le badge de sa LIGNE et on le lit pour les BADGES des titres de famille.
  //   OPTIONNELS : en Rattachement les titres sont NUS (le permis est déjà validé ; row=null + éditeur d'emprise non monté → un badge dérivé
  //   dirait faussement « aucune carte »). Ces valeurs n'y sont donc pas fournies (les badges de sous-section, portés par CaracteristiquesBloc
  //   via `avecEtatFamilles`, restent eux affichés).
  enteteProjection?: { ton: 'vert' | 'rouge'; texte: string } | null;
  comptesLive?: ComptesCaracteristiquesPermis | null;
  fraicheurBat?: FraicheurBatimentsLive | null;
  // REMONTÉE : les blocs poussent leur état LIVE au parent (qui le détient) — `onFraicheur(null)` = purge au repli (édition perdue).
  onEntete?: (etat: { ton: 'vert' | 'rouge'; texte: string }) => void;
  onComptes?: (comptes: ComptesCaracteristiquesPermis) => void;
  onFraicheur?: (f: FraicheurBatimentsLive | null) => void;
  onVerdict?: (v: VerdictProjection) => void;
  onBatimentsOuvert?: (ouvert: boolean) => void;
  onRafraichirFile?: () => void; // une MUTATION (caractéristiques OU emprise) → le parent re-fetche la file (snapshot de la ligne fermée)
  rafraichirApresAnalyse?: number; // nonce du parent (auto-analyse) : à chaque changement → rafraîchit caractéristiques + tracé
  // EMPLACEMENTS opaques remplis par le parent (Analyse : bouton de clôture). Absents (Rattachement, lot 2) → rien n'est rendu.
  piedCaracteristiques?: ReactNode;
  piedBatiments?: ReactNode;
  // RATT-EDIT (lot 2) — CONTENU du bloc « Bâtiments et projection » EN CONSULTATION (Rattachement non déverrouillé) : l'ÉDITEUR BlocTraceEmprise
  //   (client lourd pdf.js) n'est PAS monté tant que « Modifier » n'a pas ouvert l'édition — le parent glisse ici une note de renvoi vers le
  //   comparatif « trois sources » (déjà affiché plus haut). Absent en Analyse (l'éditeur y est toujours monté).
  empriseConsultation?: ReactNode;
  // LOT 3-B — BADGES des titres en Rattachement, calculés par le PARENT à partir des DONNÉES SERVEUR (etatsFichePermis nourri d'une VUE de
  //   comptes, JAMAIS l'état de l'éditeur monté) : permis validé non modifié → vert ; « modifié — à revalider » (marqueur B3) → rouge ; ligne
  //   non calculable côté serveur (ex. planche) → null (titre nu). En Analyse : IGNORÉ (les badges y sont calculés en interne). null → titres nus.
  etatsRattachement?: BadgesFiche | null;
}) {
  // ÉTAT PROPRE aux blocs (interne) — jamais consulté par le parent. Réinitialisé au changement de dossier par le REMONTAGE du composant
  //   (la fiche est rendue dans la ligne ouverte, dont la clé = dossierId → un autre permis = un autre montage).
  const [donneesLiseuse, setDonneesLiseuse] = useState<DonneesLiseuse | null>(null); // P3 — donnée /emprise partagée (Bâtiments → liseuse planche)
  const [etatPlancheLive, setEtatPlancheLive] = useState<EtatTitreFamille | null>(null); // PL-ÉTAT — état LIVE de la planche (prime sur l'état sauvegardé)
  const [ouvrirBatiments, setOuvrirBatiments] = useState(0);   // BAT — nonce d'OUVERTURE COMMANDÉE du bloc « Bâtiments et projection »
  const [demandeAcces, setDemandeAcces] = useState<{ corpsId: number; nonce: number } | null>(null); // BAT — {corps + nonce} consommé une fois par BlocTraceEmprise
  const [vInstruction, setVInstruction] = useState(0); // recharge le tracé (bâtiments) quand l'instruction change (ajout de bâtiment, planche)
  const [vAnalyse, setVAnalyse] = useState(0);         // remonte caractéristiques + fil après « Lancer le diagnostic complet » / l'auto-analyse
  const [vValeurLue, setVValeurLue] = useState(0);     // « analyse de la page » a écrit/annulé une valeur → refetch du SEUL CaracteristiquesBloc
  const [vEmprise, setVEmprise] = useState(0);         // une MUTATION d'emprise → refetch de la capsule d'emprise du cartouche

  // AUTO-ANALYSE (mode analyse) : le parent lance l'analyse au passage et signale par ce nonce → on rafraîchit caractéristiques + tracé.
  //   Même patron que `ouvrirSignal` de BlocRepliable : on ne bump QU'AU CHANGEMENT (au montage, `dernierRafraichir` vaut déjà la prop →
  //   aucun refetch parasite à l'ouverture d'un dossier, où le nonce du parent peut être resté à une valeur non nulle d'une session précédente).
  const dernierRafraichir = useRef(rafraichirApresAnalyse);
  useEffect(() => {
    if (rafraichirApresAnalyse === dernierRafraichir.current) return;
    dernierRafraichir.current = rafraichirApresAnalyse;
    setVAnalyse((v) => v + 1); setVInstruction((v) => v + 1);
  }, [rafraichirApresAnalyse]);

  // Ouverture d'une pièce GED à la page (visionneur) — MÊME signeur unique qu'Archives (action url_piece de /reponses ; la clé ne transite jamais).
  const ouvrirPiece = useCallback(async (pieceId: number, source: 'reponse' | 'dossier', page?: number): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source, inline: true }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(page ? `${url}#page=${page}` : url, '_blank', 'noopener,noreferrer'); }
    } catch { /* lien indisponible : silencieux */ }
  }, []);

  // BAT — ACCÈS DEPUIS LA CAPSULE : (1) commande l'ouverture du bloc « Bâtiments et projection » (nonce), (2) pose la demande {corps + nonce}
  //   que BlocTraceEmprise consomme (sélection carte + planche + XL), (3) défile vers la section — behavior 'auto' sous prefers-reduced-motion.
  const accederEmprise = useCallback((corpsId: number) => {
    setOuvrirBatiments((n) => n + 1);
    setDemandeAcces((d) => ({ corpsId, nonce: (d?.nonce ?? 0) + 1 }));
    if (typeof document !== 'undefined') {
      const reduit = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(`ancre-bloc-emprise-${dossierId}`)?.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' });
    }
  }, [dossierId]);
  const consommerDemandeAcces = useCallback(() => setDemandeAcces(null), []); // stable → n'entre pas en boucle dans l'effet de BlocTraceEmprise

  // BADGES des titres de famille — Analyse : SOURCE UNIQUE etatsFichePermis (état LIVE des blocs, partagée avec ProjectionVue pour la clôture).
  //   Rattachement (LOT 3-B) : badges fournis par le PARENT (`etatsRattachement`), calculés depuis les données SERVEUR — JAMAIS l'état de
  //   l'éditeur monté (le calcul interne, qui lirait row=null + un enteteProjection non remonté en consultation, dirait faussement « aucune
  //   carte » sur un permis validé — d'où le calcul déporté au parent). Les badges de SOUS-SECTION restent, dans les DEUX modes, portés par
  //   CaracteristiquesBloc (`avecEtatFamilles`) — ils lisent les données du bloc lui-même.
  const etats: BadgesFiche | null = mode === 'analyse'
    ? etatsFichePermis(dossierId, row, { enteteProjection, comptesLive, fraicheurBat, etatPlancheLive }) // Analyse : SOURCE UNIQUE interne (état live des blocs)
    : etatsRattachement; // Rattachement (LOT 3-B) : badges calculés par le parent depuis les données SERVEUR ; null en lot 2 → titres nus
  // RATT-EDIT — 'rattachement' en consultation tant que « Modifier » n'a pas déverrouillé (lot 2). 'analyse' → false (éditable, comme avant).
  const lectureSeule = mode === 'rattachement' && !edition;
  // RATT-EDIT — l'ÉDITEUR d'emprise (BlocTraceEmprise, client lourd pdf.js) n'est monté qu'en Analyse OU après « Modifier » : en consultation
  //   Rattachement, le bloc affiche la note de renvoi `empriseConsultation` (l'emprise reste consultable via le comparatif « trois sources »).
  const editeurEmprise = mode === 'analyse' || edition;

  return (
    <div className="flex flex-col gap-2">
      {/* PART-2 / PERF-1 — COMPLÉTUDE + relances : bilan (lecture mémoire) dans la ligne de titre ; détail au dépliage. Le bouton « Lancer le
          diagnostic complet des documents » est EN TÊTE de ce bloc ; `onAnalyseFinie` remonte les FRÈRES (caractéristiques, fil) via vAnalyse. */}
      <BlocCompletude key={`completude-${dossierId}`} dossierId={dossierId} avecDiagnostic onAnalyseFinie={() => { setVAnalyse((v) => v + 1); setVInstruction((v) => v + 1); }} />
      {/* FIL — historique des échanges : chargé UNIQUEMENT au dépliage (la requête du fil est complète ; pas d'aperçu léger). */}
      <BlocRepliable key={`w-fil-${dossierId}`} titre="Historique des échanges">
        {() => <BlocFilEchanges key={`fil-${dossierId}-${vAnalyse}`} dossierId={dossierId} />}
      </BlocRepliable>
      {/* PROJ-3b — INSTRUCTION (caractéristiques + « + ajouter un bâtiment ») puis TRACÉ. Clés PRÉFIXÉES PAR RÔLE (unicité), suffixe vAnalyse
          conservé : chaque enfant monté se remonte après le diagnostic. Le pied (Analyse : bouton de clôture) est GLISSÉ par le parent.
          ① HIÉRARCHIE — les sous-sections sont légèrement DÉCALÉES (indentation + filet gauche) pour lire la parenté d'un coup d'œil. */}
      <BlocRepliable key={`w-carac-${dossierId}`} titre={etats ? <TitreFamilleEtat base="Caractéristiques du permis (saisie)" etat={etats.etatMere} /> : 'Caractéristiques du permis (saisie)'}
        onOuvertChange={(o) => { if (!o) onFraicheur?.(null); }}>{/* (C) — au REPLI, le bloc se démonte (édition perdue) : purge de la fraîcheur LIVE côté parent. */}
        {() => (
          <div className="flex flex-col gap-2" style={{ marginLeft: '.85rem', paddingLeft: '.85rem', borderLeft: '2px solid var(--color-svv-line)' }}>
            {/* sousLignesSurface — fond surélevé des 4 sous-lignes, dans la FICHE PARTAGÉE (Analyse ET Rattachement, décision Arno 21/09) ;
                les 3 écrans plats (En cours / Réponses / Archives) montent CaracteristiquesBloc sans cette prop → inchangés. */}
            <CaracteristiquesBloc key={`carac-${dossierId}-${vAnalyse}-${vValeurLue}-${vEmprise}`} dossierId={dossierId} avecEtatFamilles etatSection4SansAide durcirStatutFraicheur sousLignesSurface lectureSeule={lectureSeule} onComptes={onComptes} onFraicheur={onFraicheur} ancreEmprise={`ancre-bloc-emprise-${dossierId}`} onAccesEmprise={accederEmprise} onOuvrir={(id, source, page) => void ouvrirPiece(id, source, page)} onChange={() => { setVInstruction((v) => v + 1); onRafraichirFile?.(); }} pied={piedCaracteristiques} />
          </div>
        )}
      </BlocRepliable>
      {/* PERF-1 — BÂTIMENTS/PROJECTION (verdict) : la requête la PLUS coûteuse (≈ 9 s). Différée au dépliage ; `onBatimentsOuvert` jauge le
          bouton « Valider » du parent. Ancre de défilement (capsule d'emprise) toujours rendue, même bloc replié. */}
      <div id={`ancre-bloc-emprise-${dossierId}`} aria-hidden="true" />
      <BlocRepliable key={`w-bat-${dossierId}`} titre={etats ? <TitreFamilleEtat base="Bâtiments et projection (emprise)" etat={etats.etatProj} /> : 'Bâtiments et projection (emprise)'} onOuvertChange={onBatimentsOuvert} ouvrirSignal={ouvrirBatiments}>
        {() => (
          <div className="flex flex-col gap-2">
            {/* Analyse (toujours) OU Rattachement déverrouillé (« Modifier ») → l'ÉDITEUR ; Rattachement en consultation → la note de renvoi. */}
            {editeurEmprise
              ? <BlocTraceEmprise dossierId={dossierId} onVerdict={onVerdict} onEntete={onEntete} onDonneesLiseuse={setDonneesLiseuse} rafraichir={vInstruction} onValeurLue={() => setVValeurLue((v) => v + 1)} onEmprisesChange={() => { setVEmprise((v) => v + 1); onRafraichirFile?.(); }} demandeAcces={demandeAcces} onDemandeConsommee={consommerDemandeAcces} />
              : empriseConsultation}
            {/* Emplacement BAS du bloc (Analyse : message d'action + bouton de clôture ; Rattachement : vide). */}
            {piedBatiments}
          </div>
        )}
      </BlocRepliable>
      {/* PL-A — PLANCHE CADASTRALE (lecture seule) : parcelles du permis (colorées par origine) + voisines dans un rayon. Chargée AU DÉPLIAGE.
          PL-H — valider/retirer une sélection recalcule l'empreinte serveur : on rafraîchit « Bâtiments et projection » par le MÊME canal
          (vInstruction → rafraichir de BlocTraceEmprise). PL-ÉTAT — la planche REMONTE son état LIVE → la ligne de titre le dit sans déplier. */}
      <BlocRepliable key={`w-planche-${dossierId}`} titre={etats?.etatPlanche ? <TitreFamilleEtat base="Planche cadastrale (parcelles)" etat={etats.etatPlanche} /> : 'Planche cadastrale (parcelles)'}>
        {() => <PlancheParcelles key={`planche-${dossierId}`} dossierId={dossierId} onEmpreinteRecalculee={() => setVInstruction((v) => v + 1)} onEtatPlanche={setEtatPlancheLive} donneesLiseuse={donneesLiseuse} lectureSeule={lectureSeule} />}
      </BlocRepliable>
      {/* EXT-1 (point 5) — PIÈCES DU PERMIS en DERNIÈRE POSITION : référence en regard de la saisie. Chargées au dépliage (PERF-1). */}
      <BlocRepliable key={`w-pieces-${dossierId}`} titre="Pièces du permis">
        {() => <BlocPiecesPermis key={`pieces-${dossierId}`} dossierId={dossierId} onOuvrir={(id, source, page) => void ouvrirPiece(id, source, page)} />}
      </BlocRepliable>
    </div>
  );
}
