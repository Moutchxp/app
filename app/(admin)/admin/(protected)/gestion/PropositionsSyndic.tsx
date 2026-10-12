'use client';

import { useEffect, useState } from 'react';
import {
  motDoublonSyndic, TITRE_DOUBLON_SYNDIC, type DoublonSyndic,
} from '../../../../lib/gestion/doublonSyndic';
import type { ImmeubleSaisi } from '../../../../lib/gestion/syndics';
import { nomAvecVille } from '../../../../lib/gestion/syndics';
import { rafraichirImmeubles } from './useImmeublesSyndics';
import { motConfirmationRattachement, type ResumeRattachement } from '../../../../lib/gestion/partageSyndic';

/**
 * ══ 🔴🔴 LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION-PAR-ADRESSE — LES TROIS PROPOSITIONS DE L'ÉCRAN ═══════════════════════
 *
 *   ① `BandeauDoublonSyndic` — dans la fenêtre de création : « Ce syndic existe peut-être déjà : … » (nom, adresse,
 *      e-mail, téléphone), avec « Voir la fiche » et, depuis un bien, « Sélectionner ce syndic pour ce bien ».
 *   ② `EncadreSyndicConnu` — à l'ouverture depuis un bien ou une adresse, AVANT le formulaire : « Un syndic est déjà
 *      connu pour cette adresse : … », « Le rattacher à ce bien » / « Non, créer un autre syndic ».
 *   ③ `BandeauSyndicConnuDuBien` — sur la fiche d'un bien sans syndic : « Syndic connu pour cette adresse : … —
 *      Rattacher / Ignorer » (« Ignorer » est mémorisé pour ce bien).
 *
 * 🔴 RIEN N'EST ÉCRIT SANS UN CLIC : chaque rattachement passe par `/syndics/[id]/rattacher-bien` (la porte unique
 * `enregistrerSyndic`), « Ignorer » par `/biens/[id]/syndic-connu`. Ce lot COMPLÈTE l'existant et ne retire rien.
 */

/** Un syndic déjà connu pour une adresse (route `/syndics/connus` et `/biens/[id]/syndic-connu`). */
export interface SyndicConnuVu {
  syndic: { id: number; nom: string; ville: string | null };
  copro: { cle: string; libelle: string };
  via: Array<'bien' | 'copropriete' | 'parcelle'>;
  biens: Array<{ id: number; numero: string; adresse: string }>;
}

/** « (rattaché au bien lot 219 — 25 rue Edith Cavell) », « (adresse de sa copropriété 25 rue …) », « (même parcelle) ». */
export function motOrigine(s: SyndicConnuVu): string {
  const parts: string[] = [];
  if (s.biens.length > 0) {
    const b = s.biens.slice(0, 3).map((x) => `lot ${x.numero} — ${x.adresse}`).join(', ');
    parts.push(`rattaché au bien ${b}${s.biens.length > 3 ? ` et ${s.biens.length - 3} autre(s)` : ''}`);
  } else if (s.via.includes('copropriete')) parts.push(`adresse de sa copropriété ${s.copro.libelle}`);
  if (s.via.includes('parcelle')) parts.push(`même parcelle cadastrale que ${s.copro.libelle}`);
  return parts.join(' ; ');
}

/**
 * Le rattachement d'un syndic EXISTANT à l'immeuble d'un bien (la fiche ENTIÈRE, par lien). Rend l'erreur, ou le
 * résumé du partage (« Syndic X rattaché — N contacts syndic et M habitants / gardien partagés avec K autres biens »).
 */
export async function rattacherAuBien(syndicId: number, immeuble: ImmeubleSaisi, coproCle: string | null, lotId: number | null = null):
Promise<{ erreur: string | null; resume: ResumeRattachement | null }> {
  try {
    const r = await fetch(`/api/admin/gestion/syndics/${syndicId}/rattacher-bien`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ immeuble, ...(coproCle !== null ? { coproCle } : {}), ...(lotId !== null ? { lotId } : {}) }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; resume?: ResumeRattachement | null };
    if (!r.ok || j.ok !== true) return { erreur: j.erreur ?? 'Rattachement impossible.', resume: null };
    await rafraichirImmeubles();
    return { erreur: null, resume: j.resume ?? null };
  } catch {
    return { erreur: 'Rattachement impossible : le serveur n’a pas répondu.', resume: null };
  }
}

/* ══ LOT FICHE-SYNDIC-UNIQUE-ET-PARTAGEE — LA CONFIRMATION, ET LES CONTACTS DU CABINET À AJOUTER PAR LIEN ═══════════ */

/**
 * « Syndic X rattaché — N contacts syndic et M habitants / gardien partagés avec K autres biens ». Copropriété nouvelle
 * (un AUTRE immeuble du même cabinet) : « Contacts syndic déjà connus chez ce cabinet », un « Ajouter » par personne —
 * la personne EXISTANTE suit aussi cet immeuble, jamais une copie. Les habitants d'un autre immeuble ne sont jamais
 * proposés : le carnet appartient à sa copropriété.
 */
export function ConfirmationRattachement({ resume }: { resume: ResumeRattachement }) {
  const [ajoutes, setAjoutes] = useState<number[]>([]);
  const [envoi, setEnvoi] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const ajouter = async (id: number): Promise<void> => {
    setEnvoi(id); setErreur(null);
    try {
      const r = await fetch(`/api/admin/gestion/syndics/${resume.syndic.id}/affecter-contact`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId: id, copro: resume.copro.cle }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!r.ok || j.ok !== true) { setErreur(j.erreur ?? 'Ajout impossible.'); return; }
      setAjoutes((l) => [...l, id]);
    } catch {
      setErreur('Ajout impossible : le serveur n’a pas répondu.');
    } finally {
      setEnvoi(null);
    }
  };
  const contacts = resume.contactsSyndic + ajoutes.length;
  return (
    <>
    <style>{CSS_PROPOSITIONS_SYNDIC}</style>
    <div className="psy-bandeau psy-bandeau--confirme" role="status">
      <p className="psy-titre">{motConfirmationRattachement({ ...resume, contactsSyndic: contacts })}</p>
      <p className="psy-note">
        {resume.nouvelleCopro
          ? `${resume.copro.libelle} devient une copropriété de ce syndic : les coordonnées du cabinet sont partagées.`
          : `Le bien rejoint la copropriété ${resume.copro.libelle} : il en partage les contacts, le carnet et les adresses.`}
      </p>
      {resume.contactsProposables.length > 0 && (
        <div className="psy-encadre-contacts" role="group" aria-label="Contacts syndic déjà connus chez ce cabinet">
          <p className="psy-sous-titre">Contacts syndic déjà connus chez ce cabinet</p>
          <ul className="psy-liste">
            {resume.contactsProposables.map((c) => (
              <li key={c.id} className="psy-ligne">
                <span className="psy-mot">{c.nom}{c.titre ? <span className="psy-origine"> — {c.titre}</span> : null}</span>
                <span className="psy-actions">
                  {ajoutes.includes(c.id)
                    ? <span className="psy-ajoute">Ajouté à cette copropriété</span>
                    : <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi !== null} onClick={() => void ajouter(c.id)}>Ajouter</button>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {erreur !== null && <p className="psy-erreur" role="alert">{erreur}</p>}
    </div>
    </>
  );
}

/* ══ ① LE BANDEAU DE LA FENÊTRE DE CRÉATION ═══════════════════════════════════════════════════════════════════════ */

export function BandeauDoublonSyndic({ doublons, onVoir, onSelectionner, envoi = false }: {
  doublons: readonly DoublonSyndic[];
  onVoir: (id: number) => void;
  /** Absent : la création n'est pas partie d'un bien (écran « Syndics ») — pas de « Sélectionner ». */
  onSelectionner?: (id: number) => void;
  envoi?: boolean;
}) {
  if (doublons.length === 0) return null;
  return (
    <>
    {/* La feuille HORS du bandeau : son texte ne se mêle pas à celui du bandeau. */}
    <style>{CSS_PROPOSITIONS_SYNDIC}</style>
    <div className="psy-bandeau psy-bandeau--doublon" role="alert" aria-live="polite">
      <p className="psy-titre">{TITRE_DOUBLON_SYNDIC}</p>
      <ul className="psy-liste">
        {doublons.map((d) => (
          <li key={d.syndic.id} className="psy-ligne">
            <span className="psy-mot">{motDoublonSyndic(d)}</span>
            <span className="psy-actions">
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onVoir(d.syndic.id)} disabled={envoi}>
                Voir la fiche
              </button>
              {onSelectionner !== undefined && (
                <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => onSelectionner(d.syndic.id)} disabled={envoi}>
                  Sélectionner ce syndic pour ce bien
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="psy-note">Deux cabinets peuvent partager une adresse ou un standard : « Créer quand même » reste possible au moment de valider.</p>
    </div>
    </>
  );
}

/** Le pied du « Valider » : les doublons à accepter avant de créer quand même. */
export function PiedDoublonSyndic({ doublons, onRevenir, onCreer, envoi = false }: {
  doublons: readonly DoublonSyndic[]; onRevenir: () => void; onCreer: () => void; envoi?: boolean;
}) {
  return (
    <>
    {/* La feuille HORS du bandeau : son texte ne se mêle pas à celui du bandeau. */}
    <style>{CSS_PROPOSITIONS_SYNDIC}</style>
    <div className="fsy-boutons psy-pied" role="group" aria-label="Ce syndic existe peut-être déjà">
      <span className="fsy-question">
        {TITRE_DOUBLON_SYNDIC} {doublons.map((d) => motDoublonSyndic(d)).join(' · ')}. Créer quand même ?
      </span>
      <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRevenir} disabled={envoi}>Revenir</button>
      <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onCreer} disabled={envoi}>Créer quand même</button>
    </div>
    </>
  );
}

/* ══ ② L'ENCADRÉ « UN SYNDIC EST DÉJÀ CONNU POUR CETTE ADRESSE » ══════════════════════════════════════════════════ */

/** Les syndics connus pour l'adresse d'un bien. `null` tant qu'on ne sait pas. */
export function useSyndicsConnus(immeuble: ImmeubleSaisi | null, lotId: number | null, exclure: number | null): SyndicConnuVu[] | null {
  const libelle = immeuble?.libelle.trim() ?? '';
  const cp = immeuble?.codePostal ?? '';
  const commune = immeuble?.commune ?? '';
  const [liste, setListe] = useState<SyndicConnuVu[] | null>(libelle === '' ? [] : null);
  useEffect(() => {
    if (libelle === '') { setListe([]); return undefined; }
    let vivant = true;
    const p = new URLSearchParams({ libelle, cp, commune });
    if (lotId !== null) p.set('lot', String(lotId));
    if (exclure !== null) p.set('exclure', String(exclure));
    void fetch(`/api/admin/gestion/syndics/connus?${p.toString()}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat?: string; syndics?: SyndicConnuVu[] }>)
      .then((j) => { if (vivant) setListe(j.etat === 'ok' && Array.isArray(j.syndics) ? j.syndics : []); })
      .catch(() => { if (vivant) setListe([]); });
    return () => { vivant = false; };
  }, [libelle, cp, commune, lotId, exclure]);
  return liste;
}

export function EncadreSyndicConnu({ syndics, onRattacher, onNon, envoi = false }: {
  syndics: readonly SyndicConnuVu[];
  onRattacher: (s: SyndicConnuVu) => void;
  onNon: () => void;
  envoi?: boolean;
}) {
  if (syndics.length === 0) return null;
  const plusieurs = new Set(syndics.map((s) => s.syndic.id)).size > 1;
  return (
    <>
    {/* La feuille HORS du bandeau : son texte ne se mêle pas à celui du bandeau. */}
    <style>{CSS_PROPOSITIONS_SYNDIC}</style>
    <div className="psy-bandeau psy-bandeau--connu" role="group" aria-label="Un syndic est déjà connu pour cette adresse">
      <p className="psy-titre">
        {plusieurs ? 'Plusieurs syndics sont déjà connus pour cette adresse :' : 'Un syndic est déjà connu pour cette adresse :'}
      </p>
      {/* LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — la MÊME alerte de conflit, quand ils sont plusieurs. */}
      {plusieurs && (
        <p className="psy-conflit">⚠ Conflit possible : {new Set(syndics.map((s) => s.syndic.id)).size} syndics pour une même adresse — à vérifier.</p>
      )}
      <ul className="psy-liste">
        {syndics.map((s) => (
          <li key={`${s.syndic.id}-${s.copro.cle}`} className="psy-ligne">
            <span className="psy-mot"><strong>{nomAvecVille(s.syndic.nom, s.syndic.ville)}</strong> ({motOrigine(s)})</span>
            <span className="psy-actions">
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => onRattacher(s)} disabled={envoi}>
                Le rattacher à ce bien
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="psy-pied-encadre">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onNon} disabled={envoi}>Non, créer un autre syndic</button>
      </div>
    </div>
    </>
  );
}

/* ══ ③ LE BANDEAU DE LA FICHE D'UN BIEN ═════════════════════════════════════════════════════════════════════════════ */

export function BandeauSyndicConnuDuBien({ lotId }: { lotId: number }) {
  const [p, setP] = useState<{ lot: { immeuble: string | null; codePostal: string | null; commune: string | null }; syndics: SyndicConnuVu[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [version, setVersion] = useState(0);
  const [confirme, setConfirme] = useState<ResumeRattachement | null>(null);
  useEffect(() => {
    let vivant = true;
    void fetch(`/api/admin/gestion/biens/${lotId}/syndic-connu`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat?: string; proposition?: typeof p }>)
      .then((j) => { if (vivant) setP(j.etat === 'ok' ? (j.proposition ?? null) : null); })
      .catch(() => { if (vivant) setP(null); });
    return () => { vivant = false; };
  }, [lotId, version]);
  /* LOT FICHE-SYNDIC-UNIQUE-ET-PARTAGEE — après « Rattacher », le message de confirmation reste sous les yeux. */
  if (confirme !== null) return <ConfirmationRattachement resume={confirme} />;
  if (p === null || p.syndics.length === 0) return null;
  const plusieurs = new Set(p.syndics.map((s) => s.syndic.id)).size > 1;
  const rattacher = async (s: SyndicConnuVu): Promise<void> => {
    setEnvoi(true); setErreur(null);
    const r = await rattacherAuBien(s.syndic.id,
      { libelle: p.lot.immeuble ?? '', codePostal: p.lot.codePostal ?? '', commune: p.lot.commune ?? '' }, s.copro.cle, lotId);
    setEnvoi(false);
    if (r.erreur !== null) { setErreur(r.erreur); return; }
    if (r.resume !== null) setConfirme(r.resume);
    setVersion((n) => n + 1);
  };
  const ignorer = async (s: SyndicConnuVu): Promise<void> => {
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(`/api/admin/gestion/biens/${lotId}/syndic-connu`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ syndicId: s.syndic.id }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!r.ok || j.ok !== true) { setErreur(j.erreur ?? 'Enregistrement impossible.'); return; }
      setVersion((n) => n + 1);
    } catch {
      setErreur('Enregistrement impossible : le serveur n’a pas répondu.');
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <>
    {/* La feuille HORS du bandeau : son texte ne se mêle pas à celui du bandeau. */}
    <style>{CSS_PROPOSITIONS_SYNDIC}</style>
    <div className="psy-bandeau psy-bandeau--bien" role="group" aria-label="Syndic connu pour cette adresse">
      {plusieurs && (
        <p className="psy-conflit">⚠ Conflit possible : {new Set(p.syndics.map((s) => s.syndic.id)).size} syndics pour une même adresse — à vérifier.</p>
      )}
      <ul className="psy-liste">
        {p.syndics.map((s) => (
          <li key={`${s.syndic.id}-${s.copro.cle}`} className="psy-ligne">
            <span className="psy-mot">
              Syndic connu pour cette adresse : <strong>{nomAvecVille(s.syndic.nom, s.syndic.ville)}</strong>
              <span className="psy-origine"> ({motOrigine(s)})</span>
            </span>
            <span className="psy-actions">
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => void rattacher(s)} disabled={envoi}>Rattacher</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void ignorer(s)} disabled={envoi}>Ignorer</button>
            </span>
          </li>
        ))}
      </ul>
      {erreur !== null && <p className="psy-erreur" role="alert">{erreur}</p>}
    </div>
    </>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL (piege du depot). Le rose du syndic (--color-svv-syndic-*) pour ce qui parle
   d'un syndic connu, l'ambre de l'avertissement pour un doublon possible : jetons definis dans les DEUX modes. */
export const CSS_PROPOSITIONS_SYNDIC = `
.psy-bandeau{display:flex;flex-direction:column;gap:.45rem;margin:0 0 .7rem;padding:10px 12px;border-radius:10px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink);font-size:.86rem}
.psy-bandeau--doublon{border-color:var(--color-svv-amber);background:var(--color-svv-amber-soft)}
.psy-bandeau--connu,.psy-bandeau--bien{border-color:var(--color-svv-syndic-bord);background:var(--color-svv-syndic-fond)}
.psy-titre{margin:0;font-weight:700}
.psy-bandeau--doublon .psy-titre{color:var(--color-svv-amber)}
.psy-bandeau--connu .psy-titre{color:var(--color-svv-syndic-texte)}
.psy-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.4rem}
.psy-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .6rem}
.psy-mot{flex:1 1 18rem;min-width:0;overflow-wrap:anywhere}
.psy-origine{color:var(--color-svv-muted)}
.psy-actions{display:flex;flex-wrap:wrap;gap:.4rem}
.psy-note{margin:0;font-size:.78rem;color:var(--color-svv-muted)}
.psy-conflit{margin:0;padding:6px 10px;border-radius:8px;border:1px solid var(--color-svv-orange);background:var(--color-svv-orange-soft);color:var(--color-svv-ink)}
.psy-erreur{margin:0;padding:6px 10px;border-radius:8px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber)}
.psy-pied-encadre{display:flex;justify-content:flex-end}
.psy-bandeau--confirme{border-color:var(--color-svv-green);background:var(--color-svv-green-soft)}
.psy-bandeau--confirme .psy-titre{color:var(--color-svv-green-ink)}
.psy-encadre-contacts{display:flex;flex-direction:column;gap:.35rem;padding:8px 10px;border-radius:8px;border:1px solid var(--color-svv-syndic-bord);background:var(--color-svv-surface)}
.psy-sous-titre{margin:0;font-weight:700;font-size:.8rem;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-syndic-texte)}
.psy-ajoute{font-size:.8rem;font-weight:600;color:var(--color-svv-green-ink)}
.psy-pied .fsy-question{font-weight:600}
@media (max-width:640px){.psy-actions{width:100%}.psy-actions .gst-btn{flex:1 1 auto}}
`;
