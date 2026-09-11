'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResultatPassageAnalyse } from '../../../../lib/permis/analysePassage'; // type SEUL (module server-only : import de type erasé au build)
import { BlocTraceEmprise } from './BlocTraceEmprise';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { BlocPiecesPermis } from './BlocPiecesPermis';
import { BlocCompletude } from './BlocCompletude';
import { BlocFilEchanges } from './BlocFilEchanges';
import { BlocRepliable } from './BlocRepliable';
import { PlancheParcelles } from './PlancheParcelles'; // PL-A — planche cadastrale (lecture seule), à côté du schéma du bâti
import { TableProjection, AIDE_PROJECTION, TitreFamilleEtat, type LigneProjectionAffichee } from './ProjectionRendu';
import { ClotureVersRattachement, clotureVisible } from './CaracteristiquesRendu'; // COMPLÉMENT — bouton de clôture (MÊME composant, 5 rendus) + visibilité source unique
import type { DonneesLiseuse } from './LiseusePieces'; // P3 (perfo) — donnée /emprise partagée (bloc Bâtiments → liseuse de la planche), anti-doublon
import type { VerdictProjection } from '../../../../lib/permis/projectionBatiments';
import { etatValidationProjection } from '../../../../lib/permis/etatValidationProjection';
import { etatProjectionTitreDepuisComptes, etatCaracteristiquesPermis, etatPlancheTitre, type EtatTitreFamille, type ComptesCaracteristiquesPermis } from '../../../../lib/permis/etatFamilleProjection'; // RATT-1 — état sur la ligne de titre des familles (repli PAR BÂTIMENT, calqué sur estValidationAcquise) ; PL-ÉTAT — état de la ligne « Planche cadastrale » ; BAT-4 — mère « Caractéristiques du permis » = unique porteuse (section 4 : cohérence + altitudes) ; BAT-2d — comptes LIVE remontés par le bloc
import { conditionAltitudeSortie, pretPourSortie } from '../../../../lib/permis/etatSortieRattachement'; // LOT 71 — condition altitude à 3 états (sans objet ≠ satisfaite)
import { recompterSiSucces } from './comptesActions';

/**
 * PROJ-2c/3b — onglet « Analyse et projection » (entre Réponses et Archives). File de travail qui se vide : à la réception des
 * pièces, on INSTRUIT le permis (caractéristiques + bâtiments déclarés via `CaracteristiquesBloc`, écriture 'saisie') PUIS on
 * reconstitue l'emprise des futurs bâtiments (neuve/extension, `BlocTraceEmprise`). Le geste « + ajouter un bâtiment » fait naître
 * les corps → débloque le tracé et la validation (0 bâtiment ⇒ non validable). Valider FAIT AVANCER (quitte la file + marqué suivi).
 */
export function ProjectionVue({ onRecompter }: { onRecompter?: () => void } = {}) {
  const [file, setFile] = useState<LigneProjectionAffichee[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<VerdictProjection | null>(null);
  const [enteteProjection, setEnteteProjection] = useState<{ ton: 'vert' | 'rouge'; texte: string } | null>(null); // ③ COMPLÉMENT — état RÉEL de l'en-tête « Bâtiments et projection », remonté par BlocTraceEmprise (tous alt+emprise validées ?). null tant que le bloc n'est pas ouvert → repli sur le marqueur.
  const [modePassage, setModePassage] = useState<'automatique' | 'cloture_manuelle'>('automatique'); // ② COMPLÉMENT — réglage de passage (auto = message ; clôture manuelle = gros bouton). Lu une fois du serveur.
  const [donneesLiseuse, setDonneesLiseuse] = useState<DonneesLiseuse | null>(null); // P3 (perfo) — donnée /emprise chargée par le bloc « Bâtiments et projection », partagée à la liseuse de la planche (anti-doublon).
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [vInstruction, setVInstruction] = useState(0); // PROJ-3b — compteur incrémenté à chaque écriture d'instruction → recharge le tracé (bâtiments)
  const [vAnalyse, setVAnalyse] = useState(0); // EXT-1 / LOT 56-B — bump après « Lancer le diagnostic complet des documents » (onAnalyseFinie du bloc Complétude) → remonte CaracteristiquesBloc/fil (refetch des champs extraits)
  const [vValeurLue, setVValeurLue] = useState(0); // « analyse de la page » (liseuse) a écrit/annulé une valeur → remonte SEULEMENT CaracteristiquesBloc (refetch du journal → la valeur lue apparaît en proposition). PAS dans la clé de la liseuse : le lecteur ne bouge pas.
  const [vEmprise, setVEmprise] = useState(0); // une MUTATION d'emprise (enregistrement/suppression/adoption/retouche) dans le bloc tracé → remonte CaracteristiquesBloc (capsule d'emprise du cartouche relit son état). Même mécanisme que vValeurLue.
  const [batimentsOuvert, setBatimentsOuvert] = useState(false); // PERF-1 — le bloc bâtiments (verdict) est déplié à la demande ; jauge le bouton « Valider »
  const [etatPlancheLive, setEtatPlancheLive] = useState<EtatTitreFamille | null>(null); // PL-ÉTAT — état LIVE de la planche remonté quand le bloc est ouvert (prime sur l'état SAUVEGARDÉ de la ligne) ; null tant que le bloc n'est pas ouvert → repli sur row.plancheEtat
  const [comptesLive, setComptesLive] = useState<ComptesCaracteristiquesPermis | null>(null); // BAT-2d — comptes LIVE remontés par CaracteristiquesBloc → la mère « Caractéristiques du permis » se calcule sur les MÊMES données que ses sous-titres (fini la désynchro). null → repli sur row.
  // LOT 70 — ANALYSE AU PASSAGE : à l'ouverture d'un permis, on lance (SANS geste) l'analyse si nécessaire (règle b, gate serveur) et
  //   on reporte les déclarations dans les champs vides. État d'attente HONNÊTE pendant les 20-30 s de l'analyse complète.
  const [passageEnCours, setPassageEnCours] = useState(false);
  const [passageMsg, setPassageMsg] = useState<string | null>(null);
  const passageDeclencheRef = useRef<number | null>(null); // dossier déjà déclenché pour CETTE ouverture (StrictMode : un seul tir → pas de course sur le verrou 58)
  const ouvertRef = useRef<number | null>(ouvert);         // miroir de `ouvert` pour l'async (mis à jour en effet, jamais pendant le rendu)
  useEffect(() => { ouvertRef.current = ouvert; }, [ouvert]);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/projection', { cache: 'no-store' });
        if (annule) return;
        if (res.ok) setFile(((await res.json()) as { file: LigneProjectionAffichee[] }).file);
        else setErreur(true);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, []);

  // LOT 70 — à l'ouverture d'un permis en analyse : déclenche l'analyse au passage (une seule fois par ouverture, garde StrictMode via
  //   `passageDeclencheRef` → jamais deux tirs qui se disputeraient le verrou 58). Le serveur décide s'il PAIE l'analyse complète
  //   (règle b) ou s'il REPORTE seulement les valeurs connues. À la fin, on remonte les caractéristiques (vAnalyse) pour voir les
  //   champs remplis. Session expirée → message honnête ; jamais une fausse panne.
  useEffect(() => {
    if (ouvert === null) return;                        // fermeture : l'état d'attente est réarmé par `ouvrir` (handler), pas ici
    if (passageDeclencheRef.current === ouvert) return; // déjà déclenché pour cette ouverture (remontage StrictMode)
    passageDeclencheRef.current = ouvert;
    const cible = ouvert;
    void (async () => {
      setPassageEnCours(true); setPassageMsg(null);     // dans l'async (pas dans le corps de l'effet) → pas de rendu en cascade
      try {
        const res = await fetch('/api/admin/permis/analyse-passage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dossierId: cible }),
        });
        if (ouvertRef.current !== cible) return; // l'utilisateur a changé de permis entre-temps → on n'applique rien de périmé
        if (res.status === 401) { setPassageMsg('Session expirée — reconnectez-vous.'); return; }
        if (res.status === 409) { setPassageMsg('Une analyse de ce permis est déjà en cours.'); return; }
        const d = (await res.json().catch(() => ({}))) as { resultat?: ResultatPassageAnalyse; erreur?: string };
        if (ouvertRef.current !== cible) return;
        if (res.ok && d.resultat) {
          const r = d.resultat;
          setVAnalyse((v) => v + 1); setVInstruction((v) => v + 1); // remonte caractéristiques + tracé → les champs remplis apparaissent
          setPassageMsg(r.analyseLancee
            ? `Analyse terminée — ${r.rapport?.champsRetenus ?? 0} champ(s) renseigné(s) d’après les documents.`
            : (r.champsReportes.length > 0
                ? `Valeurs déclarées reportées dans ${r.champsReportes.length} champ(s) vide(s) — analyse déjà à jour.`
                : 'Analyse déjà à jour — aucun champ vide à compléter depuis les déclarations.'));
        } // erreur non-2xx sans corps : silencieux (l'état affiché n'est pas effacé)
      } catch { /* réseau indisponible : silencieux, l'état précédent reste */ }
      finally { if (ouvertRef.current === cible) setPassageEnCours(false); }
    })();
  }, [ouvert]);

  // CORRECTIF B — FRAÎCHEUR DE LA FILE : après une mutation d'emprise en session, les COMPTES de la ligne (nbCorpsSansAltValidee /
  //   nbCorpsSansEmpriseValidee) sont périmés. On re-fetche la file (source AUTORITATIVE) → le repli du titre ET le n° de la ligne
  //   (etatProjectionTitreDepuisComptes / estValidationAcquise) reflètent la validation PAR BÂTIMENT sans rechargement de page. Choix du
  //   re-fetch plutôt qu'un patch depuis `enteteProjection` : l'en-tête live ne porte QUE {ton, texte} — impossible d'en reconstituer les
  //   comptes exacts d'un état PARTIEL. Réseau indisponible → la file garde ses comptes précédents (jamais d'effacement). Ne bump AUCUN
  //   compteur qui remonterait BlocTraceEmprise (rafraichir=vInstruction inchangé) : pas de re-tir de /emprise (≈ 9 s).
  const rafraichirFile = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/permis/projection', { cache: 'no-store' });
      if (res.ok) setFile(((await res.json()) as { file: LigneProjectionAffichee[] }).file);
    } catch { /* réseau indisponible : la file conserve ses comptes précédents */ }
  }, []);

  // ② COMPLÉMENT — CLÔTURE MANUELLE : « Valider le permis — envoyer en Rattachement » écrit le marqueur de passage (route caracteristiques
  //   valider_permis → validerProjection), puis re-fetche la file (le permis passé la quitte) et ferme le détail. Le bouton GLOBAL « Valider
  //   la projection » (vestige, second chemin d'écriture) a été retiré : la validation est PAR BÂTIMENT (chaîne) + cette clôture.
  const cloturerPermis = useCallback(async (dossierId: number) => {
    setEnCours(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/caracteristiques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'valider_permis', dossierId }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !d.ok) { setMessage(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'clôture impossible')); return; }
      const gr = await fetch('/api/admin/permis/projection', { cache: 'no-store' }); // re-fetche la file : le permis passé n'y est plus
      if (gr.ok) { const gd = (await gr.json()) as { file?: LigneProjectionAffichee[] }; setFile(gd.file ?? []); }
      setOuvert(null); setVerdict(null); setEnteteProjection(null); setEtatPlancheLive(null); setComptesLive(null); setMessage('permis passé en Rattachement');
      recompterSiSucces(true, onRecompter);
    } catch { setMessage('clôture impossible'); } finally { setEnCours(false); }
  }, [onRecompter]);

  // ② COMPLÉMENT — mode de passage lu une fois (résilient) : gouverne l'affichage du gros bouton (clôture manuelle) vs le message (auto).
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/reglage-passage', { cache: 'no-store' });
        if (!annule && res.ok) { const d = (await res.json()) as { mode: 'automatique' | 'cloture_manuelle' }; setModePassage(d.mode === 'cloture_manuelle' ? 'cloture_manuelle' : 'automatique'); }
      } catch { /* réglage indisponible : défaut automatique */ }
    })();
    return () => { annule = true; };
  }, []);

  // LOT 51-B — RETOUR EN COURS (sans envoi) : lève le marqueur « testé en analyse ». Aucun e-mail, aucune trace de relance, aucun statut
  //   modifié → le permis revient dans « En cours » avec TOUTE sa planification de rappels intacte, comme s'il n'était jamais venu ici.
  const retourEnCours = useCallback(async (dossierId: number) => {
    setEnCours(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/projection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retour_en_cours', dossierId }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; file?: LigneProjectionAffichee[] };
      if (res.ok && d.ok) { setFile(d.file ?? []); setOuvert(null); setVerdict(null); recompterSiSucces(true, onRecompter); }
      else setMessage(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'retour impossible'));
    } catch { setMessage('retour impossible'); } finally { setEnCours(false); }
  }, [onRecompter]);

  // LOT 51-C — SORTIE DÉFINITIVE vers Rattachement : double condition (empreinte + altitudes) vérifiée SERVEUR ; à la réussite le permis
  //   quitte la file (et En cours), TOUTES les relances sont annulées (close + partiel_leve_le), le marqueur test est effacé. Un refus
  //   métier (condition manquante) revient en 409 avec `manque` → l'écran l'affiche déjà via les deux lignes de condition.
  const sortirVersRattachement = useCallback(async (dossierId: number) => {
    setEnCours(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/projection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sortir_vers_rattachement', dossierId }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; manque?: string; demandesArretees?: number; file?: LigneProjectionAffichee[] };
      if (res.ok && d.ok) { setFile(d.file ?? []); setOuvert(null); setVerdict(null); setMessage(`permis passé en Rattachement — relances annulées (${d.demandesArretees ?? 0} demande(s))`); recompterSiSucces(true, onRecompter); }
      else setMessage(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'sortie impossible'));
    } catch { setMessage('sortie impossible'); } finally { setEnCours(false); }
  }, [onRecompter]);

  // Ouverture d'une pièce GED à la page (visionneur) — MÊME signeur unique qu'Archives (action url_piece de /reponses ; la clé ne transite jamais).
  const ouvrirPiece = useCallback(async (pieceId: number, source: 'reponse' | 'dossier', page?: number): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source, inline: true }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(page ? `${url}#page=${page}` : url, '_blank', 'noopener,noreferrer'); }
    } catch { /* lien indisponible : silencieux */ }
  }, []);

  if (erreur) return <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>File de projection indisponible.</div>;
  if (file === null) return <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>;

  const ouvrir = (dossierId: number) => {
    setOuvert((v) => (v === dossierId ? null : dossierId)); setVerdict(null); setEnteteProjection(null); setEtatPlancheLive(null); setComptesLive(null); setDonneesLiseuse(null); setMessage(null); setBatimentsOuvert(false); // PERF-1 : chaque permis s'ouvre tout replié
    passageDeclencheRef.current = null; setPassageMsg(null); setPassageEnCours(false); // LOT 70 : réarme l'analyse au passage (event handler → setState autorisé) pour la prochaine ouverture
  };

  // PERF-1 — TOUS les blocs sont REPLIÉS par défaut et ne chargent leurs données QU'AU DÉPLIAGE (BlocRepliable, render-prop). Un bloc
  //   jamais ouvert ne déclenche AUCUNE requête. Seul le bilan de complétude fait UNE lecture légère (mémoire) au rendu, pour la
  //   ligne de titre visible sans déplier. renderDetail n'est rendu que pour une ligne ouverte → `ouvert` est non nul ici.
  const renderDetail = () => {
    if (ouvert === null) return null; // sécurité de type (narrowing) : renderDetail n'est appelé que sur une ligne ouverte
    const ev = etatValidationProjection(batimentsOuvert, verdict); // bouton « Valider » : invite à déplier les bâtiments tant qu'ils n'ont pas été ouverts
    // RATT-1 — état des familles calculé depuis la ligne DÉJÀ chargée (`file`), visible sans déplier ni tirer de contenu lourd (PERF-1 préservée).
    const row = file?.find((f) => f.dossierId === ouvert) ?? null;
    // BAT-2 / BAT-4 — la MÈRE « Caractéristiques du permis (saisie) » n'a plus qu'UNE porteuse : « Les futurs bâtiments et leurs altitudes »
    //   (`etatSection4Titre` via `etatCaracteristiquesPermis` — altitude ET cohérence du nombre). La section 1 est redevenue NON BLOQUANTE (BAT-4).
    //   BAT-2d — SOURCE UNIQUE : quand le bloc est OUVERT il REMONTE ses comptes LIVE (`comptesLive`) → la mère se calcule sur EXACTEMENT
    //   les mêmes données que son sous-titre (fini la mère « verte » sur une sous-section rouge après un ajout/retrait de carte). REPLI sur les
    //   comptes de la file (`row`) tant que le bloc n'a pas remonté (replié / juste ouvert). Garde dossierId : jamais les comptes d'un autre permis.
    const comptesMere: ComptesCaracteristiquesPermis = (comptesLive && comptesLive.dossierId === ouvert)
      ? comptesLive
      : { dossierId: ouvert, nbCartes: row?.nbBatiments ?? 0, nbSansAltitude: row?.nbCorpsSansAltitude ?? 0, nbBatimentsValide: row?.nbBatimentsValide ?? null };
    const etatMere = etatCaracteristiquesPermis(comptesMere); // BAT-4 — agrégat de l'unique porteuse (section 4), SOURCE UNIQUE avec le sous-titre du bloc
    // ③ COMPLÉMENT — l'en-tête dit l'état RÉEL (tous les bâtiments alt+emprise validés → VERT ; sinon ce qui manque), remonté par le bloc
    //   quand il est ouvert (valeur LIVE, prime). REPLI avant ouverture : calculé sur les COMPTES de la ligne (calqué sur estValidationAcquise,
    //   MÊME règle que l'en-tête live), PLUS sur le jalon dossier `projectionValidee` — la section et la ligne disent ainsi une seule vérité
    //   (validation PAR BÂTIMENT). Le jalon `permis_projection` gouverne UNIQUEMENT la clôture / l'envoi en Rattachement (bouton dédié).
    const etatProj = enteteProjection ?? etatProjectionTitreDepuisComptes(row?.nbBatiments ?? 0, row?.nbCorpsSansAltValidee ?? 0, row?.nbCorpsSansEmpriseValidee ?? 0);
    // PL-ÉTAT — état de la ligne « Planche cadastrale » visible SANS déplier. Valeur LIVE `etatPlancheLive` (remontée par PlancheParcelles quand
    //   le bloc est ouvert : elle porte le CHANGEMENT en attente → rouge « modifiée — non validée »), sinon REPLI sur l'état SAUVEGARDÉ de la
    //   ligne (row.plancheEtat : sélection validée + bilan déclaré ↔ effectif). `null` (état indisponible / non calculé) → titre nu, sans suffixe
    //   (jamais un faux « configuration automatique »). MÊME source unique que la planche : etatPlancheTitre (aucune règle dupliquée).
    const etatPlanche: EtatTitreFamille | null = etatPlancheLive
      ?? (row?.plancheEtat ? etatPlancheTitre({ selectionValidee: row.plancheEtat.selectionValidee, changementEnAttente: false, cas: row.plancheEtat.cas }) : null);
    // COMPLÉMENT — CLÔTURE : le MÊME composant rendu à CINQ endroits (tête de fiche + haut/bas de « Caractéristiques » + haut/bas de
    //   « Bâtiments et projection »). Même condition (`clotureVisible`), même action (`cloturerPermis`), même état → jamais cinq copies
    //   divergentes. `tousValides` = l'ÉTAT DE PROJECTION `etatProj` VERT — MÊME source unique que le titre de section : valeur LIVE
    //   `enteteProjection` quand le bloc est ouvert, sinon REPLI sur les COMPTES de la ligne (estValidationAcquise). Ainsi le BLOC DE
    //   SORTIE (message + bouton) apparaît DÈS l'ouverture de la ligne pour un permis entièrement validé, sans devoir ouvrir « Bâtiments
    //   et projection » d'abord. 0 bâtiment → etatProj ROUGE → pas de bloc de sortie. `dejaPasse` = marqueur (false dans la file).
    const tousValidesCloture = etatProj.ton === 'vert';
    const dejaPasseCloture = row?.projectionValidee ?? false;
    const clotureVisibleIci = clotureVisible(modePassage, tousValidesCloture, dejaPasseCloture);
    const rendreCloture = (variante: 'principal' | 'bouton') => (
      <ClotureVersRattachement mode={modePassage} tousValides={tousValidesCloture} dejaPasse={dejaPasseCloture} variante={variante} onCloturer={() => void cloturerPermis(ouvert)} enCours={enCours} />
    );
    return (
      <div className="flex flex-col gap-2">
        {/* LOT 70 — ANALYSE AU PASSAGE : état d'attente honnête (jamais un écran figé) puis compte rendu. Le bouton de RELANCE manuel
            reste « Lancer le diagnostic complet des documents » (BlocCompletude ci-dessous) — aucun 3e bouton. Tokens --color-svv-* (thème). */}
        {passageEnCours && (
          <div className="svv-card" role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: 13, color: 'var(--color-svv-ink)' }}>
            <span aria-hidden className="svv-spin" style={{ width: 14, height: 14, border: '2px solid var(--color-svv-line)', borderTopColor: 'var(--color-svv-red)', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
            <span>Analyse des documents et remplissage des champs en cours — comptez jusqu’à 20 à 30 secondes si une analyse approfondie est nécessaire.</span>
          </div>
        )}
        {/* ① CLÔTURE — EN HAUT DE LA FICHE, juste sous le numéro de permis : le bouton (variante principale, avec message) PREND LA PLACE de
            la ligne « Analyse déjà à jour… » UNIQUEMENT quand il s'affiche ; sinon cette ligne RESTE (elle dit quelque chose d'utile). */}
        {!passageEnCours && (clotureVisibleIci
          ? rendreCloture('principal')
          : (passageMsg && <div className="svv-card" role="status" aria-live="polite" style={{ fontSize: 12.5, color: passageMsg.startsWith('Session expirée') ? 'var(--color-svv-red)' : 'var(--color-svv-ink)' }}>{passageMsg}</div>))}
        {/* LOT 56-B — le bouton de ré-analyse « Lancer le diagnostic complet des documents » vit désormais EN TÊTE du bloc « Complétude »
            (BlocCompletude), plus ici : un seul point d'entrée, un seul nom. Son `onAnalyseFinie` remonte les frères (caractéristiques,
            fil) via vAnalyse ; le bloc Complétude relit son propre diagnostic tout seul. */}
        {/* LOT 51-B — ce permis est ici en TEST (dossier incomplet ouvert depuis « En cours »). S'il n'a pas permis de tout renseigner et
            qu'on ne veut PAS relancer la mairie maintenant, « Renvoyer ce permis dans l'onglet En cours » lève le marqueur : aucun e-mail, échéances intactes. */}
        {row?.testeEnAnalyse && (() => {
          // LOT 51-C — carte de TEST : deux issues. (A) SORTIE DÉFINITIVE vers Rattachement, gardée par la DOUBLE condition (empreinte
          //   validée ET toutes les altitudes de sommet NGF renseignées) — l'écran DIT laquelle manque, jamais un bouton grisé muet.
          //   (B) RETOUR sans envoi. Le bouton « Valider la projection » NORMAL est masqué pour un dossier testé (il n'arrête pas les
          //   relances) : la SEULE sortie d'un dossier testé passe par ici.
          // LOT 71 — la condition « altitudes renseignées » a TROIS états : SANS OBJET (0 bâtiment → rien à renseigner, ne compte pas
          //   comme satisfaite), NON SATISFAITE (≥1 sans altitude), SATISFAITE (≥1 et tous renseignés). Un ensemble vide ne se déclare
          //   plus VERT (défaut 7424). Le SERVEUR reste bloqué par l'empreinte (peutValider requiert ≥1 bâtiment, PROJ-3b) — inchangé.
          const condAltitude = conditionAltitudeSortie(row?.nbBatiments ?? 0, row?.nbCorpsSansAltitude ?? 0);
          const empreinteOk = ev.peutValider;             // requiert le dépliage + tracé de « Bâtiments et projection » (PERF-1) ; ev.libelle porte l'invite
          const pretSortie = pretPourSortie(empreinteOk, condAltitude.etat); // « sans objet » ne débloque JAMAIS la sortie
          const ligneOk: React.CSSProperties = { color: 'var(--color-svv-green-ink)' };
          const ligneKo: React.CSSProperties = { color: 'var(--color-svv-red)' };
          const ligneNeutre: React.CSSProperties = { color: 'var(--color-svv-muted)' };
          const tonAltitude = condAltitude.ton === 'vert' ? ligneOk : condAltitude.ton === 'rouge' ? ligneKo : ligneNeutre;
          return (
            <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', fontSize: 13 }}>
              <span>Dossier <strong>en test</strong> (ouvert depuis « En cours »). Les relances à la mairie continuent en fond.</span>
              {/* (A) SORTIE DÉFINITIVE */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', borderTop: '1px solid var(--color-svv-line)', paddingTop: '.5rem' }}>
                <strong>Terminer l’analyse et passer en Rattachement</strong>
                <span style={{ color: 'var(--color-svv-muted)', fontSize: 12 }}>Sortie <strong>DÉFINITIVE</strong> : le permis quitte « En cours » et <strong>toutes les relances programmées sont annulées</strong>. Deux conditions requises :</span>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 12, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                  <li style={empreinteOk ? ligneOk : ligneKo}>{empreinteOk ? '✓ empreinte des bâtiments validée' : `Empreinte non validée — ${ev.libelle}`}</li>
                  <li style={tonAltitude}>{condAltitude.texte}</li>
                </ul>
                {pretSortie
                  ? <button type="button" className="svv-btn svv-btn-primary" disabled={enCours} onClick={() => { void sortirVersRattachement(ouvert); }}>Terminer l’analyse et passer en Rattachement</button>
                  : <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Complétez les deux conditions ci-dessus pour activer la sortie.</span>}
              </div>
              {/* (B) RETOUR SANS ENVOI */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', borderTop: '1px solid var(--color-svv-line)', paddingTop: '.5rem' }}>
                <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Ou, si l’examen n’a rien permis de conclure et que vous ne voulez pas relancer la mairie maintenant :</span>
                <button type="button" className="svv-btn svv-btn-primary" disabled={enCours} onClick={() => { void retourEnCours(ouvert); }}>Renvoyer ce permis dans l’onglet « En cours »</button>
              </div>
            </div>
          );
        })()}
        {/* PART-2 / PERF-1 — COMPLÉTUDE + relances : bilan (lecture mémoire) dans la ligne de titre ; détail au dépliage. LOT 56-B —
            le bouton « Lancer le diagnostic complet des documents » est EN TÊTE de ce bloc : le bloc relit son propre diagnostic après la passe
            (plus besoin de vAnalyse dans SA clé, ce qui préserverait le compte rendu du bouton d'un remontage). `onAnalyseFinie`
            remonte les FRÈRES (caractéristiques, fil) via vAnalyse. */}
        <BlocCompletude key={`completude-${ouvert}`} dossierId={ouvert} avecDiagnostic onAnalyseFinie={() => { setVAnalyse((v) => v + 1); setVInstruction((v) => v + 1); }} />
        {/* FIL — historique des échanges : chargé UNIQUEMENT au dépliage (la requête du fil est complète ; pas d'aperçu léger — cf. rapport). */}
        <BlocRepliable key={`w-fil-${ouvert}`} titre="Historique des échanges">
          {() => <BlocFilEchanges key={`fil-${ouvert}-${vAnalyse}`} dossierId={ouvert} />}
        </BlocRepliable>
        {/* PROJ-3b — INSTRUCTION (caractéristiques + « + ajouter un bâtiment ») puis TRACÉ. Clés PRÉFIXÉES PAR RÔLE (unicité, cf. PART-2b),
            suffixe vAnalyse conservé : chaque enfant monté se remonte après « Lancer le diagnostic complet des documents ». Montés au dépliage (PERF-1). */}
        {/* ③ CLÔTURE — le bouton (variante 'bouton') est passé À CaracteristiquesBloc via `pied` → il est rendu DANS le cartouche « Les futurs
            bâtiments » (bas de son contenu), plus jamais en frère flottant entre les lignes de section. Reste atteignable en tête de fiche
            ('principal') et dans « Bâtiments et projection » (⑤). Le rendu du HAUT du bloc a été retiré (décision Arno : trop de boutons).
            ① HIÉRARCHIE — les sous-sections sont légèrement DÉCALÉES (indentation + filet gauche) pour lire la parenté d'un coup d'œil ;
            décalage discret (~.85rem), width:100% des sous-lignes → aucun débordement horizontal en portrait. */}
        <BlocRepliable key={`w-carac-${ouvert}`} titre={<TitreFamilleEtat base="Caractéristiques du permis (saisie)" etat={etatMere} />}>
          {() => (
            <div className="flex flex-col gap-2" style={{ marginLeft: '.85rem', paddingLeft: '.85rem', borderLeft: '2px solid var(--color-svv-line)' }}>
              {/* BAT-2 / BAT-2b — `avecEtatFamilles` : état sur les titres des sous-sections (désormais dans LES CINQ vues). ICI seulement,
                  `etatSection4SansAide` fait que l'état REMPLACE le suffixe d'aide de la section 4 : la mère est déjà au-dessus, la hiérarchie
                  est dense. Ailleurs (Rattachement, Archives, Réponses, Suivi) l'aide est conservée et l'état s'ajoute après. */}
              <CaracteristiquesBloc key={`carac-${ouvert}-${vAnalyse}-${vValeurLue}-${vEmprise}`} dossierId={ouvert} avecEtatFamilles etatSection4SansAide onComptes={setComptesLive} ancreEmprise={`ancre-bloc-emprise-${ouvert}`} onOuvrir={(id, source, page) => void ouvrirPiece(id, source, page)} onChange={() => setVInstruction((v) => v + 1)} pied={rendreCloture('bouton')} />
            </div>
          )}
        </BlocRepliable>
        {/* PERF-1 — BÂTIMENTS/PROJECTION (verdict) : la requête la PLUS coûteuse (≈ 9 s sur 7424). Différée au dépliage ; onOuvertChange
            débloque le bouton « Valider ». POLISH-1 — le bouton « Valider la projection » et ses phrases sont ENFERMÉS dans ce bloc :
            ils n'apparaissent qu'une fois DÉPLIÉ (cohérence avec les autres blocs repliés) ; repli → cachés, aucun /emprise relancé. */}
        {/* Ancre de défilement pour la capsule d'emprise du cartouche (« amène à l'endroit où le faire ») — toujours rendue, même bloc replié. */}
        <div id={`ancre-bloc-emprise-${ouvert}`} aria-hidden="true" />
        <BlocRepliable key={`w-bat-${ouvert}`} titre={<TitreFamilleEtat base="Bâtiments et projection (emprise)" etat={etatProj} />} onOuvertChange={setBatimentsOuvert}>
          {() => (
            <div className="flex flex-col gap-2">
              {/* Le bouton GLOBAL « Valider la projection » a été retiré (a922f67) : la validation passe par la chaîne par bâtiment
                  (enregistrer → valider → modifier) + la clôture. Le rendu du HAUT a été retiré (décision Arno : trop de boutons). */}
              <BlocTraceEmprise dossierId={ouvert} onVerdict={setVerdict} onEntete={setEnteteProjection} onDonneesLiseuse={setDonneesLiseuse} rafraichir={vInstruction} onValeurLue={() => setVValeurLue((v) => v + 1)} onEmprisesChange={() => { setVEmprise((v) => v + 1); void rafraichirFile(); }} />
              {message && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>{message}</div>}
              {/* ⑤ CLÔTURE — en BAS du contenu déployé (bouton seul). */}
              {rendreCloture('bouton')}
            </div>
          )}
        </BlocRepliable>
        {/* PL-A — PLANCHE CADASTRALE (lecture seule) : à côté du schéma du bâti, elle montre les parcelles du permis (colorées par
            origine — « lesquelles l'auto-analyse a retenues ») + les voisines dans un rayon. Chargée AU DÉPLIAGE (PERF-1 : un bloc
            jamais ouvert ne requête rien). Aucune écriture (le clic ajouter/retirer une parcelle est le lot séparé PL-B). */}
        <BlocRepliable key={`w-planche-${ouvert}`} titre={etatPlanche ? <TitreFamilleEtat base="Planche cadastrale (parcelles)" etat={etatPlanche} /> : 'Planche cadastrale (parcelles)'}>
          {/* PL-H — valider/retirer une sélection dans la planche recalcule l'empreinte serveur : on rafraîchit le bloc « Bâtiments et
              projection » par le MÊME canal que CaracteristiquesBloc (vInstruction → rafraichir de BlocTraceEmprise), jamais un 2e mécanisme.
              PL-ÉTAT — la planche REMONTE son état LIVE (validée / modifiée-non-validée / écart) → la ligne de titre le dit sans déplier. */}
          {() => <PlancheParcelles key={`planche-${ouvert}`} dossierId={ouvert} onEmpreinteRecalculee={() => setVInstruction((v) => v + 1)} onEtatPlanche={setEtatPlancheLive} donneesLiseuse={donneesLiseuse} />}
        </BlocRepliable>
        {/* EXT-1 (point 5) — PIÈCES DU PERMIS en DERNIÈRE POSITION : référence en regard de la saisie. Chargées au dépliage (PERF-1). */}
        <BlocRepliable key={`w-pieces-${ouvert}`} titre="Pièces du permis">
          {() => <BlocPiecesPermis key={`pieces-${ouvert}`} dossierId={ouvert} onOuvrir={(id, source, page) => void ouvrirPiece(id, source, page)} />}
        </BlocRepliable>
      </div>
    );
  };

  // LOT 54 — les dossiers TESTÉS (marqueur `dossier_test_analyse`, porté par `testeEnAnalyse`) sont rendus EN PREMIER, au-dessus du
  //   reste de la file, pour retrouver immédiatement un dossier qu'on vient d'envoyer en test. AUCUN habillage de groupe (le LOT 52
  //   ajoutait un pli + un titre + un sous-titre au-dessus d'une seule ligne, retirés ici) : le SEUL signal qui distingue les deux
  //   blocs est l'EN-TÊTE DE COLONNE de leur tableau — « Test permis "En cours" » au lieu de « Permis ». `renderDetail` lit le `file`
  //   complet → le détail marche dans les deux tables (l'ouverture est un état unique `ouvert`). Le reste est rendu dessous, sans le
  //   testé (pas de doublon).
  const enTest = file.filter((f) => f.testeEnAnalyse);
  const reste = file.filter((f) => !f.testeEnAnalyse);
  return (
    <div className="flex flex-col gap-3">
      <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>{AIDE_PROJECTION}</p>
      {enTest.length > 0 && (
        <TableProjection file={enTest} ouvert={ouvert} onOuvrir={ouvrir} renderDetail={renderDetail} libellePermis={'Test permis « En cours »'} modePassage={modePassage} tousValidesOuvert={enteteProjection ? enteteProjection.ton === 'vert' : null} />
      )}
      {/* Reste de la file (hors test). Masqué si tout est en test (sinon « La file est vide » mentirait) ; toujours rendu si la file entière est vide (message normal). */}
      {(reste.length > 0 || file.length === 0) && (
        <TableProjection file={reste} ouvert={ouvert} onOuvrir={ouvrir} renderDetail={renderDetail} modePassage={modePassage} tousValidesOuvert={enteteProjection ? enteteProjection.ton === 'vert' : null} />
      )}
    </div>
  );
}
