'use client';

import { useCallback, useEffect, useState } from 'react';
import { BlocTraceEmprise } from './BlocTraceEmprise';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { BlocPiecesPermis } from './BlocPiecesPermis';
import { BlocCompletude } from './BlocCompletude';
import { BlocFilEchanges } from './BlocFilEchanges';
import { BlocRepliable } from './BlocRepliable';
import { TableProjection, BoutonValiderProjection, AIDE_PROJECTION, TitreFamilleEtat, type LigneProjectionAffichee } from './ProjectionRendu';
import type { VerdictProjection } from '../../../../lib/permis/projectionBatiments';
import { etatValidationProjection } from '../../../../lib/permis/etatValidationProjection';
import { etatProjectionTitre, etatAltitudesTitre } from '../../../../lib/permis/etatFamilleProjection'; // RATT-1 — état sur la ligne de titre des familles
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
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [vInstruction, setVInstruction] = useState(0); // PROJ-3b — compteur incrémenté à chaque écriture d'instruction → recharge le tracé (bâtiments)
  const [vAnalyse, setVAnalyse] = useState(0); // EXT-1 / LOT 56-B — bump après « Diagnostic complet des documents » (onAnalyseFinie du bloc Complétude) → remonte CaracteristiquesBloc/fil (refetch des champs extraits)
  const [batimentsOuvert, setBatimentsOuvert] = useState(false); // PERF-1 — le bloc bâtiments (verdict) est déplié à la demande ; jauge le bouton « Valider »

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

  const valider = useCallback(async (dossierId: number) => {
    setEnCours(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/projection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'valider', dossierId }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; file?: LigneProjectionAffichee[] };
      if (res.ok && d.ok) {
        setFile(d.file ?? []); setOuvert(null); setVerdict(null); setMessage('projection validée : le permis passe en suivi et quitte la file');
        recompterSiSucces(true, onRecompter);
      } else setMessage(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'validation impossible'));
    } catch { setMessage('validation impossible'); } finally { setEnCours(false); }
  }, [onRecompter]);

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

  const ouvrir = (dossierId: number) => { setOuvert((v) => (v === dossierId ? null : dossierId)); setVerdict(null); setMessage(null); setBatimentsOuvert(false); }; // PERF-1 : chaque permis s'ouvre tout replié

  // PERF-1 — TOUS les blocs sont REPLIÉS par défaut et ne chargent leurs données QU'AU DÉPLIAGE (BlocRepliable, render-prop). Un bloc
  //   jamais ouvert ne déclenche AUCUNE requête. Seul le bilan de complétude fait UNE lecture légère (mémoire) au rendu, pour la
  //   ligne de titre visible sans déplier. renderDetail n'est rendu que pour une ligne ouverte → `ouvert` est non nul ici.
  const renderDetail = () => {
    if (ouvert === null) return null; // sécurité de type (narrowing) : renderDetail n'est appelé que sur une ligne ouverte
    const ev = etatValidationProjection(batimentsOuvert, verdict); // bouton « Valider » : invite à déplier les bâtiments tant qu'ils n'ont pas été ouverts
    // RATT-1 — état des familles calculé depuis la ligne DÉJÀ chargée (`file`), visible sans déplier ni tirer de contenu lourd (PERF-1 préservée).
    const row = file?.find((f) => f.dossierId === ouvert) ?? null;
    const etatAlt = etatAltitudesTitre(row?.nbBatiments ?? 0, row?.nbCorpsSansAltitude ?? 0);
    const etatProj = etatProjectionTitre(row?.projectionValidee ?? false);
    return (
      <div className="flex flex-col gap-2">
        {/* LOT 56-B — le bouton de ré-analyse « Diagnostic complet des documents » vit désormais EN TÊTE du bloc « Complétude »
            (BlocCompletude), plus ici : un seul point d'entrée, un seul nom. Son `onAnalyseFinie` remonte les frères (caractéristiques,
            fil) via vAnalyse ; le bloc Complétude relit son propre diagnostic tout seul. */}
        {/* LOT 51-B — ce permis est ici en TEST (dossier incomplet ouvert depuis « En cours »). S'il n'a pas permis de tout renseigner et
            qu'on ne veut PAS relancer la mairie maintenant, « Renvoyer ce permis dans l'onglet En cours » lève le marqueur : aucun e-mail, échéances intactes. */}
        {row?.testeEnAnalyse && (() => {
          // LOT 51-C — carte de TEST : deux issues. (A) SORTIE DÉFINITIVE vers Rattachement, gardée par la DOUBLE condition (empreinte
          //   validée ET toutes les altitudes de sommet NGF renseignées) — l'écran DIT laquelle manque, jamais un bouton grisé muet.
          //   (B) RETOUR sans envoi. Le bouton « Valider la projection » NORMAL est masqué pour un dossier testé (il n'arrête pas les
          //   relances) : la SEULE sortie d'un dossier testé passe par ici.
          const altitudeManque = (row?.nbCorpsSansAltitude ?? 0) > 0;
          const empreinteOk = ev.peutValider;             // requiert le dépliage + tracé de « Bâtiments et projection » (PERF-1) ; ev.libelle porte l'invite
          const pretSortie = empreinteOk && !altitudeManque;
          const ligneOk: React.CSSProperties = { color: 'var(--color-svv-green-ink)' };
          const ligneKo: React.CSSProperties = { color: 'var(--color-svv-red)' };
          return (
            <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', fontSize: 13 }}>
              <span>Dossier <strong>en test</strong> (ouvert depuis « En cours »). Les relances à la mairie continuent en fond.</span>
              {/* (A) SORTIE DÉFINITIVE */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', borderTop: '1px solid var(--color-svv-line)', paddingTop: '.5rem' }}>
                <strong>Terminer l’analyse et passer en Rattachement</strong>
                <span style={{ color: 'var(--color-svv-muted)', fontSize: 12 }}>Sortie <strong>DÉFINITIVE</strong> : le permis quitte « En cours » et <strong>toutes les relances programmées sont annulées</strong>. Deux conditions requises :</span>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 12, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                  <li style={empreinteOk ? ligneOk : ligneKo}>{empreinteOk ? '✓ empreinte des bâtiments validée' : `Empreinte non validée — ${ev.libelle}`}</li>
                  <li style={!altitudeManque ? ligneOk : ligneKo}>{!altitudeManque ? '✓ altitudes de sommet (NGF) renseignées' : `${row?.nbCorpsSansAltitude} bâtiment(s) sans altitude de sommet (NGF) — à renseigner dans « Caractéristiques du permis »`}</li>
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
            le bouton « Diagnostic complet des documents » est EN TÊTE de ce bloc : le bloc relit son propre diagnostic après la passe
            (plus besoin de vAnalyse dans SA clé, ce qui préserverait le compte rendu du bouton d'un remontage). `onAnalyseFinie`
            remonte les FRÈRES (caractéristiques, fil) via vAnalyse. */}
        <BlocCompletude key={`completude-${ouvert}`} dossierId={ouvert} avecDiagnostic onAnalyseFinie={() => { setVAnalyse((v) => v + 1); setVInstruction((v) => v + 1); }} />
        {/* FIL — historique des échanges : chargé UNIQUEMENT au dépliage (la requête du fil est complète ; pas d'aperçu léger — cf. rapport). */}
        <BlocRepliable key={`w-fil-${ouvert}`} titre="Historique des échanges">
          {() => <BlocFilEchanges key={`fil-${ouvert}-${vAnalyse}`} dossierId={ouvert} />}
        </BlocRepliable>
        {/* PROJ-3b — INSTRUCTION (caractéristiques + « + ajouter un bâtiment ») puis TRACÉ. Clés PRÉFIXÉES PAR RÔLE (unicité, cf. PART-2b),
            suffixe vAnalyse conservé : chaque enfant monté se remonte après « Diagnostic complet des documents ». Montés au dépliage (PERF-1). */}
        <BlocRepliable key={`w-carac-${ouvert}`} titre={<TitreFamilleEtat base="Caractéristiques du permis (saisie)" etat={etatAlt} />}>
          {() => <CaracteristiquesBloc key={`carac-${ouvert}-${vAnalyse}`} dossierId={ouvert} onOuvrir={(id, source, page) => void ouvrirPiece(id, source, page)} onChange={() => setVInstruction((v) => v + 1)} />}
        </BlocRepliable>
        {/* PERF-1 — BÂTIMENTS/PROJECTION (verdict) : la requête la PLUS coûteuse (≈ 9 s sur 7424). Différée au dépliage ; onOuvertChange
            débloque le bouton « Valider ». POLISH-1 — le bouton « Valider la projection » et ses phrases sont ENFERMÉS dans ce bloc :
            ils n'apparaissent qu'une fois DÉPLIÉ (cohérence avec les autres blocs repliés) ; repli → cachés, aucun /emprise relancé. */}
        <BlocRepliable key={`w-bat-${ouvert}`} titre={<TitreFamilleEtat base="Bâtiments et projection (emprise)" etat={etatProj} />} onOuvertChange={setBatimentsOuvert}>
          {() => (
            <div className="flex flex-col gap-2">
              <BlocTraceEmprise dossierId={ouvert} onVerdict={setVerdict} rafraichir={vInstruction} />
              {/* LOT 51-C — pour un dossier TESTÉ, le bouton « Valider » NORMAL est masqué : il passe en Rattachement SANS arrêter les
                  relances (dangereux). La sortie d'un dossier testé passe UNIQUEMENT par « Terminer l'analyse » (carte de test, double condition). */}
              {!row?.testeEnAnalyse && (
                <BoutonValiderProjection
                  peutValider={ev.peutValider}
                  aucunBatiment={ev.aucunBatiment}
                  libelle={ev.libelle}
                  enCours={enCours}
                  onValider={() => { void valider(ouvert); }} />
              )}
              {message && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>{message}</div>}
            </div>
          )}
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
        <TableProjection file={enTest} ouvert={ouvert} onOuvrir={ouvrir} renderDetail={renderDetail} libellePermis={'Test permis « En cours »'} />
      )}
      {/* Reste de la file (hors test). Masqué si tout est en test (sinon « La file est vide » mentirait) ; toujours rendu si la file entière est vide (message normal). */}
      {(reste.length > 0 || file.length === 0) && (
        <TableProjection file={reste} ouvert={ouvert} onOuvrir={ouvrir} renderDetail={renderDetail} />
      )}
    </div>
  );
}
