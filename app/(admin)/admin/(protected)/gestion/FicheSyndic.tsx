'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  apercuPropagation, cleImmeuble, contactVide, coordonneeVide, coproprietesRetirees, formulaireVide,
  immeublesQuiRepondent, LIBELLES_COORDONNEE, nomDuContact, PERSONNALISE, TITRES_CONTACT, versFormulaire, versSaisie,
  type ContactForm, type CoordonneeForm, type FicheSyndic as Fiche, type SorteCoordonnee, type SyndicForm,
  type SyndicResume,
} from '../../../../lib/gestion/syndics';
import { rafraichirImmeubles, useImmeublesSyndics } from './useImmeublesSyndics';

/**
 * ══ 🔴🔴 LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN — LA FICHE SYNDIC (UN SEUL COMPOSANT, RÉUTILISABLE TEL QUEL) ═══════════
 *
 * ARNO : « Modale / fiche syndic (un seul composant, réutilisable tel quel dans la future tuile Location). »
 *
 * Elle s'ouvre de trois façons, et c'est toujours elle :
 *   · depuis la carte d'un bien dont l'immeuble a un syndic   → `syndicId` connu : LECTURE, puis « Modifier » ;
 *   · depuis la carte d'un bien sans syndic                   → `syndicId` nul + `immeubleDepart` : RECHERCHE d'un
 *     syndic existant (« Rattacher cet immeuble à ce syndic »), sinon « Créer un nouveau syndic » ;
 *   · depuis l'écran « Syndics »                              → l'un ou l'autre, sans immeuble de départ.
 *
 * 🔴 RIEN NE S'ENREGISTRE SANS LA LISTE DES BIENS. « AVANT VALIDATION : afficher la liste des biens qui recevront ce
 * syndic → l'utilisateur confirme → propagation. » L'étape CONFIRMATION montre tous les lots des copropriétés
 * rattachées, les immeubles qui changent de syndic, et ceux qui seront retirés (le lien passe en historique).
 *
 * 🔴 UNE SEULE ÉCRITURE : la fiche entière part en un PUT (ou un POST pour une création), et le serveur la
 * re-valide. Ce qui manque est retiré ou fermé, jamais effacé.
 *
 * MOBILE : la modale prend tout l'écran sous 640 px, les champs passent à 16 px (iOS ne zoome pas), cibles ≥ 44 px.
 */
type Mode = 'chargement' | 'recherche' | 'lecture' | 'edition' | 'confirmation' | 'erreur';

export function FicheSyndic({ syndicId: idInitial, immeubleDepart = null, onFerme, onEcrire }: {
  /** `null` = aucun syndic encore : on commence par chercher un syndic existant. */
  syndicId: number | null;
  /** L'« Immeuble » WIPPIMMO du bien depuis lequel on vient : pré-rempli comme copropriété. */
  immeubleDepart?: string | null;
  onFerme: () => void;
  /** Écrire depuis gestion@ par le composeur existant. Absent ⇒ le lien `mailto:` suffit. */
  onEcrire?: (email: string) => void;
}) {
  const [syndicId, setSyndicId] = useState<number | null>(idInitial);
  const [mode, setMode] = useState<Mode>(idInitial === null ? 'recherche' : 'chargement');
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [form, setForm] = useState<SyndicForm>(() => formulaireVide(immeubleDepart));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const boite = useRef<HTMLDivElement | null>(null);
  const immeubles = useImmeublesSyndics();

  const charger = useCallback(async (id: number): Promise<Fiche | null> => {
    setMode('chargement');
    try {
      const r = await fetch(`/api/admin/gestion/syndics/${id}`, { cache: 'no-store' });
      const j = (await r.json()) as { etat?: string; fiche?: Fiche; message?: string };
      if (!r.ok || j.etat !== 'ok' || !j.fiche) { setErreur(j.message ?? 'Lecture impossible.'); setMode('erreur'); return null; }
      setFiche(j.fiche);
      setMode('lecture');
      return j.fiche;
    } catch {
      setErreur('Lecture impossible : le serveur n’a pas répondu.'); setMode('erreur'); return null;
    }
  }, []);

  useEffect(() => { if (idInitial !== null) void charger(idInitial); }, [idInitial, charger]);

  // Échap ferme, où que soit le focus (même règle que les autres modales du module).
  useEffect(() => {
    const auClavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onFerme(); } };
    document.addEventListener('keydown', auClavier, true);
    boite.current?.focus();
    return () => document.removeEventListener('keydown', auClavier, true);
  }, [onFerme]);

  /** « Rattacher cet immeuble à ce syndic » : on ouvre SA fiche en modification, l'immeuble déjà ajouté. */
  const rattacherA = async (id: number): Promise<void> => {
    setSyndicId(id);
    const f = await charger(id);
    if (f === null) return;
    const base = versFormulaire(f);
    const i = (immeubleDepart ?? '').trim();
    if (i !== '' && !base.immeubles.some((x) => cleImmeuble(x) === cleImmeuble(i))) base.immeubles.push(i);
    setForm(base);
    setMode('edition');
  };

  const enregistrer = async (): Promise<void> => {
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(syndicId === null ? '/api/admin/gestion/syndics' : `/api/admin/gestion/syndics/${syndicId}`, {
        method: syndicId === null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(versSaisie(form)),
      });
      const j = (await r.json()) as { ok?: boolean; id?: number; erreur?: string };
      if (!r.ok || j.ok !== true || typeof j.id !== 'number') { setErreur(j.erreur ?? 'Enregistrement impossible.'); setMode('edition'); return; }
      setSyndicId(j.id);
      await rafraichirImmeubles();
      await charger(j.id);
    } catch {
      setErreur('Enregistrement impossible : le serveur n’a pas répondu.'); setMode('edition');
    } finally {
      setEnvoi(false);
    }
  };

  const titre = mode === 'recherche' ? 'Syndic de la copropriété'
    : syndicId === null ? 'Créer un syndic'
      : mode === 'lecture' && fiche ? fiche.nom : 'Modifier le syndic';

  return (
    <div className="fsy-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFerme(); }}>
      <style>{CSS_FICHE_SYNDIC}</style>
      <div className="fsy" role="dialog" aria-modal="true" aria-labelledby="fsy-titre" tabIndex={-1} ref={boite}>
        <div className="fsy-tete">
          <h2 className="fsy-titre" id="fsy-titre">{titre}</h2>
          <button type="button" className="fsy-croix" aria-label="Fermer" onClick={onFerme}>×</button>
        </div>
        {immeubles !== null && !immeubles.disponible && (
          <p className="fsy-alerte">L’annuaire des syndics n’est pas encore installé (migration 324).</p>
        )}
        {erreur !== null && <p className="fsy-alerte" role="alert">{erreur}</p>}

        {mode === 'chargement' && <p className="fsy-discret">Chargement…</p>}
        {mode === 'erreur' && (
          <div className="fsy-boutons"><button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>Fermer</button></div>
        )}
        {mode === 'recherche' && (
          <Recherche immeubleDepart={immeubleDepart} onRattacher={(id) => void rattacherA(id)}
            onCreer={() => { setForm(formulaireVide(immeubleDepart)); setMode('edition'); }} />
        )}
        {mode === 'lecture' && fiche !== null && (
          <Lecture fiche={fiche} onEcrire={onEcrire}
            onModifier={() => { setForm(versFormulaire(fiche)); setErreur(null); setMode('edition'); }} />
        )}
        {mode === 'edition' && (
          <Edition form={form} setForm={setForm}
            onAnnuler={() => { setErreur(null); if (fiche !== null && syndicId !== null) setMode('lecture'); else onFerme(); }}
            onSuite={() => {
              if (form.nom.trim() === '') { setErreur('Le nom du cabinet est obligatoire.'); return; }
              setErreur(null); setMode('confirmation');
            }} />
        )}
        {mode === 'confirmation' && (
          <Confirmation form={form} avant={fiche?.coproprietes.map((c) => c.libelle) ?? []} syndicId={syndicId}
            envoi={envoi} onRetour={() => setMode('edition')} onConfirmer={() => void enregistrer()} />
        )}
      </div>
    </div>
  );
}

// ══ ÉTAPE 1 — CHERCHER UN SYNDIC EXISTANT ═══════════════════════════════════════════════════════════════════════

function Recherche({ immeubleDepart, onRattacher, onCreer }: {
  immeubleDepart: string | null; onRattacher: (id: number) => void; onCreer: () => void;
}) {
  const [q, setQ] = useState('');
  const [liste, setListe] = useState<SyndicResume[] | null>(null);
  useEffect(() => {
    let vivant = true;
    const t = setTimeout(() => {
      void fetch(`/api/admin/gestion/syndics?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then((r) => r.json() as Promise<{ syndics?: SyndicResume[] }>)
        .then((j) => { if (vivant) setListe(j.syndics ?? []); })
        .catch(() => { if (vivant) setListe([]); });
    }, 200);
    return () => { vivant = false; clearTimeout(t); };
  }, [q]);
  const i = (immeubleDepart ?? '').trim();
  return (
    <div className="fsy-bloc">
      {i !== '' ? (
        <p className="fsy-discret">Immeuble : <strong>{i}</strong> — aucun syndic connu pour cette copropriété.</p>
      ) : immeubleDepart !== null && (
        <p className="fsy-discret">Ce bien n’a pas d’« Immeuble » dans l’export WIPPIMMO : il ne recevra un syndic que par son immeuble.</p>
      )}
      <label className="fsy-champ">
        <span>Chercher un syndic existant (nom, e-mail, domaine)</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex. Citya, foncia.com…" autoFocus />
      </label>
      {liste === null ? <p className="fsy-discret">Recherche…</p> : liste.length === 0 ? (
        <p className="fsy-discret">Aucun syndic {q.trim() === '' ? 'enregistré pour l’instant' : 'ne répond à cette recherche'}.</p>
      ) : (
        <ul className="fsy-resultats">
          {liste.map((s) => (
            <li key={s.id} className="fsy-resultat">
              <span className="fsy-resultat-nom">
                <strong>{s.nom}</strong>
                <span className="fsy-discret">{s.nbCoproprietes} copropriété{s.nbCoproprietes > 1 ? 's' : ''} · {s.nbBiens} bien{s.nbBiens > 1 ? 's' : ''}{s.email ? ` · ${s.email}` : ''}</span>
              </span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onRattacher(s.id)}>
                {i !== '' ? 'Rattacher cet immeuble à ce syndic' : 'Ouvrir'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="fsy-boutons">
        <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onCreer}>Créer un nouveau syndic</button>
      </div>
    </div>
  );
}

// ══ LECTURE — LES COORDONNÉES CLIQUABLES ═════════════════════════════════════════════════════════════════════════

function LienEmail({ email, onEcrire }: { email: string; onEcrire?: (email: string) => void }) {
  return (
    <span className="fsy-coord">
      <a href={`mailto:${email}`}>{email}</a>
      {onEcrire && (
        <button type="button" className="fsy-lien-bouton" onClick={() => onEcrire(email)}
          title="Écrire depuis gestion@ avec le composeur de l’application">Écrire depuis gestion@</button>
      )}
    </span>
  );
}

function lienTel(v: string): string { return `tel:${v.replace(/[^\d+]/g, '')}`; }

function Lecture({ fiche: f, onModifier, onEcrire }: { fiche: Fiche; onModifier: () => void; onEcrire?: (email: string) => void }) {
  const nbBiens = f.coproprietes.reduce((n, c) => n + c.lots.length, 0);
  return (
    <div className="fsy-bloc">
      <dl className="fsy-champs">
        {f.adresse && <><dt>Adresse</dt><dd>{f.adresse}</dd></>}
        {f.telephone && <><dt>Standard</dt><dd><a href={lienTel(f.telephone)}>{f.telephone}</a></dd></>}
        {f.email && <><dt>E-mail</dt><dd><LienEmail email={f.email} onEcrire={onEcrire} /></dd></>}
        {f.note && <><dt>Note</dt><dd className="fsy-note">{f.note}</dd></>}
      </dl>

      <h3 className="fsy-sous-titre">Contacts</h3>
      {f.contacts.length === 0 ? <p className="fsy-discret">Aucun contact.</p> : (
        <ul className="fsy-contacts">
          {f.contacts.map((c) => (
            <li key={c.id} className="fsy-contact">
              <strong>{nomDuContact(c)}</strong>
              {c.titre && nomDuContact(c) !== c.titre && <span className="fsy-discret"> — {c.titre}</span>}
              <ul className="fsy-coords">
                {c.coordonnees.map((k) => (
                  <li key={k.id}>
                    {k.libelle && <span className="fsy-libelle">{k.libelle} : </span>}
                    {k.sorte === 'email' ? <LienEmail email={k.valeur} onEcrire={onEcrire} /> : <a href={lienTel(k.valeur)}>{k.valeur}</a>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <h3 className="fsy-sous-titre">Copropriétés ({f.coproprietes.length}) · {nbBiens} bien{nbBiens > 1 ? 's' : ''}</h3>
      {f.coproprietes.length === 0 ? <p className="fsy-discret">Aucune copropriété rattachée.</p> : (
        <ul className="fsy-copros">
          {f.coproprietes.map((c) => (
            <li key={c.id}>
              <strong>{c.libelle}</strong>
              <span className="fsy-discret"> — {c.lots.length === 0 ? 'aucun bien en gestion' : c.lots.map((l) => `lot ${l.numero}`).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
      {f.historique.length > 0 && (
        <details className="fsy-historique">
          <summary>Historique ({f.historique.length})</summary>
          <ul>
            {f.historique.map((h, i) => (
              <li key={i}>{h.libelle} — du {jour(h.debut)} au {jour(h.fin)}{h.motif ? ` (${h.motif})` : ''}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="fsy-discret fsy-pied">
        Créé le {jour(f.creeLe)} par {f.creeParLibelle}{f.majLe ? ` · modifié le ${jour(f.majLe)} par ${f.majParLibelle ?? '—'}` : ''}
      </p>
      <div className="fsy-boutons">
        <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onModifier}>Modifier</button>
      </div>
    </div>
  );
}

function jour(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
}

// ══ MODIFICATION ════════════════════════════════════════════════════════════════════════════════════════════════

function Edition({ form, setForm, onAnnuler, onSuite }: {
  form: SyndicForm; setForm: (f: SyndicForm) => void; onAnnuler: () => void; onSuite: () => void;
}) {
  const champ = (k: 'nom' | 'adresse' | 'telephone' | 'email', libelle: string, type = 'text') => (
    <label className="fsy-champ">
      <span>{libelle}</span>
      <input type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </label>
  );
  const majContact = (cle: string, c: ContactForm): void =>
    setForm({ ...form, contacts: form.contacts.map((x) => (x.cle === cle ? c : x)) });
  return (
    <div className="fsy-bloc">
      {champ('nom', 'Nom du cabinet *')}
      {champ('adresse', 'Adresse')}
      <div className="fsy-duo">
        {champ('telephone', 'Téléphone standard', 'tel')}
        {champ('email', 'E-mail générique', 'email')}
      </div>
      <label className="fsy-champ">
        <span>Note</span>
        <textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </label>

      <h3 className="fsy-sous-titre">Contacts</h3>
      {form.contacts.map((c) => (
        <EditionContact key={c.cle} c={c} onChange={(n) => majContact(c.cle, n)}
          onRetirer={() => setForm({ ...form, contacts: form.contacts.filter((x) => x.cle !== c.cle) })} />
      ))}
      <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-ajout"
        onClick={() => setForm({ ...form, contacts: [...form.contacts, contactVide()] })}>+ Ajouter un contact</button>

      <h3 className="fsy-sous-titre">Copropriétés</h3>
      <EditionCopros immeubles={form.immeubles} onChange={(l) => setForm({ ...form, immeubles: l })} />

      <div className="fsy-boutons">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler}>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onSuite}>Vérifier et enregistrer</button>
      </div>
    </div>
  );
}

function SelectChoix({ libelle, choix, libre, options, onChange }: {
  libelle: string; choix: string; libre: string; options: readonly string[];
  onChange: (choix: string, libre: string) => void;
}) {
  return (
    <span className="fsy-choix">
      <label className="fsy-champ">
        <span>{libelle}</span>
        <select value={choix} onChange={(e) => onChange(e.target.value, libre)}>
          <option value="">—</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value={PERSONNALISE}>{PERSONNALISE}…</option>
        </select>
      </label>
      {choix === PERSONNALISE && (
        <label className="fsy-champ">
          <span>{libelle} personnalisé</span>
          <input type="text" value={libre} onChange={(e) => onChange(choix, e.target.value)} />
        </label>
      )}
    </span>
  );
}

function EditionContact({ c, onChange, onRetirer }: { c: ContactForm; onChange: (c: ContactForm) => void; onRetirer: () => void }) {
  const majCoord = (cle: string, k: CoordonneeForm): void =>
    onChange({ ...c, coordonnees: c.coordonnees.map((x) => (x.cle === cle ? k : x)) });
  const ajouter = (sorte: SorteCoordonnee): void => onChange({ ...c, coordonnees: [...c.coordonnees, coordonneeVide(sorte)] });
  return (
    <fieldset className="fsy-contact-edit">
      <legend>{nomDuContact({ titre: c.titreChoix === PERSONNALISE ? c.titreLibre : c.titreChoix, prenom: c.prenom, nom: c.nom }) || 'Nouveau contact'}</legend>
      <SelectChoix libelle="Titre" choix={c.titreChoix} libre={c.titreLibre} options={TITRES_CONTACT}
        onChange={(choix, libre) => onChange({ ...c, titreChoix: choix, titreLibre: libre })} />
      <div className="fsy-duo">
        <label className="fsy-champ"><span>Prénom</span>
          <input type="text" value={c.prenom} onChange={(e) => onChange({ ...c, prenom: e.target.value })} /></label>
        <label className="fsy-champ"><span>Nom</span>
          <input type="text" value={c.nom} onChange={(e) => onChange({ ...c, nom: e.target.value })} /></label>
      </div>
      {c.coordonnees.map((k) => (
        <div key={k.cle} className="fsy-coord-edit">
          <SelectChoix libelle="Libellé" choix={k.choix} libre={k.libre} options={LIBELLES_COORDONNEE}
            onChange={(choix, libre) => majCoord(k.cle, { ...k, choix, libre })} />
          <label className="fsy-champ fsy-champ--large">
            <span>{k.sorte === 'email' ? 'E-mail' : 'Téléphone'}</span>
            <input type={k.sorte === 'email' ? 'email' : 'tel'} value={k.valeur}
              onChange={(e) => majCoord(k.cle, { ...k, valeur: e.target.value })} />
          </label>
          <button type="button" className="fsy-lien-bouton" onClick={() => onChange({ ...c, coordonnees: c.coordonnees.filter((x) => x.cle !== k.cle) })}>
            Retirer
          </button>
        </div>
      ))}
      <div className="fsy-ligne-ajouts">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => ajouter('email')}>+ e-mail</button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => ajouter('telephone')}>+ téléphone</button>
        <button type="button" className="fsy-lien-bouton fsy-retirer-contact" onClick={onRetirer}>Retirer ce contact</button>
      </div>
    </fieldset>
  );
}

function EditionCopros({ immeubles, onChange }: { immeubles: string[]; onChange: (l: string[]) => void }) {
  const connus = useImmeublesSyndics();
  const [saisie, setSaisie] = useState('');
  const [aRetirer, setARetirer] = useState<string | null>(null);
  const propositions = useMemo(
    () => immeublesQuiRepondent(saisie, connus?.immeubles ?? [])
      .filter((i) => !immeubles.some((x) => cleImmeuble(x) === i.cle)),
    [saisie, connus, immeubles]);
  const ajouter = (libelle: string): void => {
    const l = libelle.trim();
    if (l === '' || immeubles.some((x) => cleImmeuble(x) === cleImmeuble(l))) { setSaisie(''); return; }
    onChange([...immeubles, l]); setSaisie('');
  };
  return (
    <div className="fsy-bloc">
      {immeubles.length === 0 && <p className="fsy-discret">Aucune copropriété.</p>}
      <ul className="fsy-copros">
        {immeubles.map((l) => (
          <li key={cleImmeuble(l)} className="fsy-copro-edit">
            <span>{l}</span>
            {aRetirer === l ? (
              <span className="fsy-confirmer-retrait" role="group" aria-label="Confirmer le retrait">
                <span>Retirer ? Le lien passe en historique.</span>
                <button type="button" className="svv-btn svv-btn-outline gst-btn"
                  onClick={() => { onChange(immeubles.filter((x) => x !== l)); setARetirer(null); }}>Oui, retirer</button>
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setARetirer(null)}>Non</button>
              </span>
            ) : (
              <button type="button" className="fsy-lien-bouton" onClick={() => setARetirer(l)}>Retirer</button>
            )}
          </li>
        ))}
      </ul>
      <label className="fsy-champ">
        <span>+ Ajouter une copropriété (immeuble)</span>
        <input type="text" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="ex. 12 rue …"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouter(saisie); } }} />
      </label>
      {propositions.length > 0 && (
        <ul className="fsy-propositions" aria-label="Immeubles connus de l’annuaire">
          {propositions.map((i) => (
            <li key={i.cle}>
              <button type="button" className="fsy-proposition" onClick={() => ajouter(i.libelle)}>
                {i.libelle}
                <span className="fsy-discret"> — {i.lots.length} bien{i.lots.length > 1 ? 's' : ''}{i.syndic ? ` · syndic : ${i.syndic.nom}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {saisie.trim() !== '' && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-ajout" onClick={() => ajouter(saisie)}>
          Ajouter « {saisie.trim()} »
        </button>
      )}
    </div>
  );
}

// ══ CONFIRMATION — LES BIENS QUI RECEVRONT CE SYNDIC ═════════════════════════════════════════════════════════════

function Confirmation({ form, avant, syndicId, envoi, onRetour, onConfirmer }: {
  form: SyndicForm; avant: string[]; syndicId: number | null; envoi: boolean; onRetour: () => void; onConfirmer: () => void;
}) {
  const connus = useImmeublesSyndics();
  const a = apercuPropagation(form.immeubles, connus?.immeubles ?? [], syndicId);
  const retirees = coproprietesRetirees(avant, form.immeubles);
  return (
    <div className="fsy-bloc">
      <p><strong>{form.nom}</strong> sera le syndic de {form.immeubles.length} copropriété{form.immeubles.length > 1 ? 's' : ''}.</p>
      <h3 className="fsy-sous-titre">Biens qui recevront ce syndic ({a.lots.length})</h3>
      {a.lots.length === 0 ? <p className="fsy-discret">Aucun bien en gestion dans ces immeubles.</p> : (
        <ul className="fsy-biens">
          {a.lots.map((l) => (
            <li key={l.id}><strong>lot {l.numero}</strong> — {[l.adresse, l.commune].filter((x) => x).join(', ') || l.immeuble}</li>
          ))}
        </ul>
      )}
      {a.changements.length > 0 && (
        <div className="fsy-alerte">
          Changement de syndic :
          <ul>{a.changements.map((c) => <li key={c.immeuble}>{c.immeuble} — aujourd’hui géré par {c.ancien} (le lien passe en historique)</li>)}</ul>
        </div>
      )}
      {retirees.length > 0 && (
        <div className="fsy-alerte">
          Copropriétés retirées de ce syndic (le lien passe en historique, rien n’est effacé) :
          <ul>{retirees.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
      {a.sansLot.length > 0 && (
        <p className="fsy-discret">Sans bien en gestion aujourd’hui : {a.sansLot.join(' · ')}</p>
      )}
      <div className="fsy-boutons">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRetour} disabled={envoi}>← Revenir</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onConfirmer} disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Confirmer et enregistrer'}
        </button>
      </div>
    </div>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL : il le fermerait. Jetons --color-svv-* uniquement. */
export const CSS_FICHE_SYNDIC = `
.fsy-voile{position:fixed;inset:0;z-index:72;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(17,19,24,.45);text-align:left}
.fsy{width:min(44rem,100%);max-height:92vh;overflow:auto;display:flex;flex-direction:column;gap:.7rem;padding:16px;
  border-radius:12px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);color:var(--color-svv-ink);
  box-shadow:0 12px 40px rgba(17,19,24,.25)}
.fsy:focus{outline:none}
.fsy-tete{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
.fsy-titre{margin:0;font-size:1.05rem;font-weight:700}
.fsy-croix{min-width:44px;min-height:44px;border:0;background:transparent;font-size:1.4rem;color:var(--color-svv-muted);cursor:pointer}
.fsy-bloc{display:flex;flex-direction:column;gap:.6rem}
.fsy-sous-titre{margin:.4rem 0 0;font-size:.85rem;font-weight:700;color:var(--color-svv-muted);text-transform:uppercase;letter-spacing:.03em}
.fsy-discret{color:var(--color-svv-muted);font-size:.82rem}
.fsy-alerte{padding:8px 10px;border-radius:8px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber);font-size:.85rem}
.fsy-alerte ul{margin:.3rem 0 0;padding-left:1.1rem}
.fsy-champ{display:flex;flex-direction:column;gap:.2rem;font-size:.8rem;color:var(--color-svv-muted);min-width:0;flex:1 1 12rem}
.fsy-champ input,.fsy-champ select,.fsy-champ textarea{min-height:40px;padding:6px 9px;border-radius:8px;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:.95rem}
.fsy-duo{display:flex;flex-wrap:wrap;gap:.6rem}
.fsy-choix{display:flex;flex-wrap:wrap;gap:.6rem;flex:1 1 14rem}
.fsy-champs{display:grid;grid-template-columns:7rem 1fr;gap:.35rem .7rem;margin:0;font-size:.9rem}
.fsy-champs dt{font-weight:700;color:var(--color-svv-muted)}
.fsy-champs dd{margin:0;min-width:0;overflow-wrap:anywhere}
.fsy-note{white-space:pre-wrap}
.fsy-contacts,.fsy-copros,.fsy-biens,.fsy-resultats,.fsy-propositions,.fsy-coords{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.35rem}
.fsy-contact{padding:8px 10px;border-radius:8px;background:var(--color-svv-field)}
.fsy-coords{margin-top:.25rem;font-size:.88rem}
.fsy-libelle{color:var(--color-svv-muted)}
.fsy-coord{display:inline-flex;flex-wrap:wrap;gap:.5rem;align-items:baseline}
.fsy-lien-bouton{border:0;background:transparent;color:var(--color-svv-red);font:inherit;font-size:.82rem;text-decoration:underline;cursor:pointer;min-height:32px;padding:0 .2rem}
.fsy-resultat{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;padding:8px 10px;border-radius:8px;background:var(--color-svv-field)}
.fsy-resultat-nom{display:flex;flex-direction:column;min-width:0}
.fsy-contact-edit{border:1px solid var(--color-svv-line);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:.5rem;margin:0}
.fsy-contact-edit legend{font-weight:700;font-size:.85rem;padding:0 .3rem}
.fsy-coord-edit{display:flex;flex-wrap:wrap;align-items:flex-end;gap:.5rem}
.fsy-champ--large{flex:2 1 14rem}
.fsy-ligne-ajouts{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.fsy-retirer-contact{margin-left:auto}
.fsy-copro-edit{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;padding:6px 10px;border-radius:8px;background:var(--color-svv-field)}
.fsy-confirmer-retrait{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;font-size:.85rem}
.fsy-proposition{width:100%;min-height:40px;text-align:left;border:1px solid var(--color-svv-line);border-radius:8px;background:var(--color-svv-surface);
  color:var(--color-svv-ink);font:inherit;padding:6px 10px;cursor:pointer}
.fsy-proposition:hover,.fsy-proposition:focus-visible{border-color:var(--color-svv-line-strong)}
.fsy-ajout{align-self:flex-start}
.fsy-historique summary{cursor:pointer;font-size:.85rem;color:var(--color-svv-muted)}
.fsy-historique ul{margin:.3rem 0 0;padding-left:1.1rem;font-size:.85rem}
.fsy-pied{margin:0}
.fsy-boutons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
@media (max-width:640px){
  .fsy-voile{padding:0}
  .fsy{width:100%;max-height:none;height:100%;border-radius:0}
  .fsy-champ input,.fsy-champ select,.fsy-champ textarea{font-size:16px}
  .fsy-champs{grid-template-columns:1fr}
  .fsy-boutons .gst-btn{flex:1 1 auto;min-height:44px}
}
`;
