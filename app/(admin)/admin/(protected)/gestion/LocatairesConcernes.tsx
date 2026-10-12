'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  choixModifie, choixParDefaut, cleConcerne, jourFr, ligneConcernes, optionsDuBien, phraseRattachement, tonConcerne,
  type Concerne, type OccupationVue,
} from '../../../../lib/gestion/locatairesEvenement';

/**
 * ══ 🔴🔴 LOT MARGES-MODALE-ET-LOCATAIRES-DE-L-EVENEMENT — « LOCATAIRE(S) CONCERNÉ(S) : … — MODIFIER » ═══════════════════
 *
 * Sous la phrase de rattachement du formulaire d'événement. « Modifier » ouvre une petite fenêtre à cases :
 *   · LOCATAIRES ACTUELS (vert, comme les puces locataire), avec leur date d'entrée — cochés par défaut ;
 *   · ANCIENS LOCATAIRES (violet, comme les puces ancien locataire) : les deux plus récents, entrée et sortie ;
 *   · « Autre personne… » : l'annuaire (nom, e-mail, téléphone), ou une saisie libre (nom, e-mail ou téléphone
 *     facultatifs) — enregistrée sur l'événement, SANS créer de fiche.
 * Le propriétaire reste toujours rattaché. Sans action, rien ne change : seul un choix MODIFIÉ remonte (`modifie`).
 */

/** Ce que le formulaire garde : le choix, et s'il diffère du choix par défaut (seul un choix modifié s'enregistre). */
export interface ChoixConcernes { choix: Concerne[]; modifie: boolean }

const aujourdhuiParis = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

/** Les occupations des biens (fiche du bien, lecture seule). `null` tant qu'on ne sait pas. */
function useOccupations(bienCles: readonly string[]): OccupationVue[] | null {
  const cle = bienCles.join(',');
  const [occ, setOcc] = useState<OccupationVue[] | null>(null);
  useEffect(() => {
    if (cle === '') { setOcc([]); return undefined; }
    let vivant = true;
    setOcc(null);
    void Promise.all(cle.split(',').map((c) => fetch(`/api/admin/gestion/annuaire?lotCle=${encodeURIComponent(c)}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat?: string; data?: { occupations?: OccupationVue[] } }>)
      .then((j) => (j.etat === 'ok' ? j.data?.occupations ?? [] : []))
      .catch(() => [] as OccupationVue[])))
      .then((l) => { if (vivant) setOcc(l.flat()); });
    return () => { vivant = false; };
  }, [cle]);
  return occ;
}

interface Trouve {
  sujet: 'proprietaire' | 'locataire'; id: number; nomAffiche: string; email: string | null; mobile: string | null;
}

export function LocatairesConcernes({ bienCles, libellesDesBiens, valeur, onChange, initial = null, sansPhrase = false }: {
  bienCles: readonly string[];
  libellesDesBiens: readonly string[];
  /** Le choix courant ; `null` = le choix par défaut, intact. */
  valeur: ChoixConcernes | null;
  onChange: (c: ChoixConcernes | null) => void;
  /** En modification d'un événement : le choix déjà enregistré (sinon le choix par défaut). */
  initial?: Concerne[] | null;
  /** En modification : pas de phrase « Sera rattaché à … » (l'événement l'est déjà). */
  sansPhrase?: boolean;
}) {
  const occupations = useOccupations(bienCles);
  const options = useMemo(() => (occupations === null ? null : optionsDuBien(occupations, aujourdhuiParis())), [occupations]);
  const parDefaut = useMemo(() => (options === null ? null : (initial ?? choixParDefaut(options))), [options, initial]);
  const choix = valeur?.choix ?? parDefaut;
  const vacant = options !== null && options.actuels.length === 0;
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState<Concerne[]>([]);
  const [autre, setAutre] = useState<'ferme' | 'recherche' | 'libre'>('ferme');
  const [q, setQ] = useState('');
  const [trouves, setTrouves] = useState<Trouve[] | null>(null);
  const [libre, setLibre] = useState({ nom: '', email: '', telephone: '' });

  useEffect(() => {
    if (autre !== 'recherche' || q.trim().length < 2) { setTrouves(null); return undefined; }
    let vivant = true;
    const t = setTimeout(() => {
      void fetch(`/api/admin/gestion/annuaire?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' })
        .then((r) => r.json() as Promise<{ etat?: string; data?: { personnes?: Trouve[] } }>)
        .then((j) => { if (vivant) setTrouves((j.data?.personnes ?? []).slice(0, 8)); })
        .catch(() => { if (vivant) setTrouves([]); });
    }, 250);
    return () => { vivant = false; clearTimeout(t); };
  }, [q, autre]);

  if (options === null || choix === null || parDefaut === null) {
    /* Les locataires ne sont pas encore connus : la phrase d'avant, mot pour mot. */
    return sansPhrase ? null : <p className="bev-note">{phraseRattachement(libellesDesBiens, null)}</p>;
  }
  const coche = (c: Concerne): boolean => brouillon.some((x) => cleConcerne(x) === cleConcerne(c));
  const basculer = (c: Concerne): void => setBrouillon(coche(c) ? brouillon.filter((x) => cleConcerne(x) !== cleConcerne(c)) : [...brouillon, c]);
  const autres = brouillon.filter((c) => c.sorte === 'annuaire' || c.sorte === 'libre');
  const ajouter = (c: Concerne): void => {
    if (!coche(c)) setBrouillon([...brouillon, c]);
    setAutre('ferme'); setQ(''); setLibre({ nom: '', email: '', telephone: '' });
  };
  const valider = (): void => {
    onChange({ choix: brouillon, modifie: choixModifie(brouillon, parDefaut) });
    setOuvert(false);
  };
  const ligne = (c: Concerne, detail: string) => (
    <li key={cleConcerne(c)}>
      <label className={`lce-case lce-case--${tonConcerne(c.sorte)}`}>
        <input type="checkbox" checked={coche(c)} onChange={() => basculer(c)} />
        <span className="lce-nom">{c.nom}</span>
        {detail !== '' && <span className="lce-detail">{detail}</span>}
      </label>
    </li>
  );

  return (
    <div className="lce">
      <style>{CSS_LOCATAIRES_CONCERNES}</style>
      {!sansPhrase && <p className="bev-note">{phraseRattachement(libellesDesBiens, choix, vacant)}</p>}
      <p className="lce-ligne">
        <span className="lce-titre">Locataire(s) concerné(s) :</span>{' '}
        {choix.length === 0 ? <span className="lce-vide">{ligneConcernes(choix)}</span>
          : choix.map((c) => <span key={cleConcerne(c)} className={`lce-puce lce-puce--${tonConcerne(c.sorte)}`}>{c.nom}</span>)}
        {' — '}
        <button type="button" className="lce-modifier" aria-expanded={ouvert}
          onClick={() => { setBrouillon(choix); setAutre('ferme'); setOuvert(!ouvert); }}>Modifier</button>
      </p>
      {ouvert && (
        <div className="lce-fenetre" role="group" aria-label="Choisir le ou les locataires concernés">
          <p className="lce-groupe lce-groupe--vert">Locataires actuels</p>
          {options.actuels.length === 0
            ? <p className="lce-vide">Aucun locataire en place (bien vacant).</p>
            : <ul className="lce-liste">{options.actuels.map((c) => ligne(c, c.entree ? `entré le ${jourFr(c.entree)}` : ''))}</ul>}
          <p className="lce-groupe lce-groupe--violet">Anciens locataires</p>
          {options.anciens.length === 0
            ? <p className="lce-vide">Aucun ancien locataire connu.</p>
            : <ul className="lce-liste">{options.anciens.map((c) => ligne(c,
              `${c.entree ? `du ${jourFr(c.entree)} ` : ''}${c.sortie ? `au ${jourFr(c.sortie)}` : ''}`.trim()))}</ul>}
          {autres.length > 0 && (
            <>
              <p className="lce-groupe lce-groupe--gris">Autres personnes</p>
              <ul className="lce-liste">{autres.map((c) => ligne(c, [c.email, c.telephone].filter(Boolean).join(' · ')))}</ul>
            </>
          )}
          {autre === 'ferme' && (
            <button type="button" className="lce-modifier" onClick={() => setAutre('recherche')}>Autre personne…</button>
          )}
          {autre === 'recherche' && (
            <div className="lce-autre">
              <label className="bev-champ">
                <span className="bev-label">Chercher dans l’annuaire (nom, e-mail, téléphone)</span>
                <input className="bev-saisie" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
              </label>
              {trouves !== null && trouves.length > 0 && (
                <ul className="lce-liste">
                  {trouves.map((t) => (
                    <li key={`${t.sujet}-${t.id}`}>
                      <button type="button" className="lce-trouve" onClick={() => ajouter({
                        sorte: 'annuaire', locataireId: null, sujet: t.sujet, sujetId: t.id, nom: t.nomAffiche,
                        email: t.email, telephone: t.mobile, entree: null, sortie: null })}>
                        {t.nomAffiche}{t.email ? ` · ${t.email}` : ''}{t.mobile ? ` · ${t.mobile}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {trouves !== null && trouves.length === 0 && <p className="lce-vide">Personne ne correspond dans l’annuaire.</p>}
              <button type="button" className="lce-modifier" onClick={() => setAutre('libre')}>Saisir librement (sans créer de fiche)</button>
            </div>
          )}
          {autre === 'libre' && (
            <div className="lce-autre">
              <label className="bev-champ"><span className="bev-label">Nom *</span>
                <input className="bev-saisie" value={libre.nom} onChange={(e) => setLibre({ ...libre, nom: e.target.value })} autoFocus /></label>
              <div className="bev-deux">
                <label className="bev-champ"><span className="bev-label">E-mail (facultatif)</span>
                  <input className="bev-saisie" type="email" value={libre.email} onChange={(e) => setLibre({ ...libre, email: e.target.value })} /></label>
                <label className="bev-champ"><span className="bev-label">Téléphone (facultatif)</span>
                  <input className="bev-saisie" type="tel" value={libre.telephone} onChange={(e) => setLibre({ ...libre, telephone: e.target.value })} /></label>
              </div>
              <p className="lce-vide">Enregistrée sur l’événement seulement : aucune fiche n’est créée dans l’annuaire.</p>
              <div className="lce-boutons">
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setAutre('ferme')}>Annuler</button>
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={libre.nom.trim() === ''}
                  onClick={() => ajouter({ sorte: 'libre', locataireId: null, sujet: null, sujetId: null, nom: libre.nom.trim(),
                    email: libre.email.trim() || null, telephone: libre.telephone.trim() || null, entree: null, sortie: null })}>Ajouter</button>
              </div>
            </div>
          )}
          <div className="lce-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setOuvert(false)}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={valider}>Valider le choix</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Les puces des personnes concernées, sur une carte d'événement (vert, violet, gris). */
export function PucesConcernes({ concernes }: { concernes: readonly Concerne[] }) {
  return (
    <>
      <style>{CSS_LOCATAIRES_CONCERNES}</style>
      {concernes.length === 0 ? <span className="lce-vide">aucun</span>
        : concernes.map((c) => (
          <span key={cleConcerne(c)} className={`lce-puce lce-puce--${tonConcerne(c.sorte)}`}
            title={c.sorte === 'ancien_locataire' && c.sortie ? `ancien locataire, sorti le ${jourFr(c.sortie)}`
              : c.sorte === 'locataire' ? 'locataire en place' : 'autre personne'}>{c.nom}</span>
        ))}
    </>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Vert = locataire (--color-svv-green), violet = ancien locataire
   (--color-svv-violet), gris = autre personne : les memes jetons que les puces des parties, dans les DEUX modes. */
export const CSS_LOCATAIRES_CONCERNES = `
.lce{display:flex;flex-direction:column;gap:.35rem;min-width:0}
.lce-ligne{margin:0;font-size:.84rem;display:flex;flex-wrap:wrap;align-items:center;gap:.3rem;min-width:0}
.lce-titre{font-weight:600;color:var(--color-svv-ink)}
.lce-vide{font-size:.82rem;color:var(--color-svv-muted);margin:0}
.lce-modifier{background:none;border:0;padding:0;font:inherit;font-size:.82rem;font-weight:600;color:var(--color-svv-red);
  cursor:pointer;text-decoration:underline;text-underline-offset:2px;align-self:flex-start;min-height:28px}
.lce-modifier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px;border-radius:4px}
.lce-puce{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-size:.8rem;font-weight:600;
  border:1px solid currentColor;overflow-wrap:anywhere}
.lce-puce--vert{color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
.lce-puce--violet{color:var(--color-svv-violet);background:var(--color-svv-violet-soft)}
.lce-puce--gris{color:var(--color-svv-gray);background:var(--color-svv-surface)}
.lce-fenetre{display:flex;flex-direction:column;gap:.4rem;padding:10px 12px;border-radius:10px;min-width:0;box-sizing:border-box;
  border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface-raised);box-shadow:0 4px 14px rgba(0,0,0,.1)}
.lce-groupe{margin:.2rem 0 0;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.lce-groupe--vert{color:var(--color-svv-green-ink)}
.lce-groupe--violet{color:var(--color-svv-violet)}
.lce-groupe--gris{color:var(--color-svv-gray)}
.lce-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.25rem}
.lce-case{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem .5rem;padding:4px 8px;border-radius:8px;cursor:pointer;
  min-height:36px;border-left:4px solid transparent}
.lce-case--vert{border-left-color:var(--color-svv-green);background:var(--color-svv-green-soft)}
.lce-case--vert input{accent-color:var(--color-svv-green)}
.lce-case--violet{border-left-color:var(--color-svv-violet);background:var(--color-svv-violet-soft)}
.lce-case--violet input{accent-color:var(--color-svv-violet)}
.lce-case--gris{border-left-color:var(--color-svv-line-strong);background:var(--color-svv-surface)}
.lce-nom{font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.lce-detail{font-size:.78rem;color:var(--color-svv-muted)}
.lce-autre{display:flex;flex-direction:column;gap:.35rem;padding-top:4px;border-top:1px solid var(--color-svv-line)}
.lce-trouve{background:none;border:1px solid var(--color-svv-line);border-radius:8px;padding:6px 8px;width:100%;text-align:left;
  font:inherit;font-size:.82rem;color:var(--color-svv-ink);cursor:pointer;overflow-wrap:anywhere;box-sizing:border-box}
.lce-trouve:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.lce-boutons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
`;
