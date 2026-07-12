'use client';

import { useEffect, useRef, useState } from 'react';
import { EnTetePage } from '../_composants/EnTetePage';
import {
  META,
  FAMILLES_ORDRE,
  F_TECHNIQUE,
  MODES_COMBINAISON,
  estOrientation,
  formaterMalusPct,
  type ColonneMeta,
} from './mappingConfig';

/** Réponse de GET /api/admin/config (LECTURE SEULE). */
interface ReponseConfig {
  present: boolean;
  valeurs?: Record<string, unknown>;
  repli?: Repli;
  erreur?: string;
}

interface Repli {
  actif: boolean;
  raisons: string[];
}

/** Erreur de champ renvoyée par PATCH (422). */
interface ErreurChamp {
  colonne: string;
  message: string;
}

/** Réponse normalisée de PATCH /api/admin/config. */
type ReponsePatch =
  | { ok: true; valeurs: Record<string, unknown>; repli?: Repli }
  | { ok: false; erreurs: ErreurChamp[] };

type Etat =
  | { statut: 'chargement' }
  | { statut: 'erreur' }
  | { statut: 'vide' }
  | { statut: 'ok'; data: ReponseConfig };

/**
 * Contexte partagé descendu aux cartes d'édition.
 *
 * Note (verrou analysis_range_m) : `analysis_range_m` est désormais en LECTURE SEULE (garde-fou
 * intangible). L'ex-paire liée `distance_max_m ↔ analysis_range_m` (EX-23) est donc dissoute :
 * `distance_max_m` s'édite seul (carte éditable standard), le garde-fou `distance_max_m ≤ 200` restant
 * appliqué côté serveur contre la valeur en base (validation.ts / profilConfig.ts, inchangés).
 */
interface CtxPilotage {
  valeurs: Record<string, unknown>;
  appliquer: (r: { valeurs: Record<string, unknown>; repli?: Repli }) => void;
  declencherGolden: () => void;
}

/** Formate une valeur brute pour l'affichage (sans arrondi — EX-7/EX-20). */
function formaterValeur(colonne: string, valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '—';
  if (colonne === 'couloir_malus_pct' && typeof valeur === 'number') {
    return formaterMalusPct(valeur);
  }
  if (Array.isArray(valeur)) return valeur.join(', ');
  return String(valeur);
}

/** Formate un défaut (issu de META, codé en dur). */
function formaterDefaut(meta: ColonneMeta): string {
  if (meta.colonne === 'couloir_malus_pct' && typeof meta.defaut === 'number') {
    return formaterMalusPct(meta.defaut);
  }
  if (Array.isArray(meta.defaut)) return meta.defaut.join(', ');
  return String(meta.defaut);
}

/** Valeur brute → chaîne pour un champ de saisie (aucun arrondi). */
function toInput(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/**
 * Pas de saisie (EX-11) : entier → pas de la métadonnée ; nombre flottant →
 * `step="any"` pour NE JAMAIS laisser le navigateur arrondir/bloquer (invariant
 * §5, notamment `couloir_malus_pct`).
 */
function stepPour(meta: ColonneMeta): string | number {
  return meta.type === 'entier' ? (meta.pas ?? 1) : 'any';
}

/** Vrai si éditer la variable peut déplacer le golden (VIVE ou MIROIR — EX-18). */
function goldenSensible(meta: ColonneMeta): boolean {
  return meta.statut === 'VIVE' || meta.statut === 'MIROIR';
}

/** PATCH normalisé : ne jette jamais (réseau → erreur de champ globale). */
async function patchConfig(payload: Record<string, unknown>): Promise<ReponsePatch> {
  try {
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data?.ok) {
      return { ok: true, valeurs: data.valeurs ?? {}, repli: data.repli };
    }
    const erreurs: ErreurChamp[] =
      Array.isArray(data?.erreurs) && data.erreurs.length
        ? data.erreurs
        : [{ colonne: '', message: 'écriture refusée' }];
    return { ok: false, erreurs };
  } catch {
    return { ok: false, erreurs: [{ colonne: '', message: 'réseau indisponible' }] };
  }
}

/** Logique d'enregistrement d'un champ simple (état local + PATCH). */
function useSauvegarde(appliquer: CtxPilotage['appliquer']) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function sauver(payload: Record<string, unknown>, colonne: string) {
    setEnCours(true);
    setErreur(null);
    setSucces(false);
    const rep = await patchConfig(payload);
    setEnCours(false);
    if (rep.ok) {
      appliquer(rep);
      setSucces(true);
      return;
    }
    // EX-15 : message d'erreur au niveau du champ ; valeur saisie conservée.
    const msg =
      rep.erreurs.find((e) => e.colonne === colonne)?.message ??
      rep.erreurs.find((e) => e.colonne === '')?.message ??
      rep.erreurs[0]?.message ??
      'écriture refusée';
    setErreur(msg);
  }

  return { enCours, erreur, succes, sauver, setErreur, setSucces };
}

/** Libellé lisible du statut. */
const LIBELLE_STATUT: Record<ColonneMeta['statut'], string> = {
  VIVE: 'Vive',
  VESTIGIALE: 'Vestigiale · sans effet',
  'DE GARDE': 'De garde',
  MIROIR: 'Miroir · garde-fou',
  technique: 'Technique',
};

export default function PilotagePage() {
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/config');
        const data: ReponseConfig = await res.json();
        if (annule) return;
        if (!res.ok || data.erreur) {
          setEtat({ statut: 'erreur' });
        } else if (!data.present) {
          setEtat({ statut: 'vide' });
        } else {
          setEtat({ statut: 'ok', data });
        }
      } catch {
        if (!annule) setEtat({ statut: 'erreur' });
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  return (
    <section className="svv-pil">
      <style>{CSS}</style>

      <EnTetePage titre="Pilotage Moteur" intro="Réglages du calcul de la qualité de vue. Les valeurs modifiées ici sont appliquées immédiatement aux nouvelles analyses.">
        <p className="svv-pil-banniere" role="note">
          Seuls les réglages du <strong>dégagement</strong> sont modifiables ici. La partie{' '}
          <strong>photo / paysage</strong> n’est pas réglable depuis cette page.
        </p>
      </EnTetePage>

      {etat.statut === 'chargement' && (
        <p className="svv-pil-message" aria-live="polite">Chargement de la configuration…</p>
      )}

      {etat.statut === 'erreur' && (
        <p className="svv-pil-message svv-pil-message--alerte" role="alert">
          Configuration indisponible.
        </p>
      )}

      {etat.statut === 'vide' && (
        <p className="svv-pil-message svv-pil-message--alerte" role="alert">
          Profil non initialisé (aucune ligne id=1 en base).
        </p>
      )}

      {etat.statut === 'ok' && <PilotageCharge data={etat.data} />}
    </section>
  );
}

/** Vue chargée : détient les valeurs vivantes et le badge repli. */
function PilotageCharge({ data }: { data: ReponseConfig }) {
  const valeursInitiales = data.valeurs ?? {};
  const [valeurs, setValeurs] = useState<Record<string, unknown>>(valeursInitiales);
  const [repli, setRepli] = useState<Repli | undefined>(data.repli);
  const [avertGolden, setAvertGolden] = useState(false);

  function appliquer(r: { valeurs: Record<string, unknown>; repli?: Repli }) {
    setValeurs(r.valeurs);
    setRepli(r.repli);
  }

  const ctx: CtxPilotage = {
    valeurs,
    appliquer,
    declencherGolden: () => setAvertGolden(true),
  };

  return (
    <>
      {avertGolden && (
        <div className="svv-page-note" role="status" aria-live="polite">
          <strong>Attention.</strong> Cette valeur influence directement le score. La modification
          s’applique aux prochaines analyses — vérifie avant d’enregistrer.
        </div>
      )}
      <BadgeRepli repli={repli} />
      {/* Familles VIVES d'abord (dépliées). « Technique » est écartée ici et rendue TOUT EN BAS, repliée (affichage). */}
      {FAMILLES_ORDRE.filter((famille) => famille !== F_TECHNIQUE).map((famille) => (
        <FamilleBloc key={famille} famille={famille} ctx={ctx} />
      ))}
      <SectionVestigiales ctx={ctx} />
      {/* Bloc « Technique » relégué en bas et REPLIÉ par défaut (accordéon non déployé) — présentation seule. */}
      <FamilleBloc famille={F_TECHNIQUE} ctx={ctx} ouvertParDefaut={false} />
    </>
  );
}

/** Badge « profil actif » vs « repli sur défaut » + raisons (EX-17). */
function BadgeRepli({ repli }: { repli?: Repli }) {
  if (!repli) return null;
  if (repli.actif) {
    return (
      <div className="svv-pil-repli svv-pil-repli--actif" role="status">
        <span className="svv-pil-repli-pastille" aria-hidden="true" />
        Profil actif — la configuration en base est réellement utilisée par le moteur.
      </div>
    );
  }
  return (
    <div className="svv-pil-repli svv-pil-repli--repli" role="status">
      <span className="svv-pil-repli-pastille" aria-hidden="true" />
      <div>
        <strong>Repli sur défaut</strong> — le moteur ignore la base et retombe sur le profil par défaut.
        <ul className="svv-pil-repli-raisons">
          {repli.raisons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Bloc d'une famille : ses variables (accordéon/carte). `ouvertParDefaut` pilote l'état initial de l'accordéon
 *  (déplié pour les familles vives ; replié pour « Technique » reléguée en bas). Affichage seul. */
function FamilleBloc({ famille, ctx, ouvertParDefaut = true }: { famille: string; ctx: CtxPilotage; ouvertParDefaut?: boolean }) {
  // Les variables VESTIGIALES sont exclues des familles et regroupées dans la section dédiée
  // (repliée par défaut) en bas de page — filtre sur le FLAG de statut, jamais sur des noms.
  const metas = META.filter((m) => m.famille === famille && m.statut !== 'VESTIGIALE');
  if (metas.length === 0) return null;

  const orientations = metas.filter((m) => estOrientation(m.colonne));
  const autres = metas.filter((m) => !estOrientation(m.colonne));
  // Position d'insertion du bloc orientation (à la place de la 1re colonne orientation).
  const premierIndexOrientation = metas.findIndex((m) => estOrientation(m.colonne));
  const orientationEnFin =
    orientations.length > 0 && premierIndexOrientation + orientations.length >= metas.length;

  return (
    <details className="svv-pil-famille" open={ouvertParDefaut}>
      <summary className="svv-pil-famille-titre">
        {famille} <span className="svv-pil-famille-compte">{metas.length}</span>
      </summary>
      <div className="svv-pil-cartes">
        {autres.map((m) => {
          // Insérer le bloc orientation groupé juste avant la 1re variable qui suivait les orientations.
          const indexDansMetas = metas.indexOf(m);
          const doitInsererOrientationAvant =
            orientations.length > 0 &&
            premierIndexOrientation !== -1 &&
            indexDansMetas === premierIndexOrientation + orientations.length;
          return (
            <div key={m.colonne} style={{ display: 'contents' }}>
              {doitInsererOrientationAvant && <BlocOrientation orientations={orientations} ctx={ctx} />}
              <CarteVariableAuto meta={m} ctx={ctx} />
            </div>
          );
        })}
        {/* Cas où les orientations sont en fin de famille (aucune variable après). */}
        {orientationEnFin && <BlocOrientation orientations={orientations} ctx={ctx} />}
      </div>
    </details>
  );
}

/**
 * Section dédiée regroupant TOUTES les variables vestigiales (filtre sur le flag `statut`), placée
 * après les familles vives et REPLIÉE par défaut (`<details>` sans `open` → non visible au chargement).
 * Les cartes elles-mêmes sont inchangées (grisées, inertes, picto « i ») — on ne fait que les déplacer.
 */
function SectionVestigiales({ ctx }: { ctx: CtxPilotage }) {
  const vestigiales = META.filter((m) => m.statut === 'VESTIGIALE');
  if (vestigiales.length === 0) return null;
  return (
    <details className="svv-pil-famille" style={{ marginTop: '0.9rem' }}>
      <summary className="svv-pil-famille-titre">
        Variables vestigiales · sans effet{' '}
        <span className="svv-pil-famille-compte">{vestigiales.length}</span>
      </summary>
      <div className="svv-pil-cartes">
        <p className="svv-pil-legende">
          Réglages désormais remplacés par les <strong>Cartes d’année</strong>. Sans effet sur
          le score.
        </p>
        {vestigiales.map((m) => (
          <CarteVariableAuto key={m.colonne} meta={m} ctx={ctx} />
        ))}
      </div>
    </details>
  );
}

/** Aiguille chaque variable vers la carte adaptée à son statut/type. */
function CarteVariableAuto({ meta, ctx }: { meta: ColonneMeta; ctx: CtxPilotage }) {
  // `analysis_range_m` (MIROIR, non éditable) → carte lecture seule ; `distance_max_m` (VIVE) → carte
  // éditable standard, envoyée seule (le garde-fou distance_max_m ≤ 200 reste posé serveur, contre la base).
  if (!meta.editable) return <CarteVariableLecture meta={meta} valeurs={ctx.valeurs} />;
  if (meta.type === 'enum') return <CarteVariableSelect meta={meta} ctx={ctx} />;
  return <CarteVariableEditable meta={meta} ctx={ctx} />;
}

/**
 * Picto « i » + bulle d'aide (ADDITIF, purement informatif — aucune incidence sur
 * l'édition). Contenu EXCLUSIVEMENT issu des métadonnées (`mappingConfig`, EX-4).
 * Accessible (EX-5/EX-3) : vrai `<button>` à cible tactile ≥ 44 px (jamais un
 * `title=` au survol), `aria-expanded`, bulle liée par `aria-controls`. Ouverture
 * ET fermeture au tap (re-clic, bouton ×, clic hors zone, touche Échap).
 */
function InfoBulle({ libelle, texte, cible }: { libelle: string; texte?: string; cible: string }) {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLSpanElement>(null);
  const bulleId = `svv-ib-${cible}`;

  useEffect(() => {
    if (!ouvert) return;
    function surClicHors(e: MouseEvent) {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) setOuvert(false);
    }
    function surEchap(e: KeyboardEvent) {
      if (e.key === 'Escape') setOuvert(false);
    }
    document.addEventListener('mousedown', surClicHors);
    document.addEventListener('keydown', surEchap);
    return () => {
      document.removeEventListener('mousedown', surClicHors);
      document.removeEventListener('keydown', surEchap);
    };
  }, [ouvert]);

  if (!texte) return null;

  return (
    <span className="svv-pil-ib" ref={conteneur}>
      <button
        type="button"
        className="svv-pil-ib-btn"
        aria-label={`Aide : ${libelle}`}
        aria-expanded={ouvert}
        aria-controls={bulleId}
        onClick={() => setOuvert((v) => !v)}
      >
        <span className="svv-pil-ib-pastille" aria-hidden="true">i</span>
      </button>
      {ouvert && (
        <span className="svv-pil-ib-bulle" id={bulleId} role="tooltip">
          <span className="svv-pil-ib-texte">{texte}</span>
          <button
            type="button"
            className="svv-pil-ib-fermer"
            aria-label="Fermer l’aide"
            onClick={() => setOuvert(false)}
          >
            ×
          </button>
        </span>
      )}
    </span>
  );
}

/** En-tête commun (libellé + info-bulle + badge statut + nom de colonne). */
function EnteteCarte({ meta }: { meta: ColonneMeta }) {
  return (
    <>
      <div className="svv-pil-carte-tete">
        <span className="svv-pil-tete-gauche">
          <span className="svv-pil-libelle">{meta.libelle}</span>
          <InfoBulle libelle={meta.libelle} texte={meta.infobulle} cible={meta.colonne} />
        </span>
        <span
          className={`svv-pil-statut svv-pil-statut--${meta.statut.replace(/\s+/g, '-').toLowerCase()}`}
        >
          {LIBELLE_STATUT[meta.statut]}
        </span>
      </div>
      <code className="svv-pil-colonne">{meta.colonne}</code>
    </>
  );
}

/** Rappels « Défaut » + « Unité » (référence, non éditables). */
function InfosDefautUnite({ meta }: { meta: ColonneMeta }) {
  return (
    <>
      <div className="svv-pil-champ">
        <span className="svv-pil-champ-label">Défaut</span>
        <span className="svv-pil-champ-valeur svv-pil-champ-valeur--defaut">{formaterDefaut(meta)}</span>
      </div>
      <div className="svv-pil-champ">
        <span className="svv-pil-champ-label">Unité</span>
        <span className="svv-pil-champ-valeur">{meta.unite}</span>
      </div>
    </>
  );
}

/** Carte VIVE éditable — nombre / entier (EX-11). */
function CarteVariableEditable({ meta, ctx }: { meta: ColonneMeta; ctx: CtxPilotage }) {
  const [draft, setDraft] = useState(toInput(ctx.valeurs[meta.colonne]));
  const { enCours, erreur, succes, sauver, setErreur, setSucces } = useSauvegarde(ctx.appliquer);
  const golden = goldenSensible(meta);
  // Champ vidé : ne JAMAIS envoyer Number('') = 0 — bloquer et signaler.
  const estVide = draft.trim() === '';

  function onEdit(v: string) {
    setDraft(v);
    setErreur(null);
    setSucces(false);
    if (golden) ctx.declencherGolden();
  }

  return (
    <article className="svv-pil-carte">
      <EnteteCarte meta={meta} />
      <div className="svv-pil-carte-corps">
        <label className="svv-pil-edit">
          <span className="svv-pil-champ-label">Valeur actuelle</span>
          <input
            type="number"
            className="svv-pil-input"
            value={draft}
            min={meta.min}
            max={meta.max}
            step={stepPour(meta)}
            onFocus={() => golden && ctx.declencherGolden()}
            onChange={(e) => onEdit(e.target.value)}
          />
        </label>
        <InfosDefautUnite meta={meta} />
      </div>
      <div className="svv-pil-actions">
        <button
          type="button"
          className="svv-pil-btn"
          disabled={enCours || estVide}
          onClick={() => sauver({ [meta.colonne]: Number(draft) }, meta.colonne)}
        >
          {enCours ? '…' : 'Enregistrer'}
        </button>
        {succes && <span className="svv-pil-succes">Enregistré</span>}
      </div>
      {estVide && (
        <p className="svv-pil-erreur" role="alert">
          Valeur requise.
        </p>
      )}
      {erreur && (
        <p className="svv-pil-erreur" role="alert">
          {erreur}
        </p>
      )}
    </article>
  );
}

/** Carte enum en liste fermée (`mode_combinaison` VIVE, `mode_combinaison_repli` DE GARDE — EX-13/EX-18/EX-19). */
function CarteVariableSelect({ meta, ctx }: { meta: ColonneMeta; ctx: CtxPilotage }) {
  const [draft, setDraft] = useState(String(ctx.valeurs[meta.colonne] ?? ''));
  const { enCours, erreur, succes, sauver, setErreur, setSucces } = useSauvegarde(ctx.appliquer);
  // Un enum VIVE (mode_combinaison) déplace le golden ; un enum DE GARDE (mode_combinaison_repli) non.
  const golden = goldenSensible(meta);
  // Options propres à l'enum (repli sur MODES_COMBINAISON si absentes).
  const options = meta.optionsEnum ?? MODES_COMBINAISON;

  return (
    <article className="svv-pil-carte">
      <EnteteCarte meta={meta} />
      <div className="svv-pil-carte-corps">
        <label className="svv-pil-edit">
          <span className="svv-pil-champ-label">Valeur actuelle</span>
          <select
            className="svv-pil-select"
            value={draft}
            onFocus={() => golden && ctx.declencherGolden()}
            onChange={(e) => {
              setDraft(e.target.value);
              setErreur(null);
              setSucces(false);
              if (golden) ctx.declencherGolden();
            }}
          >
            {options.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <InfosDefautUnite meta={meta} />
      </div>
      <p className="svv-pil-note">Liste fermée (aucune saisie libre).</p>
      <div className="svv-pil-actions">
        <button
          type="button"
          className="svv-pil-btn"
          disabled={enCours}
          onClick={() => sauver({ [meta.colonne]: draft }, meta.colonne)}
        >
          {enCours ? '…' : 'Enregistrer'}
        </button>
        {succes && <span className="svv-pil-succes">Enregistré</span>}
      </div>
      {erreur && (
        <p className="svv-pil-erreur" role="alert">
          {erreur}
        </p>
      )}
    </article>
  );
}

/** Carte NON éditable (VESTIGIALE + `id` technique + `analysis_range_m` MIROIR verrouillé) — lecture seule (EX-12). */
function CarteVariableLecture({
  meta,
  valeurs,
}: {
  meta: ColonneMeta;
  valeurs: Record<string, unknown>;
}) {
  return (
    <article className="svv-pil-carte" data-vestigiale={meta.statut === 'VESTIGIALE'} data-lecture="true">
      <EnteteCarte meta={meta} />
      <div className="svv-pil-carte-corps">
        <div className="svv-pil-champ">
          <span className="svv-pil-champ-label">Valeur actuelle</span>
          <span className="svv-pil-champ-valeur">{formaterValeur(meta.colonne, valeurs[meta.colonne])}</span>
        </div>
        <InfosDefautUnite meta={meta} />
      </div>
    </article>
  );
}

/** Barème d'orientation : les 8 secteurs éditables côte à côte (EX-11/EX-18). */
function BlocOrientation({
  orientations,
  ctx,
}: {
  orientations: readonly ColonneMeta[];
  ctx: CtxPilotage;
}) {
  return (
    <article className="svv-pil-carte svv-pil-carte--orientation">
      <div className="svv-pil-carte-tete">
        <span className="svv-pil-tete-gauche">
          <span className="svv-pil-libelle">Barème d’orientation (points par secteur)</span>
          <InfoBulle
            libelle="Barème d’orientation (points par secteur)"
            texte={orientations[0]?.infobulle}
            cible="orientation"
          />
        </span>
        <span className="svv-pil-statut svv-pil-statut--vive">Vive</span>
      </div>
      <div className="svv-pil-orientation-grille">
        {orientations.map((m) => (
          <CelluleOrientation key={m.colonne} meta={m} ctx={ctx} />
        ))}
      </div>
      <p className="svv-pil-note">Unité : points (0–10) — secteurs N, NE, E, SE, S, SO, O, NO.</p>
    </article>
  );
}

/** Cellule éditable d'un secteur d'orientation. */
function CelluleOrientation({ meta, ctx }: { meta: ColonneMeta; ctx: CtxPilotage }) {
  const [draft, setDraft] = useState(toInput(ctx.valeurs[meta.colonne]));
  const { enCours, erreur, succes, sauver, setErreur, setSucces } = useSauvegarde(ctx.appliquer);
  const secteur = meta.colonne.replace('orientation_', '').toUpperCase();
  // Champ vidé : ne JAMAIS envoyer Number('') = 0 — bloquer et signaler.
  const estVide = draft.trim() === '';

  function onEdit(v: string) {
    setDraft(v);
    setErreur(null);
    setSucces(false);
    ctx.declencherGolden();
  }

  return (
    <div className="svv-pil-orientation-cell">
      <span className="svv-pil-orientation-secteur">{secteur}</span>
      <input
        type="number"
        className="svv-pil-input svv-pil-input--mini"
        aria-label={meta.libelle}
        value={draft}
        min={meta.min}
        max={meta.max}
        step={stepPour(meta)}
        onFocus={() => ctx.declencherGolden()}
        onChange={(e) => onEdit(e.target.value)}
      />
      <button
        type="button"
        className="svv-pil-btn svv-pil-btn--mini"
        disabled={enCours || estVide}
        onClick={() => sauver({ [meta.colonne]: Number(draft) }, meta.colonne)}
      >
        {enCours ? '…' : succes ? '✓' : 'OK'}
      </button>
      {estVide && (
        <span className="svv-pil-erreur-mini" role="alert">
          Requis.
        </span>
      )}
      {erreur && (
        <span className="svv-pil-erreur-mini" role="alert">
          {erreur}
        </span>
      )}
    </div>
  );
}

const CSS = `
.svv-pil{max-width:960px}
.svv-pil code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em;background:var(--color-svv-field);padding:.05rem .3rem;border-radius:.3rem;color:var(--color-svv-ink)}

.svv-pil-banniere{margin:.75rem 0;padding:.6rem .75rem;border:1px solid var(--color-svv-line);border-left:3px solid var(--color-svv-red);border-radius:.6rem;background:var(--color-svv-field);color:var(--color-svv-gray);font-size:.85rem;line-height:1.4}

.svv-pil-message{padding:1rem;color:var(--color-svv-muted);font-size:.95rem}
.svv-pil-message--alerte{color:var(--color-svv-red);font-weight:600}

.svv-pil-repli{display:flex;gap:.55rem;align-items:flex-start;padding:.7rem .85rem;border-radius:.7rem;margin:.75rem 0;font-size:.88rem;line-height:1.45}
.svv-pil-repli--actif{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.svv-pil-repli--repli{background:#fdecec;color:var(--color-svv-red-dark);border:1px solid #f3c9c9}
.svv-pil-repli-pastille{flex:0 0 auto;width:10px;height:10px;border-radius:999px;margin-top:.3rem;background:currentColor}
.svv-pil-repli-raisons{margin:.35rem 0 0;padding-left:1.1rem}

.svv-pil-famille{border:1px solid var(--color-svv-line);border-radius:.75rem;margin-bottom:.65rem;background:var(--color-svv-field);overflow:hidden}
.svv-pil-famille-titre{cursor:pointer;list-style:none;padding:.7rem .9rem;font-weight:700;color:var(--color-svv-ink);font-size:.95rem;display:flex;align-items:center;gap:.5rem}
.svv-pil-famille-titre::-webkit-details-marker{display:none}
.svv-pil-famille-titre::before{content:"▸";color:var(--color-svv-muted);transition:transform .15s ease}
.svv-pil-famille[open] .svv-pil-famille-titre::before{transform:rotate(90deg)}
.svv-pil-famille-compte{margin-left:auto;font-weight:600;font-size:.78rem;color:var(--color-svv-muted);background:#fff;border:1px solid var(--color-svv-line);border-radius:999px;padding:.1rem .5rem}

.svv-pil-cartes{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.6rem;padding:.7rem .9rem .9rem}
.svv-pil-legende{grid-column:1/-1;margin:0 0 .3rem;font-size:.8rem;color:var(--color-svv-muted);line-height:1.4}
.svv-pil-carte{border:1px solid var(--color-svv-line);border-radius:.6rem;padding:.6rem .7rem;background:#fff;min-width:0}
.svv-pil-carte[data-vestigiale="true"],.svv-pil-carte[data-lecture="true"]{opacity:.6;background:var(--color-svv-field)}
.svv-pil-carte--orientation{grid-column:1/-1;opacity:1;background:#fff}
.svv-pil-carte-tete{display:flex;gap:.4rem;align-items:flex-start;justify-content:space-between}
.svv-pil-tete-gauche{display:flex;align-items:flex-start;gap:.15rem;min-width:0}
.svv-pil-libelle{font-weight:700;color:var(--color-svv-ink);font-size:.88rem;line-height:1.3;min-width:0}
.svv-pil-colonne{display:inline-block;margin:.35rem 0 .5rem;word-break:break-all}

/* Info-bulle « i » (additif, informatif). Bouton à cible tactile ≥ 44px ; la
   pastille visible reste compacte grâce à des marges négatives (le hit-area 44px
   est conservé). Bulle contrainte en largeur : jamais de débordement en 375px. */
.svv-pil-ib{position:relative;display:inline-flex;flex:0 0 auto}
.svv-pil-ib-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;margin:-11px -11px -11px -6px;padding:0;background:none;border:0;cursor:pointer;color:var(--color-svv-muted)}
.svv-pil-ib-pastille{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;border:1px solid currentColor;font-size:.7rem;font-weight:800;font-style:italic;line-height:1;font-family:Georgia,serif}
.svv-pil-ib-btn:hover .svv-pil-ib-pastille,.svv-pil-ib-btn[aria-expanded="true"] .svv-pil-ib-pastille{color:var(--color-svv-red)}
.svv-pil-ib-btn:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:999px}
.svv-pil-ib-bulle{position:absolute;top:calc(100% + 4px);left:0;z-index:20;display:flex;gap:.35rem;align-items:flex-start;width:max-content;max-width:min(280px,calc(100vw - 40px));padding:.55rem .65rem;background:var(--color-svv-ink);color:#fff;border-radius:.5rem;box-shadow:0 6px 20px rgba(0,0,0,.22);font-size:.78rem;line-height:1.4;font-weight:400;white-space:normal;word-break:break-word;animation:svv-ib-in .12s ease}
.svv-pil-ib-texte{min-width:0}
.svv-pil-ib-fermer{appearance:none;flex:0 0 auto;background:none;border:0;color:#fff;font-size:1rem;line-height:1;cursor:pointer;min-width:24px;min-height:24px;padding:0;opacity:.85}
.svv-pil-ib-fermer:hover{opacity:1}
.svv-pil-ib-fermer:focus-visible{outline:2px solid #fff;outline-offset:1px;border-radius:.3rem}
@keyframes svv-ib-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
.svv-pil-carte-corps{display:flex;flex-wrap:wrap;gap:.5rem .9rem}
.svv-pil-champ{display:flex;flex-direction:column;min-width:0}
.svv-pil-champ-label{font-size:.68rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--color-svv-muted)}
.svv-pil-champ-valeur{font-size:.9rem;color:var(--color-svv-ink);font-weight:600;word-break:break-word}
.svv-pil-champ-valeur--defaut{color:var(--color-svv-muted);font-weight:500}
.svv-pil-note{margin:.5rem 0 0;font-size:.78rem;color:var(--color-svv-muted);line-height:1.35}

.svv-pil-edit{display:flex;flex-direction:column;gap:.2rem;flex:1 1 100%;min-width:0}
.svv-pil-input,.svv-pil-select{width:100%;box-sizing:border-box;padding:.4rem .5rem;border:1px solid var(--color-svv-line);border-radius:.45rem;background:#fff;color:var(--color-svv-ink);font-size:.95rem;font-family:inherit}
.svv-pil-input:focus,.svv-pil-select:focus{outline:2px solid var(--color-svv-red);outline-offset:0}
.svv-pil-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-top:.55rem}
.svv-pil-btn{appearance:none;border:1px solid var(--color-svv-red);background:var(--color-svv-red);color:#fff;font-weight:700;font-size:.82rem;padding:.4rem .8rem;border-radius:.5rem;cursor:pointer;line-height:1.2}
.svv-pil-btn:disabled{opacity:.6;cursor:progress}
.svv-pil-erreur{margin:.45rem 0 0;color:var(--color-svv-red);font-weight:600;font-size:.8rem;line-height:1.35}
.svv-pil-succes{color:var(--color-svv-green-ink);font-weight:700;font-size:.8rem}

.svv-pil-statut{flex:0 0 auto;font-size:.68rem;font-weight:700;border-radius:999px;padding:.12rem .5rem;white-space:nowrap;line-height:1.3}
.svv-pil-statut--vive{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.svv-pil-statut--vestigiale{background:#eceef1;color:var(--color-svv-muted)}
.svv-pil-statut--de-garde{background:#fff4e0;color:#8a5a00}
.svv-pil-statut--miroir{background:#e6eefb;color:#2c4d84}
.svv-pil-statut--technique{background:var(--color-svv-field);color:var(--color-svv-gray)}

.svv-pil-orientation-grille{display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem;margin-top:.5rem}
.svv-pil-orientation-cell{display:flex;flex-direction:column;align-items:center;gap:.2rem;border:1px solid var(--color-svv-line);border-radius:.5rem;padding:.4rem .3rem;background:var(--color-svv-field);min-width:0}
.svv-pil-orientation-secteur{font-weight:800;font-size:.72rem;color:var(--color-svv-muted)}
.svv-pil-input--mini{padding:.25rem .3rem;font-size:.9rem;text-align:center}
.svv-pil-btn--mini{padding:.25rem;font-size:.72rem;width:100%}
.svv-pil-erreur-mini{color:var(--color-svv-red);font-weight:600;font-size:.66rem;line-height:1.2;text-align:center}

@media (max-width:420px){
  .svv-pil-cartes{grid-template-columns:1fr}
  .svv-pil-orientation-grille{grid-template-columns:repeat(2,1fr)}
}

@media (prefers-reduced-motion:reduce){
  .svv-pil-famille-titre::before{transition:none}
  .svv-pil-ib-bulle{animation:none}
}
`;
