'use client';

import { useEffect, useState, type CSSProperties } from 'react';
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

  function hydrater(r: Reglages) {
    setData(r);
    const id: Record<ProfilDemandeur, Record<string, string>> = { entreprise: {}, personne: {} };
    for (const p of PROFILS) for (const c of champsPourProfil(p)) id[p][c.cle] = String(r.demandeur[p][c.cle] ?? '');
    setIdDraft(id);
    setVeDraft(Object.fromEntries(PARAMS_VEILLE.map((param) => [param.colonne, String(r.veille[param.cle] ?? '')])));
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
  const libelleAvecRail = (p: ParamVeille) => (
    <span style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={styleLabel}>{p.libelle}</span>{badgeRail(p)}
    </span>
  );

  const carteParam = (p: ParamVeille) => {
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
            <span style={styleLabel}>{p.libelle}</span>{badgeRail(p)}
          </label>
          <span style={styleAide}>{p.aide}</span>
          {veMsg[p.colonne] && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{veMsg[p.colonne]}</span>}
          {veErreurs[p.colonne] && <span role="alert" style={styleErreur}>{veErreurs[p.colonne]}</span>}
        </article>
      );
    }
    return (
      <article key={p.colonne} className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
        {libelleAvecRail(p)}
        <span style={styleAide}>{p.aide}</span>
        <label className="flex flex-col gap-1" style={{ marginTop: '.2rem' }}>
          {p.type === 'enum'
            ? <select value={veDraft[p.colonne] ?? ''} onChange={(e) => setVeDraft((d) => ({ ...d, [p.colonne]: e.target.value }))} style={styleInput} aria-label={p.libelle}>
                {(p.optionsEnum ?? []).map((o) => <option key={o} value={o}>{p.optionsEnumLabels?.[o] ?? (o === 'entreprise' || o === 'personne' ? ETIQUETTE_PROFIL[o] : o)}</option>)}
              </select>
            : p.type === 'entier'
              ? <input type="number" value={veDraft[p.colonne] ?? ''} min={b?.min} max={b?.max} step={1}
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

  // ── D4-ter (ÉTANCHE) — répartition des cartes par onglet, dérivée du RAIL (chaque réglage n'appartient qu'à UN espace). ──────
  const grille: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.6rem' };
  const prepEmail = PARAMS_THEME_PREPARATION.filter((p) => p.rail === 'email');                   // dossiers, permis, profil — valeurs e-mail
  const envoiEmail = PARAMS_THEME_ENVOI.filter((p) => p.rail === 'email');                        // caps, relance auto, heures, 3 délais
  const prepTeleservice = PARAMS_THEME_TELESERVICE.filter((p) => !p.colonne.includes('alerte'));  // dossiers, permis, profil — valeurs téléservice
  const teleAlertes = PARAMS_THEME_TELESERVICE.filter((p) => p.colonne.includes('alerte'));       // 2 alertes « préparée non déposée »
  const prepCommune = PARAMS_THEME_PREPARATION.filter((p) => espaceReglage(p) === 'transverse' && !p.vestigial); // ancienneté, profondeur, ordre, pièces
  const adresseReponse = PARAMS_THEME_ENVOI.filter((p) => p.colonne === 'adresse_reponse');       // transverse : imprimée au corps + boîte relevée
  const herites = [
    ...PARAMS_THEME_PREPARATION.filter((p) => p.vestigial),                                       // « Demandes par commune et par mois » (remplacé)
    ...PARAMS_THEME_ENVOI.filter((p) => p.colonne === 'relance_jours_avant_echeance'),            // ancien délai unique (remplacé par la cascade)
  ];
  const onglets: { id: EspaceOnglet; libelle: string; aide: string }[] = [
    { id: 'email', libelle: '✉️ Envoi e-mail auto', aide: 'Le process AUTOMATIQUE d’envoi par e-mail aux mairies. Ces valeurs de préparation et d’envoi sont PROPRES au rail e-mail — elles n’influencent pas le téléservice.' },
    { id: 'teleservice', libelle: '📮 Téléservice', aide: 'Le process SEMI-MANUEL (dépôt sur le téléservice de la commune). Ces valeurs sont PROPRES au rail téléservice — elles n’influencent pas l’e-mail.' },
    { id: 'transverse', libelle: '⚙️ Transverse', aide: 'Réglages COMMUNS aux deux process (une seule valeur, elle vaut partout) : préparation commune, identités, réponses, alertes, CADA, rattachement, courrier, annuaire.' },
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

      {/* ── Onglet ENVOI E-MAIL AUTO (étanche) : préparation e-mail + envoi & relances — valeurs PROPRES au rail e-mail ── */}
      {espace === 'email' && (
        <div role="tabpanel" id="panneau-email" aria-labelledby="onglet-email" className="flex flex-col gap-4">
          <CarteSection titre={TITRE_THEME_PREPARATION} icone="🗂">
            <div style={grille}>{prepEmail.map((p) => carteParam(p))}</div>
          </CarteSection>
          <CarteSection titre={TITRE_ESPACE_EMAIL} icone="✉️">
            <div style={grille}>{envoiEmail.map((p) => carteParam(p))}</div>
          </CarteSection>
        </div>
      )}

      {/* ── Onglet TÉLÉSERVICE (étanche) : préparation téléservice + dépôt & suivi — valeurs PROPRES au rail téléservice ── */}
      {espace === 'teleservice' && (
        <div role="tabpanel" id="panneau-teleservice" aria-labelledby="onglet-teleservice" className="flex flex-col gap-4">
          <CarteSection titre={TITRE_THEME_PREPARATION} icone="🗂">
            <div style={grille}>{prepTeleservice.map((p) => carteParam(p))}</div>
          </CarteSection>
          <CarteSection titre={TITRE_ESPACE_DEPOT} icone="📮">
            <div style={grille}>{teleAlertes.map((p) => carteParam(p))}</div>
          </CarteSection>
        </div>
      )}

      {/* ── Onglet TRANSVERSE : préparation commune + identités + réponses (+ adresse de réponse + relève) + alertes + CADA + rattachement + courrier + annuaire + hérités ── */}
      {espace === 'transverse' && (
        <div role="tabpanel" id="panneau-transverse" aria-labelledby="onglet-transverse" className="flex flex-col gap-4">
          <CarteSection titre="Préparation (commune aux deux process)" icone="🗂">
            <p style={styleAide}>Réglages de préparation dont la valeur idéale ne dépend pas du canal d’envoi : ils valent pour l’e-mail ET le téléservice.</p>
            <div style={grille}>{prepCommune.map((p) => carteParam(p))}</div>
          </CarteSection>
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
