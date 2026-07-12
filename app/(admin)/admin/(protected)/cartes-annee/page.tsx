'use client';

import { useEffect, useState } from 'react';
import { intervalleReelCarte, type CarteAnnee } from '../../../../lib/svv/cartesAnnee';
import { InfoBulle, INFOBULLE_CSS } from '../InfoBulle';
import { EnTetePage } from '../_composants/EnTetePage';

/** Aide « i » — texte IDENTIQUE pour toutes les cartes d'année (cohérence avec Pilotage). */
const TEXTE_CARTE_ANNEE =
  "Fourchette d'année de construction. Un bâtiment dont l'année de construction (jointure BDNB) " +
  "tombe dans cet intervalle reçoit les coefficients cône/flanc et le cap de distance de cette carte, " +
  "appliqués au calcul du faisceau (score de dégagement /80). Priorité de classification : Monuments " +
  "Historiques puis Inventaire passent AVANT les cartes d'année ; une année hors de toute carte = " +
  'aucun bonus (chemin classique).';

/** Carte telle que renvoyée par l'API (carte + id). */
type CarteAvecId = CarteAnnee & { id: number };

/** Erreur d'écriture renvoyée par l'API (422). */
interface ErreurCarte {
  index?: number;
  message: string;
}

/** Réponse normalisée d'une écriture (POST/PATCH/DELETE). */
type ReponseEcriture =
  | { ok: true; carte?: CarteAvecId }
  | { ok: false; erreurs: ErreurCarte[] };

/** Brouillon de saisie (chaînes — jamais Number('') = 0 envoyé tel quel). */
interface Brouillon {
  borneMin: string;
  opMin: '' | '>=' | '>';
  borneMax: string;
  opMax: '' | '<=' | '<';
  cone: string;
  flanc: string;
  distMaxM: string;
}

const BROUILLON_VIDE: Brouillon = {
  borneMin: '',
  opMin: '',
  borneMax: '',
  opMax: '',
  cone: '',
  flanc: '',
  distMaxM: '',
};

/** Brouillon initialisé depuis une carte existante (édition). */
function brouillonDepuisCarte(c: CarteAnnee): Brouillon {
  return {
    borneMin: c.borneMin === null ? '' : String(c.borneMin),
    opMin: c.opMin ?? '',
    borneMax: c.borneMax === null ? '' : String(c.borneMax),
    opMax: c.opMax ?? '',
    cone: String(c.cone),
    flanc: String(c.flanc),
    distMaxM: String(c.distMaxM),
  };
}

/** Brouillon → payload JSON (bornes/opérateurs vides → null ; coefficients → nombre). */
function versPayload(b: Brouillon): Record<string, unknown> {
  const anneeOuNull = (s: string) => (s.trim() === '' ? null : Number(s));
  return {
    borneMin: anneeOuNull(b.borneMin),
    opMin: b.opMin === '' ? null : b.opMin,
    borneMax: anneeOuNull(b.borneMax),
    opMax: b.opMax === '' ? null : b.opMax,
    cone: Number(b.cone),
    flanc: Number(b.flanc),
    distMaxM: Number(b.distMaxM),
  };
}

/** Un coefficient est manquant → on bloque l'envoi (jamais Number('') = 0). */
function coefficientsIncomplets(b: Brouillon): boolean {
  return b.cone.trim() === '' || b.flanc.trim() === '' || b.distMaxM.trim() === '';
}

/** Au moins une borne renseignée (contrainte DB : borne_min OU borne_max non nul). */
function auMoinsUneBorne(b: Brouillon): boolean {
  return b.borneMin.trim() !== '' || b.borneMax.trim() !== '';
}

/** Libellé lisible d'une fourchette, dérivé de l'intervalle réel entier (source unique). */
function libelleFourchette(c: CarteAnnee): string {
  const [lo, hi] = intervalleReelCarte(c);
  const loFini = Number.isFinite(lo);
  const hiFini = Number.isFinite(hi);
  if (loFini && hiFini) return `${lo} – ${hi}`;
  if (!loFini && hiFini) return `≤ ${hi}`;
  if (loFini && !hiFini) return `≥ ${lo}`;
  return 'toutes années';
}

/**
 * Comparateur d'AFFICHAGE UNIQUEMENT — du plus ancien (haut) au plus récent (bas). Clé = intervalle réel entier
 * `intervalleReelCarte` (MÊME source que le libellé) : borne basse effective ascendante, puis borne haute en
 * départage. Une borne ouverte donne ±Infinity → une carte « ≤ 1914 » (borne basse absente = −∞) passe AVANT
 * « 1915–1939 » ; une carte « ≥ 2000 » (borne haute absente = +∞) finit en bas. Les gardes `!==` évitent tout
 * `−∞ − (−∞) = NaN`. Tri LOCAL au rendu : n'altère NI l'ordre en base, NI les données envoyées au moteur.
 */
function parAncienneteAffichage(a: CarteAvecId, b: CarteAvecId): number {
  const [loA, hiA] = intervalleReelCarte(a);
  const [loB, hiB] = intervalleReelCarte(b);
  if (loA !== loB) return loA - loB;
  if (hiA !== hiB) return hiA - hiB;
  return 0;
}

/** GET normalisé : ne jette jamais. */
async function chargerCartes(): Promise<{ ok: true; cartes: CarteAvecId[] } | { ok: false }> {
  try {
    const res = await fetch('/api/admin/cartes-annee');
    const data = await res.json();
    if (res.ok && Array.isArray(data?.cartes)) return { ok: true, cartes: data.cartes };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/** Écriture normalisée (POST/PATCH/DELETE) : ne jette jamais. */
async function ecrire(url: string, methode: 'POST' | 'PATCH' | 'DELETE', payload?: unknown): Promise<ReponseEcriture> {
  try {
    const res = await fetch(url, {
      method: methode,
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) return { ok: true, carte: data.carte };
    const erreurs: ErreurCarte[] =
      Array.isArray(data?.erreurs) && data.erreurs.length
        ? data.erreurs
        : [{ message: 'écriture refusée' }];
    return { ok: false, erreurs };
  } catch {
    return { ok: false, erreurs: [{ message: 'réseau indisponible' }] };
  }
}

export default function CartesAnneePage() {
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');
  const [cartes, setCartes] = useState<CarteAvecId[]>([]);

  async function recharger() {
    const rep = await chargerCartes();
    if (rep.ok) {
      setCartes(rep.cartes);
      setEtat('ok');
    } else {
      setEtat('erreur');
    }
  }

  useEffect(() => {
    let annule = false;
    (async () => {
      const rep = await chargerCartes();
      if (annule) return;
      if (rep.ok) {
        setCartes(rep.cartes);
        setEtat('ok');
      } else {
        setEtat('erreur');
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  return (
    <section className="svv-ca">
      <style>{CSS}</style>
      <style>{INFOBULLE_CSS}</style>

      <EnTetePage titre="Années de construction" intro="Barème appliqué selon l’année de construction du bâtiment. Chaque tranche d’années définit son influence sur le score de dégagement.">
        <div className="svv-page-note" role="note">
          <strong>Attention.</strong> Ces barèmes influencent directement le <strong>score de dégagement</strong>.
          Toute modification s’applique aux prochaines analyses — vérifie tes valeurs avant d’enregistrer.
        </div>
      </EnTetePage>

      {etat === 'chargement' && (
        <p className="svv-ca-message" aria-live="polite">Chargement des cartes…</p>
      )}
      {etat === 'erreur' && (
        <p className="svv-ca-message svv-ca-message--alerte" role="alert">
          Cartes indisponibles (accès base en échec).
        </p>
      )}

      {etat === 'ok' && (
        <>
          {cartes.length === 0 && (
            <p className="svv-ca-message" role="note">
              Aucune carte d’année. <strong>Aucun bonus par année</strong> n’est appliqué (chemin classique) —
              ajoutez-en une ci-dessous.
            </p>
          )}

          <div className="svv-ca-liste">
            {/* Tri d'AFFICHAGE seulement (copie via spread) : du plus ancien au plus récent. L'état `cartes`, l'ordre
                en base et les payloads envoyés au moteur restent INCHANGÉS. */}
            {[...cartes].sort(parAncienneteAffichage).map((c) => (
              <CarteEditable key={c.id} carte={c} onChange={recharger} />
            ))}
          </div>

          <FormulaireAjout onCree={recharger} />
        </>
      )}
    </section>
  );
}

/** Carte existante : édition en place (bornes + opérateurs + coefficients) + suppression. */
function CarteEditable({ carte, onChange }: { carte: CarteAvecId; onChange: () => Promise<void> }) {
  const [draft, setDraft] = useState<Brouillon>(brouillonDepuisCarte(carte));
  const [erreurs, setErreurs] = useState<ErreurCarte[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [succes, setSucces] = useState(false);
  const [confirmSuppr, setConfirmSuppr] = useState(false);

  const bloque = coefficientsIncomplets(draft) || !auMoinsUneBorne(draft);

  function maj(champ: keyof Brouillon, valeur: string) {
    setDraft((d) => ({ ...d, [champ]: valeur }));
    setErreurs([]);
    setSucces(false);
  }

  async function enregistrer() {
    setEnCours(true);
    setErreurs([]);
    setSucces(false);
    const rep = await ecrire(`/api/admin/cartes-annee/${carte.id}`, 'PATCH', versPayload(draft));
    setEnCours(false);
    if (rep.ok) {
      setSucces(true);
      await onChange();
    } else {
      setErreurs(rep.erreurs);
    }
  }

  async function supprimer() {
    setEnCours(true);
    setErreurs([]);
    const rep = await ecrire(`/api/admin/cartes-annee/${carte.id}`, 'DELETE');
    setEnCours(false);
    if (rep.ok) {
      await onChange();
    } else {
      setConfirmSuppr(false);
      setErreurs(rep.erreurs);
    }
  }

  return (
    <article className="svv-ca-carte">
      <div className="svv-ca-carte-tete">
        <span className="svv-ca-fourchette">{libelleFourchette(carte)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flex: '0 0 auto' }}>
          <code className="svv-ca-id">#{carte.id}</code>
          <span className="svv-pil-statut svv-pil-statut--vive">Vive</span>
          <InfoBulle
            libelle={`Carte d’année #${carte.id}`}
            texte={TEXTE_CARTE_ANNEE}
            cible={`carte-${carte.id}`}
          />
        </span>
      </div>

      <ChampsCarte draft={draft} maj={maj} idPrefixe={`c${carte.id}`} />

      <div className="svv-ca-actions">
        <button type="button" className="svv-ca-btn" disabled={enCours || bloque} onClick={enregistrer}>
          {enCours ? '…' : 'Enregistrer'}
        </button>
        {!confirmSuppr ? (
          <button
            type="button"
            className="svv-ca-btn svv-ca-btn--danger"
            disabled={enCours}
            onClick={() => setConfirmSuppr(true)}
          >
            Supprimer
          </button>
        ) : (
          <span className="svv-ca-confirm" role="alertdialog" aria-label="Confirmer la suppression">
            <span className="svv-ca-confirm-txt">Supprimer cette carte ?</span>
            <button type="button" className="svv-ca-btn svv-ca-btn--danger" disabled={enCours} onClick={supprimer}>
              Oui, supprimer
            </button>
            <button type="button" className="svv-ca-btn svv-ca-btn--ghost" disabled={enCours} onClick={() => setConfirmSuppr(false)}>
              Annuler
            </button>
          </span>
        )}
        {succes && <span className="svv-ca-succes">Enregistré</span>}
      </div>

      {bloque && (
        <p className="svv-ca-erreur" role="alert">
          Une borne au moins et les trois coefficients (cône, flanc, distance max) sont requis.
        </p>
      )}
      {erreurs.map((e, i) => (
        <p className="svv-ca-erreur" role="alert" key={i}>
          {e.message}
        </p>
      ))}
    </article>
  );
}

/** Formulaire d'ajout d'une nouvelle carte. */
function FormulaireAjout({ onCree }: { onCree: () => Promise<void> }) {
  const [draft, setDraft] = useState<Brouillon>(BROUILLON_VIDE);
  const [erreurs, setErreurs] = useState<ErreurCarte[]>([]);
  const [enCours, setEnCours] = useState(false);

  const bloque = coefficientsIncomplets(draft) || !auMoinsUneBorne(draft);

  function maj(champ: keyof Brouillon, valeur: string) {
    setDraft((d) => ({ ...d, [champ]: valeur }));
    setErreurs([]);
  }

  async function creer() {
    setEnCours(true);
    setErreurs([]);
    const rep = await ecrire('/api/admin/cartes-annee', 'POST', versPayload(draft));
    setEnCours(false);
    if (rep.ok) {
      setDraft(BROUILLON_VIDE);
      await onCree();
    } else {
      setErreurs(rep.erreurs);
    }
  }

  return (
    <article className="svv-ca-carte svv-ca-carte--ajout">
      <div className="svv-ca-carte-tete">
        <span className="svv-ca-fourchette svv-ca-fourchette--neuf">Nouvelle carte</span>
      </div>
      <p className="svv-ca-note">
        Fourchette configurable (bornes + opérateurs) et coefficients cône/flanc/distance — agit sur le
        score de dégagement /80.
      </p>
      <ChampsCarte draft={draft} maj={maj} idPrefixe="neuf" />
      <div className="svv-ca-actions">
        <button type="button" className="svv-ca-btn" disabled={enCours || bloque} onClick={creer}>
          {enCours ? '…' : 'Ajouter la carte'}
        </button>
      </div>
      {bloque && (
        <p className="svv-ca-note">
          Renseignez au moins une borne (min ou max) et les trois coefficients.
        </p>
      )}
      {erreurs.map((e, i) => (
        <p className="svv-ca-erreur" role="alert" key={i}>
          {e.message}
        </p>
      ))}
    </article>
  );
}

/** Bloc de saisie commun (bornes + opérateurs + coefficients). */
function ChampsCarte({
  draft,
  maj,
  idPrefixe,
}: {
  draft: Brouillon;
  maj: (champ: keyof Brouillon, valeur: string) => void;
  idPrefixe: string;
}) {
  return (
    <>
      <div className="svv-ca-fourchette-grille">
        <div className="svv-ca-champ">
          <label className="svv-ca-label" htmlFor={`${idPrefixe}-opMin`}>Borne basse</label>
          <div className="svv-ca-borne">
            <select
              id={`${idPrefixe}-opMin`}
              className="svv-ca-select"
              value={draft.opMin}
              onChange={(e) => maj('opMin', e.target.value)}
              aria-label="Opérateur de borne basse"
            >
              <option value="">—</option>
              <option value=">=">≥</option>
              <option value=">">&gt;</option>
            </select>
            <input
              type="number"
              className="svv-ca-input"
              value={draft.borneMin}
              step={1}
              placeholder="année"
              onChange={(e) => maj('borneMin', e.target.value)}
              aria-label="Année de borne basse"
            />
          </div>
        </div>

        <div className="svv-ca-champ">
          <label className="svv-ca-label" htmlFor={`${idPrefixe}-opMax`}>Borne haute</label>
          <div className="svv-ca-borne">
            <select
              id={`${idPrefixe}-opMax`}
              className="svv-ca-select"
              value={draft.opMax}
              onChange={(e) => maj('opMax', e.target.value)}
              aria-label="Opérateur de borne haute"
            >
              <option value="">—</option>
              <option value="<=">≤</option>
              <option value="<">&lt;</option>
            </select>
            <input
              type="number"
              className="svv-ca-input"
              value={draft.borneMax}
              step={1}
              placeholder="année"
              onChange={(e) => maj('borneMax', e.target.value)}
              aria-label="Année de borne haute"
            />
          </div>
        </div>
      </div>

      <div className="svv-ca-coeffs-grille">
        <div className="svv-ca-champ">
          <label className="svv-ca-label" htmlFor={`${idPrefixe}-cone`}>Cône (×)</label>
          <input
            id={`${idPrefixe}-cone`}
            type="number"
            className="svv-ca-input"
            value={draft.cone}
            min={0}
            max={10}
            step="any"
            onChange={(e) => maj('cone', e.target.value)}
          />
        </div>
        <div className="svv-ca-champ">
          <label className="svv-ca-label" htmlFor={`${idPrefixe}-flanc`}>Flanc (×)</label>
          <input
            id={`${idPrefixe}-flanc`}
            type="number"
            className="svv-ca-input"
            value={draft.flanc}
            min={0}
            max={10}
            step="any"
            onChange={(e) => maj('flanc', e.target.value)}
          />
        </div>
        <div className="svv-ca-champ">
          <label className="svv-ca-label" htmlFor={`${idPrefixe}-distMaxM`}>Dist. max (m)</label>
          <input
            id={`${idPrefixe}-distMaxM`}
            type="number"
            className="svv-ca-input"
            value={draft.distMaxM}
            min={0}
            step="any"
            onChange={(e) => maj('distMaxM', e.target.value)}
          />
        </div>
      </div>
    </>
  );
}

const CSS = `
.svv-ca{max-width:820px}
.svv-ca code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em;background:var(--color-svv-field);padding:.05rem .3rem;border-radius:.3rem;color:var(--color-svv-ink)}

.svv-ca-message{padding:.75rem 0;color:var(--color-svv-muted);font-size:.9rem;line-height:1.45}
.svv-ca-message--alerte{color:var(--color-svv-red);font-weight:600}

.svv-ca-liste{display:flex;flex-direction:column;gap:.7rem;margin:.5rem 0 1rem}
.svv-ca-carte{border:1px solid var(--color-svv-line);border-radius:.7rem;padding:.75rem .85rem;background:var(--color-svv-field)}
.svv-ca-carte--ajout{border-style:dashed;background:var(--color-svv-field)}
.svv-ca-carte-tete{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.6rem}
.svv-ca-fourchette{font-weight:800;font-size:1rem;color:var(--color-svv-ink)}
.svv-ca-fourchette--neuf{color:var(--color-svv-red)}
.svv-ca-id{font-size:.75rem;color:var(--color-svv-muted)}

.svv-ca-fourchette-grille{display:grid;grid-template-columns:1fr 1fr;gap:.55rem;margin-bottom:.55rem}
.svv-ca-coeffs-grille{display:grid;grid-template-columns:repeat(3,1fr);gap:.55rem}
.svv-ca-champ{display:flex;flex-direction:column;gap:.2rem;min-width:0}
.svv-ca-label{font-size:.68rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--color-svv-muted)}
.svv-ca-borne{display:flex;gap:.3rem;min-width:0}
.svv-ca-select{flex:0 0 auto;min-height:44px;padding:.4rem .4rem;border:1px solid var(--color-svv-line);border-radius:.45rem;background:#fff;color:var(--color-svv-ink);font-size:.95rem;font-family:inherit}
.svv-ca-input{width:100%;min-width:0;box-sizing:border-box;min-height:44px;padding:.4rem .5rem;border:1px solid var(--color-svv-line);border-radius:.45rem;background:#fff;color:var(--color-svv-ink);font-size:.95rem;font-family:inherit}
.svv-ca-select:focus,.svv-ca-input:focus{outline:2px solid var(--color-svv-red);outline-offset:0}

.svv-ca-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-top:.7rem}
.svv-ca-btn{appearance:none;min-height:44px;border:1px solid var(--color-svv-red);background:var(--color-svv-red);color:#fff;font-weight:700;font-size:.85rem;padding:.4rem .9rem;border-radius:.5rem;cursor:pointer;line-height:1.2}
.svv-ca-btn:disabled{opacity:.55;cursor:not-allowed}
.svv-ca-btn--danger{background:#fff;color:var(--color-svv-red)}
.svv-ca-btn--ghost{background:#fff;color:var(--color-svv-gray);border-color:var(--color-svv-line)}
.svv-ca-confirm{display:inline-flex;flex-wrap:wrap;align-items:center;gap:.4rem;background:#fdecec;border:1px solid #f3c9c9;border-radius:.5rem;padding:.35rem .5rem}
.svv-ca-confirm-txt{font-size:.8rem;font-weight:700;color:var(--color-svv-red-dark)}
.svv-ca-succes{color:var(--color-svv-green-ink);font-weight:700;font-size:.8rem}
.svv-ca-note{margin:.5rem 0 0;font-size:.78rem;color:var(--color-svv-muted);line-height:1.4}
.svv-ca-erreur{margin:.45rem 0 0;color:var(--color-svv-red);font-weight:600;font-size:.8rem;line-height:1.4}

@media (max-width:420px){
  .svv-ca-coeffs-grille{grid-template-columns:1fr}
  .svv-ca-fourchette-grille{grid-template-columns:1fr}
}
`;
