'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * 224 — MODALE de confirmation du passage en ENVOI AUTOMATIQUE des 1res demandes e-mail. Rien ne s'arme sans un clic EXPLICITE ici
 * (le retour en manuel, lui, est immédiat et ne passe pas par cette modale). Elle explique en français simple, SANS jargon :
 *  · CE QUI VA SE PASSER (des demandes partiront aux mairies sans geste) ;
 *  · LE VOLUME RÉEL au moment de la bascule (ce qui partirait au prochain créneau + demandes prêtes + communes éligibles), LU/SIMULÉ
 *    côté serveur (`/envoi-auto-apercu`), JAMAIS un chiffre en dur ;
 *  · LES PLAFONDS qui s'appliquent (par passage / par jour / par commune et par mois / fenêtre horaire), avec leurs VALEURS réelles ;
 *  · que les RELANCES et les SAISINES CADA ne sont PAS concernées.
 * a11y : role dialog + focus initial sur « Annuler » + Échap = annuler. Mobile-first : plein écran en bas, cibles ≥ 44 px.
 */
export interface ApercuEnvoiAuto {
  pretesMaintenant: number;
  partiraientMaintenant: number;
  communesProposables: number;
  capParRun: number;
  capParJour: number;
  plafondMensuelParCommune: number;
  fenetreDebut: number;
  fenetreFin: number;
}

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', padding: '1rem', zIndex: 60,
};
const carte: CSSProperties = {
  background: '#fff', borderRadius: '.75rem', maxWidth: '34rem', width: '100%', maxHeight: '90vh', overflowY: 'auto',
  padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.85rem', boxShadow: '0 10px 40px rgba(0,0,0,.25)',
};
const btnBase: CSSProperties = {
  minHeight: 44, padding: '.6rem 1rem', borderRadius: '.5rem', fontSize: 14, fontWeight: 600, cursor: 'pointer', flex: '1 1 12rem',
};

export function ModaleConfirmationEnvoiAuto({ onConfirmer, onAnnuler, enCours = false }: {
  onConfirmer: () => void;
  onAnnuler: () => void;
  enCours?: boolean; // true pendant l'écriture du flag (bloque le double-clic sur « Activer »)
}) {
  const [apercu, setApercu] = useState<ApercuEnvoiAuto | null>(null);
  const [chargement, setChargement] = useState(true);
  const [echec, setEchec] = useState(false);
  const refAnnuler = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    refAnnuler.current?.focus(); // focus initial sur l'action NON destructrice
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes/envoi-auto-apercu', { cache: 'no-store' });
        if (annule) return;
        if (res.ok) setApercu((await res.json()) as ApercuEnvoiAuto);
        else setEchec(true);
      } catch { if (!annule) setEchec(true); }
      finally { if (!annule) setChargement(false); }
    })();
    return () => { annule = true; };
  }, []);

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enCours) onAnnuler(); };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onAnnuler, enCours]);

  return (
    <div style={overlay} role="presentation" onClick={() => { if (!enCours) onAnnuler(); }}>
      <div style={carte} role="dialog" aria-modal="true" aria-labelledby="titre-envoi-auto" onClick={(e) => e.stopPropagation()}>
        <strong id="titre-envoi-auto" style={{ fontSize: 16 }}>Activer l’envoi automatique des 1res demandes e-mail ?</strong>

        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          À partir de maintenant, l’outil enverra <strong>tout seul</strong> les 1res demandes d’information aux mairies, par e-mail,
          sans que tu aies à cliquer. Seul ce premier envoi devient automatique.
        </p>

        <div style={{ background: 'var(--color-svv-red-soft, #fdecec)', borderRadius: '.5rem', padding: '.7rem .85rem' }}>
          <strong style={{ fontSize: 13 }}>Ce qui partirait maintenant</strong>
          {chargement && <p style={{ margin: '.35rem 0 0', fontSize: 13, color: 'var(--color-svv-muted)' }}>Calcul du volume réel en cours…</p>}
          {echec && !chargement && (
            <p style={{ margin: '.35rem 0 0', fontSize: 13, color: 'var(--color-svv-muted)' }}>
              Le volume n’a pas pu être calculé à l’instant, mais les plafonds de tes réglages s’appliqueront quand même.
            </p>
          )}
          {apercu && !chargement && (
            <p style={{ margin: '.35rem 0 0', fontSize: 13, lineHeight: 1.5 }}>
              Au prochain créneau d’envoi : <strong>{apercu.partiraientMaintenant}</strong> demande(s) partiraient (dans la limite des
              plafonds ci-dessous).<br />
              Déjà prêtes en attente : <strong>{apercu.pretesMaintenant}</strong>. Communes éligibles selon tes critères actuels :{' '}
              <strong>{apercu.communesProposables}</strong>.
            </p>
          )}
        </div>

        <div>
          <strong style={{ fontSize: 13 }}>Les garde-fous restent actifs</strong>
          {apercu && !chargement ? (
            <ul style={{ margin: '.35rem 0 0', paddingLeft: '1.1rem', fontSize: 13, lineHeight: 1.55 }}>
              <li>Au maximum <strong>{apercu.capParRun}</strong> demande(s) par passage.</li>
              <li>Au maximum <strong>{apercu.capParJour}</strong> demande(s) par jour.</li>
              <li>Au maximum <strong>{apercu.plafondMensuelParCommune}</strong> demande(s) par commune et par mois.</li>
              <li>Uniquement les jours ouvrés, entre <strong>{apercu.fenetreDebut} h</strong> et <strong>{apercu.fenetreFin} h</strong>.</li>
            </ul>
          ) : (
            <p style={{ margin: '.35rem 0 0', fontSize: 13, color: 'var(--color-svv-muted)' }}>
              Les plafonds par passage, par jour, par commune et par mois, ainsi que la fenêtre horaire, restent ceux de tes réglages.
            </p>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          Les <strong>relances</strong> et les <strong>saisines CADA</strong> ne sont pas concernées : elles gardent leurs propres
          réglages et ne changent pas.
        </p>

        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '.15rem' }}>
          <button
            type="button" onClick={onConfirmer} disabled={enCours}
            style={{ ...btnBase, border: '1px solid var(--color-svv-red)', background: 'var(--color-svv-red)', color: '#fff', opacity: enCours ? 0.6 : 1 }}
          >
            {enCours ? 'Activation…' : 'Activer l’envoi automatique'}
          </button>
          <button
            ref={refAnnuler} type="button" onClick={onAnnuler} disabled={enCours}
            style={{ ...btnBase, border: '1px solid var(--color-svv-line)', background: '#fff', color: 'var(--color-svv-ink)' }}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
