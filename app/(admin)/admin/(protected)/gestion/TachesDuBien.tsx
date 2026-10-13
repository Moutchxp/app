'use client';

import { useCallback, useEffect, useState } from 'react';
import { compterTaches, MOT_COMPTEUR, ORDRE_COULEURS, repartirTaches, type Tache } from '../../../../lib/gestion/taches';
import { CSS_TACHES, LigneTache, useMaintenant } from './LigneTache';
import { FenetreTache } from './FenetreTache';
import { ecouterTaches, lireTaches } from './tachesClient';

/**
 * ══ 🔴🔴 LOT TACHES-1 — LES TÂCHES EN HAUT DE LA FICHE DU BIEN ══════════════════════════════════════════════════
 *
 * Arno : « un bouton “+ Tâche”, à côté de “Dossier Drive ↗”, sans rien déplacer ni retirer ; juste en dessous, le
 * récapitulatif des tâches DE CE BIEN avec le code couleur ; quand le bien n'a aucune tâche ouverte, seul le
 * bouton s'affiche. »
 *
 * 🔴 DEUX COMPOSANTS, PARCE QUE CE SONT DEUX ENDROITS DE LA FICHE : le bouton vit dans la zone d'actions de
 * l'en-tête (`.ann-tete-actions`), le récapitulatif sous l'en-tête. Ils ne partagent aucun état : le signal des
 * tâches (`tachesClient.ts`) fait relire le récapitulatif quand le bouton crée une tâche.
 *
 * ⚠️ SANS LA MIGRATION 346, NI L'UN NI L'AUTRE NE REND RIEN : la fiche est exactement celle d'avant ce lot.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

/** Le bouton « + Tâche » et sa fenêtre de création. Ne rend rien tant que les tâches ne sont pas installées. */
export function BoutonTache({ lotId, lotCle, adresse, onEcrire }: {
  lotId: number; lotCle: string; adresse: string;
  /** 🔴 LOT TACHES-1-BIS — ouvre le composeur « Nouveau message », adresse pré-remplie, sans rien envoyer. */
  onEcrire?: (email: string) => void;
}) {
  const [installe, setInstalle] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  /** 🔴 La confirmation d'une création, à côté du bouton : la fenêtre se ferme, mais jamais en silence. */
  const [confirmation, setConfirmation] = useState<string | null>(null);
  useEffect(() => {
    if (confirmation === null) return;
    const t = window.setTimeout(() => setConfirmation(null), 8000);
    return () => window.clearTimeout(t);
  }, [confirmation]);
  useEffect(() => {
    let annule = false;
    void lireTaches(lotId).then((r) => { if (!annule) setInstalle(r.etat === 'ok'); });
    return () => { annule = true; };
  }, [lotId]);
  if (!installe) return null;
  return (
    <>
      <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setConfirmation(null); setOuvert(true); }}>
        + Tâche
      </button>
      {confirmation !== null && <span className="tch-confirmation" role="status">✓ {confirmation}</span>}
      {ouvert && (
        <FenetreTache mode={{ sorte: 'creer', lotId, lotCle, adresse }} onFermer={() => setOuvert(false)} onEcrire={onEcrire}
          onCree={setConfirmation} />
      )}
    </>
  );
}

/** Le récapitulatif des tâches DE CE BIEN. Rien quand il n'y a aucune tâche ouverte. */
export function RecapTachesDuBien({ lotId, onEcrire }: { lotId: number; onEcrire?: (email: string) => void }) {
  const maintenant = useMaintenant();
  const [taches, setTaches] = useState<Tache[] | null>(null);
  const [detail, setDetail] = useState<number | null>(null);

  const charger = useCallback(async () => {
    const r = await lireTaches(lotId);
    // UN ÉCHEC SE TAIT : ce bloc est un plus sur la fiche ; une bannière d'erreur ferait plus de mal que l'absence.
    setTaches(r.etat === 'ok' ? r.taches : []);
  }, [lotId]);

  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => ecouterTaches(() => { void charger(); }), [charger]);

  const fenetre = detail !== null && <FenetreTache mode={{ sorte: 'detail', id: detail }} onFermer={() => setDetail(null)} onEcrire={onEcrire} />;
  if (taches === null) return null;
  const { ouvertes, terminees } = repartirTaches(taches, maintenant);
  if (ouvertes.length === 0) return fenetre || null;
  const n = compterTaches(ouvertes, maintenant);

  return (
    <section className="tch-bloc-fiche" aria-labelledby={`tch-bien-${lotId}`}>
      <style>{CSS_TACHES}</style>
      <h4 className="tch-bloc-titre" id={`tch-bien-${lotId}`}>
        Tâches de ce bien
        <ul className="tch-compteurs" aria-label="Compteurs des tâches">
          {ORDRE_COULEURS.filter((c) => n[c] > 0).map((c) => (
            <li key={c} className="tch-compteur">
              <span className={`tch-pastille tch-pastille--${c}`} aria-hidden="true" />
              <b>{n[c]}</b> {MOT_COMPTEUR[c]}
            </li>
          ))}
        </ul>
      </h4>
      <ul className="tch-liste">
        {ouvertes.map((t) => <LigneTache key={t.id} tache={t} maintenant={maintenant} onDetail={setDetail} />)}
      </ul>
      {terminees.length > 0 && (
        <details className="tch-terminees">
          <summary>Faites ou annulées ({terminees.length})</summary>
          <ul className="tch-liste">
            {terminees.map((t) => <LigneTache key={t.id} tache={t} maintenant={maintenant} onDetail={setDetail} />)}
          </ul>
        </details>
      )}
      {fenetre}
    </section>
  );
}
