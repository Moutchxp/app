'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

/**
 * RATT-EDIT (lot B2) — VERROU d'édition d'un permis DÉJÀ VALIDÉ, dans l'onglet Rattachement. Deux composants PURS (aucun réseau, aucun
 * état interne autre que le focus) → montables et testables unitairement (jsdom), à l'inverse de BlocTraceEmprise (client lourd) :
 *   · BandeauModificationValidation — état VERROUILLÉ (lecture seule + bouton « Modifier » gaté par la capacité) ou état DÉVERROUILLÉ
 *     (bannière « modification en cours — non revalidée » + « verrouiller »). Le verrou est fermé PAR DÉFAUT pour tout le monde,
 *     administrateur compris (règle B2) : rien n'est éditable tant que « Modifier » n'a pas été actionné et la pop-up 1 confirmée.
 *   · PopUpConfirmerModification — pop-up 1 : confirmation AVANT d'ouvrir la modification d'une validation précédente. Dit, sans jargon,
 *     ce qui va se passer (permis validé, modification enregistrée et tracée, revalidation ensuite). Deux issues : confirmer / annuler.
 *
 * ⚠️ B2 NE REVALIDE PAS et n'écrit AUCUNE trace : ces composants ne font qu'OUVRIR/FERMER l'édition côté écran. La revalidation, la
 *    pop-up 2 et l'horodatage « qui a modifié, quand » sont le lot B3. Le vrai garde-fou d'écriture est SERVEUR (garde A3,
 *    exigerCapaciteModif) : le bouton masqué n'est qu'un confort d'interface.
 */

const styleBandeau: CSSProperties = { fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'center', justifyContent: 'space-between' };

export function BandeauModificationValidation({ modifOuverte, modifie = false, peutModifier, onDemander, onVerrouiller }: {
  modifOuverte: boolean;       // édition déverrouillée (après « Modifier » + pop-up 1 confirmée)
  modifie?: boolean;           // RATT-EDIT (statut clair) — marqueur SERVEUR « à revalider » : une modification RÉELLE a-t-elle été enregistrée ? Pilote NEUTRE vs ROUGE (plus modifOuverte seul).
  peutModifier: boolean;       // capacité peutModifierPermis (JWT) — sinon aucun bouton « Modifier »
  onDemander: () => void;      // clic « Modifier » → le parent ouvre la pop-up 1
  onVerrouiller: () => void;   // clic « Terminer la modification » → le parent referme l'édition (retour lecture seule ; N'est PAS une revalidation, N'annule RIEN)
}) {
  if (modifOuverte) {
    // RATT-EDIT (statut clair) — le bandeau suit le MARQUEUR, plus modifOuverte seul : ROUGE seulement quand une modification RÉELLE est
    //   enregistrée, sinon NEUTRE (« mode modification ouvert »). « Terminer la modification » = retour lecture seule (rien annulé, rien revalidé).
    if (modifie) {
      return (
        <div role="status" className="svv-card" style={{ ...styleBandeau, borderColor: 'var(--color-svv-red)' }}>
          <span style={{ minWidth: 0 }}>
            <strong style={{ color: 'var(--color-svv-red)' }}>Modifié — à revalider.</strong>{' '}
            Une modification a été enregistrée (au fil de l’eau). Revalidez pour en faire la nouvelle validation de référence ; si vous terminez maintenant, le permis restera « à revalider ».
          </span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', minHeight: 44 }} onClick={onVerrouiller}>
            Terminer la modification
          </button>
        </div>
      );
    }
    return (
      <div role="status" className="svv-card" style={styleBandeau}>
        <span style={{ minWidth: 0, color: 'var(--color-svv-muted)' }}>
          <strong style={{ color: 'var(--color-svv-ink)' }}>Mode modification ouvert.</strong>{' '}
          L’altitude et l’emprise sont modifiables ; vos changements sont enregistrés au fil de l’eau. Tant que rien n’a été modifié, le permis reste « Validé ».
        </span>
        <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', minHeight: 44 }} onClick={onVerrouiller}>
          Terminer la modification
        </button>
      </div>
    );
  }
  // VERROUILLÉ (défaut) — lecture seule pour tout le monde. Le bouton « Modifier » n'apparaît qu'avec la capacité (le serveur refuse de toute façon).
  return (
    <div className="svv-card" style={styleBandeau}>
      <span style={{ minWidth: 0, color: 'var(--color-svv-muted)' }}>
        Ce permis est <strong>validé</strong> : l’altitude et l’emprise sont en <strong>lecture seule</strong>.
        {peutModifier ? ' Pour les modifier, cliquez sur « Modifier ».' : ' Vous n’avez pas le droit de le modifier.'}
      </span>
      {peutModifier && (
        <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', minHeight: 44 }} onClick={onDemander}>
          Modifier
        </button>
      )}
    </div>
  );
}

/**
 * RATT-EDIT (statut clair) — LIGNE DE STATUT PERMANENTE d'un permis en Rattachement, en TÊTE de fiche et visible SANS rien ouvrir. Dit,
 * d'un coup d'œil et sans jargon, si le permis est « Validé » (VERT) ou « Modifié — à revalider » (ROUGE, marqueur SERVEUR). PURE (aucun
 * réseau). Les dates/auteurs ne s'affichent QUE s'ils sont disponibles (permis validés avant B1 → « Validé » nu, jamais un « le null »).
 * Remplace l'ancienne bannière read-only « ⚠ Modifié après validation » : même information (qui/quand du marqueur), désormais PERMANENTE et
 * portant AUSSI l'état positif « Validé » — un sur-ensemble, jamais une perte.
 */
export function LigneStatutValidation({ modifie, validationLe, validationParNom, modifieLe, modifieParNom }: {
  modifie: boolean;                    // marqueur SERVEUR « à revalider » (detail.modifieDepuisValidation)
  validationLe?: string | null;        // date ISO de la validation de référence courante (si disponible : dernière version de gel de validation)
  validationParNom?: string | null;    // auteur de cette validation (nom résolu, si disponible)
  modifieLe?: string | null;           // trace B3 : quand la dernière modification a eu lieu (si disponible)
  modifieParNom?: string | null;       // trace B3 : qui a modifié (si disponible ; null = emprise seule / non résolu)
}) {
  if (modifie) {
    const quand = dateHeureLisible(modifieLe);
    const qui = modifieParNom && modifieParNom.trim() !== '' ? modifieParNom.trim() : null;
    return (
      <div role="status" className="svv-card" style={{ fontSize: 13, borderColor: 'var(--color-svv-red)' }}>
        <strong style={{ color: 'var(--color-svv-red)' }}>Modifié{qui ? ` par ${qui}` : ''}{quand ? ` le ${quand}` : ''} — à revalider.</strong>{' '}
        L’altitude ou l’emprise a changé depuis la dernière validation. Revalidez pour en faire la nouvelle validation de référence.
      </div>
    );
  }
  const quand = dateLisible(validationLe);
  const qui = validationParNom && validationParNom.trim() !== '' ? validationParNom.trim() : null;
  return (
    <div role="status" className="svv-card" style={{ fontSize: 13, borderColor: 'var(--color-svv-green)' }}>
      <strong style={{ color: 'var(--color-svv-green-ink)' }}>Validé{quand ? ` le ${quand}` : ''}{qui ? ` par ${qui}` : ''}.</strong>{' '}
      L’altitude et l’emprise actuelles sont la validation de référence de ce permis.
    </div>
  );
}

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', padding: '1rem', zIndex: 60,
};
// Carte dark-safe (tokens svv basculés par data-theme, ≠ #fff en dur) → lisible en thème clair ET sombre.
const carte: CSSProperties = {
  background: 'var(--color-svv-surface)', color: 'var(--color-svv-ink)', border: '1px solid var(--color-svv-line)',
  borderRadius: '.75rem', maxWidth: '32rem', width: '100%', maxHeight: '90vh', overflowY: 'auto',
  padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.85rem', boxShadow: '0 10px 40px rgba(0,0,0,.35)',
};
const btnBase: CSSProperties = { minHeight: 44, padding: '.6rem 1rem', borderRadius: '.5rem', fontSize: 14, fontWeight: 600, cursor: 'pointer', flex: '1 1 12rem' };

/** Date de validation en français lisible (jamais un ISO brut) ; null/invalide → non affichée. */
function dateLisible(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Date+heure lisibles en français (jamais un ISO brut) ; null/invalide → non affichées. */
function dateHeureLisible(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function PopUpConfirmerRestauration({ versionLabel, enCours = false, onConfirmer, onAnnuler }: {
  versionLabel: string;  // libellé lisible de la version choisie (ex. « Validation d'origine du 7 septembre 2026 »)
  enCours?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  const refAnnuler = useRef<HTMLButtonElement>(null);
  useEffect(() => { refAnnuler.current?.focus(); }, []);
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enCours) onAnnuler(); };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onAnnuler, enCours]);
  return (
    <div style={overlay} role="presentation" onClick={() => { if (!enCours) onAnnuler(); }}>
      <div style={carte} role="dialog" aria-modal="true" aria-labelledby="titre-restauration" onClick={(e) => e.stopPropagation()}>
        <strong id="titre-restauration" style={{ fontSize: 16 }}>Restaurer cette validation d’origine ?</strong>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          L’état de travail actuel (<strong>altitude</strong> et <strong>emprise</strong>) sera remplacé par : <strong>{versionLabel}</strong>.
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          Les bâtiments et emprises supprimés depuis seront <strong>recréés</strong>. Toutes les versions restent consultables dans
          l’historique : cette restauration y est <strong>ajoutée</strong>, rien n’est effacé.
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          Après restauration, le permis sera <strong>« à revalider »</strong> (il reste dans « Rattachement »).
        </p>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '.15rem' }}>
          <button type="button" onClick={onConfirmer} disabled={enCours}
            style={{ ...btnBase, border: '1px solid var(--color-svv-red)', background: 'var(--color-svv-red)', color: '#fff', opacity: enCours ? 0.6 : 1 }}>
            {enCours ? 'Restauration…' : 'Restaurer'}
          </button>
          <button ref={refAnnuler} type="button" onClick={onAnnuler} disabled={enCours}
            style={{ ...btnBase, border: '1px solid var(--color-svv-line)', background: 'var(--color-svv-surface)', color: 'var(--color-svv-ink)' }}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

export function PopUpConfirmerRevalidation({ modifieParNom, modifieLe, enCours = false, onConfirmer, onAnnuler }: {
  modifieParNom?: string | null; // trace : auteur de la dernière modification (si disponible)
  modifieLe?: string | null;     // trace : date/heure de la dernière modification (ISO, si disponible)
  enCours?: boolean;             // revalidation en cours (bloque le double-clic)
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  const refAnnuler = useRef<HTMLButtonElement>(null);
  useEffect(() => { refAnnuler.current?.focus(); }, []);
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enCours) onAnnuler(); };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onAnnuler, enCours]);

  const quand = dateHeureLisible(modifieLe);
  const auteur = modifieParNom && modifieParNom.trim() !== '' ? modifieParNom.trim() : null;

  return (
    <div style={overlay} role="presentation" onClick={() => { if (!enCours) onAnnuler(); }}>
      <div style={carte} role="dialog" aria-modal="true" aria-labelledby="titre-revalidation" onClick={(e) => e.stopPropagation()}>
        <strong id="titre-revalidation" style={{ fontSize: 16 }}>Revalider ce permis ?</strong>
        {(quand || auteur) && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--color-svv-muted)' }}>
            Dernière modification{auteur ? ` par ${auteur}` : ''}{quand ? ` le ${quand}` : ''}.
          </p>
        )}
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          L’<strong>altitude</strong> et l’<strong>emprise</strong> actuelles seront enregistrées comme la <strong>nouvelle validation de
          référence</strong> de ce permis.
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          La <strong>validation précédente est conservée</strong> et restera restaurable. Le permis reste dans « Rattachement ».
        </p>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '.15rem' }}>
          <button type="button" onClick={onConfirmer} disabled={enCours}
            style={{ ...btnBase, border: '1px solid var(--color-svv-red)', background: 'var(--color-svv-red)', color: '#fff', opacity: enCours ? 0.6 : 1 }}>
            {enCours ? 'Revalidation…' : 'Revalider'}
          </button>
          <button ref={refAnnuler} type="button" onClick={onAnnuler} disabled={enCours}
            style={{ ...btnBase, border: '1px solid var(--color-svv-line)', background: 'var(--color-svv-surface)', color: 'var(--color-svv-ink)' }}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

export function PopUpConfirmerModification({ validationDate, validationAuteur, onConfirmer, onAnnuler }: {
  validationDate?: string | null;   // date de validation d'origine, SI disponible côté écran (sinon message générique)
  validationAuteur?: string | null; // auteur de la validation, SI disponible
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  const refAnnuler = useRef<HTMLButtonElement>(null);
  useEffect(() => { refAnnuler.current?.focus(); }, []); // focus initial sur l'action NON destructrice
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') onAnnuler(); };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onAnnuler]);

  const dateFr = dateLisible(validationDate);
  const auteur = validationAuteur && validationAuteur.trim() !== '' ? validationAuteur.trim() : null;
  // « validé [le …] [par …] » — chaque fragment n'apparaît que s'il est disponible (jamais un « le null » ni un « par undefined »).
  const quand = dateFr ? ` le ${dateFr}` : '';
  const parQui = auteur ? ` par ${auteur}` : '';

  return (
    <div style={overlay} role="presentation" onClick={onAnnuler}>
      <div style={carte} role="dialog" aria-modal="true" aria-labelledby="titre-modif-validation" onClick={(e) => e.stopPropagation()}>
        <strong id="titre-modif-validation" style={{ fontSize: 16 }}>Modifier un permis déjà validé ?</strong>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          Ce permis a déjà été <strong>validé</strong>{quand}{parQui}.
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          Vous vous apprêtez à en modifier l’<strong>altitude</strong> et/ou l’<strong>emprise</strong>. Votre modification sera
          <strong> enregistrée et tracée</strong>, et le permis devra <strong>ensuite être revalidé</strong>.
        </p>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '.15rem' }}>
          <button type="button" onClick={onConfirmer}
            style={{ ...btnBase, border: '1px solid var(--color-svv-red)', background: 'var(--color-svv-red)', color: '#fff' }}>
            Modifier
          </button>
          <button ref={refAnnuler} type="button" onClick={onAnnuler}
            style={{ ...btnBase, border: '1px solid var(--color-svv-line)', background: 'var(--color-svv-surface)', color: 'var(--color-svv-ink)' }}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
