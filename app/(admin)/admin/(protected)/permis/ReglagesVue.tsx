'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ConfigVeille } from '../../../../lib/sitadel/veilleConfig';
import { ETIQUETTE_PROFIL, type ConfigDemandeur, type ProfilDemandeur } from '../../../../lib/sitadel/demande';
import {
  champsPourProfil, PARAMS_VEILLE, PARAMS_THEME_PREPARATION, PARAMS_THEME_ENVOI, PARAMS_THEME_REPONSES, PARAMS_THEME_ALERTES, PARAMS_THEME_CADA, PARAMS_THEME_TELESERVICE, PARAMS_THEME_RATTACHEMENT,
  PARAMS_SOURCES, PARAMS_MENTIONS, espaceReglage, type ParamVeille, type BornesParColonne, type ErreurReglage,
} from '../../../../lib/sitadel/reglagesVeille';
import { BandeauIdentite, PlageParam, CarteParamVestigial, CarteSection, TITRE_THEME_PREPARATION, TITRE_THEME_REPONSES, TITRE_THEME_ALERTES, TITRE_THEME_CADA, TITRE_THEME_RATTACHEMENT, TITRE_PARAMS_SOURCES, AIDE_PARAMS_SOURCES, TITRE_PARAMS_MENTIONS, AIDE_PARAMS_MENTIONS } from './ReglagesRendu';

// D4-ter (R2) — l'onglet Réglages est découpé en TROIS espaces (onglets internes) : les deux RAILS (envoi e-mail / téléservice,
//   chacun autonome, un réglage « Partagé » y apparaît des deux côtés mais reste UNE valeur en base) + le TRANSVERSE (hors rail).
type EspaceOnglet = 'email' | 'teleservice' | 'transverse';
const TITRE_ESPACE_EMAIL = 'Envoi & relances';
const TITRE_ESPACE_DEPOT = 'Dépôt & suivi';
const TITRE_REGLAGES_HERITES = 'Réglages hérités';

/**
 * Écran « Réglages » de la tuile Permis (chantier S7d / S7e). Édite les DEUX identités de demandeur (Société / Personne
 * physique), chacune avec son bandeau et SES champs (le profil 'personne' n'affiche que nom/adresse/e-mail), et les
 * paramètres : « Paramètres des demandes » et « Source de l'annuaire des mairies ». ⚠️ S33 — le sous-bloc « Classification
 * et affichage des dossiers » a migré vers l'onglet Automatisation (groupe « Mise à jour des dossiers »), voir
 * `ClassificationDossiers` ; il reste édité par la route /reglages. Motif Pilotage : validation server-side, message
 * d'erreur au niveau du champ, refus = zéro écriture. Mobile-first. AUCUN ENVOI.
 */
interface Reglages {
  demandeur: Record<ProfilDemandeur, ConfigDemandeur>;
  profilDefaut: ProfilDemandeur;
  veille: ConfigVeille;
  bornes: BornesParColonne;
  problemesIdentite: Record<ProfilDemandeur, string[]>;
}
type ReponsePatch = ({ ok: true } & Reglages) | { erreurs: ErreurReglage[] };
const PROFILS: ProfilDemandeur[] = ['entreprise', 'personne'];

// R1 — forme de la réponse de /api/admin/permis/relever. Type SEUL, déclaré côté client (jamais importé d'un module serveur :
// on n'importe d'un serveur qu'un `type`, et ici on n'importe même rien — la forme est locale, à l'abri du bundle client).
type CompteursReleve = { messagesLus: number; retenus: number; rattaches: number; enregistrees: number; depotsGed: number; echecsDepot: number };
type ReponseReleve = { resultat: 'ok'; compteurs: CompteursReleve } | { resultat: 'inactif'; message: string } | { resultat: 'erreur'; message: string };

const styleInput: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.4rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14, fontFamily: 'inherit' };
const styleLabel: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' };
const styleAide: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)', lineHeight: 1.4 };
const styleErreur: CSSProperties = { fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ReglagesVue() {
  const [data, setData] = useState<Reglages | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');

  // Brouillons : identité par profil puis par clé ; paramètres par colonne.
  const [idDraft, setIdDraft] = useState<Record<ProfilDemandeur, Record<string, string>>>({ entreprise: {}, personne: {} });
  const [veDraft, setVeDraft] = useState<Record<string, string>>({});
  const [idErreurs, setIdErreurs] = useState<Record<ProfilDemandeur, Record<string, string>>>({ entreprise: {}, personne: {} });
  const [idMsg, setIdMsg] = useState<Record<ProfilDemandeur, string>>({ entreprise: '', personne: '' });
  const [veErreurs, setVeErreurs] = useState<Record<string, string>>({});
  const [veMsg, setVeMsg] = useState<Record<string, string>>({});

  // R1 — relève manuelle de la boîte (ACTION, pas un réglage) : verrou anti-double-clic + résultat affiché en clair.
  const [releveEnCours, setReleveEnCours] = useState(false);
  const [releveMsg, setReleveMsg] = useState<{ ton: 'ok' | 'info' | 'erreur'; texte: string } | null>(null);
  // D4-ter (R2) — onglet actif parmi les trois espaces. Événement utilisateur (clic), jamais un setState d'effet.
  const [espace, setEspace] = useState<EspaceOnglet>('email');
  // D4-ter (R2-fix) — mode d'affichage d'une SURCHARGE (radio « suit le commun » / « remplacer ») indépendant de la valeur du
  //   brouillon, pour laisser choisir « remplacer » avant d'avoir saisi. Vidé à chaque hydratation → re-dérivé de la valeur réelle.
  const [surchargeMode, setSurchargeMode] = useState<Record<string, 'suit' | 'propre'>>({});

  function hydrater(r: Reglages) {
    setData(r);
    const id: Record<ProfilDemandeur, Record<string, string>> = { entreprise: {}, personne: {} };
    for (const p of PROFILS) for (const c of champsPourProfil(p)) id[p][c.cle] = String(r.demandeur[p][c.cle] ?? '');
    setIdDraft(id);
    setVeDraft(Object.fromEntries(PARAMS_VEILLE.map((param) => [param.colonne, String(r.veille[param.cle] ?? '')])));
    setSurchargeMode({}); // R2-fix : re-dériver le mode de chaque surcharge depuis la valeur fraîche
  }

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/reglages', { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); return; }
        hydrater((await res.json()) as Reglages);
        setEtat('ok');
      } catch { if (!annule) setEtat('erreur'); }
    })();
    return () => { annule = true; };
  }, []);

  async function enregistrerIdentite(profil: ProfilDemandeur) {
    setIdMsg((m) => ({ ...m, [profil]: '' })); setIdErreurs((m) => ({ ...m, [profil]: {} }));
    const demandeur = Object.fromEntries(champsPourProfil(profil).map((c) => [c.cle, idDraft[profil][c.cle] ?? '']));
    const res = await fetch('/api/admin/permis/reglages', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profil, demandeur }),
    });
    const rep = (await res.json()) as ReponsePatch;
    if (res.ok && 'ok' in rep) { hydrater(rep); setIdMsg((m) => ({ ...m, [profil]: 'Identité enregistrée.' })); return; }
    const erreurs = 'erreurs' in rep ? rep.erreurs : [{ colonne: '', message: 'écriture refusée' }];
    setIdErreurs((m) => ({ ...m, [profil]: Object.fromEntries(erreurs.filter((e) => e.colonne).map((e) => [e.colonne, e.message])) }));
    const globales = erreurs.filter((e) => !e.colonne).map((e) => e.message);
    setIdMsg((m) => ({ ...m, [profil]: `Aucune modification : ${(globales.length ? globales : erreurs.map((e) => e.message)).join(' ; ')}.` }));
  }

  async function patchVeille(colonne: string, valeur: number | string | boolean | null, msgOk: string) {
    const res = await fetch('/api/admin/permis/reglages', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ veille: { [colonne]: valeur } }),
    });
    const rep = (await res.json()) as ReponsePatch;
    if (res.ok && 'ok' in rep) { hydrater(rep); setVeMsg((m) => ({ ...m, [colonne]: msgOk })); return; }
    const erreurs = 'erreurs' in rep ? rep.erreurs : [{ colonne, message: 'écriture refusée' }];
    const e = erreurs.find((x) => x.colonne === colonne) ?? erreurs[0];
    setVeErreurs((m) => ({ ...m, [colonne]: e?.message ?? 'écriture refusée' }));
  }

  async function enregistrerParam(colonne: string, type: 'entier' | 'texte' | 'enum' | 'url' | 'email' | 'booleen' | 'texte_libre') {
    setVeMsg((m) => ({ ...m, [colonne]: '' })); setVeErreurs((m) => ({ ...m, [colonne]: '' }));
    const brut = veDraft[colonne] ?? '';
    const param = PARAMS_VEILLE.find((p) => p.colonne === colonne);
    // D4-bis — SURCHARGE NULLABLE : sur un réglage « par process » (surchargeDe), un champ VIDÉ = « suivre le réglage commun »
    //   → on écrit NULL. C'est une valeur VALIDE (pas une erreur « valeur requise »), et byte-identique tant que rien n'est posé.
    if (param?.surchargeDe && brut.trim() === '') { await patchVeille(colonne, null, 'Suit le réglage commun.'); return; }
    if ((type === 'entier' || type === 'url') && brut.trim() === '') { setVeErreurs((m) => ({ ...m, [colonne]: 'Valeur requise.' })); return; }
    await patchVeille(colonne, type === 'entier' ? Number(brut) : brut, 'Enregistré.');
  }

  /** S40 — interrupteur d'une mention (booléen) : PATCH immédiat, sans bouton « Enregistrer ». */
  async function basculerBooleen(colonne: string, actif: boolean) {
    setVeMsg((m) => ({ ...m, [colonne]: '' })); setVeErreurs((m) => ({ ...m, [colonne]: '' }));
    await patchVeille(colonne, actif, actif ? 'Activé.' : 'Désactivé.');
  }

  /**
   * R1 — lance la relève de la boîte. Verrou `releveEnCours` = pas de double-clic (donc pas de double relève). Le résultat
   * (compteurs) est affiché en clair, succès comme échec — jamais un silence. Ce bouton NE DÉCLENCHE AUCUN ENVOI (la route
   * n'appelle que la relève : lecture de la boîte + classement des réponses).
   */
  async function releverBoiteMaintenant() {
    if (releveEnCours) return;
    setReleveEnCours(true);
    setReleveMsg(null);
    try {
      const res = await fetch('/api/admin/permis/relever', { method: 'POST' });
      const rep = (await res.json()) as ReponseReleve;
      if (rep.resultat === 'ok') {
        const c = rep.compteurs;
        const suffixe = c.echecsDepot > 0 ? ` — ${c.echecsDepot} pièce(s) non versée(s) (voir les archives).` : '.';
        setReleveMsg({ ton: 'ok', texte: `Relève terminée : ${c.messagesLus} message(s) lu(s), ${c.rattaches} rattaché(s), ${c.enregistrees} enregistré(s), ${c.depotsGed} pièce(s) versée(s) en GED${suffixe}` });
      } else if (rep.resultat === 'inactif') {
        setReleveMsg({ ton: 'info', texte: rep.message });
      } else {
        setReleveMsg({ ton: 'erreur', texte: rep.message ?? 'La relève a échoué.' });
      }
    } catch {
      setReleveMsg({ ton: 'erreur', texte: 'Relève impossible : le serveur n’a pas répondu.' });
    } finally {
      setReleveEnCours(false);
    }
  }

  if (etat === 'chargement') return <p style={styleAide} aria-live="polite">Chargement des réglages…</p>;
  if (etat === 'erreur' || !data) return <p role="alert" style={styleErreur}>Réglages indisponibles.</p>;

  // Carte d'UN paramètre (S13) — rendu identique à avant, factorisé pour alimenter les deux sous-blocs sans duplication.
  const bornes = data.bornes;
  // D4 — badge de RAIL : un réglage « e-mail seulement » / « téléservice seulement » le DIT à l'écran (sinon on recrée la
  //   confusion des deux process mélangés). Absent = commun aux deux → aucun badge. La couleur ne porte pas l'info (texte).
  const badgeRail = (p: ParamVeille) => p.rail ? (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '.05rem .4rem', borderRadius: '.35rem', border: '1px solid var(--color-svv-line)', color: 'var(--color-svv-muted)', whiteSpace: 'nowrap' }}>
      {p.rail === 'email' ? 'E-mail seulement' : 'Téléservice seulement'}
    </span>
  ) : null;
  // D4-ter (R2) — badge « Partagé » : ce réglage apparaît DANS LES DEUX onglets de rail mais reste UNE seule valeur en base.
  const badgePartage = (p: ParamVeille) => p.partage ? (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '.05rem .4rem', borderRadius: '.35rem', background: 'var(--color-svv-field)', border: '1px solid var(--color-svv-line)', color: 'var(--color-svv-ink)', whiteSpace: 'nowrap' }}>
      Partagé
    </span>
  ) : null;
  // La phrase qui DIT qu'un partagé agit sur les deux process (sinon l'internaute croit régler un seul rail — cf. constat porteur).
  const notePartage = (p: ParamVeille) => p.partage ? (
    <span role="note" style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--color-svv-muted)' }}>
      Commun aux deux process : le modifier ici agit AUSSI sur l’autre (une seule valeur enregistrée).
    </span>
  ) : null;
  // D4-bis — sur un réglage « par process » (surchargeDe) laissé vide, on affiche la valeur COMMUNE effectivement héritée,
  //   pour que le porteur voie ce que « suivre le commun » vaut concrètement sans aller lire l'autre carte. Réglage normal → pas de placeholder.
  const placeholderSurcharge = (p: ParamVeille): string | undefined => {
    if (!p.surchargeDe) return undefined;
    const commun = PARAMS_VEILLE.find((x) => x.colonne === p.surchargeDe);
    const val = commun ? data.veille[commun.cle] : undefined;
    return val == null ? 'Suit le réglage commun' : `Commun : ${val}`;
  };
  const libelleAvecRail = (p: ParamVeille) => (
    <span style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={styleLabel}>{p.libelle}</span>{badgeRail(p)}{badgePartage(p)}
    </span>
  );

  // `extra` (R2-fix) : contenu additionnel rendu sous l'aide (ex. note « différenciation à venir » du profil). Appeler
  //   TOUJOURS via `(p) => carteParam(p, …)` — jamais en `.map(carteParam)` nu, sinon l'index du map arriverait comme `extra`.
  const carteParam = (p: ParamVeille, extra?: ReactNode) => {
    const b = bornes[p.colonne];
    // Q1 — paramètre VESTIGIAL : lecture seule (pas d'input éditable, pas de bouton « Enregistrer »). La valeur affichée est
    // la valeur RÉELLE en base (pas le brouillon). L'API refuse aussi toute écriture (validerReglages).
    if (p.vestigial) return <CarteParamVestigial key={p.colonne} param={p} valeur={String(data.veille[p.cle] ?? '')} />;
    // S40 — interrupteur (booléen) : rendu à part (case à cocher, appliqué immédiatement, sans bouton « Enregistrer »).
    if (p.type === 'booleen') {
      const actif = Boolean(data.veille[p.cle]);
      return (
        <article key={p.colonne} className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="checkbox" checked={actif} onChange={(e) => void basculerBooleen(p.colonne, e.target.checked)} aria-label={p.libelle} />
            <span style={styleLabel}>{p.libelle}</span>{badgeRail(p)}{badgePartage(p)}
          </label>
          <span style={styleAide}>{p.aide}</span>
          {notePartage(p)}
          {extra}
          {veMsg[p.colonne] && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{veMsg[p.colonne]}</span>}
          {veErreurs[p.colonne] && <span role="alert" style={styleErreur}>{veErreurs[p.colonne]}</span>}
        </article>
      );
    }
    return (
      <article key={p.colonne} className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
        {libelleAvecRail(p)}
        <span style={styleAide}>{p.aide}</span>
        {notePartage(p)}
        {extra}
        <label className="flex flex-col gap-1" style={{ marginTop: '.2rem' }}>
          {p.type === 'enum'
            ? <select value={veDraft[p.colonne] ?? ''} onChange={(e) => setVeDraft((d) => ({ ...d, [p.colonne]: e.target.value }))} style={styleInput} aria-label={p.libelle}>
                {(p.optionsEnum ?? []).map((o) => <option key={o} value={o}>{p.optionsEnumLabels?.[o] ?? (o === 'entreprise' || o === 'personne' ? ETIQUETTE_PROFIL[o] : o)}</option>)}
              </select>
            : p.type === 'entier'
              ? <input type="number" value={veDraft[p.colonne] ?? ''} min={b?.min} max={b?.max} step={1}
                  // D4-bis — surcharge NULLABLE : le placeholder RÉVÈLE la valeur commune héritée quand le champ est vide (= « suit le commun »).
                  placeholder={placeholderSurcharge(p)}
                  onChange={(e) => setVeDraft((d) => ({ ...d, [p.colonne]: e.target.value }))} style={styleInput} aria-label={p.libelle} />
              : p.type === 'url'
                ? <input type="url" inputMode="url" placeholder="https://…" value={veDraft[p.colonne] ?? ''}
                    onChange={(e) => setVeDraft((d) => ({ ...d, [p.colonne]: e.target.value }))} style={styleInput} aria-label={p.libelle} />
                : p.type === 'email'
                  ? <input type="email" inputMode="email" placeholder="demandes@exemple.fr" value={veDraft[p.colonne] ?? ''}
                      onChange={(e) => setVeDraft((d) => ({ ...d, [p.colonne]: e.target.value }))} style={styleInput} aria-label={p.libelle} />
                  : p.type === 'texte_libre'
                    ? <textarea value={veDraft[p.colonne] ?? ''} rows={2} onChange={(e) => setVeDraft((d) => ({ ...d, [p.colonne]: e.target.value }))} style={styleInput} aria-label={p.libelle} />
                    : <input value={veDraft[p.colonne] ?? ''} onChange={(e) => setVeDraft((d) => ({ ...d, [p.colonne]: e.target.value }))} style={styleInput} aria-label={p.libelle} />}
          <PlageParam param={p} bornes={b} />
        </label>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void enregistrerParam(p.colonne, p.type)}>Enregistrer</button>
          {veMsg[p.colonne] && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{veMsg[p.colonne]}</span>}
        </div>
        {veErreurs[p.colonne] && <span role="alert" style={styleErreur}>{veErreurs[p.colonne]}</span>}
      </article>
    );
  };

  // D4-ter (R2-fix) — carte d'un partagé QUI A UNE SURCHARGE téléservice (dossiers, permis) : UNE seule carte (fini les cartes
  //   sœurs qui se lisaient comme un doublon). En haut la valeur COMMUNE (même colonne/route que l'onglet e-mail) ; en dessous,
  //   subordonné par un liseré, le bloc « exception téléservice » = deux choix radio (Suivre le commun (X) / Remplacer pour le
  //   téléservice : [ ]). Radio « Suivre » ⇒ champ vidé ⇒ NULL en base. Le libellé ne répète JAMAIS « … (téléservice) ».
  const carteSurchargeable = (base: ParamVeille, sur: ParamVeille) => {
    const bb = bornes[base.colonne];
    const sb = bornes[sur.colonne];
    const communVal = data.veille[base.cle]; // valeur commune RÉELLE, pour l'afficher entre parenthèses (« Suivre le commun (5) »)
    const valSur = veDraft[sur.colonne] ?? '';
    const mode = surchargeMode[sur.colonne] ?? (valSur.trim() === '' ? 'suit' : 'propre'); // par défaut : NULL → « suit », valeur → « propre »
    const choisirSuit = () => { setSurchargeMode((m) => ({ ...m, [sur.colonne]: 'suit' })); setVeDraft((d) => ({ ...d, [sur.colonne]: '' })); };
    return (
      <article key={base.colonne} className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
        {libelleAvecRail(base)}
        <span style={styleAide}>{base.aide}</span>
        {notePartage(base)}
        <label className="flex flex-col gap-1" style={{ marginTop: '.2rem' }}>
          <input type="number" value={veDraft[base.colonne] ?? ''} min={bb?.min} max={bb?.max} step={1}
            onChange={(e) => setVeDraft((d) => ({ ...d, [base.colonne]: e.target.value }))} style={styleInput} aria-label={base.libelle} />
          <PlageParam param={base} bornes={bb} />
        </label>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void enregistrerParam(base.colonne, base.type)}>Enregistrer</button>
          {veMsg[base.colonne] && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{veMsg[base.colonne]}</span>}
        </div>
        {veErreurs[base.colonne] && <span role="alert" style={styleErreur}>{veErreurs[base.colonne]}</span>}
        {/* Bloc EXCEPTION — subordonné visuellement (liseré gauche + retrait). N'existe QUE pour le téléservice. */}
        <div style={{ borderLeft: '3px solid var(--color-svv-red)', paddingLeft: '.6rem', marginTop: '.5rem', display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--color-svv-muted)' }}>Exception téléservice</span>
          <label style={{ display: 'flex', gap: '.4rem', alignItems: 'baseline' }}>
            <input type="radio" name={`sur-${sur.colonne}`} checked={mode === 'suit'} onChange={choisirSuit} />
            <span style={styleAide}>Suivre le commun{communVal != null ? ` (${communVal})` : ''}</span>
          </label>
          <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="radio" name={`sur-${sur.colonne}`} checked={mode === 'propre'} onChange={() => setSurchargeMode((m) => ({ ...m, [sur.colonne]: 'propre' }))} />
            <span style={styleAide}>Remplacer pour le téléservice :</span>
            <input type="number" value={valSur} min={sb?.min} max={sb?.max} step={1} disabled={mode !== 'propre'}
              onChange={(e) => setVeDraft((d) => ({ ...d, [sur.colonne]: e.target.value }))}
              style={{ ...styleInput, width: '6rem', opacity: mode === 'propre' ? 1 : 0.5 }} aria-label={`${base.libelle} — valeur propre au téléservice`} />
            {sur.unite ? <span style={styleAide}>{sur.unite}</span> : null}
          </label>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void enregistrerParam(sur.colonne, sur.type)}>Enregistrer l’exception</button>
            {veMsg[sur.colonne] && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{veMsg[sur.colonne]}</span>}
          </div>
          <PlageParam param={sur} bornes={sb} />
          {veErreurs[sur.colonne] && <span role="alert" style={styleErreur}>{veErreurs[sur.colonne]}</span>}
        </div>
      </article>
    );
  };
  // D4-ter (Partie 3) — en attendant le lot P, le profil n'est pas encore surchargeable par rail : on le DIT, sans le masquer.
  const noteFuturProfil = (
    <span role="note" style={{ fontSize: 11, color: 'var(--color-svv-muted)', display: 'flex', gap: '.3rem' }}>
      <span aria-hidden="true">ℹ️</span>
      <span>Différenciation par rail à venir (lot P) : le téléservice pourra imposer « personne physique » (FranceConnect).</span>
    </span>
  );

  // ── D4-ter (R2) — répartition des cartes par onglet, dérivée du MODÈLE DE RAIL (R1). Une valeur partagée = le MÊME `carteParam`
  //   rendu dans deux onglets (même route, même brouillon `veDraft`) → jamais deux vérités. ────────────────────────────────────
  const grille: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.6rem' };
  const prepPartages = PARAMS_THEME_PREPARATION.filter((p) => p.partage);                        // 7 partagés (préparation)
  const envoiEmail = PARAMS_THEME_ENVOI.filter((p) => espaceReglage(p) === 'email');             // 8 e-mail seul (caps, relance auto, heures, 3 délais)
  const teleAlertes = PARAMS_THEME_TELESERVICE.filter((p) => !p.surchargeDe);                     // 2 alertes « préparée non déposée »
  const surchargePour = (colonne: string) => PARAMS_THEME_TELESERVICE.find((s) => s.surchargeDe === colonne);
  const adresseReponse = PARAMS_THEME_ENVOI.filter((p) => p.colonne === 'adresse_reponse');       // transverse : imprimée au corps + boîte relevée
  const herites = [
    ...PARAMS_THEME_PREPARATION.filter((p) => p.vestigial),                                       // « Demandes par commune et par mois » (remplacé)
    ...PARAMS_THEME_ENVOI.filter((p) => p.colonne === 'relance_jours_avant_echeance'),            // ancien délai unique (remplacé par la cascade)
  ];
  const onglets: { id: EspaceOnglet; libelle: string; aide: string }[] = [
    { id: 'email', libelle: '✉️ Envoi e-mail auto', aide: 'Le process AUTOMATIQUE d’envoi par e-mail aux mairies. Les réglages « Partagé » sont communs au téléservice — une seule valeur enregistrée.' },
    { id: 'teleservice', libelle: '📮 Téléservice', aide: 'Le process SEMI-MANUEL (dépôt sur le téléservice de la commune). Les « Partagé » sont communs à l’e-mail ; une surcharge, collée sous sa base, ne vaut QUE pour le téléservice.' },
    { id: 'transverse', libelle: '⚙️ Transverse', aide: 'Réglages communs aux deux process (ni e-mail seul, ni téléservice seul) : identités, réponses, alertes, CADA, rattachement, courrier, annuaire.' },
  ];
  const styleOnglet = (actif: boolean): CSSProperties => ({
    padding: '.4rem .8rem', borderRadius: '.5rem', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    border: '1px solid var(--color-svv-line)', whiteSpace: 'nowrap',
    background: actif ? 'var(--color-svv-ink)' : '#fff', color: actif ? '#fff' : 'var(--color-svv-ink)',
  });

  return (
    <div className="flex flex-col gap-4">
      {/* ── Onglets internes (R2) : trois espaces, un seul visible. tablist accessible ; cibles tactiles ≥ 40px (mobile-first). ── */}
      <div role="tablist" aria-label="Espaces de réglages" style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {onglets.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={espace === o.id} id={`onglet-${o.id}`}
            aria-controls={`panneau-${o.id}`} onClick={() => setEspace(o.id)} style={styleOnglet(espace === o.id)}>
            {o.libelle}
          </button>
        ))}
      </div>
      <p style={styleAide} aria-live="polite">{onglets.find((o) => o.id === espace)!.aide} Chaque réglage est appliqué immédiatement ; les plages proviennent des contraintes de la base.</p>

      {/* ── Onglet ENVOI E-MAIL : préparation (partagés) + envoi & relances (e-mail seul) ── */}
      {espace === 'email' && (
        <div role="tabpanel" id="panneau-email" aria-labelledby="onglet-email" className="flex flex-col gap-4">
          <CarteSection titre={TITRE_THEME_PREPARATION} icone="🗂">
            <div style={grille}>{prepPartages.map((p) => carteParam(p))}</div>
          </CarteSection>
          <CarteSection titre={TITRE_ESPACE_EMAIL} icone="✉️">
            <div style={grille}>{envoiEmail.map((p) => carteParam(p))}</div>
          </CarteSection>
        </div>
      )}

      {/* ── Onglet TÉLÉSERVICE : préparation (partagés + surcharges collées) + dépôt & suivi (téléservice seul) ── */}
      {espace === 'teleservice' && (
        <div role="tabpanel" id="panneau-teleservice" aria-labelledby="onglet-teleservice" className="flex flex-col gap-4">
          <CarteSection titre={TITRE_THEME_PREPARATION} icone="🗂">
            {/* R2-fix : un partagé AVEC surcharge → carte fusionnée (base + exception radio) ; profil → note « à venir P » ; sinon carte simple. */}
            <div style={grille}>{prepPartages.map((p) => {
              const s = surchargePour(p.colonne);
              if (s) return carteSurchargeable(p, s);
              if (p.colonne === 'profil_demandeur_defaut') return carteParam(p, noteFuturProfil);
              return carteParam(p);
            })}</div>
          </CarteSection>
          <CarteSection titre={TITRE_ESPACE_DEPOT} icone="📮">
            <div style={grille}>{teleAlertes.map((p) => carteParam(p))}</div>
          </CarteSection>
        </div>
      )}

      {/* ── Onglet TRANSVERSE : identités + réponses (avec adresse de réponse + relève) + alertes + CADA + rattachement + courrier + annuaire + hérités ── */}
      {espace === 'transverse' && (
        <div role="tabpanel" id="panneau-transverse" aria-labelledby="onglet-transverse" className="flex flex-col gap-4">
          <CarteSection titre="Identités du demandeur" icone="👤">
            <p style={styleAide}>Deux profils pour exercer le droit d’accès : « Société » (identité complète) ou « Personne physique » (nom, adresse, e-mail — sans exposer la société). Chaque demande porte l’un des deux ; l’identité correspondante doit être complète pour passer « prête ». C’est cette identité qui fournit le Reply-To réel de l’e-mail (par profil).</p>
            {PROFILS.map((profil) => {
              const complet = data.problemesIdentite[profil].length === 0;
              return (
                <details key={profil} open={!complet} style={{ border: '1px solid var(--color-svv-line)', borderRadius: '.6rem', background: 'var(--color-svv-field)' }}>
                  <summary style={{ cursor: 'pointer', padding: '.6rem .8rem', fontWeight: 700, display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                    {ETIQUETTE_PROFIL[profil]}
                    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: complet ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)' }}>
                      {complet ? '● complète' : '● incomplète'}
                    </span>
                  </summary>
                  <div className="flex flex-col gap-3" style={{ padding: '.2rem .8rem .8rem' }}>
                    <BandeauIdentite problemes={data.problemesIdentite[profil]} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.75rem' }}>
                      {champsPourProfil(profil).map((c) => (
                        <label key={c.cle} className="flex flex-col gap-1" style={{ minWidth: 0 }}>
                          <span style={styleLabel}>{cap(c.libelle)}{c.cle === 'telephone' ? ' (facultatif)' : ''}</span>
                          {c.multiligne
                            ? <textarea value={idDraft[profil][c.cle] ?? ''} onChange={(e) => setIdDraft((d) => ({ ...d, [profil]: { ...d[profil], [c.cle]: e.target.value } }))} rows={2} style={styleInput} />
                            : <input value={idDraft[profil][c.cle] ?? ''} onChange={(e) => setIdDraft((d) => ({ ...d, [profil]: { ...d[profil], [c.cle]: e.target.value } }))} style={styleInput} />}
                          <span style={styleAide}>{c.aide}</span>
                          {idErreurs[profil][c.colonne] && <span role="alert" style={styleErreur}>{idErreurs[profil][c.colonne]}</span>}
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.4rem .9rem' }} onClick={() => void enregistrerIdentite(profil)}>Enregistrer {ETIQUETTE_PROFIL[profil].toLowerCase()}</button>
                      {idMsg[profil] && <span role="status" style={{ fontSize: 13 }}>{idMsg[profil]}</span>}
                    </div>
                  </div>
                </details>
              );
            })}
          </CarteSection>

          <CarteSection titre={TITRE_THEME_REPONSES} icone="📥">
            {/* ACTION « Relever la boîte maintenant » — là où l'on attend les retours de mairie. Aucun envoi. */}
            <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
              <span style={styleLabel}>Relève de la boîte</span>
              <span style={styleAide}>
                Lit la boîte e-mail et classe les réponses reçues des mairies (rattachement aux demandes, versement des pièces
                en GED). <strong>Aucun e-mail n’est envoyé</strong> : ce bouton relève seulement — il ne relance rien et ne
                saisit jamais la CADA.
              </span>
              <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.45rem 1rem' }}
                  onClick={() => void releverBoiteMaintenant()} disabled={releveEnCours} aria-busy={releveEnCours}>
                  {releveEnCours ? 'Relève en cours…' : 'Relever la boîte maintenant'}
                </button>
              </div>
              {releveMsg && (
                <span role={releveMsg.ton === 'erreur' ? 'alert' : 'status'} aria-live="polite"
                  style={{ fontSize: 13, fontWeight: 600, color: releveMsg.ton === 'ok' ? 'var(--color-svv-green-ink)' : releveMsg.ton === 'erreur' ? 'var(--color-svv-red)' : 'var(--color-svv-ink)' }}>
                  {releveMsg.texte}
                </span>
              )}
            </div>
            <div style={grille}>{[...adresseReponse, ...PARAMS_THEME_REPONSES].map((p) => carteParam(p))}</div>
          </CarteSection>

          <CarteSection titre={TITRE_THEME_ALERTES} icone="🔔"><div style={grille}>{PARAMS_THEME_ALERTES.map((p) => carteParam(p))}</div></CarteSection>
          <CarteSection titre={TITRE_THEME_CADA} icone="⚖️"><div style={grille}>{PARAMS_THEME_CADA.map((p) => carteParam(p))}</div></CarteSection>
          <CarteSection titre={TITRE_THEME_RATTACHEMENT} icone="🏗"><div style={grille}>{PARAMS_THEME_RATTACHEMENT.map((p) => carteParam(p))}</div></CarteSection>

          <CarteSection titre={TITRE_PARAMS_MENTIONS} icone="✍️">
            <p style={styleAide}>{AIDE_PARAMS_MENTIONS}</p>
            <div style={grille}>{PARAMS_MENTIONS.map((p) => carteParam(p))}</div>
          </CarteSection>
          <CarteSection titre={TITRE_PARAMS_SOURCES} icone="📇">
            <p style={styleAide}>{AIDE_PARAMS_SOURCES}</p>
            <div style={grille}>{PARAMS_SOURCES.map((p) => carteParam(p))}</div>
          </CarteSection>

          {/* Réglages HÉRITÉS : remplacés par un successeur, conservés en lecture seule pour l'historique (jamais masqués). */}
          <CarteSection titre={TITRE_REGLAGES_HERITES} icone="🗄">
            <p style={styleAide}>Ces réglages ont été remplacés par un successeur. Conservés pour l’historique : celui marqué « n’agit plus » est en lecture seule ; l’autre reste éditable en attendant son retrait complet.</p>
            <div style={grille}>{herites.map((p) => carteParam(p))}</div>
          </CarteSection>
        </div>
      )}

      {/* S33 — « Classification et affichage des dossiers » vit dans l'onglet Automatisation (groupe « Mise à jour des dossiers »),
          jamais ici. Propriétaire inchangé : ces 8 réglages restent édités par la route /reglages (cf. ClassificationDossiers). */}
    </div>
  );
}
