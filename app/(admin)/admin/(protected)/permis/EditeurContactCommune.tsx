'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  corpsPatchContact, corpsAdoptionPrada, noteAuChangementCanal, problemeContactUI,
  editionInitiale, construireFiche, etatRail, messageChargement, messageEnregistrement,
  type EtatEditionContact, type FicheCommune, type BaseCommune,
} from './contactForm';
import { SelecteurCanal, ChampsProtocole, SelecteurEmailType, BoutonOuvrirLien, BlocFicheCommune } from './ContactRendu';

/**
 * Lot B — ÉDITEUR DE CONTACT OUVRABLE PAR COMMUNE (code INSEE). Composant CONTRÔLÉ : `codeInsee` non nul → il charge la
 * fiche via GET /api/admin/permis/contact?code=… (Lot A) et s'affiche ; `null` → il ne rend rien. Le Lot C n'aura qu'à le
 * monter et fixer `codeInsee` (depuis la carte ou le bloc « Hors process ») — aucune refonte.
 *
 * Il S'AJOUTE : l'éditeur PAR PERMIS de l'onglet « Dossiers » (dans PermisVue) reste strictement intact. On RÉUTILISE les
 * mêmes briques (helpers purs de `contactForm`, sous-composants de `ContactRendu`, `BlocFicheCommune`) — d'où le comportement
 * identique (ordre des canaux, présélection téléservice, protocole, note, PRADA).
 *
 * INVARIANTS repris tels quels :
 *  - ÉCRITURE = PATCH /api/admin/permis/contact → ecrireContact UNIQUEMENT (les 13 colonnes via `corpsPatchContact`). Aucun
 *    autre chemin, aucune nouvelle fonction d'écriture.
 *  - ANTI-RECOPIE PRADA : la PRADA reste en LECTURE SEULE (`BlocFicheCommune`) ; `responsableNom` vient de mairie_contact.
 *    Le bouton « Utiliser le courriel de la PRADA » garde ses conditions d'affichage et sa confirmation AVANT → APRÈS.
 *  - NOTE : `editionInitiale` charge la note existante (jamais '') ; un enregistrement qui n'y touche pas la laisse verbatim.
 *  - Aucune coordonnée effacée « par canal » côté client (la conservation est CÔTÉ ROUTE, `champsCoordonnees`).
 *
 * CHAMPS BLOQUANTS : ligne d'état en clair (`etatRail`, rail dérivé via `processDeCanal`) + mention « obligatoire pour ce
 * rail » sur l'e-mail (canal 'email') / l'URL (canal 'formulaire'). Session expirée (401/403) → « reconnectez-vous », jamais
 * une panne. Mobile-first (panneau à largeur bornée, défilement interne) ; aucune animation (prefers-reduced-motion respecté
 * par construction).
 */
const styleChamp: CSSProperties = { padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 };
const styleLabel: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)', display: 'flex', flexDirection: 'column', gap: '.15rem' };
const styleObligatoire: CSSProperties = { fontWeight: 600, color: 'var(--color-svv-ink)' };

export function EditeurContactCommune({ codeInsee, onFerme, onEnregistre }: {
  codeInsee: string | null;
  onFerme: () => void;
  onEnregistre?: () => void;
}) {
  const [edition, setEdition] = useState<EtatEditionContact | null>(null);
  const [fiche, setFiche] = useState<FicheCommune | null>(null);
  const [confPrada, setConfPrada] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [erreurChargement, setErreurChargement] = useState('');

  // FOCUS (Lot C) — à l'ouverture on mémorise le déclencheur (commune de la carte / item « Hors process ») pour LUI RENDRE le focus
  //   à la fermeture (aucun piège de focus). `focusPanneau` (callback ref stable) donne le focus au panneau à son montage → le clavier
  //   entre dans la fiche (Échap, champs) au lieu de rester derrière l'overlay. Refs (aucun setState synchrone en effet).
  const declencheurRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (codeInsee === null || typeof document === 'undefined') return;
    declencheurRef.current = document.activeElement as HTMLElement | null;
    return () => { declencheurRef.current?.focus?.(); };
  }, [codeInsee]);
  const focusPanneau = useCallback((el: HTMLDivElement | null) => { el?.focus?.(); }, []);

  // Chargement de la fiche à l'ouverture (ou au changement de commune). Patron admin : setState DANS l'IIFE async + garde
  // anti-course (jamais de setState synchrone dans le corps de l'effet — règle react-hooks/set-state-in-effect).
  useEffect(() => {
    let annule = false;
    void (async () => {
      if (codeInsee === null) { setEdition(null); setFiche(null); setConfPrada(false); setErreurChargement(''); setChargement(false); return; }
      setChargement(true); setErreurChargement(''); setEdition(null); setFiche(null); setConfPrada(false);
      try {
        const res = await fetch(`/api/admin/permis/contact?code=${encodeURIComponent(codeInsee)}`);
        if (annule) return;
        if (!res.ok) { setErreurChargement(messageChargement(res.status)); return; } // 401/403 → reconnectez-vous
        const base = (await res.json()) as BaseCommune;
        if (annule) return;
        // NOTE chargée depuis la base (jamais '') + PRADA jamais recopiée : garanti par editionInitiale (invariants S21/S25).
        setEdition(editionInitiale(base));
        setFiche(construireFiche(base));
      } catch { if (!annule) setErreurChargement('Chargement du contact impossible.'); }
      finally { if (!annule) setChargement(false); }
    })();
    return () => { annule = true; };
  }, [codeInsee]);

  if (codeInsee === null) return null;

  async function enregistrer(): Promise<void> {
    if (!edition) return;
    // Refus CÔTÉ CLIENT d'un canal incohérent (miroir de mairie_contact_coherence_chk) : message clair, pas d'erreur Postgres brute.
    const probleme = problemeContactUI(edition);
    if (probleme) { setEdition({ ...edition, erreur: `Impossible d’enregistrer : ${probleme}.` }); return; }
    try {
      const res = await fetch('/api/admin/permis/contact', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpsPatchContact(edition)), // les 13 colonnes, note incluse (verbatim si non touchée)
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { erreur?: string };
        setEdition({ ...edition, erreur: messageEnregistrement(res.status, d.erreur) });
        return;
      }
      onEnregistre?.(); // le parent rafraîchit (carte / bloc « Hors process ») — Lot C
      onFerme();
    } catch { setEdition({ ...edition, erreur: 'Enregistrement impossible.' }); }
  }

  // Adoption du courriel PRADA : MÊME route /contact (statut=confirme, email_type=prada, canal→email). Ne touche QUE
  // l'e-mail, la nature et le canal ; la BASU en base est tracée en note. canalBase/adresseBase viennent de la FICHE (base).
  async function adopterPrada(): Promise<void> {
    if (!edition || !fiche) return;
    const courriel = (fiche.pradaCourriel ?? '').trim();
    if (courriel === '') return;
    setConfPrada(false);
    try {
      const res = await fetch('/api/admin/permis/contact', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpsAdoptionPrada(edition, courriel, fiche.canalEnregistre ?? '', fiche.adressePostale ?? '')),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { erreur?: string };
        setEdition({ ...edition, erreur: messageEnregistrement(res.status, d.erreur) });
        return;
      }
      onEnregistre?.();
      onFerme();
    } catch { setEdition({ ...edition, erreur: 'Adoption impossible.' }); }
  }

  const etat = edition ? etatRail(edition.canal, edition.email, edition.urlFormulaire) : null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Éditer le contact de la commune"
      onKeyDown={(e) => { if (e.key === 'Escape') onFerme(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onFerme(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
      <div ref={focusPanneau} tabIndex={-1} className="svv-card" style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.6rem', outline: 'none' }}>
        {chargement && <span role="status" style={{ fontSize: 13 }}>Chargement du contact…</span>}
        {erreurChargement && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            <span role="alert" style={{ color: 'var(--color-svv-red)', fontSize: 13 }}>{erreurChargement}</span>
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem', alignSelf: 'flex-start' }} onClick={onFerme}>Fermer</button>
          </div>
        )}
        {edition && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13 }}>Contact de <strong>{edition.nom}</strong> ({edition.code})</span>
              <button type="button" onClick={onFerme} className="svv-btn svv-btn-outline" style={{ padding: '.2rem .55rem' }} aria-label="Fermer">✕</button>
            </div>
            {/* Ligne d'état — champs bloquants EN TOUTES LETTRES (le texte porte l'info ; la couleur ne fait que renforcer). */}
            {etat && (
              <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: etat.complet ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)' }}>{etat.texte}</p>
            )}
            <SelecteurCanal canal={edition.canal} suggestionTeleservice={edition.suggestionTeleservice}
              onCanal={(c) => setEdition({ ...edition, canal: c, note: noteAuChangementCanal(edition.canal, c, edition.adressePostale, edition.note), erreur: '' })} />
            {edition.canal === 'email' && (
              <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
                <label style={styleLabel}>
                  Adresse e-mail <span style={styleObligatoire}>(obligatoire pour le rail E-mail)</span>
                  <input type="email" value={edition.email} placeholder="urbanisme@ville.fr" aria-label="Adresse e-mail (obligatoire pour le rail E-mail)"
                    onChange={(e) => setEdition({ ...edition, email: e.target.value, erreur: '' })} style={{ ...styleChamp, width: '100%', boxSizing: 'border-box' }} />
                </label>
                <SelecteurEmailType emailType={edition.emailType} onEmailType={(v) => setEdition({ ...edition, emailType: v, erreur: '' })} />
              </div>
            )}
            {edition.canal === 'formulaire' && (
              <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
                <label style={styleLabel}>
                  URL de téléservice <span style={styleObligatoire}>(obligatoire pour le rail Téléservice)</span>
                  <input type="url" value={edition.urlFormulaire} placeholder="https://ville.fr/urbanisme/contact" aria-label="URL de téléservice (obligatoire pour le rail Téléservice)"
                    onChange={(e) => setEdition({ ...edition, urlFormulaire: e.target.value, erreur: '' })} style={{ ...styleChamp, width: '100%', boxSizing: 'border-box' }} />
                </label>
                <BoutonOuvrirLien url={edition.urlFormulaire} />
              </div>
            )}
            {edition.canal === 'courrier' && (
              <input type="text" value={edition.adressePostale} placeholder="Service urbanisme, 1 place de la Mairie, 92000…" aria-label="Adresse postale"
                onChange={(e) => setEdition({ ...edition, adressePostale: e.target.value, erreur: '' })} style={{ ...styleChamp, width: '100%', boxSizing: 'border-box' }} />
            )}
            <ChampsProtocole telephone={edition.telephone} telephoneStandard={edition.telephoneStandard} responsableNom={edition.responsableNom} protocoleVerifieLe={edition.protocoleVerifieLe}
              onTelephone={(v) => setEdition({ ...edition, telephone: v, erreur: '' })}
              onTelephoneStandard={(v) => setEdition({ ...edition, telephoneStandard: v, erreur: '' })}
              onResponsable={(v) => setEdition({ ...edition, responsableNom: v, erreur: '' })} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: 12, color: 'var(--color-svv-muted)' }}>
              Note (traçabilité — ex. adresse conservée en quittant le courrier)
              <input type="text" value={edition.note} placeholder="ex. Ancienne adresse courrier : …"
                onChange={(e) => setEdition({ ...edition, note: e.target.value, erreur: '' })} style={{ ...styleChamp, width: '100%', boxSizing: 'border-box' }} />
            </label>
            {/* Bloc lecture seule « ce que l'on sait de cette commune » — reflet de la BASE, état SÉPARÉ de l'édition (PRADA incluse, jamais recopiée). */}
            {fiche && <BlocFicheCommune fiche={fiche} />}
            {/* Adopter le courriel PRADA : mêmes conditions d'affichage qu'ailleurs (existe, non vide, ≠ destinataire enregistré) + confirmation AVANT → APRÈS. */}
            {fiche && (fiche.pradaCourriel ?? '').trim() !== '' && (fiche.pradaCourriel ?? '').trim() !== (fiche.destinataireActuel ?? '').trim() && (
              confPrada
                ? (
                  <span role="alert" style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                    Remplacer le destinataire actuel <strong>{(fiche.destinataireActuel ?? '').trim() === '' ? 'aucun destinataire' : fiche.destinataireActuel}</strong> par <strong>{fiche.pradaCourriel}</strong> (canal → e-mail, confirmé) ?
                    <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .7rem' }} onClick={() => void adopterPrada()}>Confirmer</button>
                    <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => setConfPrada(false)}>Annuler</button>
                  </span>
                )
                : <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.4rem .8rem', alignSelf: 'flex-start' }} onClick={() => setConfPrada(true)}>Utiliser le courriel de la PRADA comme destinataire</button>
            )}
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.4rem .8rem' }} onClick={() => void enregistrer()}>Enregistrer</button>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.4rem .8rem' }} onClick={onFerme}>Annuler</button>
              {edition.erreur && <span role="alert" style={{ color: 'var(--color-svv-red)', fontSize: 13 }}>{edition.erreur}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
