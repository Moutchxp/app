'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChampNombre } from './ChampNombre';
import { MENTION_ENVOI_NON_AUTORISE, type MailVingt } from './MailVingtPourcent';
import { brouillonMailSyndic, lignesVersHtml } from '../../../../lib/gestion/mailSyndic';
import { differenceRestitution, donneesRestitutionDeLaLigne, mailRestitutionLocataire, mailRestitutionPartenaire, verifierDifference } from '../../../../lib/location/mailRestitutionVingt';
import type { CleRestitutionVingt } from '../../../../lib/location/mailVingtPourcent';
import { montantEuros, montantFr, origineDite, texteConfirmationRestitution, TITRE_CONFIRMER_RESTITUTION, TITRE_RESTITUTIONS_FAITES, verifierRestitution, type LigneVingtPourcent } from '../../../../lib/location/vingtPourcent';

/**
 * ══ 🔴🔴 LA FENÊTRE « FAIRE RESTITUTION », RETRAVAILLÉE (Arno, 25/11/2026, 22h06) ═══════════════════════════════════════════════════════════════════
 * Elle remplace la précédente SANS RIEN PERDRE de ce qu'elle faisait (date, montant restitué, commentaire, confirmation, journal des locataires et du
 * bien, passage en « Restitutions faites », annulation possible là-bas). Elle ajoute :
 *  a) les MONTANTS : « 20 % retenus » prérempli (montant de la sortie, modifiable), « Montant restitué » prérempli au même montant, la différence
 *     calculée ; une différence exige un « Motif de la différence » ;
 *  b) les LOCATAIRES : une case par locataire sorti, cochée s'il a une adresse ; UN mail par locataire (jamais deux sur le même) ; texte modifiable ;
 *  c) les PARTENAIRES : la liste « Restitution des 20 % » des Paramètres Location, une case chacun, DÉCOCHÉE ; un mail par partenaire ; texte modifiable ;
 *  d) la VALIDATION : « Vous allez valider la restitution de X € et envoyer N mails à : … », puis confirmation. La restitution est enregistrée D'ABORD ;
 *     chaque mail part ensuite par LA porte d'envoi de la Gestion (gestion@, classement verrouillé sur le bien, marque de la sortie : il rejoint les
 *     échanges de la ligne et l'historique du bien) ; un envoi refusé ou en échec n'annule rien, il est dit, avec « Renvoyer ».
 * 🔴🔴 (Arno, 27/11/2026, 22h17) Depuis la Location comme depuis la Gestion, c'est le DROIT D'ENVOI qui décide (7b5715a6). Sans lui : la restitution
 * s'enregistre, les cases sont désactivées, aucun mail ne part, et on le dit (`MENTION_RESTITUTION_SANS_ENVOI`) ; le serveur refuse aussi.
 */
export const MENTION_RESTITUTION_SANS_ENVOI = `${MENTION_ENVOI_NON_AUTORISE} : la restitution s’enregistrera sans mail.`;

const API_LOCATION = '/api/admin/location';
/** 🔴 (Arno, 25/11/2026, 23h42) l'aide sous la note interne de la restitution. */
export const AIDE_NOTE_INTERNE_RESTITUTION = 'Visible uniquement dans le détail de la restitution (catégorie « Restitutions faites ») et dans l’historique du bien.';
const API_ENVOIS = '/api/admin/gestion/envois';
const euros = (n: number): string => n.toFixed(2).replace('.', ',');
const dateFr = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Une clé d'envoi NEUVE à chaque envoi (« Renvoyer » compris) : la porte d'envoi l'exige, et ne rejoue jamais deux fois la même. */
const cleDEnvoi = (sortieId: number, cle: string): string => `vingt-restitution-${sortieId}-${cle}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface MailPrevu { cle: string; libelle: string; a: string; objet: string; texte: string; html: string | null; modele: CleRestitutionVingt }
interface Resultat { cle: string; libelle: string; etat: 'ok' | 'echec'; motif?: string }

/** Le corps d'un mail (texte + HTML) avec la signature du compte ; un texte modifié à la main repart en texte simple. PUR. */
function corpsDuMail(m: MailPrevu, texte: string, signature: { texte?: string | null; html?: string | null }): { corps: string; corpsHtml: string } {
  const b = brouillonMailSyndic({ objet: m.objet, surlignage: null, corps: `${texte}\n\n\n` }, signature);
  if (m.html === null || texte !== m.texte) return { corps: b.corps, corpsHtml: b.corpsHtml };
  const sig = (signature.html ?? '').trim() !== '' ? (signature.html ?? '').trim() : lignesVersHtml((signature.texte ?? '').trim());
  return { corps: b.corps, corpsHtml: `${m.html}${sig}` };
}

export function FenetreRestitutionVingt({ l, aujourdhui, mail, onFermer }: {
  l: LigneVingtPourcent; aujourdhui: string;
  /** le droit d'envoi au nom de gestion@ (absent / `null` : la restitution s'enregistre, aucun mail ne part) — Gestion ET Location */
  mail?: MailVingt | null;
  onFermer: (fait: boolean) => void;
}) {
  const titreId = useId();
  const confirmId = useId();
  const [date, setDate] = useState(aujourdhui);
  const [vingt, setVingt] = useState(l.montantVingt != null ? euros(l.montantVingt.montant) : '');
  const [restitue, setRestitue] = useState<string | null>(null);   // null : = les 20 % (prérempli)
  const restitueTexte = restitue ?? vingt;
  const [motif, setMotif] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [etape, setEtape] = useState<'saisie' | 'confirmer' | 'resultats'>('saisie');
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const enCours = useRef(false);
  const ecrire = mail != null;
  // les partenaires de la liste « Restitution des 20 % » (Paramètres Location), décochés
  const [partenaires, setPartenaires] = useState<{ adresse: string; libelle?: string | null }[] | null>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${API_LOCATION}?partenairesRestitution=1`, { cache: 'no-store' }).then((r) => r.json()).then((d: { etat?: string; data?: { liste?: { adresse: string; libelle?: string | null }[] } }) => {
      if (vivant) setPartenaires(d.etat === 'ok' ? d.data?.liste ?? [] : []);
    }).catch(() => { if (vivant) setPartenaires([]); });
    return () => { vivant = false; };
  }, []);
  const locataires = l.contacts?.locataires ?? [];
  const [locCoches, setLocCoches] = useState<Set<number>>(() => new Set(locataires.flatMap((p, i) => (p.email !== null ? [i] : []))));
  const [partCoches, setPartCoches] = useState<Set<string>>(new Set());
  const [textes, setTextes] = useState<Record<string, string>>({});
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || envoi) return;
      if (etape === 'confirmer') setEtape('saisie'); else onFermer(etape === 'resultats');
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [envoi, onFermer, etape]);

  const vN = montantEuros(vingt);
  const rN = montantEuros(restitueTexte);
  const montantsLus = typeof vN === 'number' && typeof rN === 'number';
  const diff = montantsLus ? differenceRestitution(vN as number, rN as number) : null;
  const donnees = montantsLus ? donneesRestitutionDeLaLigne(l, { montantVingt: vN as number, montantRestitue: rN as number, motif: motif.trim() || null, dateValidation: date }) : null;
  const prevus: MailPrevu[] = donnees === null ? [] : [
    ...locataires.flatMap((p, i) => {
      if (!locCoches.has(i) || p.email === null) return [];
      const m = mailRestitutionLocataire(donnees, donnees.locataires[i]);
      return [{ cle: `loc-${i}`, libelle: `${p.nom} (locataire)`, a: p.email, objet: m.objet, texte: m.texte, html: null, modele: 'restitution_locataire' as const }];
    }),
    ...(partenaires ?? []).flatMap((x) => {
      if (!partCoches.has(x.adresse)) return [];
      const m = mailRestitutionPartenaire(donnees);
      return [{ cle: `par-${x.adresse}`, libelle: `${x.libelle ? `${x.libelle} — ` : ''}${x.adresse} (partenaire)`, a: x.adresse, objet: m.objet, texte: m.texte, html: m.html, modele: 'restitution_partenaire' as const }];
    }),
  ];
  const aEnvoyer = ecrire ? prevus : [];
  const texteDe = (m: MailPrevu): string => textes[m.cle] ?? m.texte;

  const verifier = (): void => {
    const v = verifierRestitution({ date, montantRestitue: restitueTexte, commentaire }, { dateSortie: l.dateSortie, aujourdhui });
    if (!v.ok) { setRefus(v.motif); return; }
    if (typeof vN !== 'number' || vN <= 0) { setRefus('Indiquez le montant des 20 % retenus (en euros).'); return; }
    const d = verifierDifference(vN, v.valeur.montantRestitue, motif);
    if (!d.ok) { setRefus(d.motif); return; }
    if (aEnvoyer.some((m) => texteDe(m).trim() === '')) { setRefus('Un mail coché a un texte vide : complétez-le ou décochez-le.'); return; }
    setRefus(null);
    setEtape('confirmer');
  };
  const envoyerUn = async (m: MailPrevu): Promise<Resultat> => {
    const c = corpsDuMail(m, texteDe(m), { texte: mail?.contexte.signature, html: mail?.contexte.signatureHtml });
    try {
      const r = await fetch(API_ENVOIS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        cleIdempotence: cleDEnvoi(l.sortieId, m.cle),
        voie: 'nouveau', a: [m.a], cc: [], cci: [], objet: m.objet, corps: c.corps, corpsHtml: c.corpsHtml,
        cibles: [{ sorte: 'lot', cle: l.lotCle ?? null, id: l.lotId, libelle: l.logement ?? `Bien ${l.lotId}` }], interne: false, horsGestion: false,
        vingtPourcent: { sortieId: l.sortieId, modele: m.modele } }) });
      const d = await r.json().catch(() => ({})) as { ok?: boolean; erreur?: string };
      return r.ok && d.ok === true ? { cle: m.cle, libelle: m.libelle, etat: 'ok' } : { cle: m.cle, libelle: m.libelle, etat: 'echec', motif: d.erreur ?? `Envoi refusé (${r.status}).` };
    } catch { return { cle: m.cle, libelle: m.libelle, etat: 'echec', motif: 'Envoi impossible : le serveur n’a pas répondu.' }; }
  };
  const confirmer = async (): Promise<void> => {
    if (enCours.current) return;
    enCours.current = true; setEnvoi(true); setRefus(null);
    try {
      const r = await fetch(API_LOCATION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        action: 'restitution-20-faite', sortieId: l.sortieId, date, montantRestitue: restitueTexte, montantVingt: vingt, motifDifference: motif, commentaire }) });
      const d = await r.json().catch(() => ({})) as { etat?: string; motif?: string };
      if (d.etat !== 'ok') { setRefus(d.motif ?? (r.status === 403 ? 'Accès refusé : droit « Location » nécessaire.' : 'Enregistrement impossible.')); setEtape('saisie'); return; }
      // la restitution est enregistrée : chaque mail part ensuite, un par un ; un échec n'annule rien
      const res: Resultat[] = [];
      // aucun mail à envoyer : la fenêtre se ferme et la liste se relit, comme avant
      if (aEnvoyer.length === 0) { onFermer(true); return; }
      for (const m of aEnvoyer) res.push(await envoyerUn(m));
      setResultats(res);
      setEtape('resultats');
    } catch { setRefus('Enregistrement impossible : le serveur n’a pas répondu.'); setEtape('saisie'); }
    finally { setEnvoi(false); enCours.current = false; }
  };
  const renvoyer = async (cle: string): Promise<void> => {
    const m = aEnvoyer.find((x) => x.cle === cle);
    if (m === undefined) return;
    setEnvoi(true);
    const r = await envoyerUn(m);
    setResultats((rs) => rs.map((x) => (x.cle === cle ? r : x)));
    setEnvoi(false);
  };
  const basculerLoc = (i: number): void => setLocCoches((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const basculerPart = (a: string): void => setPartCoches((s) => { const n = new Set(s); if (n.has(a)) n.delete(a); else n.add(a); return n; });
  const noms = locataires.length > 0 ? locataires.map((p) => p.nom) : l.locataires;
  const recap = montantsLus
    ? `Vous allez valider la restitution de ${montantFr(rN as number)}${aEnvoyer.length === 0 ? ' et n’envoyer aucun mail.' : ` et envoyer ${aEnvoyer.length} mail${aEnvoyer.length > 1 ? 's' : ''} à : ${aEnvoyer.map((m) => m.libelle).join(' ; ')}.`}`
    : '';

  return (
    <div className="vgp-voile" data-fenetre-restitution={l.sortieId}>
      <div className="vgp-boite vgp-boite--restitution" role="dialog" aria-modal="true" aria-labelledby={titreId}>
        {/* le titre de la modale ne change pas (décision d'Arno du 24/11/2026, 23h53 : seul le bouton devient « Faire restitution ») */}
        <h2 id={titreId} className="vgp-titre">Restitution faite — {l.locataires.length > 0 ? l.locataires.join(', ') : `Sortie n° ${l.sortieId}`}</h2>
        <p className="vgp-montant-rappel" data-fenetre-montant-vingt>20 % retenus à la sortie : {l.montantVingt != null ? `${montantFr(l.montantVingt.montant)} (${origineDite(l.montantVingt)})` : 'montant des 20 % à saisir'}</p>
        <p className="loc-muet vgp-aide">{l.logement ?? `Bien ${l.lotId}`} — sortie le {dateFr(l.dateSortie)}. Enregistrée, la restitution est journalisée dans le dossier du locataire
          et l’historique du bien, et la ligne quitte la liste (elle reste dans « {TITRE_RESTITUTIONS_FAITES} », où elle peut être annulée).</p>
        {etape !== 'resultats' && <>
          <fieldset className="vgp-bloc-fenetre" data-restitution-montants>
            <legend>Montants</legend>
            {/* 🔴 (Arno, 25/11/2026, 23h42) « Corriger l'intitulé en "Date de validation de la restitution" » */}
            <label className="vgp-champ"><span>Date de validation de la restitution *</span>
              <input type="date" value={date} max={aujourdhui} min={l.dateSortie} onChange={(e) => setDate(e.target.value)} disabled={envoi} data-restitution-date /></label>
            <label className="vgp-champ"><span>20 % retenus (€) *</span>
              <ChampNombre value={vingt} placeholder="ex. 400,00" onChange={(e) => { setVingt(e.target.value); setRefus(null); }} disabled={envoi} data-restitution-vingt /></label>
            <label className="vgp-champ"><span>Montant restitué (€) *</span>
              <ChampNombre value={restitueTexte} placeholder="ex. 370,00" onChange={(e) => { setRestitue(e.target.value); setRefus(null); }} disabled={envoi} data-restitution-montant /></label>
            <p className={`vgp-difference${diff !== null && diff !== 0 ? ' vgp-difference--non-nulle' : ''}`} data-restitution-difference>
              Différence : {diff === null ? '—' : montantFr(diff)}{diff === 0 ? ' — restitution totale' : ''}</p>
            {diff !== null && diff !== 0 && (
              <label className="vgp-champ"><span>Motif de la différence *</span>
                <textarea value={motif} rows={2} placeholder="ex. régularisation de charges défavorable de 30,00 €" onChange={(e) => { setMotif(e.target.value); setRefus(null); }}
                  disabled={envoi} data-restitution-motif /></label>)}
            {/* 🔴 (Arno, 25/11/2026, 23h42) « Si c'est une note qui reste en interne, il faut préciser » : elle n'entre dans AUCUN mail (ni locataire, ni partenaire) ;
                enregistrée avec la restitution, lue dans « Restitutions faites » et au journal du dossier du locataire et du bien */}
            <label className="vgp-champ"><span>Note interne (facultatif) — non envoyée aux tiers</span>
              <textarea value={commentaire} rows={2} onChange={(e) => setCommentaire(e.target.value)} disabled={envoi} aria-describedby={`${titreId}-note`} data-restitution-commentaire /></label>
            <p id={`${titreId}-note`} className="loc-muet vgp-aide" data-restitution-note-aide>{AIDE_NOTE_INTERNE_RESTITUTION}</p>
          </fieldset>
          <fieldset className="vgp-bloc-fenetre" data-restitution-locataires>
            <legend>Locataire{locataires.length > 1 ? 's' : ''} — un mail chacun</legend>
            {locataires.length === 0 && <p className="loc-muet">Aucun locataire avec des coordonnées sur cette sortie.</p>}
            {locataires.map((p, i) => (
              <label key={i} className="vgp-case" data-restitution-locataire={i}>
                <input type="checkbox" checked={locCoches.has(i)} disabled={p.email === null || envoi || !ecrire} onChange={() => basculerLoc(i)} />
                <span>{p.nom}{p.email !== null ? ` — ${p.email}` : ' — aucune adresse : pas de mail'}</span>
              </label>))}
          </fieldset>
          <fieldset className="vgp-bloc-fenetre" data-restitution-partenaires>
            <legend>Partenaires — un mail chacun</legend>
            {partenaires === null && <p className="loc-muet" role="status">Lecture de la liste…</p>}
            {partenaires !== null && partenaires.length === 0 && <p className="loc-muet" data-restitution-sans-partenaire>Aucun partenaire dans la liste « Restitution des 20 % » (Paramètres Location).</p>}
            {(partenaires ?? []).map((x) => (
              <label key={x.adresse} className="vgp-case" data-restitution-partenaire={x.adresse}>
                <input type="checkbox" checked={partCoches.has(x.adresse)} disabled={envoi || !ecrire} onChange={() => basculerPart(x.adresse)} />
                <span>{x.libelle ? `${x.libelle} — ` : ''}{x.adresse}</span>
              </label>))}
          </fieldset>
          {!ecrire && <p className="vgp-orange" role="note" data-restitution-sans-envoi>{MENTION_RESTITUTION_SANS_ENVOI}</p>}
          {aEnvoyer.length > 0 && (
            <div className="vgp-apercus" data-restitution-apercus>
              <p className="vgp-coord-titre">Mails ({aEnvoyer.length}) — texte modifiable avant l’envoi</p>
              {aEnvoyer.map((m) => (
                <details key={m.cle} className="vgp-apercu" data-restitution-apercu={m.cle}>
                  <summary>À {m.a} — {m.objet}</summary>
                  <textarea value={texteDe(m)} rows={14} onChange={(e) => setTextes((t) => ({ ...t, [m.cle]: e.target.value }))} disabled={envoi} data-restitution-texte={m.cle} />
                </details>))}
            </div>)}
          {refus !== null && <p className="cp-refus" role="alert" data-restitution-refus>{refus}</p>}
          <div className="vgp-actions">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onFermer(false)} disabled={envoi} data-restitution-annuler>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={verifier} disabled={envoi || etape === 'confirmer'} data-restitution-enregistrer>Valider la restitution</button>
          </div>
        </>}
        {etape === 'resultats' && (
          <div data-restitution-resultats>
            <p className="vgp-confirmation-ok" role="status">Restitution enregistrée : {montantFr(rN as number)}.</p>
            {resultats.length === 0 ? <p className="loc-muet">Aucun mail envoyé.</p> : resultats.map((x) => (
              <p key={x.cle} className={x.etat === 'ok' ? 'vgp-envoi-ok' : 'cp-refus'} data-restitution-envoi={x.etat}>
                {x.etat === 'ok' ? `✓ Mail envoyé à ${x.libelle}.` : `Échec de l’envoi à ${x.libelle} : ${x.motif ?? 'raison inconnue'}`}
                {x.etat === 'echec' && <> <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { void renvoyer(x.cle); }} disabled={envoi} data-restitution-renvoyer={x.cle}>Renvoyer</button></>}
              </p>))}
            <div className="vgp-actions">
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => onFermer(true)} disabled={envoi} data-restitution-fermer autoFocus>Fermer</button>
            </div>
          </div>)}
      </div>
      {etape === 'confirmer' && (
        <div className="vgp-voile vgp-voile--confirmation" data-confirmation-restitution={l.sortieId}>
          <div className="vgp-boite vgp-boite--confirmation" role="alertdialog" aria-modal="true" aria-labelledby={confirmId}>
            <h2 id={confirmId} className="vgp-titre">{TITRE_CONFIRMER_RESTITUTION}</h2>
            <p className="vgp-aide" data-confirmation-recap>{recap}</p>
            {/* l'attestation d'avant, gardée telle quelle (24/11/2026) */}
            {montantsLus && texteConfirmationRestitution({ noms, date, montantRestitue: rN as number, montantRetenuCharges: null }).map((t, i) => <p key={i} className="vgp-aide" data-confirmation-texte>{t}</p>)}
            {diff !== null && diff !== 0 && <p className="vgp-aide" data-confirmation-difference>{montantFr(diff)} conservés — motif : {motif.trim()}</p>}
            <div className="vgp-actions">
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEtape('saisie')} disabled={envoi} data-confirmation-revenir autoFocus>Revenir</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void confirmer(); }} disabled={envoi} data-confirmation-confirmer>
                {envoi ? 'Enregistrement…' : TITRE_CONFIRMER_RESTITUTION}</button>
            </div>
          </div>
        </div>)}
    </div>
  );
}

export const CSS_FENETRE_RESTITUTION = `
.vgp-boite--restitution{max-height:92vh;overflow:auto}
.vgp-bloc-fenetre{border:1px solid var(--color-svv-line);border-radius:12px;padding:10px 12px;margin:0;display:flex;flex-direction:column;gap:8px;min-width:0}
.vgp-bloc-fenetre legend{font-size:.75rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted);padding:0 4px}
.vgp-case{display:flex;align-items:flex-start;gap:8px;min-height:32px;overflow-wrap:anywhere}
.vgp-case input{width:20px;height:20px;flex:none;margin-top:2px}
.vgp-difference{margin:0;font-weight:700;color:var(--color-svv-ink)}
.vgp-difference--non-nulle{color:var(--color-svv-orange)}
.vgp-apercus{display:flex;flex-direction:column;gap:6px;min-width:0}
.vgp-apercu summary{cursor:pointer;font-weight:700;overflow-wrap:anywhere;min-height:32px}
.vgp-apercu textarea{width:100%;box-sizing:border-box;font:inherit;font-size:.85rem;border:1px solid var(--color-svv-line-strong);border-radius:8px;padding:8px;background:var(--color-svv-field);color:var(--color-svv-ink)}
.vgp-confirmation-ok{margin:0;font-weight:800;color:var(--color-svv-green-ink)}
.vgp-envoi-ok{margin:0;color:var(--color-svv-green-ink)}
`;
