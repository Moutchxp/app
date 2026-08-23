'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
// ⚠️ Bundle client : uniquement des TYPES depuis les modules serveur.
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import type { ComparaisonRattachement } from '../../../../lib/permis/affectationRepo';
import { TableSuivi, DetailSuiviRendu, AffectationBloc, ActionsRattachement, SchemaPleinEcran, ComparaisonPleinEcran, descriptionSchemaOrigine, descriptionSchemaNouvelle, NOM_SCHEMA_NOUVELLE } from './SuiviRattachementRendu';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { CellulePieces } from './ArchivesRendu';
import { recompterSiSucces } from './comptesActions';

/**
 * FUS-3c — onglet SUIVI DU RATTACHEMENT : au clic sur un permis, TOUT le contenu de décision est sur la même page — détail
 * comparatif « trois sources », Street View, ET le détail complet du permis rapatrié d'Archives (caractéristiques, bâtiments,
 * altitudes, parcelles, pièces jointes CONSULTABLES). Réutilise `CaracteristiquesBloc` et `CellulePieces` (déplacement de rendu,
 * pas de réécriture). FUS-3d ajoute l'AFFECTATION des polygones BD TOPO aux corps (schéma + sélecteurs) — SEULE écriture ici ;
 * toujours AUCUN bouton valider/refuser, AUCUNE injection d'altitude (FUS-3e). Les pièces sont téléchargeables mais ni supprimables
 * ni ajoutables ici (ça reste dans Archives). Le détail complet est REPLIÉ par défaut (lisible à 20 dossiers).
 */
export function SuiviRattachementVue({ onRecompter }: { onRecompter?: () => void } = {}) {
  const [liste, setListe] = useState<{ lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number> } | null>(null);
  const [daactActif, setDaactActif] = useState<boolean | null>(null); // réglage : la DAACT déclenche-t-elle un dossier ?
  const [erreur, setErreur] = useState(false);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailSuivi | null>(null);
  const [comparaison, setComparaison] = useState<ComparaisonRattachement | null>(null); // L5 : origine (figée) + nouvelle (vivante) + rouge
  const [pleinEcran, setPleinEcran] = useState<'origine' | 'nouvelle' | 'comparer' | null>(null); // L3/L5 — quel plein écran est ouvert
  const [detailErreur, setDetailErreur] = useState(false);
  const [affErreur, setAffErreur] = useState('');
  const [permisOuvert, setPermisOuvert] = useState(false); // détail complet du permis (caractéristiques + pièces), replié par défaut
  // FUS-3e — décisions
  const [motifRefus, setMotifRefus] = useState('');
  const [motifConfirmation, setMotifConfirmation] = useState('');
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [actionErreur, setActionErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/rattachement', { cache: 'no-store' });
        if (annule) return;
        if (res.ok) { const d = (await res.json()) as { lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number>; daactActif?: boolean }; setListe({ lignes: d.lignes, compteurs: d.compteurs }); setDaactActif(d.daactActif ?? null); }
        else setErreur(true);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, []);

  useEffect(() => {
    if (ouvert === null) return; // détail masqué au rendu quand ouvert === null (pas de setState synchrone ici)
    let annule = false;
    void (async () => {
      setDetail(null); setComparaison(null); setDetailErreur(false); setAffErreur(''); setPermisOuvert(false); setPleinEcran(null);
      setMotifRefus(''); setMotifConfirmation(''); setAvertissement(null); setActionErreur(''); // reset décisions (DANS l'async)
      try {
        const res = await fetch(`/api/admin/permis/rattachement?dossierId=${ouvert}`, { cache: 'no-store' });
        if (annule) return;
        if (res.ok) { const d = (await res.json()) as { detail: DetailSuivi; comparaison: ComparaisonRattachement | null }; setDetail(d.detail); setComparaison(d.comparaison); }
        else setDetailErreur(true);
      } catch { if (!annule) setDetailErreur(true); }
    })();
    return () => { annule = true; };
  }, [ouvert]);

  // FUS-3d — affecter/désaffecter un polygone à un corps. L'exclusivité est garantie CÔTÉ BASE (index) ; un refus affiche son motif.
  const affecter = useCallback(async (corpsId: number, cleabs: string | null): Promise<void> => {
    if (ouvert === null) return;
    setAffErreur('');
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'affecter', dossierId: ouvert, corpsId, cleabs }) });
      const d = (await res.json().catch(() => ({}))) as { comparaison?: ComparaisonRattachement; erreur?: string };
      if (res.ok && d.comparaison) setComparaison(d.comparaison);
      else setAffErreur(d.erreur ?? 'Affectation impossible.');
    } catch { setAffErreur('Affectation impossible.'); }
  }, [ouvert]);

  // FUS-3e — décisions (valider / refuser / retour_lidar). La validation d'une cardinalité incohérente exige un motif (besoinConfirmation).
  const agir = useCallback(async (action: 'valider' | 'refuser' | 'retour_lidar', extra: { motif?: string; motifConfirmation?: string } = {}): Promise<void> => {
    if (ouvert === null) return;
    setEnCours(true); setActionErreur('');
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, dossierId: ouvert, ...extra }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; besoinConfirmation?: boolean; avertissement?: string; erreur?: string; detail?: DetailSuivi; comparaison?: ComparaisonRattachement | null };
      if (res.ok && d.ok) {
        if (d.detail) setDetail(d.detail);
        if (d.comparaison !== undefined) setComparaison(d.comparaison ?? null);
        setAvertissement(null); setMotifRefus(''); setMotifConfirmation('');
        recompterSiSucces(true, onRecompter); // pastille : la décision (valider/refuser/retour) a changé l'état « arbitrage »
      } else if (d.besoinConfirmation) {
        setAvertissement(d.avertissement ?? 'Cardinalité incohérente : confirmez avec un motif.');
      } else {
        setActionErreur(d.erreur ?? 'Action impossible.');
      }
    } catch { setActionErreur('Action impossible.'); }
    finally { setEnCours(false); }
  }, [ouvert, onRecompter]);

  // Téléchargement d'une pièce — MÊME signeur unique qu'Archives (action url_piece de /reponses ; la clé ne transite jamais).
  // Réglage GLOBAL : la DAACT (achèvement déclaré) déclenche-t-elle l'ouverture d'un dossier de rattachement ?
  const basculerDaact = useCallback(async (actif: boolean): Promise<void> => {
    setDaactActif(actif); // optimiste
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reglage_daact', actif }) });
      if (!res.ok) setDaactActif(!actif); // rétablissement sur échec
    } catch { setDaactActif(!actif); }
  }, []);

  const telecharger = useCallback(async (pieceId: number, source: 'reponse' | 'dossier'): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(url, '_blank', 'noopener,noreferrer'); }
    } catch { /* lien indisponible : silencieux (lecture seule) */ }
  }, []);

  // N10-B — OUVERTURE d'une pièce À LA PAGE (variante `inline` de url_piece → visionneur, sans forcer le téléchargement) ; le fragment
  //   #page=N est ajouté ICI, côté client (jamais signé → sécurité intacte). MÊME signeur serveur, la clé ne transite jamais.
  const ouvrirPiece = useCallback(async (pieceId: number, source: 'reponse' | 'dossier', page?: number): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source, inline: true }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(page ? `${url}#page=${page}` : url, '_blank', 'noopener,noreferrer'); }
    } catch { /* lien indisponible : silencieux (lecture seule) */ }
  }, []);

  if (erreur) return <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Suivi indisponible.</div>;
  if (!liste) return <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>;

  // L7 — CONTENU du détail (identique à avant : comparatif, schémas, décisions, détail complet). Rendu INLINE par TableSuivi sous la
  // ligne ouverte ; il n'est appelé QUE pour le dossier ouvert (ouvert === dossierId), donc les états `detail`/`comparaison` visent bien ce dossier.
  const renderDetail = (): ReactNode => {
    if (detailErreur) return <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Détail indisponible.</div>;
    if (!detail) return <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement du détail…</div>;
    return (
      <div className="flex flex-col gap-2">
        <DetailSuiviRendu detail={detail} />
        {comparaison && (() => {
          const { origine, nouvelle, polygonesModifies, aChange } = comparaison;
          const persiste = detail.persiste, enAtt = detail.etat === 'en_attente_bati';
          const affecterCb = (corpsId: number, cleabs: string | null) => void affecter(corpsId, cleabs);
          const descO = descriptionSchemaOrigine(origine);
          const mentionN = descriptionSchemaNouvelle(nouvelle.polygones.length, polygonesModifies.length);
          return (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <AffectationBloc affectation={origine} titre={descO.nom} mention={descO.mention} persiste={persiste} enAttenteBati={enAtt} onAffecter={affecterCb} onAgrandir={() => setPleinEcran('origine')} />
                </div>
                {aChange && (
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <AffectationBloc affectation={nouvelle} titre={NOM_SCHEMA_NOUVELLE} mention={mentionN} rougeCleabs={polygonesModifies} persiste={persiste} enAttenteBati={enAtt} onAffecter={affecterCb} onAgrandir={() => setPleinEcran('nouvelle')} />
                  </div>
                )}
              </div>
              {origine.figee && !aChange && (
                <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>
                  La configuration actuelle est identique à l’origine : aucun changement détecté depuis le gel — pas de second schéma à comparer.
                </div>
              )}
              {aChange && (
                <div>
                  <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto' }} onClick={() => setPleinEcran('comparer')}>Comparer les schémas ⤢</button>
                </div>
              )}
              {pleinEcran === 'origine' && (
                <SchemaPleinEcran titre={descO.nom} mention={descO.mention} affectation={origine} persiste={persiste} enAttenteBati={enAtt} onAffecter={affecterCb} onFermer={() => setPleinEcran(null)} />
              )}
              {pleinEcran === 'nouvelle' && (
                <SchemaPleinEcran titre={NOM_SCHEMA_NOUVELLE} mention={mentionN} rougeCleabs={polygonesModifies} affectation={nouvelle} persiste={persiste} enAttenteBati={enAtt} onAffecter={affecterCb} onFermer={() => setPleinEcran(null)} />
              )}
              {pleinEcran === 'comparer' && aChange && (
                <ComparaisonPleinEcran origine={origine} nouvelle={nouvelle} rougeCleabs={polygonesModifies}
                  nomOrigine={descO.nom} nomNouvelle={NOM_SCHEMA_NOUVELLE} mentionOrigine={descO.mention} mentionNouvelle={mentionN}
                  onFermer={() => setPleinEcran(null)} />
              )}
            </>
          );
        })()}
        {affErreur && <div role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{affErreur}</div>}
        {detail.persiste && (
          <>
            <ActionsRattachement avertissement={avertissement} motifRefus={motifRefus} motifConfirmation={motifConfirmation}
              onMotifRefus={setMotifRefus} onMotifConfirmation={setMotifConfirmation} enCours={enCours}
              onValider={() => void agir('valider', { motifConfirmation: motifConfirmation || undefined })}
              onRefuser={() => void agir('refuser', { motif: motifRefus })}
              onRetour={() => void agir('retour_lidar')} />
            {actionErreur && <div role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{actionErreur}</div>}
          </>
        )}
        {/* Détail complet du permis rapatrié d'Archives — replié par défaut. */}
        <div>
          <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .4rem' }}
            aria-expanded={permisOuvert} onClick={() => setPermisOuvert((v) => !v)}>
            {permisOuvert ? 'masquer' : 'afficher'} le détail complet du permis et ses pièces jointes {permisOuvert ? '▲' : '▼'}
          </button>
        </div>
        {permisOuvert && (
          <div className="flex flex-col gap-2">
            <CaracteristiquesBloc dossierId={detail.dossierId} onOuvrir={(id, source, page) => void ouvrirPiece(id, source, page)} />
            <div className="svv-card" style={{ fontSize: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: '.3rem' }}>Pièces jointes</div>
              <CellulePieces pieces={detail.pieces} onTelecharger={(id, source) => void telecharger(id, source)} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>
        Suivi du rattachement des permis à leur parcelle et à leurs bâtiments futurs. Univers = permis dont les parcelles ont été
        analysées (la parcelle du permis est constituée). Lecture seule.
      </p>
      {/* Réglage : la DAACT (attestation d'achèvement) comme déclencheur. Ouvre un dossier « en attente du bâti » — jamais d'injection. */}
      {daactActif !== null && (
        <label className="svv-card" style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontSize: 12 }}>
          <input type="checkbox" checked={daactActif} onChange={(e) => void basculerDaact(e.target.checked)} style={{ marginTop: '.15rem' }} />
          <span>
            <strong>Ouvrir un dossier dès l’achèvement déclaré (DAACT)</strong> — quand un permis passe « Terminé », un dossier de
            rattachement est créé, en attente du bâti dans BD TOPO. Il ouvre l’arbitrage, il ne l’injecte jamais : aucune altitude
            n’est écrite automatiquement. Décochez pour n’utiliser que les signaux cadastre / BD TOPO.
          </span>
        </label>
      )}
      {/* L7 — le détail est rendu par TableSuivi DANS LE FLUX, juste sous la ligne ouverte (trame grise), plus en bas de page. */}
      <TableSuivi lignes={liste.lignes} compteurs={liste.compteurs} ouvert={ouvert} onOuvrir={(id) => setOuvert(id === ouvert ? null : id)} renderDetail={renderDetail} />
    </div>
  );
}
