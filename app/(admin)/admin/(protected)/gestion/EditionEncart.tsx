'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ModaleIssue } from '../location/ModaleIssue';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS } from '../location/commun';
import { LIBELLE_OUI_NON, OUI_NON, Pilules, versOuiNon } from '../location/Pilules';
import { ChampFleches, CSS_CHAMP_FLECHES } from '../location/ChampFleches';
import { BlocDpe, CSS_DPE_PNO } from '../location/BlocDpe';
import { BlocEntretien, CSS_ENTRETIEN, versEnvoiEntretien, versSaisieEntretien } from '../location/EntretienBien';
import { CSS_ZONE_AUTO, ZoneAuto } from '../location/ZoneAuto';
import { BlocSyndic, type SyndicChoisi } from '../location/BlocSyndicBien';
import {
  AVERTISSEMENT_ID_FISCAL, CHARGES_COPRO, CHAUFFAGES, EPOQUES_CONSTRUCTION, idFiscalInhabituel, LIBELLE_CHARGES_COPRO, LIBELLE_SITUATION_PARKING,
  LIBELLE_TYPE_LOCAL, LIBELLE_TYPE_LOGEMENT, LIBELLE_TYPE_PARKING, SITUATIONS_PARKING, TYPES_LOCAL, TYPES_LOGEMENT, TYPES_PARKING,
  type ChargesCopro, type SituationParking, type TypeLogement, type TypeParking,
} from '../../../../lib/location/bienComplet';
import { LIBELLE_AG } from '../../../../lib/location/immeubleAg';
import { aujourdhuiParis } from '../../../../lib/location/reglagesDpe';
import {
  changementsEncart, champsDuGroupe, contactsSyndicDe, contactsSyndicEnTexte, entretiensEnTexte, phraseChangement, TITRE_GROUPE, type ChangementEncart, type GroupeEncart, type ValeursEncart,
} from '../../../../lib/location/encartBien';
import { causeDeLaReponse, explicationEchecDe, type CauseEchec } from '../../../../lib/location/issueEnregistrement';
import type { LectureEncart } from '../../../../lib/location/encartBienRepo';

/**
 * ══ 🔴🔴 L'ENCART DU BIEN MODIFIABLE SUR PLACE (Arno, 21/10/2026) ═══════════════════════════════════════════════════════════════════
 *
 * Chaque groupe de l'encart (Caractéristiques, Situation et accès, Copropriété, DPE et entretiens, Commentaire) a son « Modifier » :
 *   · en modification, les champs de « Nouveau bien » (mêmes composants, mêmes règles), remplis des valeurs ACTUELLES relues à la
 *     source ; tant que rien n'a changé : « Fermer » ; dès qu'une valeur change : « Annuler les modifications » et « Valider les
 *     modifications » (bordeaux) ; revenir à toutes les valeurs d'origine fait réapparaître « Fermer » ;
 *   · « Valider » ouvre la CONTRE-VALIDATION (« Champ : ancienne valeur → nouvelle valeur ») ; « Confirmer » enregistre (contrôles du
 *     serveur de « Nouveau bien »), puis modale verte « ✓ Modifications enregistrées » ou rouge (la saisie reste) ;
 *   · UN SEUL bloc en modification ; quitter la page avec des changements non validés : « Modifications non enregistrées ».
 * Une modification enregistrée (ici ou dans la section Location de la fiche) prévient toute la page (`svav:bien-modifie`) : chaque
 * affichage relit la source, et la relit aussi au retour sur l'onglet.
 */
const API = '/api/admin/gestion/annuaire/location';
export const EVENEMENT_BIEN_MODIFIE = 'svav:bien-modifie';
export const AVERTISSEMENT_SORTIE = 'Modifications non enregistrées : quitter la page les perdra.';

/** Prévenir la page qu'un bien a changé en base (l'encart et la section Location se relisent). */
export function annoncerBienModifie(lotId: number): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENEMENT_BIEN_MODIFIE, { detail: { lotId } }));
}

/** Relire quand ce bien change ailleurs dans la page, ou au retour sur l'onglet. */
export function useRelectureBien(lotId: number, relire: () => void, actif = true): void {
  const r = useRef(relire);
  r.current = relire;
  useEffect(() => {
    if (!actif) return;
    const surModif = (e: Event): void => { if ((e as CustomEvent<{ lotId: number }>).detail?.lotId === lotId) r.current(); };
    const surVisible = (): void => { if (document.visibilityState === 'visible') r.current(); };
    window.addEventListener(EVENEMENT_BIEN_MODIFIE, surModif);
    document.addEventListener('visibilitychange', surVisible);
    return () => { window.removeEventListener(EVENEMENT_BIEN_MODIFIE, surModif); document.removeEventListener('visibilitychange', surVisible); };
  }, [lotId, actif]);
}

type Modale =
  | { sorte: 'contre'; changements: ChangementEncart[] }
  | { sorte: 'succes'; changements: ChangementEncart[] }
  | { sorte: 'erreur'; cause: CauseEchec; motif: string | null }
  | { sorte: 'un-a-la-fois'; voulu: GroupeEncart }
  | null;

export interface EditionEncart {
  lu: LectureEncart | null;
  groupe: GroupeEncart | null;
  saisie: ValeursEncart | null;
  changements: ChangementEncart[];
  poser: (cle: keyof ValeursEncart, v: string) => void;
  poserPlusieurs: (v: Partial<ValeursEncart>) => void;
  ouvrir: (g: GroupeEncart) => void;
  fermer: () => void;
  /** « Annuler les modifications » : les valeurs d'origine reviennent, le bloc reste ouvert (« Fermer » réapparaît). */
  annuler: () => void;
  /** Change à chaque annulation : le formulaire est remonté, sans état resté dans un sous-composant (syndic, entretiens). */
  version: number;
  valider: () => void;
  modales: ReactNode;
  enCours: boolean;
}

/** L'état d'édition de l'encart d'un bien : un bloc à la fois, ses changements, ses modales. */
export function useEditionEncart(lotId: number, apres: () => void): EditionEncart {
  const [lu, setLu] = useState<LectureEncart | null>(null);
  const [groupe, setGroupe] = useState<GroupeEncart | null>(null);
  const [saisie, setSaisie] = useState<ValeursEncart | null>(null);
  const [modale, setModale] = useState<Modale>(null);
  const [enCours, setEnCours] = useState(false);
  const [version, setVersion] = useState(0);
  const verrou = useRef(false);
  const lire = useCallback(async (): Promise<LectureEncart | null> => {
    try {
      const r = await fetch(`${API}?encart=${lotId}`, { cache: 'no-store' });
      const d = await r.json() as { etat?: string; data?: LectureEncart };
      const x = d.etat === 'ok' && d.data ? d.data : null;
      setLu(x);
      return x;
    } catch { return null; }
  }, [lotId]);
  const champs = lu === null || groupe === null ? [] : champsDuGroupe(groupe, lu);
  const changements = lu === null || saisie === null || groupe === null ? [] : changementsEncart(champs, lu.valeurs, saisie);
  const sale = changements.length > 0;
  // « Modifications non enregistrées » en quittant la page.
  useEffect(() => {
    if (!sale) return;
    const avertir = (e: BeforeUnloadEvent): string => { e.preventDefault(); e.returnValue = AVERTISSEMENT_SORTIE; return AVERTISSEMENT_SORTIE; };
    // Les liens de l'application changent de page SANS décharger la page (navigation côté client) : même avertissement.
    const surLien = (e: MouseEvent): void => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (a === null || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if ((a.target && a.target !== '_self') || a.hasAttribute('download') || a.origin !== window.location.origin) return;
      // Même adresse : on ne quitte rien… sauf une entrée du menu de gauche, qui remet la page à zéro (Arno, 22/10/2026).
      if (a.pathname === window.location.pathname && a.search === window.location.search && !a.hasAttribute('data-accueil-tuile')) return;
      if (!window.confirm(`${AVERTISSEMENT_SORTIE} Quitter quand même ?`)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', avertir);
    document.addEventListener('click', surLien, true);
    return () => { window.removeEventListener('beforeunload', avertir); document.removeEventListener('click', surLien, true); };
  }, [sale]);
  const ouvrir = (g: GroupeEncart): void => {
    if (groupe !== null && groupe !== g && sale) { setModale({ sorte: 'un-a-la-fois', voulu: g }); return; }
    void (async () => {
      const x = await lire();   // les valeurs ACTUELLES, relues à la source
      if (x === null) { setModale({ sorte: 'erreur', cause: 'technique', motif: 'La fiche du bien n’a pas pu être lue.' }); return; }
      setSaisie({ ...x.valeurs });
      setGroupe(g);
    })();
  };
  const fermer = (): void => { setGroupe(null); setSaisie(null); };
  const annuler = (): void => { if (lu !== null) { setSaisie({ ...lu.valeurs }); setVersion((n) => n + 1); } };
  const enregistrer = async (): Promise<void> => {
    if (verrou.current || groupe === null || saisie === null) return;
    verrou.current = true;
    setEnCours(true);
    try {
      const r = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-svav-confirmation': 'propre' },
        body: JSON.stringify({ action: 'modifier-encart', id: lotId, groupe, valeurs: saisie }),
      });
      const d = await r.json().catch(() => ({})) as { etat?: string; motif?: string; message?: string; erreur?: string; data?: { changements: ChangementEncart[] } };
      if (r.ok && d.etat === 'ok') {
        setModale({ sorte: 'succes', changements: d.data?.changements ?? changements });
        fermer();
        await lire();
        annoncerBienModifie(lotId);
        apres();
        return;
      }
      setModale({ sorte: 'erreur', cause: causeDeLaReponse({ statut: r.status, etat: d.etat, erreur: d.erreur }),
        motif: d.etat === 'sans_schema' ? 'La base de données n’est pas à jour pour cet enregistrement.' : d.motif ?? d.message ?? null });
    } catch {
      setModale({ sorte: 'erreur', cause: 'technique', motif: null });
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  };
  const modales = modale === null ? null : modale.sorte === 'contre' ? (
    <ModaleIssue sorte="attention" titre="Valider les modifications ?" onFermer={() => setModale(null)}
      actions={[{ libelle: 'Revenir à la saisie', onClick: () => setModale(null), repere: 'revenir-saisie' },
        { libelle: enCours ? 'Enregistrement…' : 'Confirmer', onClick: () => { void enregistrer(); }, principal: true, repere: 'confirmer-encart' }]}>
      <ul className="eden-liste" data-contre-validation>{modale.changements.map((c) => <li key={c.cle} data-changement={c.cle}>{phraseChangement(c)}</li>)}</ul>
    </ModaleIssue>
  ) : modale.sorte === 'succes' ? (
    <ModaleIssue sorte="succes" titre="Modifications enregistrées" onFermer={() => setModale(null)}
      lignes={modale.changements.map((c) => [c.champ, `${c.avant} → ${c.apres}`] as [string, string])}
      actions={[{ libelle: 'Fermer', onClick: () => setModale(null), principal: true, repere: 'fermer-succes-encart' }]} />
  ) : modale.sorte === 'erreur' ? (
    <ModaleIssue sorte="erreur" titre="Modifications non enregistrées" onFermer={() => setModale(null)}
      echec={explicationEchecDe('Les modifications n’ont pas été enregistrées.', '« Valider les modifications »', modale.cause, modale.motif)}
      actions={[{ libelle: 'Fermer', onClick: () => setModale(null), principal: true, repere: 'fermer-erreur-encart' }]} />
  ) : (
    <ModaleIssue sorte="attention" titre="Un bloc à la fois" onFermer={() => setModale(null)}
      notes={[`« ${TITRE_GROUPE[groupe ?? 'caracteristiques']} » a des modifications en cours : annulez-les ou validez-les avant de modifier « ${TITRE_GROUPE[modale.voulu]} ».`]}
      actions={[{ libelle: 'Revenir à la saisie', onClick: () => setModale(null), principal: true, repere: 'un-a-la-fois' }]} />
  );
  return {
    lu, groupe, saisie, changements, enCours, modales, ouvrir, fermer, annuler, version,
    poser: (cle, v) => setSaisie((s) => (s === null ? s : { ...s, [cle]: v })),
    poserPlusieurs: (v) => setSaisie((s) => (s === null ? s : { ...s, ...v })),
    valider: () => { if (changements.length > 0) setModale({ sorte: 'contre', changements }); },
  };
}

/** Les boutons du bloc : « Modifier » ; en modification, « Fermer » ou « Annuler les modifications » + « Valider les modifications ». */
export function BoutonsEdition({ ed, g }: { ed: EditionEncart; g: GroupeEncart }) {
  if (ed.groupe !== g) {
    return <button type="button" className="eden-bouton" onClick={() => ed.ouvrir(g)} data-modifier-groupe={g}>Modifier</button>;
  }
  if (ed.changements.length === 0) {
    return <button type="button" className="eden-bouton" onClick={ed.fermer} data-fermer-groupe={g}>Fermer</button>;
  }
  return (
    <span className="eden-boutons">
      <button type="button" className="eden-bouton" onClick={ed.annuler} data-annuler-groupe={g}>Annuler les modifications</button>
      <button type="button" className="eden-bouton eden-bouton--valider" onClick={ed.valider} disabled={ed.enCours} data-valider-groupe={g}>
        {ed.enCours ? 'Enregistrement…' : 'Valider les modifications'}</button>
    </span>
  );
}

/** Les champs d'un groupe en modification — les composants et les règles de « Nouveau bien ». */
/**
 * Les valeurs de l'IMPORT WIPPIMMO que l'encart affiche quand la Location est vide (règle d'Arno du 20/10/2026, `lignesResume`).
 * La saisie, elle, ne porte que les champs de Location (une seule source) : ces valeurs sont DITES au-dessus des champs vides,
 * jamais recopiées en silence dans la saisie ni enregistrées.
 */
export interface ImportBien { type: string | null; meuble?: boolean | null; pieces?: number | null; surface: number | null }

export function FormulaireEncart({ ed, g, adresse, importe }: {
  ed: EditionEncart; g: GroupeEncart; adresse: { libelle: string; codePostal: string; commune: string }; importe?: ImportBien;
}) {
  const lu = ed.lu;
  const s = ed.saisie;
  if (lu === null || s === null) return null;
  const parking = lu.famille === 'parking';
  const local = lu.famille === 'local';
  const champ = (k: keyof ValeursEncart, mot: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="loc-champ">{mot}<input value={s[k]} onChange={(e) => ed.poser(k, e.target.value)} {...props} data-champ-encart={k} /></label>
  );
  const choix = (k: keyof ValeursEncart, mot: string, options: readonly string[]) => (
    <label className="loc-champ">{mot}
      <select value={s[k]} onChange={(e) => ed.poser(k, e.target.value)} data-champ-encart={k}>
        <option value="">— non renseigné —</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select></label>
  );
  const pilule = <T extends string>(k: keyof ValeursEncart, etiquette: string, options: readonly T[], libelle: Record<T, string>) => (
    <Pilules etiquette={etiquette} options={options} libelle={libelle} valeur={(s[k] || null) as T | null} onChoix={(v) => ed.poser(k, v ?? '')} />
  );
  const css = <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CHAMP_FLECHES + CSS_DPE_PNO + CSS_ENTRETIEN + CSS_ZONE_AUTO + CSS_EDITION_ENCART}</style>;
  if (g === 'caracteristiques') {
    const vide = (k: keyof ValeursEncart) => lu.valeurs[k] === '' && s[k] === '';
    const cleType: keyof ValeursEncart = parking ? 'parkingType' : local ? 'typeLocal' : 'typeLogement';
    const cleSurface: keyof ValeursEncart = parking ? 'surfaceM2' : 'surfaceHabitableM2';
    const importes = importe === undefined ? [] : [
      ...(importe.type && vide(cleType) ? [`Type : ${importe.type}`] : []),
      ...(!parking && importe.meuble === true && vide('meuble') ? ['Meublé : oui'] : []),
      ...(!parking && importe.pieces != null && vide('nombrePieces') ? [`Pièces : ${importe.pieces}`] : []),
      ...(importe.surface != null && vide(cleSurface) ? [`Surface : ${String(importe.surface).replace('.', ',')} m²`] : []),
    ];
    return (
      <div key={ed.version} className="eden-form loc-page" data-formulaire-encart={g}>{css}
        {importes.length > 0 && (
          <p className="loc-aide loc-aide--long" data-importe>Affiché d’après l’import WIPPIMMO tant que ces champs sont vides : {importes.join(' · ')}.</p>
        )}
        {lu.famille === 'logement' && (
          <>
            <div className="loc-sous-section"><h4>Type de logement</h4>{pilule('typeLogement', 'Type de logement', TYPES_LOGEMENT, LIBELLE_TYPE_LOGEMENT as Record<TypeLogement, string>)}</div>
            <div className="loc-sous-section"><h4>Meublé ?</h4>
              <div className="loc-pilules" role="group" aria-label="Meublé ou non">
                <button type="button" aria-pressed={s.meuble === 'oui'} onClick={() => ed.poser('meuble', s.meuble === 'oui' ? '' : 'oui')}>Meublé</button>
                <button type="button" aria-pressed={s.meuble === 'non'} onClick={() => ed.poser('meuble', s.meuble === 'non' ? '' : 'non')}>Non meublé</button>
              </div></div>
          </>
        )}
        {local && (
          <div className="loc-sous-section"><h4>Type de local</h4>
            <div className="loc-gros-boutons loc-oui-non" role="group" aria-label="Type de local">
              {TYPES_LOCAL.map((x) => (
                <button key={x} type="button" className="loc-gros-bouton loc-gros-bouton--centre" aria-pressed={s.typeLocal === x}
                  onClick={() => ed.poser('typeLocal', x)}>{s.typeLocal === x ? `✓ ${LIBELLE_TYPE_LOCAL[x]}` : LIBELLE_TYPE_LOCAL[x]}</button>
              ))}
            </div></div>
        )}
        {parking && (
          <>
            <div className="loc-sous-section"><h4>Intérieur ou extérieur ?</h4>{pilule('parkingSituation', 'Intérieur ou extérieur', SITUATIONS_PARKING, LIBELLE_SITUATION_PARKING as Record<SituationParking, string>)}</div>
            <div className="loc-sous-section"><h4>Type de parking</h4>{pilule('parkingType', 'Type de parking', TYPES_PARKING, LIBELLE_TYPE_PARKING as Record<TypeParking, string>)}</div>
          </>
        )}
        <div className="loc-grille" data-ligne-surfaces>
          {!parking && <ChampFleches sorte="pieces" libelle={local ? 'Nombre de bureaux / pièces' : 'Nombre de pièces'} placeholder="ex. 3" valeur={s.nombrePieces} onChange={(v) => ed.poser('nombrePieces', v)} />}
          <ChampFleches sorte="etage" libelle="Étage" placeholder="ex. 3, RDC, -1" valeur={s.etage} onChange={(v) => ed.poser('etage', v)} />
          {parking ? <>{champ('porte', 'N° de place')}{champ('surfaceM2', 'Surface (m², facultative)', { inputMode: 'decimal' })}</> : (
            <>
              {champ('surfaceHabitableM2', local ? 'Surface (m²)' : 'Surface habitable (m²)', { inputMode: 'decimal' })}
              {champ('surfaceCarrezM2', 'Surface Carrez/Boutin m²', { inputMode: 'decimal' })}
              {champ('surfaceExterieureM2', 'Surface extérieure (m²)', { inputMode: 'decimal' })}
            </>
          )}
        </div>
        {!parking && <div className="loc-grille loc-grille--debut">{choix('epoqueConstruction', 'Époque de construction', EPOQUES_CONSTRUCTION)}{choix('chauffage', 'Chauffage', CHAUFFAGES)}</div>}
      </div>
    );
  }
  if (g === 'situation') {
    return (
      <div key={ed.version} className="eden-form loc-page" data-formulaire-encart={g}>{css}
        <div className="loc-grille" data-ligne-situation>
          {champ('batiment', 'Bâtiment', { placeholder: 'ex. B' })}
          {champ('escalier', 'Escalier', { placeholder: 'ex. 2' })}
          {!parking && champ('porte', 'N° de porte')}
          <label className="loc-champ loc-pleine" data-precision>Précision
            <input value={s.precisionAcces} maxLength={500} placeholder="ex. À droite en sortant de l’ascenseur, deuxième porte à gauche"
              onChange={(e) => ed.poser('precisionAcces', e.target.value)} data-champ-encart="precisionAcces" /></label>
        </div>
        <div className="loc-acces">
          <div className="loc-acces-bloc"><span className="loc-acces-mot">Ascenseur</span>
            <Pilules etiquette="Ascenseur" options={OUI_NON} libelle={LIBELLE_OUI_NON} valeur={versOuiNon(s.ascenseur === '' ? null : s.ascenseur === 'oui')}
              onChoix={(v) => ed.poser('ascenseur', v ?? '')} /></div>
          <div className="loc-acces-bloc" data-digicode><span className="loc-acces-mot">Digicode</span>
            <Pilules etiquette="Digicode" options={OUI_NON} libelle={LIBELLE_OUI_NON} valeur={versOuiNon(s.digicode === '' ? null : s.digicode === 'oui')}
              onChoix={(v) => ed.poserPlusieurs({ digicode: v ?? '', ...(v !== 'oui' ? { digicodeCode: '' } : {}) })} />
            <label className="loc-code-digicode">Code
              <input value={s.digicodeCode} maxLength={8} placeholder="ex. 57B83" disabled={s.digicode !== 'oui'} aria-label="Code du digicode"
                onChange={(e) => ed.poser('digicodeCode', e.target.value.slice(0, 8))} data-champ-encart="digicodeCode" /></label>
            {lu.digicodeImmeuble?.mention && <small className="loc-aide loc-aide--long" data-digicode-immeuble>{lu.digicodeImmeuble.mention} — le modifier vaut pour tout l’immeuble (son bâtiment).</small>}
          </div>
        </div>
      </div>
    );
  }
  if (g === 'copropriete') {
    const contacts = contactsSyndicDe(s.syndicContacts);
    const syndic: SyndicChoisi | null = s.syndicId === '' ? null
      : { id: Number(s.syndicId), nom: s.syndicNom, ville: null, contactsIds: contacts.contactsIds, nouveauxContacts: contacts.nouveauxContacts as SyndicChoisi['nouveauxContacts'] };
    return (
      <div key={ed.version} className="eden-form loc-page" data-formulaire-encart={g}>{css}
        <div className="loc-grille loc-grille--debut loc-grille--copro" data-ligne-copro>
          {champ('numLotCopro', 'N° de lot (règlement de copropriété)')}
          {lu.avecIdFiscal && !lu.annexe && (
            <label className="loc-champ" data-id-fiscal>ID fiscal du bien
              <input value={s.idFiscal} inputMode="numeric" maxLength={60} placeholder="ex. 921234567890" onChange={(e) => ed.poser('idFiscal', e.target.value)} data-champ-encart="idFiscal" />
              <small className="loc-aide loc-aide--long">Sur l’avis de taxe foncière</small>
              {idFiscalInhabituel(s.idFiscal) && <small className="loc-aide loc-aide--long loc-aide--avert" role="status" data-id-fiscal-avert>{AVERTISSEMENT_ID_FISCAL}</small>}
            </label>
          )}
          <BlocSyndic adresse={adresse} choisi={syndic} onChoisi={(x) => ed.poserPlusieurs({ syndicId: x === null ? '' : String(x.id), syndicNom: x === null ? '' : x.nom,
            syndicContacts: x === null ? '' : contactsSyndicEnTexte({ contactsIds: x.contactsIds, nouveauxContacts: x.nouveauxContacts }) })} />
        </div>
        {lu.avecAg && (
          <label className="loc-champ" data-derniere-ag>{LIBELLE_AG}
            <input type="date" value={s.derniereAg} onChange={(e) => ed.poser('derniereAg', e.target.value)} data-champ-encart="derniereAg" />
            <small className="loc-aide loc-aide--long">Assemblée générale de copropriété — partagée par tous les lots de l’immeuble.</small></label>
        )}
        {lu.avecCharges && !lu.annexe && (
          <div className="loc-charges" data-charges-copro><div className="loc-charges-bloc"><h4>Paiement des charges</h4>
            <Pilules etiquette="Paiement des charges" options={CHARGES_COPRO} libelle={LIBELLE_CHARGES_COPRO} valeur={(s.chargesCopro || null) as ChargesCopro | null}
              onChoix={(v) => ed.poser('chargesCopro', v ?? '')} />
            <small className="loc-charges-mention">Qui règle les charges de copropriété au syndic</small></div></div>
        )}
      </div>
    );
  }
  if (g === 'dpe') {
    const entretien = versSaisieEntretien(s.entretienAPrevoir === '' ? null : s.entretienAPrevoir === 'oui',
      (() => { try { return JSON.parse(s.entretiens || '[]') as { sorte: 'chaudiere' | 'ramonage' | 'autre'; nom: string | null; dateAnniversaire: string | null }[]; } catch { return []; } })());
    return (
      <div key={ed.version} className="eden-form loc-page" data-formulaire-encart={g}>{css}
        <div className="loc-dpe-pno">
          <BlocDpe classe={s.dpeClasse} date={s.dpeDate} aujourdhui={aujourdhuiParis()} onClasse={(c) => ed.poser('dpeClasse', c)} onDate={(d) => ed.poser('dpeDate', d)} manque={() => null} />
        </div>
        {lu.avecEntretien && (
          <BlocEntretien valeur={entretien} onChange={(v) => {
            const e = versEnvoiEntretien(v);
            ed.poserPlusieurs({ entretienAPrevoir: e.entretienAPrevoir === null ? '' : e.entretienAPrevoir ? 'oui' : 'non', entretiens: entretiensEnTexte(e.entretiens) });
          }} />
        )}
      </div>
    );
  }
  return (
    <div key={ed.version} className="eden-form loc-page" data-formulaire-encart={g}>{css}
      <ZoneAuto etiquette="Commentaire libre" valeur={s.commentaire} onChange={(v) => ed.poser('commentaire', v)} maxLength={4000} />
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; rien ne deborde. */
export const CSS_EDITION_ENCART = `
.eden-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;min-width:0}
.eden-tete .rb-titre{margin:0}
.eden-boutons{display:inline-flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.eden-bouton{appearance:none;font:inherit;font-weight:700;font-size:.9rem;min-height:44px;padding:6px 14px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);cursor:pointer}
.eden-bouton--valider{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-blanc)}
.eden-bouton:disabled{opacity:.6;cursor:progress}
.eden-form{cursor:auto;gap:12px;padding-top:6px;min-width:0}
.eden-liste{margin:0;padding-left:1.1em;display:flex;flex-direction:column;gap:6px;overflow-wrap:anywhere}
`;

/** L'Historique du bien : les modifications de son encart (qui, quand, « Champ : avant → après »), du plus récent. */
export function HistoriqueEncart({ lotId }: { lotId: number }) {
  const [lignes, setLignes] = useState<{ id: number; quand: string; texte: string; par: string }[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [n, setN] = useState(0);
  useRelectureBien(lotId, () => setN((x) => x + 1));
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?modifsEncart=${lotId}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; data?: unknown }) => { if (vivant) setLignes(d.etat === 'ok' && Array.isArray(d.data) ? d.data as never : []); })
      .catch(() => { if (vivant) setLignes([]); });
    return () => { vivant = false; };
  }, [lotId, n]);
  if (lignes === null || lignes.length === 0) return null;
  const quand = (q: string): string => {
    const d = new Date(q);
    if (Number.isNaN(d.getTime())) return q;
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(d);
    return `${f({ day: '2-digit', month: '2-digit', year: 'numeric' })} à ${f({ hour: '2-digit', minute: '2-digit' })}`;
  };
  return (
    <section className="hdb-groupe hdb-groupe--bande" data-historique-encart>
      <div className="hdb-groupe-tete">
        <button type="button" className="hdb-replier" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          Modifications de la fiche du bien
          <span className="gst-compte">{lignes.length}</span>
        </button>
      </div>
      {ouvert && (
        <ul className="eden-histo">
          <style>{`.eden-histo{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}.eden-histo li{display:flex;flex-direction:column;gap:2px;overflow-wrap:anywhere}.eden-histo small{color:var(--color-svv-muted)}`}</style>
          {lignes.map((l) => (
            <li key={l.id} data-modification-encart={l.id}>
              <span>{l.texte}</span>
              <small>{quand(l.quand)} · par {l.par}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
