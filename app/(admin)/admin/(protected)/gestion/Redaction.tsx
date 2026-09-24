'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  adresseValide, decouperAdresses, MENTION_DESTINATAIRES_APPROXIMATIFS, MENTION_PIECES_NON_JOINTES,
  MENTION_SANS_SIGNATURE, pretAEnvoyer, secondesRestantes,
  type Brouillon,
} from '../../../../lib/gestion/redaction';

/**
 * LOT 5e — ÉCRIRE UN MESSAGE. Composant CLIENT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 ON N'ENVOIE QUE SUR CLIC EXPLICITE DU BOUTON « ENVOYER ». Jamais sur Entrée, jamais à la perte de focus, jamais
 * par un raccourci. Le formulaire n'a PAS de `onSubmit` qui envoie — un « Entrée » dans le champ objet ne doit pas
 * expédier un message à moitié écrit à un locataire. C'est la décision d'Arno, et c'est aussi la seule forme qui
 * pardonne une erreur de frappe.
 *
 * 🔴 PUIS UNE FENÊTRE POUR SE RAVISER. Après le clic, N secondes (réglage en base, 10 par défaut) pendant lesquelles
 * RIEN N'EST PARTI : aucune requête n'a quitté le navigateur. « Annuler l'envoi » revient simplement au brouillon.
 * Un envoi différé côté serveur aurait demandé une file d'attente et un moyen de l'annuler — trois choses de plus à
 * surveiller pour un besoin que dix secondes d'attente résolvent exactement.
 *
 * 🔴 DOUBLE-CLIC = UN SEUL ENVOI. Une clé d'idempotence est tirée à l'ouverture de la fenêtre d'annulation et
 * accompagne la requête ; c'est la BASE qui tranche (contrainte UNIQUE). Le bouton se désactive aussi, mais un bouton
 * désactivé ne protège pas d'un navigateur qui rejoue la requête.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * MOBILE D'ABORD : plein écran sur téléphone, champs à 16 px (en dessous, iOS zoome à chaque mise au point), pastilles
 * de destinataires qui passent à la ligne, aucune barre fixée en bas (le clavier iOS la recouvrirait), cibles ≥ 44 px,
 * aucune interaction au survol seul. Jetons `--color-svv-*` uniquement.
 */

export interface ContexteRedactionEcran {
  schemaPret: boolean;
  peutEnvoyer: boolean;
  jetonPresent: boolean;
  signature: string;
  nomExpediteur: string;
  adresseGestion: string;
  delaiAnnulationS: number;
}

type Etat =
  | { v: 'ecriture' }
  | { v: 'compte_a_rebours'; clicLe: Date; cle: string }
  | { v: 'envoi' }
  | { v: 'parti' }
  | { v: 'echec'; motif: string };

/** Ce que l'écran garde du brouillon, plus son identifiant en base une fois enregistré. */
export interface BrouillonEcran extends Brouillon { id: number | null }

/**
 * UN CHAMP DE DESTINATAIRES. Autant d'adresses que voulu, chacune en PASTILLE retirable — et le « × » est visible en
 * PERMANENCE, jamais au survol : au doigt, le survol n'existe pas, et une croix qui n'apparaît qu'à la souris est une
 * fonction inaccessible sur téléphone.
 *
 * On valide à la VALIDATION (Entrée, virgule, point-virgule, ou perte de focus), pas à chaque lettre : souligner en
 * rouge une adresse qu'on est en train de taper est un reproche permanent adressé à quelqu'un qui n'a rien fait.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CORRECTIF DU 24/09/2026 — LA SUGGESTION QU'ON NE POUVAIT PAS CHOISIR (défaut constaté par Arno au premier usage).
 *
 * LA CAUSE, établie en la rejouant dans `Redaction.suggestions.test.ts` avant d'écrire une ligne de correctif : un clic
 * sur une suggestion commence par faire PERDRE LE FOCUS au champ. `onBlur` validait alors le texte en cours de frappe
 * (« a. »), ce qui vidait la saisie — et la liste, conditionnée à deux caractères saisis, disparaissait de la page
 * AVANT que le clic n'arrive. On obtenait une pastille « a. » marquée incorrecte, et jamais l'adresse choisie.
 *
 * LE CORRECTIF tient en deux gestes, et il en faut DEUX parce qu'ils ne protègent pas de la même chose :
 *   ① `onMouseDown` annule son comportement par défaut → le focus NE QUITTE PAS le champ, donc `onBlur` ne se
 *      déclenche plus du tout. C'est la correction de la cause.
 *   ② le choix est fait DÈS `mousedown`, pas au `click` → même si un navigateur (ou un lecteur d'écran, ou un futur
 *      remaniement) refaisait perdre le focus, l'adresse est déjà entrée. `onClick` reste branché pour les chemins qui
 *      ne passent pas par la souris, et ajouter deux fois la même adresse ne fait rien : elle est déjà là.
 *
 * Et puisqu'on y était : les FLÈCHES parcourent la liste, « Entrée » choisit la proposition mise en avant, « Échap »
 * referme — au clavier, on ne devrait jamais avoir à viser à la souris.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function ChampDestinataires({ libelle, valeurs, onChange, suggestions, onChercher, autoFocus = false }: {
  libelle: string;
  valeurs: string[];
  onChange: (v: string[]) => void;
  suggestions: { adresse: string; nom: string | null }[];
  onChercher: (q: string) => void;
  autoFocus?: boolean;
}) {
  const [saisie, setSaisie] = useState('');
  // La proposition MISE EN AVANT au clavier. −1 = aucune : « Entrée » vaut alors ce qu'il a toujours valu, la
  //   validation du texte tapé. On ne met JAMAIS la première en avant d'office — ce serait choisir à la place d'Arno.
  const [avance, setAvance] = useState(-1);
  // « Échap » referme la liste sans rien choisir. Taper à nouveau la rouvre.
  const [repliee, setRepliee] = useState(false);
  // Les NOMS qu'on a appris en choisissant une suggestion. La valeur transmise reste l'ADRESSE seule (c'est elle qu'on
  //   envoie) ; le nom ne sert qu'à l'affichage — « Arno Jorel » se relit, « a.jorel@… » se déchiffre.
  const [noms, setNoms] = useState<Record<string, string>>({});
  const id = `dest-${libelle.toLowerCase().replace(/[^a-z]/g, '')}`;

  const ouverte = suggestions.length > 0 && saisie.trim().length >= 2 && !repliee;
  // Borné à CHAQUE rendu : la liste change pendant qu'on la parcourt (les suggestions arrivent du serveur), et un
  //   indice resté au-delà de la fin désignerait une proposition qui n'existe plus.
  const enAvant = ouverte && avance >= 0 && avance < suggestions.length ? avance : -1;

  const ajouter = (brut: string, nom?: string | null) => {
    const nouvelles = decouperAdresses(brut);
    const deja = new Set(valeurs);
    const ajouts = nouvelles.filter((a) => !deja.has(a));
    if (nom && nouvelles.length === 1) setNoms((n) => ({ ...n, [nouvelles[0]]: nom }));
    setAvance(-1);
    setRepliee(false);
    // Rien de neuf (champ vide, ou adresse déjà présente) : on vide quand même la saisie, mais on ne prévient pas le
    //   parent — un `onChange` qui rend la MÊME liste n'apporte rien et déclenche un enregistrement de brouillon.
    if (ajouts.length === 0) { if (brut !== '') { setSaisie(''); onChercher(''); } return; }
    onChange([...valeurs, ...ajouts]);
    setSaisie('');
    onChercher('');
  };

  /** Ce qu'on affiche dans la pastille : le nom s'il est connu, l'adresse sinon. L'adresse reste dans l'infobulle. */
  const libelleDe = (a: string) => noms[a] ?? a;
  const infobulleDe = (a: string) => (adresseValide(a) ? a : `Adresse incorrecte : ${a}`);

  return (
    <div className="red-champ">
      <label className="red-label" htmlFor={id}>{libelle}</label>
      <div className="red-pastilles">
        {valeurs.map((a) => (
          <span key={a} className={`red-pastille${adresseValide(a) ? '' : ' red-pastille--fautive'}`}
            title={infobulleDe(a)}>
            <span className="red-pastille-texte">{libelleDe(a)}</span>
            {/* Le « × » est un VRAI bouton, de 44 px, avec un libellé accessible : « retirer » doit se dire. */}
            <button type="button" className="red-retirer" aria-label={`Retirer ${a}`}
              onClick={() => onChange(valeurs.filter((x) => x !== a))}>
              ×
            </button>
          </span>
        ))}
        <input id={id} className="red-saisie" type="text" inputMode="email" autoComplete="off" autoFocus={autoFocus}
          value={saisie}
          role="combobox" aria-expanded={ouverte} aria-controls={`${id}-liste`} aria-autocomplete="list"
          aria-activedescendant={enAvant >= 0 ? `${id}-s${enAvant}` : undefined}
          onChange={(e) => {
            const v = e.target.value;
            // Une virgule ou un point-virgule VALIDE l'adresse : c'est le geste qu'on fait sans y penser.
            if (/[,;]$/.test(v)) { ajouter(v); return; }
            setSaisie(v);
            setAvance(-1);
            setRepliee(false);
            onChercher(v);
          }}
          onKeyDown={(e) => {
            // ⚠️ « Entrée » AJOUTE UNE ADRESSE — il n'envoie RIEN. `preventDefault` empêche toute soumission.
            if (e.key === 'Enter') {
              e.preventDefault();
              const choisie = enAvant >= 0 ? suggestions[enAvant] : null;
              if (choisie) ajouter(choisie.adresse, choisie.nom);
              else ajouter(saisie);
              return;
            }
            if (ouverte && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              // On ne sort JAMAIS de la liste par le haut ni par le bas : elle se borne à ses deux extrémités, pour
              //   qu'une flèche tenue ne ramène pas silencieusement sur la première ligne.
              e.preventDefault();
              const pas = e.key === 'ArrowDown' ? 1 : -1;
              const dernier = suggestions.length - 1;
              setAvance(Math.min(dernier, Math.max(0, (enAvant < 0 ? -1 : enAvant) + pas)));
              return;
            }
            if (e.key === 'Escape' && ouverte) { e.preventDefault(); setRepliee(true); setAvance(-1); return; }
            if (e.key === 'Backspace' && saisie === '' && valeurs.length > 0) onChange(valeurs.slice(0, -1));
          }}
          onBlur={() => ajouter(saisie)} />
      </div>
      {ouverte && (
        <ul className="red-suggestions" id={`${id}-liste`} role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.adresse} role="presentation">
              {/* 🔴 `onMouseDown` : on ANNULE le comportement par défaut (le focus reste dans le champ, donc `onBlur`
                  ne valide plus le texte à moitié tapé) ET on choisit TOUT DE SUITE. Les deux, pas l'un ou l'autre —
                  cf. l'encadré en tête de fichier. `onClick` sert les chemins sans souris ; il est sans effet une
                  seconde fois, l'adresse étant déjà entrée. */}
              <button type="button" id={`${id}-s${i}`} role="option" aria-selected={i === enAvant}
                className={`red-suggestion${i === enAvant ? ' red-suggestion--avance' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); ajouter(s.adresse, s.nom); }}
                onClick={() => ajouter(s.adresse, s.nom)}>
                {s.nom ? `${s.nom} — ` : ''}{s.adresse}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Redaction({ brouillon, contexte, onChange, onFerme, onEnvoye, onGeste }: {
  brouillon: BrouillonEcran;
  contexte: ContexteRedactionEcran;
  onChange: (b: BrouillonEcran) => void;
  onFerme: () => void;
  onEnvoye: () => void;
  onGeste: (message: string) => void;
}) {
  const [etat, setEtat] = useState<Etat>({ v: 'ecriture' });
  const [copies, setCopies] = useState(brouillon.cc.length > 0 || brouillon.cci.length > 0);
  const [citationOuverte, setCitationOuverte] = useState(false);
  const [suggestions, setSuggestions] = useState<{ adresse: string; nom: string | null }[]>([]);
  const [reste, setReste] = useState(0);
  // La clé d'idempotence et le minuteur vivent dans des `ref` : un nouveau rendu ne doit ni en tirer une seconde, ni
  //   relancer le compte à rebours.
  const minuteur = useRef<ReturnType<typeof setInterval> | null>(null);

  const modifier = (p: Partial<BrouillonEcran>) => onChange({ ...brouillon, ...p });

  // ── ENREGISTREMENT AUTOMATIQUE. 🔴 Il n'envoie JAMAIS rien : la route des brouillons n'importe aucun chemin
  //    d'envoi (un test statique le vérifie). On attend que la frappe se calme — enregistrer à chaque lettre ferait
  //    une requête par caractère.
  const aEnregistrer = useRef<BrouillonEcran>(brouillon);
  // Le ref suit le brouillon DANS UN EFFET, jamais pendant le rendu : React interdit d'écrire un ref au rendu, et
  //   le faire quand même casse le rendu concurrent (l'état lu n'est alors plus celui qu'on affiche).
  useEffect(() => { aEnregistrer.current = brouillon; }, [brouillon]);
  useEffect(() => {
    if (!contexte.schemaPret || !contexte.peutEnvoyer) return;
    const t = setTimeout(() => {
      const b = aEnregistrer.current;
      if (b.objet.trim() === '' && b.corps.trim() === '' && b.a.length === 0) return; // rien à garder
      void (async () => {
        try {
          const res = await fetch('/api/admin/gestion/brouillons', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: b.id, filId: b.filId, repondAMessageId: b.repondALeMessageId, voie: b.voie,
              a: b.a, cc: b.cc, cci: b.cci, objet: b.objet, corps: b.corps, citation: b.citation,
            }),
          });
          const d = (await res.json().catch(() => ({}))) as { brouillon?: { id: number } };
          if (res.ok && d.brouillon && aEnregistrer.current.id === null) {
            onChange({ ...aEnregistrer.current, id: d.brouillon.id });
          }
        } catch { /* un brouillon non enregistré n'est pas une panne : ce qui est à l'écran reste à l'écran */ }
      })();
    }, 1200);
    return () => clearTimeout(t);
  }, [brouillon, contexte.schemaPret, contexte.peutEnvoyer, onChange]);

  const chercherCorrespondants = useCallback((q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); return; }
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/correspondants?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const d = (await res.json()) as { correspondants: { adresse: string; nom: string | null }[] };
        setSuggestions(d.correspondants ?? []);
      } catch { setSuggestions([]); }
    })();
  }, []);

  /** L'ENVOI RÉEL. Appelé UNIQUEMENT quand la fenêtre d'annulation est écoulée — jamais directement par un clic. */
  const envoyerVraiment = useCallback(async (cle: string) => {
    setEtat({ v: 'envoi' });
    const b = aEnregistrer.current;
    try {
      const res = await fetch('/api/admin/gestion/envois', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cleIdempotence: cle, brouillonId: b.id, filId: b.filId, repondAMessageId: b.repondALeMessageId,
          a: b.a, cc: b.cc, cci: b.cci, objet: b.objet,
          // La citation part À LA SUITE du message : ce qu'on a écrit d'abord, ce qu'on cite ensuite.
          corps: b.citation ? `${b.corps}\n\n${b.citation}` : b.corps,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !d.ok) { setEtat({ v: 'echec', motif: d.erreur ?? 'Envoi impossible.' }); return; }
      setEtat({ v: 'parti' });
      onGeste('Message envoyé.');
      onEnvoye();
    } catch {
      setEtat({ v: 'echec', motif: 'Envoi impossible : le serveur n’a pas répondu. Le brouillon est conservé.' });
    }
  }, [onEnvoye, onGeste]);

  // LE COMPTE À REBOURS. Tant qu'il court, RIEN n'est parti : aucune requête n'a quitté le navigateur.
  useEffect(() => {
    if (etat.v !== 'compte_a_rebours') return;
    const { clicLe, cle } = etat;
    const tic = () => {
      const r = secondesRestantes(clicLe, new Date(), contexte.delaiAnnulationS);
      setReste(r);
      if (r === 0) {
        if (minuteur.current) clearInterval(minuteur.current);
        void envoyerVraiment(cle);
      }
    };
    tic();
    minuteur.current = setInterval(tic, 250);
    return () => { if (minuteur.current) clearInterval(minuteur.current); };
  }, [etat, contexte.delaiAnnulationS, envoyerVraiment]);

  const pret = pretAEnvoyer(brouillon);
  const titre = brouillon.voie === 'transferer' ? 'Transférer'
    : brouillon.voie === 'nouveau' ? 'Nouveau message'
      : brouillon.voie === 'repondre_tous' ? 'Répondre à tous' : 'Répondre';

  // ── ÉTATS D'APRÈS-CLIC ────────────────────────────────────────────────────────────────────────────────────────
  if (etat.v === 'compte_a_rebours') {
    return (
      <section className="red red-apres" aria-live="polite">
        <style>{CSS_REDACTION}</style>
        <p className="red-etat">Envoi dans {reste} seconde{reste > 1 ? 's' : ''}… <strong>rien n’est encore parti.</strong></p>
        <div className="gst-actions">
          <button type="button" className="svv-btn svv-btn-primary gst-btn"
            onClick={() => { if (minuteur.current) clearInterval(minuteur.current); setEtat({ v: 'ecriture' }); onGeste('Envoi annulé : votre message est resté en brouillon.'); }}>
            Annuler l’envoi
          </button>
        </div>
      </section>
    );
  }
  if (etat.v === 'envoi') {
    return (
      <section className="red red-apres" aria-live="polite">
        <style>{CSS_REDACTION}</style>
        <p className="red-etat" role="status">Envoi en cours…</p>
      </section>
    );
  }
  if (etat.v === 'parti') {
    return (
      <section className="red red-apres" aria-live="polite">
        <style>{CSS_REDACTION}</style>
        <p className="red-etat">✅ Message <strong>envoyé</strong>.</p>
      </section>
    );
  }

  return (
    <section className="red" aria-label={titre}>
      <style>{CSS_REDACTION}</style>

      <div className="red-haut">
        <h3 className="gst-titre">{titre}</h3>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>Fermer</button>
      </div>

      <p className="gst-note">De : {contexte.nomExpediteur} &lt;{contexte.adresseGestion}&gt;</p>

      {/* 🔴 CE QUI EMPÊCHERAIT D'ENVOYER, DIT AVANT D'ÉCRIRE. On n'attend pas le clic pour l'annoncer. */}
      {!contexte.jetonPresent && (
        <p className="gst-tronc">
          La connexion Google de gestion@ n’est pas encore faite : vous pouvez écrire et enregistrer, mais l’envoi
          échouera. Voir <code>docs/GUIDE_CONNEXION_GOOGLE_GESTION.md</code>.
        </p>
      )}
      {etat.v === 'echec' && <p className="gst-compte-rendu gst-ton-erreur" role="status">{etat.motif}</p>}

      <ChampDestinataires libelle="À" valeurs={brouillon.a} onChange={(a) => modifier({ a })}
        suggestions={suggestions} onChercher={chercherCorrespondants} autoFocus={brouillon.a.length === 0} />

      {/* Cc et Cci REPLIÉS par défaut : neuf messages sur dix n'en ont pas, et deux champs vides de plus font croire
          qu'il faut les remplir. Le bouton dit combien il en cache, pour qu'on ne les oublie pas. */}
      {!copies ? (
        <button type="button" className="gst-lien-bouton" onClick={() => setCopies(true)}>
          Ajouter Cc / Cci
        </button>
      ) : (
        <>
          <ChampDestinataires libelle="Cc" valeurs={brouillon.cc} onChange={(cc) => modifier({ cc })}
            suggestions={suggestions} onChercher={chercherCorrespondants} />
          <ChampDestinataires libelle="Cci" valeurs={brouillon.cci} onChange={(cci) => modifier({ cci })}
            suggestions={suggestions} onChercher={chercherCorrespondants} />
        </>
      )}

      {brouillon.destinatairesApproximatifs && (
        <p className="gst-tronc red-avertit">⚠ {MENTION_DESTINATAIRES_APPROXIMATIFS}</p>
      )}

      <div className="red-champ">
        <label className="red-label" htmlFor="red-objet">Objet</label>
        {/* ⚠️ « Entrée » ici ne doit RIEN envoyer : le champ n'est pas dans un formulaire, et rien n'écoute la touche. */}
        <input id="red-objet" className="red-saisie red-saisie--pleine" value={brouillon.objet} maxLength={500}
          onChange={(e) => modifier({ objet: e.target.value })} />
      </div>

      <div className="red-champ">
        <label className="red-label" htmlFor="red-corps">Message</label>
        <textarea id="red-corps" className="red-corps" rows={10} value={brouillon.corps}
          onChange={(e) => modifier({ corps: e.target.value })} />
      </div>

      {contexte.signature.trim() === '' && <p className="gst-note">{MENTION_SANS_SIGNATURE}</p>}
      {brouillon.voie === 'transferer' && <p className="gst-note">{MENTION_PIECES_NON_JOINTES}</p>}

      {/* LA CITATION, REPLIÉE : on écrit au-dessus, on ne relit pas ce qu'on vient de lire. Elle part avec le message. */}
      {brouillon.citation && (
        <details className="gst-cite" open={citationOuverte} onToggle={(e) => setCitationOuverte((e.target as HTMLDetailsElement).open)}>
          <summary className="gst-cite-titre">Message d’origine (envoyé avec la réponse)</summary>
          <p className="gst-msg-corps gst-cite-corps">{brouillon.citation}</p>
        </details>
      )}

      {!pret.pret && <p className="gst-note red-avertit">{pret.motif}</p>}

      <div className="gst-actions red-bas">
        {/* 🔴 LE SEUL CHEMIN D'ENVOI : ce clic, et lui seul. Il n'envoie même pas tout de suite — il ouvre la fenêtre
            d'annulation. Aucun `type="submit"`, aucun formulaire : « Entrée » ne peut pas déclencher cela. */}
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!pret.pret}
          onClick={() => setEtat({
            v: 'compte_a_rebours', clicLe: new Date(),
            cle: `${brouillon.id ?? 'x'}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          })}>
          Envoyer
        </button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>
          Garder en brouillon
        </button>
      </div>
    </section>
  );
}

const CSS_REDACTION = `
.red{display:flex;flex-direction:column;gap:10px;min-width:0;padding:12px 0;border-top:1px solid var(--color-svv-line)}
.red-apres{align-items:flex-start}
.red-haut{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem}
.red-haut .gst-titre{margin:0}
.red-champ{display:flex;flex-direction:column;gap:3px;min-width:0}
.red-label{font-size:.75rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--color-svv-muted)}
/* Les pastilles PASSENT À LA LIGNE : sur un téléphone, six destinataires ne tiennent pas sur une ligne, et une barre
   qui défile horizontalement cache la moitié des adresses sans le dire. */
.red-pastilles{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px;min-height:44px;
  border:1px solid var(--color-svv-line-strong);border-radius:.6rem;background:var(--color-svv-surface)}
.red-pastille{display:inline-flex;align-items:center;gap:2px;max-width:100%;padding:2px 2px 2px 8px;border-radius:999px;
  background:var(--color-svv-field);border:1px solid var(--color-svv-line);font-size:.8rem;color:var(--color-svv-ink)}
/* Une adresse fautive est dite par un MOT dans son infobulle ET par une bordure : jamais par la seule couleur. */
.red-pastille--fautive{border-color:var(--color-svv-red);border-style:dashed;color:var(--color-svv-red)}
.red-pastille-texte{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Le « × » est visible EN PERMANENCE, jamais au survol : au doigt, le survol n'existe pas. */
.red-retirer{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;margin:-10px 0;
  padding:0;font-size:1.1rem;line-height:1;color:var(--color-svv-muted);background:transparent;border:0;cursor:pointer}
.red-retirer:hover{color:var(--color-svv-red)}
.red-retirer:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:999px}
/* 16 px MINIMUM : en dessous, iOS zoome à chaque mise au point et l'écran part de travers. */
.red-saisie{flex:1 1 8rem;min-width:0;min-height:40px;padding:.35rem .4rem;font-size:16px;border:0;background:transparent;
  color:var(--color-svv-ink)}
.red-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:.3rem}
/* 🔴 flex:0 0 auto OBLIGATOIRE. La classe red-saisie porte flex:1 1 8rem : dans la barre de destinataires (en LIGNE),
   ces 8 rem sont une largeur de départ, ce qu'on veut. Mais l'objet vit dans red-champ, qui est une COLONNE — la même
   base devenait une HAUTEUR, et le champ « Objet » s'affichait haut de 8 rem au lieu d'une ligne (défaut vu par Arno
   le 24/09/2026). On remet une hauteur dictée par le contenu ; min-height:44px garde la cible tactile. */
.red-saisie--pleine{flex:0 0 auto;min-height:44px;height:44px;padding:.5rem .7rem;
  border:1px solid var(--color-svv-line-strong);border-radius:.6rem;
  background:var(--color-svv-surface);width:100%;box-sizing:border-box}
.red-corps{width:100%;box-sizing:border-box;min-height:180px;padding:.6rem .7rem;font:inherit;font-size:16px;
  line-height:1.5;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;background:var(--color-svv-surface);
  color:var(--color-svv-ink);resize:vertical}
.red-corps:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.red-suggestions{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:2px;
  max-height:min(40vh,240px);overflow-y:auto}
.red-suggestion{width:100%;min-height:44px;padding:.4rem .6rem;text-align:left;font:inherit;font-size:.85rem;
  color:var(--color-svv-ink);background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  border-radius:.5rem;cursor:pointer}
.red-suggestion:hover,.red-suggestion:focus-visible{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
/* La proposition mise en avant AU CLAVIER. Elle se distingue par une bordure ET un fond, pas par la seule teinte :
   au clavier comme au doigt, il faut voir OÙ l'on est sans avoir à comparer deux nuances de gris. */
.red-suggestion--avance{border-color:var(--color-svv-red);background:var(--color-svv-field);font-weight:600}
.red-avertit{color:var(--color-svv-red);font-weight:600}
.red-etat{margin:0;font-size:.9rem;color:var(--color-svv-ink)}
/* AUCUNE barre fixée en bas : le clavier d'iOS la recouvrirait, et le bouton « Envoyer » deviendrait inatteignable. */
.red-bas{margin-top:4px}
`;
