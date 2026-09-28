'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formaterTaille } from '../../../../lib/gestion/ecran';

/**
 * LOT REDACTION-GMAIL — CHOISIR UN FICHIER DU DRIVE, POUR LE JOINDRE OU POUR EN INSÉRER LE LIEN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 DEUX GESTES, DEUX RÉGIMES, ET LA DIFFÉRENCE N'EST PAS UNE NUANCE.
 *   · « Insérer un lien » ne lit RIEN : il pose l'adresse Drive et le nom dans le message. Le destinataire devra
 *     s'authentifier chez Google, qui appliquera SES droits. → proposé PARTOUT ;
 *   · « Joindre » télécharge les octets et les met dans un mail qui part sur l'Internet ouvert. → JAMAIS sous
 *     « Documents clients scannés ».
 *
 * Sous ce dossier, le bouton « Joindre » N'EXISTE PAS et l'écran DIT pourquoi, avec la sortie (le lien). Un bouton
 * grisé sans explication se lit comme une panne ; un bouton absent sans explication se lit comme un oubli.
 *
 * ⚠️ L'ÉCRAN N'EST PAS LA BARRIÈRE. C'est la route qui refuse (`/api/admin/gestion/drive/fichiers`), en remontant
 * la chaîne des parents — un écran se modifie, une route non. Ici, on explique ; là-bas, on protège.
 *
 * 🔒 LE NAVIGATEUR NE PARLE JAMAIS À GOOGLE : il demande à l'application, qui relit le droit et interroge le Drive
 * avec un jeton qui ne quitte pas le serveur. Navigation par DOSSIER, un niveau à la fois — le Drive fait ~15 000
 * dossiers et 13 niveaux (mesuré le 25/09/2026) : on ne charge jamais l'arborescence entière.
 *
 * ═══ 🔴 LOT EDITEUR-PJ — LA FENÊTRE NE SE FERME PLUS À CHAQUE PIÈCE ══════════════════════════════════════════════
 * Avant, un clic sur « Joindre » ajoutait le fichier ET refermait tout. Joindre trois pièces prises dans deux
 * dossiers demandait donc de rouvrir le Drive trois fois et de redescendre treize niveaux deux fois. Le geste le
 * plus courant était le plus coûteux.
 *
 * Désormais : chaque « Joindre » ajoute, la fenêtre RESTE, et le dossier courant reste affiché. Un compteur dit
 * combien de pièces ont été ajoutées, les fichiers déjà pris le DISENT, et « Terminé » ferme quand on a fini.
 *
 * 🔴 PAS DE DOUBLON : un fichier déjà ajouté ne peut pas l'être une seconde fois — son bouton devient une mention.
 * Rien n'empêchait, avant, d'ajouter deux fois le même bail et de l'envoyer en double.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface Fichier {
  id: string;
  nom: string;
  typeMime: string;
  tailleOctets: number | null;
  modifieLe: string | null;
  lien: string | null;
  dossier: boolean;
}

type Vue =
  | { v: 'charge' }
  | {
    v: 'ok'; fichiers: Fichier[]; joindreAutorise: boolean; motifRefus: string | null; recherche: boolean;
    /** 🔴 LES DOSSIERS TROUVÉS, séparés des fichiers : ils s'affichent en PREMIER (demande d'Arno). */
    dossiers: Fichier[];
  }
  | { v: 'indisponible'; message: string };

/** Une entrée de l'historique « Récents », telle que la route la rend. */
interface Recent {
  sorte: 'drive_fichier' | 'drive_dossier' | 'locale';
  cle: string;
  libelle: string;
  detail: string | null;
  tailleOctets: number | null;
}

export interface ChoixFichierDrive {
  /**
   * ══ 🔴🔴 LOT ENVOI-ARRIERE-PLAN — ON NE TRANSPORTE PLUS LES OCTETS ═══════════════════════════════════════════
   *
   * Avant, « Joindre » faisait : le navigateur demande les octets, le serveur les tire du Drive, les renvoie en
   * base64, le navigateur les repousse. Trois allers-retours pendant lesquels l'écran était BLOQUÉ. Pour six
   * pièces, six attentes — le constat d'Arno.
   *
   * Désormais on ne passe que l'IDENTIFIANT. Le serveur lit les métadonnées (un appel court), inscrit la pièce, et
   * tire les octets en tâche de fond. Le « Joindre » suivant est cliquable immédiatement.
   */
  drive?: { fichierId: string; nom: string; dossierId: string | null; dossierNom: string | null };
  /** Le lien inséré : rien n'a été lu du contenu. */
  lien?: { nom: string; url: string };
}

export function SelecteurFichierDrive({ onChoisir, onFermer }: {
  /** Ajoute la pièce au brouillon. ⚠️ NE FERME PAS la fenêtre : c'est « Terminé » qui ferme. */
  onChoisir: (c: ChoixFichierDrive) => void | Promise<void>;
  onFermer: () => void;
}) {
  const [vue, setVue] = useState<Vue>({ v: 'charge' });
  /** Le fil d'Ariane : deux dossiers « Documents » à deux endroits sont la règle, pas l'exception. */
  const [ariane, setAriane] = useState<{ id: string; nom: string }[]>([]);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  /** 🔴 LES FICHIERS DÉJÀ AJOUTÉS pendant cette ouverture : par leur identifiant Drive, donc sans doublon possible. */
  const [ajoutes, setAjoutes] = useState<string[]>([]);
  const [saisie, setSaisie] = useState('');
  /** L'historique. `null` = pas encore lu ; liste vide = rien à proposer ; `disponible: false` = migration absente. */
  const [recents, setRecents] = useState<{ lignes: Recent[]; disponible: boolean } | null>(null);
  /** Le terme de la recherche d'où l'on est entré dans un dossier. `null` = on n'en vient pas. */
  const [rechercheOuverte, setRechercheOuverte] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);

  const charger = useCallback(async (dossierId: string) => {
    setVue({ v: 'charge' });
    setErreur(null);
    try {
      const res = await fetch(`/api/admin/gestion/drive/fichiers?dossier=${encodeURIComponent(dossierId)}`,
        { cache: 'no-store' });
      const d = (await res.json()) as {
        etat?: string; message?: string; fichiers?: Fichier[]; joindreAutorise?: boolean; motifRefus?: string | null;
      };
      if (d.etat !== 'ok') { setVue({ v: 'indisponible', message: d.message ?? 'Drive indisponible.' }); return; }
      setVue({
        v: 'ok', fichiers: d.fichiers ?? [], dossiers: [],
        joindreAutorise: d.joindreAutorise !== false,
        motifRefus: d.motifRefus ?? null,
        recherche: false,
      });
    } catch {
      setVue({ v: 'indisponible', message: 'Le Drive n’a pas répondu.' });
    }
  }, []);

  useEffect(() => { void charger(''); }, [charger]);
  useEffect(() => { champ.current?.focus(); }, []);

  /**
   * ══ 🔴 LOT EDITEUR-PJ — « RÉCENTS » À L'OUVERTURE ════════════════════════════════════════════════════════════
   * Joindre une pièce, c'est presque toujours rejoindre la même, ou retourner dans le même dossier. La liste vit
   * dans NOTRE base (migration 269) : rien n'est écrit dans le Drive pour la tenir.
   *
   * ⚠️ SANS LA MIGRATION, LA SECTION N'EXISTE PAS — pas une section vide, qui se lirait comme une panne.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/pieces-recentes?sorte=drive_fichier,drive_dossier',
          { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; lignes?: Recent[]; disponible?: boolean };
        if (annule) return;
        setRecents(d.etat === 'ok'
          ? { lignes: d.lignes ?? [], disponible: d.disponible !== false }
          : { lignes: [], disponible: false });
      } catch { if (!annule) setRecents({ lignes: [], disponible: false }); }
    })();
    return () => { annule = true; };
  }, []);

  /**
   * LA RECHERCHE, TEMPORISÉE (250 ms). ⚠️ `annule` couvre les DEUX cas : fenêtre refermée, et réponse PÉRIMÉE —
   * une réponse lente à « ba » ne doit pas écraser les résultats de « bail 2024 ».
   */
  useEffect(() => {
    const terme = saisie.trim();
    if (terme.length < 2) return undefined;
    let annule = false;
    const minuteur = setTimeout(() => {
      void (async () => {
        setVue({ v: 'charge' });
        try {
          const res = await fetch(`/api/admin/gestion/drive/fichiers?recherche=${encodeURIComponent(terme)}`,
            { cache: 'no-store' });
          const d = (await res.json()) as {
            etat?: string; message?: string; fichiers?: Fichier[]; dossiers?: Fichier[]; joindreAutorise?: boolean;
          };
          if (annule) return;
          if (d.etat !== 'ok') { setVue({ v: 'indisponible', message: d.message ?? 'Drive indisponible.' }); return; }
          setVue({
            v: 'ok', fichiers: d.fichiers ?? [], dossiers: d.dossiers ?? [],
            joindreAutorise: d.joindreAutorise !== false,
            motifRefus: null, recherche: true,
          });
        } catch { if (!annule) setVue({ v: 'indisponible', message: 'Le Drive n’a pas répondu.' }); }
      })();
    }, 250);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [saisie]);

  const dossierCourant = ariane.at(-1) ?? null;

  const entrer = (f: { id: string; nom: string }) => {
    setSaisie('');
    setAriane((a) => [...a, { id: f.id, nom: f.nom }]);
    void charger(f.id);
  };
  const remonter = (i: number) => {
    setSaisie('');
    const coupe = ariane.slice(0, i);
    setAriane(coupe);
    void charger(coupe.at(-1)?.id ?? '');
  };

  /**
   * JOINDRE : on demande les octets. La route REFUSE si le fichier est sous le dossier interdit.
   *
   * 🔴 LA FENÊTRE NE SE FERME PAS, et le dossier courant ne bouge pas : c'est tout l'objet de ce lot. On marque
   * seulement le fichier comme ajouté, pour qu'un second clic ne l'envoie pas en double.
   */
  /**
   * ══ 🔴🔴 LOT ENVOI-ARRIERE-PLAN — « JOINDRE » N'ATTEND PLUS RIEN ════════════════════════════════════════════
   *
   * LE CONSTAT D'ARNO : après un clic sur « Joindre », il fallait attendre la fin du téléchargement avant de
   * pouvoir sélectionner une autre pièce. Très pénible — et pour six pièces, six attentes.
   *
   * 🔴 LA PIÈCE EST MARQUÉE AJOUTÉE TOUT DE SUITE, avant même la réponse du serveur. C'est ce qui rend le clic
   * suivant immédiat. Le serveur, lui, ne fait qu'un appel court (les métadonnées) puis inscrit la ligne ; les
   * octets sont tirés derrière, en tâche de fond.
   *
   * ⚠️ ET SI LE SERVEUR REFUSE (« Documents clients scannés », document Google natif, 25 Mo dépassés), LA MARQUE
   * EST RETIRÉE et le motif s'affiche. Une marque optimiste qui resterait après un refus ferait croire qu'une
   * pièce est jointe alors qu'elle ne l'est pas — c'est-à-dire exactement le mensonge que ce lot interdit.
   *
   * ⚠️ AUCUN SABLIER, AUCUNE BARRE DE PROGRESSION : demande d'Arno. « L'utilisateur ne doit JAMAIS voir qu'une
   * pièce se télécharge encore. »
   */
  const joindre = async (f: Fichier) => {
    if (ajoutes.includes(f.id)) return;
    setErreur(null);
    setAjoutes((a) => (a.includes(f.id) ? a : [...a, f.id]));
    try {
      await onChoisir({
        drive: {
          fichierId: f.id, nom: f.nom,
          dossierId: dossierCourant?.id ?? null,
          dossierNom: dossierCourant?.nom ?? null,
        },
      });
    } catch (e) {
      setAjoutes((a) => a.filter((x) => x !== f.id));
      setErreur(e instanceof Error ? e.message : 'Ce fichier n’a pas pu être joint.');
    }
  };

  /** INSÉRER UN LIEN : aucun contenu n'est lu. C'est pour cela qu'il reste permis partout. */
  const lier = (f: Fichier) => {
    if (f.lien === null || f.lien === '') { setErreur('Ce fichier n’a pas d’adresse Drive partageable.'); return; }
    void onChoisir({ lien: { nom: f.nom, url: f.lien } });
  };

  /** Un « récent » du Drive : un fichier se joint, un dossier s'ouvre. */
  const ouvrirRecent = (r: Recent) => {
    if (r.sorte === 'drive_dossier') { entrer({ id: r.cle, nom: r.libelle }); return; }
    void joindre({
      id: r.cle, nom: r.libelle, typeMime: r.detail ?? '', tailleOctets: r.tailleOctets,
      modifieLe: null, lien: null, dossier: false,
    });
  };

  /**
   * ══ 🔴 LOT ENVOI-ARRIERE-PLAN — ENTRER DANS UN DOSSIER TROUVÉ, SANS PERDRE LA RECHERCHE ═════════════════════
   *
   * Demande d'Arno : « un lien ← Résultats de la recherche ramène à la liste sans perdre la saisie ». On garde
   * donc le terme DANS le fil d'Ariane, comme une étape : c'est ce qui rend le retour naturel, et ce qui laisse le
   * chemin cohérent quand on descend de deux niveaux dans le dossier trouvé.
   *
   * ⚠️ `ajoutes` ET LE COMPTEUR NE SONT PAS TOUCHÉS : ils vivent au-dessus de la navigation, donc les marques
   * « ✓ ajouté » restent justes quand on passe des résultats à un dossier puis qu'on revient.
   */
  const entrerDepuisRecherche = (f: Fichier) => {
    setRechercheOuverte(saisie.trim());
    setAriane([{ id: f.id, nom: f.nom }]);
    void charger(f.id);
  };

  const revenirAuxResultats = () => {
    const terme = rechercheOuverte;
    setRechercheOuverte(null);
    setAriane([]);
    // ⚠️ On repose la saisie TELLE QUELLE : c'est elle qui relance la recherche (effet temporisé ci-dessus).
    setSaisie('');
    setTimeout(() => setSaisie(terme ?? ''), 0);
  };

  const recentsDrive = (recents?.lignes ?? []).filter((r) => r.sorte !== 'locale');
  /** Les « Récents » n'ont de sens qu'à l'ouverture : à la racine, sans recherche en cours. */
  const montrerRecents = ariane.length === 0 && saisie.trim().length < 2
    && recents?.disponible === true && recentsDrive.length > 0;

  return (
    <div className="sfd-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_SELECTEUR_FICHIER}</style>
      <div className="sfd" role="dialog" aria-modal="true" aria-labelledby="sfd-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } }}>
        <h2 className="sfd-titre" id="sfd-titre">Insérer depuis Google Drive</h2>

        {/* 🔴 LE COMPTEUR : il dit ce qui a été fait, puisque la fenêtre ne se ferme plus pour le dire. Sans lui,
            on ne saurait plus combien de pièces on a prises. `role="status"` : annoncé, sans interrompre. */}
        <p className={`sfd-compteur${ajoutes.length === 0 ? ' sfd-compteur--vide' : ''}`} role="status">
          {ajoutes.length === 0
            ? 'Aucune pièce ajoutée pour l’instant — la fenêtre reste ouverte, prenez-en autant que nécessaire.'
            : `${ajoutes.length} pièce${ajoutes.length > 1 ? 's' : ''} ajoutée${ajoutes.length > 1 ? 's' : ''} au message.`}
        </p>

        <label className="sfd-champ">
          <span className="svv-label">Chercher un fichier par son nom, dans tout le Drive</span>
          <input ref={champ} className="sfd-saisie" type="search" value={saisie} autoComplete="off" maxLength={120}
            placeholder="ex. « bail 2024 », « devis plomberie »"
            onChange={(e) => {
              const v = e.target.value;
              setSaisie(v);
              // Effacer la recherche ramène au dossier où l'on était : on ne perd pas sa place.
              if (v.trim().length < 2) void charger(dossierCourant?.id ?? '');
            }} />
        </label>

        {/* 🔴 LE RETOUR AUX RÉSULTATS, demandé par Arno : on entre dans un dossier trouvé, on y joint ce qu'on
            veut, et l'on revient à la liste SANS perdre la saisie. Sans ce lien, il faudrait retaper le terme. */}
        {rechercheOuverte !== null && (
          <button type="button" className="gst-lien-bouton sfd-retour" onClick={revenirAuxResultats}>
            ← Résultats de la recherche « {rechercheOuverte} »
          </button>
        )}

        <nav className="sfd-ariane" aria-label="Chemin">
          <button type="button" className="gst-lien-bouton" onClick={() => remonter(0)}>Mon Drive</button>
          {ariane.map((e, i) => (
            <span key={e.id}>
              <span className="sfd-fleche" aria-hidden="true"> › </span>
              <button type="button" className="gst-lien-bouton" onClick={() => remonter(i + 1)}>{e.nom}</button>
            </span>
          ))}
        </nav>

        {/* ══ 🔴 « RÉCENTS » — ce qu'on a réellement joint, le plus récent en premier ═══════════════════════════ */}
        {montrerRecents && (
          <section className="sfd-recents" aria-label="Récents">
            <p className="sfd-section">Récents</p>
            <ul className="sfd-liste">
              {recentsDrive.map((r) => (
                <li key={`${r.sorte}|${r.cle}`} className="sfd-item">
                  <button type="button" className="sfd-dossier" disabled={ajoutes.includes(r.cle)}
                    onClick={() => ouvrirRecent(r)}>
                    <span aria-hidden="true">{r.sorte === 'drive_dossier' ? '📁' : '📄'}</span> {r.libelle}
                  </button>
                  {/* Le MOT dit ce que le clic fera : ouvrir n'est pas joindre. */}
                  <span className="sfd-mention">
                    {ajoutes.includes(r.cle) ? 'déjà ajouté'
                      : r.sorte === 'drive_dossier' ? 'dossier — ouvrir' : 'fichier — joindre'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {vue.v === 'charge' && <p className="gst-info" role="status">Lecture du Drive…</p>}
        {vue.v === 'indisponible' && <p className="gst-tronc" role="alert">{vue.message}</p>}
        {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}

        {/* 🔴🔴 LE DOSSIER INTERDIT SE DIT EN TOUTES LETTRES, avec la sortie — et AVANT la liste, pour qu'on le lise
            avant de chercher un bouton qui n'y est pas. */}
        {vue.v === 'ok' && !vue.joindreAutorise && vue.motifRefus !== null && (
          <p className="sfd-interdit" role="status">🔒 {vue.motifRefus}</p>
        )}

        {/* 🔴🔴 DANS UNE RECHERCHE, LE DROIT SE JUGE AU MOMENT DE JOINDRE. On le DIT d'avance : un refus qu'on
            découvre au clic se lit comme une panne, un refus annoncé se lit comme une règle. */}
        {vue.v === 'ok' && vue.recherche && (
          <p className="sfd-interdit" role="status">
            🔒 Résultats de tout le Drive : le droit de joindre est vérifié au moment de joindre. Un fichier de
            « Documents clients scannés » sera refusé, avec son motif.
          </p>
        )}

        {vue.v === 'ok' && vue.fichiers.length === 0 && vue.dossiers.length === 0 && (
          <p className="gst-tronc">
            {vue.recherche ? `Aucun dossier ni fichier trouvé pour « ${saisie.trim()} ».` : 'Ce dossier est vide.'}
          </p>
        )}

        {/* ══ 🔴 LES DOSSIERS TROUVÉS, EN PREMIER (demande d'Arno) ═══════════════════════════════════════════
            Ce qu'on cherche, neuf fois sur dix, c'est LE DOSSIER d'un lot ou d'un locataire — pour y prendre
            ensuite deux ou trois pièces. Les mettre après les fichiers obligerait à faire défiler pour trouver
            l'entrée la plus utile.

            🔴 UN GROUPE VIDE N'EST PAS AFFICHÉ : un titre suivi de rien se lit comme une panne. */}
        {vue.v === 'ok' && vue.dossiers.length > 0 && (
          <section className="sfd-groupe" aria-label="Dossiers trouvés">
            <p className="sfd-section">Dossiers</p>
            <ul className="sfd-liste">
              {vue.dossiers.map((f) => (
                <li key={f.id} className="sfd-item">
                  <button type="button" className="sfd-dossier" onClick={() => entrerDepuisRecherche(f)}>
                    <span aria-hidden="true">📁</span> {f.nom}
                  </button>
                  <span className="sfd-mention">ouvrir</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {vue.v === 'ok' && vue.fichiers.length > 0 && (
          <section className="sfd-groupe" aria-label={vue.recherche ? 'Fichiers trouvés' : 'Contenu du dossier'}>
            {/* Le titre « Fichiers » n'a de sens que FACE à un autre groupe : dans un dossier ordinaire, la liste
                se suffit à elle-même et un titre de plus ne ferait qu'occuper la hauteur. */}
            {vue.recherche && vue.dossiers.length > 0 && <p className="sfd-section">Fichiers</p>}
            <ul className="sfd-liste">
              {vue.fichiers.map((f) => (
                <li key={f.id} className="sfd-item">
                  {f.dossier ? (
                    <button type="button" className="sfd-dossier" onClick={() => entrer(f)}>
                      <span aria-hidden="true">📁</span> {f.nom}
                    </button>
                  ) : (
                    <>
                      <span className="sfd-nom" title={f.nom}>
                        <span aria-hidden="true">📄</span> {f.nom}
                        {f.tailleOctets !== null && (
                          <span className="sfd-taille"> · {formaterTaille(f.tailleOctets)}</span>
                        )}
                      </span>
                      <span className="sfd-gestes">
                        {/* 🔴🔴 « Joindre » N'EXISTE PAS sous « Documents clients scannés ». Le motif est affiché
                            au-dessus : on n'aligne pas un bouton grisé qu'on ne saurait pas expliquer ligne à ligne. */}
                        {vue.joindreAutorise && (
                          ajoutes.includes(f.id)
                            // 🔴 PAS DE DOUBLON : le bouton laisse place à une MENTION. Un bouton encore cliquable
                            //   enverrait deux fois la même pièce ; un bouton grisé n'expliquerait pas pourquoi.
                            ? <span className="sfd-ajoute">✓ ajouté</span>
                            : (
                              // 🔴 AUCUN SABLIER : le clic marque la pièce et rend la main. Voir `joindre`.
                              <button type="button" className="gst-lien-bouton" onClick={() => void joindre(f)}>
                                Joindre
                              </button>
                            )
                        )}
                        <button type="button" className="gst-lien-bouton" onClick={() => lier(f)}>
                          Insérer un lien
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="sfd-boutons">
          {/* 🔴 « TERMINÉ » remplace « Fermer » : le mot dit qu'on a fini d'ajouter, pas qu'on renonce. */}
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onFermer}>Terminé</button>
        </div>
      </div>
    </div>
  );
}

export const CSS_SELECTEUR_FICHIER = `
.sfd-voile{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;
  background:color-mix(in srgb, var(--color-svv-ink) 38%, transparent)}
.sfd{display:flex;flex-direction:column;gap:10px;width:min(640px,100%);max-height:86vh;overflow-y:auto;padding:16px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.8rem;
  box-shadow:0 10px 40px color-mix(in srgb, var(--color-svv-ink) 20%, transparent)}
.sfd-titre{margin:0;font-size:1.05rem;font-weight:700;color:var(--color-svv-ink)}
/* Le COMPTEUR : le MOT porte l'information, jamais la couleur seule. */
.sfd-compteur{margin:0;padding:6px 10px;font-size:.82rem;font-weight:700;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-radius:.4rem}
.sfd-compteur--vide{font-weight:400;color:var(--color-svv-muted)}
.sfd-champ{display:flex;flex-direction:column;gap:.2rem;min-width:0}
.sfd-saisie{min-height:40px;padding:.3rem .5rem;font:inherit;font-size:.9rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.4rem;min-width:0}
.sfd-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.sfd-ariane{display:flex;flex-wrap:wrap;align-items:center;font-size:.82rem;color:var(--color-svv-muted)}
.sfd-fleche{color:var(--color-svv-line-strong)}
.sfd-section{margin:0;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.sfd-recents{display:flex;flex-direction:column;gap:2px;min-width:0;padding-bottom:6px;
  border-bottom:1px solid var(--color-svv-line)}
.sfd-mention{font-size:.74rem;color:var(--color-svv-muted);white-space:nowrap;margin-left:auto}
.sfd-groupe{display:flex;flex-direction:column;gap:2px;min-width:0}
.sfd-retour{align-self:flex-start;font-size:.82rem}
/* 🔴🔴 Le dossier interdit : dit en MOTS, avec un fond qui le distingue — jamais la couleur seule. */
.sfd-interdit{margin:0;padding:8px 10px;font-size:.82rem;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-left:3px solid var(--color-svv-red);border-radius:0 .4rem .4rem 0}
.sfd-liste{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none}
.sfd-item{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:44px;padding:6px 2px;
  border-bottom:1px solid var(--color-svv-line);min-width:0}
.sfd-dossier{flex:1 1 auto;min-height:44px;padding:0;font:inherit;font-size:.9rem;text-align:left;
  color:var(--color-svv-ink);background:none;border:0;cursor:pointer;overflow-wrap:anywhere}
.sfd-dossier:hover:not(:disabled){text-decoration:underline}
.sfd-dossier:disabled{color:var(--color-svv-muted);cursor:default}
.sfd-nom{flex:1 1 12rem;min-width:0;font-size:.88rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.sfd-taille{color:var(--color-svv-muted)}
.sfd-gestes{display:flex;flex-wrap:wrap;gap:10px;margin-left:auto}
/* « déjà ajouté » : un MOT, pas un bouton désactivé — on sait ce qui s'est passé, pas seulement qu'on ne peut plus. */
.sfd-ajoute{font-size:.82rem;font-weight:700;color:var(--color-svv-ink);white-space:nowrap}
.sfd-boutons{display:flex;justify-content:flex-end;gap:8px;padding-top:4px}
`;
