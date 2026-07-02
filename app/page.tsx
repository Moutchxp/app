"use client";

import Image from "next/image";
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import MapSelector from "./MapSelector";
import { AdresseAutocomplete } from "./components/AdresseAutocomplete";
import dynamic from "next/dynamic";
import { useOrigineValidation } from "./lib/useOrigineValidation";
import type { ModeOrigine } from "./lib/svv/config";
import { cardinal } from "./lib/cardinal";
import { SceauCertifie } from "./components/SceauCertifie";
import type { Orientation } from "./lib/svv/config";
import type { LibelleScore } from "./lib/svv/scoreTotal";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { getActiveFormattingMask } from "react-international-phone";
import { getExampleNumber, isValidPhoneNumber } from "libphonenumber-js/max";
import examples from "libphonenumber-js/examples.mobile.json";
import {
  libelleScore,
  libelleOrientation,
  libelleDistance,
  libelleAmplitude,
  libelleCouverture,
  libelleMonuments,
  libelleProprete,
} from "./lib/libelles";

type Etape = "accueil" | "etapes" | "consentement" | "photo" | "localisation" | "orientation" | "infos" | "resultat" | "certificat";

// Forme (partielle) de la réponse succès de /api/analyse (cf. app/api/analyse/route.ts).
interface ReponseAnalyse {
  ok: true;
  validation: { valide: boolean; raison?: string } & Record<string, unknown>;
  // Miroir de ResultatComplet (lib/svv/analyse.ts) — verdict + score (famille1/2).
  resultat:
    | {
        verdict: {
          verdict: "SANS_VIS_A_VIS" | "VIS_A_VIS" | "INDETERMINE";
          distanceM: number | null;
          obstacle: {
            distanceM: number;
            altitudeSommetM: number | null;
            source: "LIDAR_HD" | "BD_TOPO" | "NONE";
          } | null;
          analyseDegradee: boolean;
          messageDegrade: string | null;
          raison: string;
        };
        score: {
          total: number;
          libelle: LibelleScore;
          scorePartiel: boolean;
          famille1: {
            total: number; // /50
            distance: number; // /20
            amplitude: number; // /20
            orientation: number; // /10
            detail: {
              amplitudePartA: number;
              amplitudePartB: number;
              penaliteFlancAppliquee: boolean;
              moyenneProfondeurM: number;
              pourcentageFaisceauxDegages: number;
              secteurOrientation: Orientation;
              bonusDernierEtage: number;
            };
          };
          famille2: {
            total: number; // /50
            strate1: number; // /40
            strate2: number; // /10
            malusProprete: number; // 0 → 6
            scorePartiel: boolean;
            detail: {
              faisceauxValorisants: number;
              monumentsComptes: { id: string; points: number }[];
              nuisancesMajeuresAppliquees: string[];
              nuisancesMineuresAppliquees: string[];
              carrefourApplique: boolean;
              cimetiereApplique: boolean;
            };
          };
        };
        distanceAxePrincipalM: number | null;
      }
    | null;
}

// Carte du faisceau (affichage seul), client-only.
const FaisceauMap = dynamic(() => import("./FaisceauMap"), { ssr: false });
// Miniature statique recolorable pour l'écran résultat (compagnon de FaisceauMap).
const FaisceauMini = dynamic(() => import("./FaisceauMini"), { ssr: false });

// Marge d'ajustement manuel de l'azimut sur l'écran orientation (= marge de roulis tolérée
// à la prise de photo, ±30°). Correction d'affichage/saisie : n'altère pas le calcul.
const MARGE_AJUSTEMENT_AZIMUT_DEG = 30;

// Étapes affichées (présentation uniquement) sur l'écran « Analyse en cours ».
// N'a AUCUN lien avec le pipeline réel : c'est une checklist animée par minuteur.
const ETAPES_ANALYSE = [
  "Localisation",
  "Obstacles",
  "Altitudes terrain",
  "Hauteurs des bâtiments",
  "Analyse photo (IA)",
  "Calcul du résultat",
] as const;

type ResultatReussi = NonNullable<ReponseAnalyse["resultat"]>;

/**
 * Écran résultat 7A (certifié) / 7B (vis-à-vis) — PRÉSENTATION uniquement.
 * Ne lit que des champs déjà présents dans la réponse ; aucun calcul de verdict/score.
 */
/* onClick TODO (écrans 8 / 10 pas encore construits) — non câblé volontairement. */
const todoEcranAVenir = () => undefined;

const ETAPES_INTRO = [
  "Photographier votre vue face au séjour",
  "Valider la position GPS de votre fenêtre",
  "Valider l'orientation de votre séjour",
  "Renseigner votre étage",
];

// Pictos des 4 étapes (présentation) — viewBox 24, stroke svv-ink 1.8, round.
const PICTOS_ETAPES = [
  <svg key="cam" width={37} height={37} viewBox="0 0 24 24" fill="none" stroke="var(--color-svv-ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <circle cx="12" cy="13.5" r="3.6" />
    <path d="M8 7l1.4-2.4h5.2L16 7" />
  </svg>,
  <svg key="pin" width={37} height={37} viewBox="0 0 24 24" fill="none" stroke="var(--color-svv-ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21c4.4-6 6.4-9 6.4-12a6.4 6.4 0 1 0-12.8 0c0 3 2 6 6.4 12Z" />
    <circle cx="12" cy="9" r="2.4" />
  </svg>,
  <svg key="boussole" width={37} height={37} viewBox="0 0 24 24" fill="none" stroke="var(--color-svv-ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 4.5l3 7.5-3 2.4-3-2.4z" fill="var(--color-svv-red)" stroke="none" />
  </svg>,
  <svg key="immeuble" width={37} height={37} viewBox="0 0 24 24" fill="none" stroke="var(--color-svv-ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="6" y="3.5" width="12" height="17" />
    <line x1="6" y1="9" x2="18" y2="9" />
    <line x1="6" y1="13.5" x2="18" y2="13.5" />
    <line x1="6" y1="18" x2="18" y2="18" />
  </svg>,
];

// Keyframes d'animation (injectées une fois) — bumper du picto + pop de la coche.
const ETAPES_KEYFRAMES =
  "@keyframes svvBumper{0%{opacity:0;transform:scale(.3)}48%{opacity:1;transform:scale(1.3)}70%{transform:scale(.88)}86%{transform:scale(1.07)}100%{transform:scale(1)}}" +
  "@keyframes svvPop{0%{opacity:0;transform:scale(0)}60%{opacity:1;transform:scale(1.18)}100%{transform:scale(1)}}";

const PASTILLE = 62; // diamètre de la pastille

/**
 * Écran d'intro « Les 4 étapes » (#2 du wizard) — PRÉSENTATION pure (minuteur).
 * Stepper vertical animé : frappe machine à écrire → pastille rouge + picto (bumper)
 * → coche verte (pop) → connecteur pointillé vert MESURÉ (getBoundingClientRect) qui se
 * dessine (scaleY) quand le picto du bas est validé → skyline soft → bouton (+200 ms).
 * Aucun calcul déclenché ; « C'est parti » garde son action via onContinuer.
 */
function EcranEtapes({ onContinuer }: { onContinuer: () => void }) {
  const [counts, setCounts] = useState<number[]>([0, 0, 0, 0]);
  const [validated, setValidated] = useState<boolean[]>([false, false, false, false]);
  const [checks, setChecks] = useState<boolean[]>([false, false, false, false]);
  const [drawn, setDrawn] = useState<boolean[]>([false, false, false]); // segments 0->1,1->2,2->3
  const [showBtn, setShowBtn] = useState(false);
  const [instant, setInstant] = useState(false);
  const [centers, setCenters] = useState<{ x: number; y: number }[]>([]);

  const stepperRef = useRef<HTMLDivElement | null>(null);
  const pastilleRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Mesure des centres des pastilles (relatifs au conteneur) → géométrie des segments.
  // Re-mesuré à chaque validation (les lignes au-dessus sont écrites → positions stables)
  // et au resize. Les segments sont dessinés derrière les pastilles (z-index).
  useLayoutEffect(() => {
    const measure = () => {
      const stepper = stepperRef.current;
      if (!stepper) return;
      const sr = stepper.getBoundingClientRect();
      const next: { x: number; y: number }[] = [];
      for (let i = 0; i < ETAPES_INTRO.length; i++) {
        const el = pastilleRefs.current[i];
        if (!el) return;
        const r = el.getBoundingClientRect();
        next.push({ x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 });
      }
      setCenters(next);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [validated]);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
    if (reduce) {
      // Mouvement réduit : tout affiché instantanément, sans la pause de 1,5 s.
      setInstant(true);
      setCounts(ETAPES_INTRO.map((l) => l.length));
      setValidated([true, true, true, true]);
      setChecks([true, true, true, true]);
      setDrawn([true, true, true]);
      setShowBtn(true);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let interval: ReturnType<typeof setInterval> | null = null;
    const after = (ms: number, fn: () => void) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn();
        }, ms),
      );
    };

    const PICTO_LEAD = 200; // ms : délai entre l'apparition du picto et le début de la frappe du texte

    const valider = (i: number) => {
      if (cancelled) return;
      // b) le picto (pastille rouge + bumper) est désormais révélé par startLine() AVANT la frappe.
      // d) connecteur précédent -> courant (segment i-1 -> i) se dessine
      if (i >= 1) {
        setDrawn((prev) => {
          const n = [...prev];
          n[i - 1] = true;
          return n;
        });
      }
      // c) coche verte (léger délai, petit pop)
      after(200, () =>
        setChecks((prev) => {
          const n = [...prev];
          n[i] = true;
          return n;
        }),
      );
      // e) étape suivante 865 ms après la validation
      if (i < ETAPES_INTRO.length - 1) {
        after(865, () => startLine(i + 1));
      } else {
        // 4e étape validée → bouton retardé (620 + 200 + 200 ms) pour rester smooth.
        after(1020, () => setShowBtn(true));
      }
    };

    // Démarre une ligne : PICTO d'abord (svvBumper), puis la frappe du TEXTE après PICTO_LEAD.
    const startLine = (i: number) => {
      if (cancelled) return;
      setValidated((prev) => {
        const n = [...prev];
        n[i] = true;
        return n;
      });
      after(PICTO_LEAD, () => typeLine(i));
    };

    const typeLine = (i: number) => {
      if (cancelled) return;
      let c = 0;
      interval = setInterval(() => {
        if (cancelled) return;
        c += 1;
        setCounts((prev) => {
          const n = [...prev];
          n[i] = c;
          return n;
        });
        if (c >= ETAPES_INTRO[i].length) {
          if (interval) clearInterval(interval);
          interval = null;
          valider(i);
        }
      }, 44);
    };

    // a) pause initiale 200 ms (titre + pastilles au repos) avant la 1re ligne.
    after(200, () => startLine(0));

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <style>{ETAPES_KEYFRAMES}</style>

      {/* 1. HEADER rouge compact — titre blanc, gras, 2 lignes, pas de logo */}
      <div className="-mx-6 -mt-6 mb-7 rounded-t-3xl bg-svv-red flex flex-col items-center justify-center" style={{ height: "62px", padding: "0 22px" }}>
        <h1 className="text-white text-center" style={{ fontSize: "23px", fontWeight: 800, lineHeight: 1.1 }}>
          4 étapes
        </h1>
        <span className="text-white text-center" style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.1, opacity: 0.9, marginTop: "2px" }}>
          (1 minute)
        </span>
      </div>

      {/* 2. STEPPER centré verticalement dans l'espace libre entre header et skyline.
          relative z-10 : passe AU-DESSUS du footer (relative z-0) que le -mt-12 fait remonter, sinon le calque déco recouvre le texte des étapes. */}
      <div className="relative z-10 flex flex-col">
        <div ref={stepperRef} className="relative flex flex-col gap-7">
        {/* Segments pointillés (position absolue, mesurée) — DERRIÈRE les pastilles */}
        {centers.length === ETAPES_INTRO.length &&
          [0, 1, 2].map((k) => (
            <div
              key={"seg-" + k}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: centers[k].x - 1.5 + "px",
                top: centers[k].y + "px",
                height: centers[k + 1].y - centers[k].y + "px",
                width: 0,
                borderLeft: "3px dashed var(--color-svv-green)",
                transformOrigin: "top",
                transform: "scaleY(" + (drawn[k] ? 1 : 0) + ")",
                transition: instant ? "none" : "transform 0.45s ease-out",
                zIndex: 0,
              }}
            />
          ))}

        {ETAPES_INTRO.map((line, i) => {
          const typing = counts[i] > 0 && counts[i] < line.length;
          return (
            <div key={line} className="relative flex items-center gap-4">
              {/* Pastille (au-dessus des segments pour masquer leurs extrémités) */}
              <div
                ref={(el) => {
                  pastilleRefs.current[i] = el;
                }}
                className="relative z-10 flex shrink-0 items-center justify-center rounded-full bg-white"
                style={{
                  height: PASTILLE + "px",
                  width: PASTILLE + "px",
                  border: "3.5px solid",
                  borderColor: validated[i] ? "var(--color-svv-red)" : "#e6e8ec",
                  transition: instant ? "none" : "border-color 0.3s ease",
                }}
              >
                {validated[i] && (
                  <span
                    className="inline-flex"
                    style={instant ? undefined : { animation: "svvBumper 0.62s ease-in-out both" }}
                  >
                    {PICTOS_ETAPES[i]}
                  </span>
                )}

                {/* Coche verte bas-droite : rond blanc + check vert */}
                {checks[i] && (
                  <span
                    className="absolute flex items-center justify-center rounded-full bg-white"
                    style={{
                      height: "25px",
                      width: "25px",
                      right: "-5px",
                      bottom: "-5px",
                      boxShadow: "0 1px 4px rgba(0,0,0,.18)",
                      animation: instant ? undefined : "svvPop 0.32s ease-out both",
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-svv-green)" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5 L10 17.5 L19 7" />
                    </svg>
                  </span>
                )}
              </div>

              {/* Légende (centrée sur l'axe du picto, même sur 2 lignes) */}
              <span
                style={{ fontSize: "23px", fontWeight: 500, lineHeight: 1.28, color: "var(--color-svv-ink)" }}
              >
                {line.slice(0, counts[i])}
                {typing && (
                  <span
                    className="ml-0.5 inline-block animate-pulse"
                    style={{ color: "var(--color-svv-muted)" }}
                  >
                    |
                  </span>
                )}
              </span>
            </div>
          );
        })}
        </div>
      </div>

      {/* 3. Bandeau toits FOOTER6 — mt-auto pousse l'image en bas. Mask : la marge blanche du fichier
          fait 48 px à l'affichage (144/872 du PNG, échelle cover 0.3303) → transparente jusqu'à 48 px,
          puis fondu de 20 px (48→68 px) sur LE DESSIN (toits). Le transparent laisse voir la carte blanche. */}
      <div className="relative z-0 -mx-6 mt-auto w-[calc(100%+3rem)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/FOOTER%206.png"
          alt=""
          aria-hidden="true"
          className="block w-full max-w-none h-72 object-cover object-bottom"
          style={{
            opacity: 0.85,
            WebkitMaskImage: "linear-gradient(to top, transparent 0px, transparent 48px, black 68px)",
            maskImage: "linear-gradient(to top, transparent 0px, transparent 48px, black 68px)",
          }}
        />
      </div>

      {/* 4. BOUTON « C'est parti » (fondu + glissement) — relative z-10 -mt-6 : À CHEVAL sur le bas de la photo / la trame de fond. */}
      <div
        className={
          "relative z-10 -mt-6 transition-all duration-500 ease-out " +
          (showBtn ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0")
        }
      >
        <button type="button" onClick={onContinuer} className="svv-btn svv-btn-primary relative">
          Commencer
          <span className="absolute right-5 text-xl leading-none">&rsaquo;</span>
        </button>
      </div>
    </div>
  );
}

function EcranResultat({
  resultat,
  photo,
  lat,
  lon,
  azimutDeg,
  etatPhoto,
  onRecommencer,
  onRefaireTest,
  onObtenirCertificat,
}: {
  resultat: ResultatReussi;
  photo: string | null;
  lat: number;
  lon: number;
  azimutDeg: number | null;
  etatPhoto: "en_cours" | "exploitable" | "inexploitable" | "echec";
  onRecommencer: () => void;
  onRefaireTest: () => void;
  onObtenirCertificat: () => void;
}) {
  const certifie = resultat.verdict.verdict === "SANS_VIS_A_VIS";
  const score = Math.round(resultat.score.total);
  const C = 2 * Math.PI * 44; // circonférence de la jauge (rayon 44)
  const offset = C * (1 - Math.max(0, Math.min(100, resultat.score.total)) / 100);
  const arc = certifie ? "var(--color-svv-green)" : "var(--color-svv-red)";
  const f1 = resultat.score.famille1;
  const f2 = resultat.score.famille2;

  const distanceM = resultat.verdict.distanceM;
  const distanceTxt = Number.isFinite(distanceM)
    ? `${Math.round(distanceM as number)} m`
    : "Aucun (≥ 200 m)";
  // Taille adaptée à la longueur → la distance tient toujours sur UNE ligne (affichage seul).
  const tailleDistance =
    distanceTxt.length <= 6 ? "text-3xl" : distanceTxt.length <= 10 ? "text-2xl" : "text-xl";

  const badges = [
    libelleDistance(f1.distance),
    libelleAmplitude(f1.amplitude),
    libelleOrientation(f1.detail.secteurOrientation),
    // Famille 2 — masquées si photo inexploitable (composantes dépendantes de l'IA)
    f2.scorePartiel ? null : libelleCouverture(f2.strate1),
    f2.scorePartiel ? null : libelleMonuments(f2.strate2),
    f2.scorePartiel ? null : libelleProprete(f2.malusProprete),
  ].filter((b): b is string => b != null);

  return (
    <div className="flex flex-1 flex-col">
      {/* 1. EN-TÊTE — 7A rouge / 7B sombre ; bandeau haut, icône + titre 2 lignes centrés */}
      <div
        className={
          "-mx-6 -mt-6 mb-5 flex items-center justify-center gap-3.5 rounded-t-3xl px-6 py-4 text-white " +
          (certifie ? "bg-svv-red" : "bg-svv-ink")
        }
      >
        {certifie ? (
          // sceau officiel « certifié » (composant SceauCertifie, vectorisé, ratio haut → dimensionné par la hauteur)
          <SceauCertifie className="h-10 w-auto shrink-0 text-white" />
        ) : (
          // triangle d'alerte avec point d'exclamation (inchangé)
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3.2L21.5 20H2.5z" />
            <path d="M12 9.5v4.5" />
            <path d="M12 17.4h.01" />
          </svg>
        )}
        <span className="text-center text-2xl font-extrabold uppercase leading-[1.05] tracking-tight">
          {certifie ? (
            <>
              Sans Vis-à-Vis®
              <br />
              certifié
            </>
          ) : (
            <>
              Vis-à-vis
              <br />
              détecté
            </>
          )}
        </span>
      </div>

      {/* 2. JAUGE + OBSTACLE */}
      <div className="flex items-start gap-5">
        <div className="shrink-0 text-center">
          <div className="relative h-28 w-28">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-svv-line)" strokeWidth="9" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke={arc}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={offset}
              />
            </svg>
            {etatPhoto === "en_cours" && (
              <span
                className="absolute inset-0 animate-spin rounded-full border-[4px] border-svv-red border-t-transparent"
                aria-hidden="true"
              />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <div className="flex items-baseline">
                <span className="text-3xl font-extrabold text-svv-ink">{score}</span>
                <span className="ml-0.5 text-[11px] font-semibold text-svv-muted">/100</span>
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] font-semibold leading-tight text-svv-muted">
            {etatPhoto === "en_cours" ? (
              <>
                Score partiel
                <br />
                Analyse de la photo en cours
              </>
            ) : etatPhoto === "exploitable" ? (
              "Score global"
            ) : (
              <>
                Score estimé
                <br />
                sans photo
              </>
            )}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-svv-muted">Premier obstacle face</p>
          <p className={`${tailleDistance} font-extrabold text-svv-ink whitespace-nowrap`}>{distanceTxt}</p>
          <p className="mt-2 text-xs text-svv-muted">Distance minimale requise</p>
          <p className="text-base font-bold text-svv-gray">40 m</p>
        </div>
      </div>

      {/* 3. ZONE CENTRALE — bascule selon verdict */}
      {certifie ? (
        <div className="mt-6">
          <p className="text-sm font-bold text-svv-ink">Qualité de votre vue</p>
          {badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {badges.map((b) => (
                <span key={b} className="svv-pill">
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-sm font-bold text-svv-ink">Obstacle détecté :</p>
          <p className="mt-1 text-sm text-svv-gray">
            Bâtiment à {Number.isFinite(distanceM) ? Math.round(distanceM as number) : "—"}{" "}
            mètres dans l&apos;axe de vision.
          </p>
        </div>
      )}

      {/* 4. DEUX VIGNETTES — même boîte, côte à côte */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div>
          <p className="svv-label mb-1">Carte du faisceau</p>
          <div className="h-32 overflow-hidden rounded-xl border border-svv-line bg-svv-field">
            {/* Vraie miniature (plan + faisceau recoloré) — compagnon statique de FaisceauMap */}
            <FaisceauMini lat={lat} lon={lon} azimutDeg={azimutDeg} couleur={certifie ? "#2e9e5b" : "#a30402"} />
          </div>
        </div>
        <div>
          <p className="svv-label mb-1">Votre photo</p>
          <div className="relative h-32 overflow-hidden rounded-xl border border-svv-line bg-svv-field">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Vue capturée" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-svv-muted">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="7" width="18" height="13" rx="2" />
                  <path d="M8 7l2-3h4l2 3" />
                  <circle cx="12" cy="13" r="3.2" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. NOTE (le « score partiel » vit sous le cercle, plus ici) */}
      {resultat.verdict.analyseDegradee && (
        <p className="mt-3 text-xs text-amber-700">
          Analyse dégradée (donnée altimétrique de repli)
        </p>
      )}

      {/* 6. BOUTONS + LIEN — gap avant boutons = même rythme que les autres sections */}
      <div className={certifie ? "mt-6" : "mt-auto pt-6"}>
        {certifie ? (
          <>
            <button type="button" onClick={onObtenirCertificat} className="svv-btn svv-btn-primary">
              <SceauCertifie className="h-7 w-auto shrink-0 text-white" />
              Obtenir mon certificat
            </button>
            <button type="button" onClick={todoEcranAVenir} className="svv-btn svv-btn-outline mt-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3v18h18" />
                <rect x="7" y="11" width="3" height="7" />
                <rect x="13" y="7" width="3" height="11" />
              </svg>
              Calculer la plus-value de ma vue
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onRefaireTest} className="svv-btn svv-btn-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Refaire le test
            </button>
            <button type="button" onClick={todoEcranAVenir} className="svv-btn svv-btn-outline mt-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 11l9-7 9 7" />
                <path d="M5 10v10h14V10" />
              </svg>
              Estimation immobilière
            </button>
          </>
        )}
        <button type="button" onClick={onRecommencer} className="svv-link mt-1">
          ← Retour à l&apos;accueil
        </button>
      </div>
    </div>
  );
}

const TYPES_BIEN = ["Maison", "Appartement", "Studio", "Duplex", "Triplex", "Loft"] as const;

const EPOQUES = [
  "Inconnu", "Avant 1850", "De 1850 à 1913", "De 1914 à 1947",
  "De 1948 à 1969", "De 1970 à 1980", "De 1981 à 1991", "De 1992 à 2000",
  "De 2001 à 2010", "De 2011 à 2020", "À partir de 2021",
] as const;

function EcranCertificat({ onRetour, adresseBien, lat, lon, azimut, hauteurSousPlafond, etageInitial, dernierEtage }: {
  onRetour: () => void;
  adresseBien: string;
  lat: number;
  lon: number;
  azimut: number | null;
  hauteurSousPlafond: number;
  etageInitial: number;
  dernierEtage: boolean;
}) {
  const [adresseChoisie, setAdresseChoisie] = useState(adresseBien); // libellé affiché, init = adresse auto
  const [adressesAlt, setAdressesAlt] = useState<{ cle: string; libelle: string; distanceM: number; memeParcelle: boolean }[]>([]);
  const [adressePreselectionnee, setAdressePreselectionnee] = useState<string | null>(null);
  const [selecteurOuvert, setSelecteurOuvert] = useState(false);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [placeholderTel, setPlaceholderTel] = useState("6 12 34 56 78");
  const telephoneValide = telephone ? isValidPhoneNumber(telephone) : false;
  const [bienEstResidence, setBienEstResidence] = useState<boolean | null>(null);
  const [residenceAdresse, setResidenceAdresse] = useState("");
  const [typeBien, setTypeBien] = useState("");
  const [surface, setSurface] = useState("");
  const [nbPieces, setNbPieces] = useState(0);
  const [epoque, setEpoque] = useState("");
  const [epoqueModalOuvert, setEpoqueModalOuvert] = useState(false);
  const [terrasse, setTerrasse] = useState<null | boolean>(null);
  const [balcon, setBalcon] = useState<null | boolean>(null);
  const [jardin, setJardin] = useState<null | boolean>(null);
  const [soumis, setSoumis] = useState(false);

  const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const estValide =
    prenom.trim() !== "" &&
    nom.trim() !== "" &&
    emailValide &&
    (telephone ? isValidPhoneNumber(telephone) : false) &&
    typeBien !== "" &&
    surface.trim() !== "" &&
    nbPieces > 0 &&
    epoque !== "" &&
    terrasse !== null &&
    balcon !== null &&
    jardin !== null &&
    bienEstResidence !== null &&
    (bienEstResidence === true || residenceAdresse.trim() !== "");
  // Adresse auto = la PLUS PROCHE renvoyée par l'API (déjà triée par distance), pas adresseBien
  // (format amont différent : code postal, séparateurs…). Dédup par cle (identifiant BAN unique).
  const adresseAuto = adressesAlt[0]?.libelle ?? adresseBien;
  const cleAuto = adressesAlt[0]?.cle ?? null;
  const aDesAlternatives = adressesAlt.some((a) => a.cle !== cleAuto);

  // Tri garanti côté front (parcelle du bien d'abord, puis distance) — l'API trie déjà
  const adressesTriees = [...adressesAlt].sort((a, b) =>
    a.memeParcelle === b.memeParcelle ? a.distanceM - b.distanceM : a.memeParcelle ? -1 : 1,
  );
  const adressesMemeParcelle = adressesTriees.filter((a) => a.memeParcelle);
  const adressesVoisine = adressesTriees.filter((a) => !a.memeParcelle);
  const afficherTitresGroupes = adressesMemeParcelle.length > 0 && adressesVoisine.length > 0;
  // Cœur d'îlot : la parcelle du bien n'a aucune adresse propre → un seul groupe « Adresses possibles ».
  const coeurIlot = adressesMemeParcelle.length === 0 && adressesVoisine.length > 0;

  // Rendu d'une ligne (réutilisé par les deux groupes) — className EXACTS de l'existant
  const renderLigneAdresse = (a: { cle: string; libelle: string; distanceM: number; memeParcelle: boolean }) => (
    <button
      key={a.cle}
      type="button"
      onClick={() => setAdressePreselectionnee(a.libelle)}
      className={`rounded-xl border p-3 text-left text-sm ${a.libelle === adressePreselectionnee ? "border-svv-red bg-svv-field text-svv-ink" : "border-svv-line bg-white text-svv-ink"}`}
    >
      <span className="block font-semibold">{a.libelle}</span>
      <span className="block text-xs text-svv-muted">
        {a.cle === cleAuto ? "Adresse détectée automatiquement" : `à ${a.distanceM} m`}
      </span>
    </button>
  );

  const classeChoix = (actif: boolean) =>
    `rounded-xl px-3 py-3 text-base font-semibold transition ${
      actif ? "bg-svv-red text-white" : "border border-svv-line bg-white text-svv-ink"
    }`;

  const classeStepper =
    "flex h-12 w-12 items-center justify-center rounded-xl border border-svv-line bg-svv-field text-2xl font-bold text-svv-ink";

  // Chargement silencieux au montage : alimente adressesAlt sans ouvrir le modal.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    (async () => {
      try {
        const r = await fetch("/api/adresses-proches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lon }), // lat/lon = point figé, jamais modifié
          signal: ctrl.signal,
        });
        const data = await r.json();
        if (r.ok && data?.ok === true && Array.isArray(data.adresses)) {
          setAdressesAlt(data.adresses);
          if (data.adresses[0]?.libelle) setAdresseChoisie(data.adresses[0].libelle);
        }
      } catch {
        // silencieux : si l'appel échoue, on n'affiche simplement pas le bouton
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [lat, lon]);

  // Écran de confirmation (placeholder étape 1 — pas encore de PDF ni email)
  if (soumis) {
    return (
      <div className="pb-10">
        <div className="-mx-6 -mt-6 mb-4 rounded-t-3xl bg-svv-red px-6 py-5">
          <div className="flex items-center gap-3">
            <SceauCertifie className="h-9 w-auto shrink-0 text-white" />
            <h1 className="text-[1.45rem] font-extrabold leading-tight text-white">Demande enregistrée</h1>
          </div>
        </div>
        <div className="rounded-xl bg-svv-field p-4 text-base font-semibold text-svv-ink">
          ✓ Vos informations ont bien été enregistrées.
        </div>
        <p className="mt-3 text-sm text-svv-muted">
          La génération de votre certificat Sans Vis-à-Vis® et son envoi par email arriveront à l'étape suivante.
        </p>
        <button type="button" onClick={onRetour} className="svv-btn svv-btn-outline mt-6">Retour</button>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="-mx-6 -mt-6 mb-4 rounded-t-3xl bg-svv-red px-6 py-5">
        <div className="flex items-center gap-3">
          <SceauCertifie className="h-9 w-auto shrink-0 text-white" />
          <h1 className="text-[1.45rem] font-extrabold leading-tight text-white">Votre certificat</h1>
        </div>
      </div>

      <p className="mb-4 text-sm text-svv-muted">Ces informations nous sont nécessaires pour identifier avec certitude le bien analysé et l&apos;établir au nom du demandeur. Le certificat Sans Vis-à-Vis® vous sera envoyé par email.</p>

      {/* BIEN */}
      <div className="rounded-2xl bg-svv-field p-5">
      <h2 className="text-lg font-bold text-svv-ink mb-3">Identification de votre bien</h2>

      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm font-semibold text-svv-ink">Adresse du bien</label>
        {aDesAlternatives && (
          <button
            type="button"
            onClick={() => { setAdressePreselectionnee(adresseChoisie); setSelecteurOuvert(true); }}
            className="rounded-md border-2 border-svv-line bg-transparent px-2 py-0.5 text-xs font-medium text-svv-muted"
          >
            Alternatives
          </button>
        )}
      </div>
      <input value={adresseChoisie} readOnly className="w-full cursor-default rounded-xl border border-svv-line bg-white p-3 text-base text-svv-ink focus:outline-none" />
      <p className="mt-1 text-xs text-svv-red">Coordonnées validées : {lat.toFixed(6)}, {lon.toFixed(6)}</p>
      {azimut != null && (
        <p className="mt-1 text-xs text-svv-red">Azimut validé : {Math.round(azimut)}°</p>
      )}

      {selecteurOuvert && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/45 p-5" onClick={() => setSelecteurOuvert(false)}>
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-base font-bold text-svv-ink">Choisir l'adresse</h3>
            <p className="mb-3 text-xs text-svv-muted">Adresses à proximité immédiate du point GPS validé sur la carte.</p>
            <div className="flex flex-col gap-2">
              {coeurIlot ? (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-svv-muted">Adresses possibles</p>
                  {adressesVoisine.map(renderLigneAdresse)}
                </>
              ) : (
                <>
                  {adressesMemeParcelle.length > 0 && (
                    <>
                      {afficherTitresGroupes && (
                        <p className="text-[11px] font-medium uppercase tracking-wide text-svv-muted">Même parcelle</p>
                      )}
                      {adressesMemeParcelle.map(renderLigneAdresse)}
                    </>
                  )}
                  {adressesVoisine.length > 0 && (
                    <>
                      {afficherTitresGroupes && (
                        <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-svv-muted">Parcelle(s) voisine(s)</p>
                      )}
                      {adressesVoisine.map(renderLigneAdresse)}
                    </>
                  )}
                </>
              )}
            </div>
            {adressePreselectionnee && adressePreselectionnee !== adresseChoisie ? (
              <button
                type="button"
                onClick={() => { setAdresseChoisie(adressePreselectionnee); setSelecteurOuvert(false); }}
                className="svv-btn svv-btn-primary mt-3"
              >
                Validation nouvelle adresse
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSelecteurOuvert(false)}
                className="svv-btn svv-btn-outline mt-3"
              >
                Fermer
              </button>
            )}
          </div>
        </div>
      )}

      <label className="mb-2 mt-4 block text-sm font-semibold text-svv-ink">Type de bien <span className="text-svv-red">*</span></label>
      <div className="grid grid-cols-2 gap-2">
        {TYPES_BIEN.map((t) => (
          <button key={t} type="button" onClick={() => setTypeBien(t)} className={classeChoix(typeBien === t)}>{t}</button>
        ))}
      </div>

      <label className="mb-1 mt-4 block text-sm font-semibold text-svv-ink">Surface (m²) <span className="text-svv-red">*</span></label>
      <input
        inputMode="decimal"
        value={surface}
        onChange={(e) => setSurface(e.target.value)}
        className="w-full rounded-xl border border-svv-line bg-white p-3 text-base text-svv-ink placeholder:text-svv-muted focus:border-svv-red focus:outline-none"
        placeholder="Ex. 65"
      />

      <label className="mb-2 mt-4 block text-sm font-semibold text-svv-ink">Nombre de pièces <span className="text-svv-red">*</span></label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setNbPieces((n) => Math.max(0, n - 1))} className={classeStepper}>−</button>
        <span className="w-10 text-center text-xl font-bold text-svv-ink">{nbPieces}</span>
        <button type="button" onClick={() => setNbPieces((n) => n + 1)} className={classeStepper}>+</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-semibold text-svv-ink">Étage</label>
          <div className="rounded-xl border border-svv-line bg-white p-3 text-base text-svv-red">{etageInitial}</div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-svv-ink">Dernier étage</label>
          <div className="rounded-xl border border-svv-line bg-white p-3 text-base text-svv-red">{dernierEtage ? "Oui" : "Non"}</div>
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-semibold text-svv-ink">Hauteur sous plafond</label>
          <div className="rounded-xl border border-svv-line bg-white p-3 text-base text-svv-red">{hauteurSousPlafond.toFixed(2).replace('.', ',')} m</div>
        </div>
      </div>
      <p className="mt-1 text-xs text-svv-muted">Valeurs définies lors du calcul du certificat.</p>

      <label className="mb-2 mt-4 block text-sm font-semibold text-svv-ink">Époque de construction <span className="text-svv-red">*</span></label>
      <button type="button" onClick={() => setEpoqueModalOuvert(true)} className="flex w-full items-center justify-between rounded-xl border border-svv-line bg-white p-3 text-base focus:border-svv-red focus:outline-none">
        <span className={epoque ? "text-svv-ink" : "text-svv-muted"}>{epoque || "Sélectionner"}</span>
        <span className="text-svv-muted">▾</span>
      </button>

      <label className="mb-2 mt-4 block text-sm font-semibold text-svv-ink">Balcon <span className="text-svv-red">*</span></label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setBalcon(true)} className={classeChoix(balcon === true)}>Oui</button>
        <button type="button" onClick={() => setBalcon(false)} className={classeChoix(balcon === false)}>Non</button>
      </div>
      <label className="mb-2 mt-4 block text-sm font-semibold text-svv-ink">Terrasse <span className="text-svv-red">*</span></label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setTerrasse(true)} className={classeChoix(terrasse === true)}>Oui</button>
        <button type="button" onClick={() => setTerrasse(false)} className={classeChoix(terrasse === false)}>Non</button>
      </div>
      <label className="mb-2 mt-4 block text-sm font-semibold text-svv-ink">Jardin <span className="text-svv-red">*</span></label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setJardin(true)} className={classeChoix(jardin === true)}>Oui</button>
        <button type="button" onClick={() => setJardin(false)} className={classeChoix(jardin === false)}>Non</button>
      </div>
      </div>

      {/* IDENTITÉ */}
      <div className="mt-4 rounded-2xl bg-svv-field p-5">
      <h2 className="text-lg font-bold text-svv-ink mb-3">Vos coordonnées</h2>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-sm font-semibold text-svv-ink">Prénom <span className="text-svv-red">*</span></label>
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="w-full rounded-xl border border-svv-line bg-white p-3 text-base text-svv-ink placeholder:text-svv-muted focus:border-svv-red focus:outline-none" placeholder="Prénom" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-svv-ink">Nom <span className="text-svv-red">*</span></label>
          <input value={nom} onChange={(e) => setNom(e.target.value)} className="w-full rounded-xl border border-svv-line bg-white p-3 text-base text-svv-ink placeholder:text-svv-muted focus:border-svv-red focus:outline-none" placeholder="Nom" />
        </div>
      </div>

      <label className="mb-1 mt-3 block text-sm font-semibold text-svv-ink">Email <span className="text-svv-red">*</span></label>
      <input
        type="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-xl border border-svv-line bg-white p-3 text-base text-svv-ink placeholder:text-svv-muted focus:border-svv-red focus:outline-none"
        placeholder="vous@exemple.fr"
      />
      {email.trim() !== "" && !emailValide && (
        <p className="mt-1 text-sm text-svv-red">Format d'email invalide.</p>
      )}

      <label className="mb-1 mt-3 block text-sm font-semibold text-svv-ink">Téléphone <span className="text-svv-red">*</span></label>
      <PhoneInput
        defaultCountry="fr"
        disableDialCodeAndPrefix
        showDisabledDialCodeAndPrefix
        preferredCountries={["fr", "be", "ch", "lu", "mc"]}
        placeholder={placeholderTel}
        onChange={(phone, meta) => {
          const c: any = meta?.country;
          const dial = c?.dialCode ? String(c.dialCode).replace(/\D/g, "") : "";
          // chiffres saisis, tous non-numériques retirés
          let digits = (phone || "").replace(/\D/g, "");
          // si les chiffres commencent déjà par l'indicatif, on ne le remet pas
          let national = digits;
          if (dial && digits.startsWith(dial)) {
            national = digits.slice(dial.length);
          }
          // E.164 = "+" + indicatif + national (toujours préfixé)
          const e164 = dial ? "+" + dial + national : (phone || "");
          setTelephone(e164);
          if (c?.iso2) {
            const ph = placeholderPourPays(c.iso2, c);
            if (ph) setPlaceholderTel(ph);
          }
        }}
        className={telephoneValide ? "w-full tel-valide" : "w-full"}
        inputProps={{ name: "telephone" }}
      />

      <label className="mb-1 mt-3 block text-sm font-semibold text-svv-ink">Le bien analysé est-il votre résidence principale ? <span className="text-svv-red">*</span></label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setBienEstResidence(true)} className={classeChoix(bienEstResidence === true)}>Oui</button>
        <button type="button" onClick={() => setBienEstResidence(false)} className={classeChoix(bienEstResidence === false)}>Non</button>
      </div>
      {bienEstResidence === true && (
        <input
          value={adresseChoisie}
          readOnly
          className="mt-2 w-full cursor-default rounded-xl border border-svv-line bg-white p-3 text-base text-svv-ink focus:outline-none"
        />
      )}
      {bienEstResidence === false && (
        <div className="mt-2">
          <AdresseAutocomplete
            value={residenceAdresse}
            onChange={setResidenceAdresse}
            onSelect={(s) => setResidenceAdresse(s.label)}
            placeholder="Saisissez votre adresse de résidence principale"
          />
        </div>
      )}
      </div>

      {/* ACTIONS */}
      <button
        type="button"
        disabled={!estValide}
        onClick={() => setSoumis(true)}
        className={`svv-btn svv-btn-primary mt-6 ${!estValide ? "opacity-50" : ""}`}
      >
        Valider
      </button>
      <button type="button" onClick={onRetour} className="svv-btn svv-btn-outline mt-3">Retour</button>

      {/* Modal Époque — calqué sur le motif showInfoPhoto/infoLocalisation du projet */}
      {epoqueModalOuvert && (
        <div onClick={() => setEpoqueModalOuvert(false)} className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/45 p-5">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-base font-bold text-svv-ink">Époque de construction</h3>
            <div className="flex flex-col gap-2">
              {EPOQUES.map((ep) => (
                <button key={ep} type="button" onClick={() => { setEpoque(ep); setEpoqueModalOuvert(false); }} className={classeChoix(epoque === ep)}>{ep}</button>
              ))}
            </div>
            <button type="button" onClick={() => setEpoqueModalOuvert(false)} className="svv-btn svv-btn-outline mt-3">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function appliqueMasqueTel(masque: string, chiffres: string): string {
  let out = "";
  let i = 0;
  for (const ch of masque) {
    if (ch === ".") {
      if (i >= chiffres.length) break;
      out += chiffres[i];
      i++;
    } else {
      out += ch;
    }
  }
  if (i < chiffres.length) out += chiffres.slice(i);
  return out.trim();
}

function placeholderPourPays(iso2: string, country: any): string {
  try {
    const ex = getExampleNumber(iso2.toUpperCase() as any, examples);
    if (!ex) return "";
    const chiffres = ex.nationalNumber;
    // masque actif choisi par la lib selon les 1ers chiffres (ex : AR /^9/)
    const masque = getActiveFormattingMask({ phone: chiffres, country });
    if (masque && masque.includes(".")) {
      return appliqueMasqueTel(masque, chiffres);
    }
    return ex.formatNational();
  } catch {
    return "";
  }
}

export default function Home() {
  const [etape, setEtape] = useState<Etape>("accueil");
  // Changement d'écran = changement de state (pas de navigation) → la position de scroll du body
  // est conservée. On la remet EN HAUT à chaque changement d'étape (saut instantané, pas d'animation).
  // L'écran resultat re-scrolle ensuite vers le bas via le setTimeout de handleAnalyse (handler,
  // postérieur à cet effet) → pas de conflit.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [etape]);
  const [address, setAddress] = useState("");
  const [addressInfo, setAddressInfo] = useState(""); // message d'info SOUS le champ, jamais dans sa valeur
  const [positionGPSObtenue, setPositionGPSObtenue] = useState(false); // AFFICHAGE seul : libellé adresse
  const [carteCentrePret, setCarteCentrePret] = useState(false); // la carte localisation a un VRAI centre (pas le défaut Paris)
  const origine = useOrigineValidation();
  const [mode, setMode] = useState<ModeOrigine>("semi_auto"); // saisie origine : semi_auto (snap) | manuel (M4b : boutons)
  const [pointDeplace, setPointDeplace] = useState(false); // true au 1er geste utilisateur sur la carte
  const [etage, setEtage] = useState("");
  // Hauteur sous plafond (m) — défaut « standard » 2,5 ; l'UI de réglage viendra plus tard.
  const [hauteurSousPlafondM, setHauteurSousPlafondM] = useState<number>(2.5);
  const [dernierEtage, setDernierEtage] = useState<null | boolean>(null);
  // Résultat de l'analyse (/api/analyse) — écran "resultat".
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [analyse, setAnalyse] = useState<ReponseAnalyse | null>(null);
  const [analyseErreur, setAnalyseErreur] = useState<string | null>(null);
  const [etatPhoto, setEtatPhoto] = useState<"en_cours" | "exploitable" | "inexploitable" | "echec">("echec");
  // en_cours = analyse photo lancée ; complet = score enrichi reçu ; indisponible = pas de photo / échec / timeout
  // Étape animée de la checklist « Analyse en cours » (présentation seule, pas le pipeline).
  const [analyseEtape, setAnalyseEtape] = useState(0);

  // Minuteur d'animation (présentation seule) : coche une à une les 5 PREMIÈRES étapes.
  // Délai par étape DOUBLÉ (~1400 ms) — les étapes intermédiaires défilent plus lentement.
  // La DERNIÈRE étape (« Calcul du résultat ») est la plus longue en pratique : le compteur
  // est plafonné à length-1, donc elle reste en « en cours » et N'EST JAMAIS cochée au
  // minuteur ; elle se conclut quand le vrai résultat arrive (analyseEnCours → false →
  // bascule sur 7A/7B). Ne déclenche NI ne modifie l'analyse (aucun appel réseau).
  useEffect(() => {
    if (!analyseEnCours) {
      setAnalyseEtape(0);
      return;
    }
    const id = setInterval(() => {
      setAnalyseEtape((e) => Math.min(e + 1, ETAPES_ANALYSE.length - 1));
    }, 1400);
    return () => clearInterval(id);
  }, [analyseEnCours]);
  const ignoreNextReverseRef = useRef(false);
  const conserverPositionRef = useRef(false); // au redo : garder le marqueur, ne pas réécrire via GPS
  // Vrai dès que l'utilisateur a déplacé la carte. Empêche le GPS photo TARDIF de rappeler la
  // carte sur le point photo après que l'utilisateur a choisi son point.
  const userMovedRef = useRef(false);

  const [position, setPosition] = useState({
    latitude: 48.8566,
    longitude: 2.3522,
  });

  // États pour la photo et les capteurs
  const [photo, setPhoto] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [angles, setAngles] = useState({ pitch: 0, roll: 0, heading: 0 });
  const [isLevel, setIsLevel] = useState(false);
  // Aucun capteur d'orientation (permission refusée / device sans capteur) → le niveau devient un
  // simple indicateur « indisponible », JAMAIS bloquant pour la capture (cf. peutCapturer = videoReady).
  const [niveauIndispo, setNiveauIndispo] = useState(false);
  // Flux de permissions de l'écran photo (iOS) : préparation en cours, refus orientation, refus caméra.
  const [prepCamera, setPrepCamera] = useState(false);               // permissions en cours → écran d'attente
  const [orientationRefusee, setOrientationRefusee] = useState(false); // DeviceOrientation denied → modale Réessayer
  const [cameraRefusee, setCameraRefusee] = useState(false);          // getUserMedia NotAllowedError → modale Réglages
  const [capturedOrientation, setCapturedOrientation] = useState<number | null>(null);
  // Azimut AJUSTABLE à la main sur l'écran orientation (± marge roulis photo autour du capté).
  // N'affecte PAS le calcul lui-même : c'est juste la valeur d'azimut transmise à l'analyse.
  const [azimutAjuste, setAzimutAjuste] = useState<number | null>(null);
  // Pop-up d'aide « Pourquoi ajuster l'orientation ? » (présentation seule).
  const [infoOrientationOuvert, setInfoOrientationOuvert] = useState(false);
  const [infoOrientationVu, setInfoOrientationVu] = useState(false); // déjà consulté → arrête le clignotement
  const [bumpInfo, setBumpInfo] = useState(false); // « bump » périodique du picto « i » (tant que non vu)
  // 1er bump à 12 s après l'arrivée sur l'écran orientation, puis toutes les 5 s. Stoppe au clic.
  useEffect(() => {
    if (etape !== "orientation" || infoOrientationVu) return;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const bump = () => { setBumpInfo(true); setTimeout(() => setBumpInfo(false), 650); };
    const firstId = setTimeout(() => { bump(); intervalId = setInterval(bump, 5000); }, 12000);
    return () => { clearTimeout(firstId); if (intervalId) clearInterval(intervalId); setBumpInfo(false); };
  }, [etape, infoOrientationVu]);
  // Pop-up d'aide « Pourquoi placer ce point ? » (écran localisation) — états DISTINCTS d'Orientation.
  const [infoLocalisationOuvert, setInfoLocalisationOuvert] = useState(false);
  const [showInfoPhoto, setShowInfoPhoto] = useState(false); // modale « À quoi sert cette photo ? »
  const [infoLocalisationVu, setInfoLocalisationVu] = useState(false); // déjà consulté → arrête le clignotement
  const [bumpInfoLocalisation, setBumpInfoLocalisation] = useState(false); // « bump » périodique du « i » localisation
  // Bump du « i » localisation : armé SEULEMENT quand le « i » est visible (pointDeplace === true,
  // état 2) et tant que non consulté. 1er bump à 12 s, puis toutes les 5 s. (clone d'Orientation)
  useEffect(() => {
    if (!pointDeplace || infoLocalisationVu) return;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const bump = () => { setBumpInfoLocalisation(true); setTimeout(() => setBumpInfoLocalisation(false), 650); };
    const firstId = setTimeout(() => { bump(); intervalId = setInterval(bump, 5000); }, 12000);
    return () => { clearTimeout(firstId); if (intervalId) clearInterval(intervalId); setBumpInfoLocalisation(false); };
  }, [pointDeplace, infoLocalisationVu]);

  // Pop-up d'aide « Hauteur sous plafond » (écran infos) — clone de localisation/orientation.
  const [infoHauteurOuvert, setInfoHauteurOuvert] = useState(false);
  const [infoHauteurVu, setInfoHauteurVu] = useState(false); // déjà consulté → arrête le clignotement
  const [bumpInfoHauteur, setBumpInfoHauteur] = useState(false); // « bump » périodique du « i » hauteur
  // Bump du « i » hauteur : 1er bump à 3 s, puis toutes les 5 s. Stoppe au clic (infoHauteurVu).
  useEffect(() => {
    if (infoHauteurVu) return;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const bump = () => { setBumpInfoHauteur(true); setTimeout(() => setBumpInfoHauteur(false), 650); };
    const firstId = setTimeout(() => { bump(); intervalId = setInterval(bump, 5000); }, 3000);
    return () => { clearTimeout(firstId); if (intervalId) clearInterval(intervalId); setBumpInfoHauteur(false); };
  }, [infoHauteurVu]);

  function ajusterEtage(delta: number) {
    setEtage((v) => (v === "" ? "0" : String(Math.max(0, Number(v) + delta))));
  }
  // Hauteur sous plafond : pas de 0,10 m, bornes 2,40–4,50 m.
  function ajusterHauteur(delta: number) {
    setHauteurSousPlafondM((h) => {
      const v = Math.round((h + delta) * 10) / 10; // pas de 0,10 m, évite les flottants
      return Math.min(4.5, Math.max(2.4, v));       // bornes 2,40–4,50
    });
  }
  // Libellé qualitatif dérivé de la hauteur sous plafond (affichage seul).
  function libelleHauteur(h: number): string {
    if (h <= 2.4) return "Mansardé";
    if (h <= 2.5) return "Standard";
    if (h <= 2.9) return "Ancien";
    if (h <= 3.5) return "Haussmannien";
    return "Exceptionnel";
  }
  // Resynchronise l'azimut ajustable quand un nouveau cap est capté (nouvelle photo).
  useEffect(() => {
    setAzimutAjuste(capturedOrientation);
  }, [capturedOrientation]);

  // États de validation individuels pour l'aide visuelle
  const [pitchValid, setPitchValid] = useState(false);
  const [rollValid, setRollValid] = useState(false);

  // Références capteurs (AFFICHAGE uniquement — lissage, aucune logique métier)
  const smoothPitchOffsetRef = useRef(0); // offset pitch lissé (passe-bas)
  // Roulis : mesuré via DeviceMotion (accel), lissé en rAF (τ ≈ 0,18 s), affichage seulement.
  const rollRawRef = useRef(0);          // dernier roulis brut (atan2 de l'accélération)
  const rollSmoothRef = useRef(0);       // roulis lissé qui pilote l'affichage + le code couleur
  const rejetRollRef = useRef(0);        // durée cumulée (s) pendant laquelle le garde-fou rejette → auto-resync si ça persiste
  const rafRef = useRef<number | null>(null);
  const motionTsRef = useRef(0);         // timestamp rAF précédent (lissage indépendant du framerate)
  const motionActiveRef = useRef(false); // DeviceMotion réellement disponible ?
  const sensorSeenRef = useRef(false);   // au moins un échantillon capteur reçu ?
  const sensorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // repli : aucun capteur après 3 s → niveauIndispo
  const pitchValidRef = useRef(false);   // dernier isPValid (pour recomposer isLevel dans le rAF)
  // Détection du verrouillage de l'aide au niveau (garde-fou anti-saut figé > 0,7 s).
  const niveauBloqueRef = useRef(false);
  const [niveauBloque, setNiveauBloque] = useState(false);
  const divergenceDepuisRef = useRef<number | null>(null);
  const marquerBloque = (v: boolean) => {
    if (niveauBloqueRef.current !== v) {
      niveauBloqueRef.current = v;
      setNiveauBloque(v);
    }
  };

  // États lissés pour animer les éléments graphiques séparés
  const [visualRoll, setVisualRoll] = useState(0);
  const [visualPitchOffset, setVisualPitchOffset] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [videoReady, setVideoReady] = useState(false); // flux vidéo réellement prêt (frame dispo, track vivante)

  // Recomposition centralisée de videoReady sur les événements du <video> + visibilitychange.
  const reevaluerVideoReady = useCallback(() => {
    const el = videoRef.current;
    const track = streamRef.current?.getVideoTracks?.()[0] ?? null;
    const trackOk = !!track && track.readyState !== "ended";       // flux vivant (pas mort)
    const elOk = !!el && el.readyState >= 2 && el.videoWidth > 0;   // frame réellement dispo
    setVideoReady(trackOk && elOk);
  }, []);

  useEffect(() => {
    const onVis = () => reevaluerVideoReady();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reevaluerVideoReady]);
  // Détection de l'objectif actif — on vise l'ULTRA grand-angle arrière. + panneau de debug temporaire.
  const [surUltra, setSurUltra] = useState(false);
  const [ultraDeviceId, setUltraDeviceId] = useState<string | null>(null);

  // Moteur de calcul de l'adresse et validation bâtiment
  async function getAddressFromGPS(latitude: number, longitude: number) {
    // Après une sélection d'adresse : sauter UN reverse-geocode pour ne pas écraser le label.
    if (ignoreNextReverseRef.current) {
      ignoreNextReverseRef.current = false;
      return;
    }
    setAddressInfo(""); // on a un point → plus de message de statut
    try {
      // Reverse BAN (cohérent avec l'autocomplétion) : le label inclut le numéro si le point
      // est proche d'une adresse de type housenumber.
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/reverse/?lat=${latitude}&lon=${longitude}`,
      );
      const data: { features?: { properties?: { label?: string } }[] } = await response.json();
      const label = data.features?.[0]?.properties?.label;
      if (label) {
        setAddress(label);
      } else {
        // Pas d'adresse exploitable (point loin de toute adresse) : champ vide, info de repli.
        setAddress("");
        setAddressInfo("Position trouvée — saisissez l'adresse ou ajustez le repère");
      }
    } catch {
      setAddressInfo("Adresse récupérée - Ajustez la position sur la carte");
    }
  }

  // Sélection d'une suggestion d'adresse (BAN) : effets de bord CARTE (Home uniquement) — recentrage
  // + anti-reverse. La saisie/débounce/fetch/liste sont dans <AdresseAutocomplete> ; ce handler n'y est
  // appelé que via la prop onSelect.
  function onSelectAdresse(s: { label: string; lat: number; lon: number }) {
    setAddress(s.label);
    setAddressInfo(""); // efface "Position introuvable…"
    // Anti-écrasement : saute le reverse-geocode du moveend déclenché par le recentrage.
    ignoreNextReverseRef.current = true;
    // Filet : désarme le flag si aucun moveend ne survient (adresse ~ au centre actuel).
    setTimeout(() => {
      ignoreNextReverseRef.current = false;
    }, 1500);
    // Recentrage via le MÊME mécanisme que le GPS (setPosition → setView). Ne touche pas pointDeplace.
    setPosition({ latitude: s.lat, longitude: s.lon });
  }

  // Capteurs : PITCH + boussole via deviceorientation (inchangé), ROLL via DeviceMotion
  // (accélération + gravité) lissé en requestAnimationFrame. Mesure plus stable près de
  // la verticale. Aucune incidence sur verdict/score/géométrie : aide au cadrage seulement.
  useEffect(() => {
    if (!isCameraActive) return;

    // --- PITCH (beta) + HEADING via deviceorientation ; repli ROLL = gamma si pas de DeviceMotion ---
    function handleOrientation(event: DeviceOrientationEvent) {
      sensorSeenRef.current = true;
      const pitch = event.beta ? Math.round(event.beta) : 0;

      let heading = 0;
      if ("webkitCompassHeading" in event) {
        heading = (event as any).webkitCompassHeading;
      } else if (event.alpha) {
        heading = 360 - event.alpha;
      }
      heading = Math.round(heading);

      // Validation de la Verticale (Pitch) : seuil INCHANGÉ (±3° / zone 87–94).
      const absPitch = Math.abs(pitch);
      const isPValid =
        (absPitch >= 87 && absPitch <= 94) || Math.abs(pitch - 90) <= 3 || Math.abs(pitch + 90) <= 3;
      pitchValidRef.current = isPValid;
      setPitchValid(isPValid);
      setAngles((a) => ({ ...a, pitch, heading }));

      // Pitch : offset signé au CENTRE EXACT de la zone OK (90.5° / -90.5°) — affichage.
      const ciblePitch = pitch >= 0 ? 90.5 : -90.5;
      const targetPitchOffset = pitch - ciblePitch;
      smoothPitchOffsetRef.current =
        smoothPitchOffsetRef.current + (targetPitchOffset - smoothPitchOffsetRef.current) * 0.15;
      setVisualPitchOffset(smoothPitchOffsetRef.current);

      // Repli : si DeviceMotion indisponible, on garde l'ancien roulis (gamma) comme source brute.
      if (!motionActiveRef.current) {
        rollRawRef.current = event.gamma ? event.gamma : 0;
      }
    }

    // --- ROLL via DeviceMotion : roulis brut = atan2(ax, -ay), stable près de la verticale ---
    function handleMotion(event: DeviceMotionEvent) {
      const g = event.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null) return;
      motionActiveRef.current = true;
      sensorSeenRef.current = true;
      // À la verticale & à plat (ax ≈ 0) → 0. Sens : haut vers la droite ⇒ barre vers la droite.
      // (si inversé sur l'appareil réel : remplacer g.x par -g.x.)
      rollRawRef.current = Math.atan2(g.x, -g.y) * (180 / Math.PI);
    }

    // --- Boucle d'affichage : lissage exponentiel dt-based (τ ≈ 0,18 s) + garde-fou ---
    function tick(ts: number) {
      const dt = motionTsRef.current ? Math.min(0.1, (ts - motionTsRef.current) / 1000) : 0;
      motionTsRef.current = ts;

      if (sensorSeenRef.current) {
        const rollRaw = rollRawRef.current;
        const ecartRoll = Math.abs(rollRaw - rollSmoothRef.current);
        if (ecartRoll <= 45 && dt > 0) {
          // Cas normal : lissage exponentiel.
          const alpha = dt / (0.18 + dt);
          rollSmoothRef.current = rollSmoothRef.current + alpha * (rollRaw - rollSmoothRef.current);
          rejetRollRef.current = 0; // tout va bien → on remet le compteur de rejet à zéro
          divergenceDepuisRef.current = null; // conforme → on n'est pas (plus) bloqué
          marquerBloque(false);
        } else if (ecartRoll > 45 && dt > 0) {
          // Garde-fou anti-saut : on ignore les à-coups PONCTUELS…
          rejetRollRef.current += dt;
          // …mais si l'écart PERSISTE (> 0,5 s), c'est un blocage réel (lissé figé loin du réel) :
          // on resynchronise pour ne jamais rester coincé.
          if (rejetRollRef.current > 0.5) {
            rollSmoothRef.current = rollRaw;
            rejetRollRef.current = 0;
            divergenceDepuisRef.current = null; // resync → plus bloqué
            marquerBloque(false);
          } else {
            // tant que l'auto-resync n'a pas eu lieu, on alimente la détection de blocage (anneau du reset).
            if (divergenceDepuisRef.current == null) divergenceDepuisRef.current = ts;
            else if (ts - divergenceDepuisRef.current > 700) marquerBloque(true);
          }
        }
        setVisualRoll(rollSmoothRef.current);

        // Condition « roulis OK » : sur le roulis LISSÉ, MÊME seuil qu'avant (±30°).
        const isRValid = Math.abs(rollSmoothRef.current) <= 30;
        setRollValid(isRValid);
        setIsLevel(pitchValidRef.current && isRValid);
        setAngles((a) => {
          const r = Math.round(rollSmoothRef.current);
          return a.roll === r ? a : { ...a, roll: r };
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("devicemotion", handleMotion);
    rafRef.current = requestAnimationFrame(tick);
    armerTimerNiveau(); // si aucun capteur vu après 3 s → niveau indisponible (n'affecte PAS la capture)

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("devicemotion", handleMotion);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (sensorTimerRef.current) clearTimeout(sensorTimerRef.current);
      motionTsRef.current = 0;
    };
  }, [isCameraActive]);

  // CORRECTION 1 — rattrape la course videoRef : (re)pose srcObject quand le <video>
  // est monté ET qu'un flux existe (cas où getUserMedia s'est résolu avant le montage).
  useEffect(() => {
    if (
      isCameraActive &&
      videoRef.current &&
      streamRef.current &&
      videoRef.current.srcObject !== streamRef.current
    ) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play?.().catch(() => {});
    }
  }, [isCameraActive]);

  // Réinitialise TOUT l'état de l'aide au niveau (states + refs) à une entrée caméra,
  // pour ne pas hériter d'un isLevel/refs figés (sinon déclencheur grisé au retour).
  // Ne touche PAS la logique de calcul du tick : remet seulement les valeurs initiales.
  function reinitialiserCapteurs() {
    setIsLevel(false);
    setPitchValid(false);
    setRollValid(false);
    setNiveauBloque(false);
    pitchValidRef.current = false;
    sensorSeenRef.current = false;
    niveauBloqueRef.current = false;
    divergenceDepuisRef.current = null;
    rejetRollRef.current = 0;
    rollSmoothRef.current = 0;
    rollRawRef.current = 0;
    smoothPitchOffsetRef.current = 0;
    motionTsRef.current = 0;
    motionActiveRef.current = false;
    setVisualRoll(0);
    setVisualPitchOffset(0);
  }

  // Détecte l'objectif actif et l'ULTRA grand-angle arrière. Appelée après CHAQUE getUserMedia.
  async function detecterObjectif(stream: MediaStream) {
    const norm = (l: string) => (l || "").trim().toLowerCase();
    const estUltraArriere = (l: string) => {
      const s = norm(l);
      return /ultra/.test(s) && /arri[èe]re|back/.test(s) && !/avant|front/.test(s);
    };

    const actif = stream.getVideoTracks()[0]?.label || "";
    let devices: MediaDeviceInfo[] = [];
    try {
      devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    } catch {}

    const sU = estUltraArriere(actif);
    const ultraDev = devices.find((d) => estUltraArriere(d.label));
    setSurUltra(sU);
    setUltraDeviceId(ultraDev?.deviceId ?? null);

    console.log("[CAM] active:", actif, stream.getVideoTracks()[0]?.getSettings?.());
    console.log("[CAM] inputs:", devices.map((d) => ({ label: d.label, id: d.deviceId })));
    return { sU, uId: ultraDev?.deviceId ?? null };
  }

  // Bascule sur l'ULTRA grand-angle arrière. Ne touche pas aux capteurs.
  async function passerUltraGrandAngle(idParam?: string) {
    const id = idParam ?? ultraDeviceId;
    if (!id) return;
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      await detecterObjectif(s);
    } catch (e) {
      console.warn("Bascule ultra grand-angle échouée", e); // on garde l'objectif courant
    }
  }

  // Redémarrage RAPIDE du flux caméra sur le MÊME objectif (pour réparer un flux figé/mort).
  // Lit le deviceId courant sur la track (sans énumération), stoppe l'ancien flux, rouvre
  // exactement le même objectif et ré-attache. NE change pas d'objectif, NE re-demande pas de
  // permission, NE touche pas aux capteurs (le reset niveau reste à reinitialiserAideNiveau).
  async function redemarrerCamera() {
    const currentId = streamRef.current?.getVideoTracks()[0]?.getSettings?.().deviceId;
    // (a) libérer proprement l'ancien flux AVANT de rouvrir (pas de fuite)
    streamRef.current?.getTracks().forEach((t) => t.stop());
    // (b) rouvrir le MÊME objectif : deviceId exact si connu, sinon mêmes constraints qu'à l'ouverture
    const constraints = currentId
      ? { video: { deviceId: { exact: currentId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
      : { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
    try {
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = s;
      // (c) ré-attacher + relancer la lecture
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play?.().catch(() => {});
      }
    } catch (e) {
      // (d) robuste : pas de crash ; l'UI reste utilisable, l'utilisateur peut retaper le refresh
      console.warn("Redémarrage caméra échoué", e);
    }
  }

  // Débloque l'aide au niveau (le garde-fou anti-saut peut se verrouiller après un à-plat).
  // Recale le roulis lissé sur le réel ; conserve le flux et l'objectif.
  function reinitialiserAideNiveau() {
    rollSmoothRef.current = rollRawRef.current; // recale le roulis lissé sur le réel → lève le verrou
    smoothPitchOffsetRef.current = 0;
    motionTsRef.current = 0;
    setVisualRoll(rollRawRef.current);
    setPitchValid(false);
    setRollValid(false);
    setIsLevel(false);
    divergenceDepuisRef.current = null;
    marquerBloque(false);
  }

  // Bouton « refresh » : recale le niveau, RE-DEMANDE la permission capteurs (redonne sa chance au
  // niveau), ré-arme le repli 3 s, et redémarre la caméra. La capture reste non bloquante (videoReady).
  async function rafraichirNiveauEtCamera() {
    reinitialiserAideNiveau();
    setNiveauIndispo(false);
    sensorSeenRef.current = false;
    const { hasOrientPerm, orientGranted } = await demanderPermissionCapteurs();
    if (hasOrientPerm && !orientGranted) setNiveauIndispo(true);
    armerTimerNiveau();
    redemarrerCamera();
  }

  // Repli niveau : (ré)arme un timer ; si aucun capteur n'a été vu après 3 s → niveau indisponible.
  // N'affecte JAMAIS la capture (découplée via peutCapturer = videoReady).
  function armerTimerNiveau() {
    if (sensorTimerRef.current) clearTimeout(sensorTimerRef.current);
    sensorTimerRef.current = setTimeout(() => {
      if (!sensorSeenRef.current) setNiveauIndispo(true);
    }, 3000);
  }

  // Demande les permissions capteurs iOS (orientation + motion) sur un geste utilisateur.
  // requestPermission DOIT être appelé avant tout autre await pour rester dans le geste.
  // Renvoie hasOrientPerm (gate iOS présent ?) et orientGranted (orientation accordée ?).
  async function demanderPermissionCapteurs(): Promise<{ hasOrientPerm: boolean; orientGranted: boolean }> {
    const hasOrientPerm =
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as any).requestPermission === "function";
    const hasMotionPerm =
      typeof DeviceMotionEvent !== "undefined" &&
      typeof (DeviceMotionEvent as any).requestPermission === "function";
    let orientGranted = true;
    if (hasOrientPerm) {
      try {
        const res = await (DeviceOrientationEvent as any).requestPermission();
        orientGranted = res === "granted";
      } catch (err) {
        console.log("Erreur capteur orientation :", err);
        orientGranted = false;
      }
    }
    if (hasMotionPerm) {
      try {
        await (DeviceMotionEvent as any).requestPermission();
      } catch (err) {
        console.log("Erreur capteur motion :", err);
      }
    }
    return { hasOrientPerm, orientGranted };
  }

  // Allume UNIQUEMENT le flux caméra (sans toucher aux capteurs). Renvoie :
  //  - "ok"     : flux obtenu (objectif ultra grand-angle basculé si dispo) ;
  //  - "refus"  : getUserMedia a renvoyé NotAllowedError (permission caméra refusée) ;
  //  - "erreur" : autre échec matériel.
  async function allumerCamera(): Promise<"ok" | "refus" | "erreur"> {
    const constraints = {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };
    const attacher = async (stream: MediaStream) => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // filet autoplay iOS (en plus de l'attribut JSX)
        try {
          await videoRef.current.play(); // iOS ne lance pas l'autoplay seul → play() explicite
        } catch {
          // play peut être rejeté ; on retombe sur reevaluerVideoReady via les events / le re-render
        }
        reevaluerVideoReady();
      }
      const { sU, uId } = await detecterObjectif(stream);
      if (uId && !sU) await passerUltraGrandAngle(uId);
    };
    try {
      await attacher(await navigator.mediaDevices.getUserMedia(constraints));
      return "ok";
    } catch (err) {
      if ((err as DOMException)?.name === "NotAllowedError") return "refus";
      console.warn("Tentative caméra standard...", err);
      try {
        await attacher(await navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
        return "ok";
      } catch (fallbackErr) {
        if ((fallbackErr as DOMException)?.name === "NotAllowedError") return "refus";
        console.error("Erreur caméra :", fallbackErr);
        return "erreur";
      }
    }
  }

  // Ouvre l'écran photo. ORDRE iOS CORRIGÉ : ORIENTATION D'ABORD (requestPermission DOIT s'exécuter
  // pendant la transient activation du tap), CAMÉRA ENSUITE — toujours dans le même geste. Tant que les
  // deux permissions ne sont pas traitées, l'écran affiche « Préparation… » (pas de niveau mort, pas de
  // refresh manuel). Refus → modale applicative dédiée.
  async function startCamera() {
    setPhoto(null);
    setCameraRefusee(false);
    setOrientationRefusee(false);
    setNiveauIndispo(false);
    sensorSeenRef.current = false;
    setIsCameraActive(true); // monte l'overlay (écran d'attente tant que prepCamera/!videoReady)
    setPrepCamera(true);

    // 1) ORIENTATION D'ABORD — dans le geste du tap.
    const { hasOrientPerm, orientGranted } = await demanderPermissionCapteurs();
    if (hasOrientPerm && !orientGranted) {
      setPrepCamera(false);
      setOrientationRefusee(true); // modale « Réessayer » (re-déclenche requestPermission dans le clic)
      return; // la caméra n'est PAS allumée tant que l'orientation n'est pas accordée
    }

    // 2) CAMÉRA ENSUITE — même geste.
    const statut = await allumerCamera();
    finaliserOuvertureCamera(statut, hasOrientPerm);
  }

  // Suite commune (startCamera + retries) une fois le flux caméra résolu.
  function finaliserOuvertureCamera(statut: "ok" | "refus" | "erreur", hasOrientPerm: boolean) {
    setPrepCamera(false);
    if (statut === "refus") {
      setIsCameraActive(false);
      setCameraRefusee(true); // modale instructions Réglages (iOS ne redemande pas)
      return;
    }
    if (statut === "erreur") {
      setIsCameraActive(false);
      alert("Impossible d'accéder à la caméra.");
      return;
    }
    // Caméra OK. Filet de sécurité capteurs : 3 s sans échantillon → niveau indisponible — UNIQUEMENT
    // pour les appareils sans gyroscope (Android/desktop) ; sur iOS la permission est déjà accordée ici.
    setNiveauIndispo(false);
    armerTimerNiveau();
    if (!hasOrientPerm && typeof window !== "undefined" && !("ontouchstart" in window)) {
      setIsLevel(true);
      setPitchValid(true);
      setRollValid(true);
    }
    // Caméra ACCORDÉE → on demande la position GPS (centrage carte uniquement, non bloquant).
    demanderPositionGPS();
  }

  // « Réessayer » de la modale orientation : re-déclenche requestPermission DANS le geste du clic
  // (iOS réaffiche la demande native), puis enchaîne la caméra si accordé.
  async function reessayerOrientation() {
    const { hasOrientPerm, orientGranted } = await demanderPermissionCapteurs();
    if (hasOrientPerm && !orientGranted) return; // toujours refusé → la modale reste affichée
    setOrientationRefusee(false);
    setIsCameraActive(true);
    setPrepCamera(true);
    const statut = await allumerCamera();
    finaliserOuvertureCamera(statut, hasOrientPerm);
  }

  // « Réessayer » de la modale caméra : UNE seule tentative getUserMedia ; si elle échoue encore,
  // la modale (instructions Réglages) reste affichée (iOS a mémorisé le refus, pas de re-prompt natif).
  async function reessayerCamera() {
    setIsCameraActive(true);
    setPrepCamera(true);
    const statut = await allumerCamera();
    setPrepCamera(false);
    if (statut === "ok") {
      setCameraRefusee(false);
      setNiveauIndispo(false);
      armerTimerNiveau();
      demanderPositionGPS(); // caméra ré-accordée → centrage carte (non bloquant)
      return;
    }
    setIsCameraActive(false); // échec → on garde la modale instructions
  }

  // Demande de géolocalisation, réutilisable : capturePhoto ET bouton "Utiliser ma position".
  function demanderPositionGPS() {
    userMovedRef.current = false; // nouvelle demande GPS : autorise le centrage tant que l'utilisateur n'a pas bougé
    setCarteCentrePret(false); // on (ré)acquiert un centre → masque la carte le temps de l'avoir (pas de flash Paris)
    if (navigator.geolocation) {
      setAddress("");
      setPositionGPSObtenue(false);
      setAddressInfo("Calcul de votre position GPS…");

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const photoPosition = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
          // Met à jour la carte et lance le calcul d'adresse automatique (evaluer suit via moveend).
          // Gâté : si le GPS répond TARD (après que l'utilisateur a déjà bougé), on NE recentre PAS.
          if (!userMovedRef.current) {
            setPosition(photoPosition);
          }
          setCarteCentrePret(true); // vrai centre connu → la carte peut naître dessus
          await getAddressFromGPS(photoPosition.latitude, photoPosition.longitude);
          setPositionGPSObtenue(true);
        },
        (error) => {
          console.warn("Géoloc refusée/indisponible — code:", error?.code, "message:", error?.message);
          setPositionGPSObtenue(false);
          if (error?.code === 1) {
            // Refus : sans impact (le GPS ne sert qu'au centrage ; le point est posé à la main).
            setAddressInfo(
              "Géolocalisation non partagée — saisissez votre adresse ci-dessus, ou déplacez la carte directement sur la fenêtre du logement.",
            );
          } else {
            setAddressInfo("Géolocalisation introuvable — saisissez l'adresse ou déplacez le repère sur la carte.");
          }
          setCarteCentrePret(true); // pas de GPS → on affiche la carte (placement manuel sur le centre courant)
        },
        {
          enableHighAccuracy: false, // position approx suffit (origine posée à la main) ; évite les timeouts en intérieur
          timeout: 20000,
          maximumAge: 60000 // accepte une position en cache (≤ 60 s)
        }
      );
    } else {
      // Fallback si le navigateur ne gère pas la géolocalisation
      setPositionGPSObtenue(false);
      setCarteCentrePret(true); // pas de géoloc → on affiche la carte (placement manuel)
      setAddressInfo("Géolocalisation indisponible — saisissez l'adresse ou déplacez le repère.");
    }
  }

  // 🛠️ CAPTURE DOUBLE : PHOTO + POSITION GPS SIMULTANÉE
  function capturePhoto() {
    if (!peutCapturer) return; // niveau bloquant : capture seulement si caméra prête ET téléphone droit

    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        // 1. On fige la photo immédiatement
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        setPhoto(canvas.toDataURL("image/jpeg"));
        setCapturedOrientation(angles.heading); 
        
        // 2. On éteint proprement le flux caméra
        stopCamera();

        // 3. On déclenche la géolocalisation pour placer le point sur la carte
        if (conserverPositionRef.current) {
          conserverPositionRef.current = false;
          setCarteCentrePret(true); // point conservé : centre déjà bon, pas d'attente GPS
          origine.evaluer(position.latitude, position.longitude, mode); // re-évalue le point conservé (sans GPS)
        } else {
          demanderPositionGPS();
        }
        setEtape("localisation");
      }
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setIsCameraActive(false);
  }

  async function handleAnalyse() {
    // Garde-fous AVANT tout appel réseau (restent sur l'écran "infos" si KO).
    if (!origine.valide) {
      setAnalyseErreur(
        "Point d'origine non validé. Revenez à l'étape carte et validez un point dans un bâtiment.",
      );
      return;
    }
    const lat = origine.valide.lat;
    const lon = origine.valide.lon;
    // Azimut transmis = valeur AJUSTÉE par l'internaute (sinon le cap capté). Le calcul est inchangé.
    const azimut = azimutAjuste;
    if (azimut === null) {
      setAnalyseErreur(
        "Orientation manquante. Reprenez la photo pour capturer le cap (boussole).",
      );
      return;
    }
    const etageNum = etage.trim() === "" ? NaN : Number(etage);
    if (!Number.isInteger(etageNum) || etageNum < 0) {
      setAnalyseErreur(
        "Indiquez un étage valide (nombre entier, 0 = rez-de-chaussée).",
      );
      return;
    }
    if (dernierEtage === null) {
      setAnalyseErreur("Indiquez si c'est le dernier étage.");
      return;
    }

    // Tout est bon : bascule sur l'écran résultat en mode chargement.
    setAnalyseErreur(null);
    setAnalyse(null);
    setEtatPhoto("en_cours"); // repart propre : analyse photo lancée dès la phase 1
    setAnalyseEnCours(true);
    setEtape("resultat");
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }, 100);

    try {
      const r = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, azimut, etage: etageNum, hauteurSousPlafondM, dernierEtage, mode }),
      });
      const data = await r.json();
      if (!r.ok || data.ok === false) {
        setAnalyseErreur(data?.erreur ?? "Erreur lors de l'analyse.");
      } else {
        setAnalyse(data as ReponseAnalyse);
        // Phase 2 (asynchrone, NON bloquante) : l'écran résultat s'affiche tout de suite avec le
        // score géométrique ; l'analyse photo enrichira le score plus tard si disponible.
        void lancerAnalysePhoto(lat, lon, azimut, photo);
      }
    } catch {
      setAnalyseErreur("Connexion impossible au service d'analyse.");
    } finally {
      setAnalyseEnCours(false);
    }
  }

  // Phase 2 — analyse photo asynchrone (non bloquante). Bouchon /api/analyse-photo pour l'instant
  // (disponible:false → indisponible). Timeout 8 s ; abort/réseau/échec → indisponible.
  async function lancerAnalysePhoto(lat: number, lon: number, azimut: number, photoDataUrl: string | null) {
    if (!photoDataUrl) { setEtatPhoto("echec"); return; }
    setEtatPhoto("en_cours");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000); // timeout 45 s (marge large pour pics de latence Gemini)
    try {
      const r = await fetch("/api/analyse-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: photoDataUrl, lat, lon, azimut, mode, etage: Number(etage), hauteurSousPlafondM, dernierEtage }),
        signal: ctrl.signal,
      });
      const data = await r.json();
      // Échec serveur (snap indisponible / préparateur / IA technique) → score géométrique conservé, on signale "sans photo"
      if (!r.ok || data?.ok !== true || data?.disponible !== true) {
        setEtatPhoto("echec");
        return;
      }
      // Photo INEXPLOITABLE (géométrie OK mais photo nulle/floue/intérieur) → on garde le score géométrique, message "sans photo"
      if (data.exploitable !== true) {
        setEtatPhoto("inexploitable");
        return;
      }
      // Photo EXPLOITABLE → on applique le score enrichi renvoyé par le serveur dans resultat.score.total
      if (typeof data.score === "number") {
        setAnalyse((prev) =>
          prev && prev.resultat
            ? { ...prev, resultat: { ...prev.resultat, score: { ...prev.resultat.score, total: data.score } } }
            : prev
        );
      }
      setEtatPhoto("exploitable");
    } catch (e) {
      console.error("[front] analyse-photo catch:", (e as Error)?.name, (e as Error)?.message);
      setEtatPhoto("echec"); // abort/timeout/réseau → echec
    } finally {
      clearTimeout(timer);
    }
  }

  // « Mauvaise orientation » : reprendre la photo en conservant le point d'origine déjà placé.
  function reprendrePhoto() {
    reinitialiserCapteurs();             // repart d'un état niveau propre (évite le déclencheur grisé)
    setPhoto(null);
    setCapturedOrientation(null);
    origine.reset();                     // repasse en non-validé
    conserverPositionRef.current = true; // garde la position du marqueur (GPS ne l'écrase pas)
    setEtape("photo");
    startCamera(); // ouvre directement la caméra, comme « C'est parti »
  }

  // Calculs mécaniques de l'instrumentation de bord (AFFICHAGE uniquement)
  // Échelle 3.5 px/° : la tolérance OK (±3.5° autour de 90.5°) tient dans ±~12 px du repère.
  const lineTranslateY = Math.max(-40, Math.min(40, visualPitchOffset * 3.5));
  // Clamp ±60° : une valeur de roulis aberrante ne fait jamais basculer la barre complètement.
  const cursorRotationDeg = Math.max(-60, Math.min(60, visualRoll));

  // Niveau combiné (PRÉSENTATION uniquement) — réutilise pitchValid/rollValid existants,
  // aucun seuil ni calcul de capteur modifié. Code couleur à 3 états + légende d'aide.
  const niveauTousOk = pitchValid && rollValid;
  const niveauUnSeulOk = (pitchValid || rollValid) && !niveauTousOk;
  const couleurNiveau = niveauTousOk ? "#2e9e5b" : niveauUnSeulOk ? "#e08a1e" : "#c0392b";
  // Bouton de capture honnête : vert/actif seulement si niveau OK ET flux vidéo réellement prêt.
  // Niveau bloquant : la capture n'est autorisée que si le téléphone est droit (niveauTousOk).
  const peutCapturer = videoReady && niveauTousOk; // capture autorisée seulement si caméra prête ET téléphone droit
  const legendeNiveau = niveauTousOk
    ? "✓ Parfait — prenez la photo"
    : !pitchValid && !rollValid
      ? "Redressez et ajustez l'inclinaison"
      : !rollValid
        ? "Redressez le téléphone"
        : "Ajustez l'inclinaison verticale";

  // L'écran « vrai résultat » (7A/7B) est pleine hauteur comme l'accueil/chargement.
  const resultatReussi =
    etape === "resultat" &&
    !analyseEnCours &&
    !analyseErreur &&
    analyse?.resultat != null &&
    analyse.resultat.verdict.verdict !== "INDETERMINE";

  return (
    <main className="flex min-h-[100dvh] flex-col bg-slate-100 px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <section
          className={
            "rounded-3xl bg-white p-6 shadow" +
            (etape === "accueil" ||
            etape === "etapes" ||
            etape === "infos" ||
            (etape === "resultat" && analyseEnCours) ||
            resultatReussi
              ? " flex flex-1 flex-col"
              : "")
          }
        >
          {etape === "accueil" && (
            // Carte pleine hauteur (chaîne flex-1 depuis main min-h-[100dvh]) en COLONNE simple.
            // mt-auto sur la skyline → skyline + boutons + note collés EN BAS ; tout l'espace
            // libre devient du ciel blanc AU-DESSUS de la skyline. -mb-3 réduit le vide sous la note.
            <div className="flex flex-1 flex-col -mb-3">
              {/* Logo — uniquement sur l'accueil (firmware écran 1) */}
              <div className="mb-6 flex justify-center">
                <Image
                  src="/images/logo-svv-lockup.png"
                  alt="Sans Vis-à-Vis®"
                  width={1840}
                  height={413}
                  priority
                  style={{ width: "auto", height: "auto", maxWidth: "330px" }}
                />
              </div>

              {/* Titre centré verticalement dans l'espace libre entre le logo (haut) et l'image (bas, mt-auto) */}
              <div className="flex flex-1 items-center justify-center">
                <h1 className="text-center text-[1.7rem] font-extrabold leading-tight tracking-tight text-svv-ink">
                  Découvrez <span className="text-svv-red">la vraie qualité</span> de votre vue
                </h1>
              </div>

              {/* Photo toits de Paris N&B — mt-auto pousse le bloc bas vers le bas ; hauteur fixe + object-bottom = ciel qui respire au-dessus des toits. Pas d'arrondi ; fondu vers le blanc sur 10 px en bas. */}
              <div className="relative -mx-6 mt-auto mb-6 w-[calc(100%+3rem)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/HOME%20PAGE%202.png"
                  alt=""
                  aria-hidden="true"
                  className="block h-52 w-full max-w-none object-cover object-bottom"
                />
                {/* fondu vers le blanc en haut, sur 10 px (jonction avec la trame de fond de la home) */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[10px] bg-gradient-to-t from-transparent to-white" />
                {/* fondu vers le blanc en bas, sur 10 px */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[10px] bg-gradient-to-b from-transparent to-white" />
              </div>

              <button
                type="button"
                onClick={() => setEtape("etapes")}
                className="svv-btn svv-btn-primary relative"
              >
                Évaluer ma vue
                <span className="absolute right-5 text-xl leading-none">›</span>
              </button>

              <button
                type="button"
                onClick={() => setEtape("etapes")}
                className="svv-btn svv-btn-outline mt-3"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 3v18h18" />
                  <rect x="7" y="11" width="3" height="7" />
                  <rect x="13" y="7" width="3" height="11" />
                </svg>
                <span className="text-left leading-tight">Estimer la valeur<br />de mon bien</span>
              </button>

              <p className="mt-5 text-center text-[11.5px] leading-snug text-svv-muted">
                Sans Vis-à-Vis® : la première construction à + de 40 mètres face au séjour
              </p>
            </div>
          )}

{etape === "etapes" && (
  <EcranEtapes
    onContinuer={() => {
      // « Commencer » mène désormais à l'écran de consentement permissions ; les accès (caméra,
      // orientation, géoloc) y seront demandés. Pour CE commit, le démarrage caméra reste sur le
      // bouton « Autoriser les accès » (comportement permissions inchangé).
      setEtape("consentement");
    }}
  />
)}

{/* Écran de consentement permissions — intercalaire entre « 4 étapes » et la photo.
    Fond plein écran = trame beige (même image que le voile de chargement caméra, instance SÉPARÉE). */}
{etape === "consentement" && (
  <div className="fixed inset-0 z-50 flex flex-col bg-svv-field select-none">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src="/images/Trame%20ecran%20photo%204.png"
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full object-contain object-center"
    />
    <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6">
      <div className="rounded-2xl bg-white/95 p-6 shadow-xl">
        <h1 className="text-[1.6rem] font-extrabold leading-tight tracking-tight text-svv-ink">
          Autorisations requises
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-svv-muted">
          L&apos;analyse de votre vue nécessite les accès suivants :
        </p>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-svv-gray">
          <li>
            <span className="text-svv-red" aria-hidden="true">*</span>&thinsp;<span className="font-semibold text-svv-ink">Appareil photo</span> — pour saisir l&apos;image de votre vue
          </li>
          <li>
            <span className="text-svv-red" aria-hidden="true">*</span>&thinsp;<span className="font-semibold text-svv-ink">Capteur d&apos;orientation</span> — pour déterminer la direction de visée de votre cliché
          </li>
          <li>
            <span className="font-semibold text-svv-ink">Localisation</span> — pour centrer la carte sur votre position
          </li>
        </ul>
        <button
          type="button"
          onClick={() => { setEtape("photo"); startCamera(); }}
          className="svv-btn svv-btn-primary mt-6"
        >
          Autoriser les accès
        </button>
      </div>
    </div>
  </div>
)}

{etape === "photo" && (
  <>
    <h1 className="text-[1.6rem] font-extrabold leading-tight tracking-tight text-svv-ink">
      Photo de la vue
    </h1>
    <p className="mt-2 mb-5 text-sm leading-relaxed text-svv-muted">
      {"Prenez une photo bien droite depuis votre fenêtre. Notre système calcule l'orientation et la position automatiquement."}
    </p>

    <div>
      {!isCameraActive && !photo && (
        <button type="button" onClick={startCamera} className="svv-btn svv-btn-primary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7l2-3h4l2 3" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
          Ouvrir l&apos;appareil photo
        </button>
      )}

      {photo && (
        <div className="relative overflow-hidden rounded-2xl border border-svv-line">
          <img src={photo} alt="Vue séjour capturée" className="h-48 w-full object-cover" />
          <div className="absolute bottom-2 left-2 rounded-md bg-svv-ink/85 px-2 py-1 text-[11px] text-white">
            🧭 Orientation : {capturedOrientation}° (Azimut)
          </div>
          <button
            type="button"
            onClick={startCamera}
            className="absolute top-2 right-2 rounded-lg bg-svv-red px-3 py-1.5 text-xs font-semibold text-white shadow"
          >
            Refaire la photo
          </button>
        </div>
      )}
    </div>
  </>
)}

      {/* Affichage caméra + overlays LIBÉRÉS du verrou « etape » — gardés par leurs propres drapeaux
          (isCameraActive / prepCamera / orientationRefusee / cameraRefusee) pour s'afficher quel que
          soit l'écran (consentement compris). Indentation conservée volontairement (diff minimal). */}
      {isCameraActive && (
        <div className="fixed inset-0 z-50 bg-svv-field select-none">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            onLoadedMetadata={reevaluerVideoReady}
            onCanPlay={reevaluerVideoReady}
            onPlaying={reevaluerVideoReady}
            onWaiting={reevaluerVideoReady}
            onStalled={reevaluerVideoReady}
            onEmptied={reevaluerVideoReady}
          />

          {/* Trame d'attente (carte + appareil rétro) : couvre la vidéo noire tant que le flux n'est
              pas prêt. z-[5] = au-dessus de la vidéo (z-auto), SOUS le HUD (z-10) et les barres (z-20).
              Toujours montée → fondu de sortie (opacity) quand videoReady passe true. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/Trame%20ecran%20photo%204.png"
            alt=""
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 z-[5] h-full w-full bg-svv-field object-contain object-center transition-opacity duration-300 ${
              videoReady ? "opacity-0" : "opacity-100"
            }`}
          />

          {/* Anneau rouge clignotant du bouton « Grand-angle » (incite au tap). */}
          <style>{`@keyframes svvRing{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0.9)}}.svvRingPulse{animation:svvRing 1.1s ease-in-out infinite}`}</style>

          {/* UI caméra (barres + HUD) : masquée pendant l'écran d'attente (trame seule),
              réapparaît dès que le flux vidéo est prêt (videoReady). */}
          {videoReady && (
          <>
          {/* Barre supérieure */}
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-12 pb-4">
            <button
              type="button"
              onClick={rafraichirNiveauEtCamera}
              className={`flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white ${niveauBloque ? "svvRingPulse" : ""}`}
              aria-label="Réinitialiser le niveau"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <div className="flex flex-col items-center text-center leading-tight">
              {niveauIndispo ? (
                <span className="max-w-[230px] text-[12px] font-medium text-white/80">
                  Niveau indisponible — vous pouvez quand même prendre la photo
                </span>
              ) : (
                <>
                  <span className={`text-sm font-semibold ${isLevel ? "text-[#7CE2A0]" : "text-white"}`}>
                    {isLevel ? "Bien droit" : "Ajustez le niveau"}
                  </span>
                  <span className="mt-0.5 text-[11px] text-white/80">
                    Inclinaison {angles.pitch}° · Roulis {angles.roll}°
                  </span>
                </>
              )}
              <span className="text-[11px] text-white/80">
                Azimut{" "}
                {typeof angles.heading === "number"
                  ? `${Math.round(angles.heading)}° (${cardinal(angles.heading)})`
                  : "en attente…"}
              </span>
            </div>
            <div className="h-9 w-9" aria-hidden="true" />
          </div>

          {/* HUD niveau combiné : cible fixe + barre flottante (pitch = translateY, roll = rotate) */}
          <div className="absolute inset-0 pointer-events-none z-10">
            {/* Cible fixe : fin trait horizontal pleine largeur (discret) */}
            <div
              className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
              style={{ background: "rgba(255,255,255,0.18)" }}
            />
            {/* Cible fixe : tirets latéraux + point central cerclé (passe au vert quand tout est OK) */}
            <div
              className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center"
              style={{ gap: "14px" }}
            >
              <div style={{ width: "26px", height: "2px", background: "rgba(255,255,255,0.6)" }} />
              <div
                className="flex items-center justify-center rounded-full transition-colors duration-150"
                style={{
                  width: "16px",
                  height: "16px",
                  border: `1.5px solid ${niveauTousOk ? "#2e9e5b" : "rgba(255,255,255,0.6)"}`,
                }}
              >
                <div
                  className="rounded-full transition-colors duration-150"
                  style={{
                    width: "6px",
                    height: "6px",
                    background: niveauTousOk ? "#2e9e5b" : "rgba(255,255,255,0.85)",
                  }}
                />
              </div>
              <div style={{ width: "26px", height: "2px", background: "rgba(255,255,255,0.6)" }} />
            </div>

            {/* Barre flottante = niveau horizon combiné (2 demi-segments + gap central) */}
            <div
              className="absolute left-1/2 top-1/2 flex items-center"
              style={{
                gap: "26px",
                transform: `translate(-50%, -50%) translateY(${lineTranslateY}px) rotate(${cursorRotationDeg}deg)`,
                transformOrigin: "center",
                // AUCUNE transition sur la rotation : le lissage JS (rAF, τ≈0.18s) suffit → pas de traînée.
                transition: "none",
              }}
            >
              <div
                className="transition-colors duration-150"
                style={{ width: "90px", height: "9px", borderRadius: "6px", background: couleurNiveau, boxShadow: "0 1px 4px rgba(0,0,0,.35)" }}
              />
              <div
                className="transition-colors duration-150"
                style={{ width: "90px", height: "9px", borderRadius: "6px", background: couleurNiveau, boxShadow: "0 1px 4px rgba(0,0,0,.35)" }}
              />
            </div>

            {/* Légende d'aide sous la barre (pilotée par les mêmes booléens) */}
            <div
              className="absolute left-1/2 top-1/2 text-center"
              style={{ transform: "translate(-50%, 54px)", width: "260px" }}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: niveauTousOk ? "#2e9e5b" : "#ffffff",
                  textShadow: "0 1px 6px rgba(0,0,0,.65)",
                }}
              >
                {legendeNiveau}
              </span>
            </div>
          </div>

          {/* Barre inférieure : Grand-angle · déclencheur · Aide */}
          <div className="absolute inset-x-0 bottom-0 z-20 px-6 pb-10">
            <p className="mb-5 text-center text-sm text-white/90" style={{ textShadow: "0 1px 6px rgba(0,0,0,.5)" }}>
              Cadrez votre vue et maintenez votre téléphone bien droit.
            </p>
            <div className="flex items-center justify-between">
              {surUltra ? (
                <span className="w-16 text-center text-[11px] text-white/85">Ultra grand-angle</span>
              ) : ultraDeviceId !== null ? (
                <button
                  type="button"
                  onClick={() => passerUltraGrandAngle()}
                  className="svvRingPulse w-16 rounded-full px-2 py-1 text-center text-[11px] text-white"
                >
                  Ultra grand-angle
                </button>
              ) : (
                <span className="w-16 text-center text-[11px] text-white/85">Grand-angle</span>
              )}
              <button
                type="button"
                onClick={capturePhoto}
                disabled={!peutCapturer}
                aria-label="Prendre la photo"
                className={`h-[74px] w-[74px] rounded-full border-[5px] transition-all duration-300 ${
                  peutCapturer ? "bg-white border-[#7CE2A0]/80 active:scale-95" : "bg-white/50 border-white/30 cursor-not-allowed"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowInfoPhoto(true)}
                aria-label="Informations sur la photo"
                className="flex w-16 flex-col items-center gap-0.5 text-[11px] text-white/85"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5" />
                  <path d="M12 7.5h.01" />
                </svg>
                Info
              </button>
            </div>
          </div>
          </>
          )}

          {/* Modale « À quoi sert cette photo ? » — même motif que la modale Façade (overlay z-[3000]). */}
          {showInfoPhoto && (
            <div onClick={() => setShowInfoPhoto(false)} className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/45 p-5">
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
                <h2 className="text-lg font-extrabold text-svv-ink">À quoi sert cette photo ?</h2>
                <p className="mt-3 text-sm leading-relaxed text-svv-gray">Cette photo nous aide à analyser votre vue de trois façons :</p>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed text-svv-gray">
                  <li>• <span className="font-semibold text-svv-ink">Analyse de la vue</span> — notre intelligence artificielle observe le paysage visible (ciel, espaces verts, monuments…) pour évaluer la qualité de la vue.</li>
                  <li>• <span className="font-semibold text-svv-ink">Localisation</span> — la photo nous indique l&apos;endroit exact d&apos;où elle est prise, pour positionner l&apos;analyse sur la carte.</li>
                  <li>• <span className="font-semibold text-svv-ink">Orientation</span> — elle nous donne la direction du regard, pour savoir vers où s&apos;ouvre la vue.</li>
                </ul>
                <h3 className="mt-4 text-sm font-semibold text-svv-ink">Comment bien la prendre ?</h3>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed text-svv-gray">
                  <li>• Tenez le téléphone bien droit : alignez la barre de niveau jusqu&apos;à ce qu&apos;elle passe au vert.</li>
                  <li>• Cadrez la vue comme vous la voyez depuis la fenêtre ou le balcon.</li>
                  <li>• Appuyez sur le bouton de capture une fois le niveau validé.</li>
                </ul>
                <button type="button" onClick={() => setShowInfoPhoto(false)} className="svv-btn svv-btn-primary mt-5">Compris</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Note : aucun voile « Préparation… » pendant les demandes — l'écran d'attente caméra (illustration
          centrée sur fond beige, via l'overlay isCameraActive) reste visible, seuls les prompts natifs iOS
          s'affichent. L'état prepCamera et ses setters sont conservés (séquence inchangée) mais ne pilotent
          plus aucun rendu. */}

      {/* Refus ORIENTATION : modale applicative — le niveau est requis ; « Réessayer » re-déclenche la
          demande native dans le geste du clic (iOS la réaffiche). */}
      {orientationRefusee && (
        <div className="fixed inset-0 z-[3100] flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl">
            <h2 className="text-lg font-extrabold text-svv-ink">Accès au mouvement nécessaire</h2>
            <p className="mt-3 text-sm leading-relaxed text-svv-gray">
              Le niveau (inclinaison du téléphone) sert à mesurer l&apos;orientation de votre vue. Sans cette
              autorisation, l&apos;analyse ne peut pas se faire correctement.
            </p>
            <button type="button" onClick={reessayerOrientation} className="svv-btn svv-btn-primary mt-5">
              Réessayer
            </button>
          </div>
        </div>
      )}

      {/* Refus CAMÉRA : modale applicative — iOS ne redemande PAS une fois refusé → instructions Réglages.
          « Réessayer » retente une seule fois ; si ça échoue encore, la modale reste sur les instructions. */}
      {cameraRefusee && (
        <div className="fixed inset-0 z-[3100] flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl">
            <h2 className="text-lg font-extrabold text-svv-ink">Accès à la caméra refusé</h2>
            <p className="mt-3 text-sm leading-relaxed text-svv-gray">
              La photo de votre vue est indispensable à l&apos;analyse, et l&apos;accès à la caméra a été refusé.
            </p>
            <p className="mt-3 rounded-lg bg-svv-field p-3 text-left text-xs leading-relaxed text-svv-gray">
              Pour réactiver : <span className="font-semibold text-svv-ink">Réglages → Safari → Appareil photo → Autoriser</span>,
              puis revenez et réessayez. iOS ne redemande pas l&apos;autorisation automatiquement une fois refusée.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button type="button" onClick={reessayerCamera} className="svv-btn svv-btn-primary">Réessayer</button>
              <button type="button" onClick={() => { setCameraRefusee(false); setIsCameraActive(false); }} className="svv-btn svv-btn-outline">Fermer</button>
            </div>
          </div>
        </div>
      )}

          {/* ZONE 2 : ADRESSE + CARTE */}
{etape === "localisation" && (
  <div className="animate-fadeIn">
    <div className="-mx-6 -mt-6 mb-4 rounded-t-3xl bg-svv-red px-6 py-5">
      <h1 className="text-[1.45rem] font-extrabold leading-tight text-white">
        (Point GPS) Déplacez le curseur sur votre fenêtre
      </h1>
    </div>

    <label className="mb-1 block text-lg font-semibold text-svv-ink">
      {positionGPSObtenue ? "Votre adresse" : "Saisissez votre adresse"}
    </label>
    <AdresseAutocomplete
      value={address}
      onChange={setAddress}
      onSelect={onSelectAdresse}
      placeholder="Saisissez l'adresse, ou déplacez le repère sur la carte"
    />
    {addressInfo && (
      <p className="mt-2 mb-3 text-xs text-svv-muted">{addressInfo}</p>
    )}

    <div className="mt-3 overflow-hidden rounded-2xl border border-svv-line">
      {carteCentrePret ? (
        <MapSelector
          latitude={position.latitude}
          longitude={position.longitude}
          onPositionChange={(newPosition) => {
            userMovedRef.current = true; // vrai déplacement → le GPS photo tardif ne recentrera plus
            setPosition(newPosition);
            getAddressFromGPS(newPosition.latitude, newPosition.longitude);
            origine.evaluer(newPosition.latitude, newPosition.longitude, mode);
          }}
          onUserMove={() => { userMovedRef.current = true; setPointDeplace(true); }}
          pointSnappe={mode === "manuel" ? null : (origine.resultat?.pointSnappeWgs84 ?? null)}
          mode={mode}
          onModeChange={(x) => { setMode(x); origine.evaluer(position.latitude, position.longitude, x); }}
        />
      ) : (
        // Placeholder neutre, même hauteur que la carte → pas de flash Paris ni de saut de layout.
        <div className="h-80 w-full animate-pulse bg-svv-field" aria-hidden="true" />
      )}
    </div>
    {/* État 2 (après le 1er déplacement) : règle 1-2 + bouton « i ». Jamais en même temps que le cartouche rouge. */}
    {pointDeplace && (
    <div className="mt-2 flex items-center justify-center gap-1.5">
      <ol className="list-decimal list-inside space-y-0.5 text-xs text-svv-muted">
        <li>Déplacez la carte pour placer le curseur précisément sur votre fenêtre.</li>
        <li>Le curseur doit obligatoirement se trouver à l&apos;intérieur d&apos;un bâtiment pour être validé.</li>
      </ol>
      <button
        type="button"
        onClick={() => { setInfoLocalisationOuvert(true); setInfoLocalisationVu(true); }}
        aria-label="Pourquoi placer ce point ?"
        className={`shrink-0 ${infoLocalisationVu ? "text-svv-ink" : "svvInfoPulse"}`}
      >
        <span className={`inline-block ${bumpInfoLocalisation && !infoLocalisationVu ? "svvInfoBump" : ""}`}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 7.5h.01" />
          </svg>
        </span>
      </button>
    </div>
    )}

    {/* Tant que l'utilisateur n'a pas déplacé le point : consigne. */}
    {!pointDeplace && (
      <div className="mt-3 rounded-xl border border-svv-red/30 bg-svv-red/5 p-3 text-sm font-semibold text-svv-red">
        <ol className="list-decimal list-inside space-y-1">
          <li>Déplacez la carte pour placer le curseur précisément sur votre fenêtre.</li>
          <li>Le curseur doit obligatoirement se trouver à l&apos;intérieur d&apos;un bâtiment pour être validé.</li>
        </ol>
      </div>
    )}

    {/* Validation du point d'origine (PostGIS via /api/origine) — slot TOUJOURS monté (hauteur
        réservée min-h) tant qu'on place le point : seuls couleur/texte changent, jamais de
        démontage, pour que le bouton « Valider » dessous ne saute pas. Atténué pendant le recalcul. */}
    {pointDeplace && !origine.valide && (
      <div className="mt-3 min-h-12">
        {origine.resultat ? (
          <div
            className={
              "rounded-xl border p-3 text-sm font-medium transition-opacity" +
              (origine.enCours ? " opacity-70" : "") + " " +
              (origine.resultat.statut === "VALIDE"
                ? "border-svv-green/40 bg-svv-green-soft text-svv-green-ink"
                : origine.resultat.statut === "HORS_BATIMENT"
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-svv-red/30 bg-svv-red/5 text-svv-red")
            }
          >
            {origine.resultat.statut === "VALIDE" &&
              "✓ Point validable — à l'intérieur d'un bâtiment"}
            {origine.resultat.statut === "HORS_BATIMENT" &&
              `✗ Point non validable — en dehors d'un bâtiment (à ${origine.resultat.distanceAuBatimentM.toFixed(2)} m). Déplacez le curseur.`}
            {origine.resultat.statut === "SANS_BATIMENT" &&
              "✗ Point non validable — aucun bâtiment ici."}
          </div>
        ) : (
          origine.enCours && (
            <p className="text-sm text-svv-muted">Vérification du point…</p>
          )
        )}
      </div>
    )}

    <button
      type="button"
      onClick={() => {
        origine.confirmer(position.latitude, position.longitude);
        setEtape("orientation");
      }}
      disabled={!pointDeplace || origine.resultat?.statut !== "VALIDE" || !!origine.valide}
      className={
        "mt-4 " +
        (pointDeplace && origine.resultat?.statut === "VALIDE" && !origine.valide
          ? "svv-btn svv-btn-primary"
          : "svv-btn cursor-not-allowed bg-svv-field text-svv-muted")
      }
    >
      Valider votre point de vue
    </button>

    {/* Pop-up d'aide « Pourquoi ce point et comment le placer » (calquée sur l'écran orientation) */}
    {infoLocalisationOuvert && (
      <div
        onClick={() => setInfoLocalisationOuvert(false)}
        className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/45 p-5"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl bg-white p-5 shadow-xl"
        >
          <h2 className="text-lg font-extrabold text-svv-ink">Pourquoi ce point et comment le placer</h2>
          <h3 className="mt-4 text-sm font-semibold text-svv-ink">À quoi il sert ?</h3>
          <p className="mt-1 text-sm leading-relaxed text-svv-gray">
            C&apos;est le point de départ du calcul : l&apos;application mesure depuis cet endroit précis tout ce qui se trouve devant vous pour déterminer si la vue est dégagée. La position GPS récupérée lors de la géolocalisation n&apos;est pas assez précise pour servir de point d&apos;origine : vous devez l&apos;ajuster vous-même pour garantir un résultat fiable. Mal placé, l&apos;analyse part du mauvais endroit et le résultat sera faux.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-svv-ink">Où le poser ?</h3>
          <p className="mt-1 text-sm leading-relaxed text-svv-gray">
            Posez-le <span className="font-semibold text-svv-ink">sur la façade de votre immeuble, à l&apos;emplacement de votre fenêtre</span>{" "}d&apos;où vous venez de prendre votre photo — le plus près possible du mur extérieur, mais impérativement à l&apos;intérieur des contours du bâtiment. Évitez la rue ou un espace extérieur : le point doit rester dans votre bâtiment pour être validé.
          </p>
          <button
            type="button"
            onClick={() => setInfoLocalisationOuvert(false)}
            className="svv-btn svv-btn-primary mt-5"
          >
            Compris
          </button>
        </div>
      </div>
    )}
  </div>
)}

          {/* ÉCRAN 3 : VALIDATION DE L'ORIENTATION */}
{etape === "orientation" && (
  <div className="animate-fadeIn">
    <div className="-mx-6 -mt-6 mb-4 rounded-t-3xl bg-svv-red px-6 py-5">
      <h1 className="text-[1.45rem] font-extrabold leading-tight text-white">
        Ajustez votre orientation
      </h1>
    </div>

    {photo && (
      <div className="relative -mx-6 mb-3 aspect-[2/1] overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt="Vue capturée"
          className="w-full h-full object-cover object-center"
        />
        {/* Croix de visée centrale (faisceau de contrôle) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-6 w-6">
            <div className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 bg-[#dc2626] shadow-[0_0_2px_rgba(0,0,0,0.85)]" />
            <div className="absolute left-1/2 top-1/2 h-px w-9 -translate-x-1/2 -translate-y-1/2 bg-white shadow-[0_0_2px_rgba(0,0,0,0.85)]" />
          </div>
        </div>
      </div>
    )}

    <div className="mb-1">
      <FaisceauMap
        lat={origine.valide?.lat ?? position.latitude}
        lon={origine.valide?.lon ?? position.longitude}
        azimutDeg={azimutAjuste}
        azimutInitial={capturedOrientation}
        onAzimutChange={(propose) =>
          setAzimutAjuste(
            capturedOrientation === null
              ? null
              : Math.max(
                  capturedOrientation - MARGE_AJUSTEMENT_AZIMUT_DEG,
                  Math.min(capturedOrientation + MARGE_AJUSTEMENT_AZIMUT_DEG, propose),
                ),
          )
        }
      />
    </div>
    <div className="mb-3 flex items-center justify-center gap-1.5">
      <p className="text-center text-xs text-svv-muted">
        Si nécessaire, faites pivoter la carte pour que le faisceau rouge suive l&apos;axe principal de votre vue, face au séjour (±{MARGE_AJUSTEMENT_AZIMUT_DEG}°).
      </p>
      <button
        type="button"
        onClick={() => { setInfoOrientationOuvert(true); setInfoOrientationVu(true); }}
        aria-label="Pourquoi ajuster l'orientation ?"
        className={`shrink-0 ${infoOrientationVu ? "text-svv-ink" : "svvInfoPulse"}`}
      >
        <span className={`inline-block ${bumpInfo && !infoOrientationVu ? "svvInfoBump" : ""}`}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 7.5h.01" />
          </svg>
        </span>
      </button>
    </div>

    <button
      type="button"
      onClick={() => setEtape("infos")}
      className="svv-btn svv-btn-primary"
    >
      Valider mon orientation
    </button>
    <button
      type="button"
      onClick={reprendrePhoto}
      className="svv-btn svv-btn-outline mt-2"
    >
      Mauvaise orientation — reprendre la photo
    </button>

    {/* Pop-up d'aide « Pourquoi ajuster l'orientation ? » */}
    {infoOrientationOuvert && (
      <div
        onClick={() => setInfoOrientationOuvert(false)}
        className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/45 p-5"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl bg-white p-5 shadow-xl"
        >
          <h2 className="text-lg font-extrabold text-svv-ink">Pourquoi ajuster l&apos;orientation ?</h2>
          <p className="mt-3 text-sm leading-relaxed text-svv-gray">
            L&apos;azimut — la direction de votre vue — est mesuré automatiquement au moment de la photo. Deux facteurs peuvent toutefois le rendre approximatif :
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-svv-gray">
            <li>• Pour faciliter la prise de vue, une tolérance de ±30° est admise sur l&apos;inclinaison du téléphone. Cette marge se répercute directement sur l&apos;orientation enregistrée.</li>
            <li>• La boussole des smartphones est très sensible aux champs électromagnétiques : la moindre interférence (appareils électroniques, structures métalliques…) peut fausser sa mesure.</li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-svv-gray">
            Pour un résultat fiable, vérifiez et, si besoin, ajustez manuellement le faisceau afin qu&apos;il corresponde à l&apos;axe réel de votre vue, face au séjour.
          </p>
          <button
            type="button"
            onClick={() => setInfoOrientationOuvert(false)}
            className="svv-btn svv-btn-primary mt-5"
          >
            Compris
          </button>
        </div>
      </div>
    )}
  </div>
)}

{etape === "infos" && (
  <div className="flex flex-1 flex-col animate-fadeIn">
    {/* HEADER ROUGE — relative z-10 : passe AU-DESSUS du footer (relative z-0), sinon le calque déco recouvre le titre */}
    <div className="relative z-10 -mx-6 -mt-6 mb-4 rounded-t-3xl bg-svv-red px-6 py-5">
      <h1 className="text-[1.45rem] font-extrabold leading-tight text-white">Renseigner votre étage</h1>
    </div>

    {/* ÉLÉMENT 1 — Étage du séjour (stepper) : seul visible au départ */}
    <div>
      <label className="mb-2 block text-base font-semibold text-svv-ink">Étage du séjour</label>
      <div className="flex items-center justify-center gap-4">
        <button type="button" aria-label="Diminuer"
          onClick={() => ajusterEtage(-1)}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-svv-line bg-svv-field text-2xl font-bold text-svv-ink">−</button>
        <span className="min-w-[72px] rounded-xl border border-svv-line bg-white px-4 py-3 text-center text-2xl font-extrabold text-svv-ink">
          {etage === "" ? "—" : etage}
        </span>
        <button type="button" aria-label="Augmenter"
          onClick={() => ajusterEtage(1)}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-svv-line bg-svv-field text-2xl font-bold text-svv-ink">+</button>
      </div>
    </div>

    {/* Hauteur sous plafond — calqué sur le stepper d'étage (pas 0,10 m, bornes 2,40–4,50) */}
    <div className="mt-7">
      <div className="mb-2 flex items-center gap-2">
        <label className="block text-base font-semibold text-svv-ink">Hauteur sous plafond</label>
        <button
          type="button"
          onClick={() => { setInfoHauteurOuvert(true); setInfoHauteurVu(true); }}
          aria-label="Pourquoi cette information ?"
          className={`shrink-0 ${infoHauteurVu ? "text-svv-ink" : "svvInfoPulse"}`}
        >
          <span className={`block leading-none ${bumpInfoHauteur && !infoHauteurVu ? "svvInfoBump" : ""}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.5h.01" />
            </svg>
          </span>
        </button>
      </div>
      <div className="flex items-center justify-center gap-4">
        <button type="button" aria-label="Diminuer la hauteur"
          onClick={() => ajusterHauteur(-0.1)}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-svv-line bg-svv-field text-2xl font-bold text-svv-ink">−</button>
        <span className="min-w-[96px] rounded-xl border border-svv-line bg-white px-4 py-3 text-center text-2xl font-extrabold text-svv-ink">
          {hauteurSousPlafondM.toFixed(2)} m
        </span>
        <button type="button" aria-label="Augmenter la hauteur"
          onClick={() => ajusterHauteur(0.1)}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-svv-line bg-svv-field text-2xl font-bold text-svv-ink">+</button>
      </div>
      <p className="mt-2 text-center text-sm text-svv-muted">{libelleHauteur(hauteurSousPlafondM)}</p>
    </div>

    {/* Dernier étage ? — toujours affiché (plus de révélation montrerQ2) */}
    <div className="mt-[18px]">
        <label className="mb-2 block text-base font-semibold text-svv-ink">Dernier étage ?</label>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setDernierEtage(true)}
            className={"flex items-center justify-center gap-2 rounded-xl py-3 text-base font-semibold " +
              (dernierEtage === true ? "bg-svv-red text-white" : "border border-svv-line bg-white text-svv-ink")}>
            {dernierEtage === true && (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>)}
            Oui
          </button>
          <button type="button" onClick={() => setDernierEtage(false)}
            className={"flex items-center justify-center gap-2 rounded-xl py-3 text-base font-semibold " +
              (dernierEtage === false ? "bg-svv-red text-white" : "border border-svv-line bg-white text-svv-ink")}>
            {dernierEtage === false && (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>)}
            Non
          </button>
        </div>
    </div>

    {/* SKYLINE + BOUTON : toujours affichés. Image nette (pas de fondu).
        mt-auto : absorbe l'espace libre → image + bouton collés EN BAS quel que soit le nombre de questions (pattern EcranEtapes). */}
    <div className="relative z-0 -mx-6 mt-auto w-[calc(100%+3rem)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/FOOTER%206.png"
        alt=""
        aria-hidden="true"
        className="block w-full max-w-none h-80 object-cover object-bottom"
        style={{
          opacity: 0.85,
          WebkitMaskImage: "linear-gradient(to top, transparent 0px, transparent 53px, black 73px)",
          maskImage: "linear-gradient(to top, transparent 0px, transparent 53px, black 73px)",
        }}
      />
    </div>

    {/* BOUTON — wrapper relative z-10 -mt-6 : chevauche le bas de l'image (-24 px), au-dessus (z-0),
        identique à l'écran "etapes". PAS d'animation showBtn : le bouton étage reste toujours visible. */}
    <div className="relative z-10 -mt-6">
      <button type="button" onClick={handleAnalyse} className="svv-btn svv-btn-primary">
        Lancer l&apos;analyse
      </button>
    </div>
    {analyseErreur && <p className="mt-3 text-sm font-medium text-svv-red">{analyseErreur}</p>}

    {infoHauteurOuvert && (
      <div
        onClick={() => setInfoHauteurOuvert(false)}
        className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/45 p-5"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl bg-white p-5 shadow-xl"
        >
          <h2 className="text-lg font-extrabold text-svv-ink">Hauteur sous plafond</h2>
          <p className="mt-4 font-semibold text-svv-ink">Pourquoi ?</p>
          <p className="mt-1 text-sm leading-relaxed text-svv-gray">
            Pour déterminer votre champ de vision réel avec le plus de précision et rendre l&apos;analyse la plus fiable.
          </p>
          <p className="mt-4 font-semibold text-svv-ink">Quelle hauteur ?</p>
          <p className="mt-1 text-sm leading-relaxed text-svv-gray">
            La hauteur intérieure de votre pièce, du sol au plafond. Indiquez la hauteur habituelle de votre immeuble, et non une éventuelle particularité de votre logement : un dernier étage, par exemple, peut avoir une hauteur différente du reste du bâtiment.
          </p>
          <p className="mt-4 font-semibold text-svv-ink">Comment la connaître ?</p>
          <p className="mt-1 text-sm leading-relaxed text-svv-gray">
            Elle dépend souvent du type d&apos;immeuble et de son époque de construction. Le tableau ci-dessous résume les tendances par période en France.
          </p>
          <table className="mt-3 w-full border-collapse text-sm text-svv-gray">
            <thead>
              <tr className="border-b border-svv-line text-left">
                <th className="py-1 pr-2 font-semibold text-svv-ink">Époque</th>
                <th className="py-1 font-semibold text-svv-ink">Hauteur sous plafond</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-svv-line"><td className="py-1 pr-2">Avant 1900 (haussmannien)</td><td className="py-1">3,00 – 3,60 m</td></tr>
              <tr className="border-b border-svv-line"><td className="py-1 pr-2">1900 – 1948</td><td className="py-1">2,80 – 3,20 m</td></tr>
              <tr className="border-b border-svv-line"><td className="py-1 pr-2">1949 – 1974</td><td className="py-1">2,50 – 2,70 m</td></tr>
              <tr className="border-b border-svv-line"><td className="py-1 pr-2">1975 – 1990</td><td className="py-1">2,45 – 2,60 m</td></tr>
              <tr className="border-b border-svv-line"><td className="py-1 pr-2">1991 – 2005</td><td className="py-1">2,40 – 2,55 m</td></tr>
              <tr><td className="py-1 pr-2">Après 2005</td><td className="py-1">2,40 – 2,50 m</td></tr>
            </tbody>
          </table>
          <button
            type="button"
            onClick={() => setInfoHauteurOuvert(false)}
            className="svv-btn svv-btn-primary mt-5"
          >
            Compris
          </button>
        </div>
      </div>
    )}
  </div>
)}

{etape === "resultat" && (
  <div className={"animate-fadeIn" + (analyseEnCours || resultatReussi ? " flex flex-1 flex-col" : "")}>
    {!analyseEnCours && !resultatReussi && (
      <p className="text-sm font-semibold text-svv-muted">Résultat de l&apos;analyse</p>
    )}

    {analyseEnCours ? (
      /* a) chargement — écran « Analyse en cours » (firmware #6) */
      <div className="flex flex-1 flex-col">
        {/* Logo (identique à l'accueil) */}
        <div className="mb-6 flex justify-center">
          <Image
            src="/images/logo-svv-lockup.png"
            alt="Sans Vis-à-Vis®"
            width={1840}
            height={413}
            priority
            style={{ width: "auto", height: "auto", maxWidth: "330px" }}
          />
        </div>

        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-svv-ink">
          Analyse de votre vue en cours…
        </h1>

        {/* Checklist animée (présentation seule) */}
        <ul className="mt-8 flex flex-1 flex-col justify-center gap-6">
          {ETAPES_ANALYSE.map((label, i) => {
            const fait = i < analyseEtape;
            const enCours = i === analyseEtape;
            return (
              <li key={label} className="flex items-center gap-3">
                {fait ? (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-svv-green-soft">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-svv-green"
                      aria-hidden="true"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                ) : enCours ? (
                  <span
                    className="h-9 w-9 shrink-0 animate-spin rounded-full border-[3px] border-svv-red border-t-transparent"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="h-9 w-9 shrink-0 rounded-full border-[3px] border-svv-line"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={
                    "text-lg " +
                    (fait || enCours ? "font-medium text-svv-ink" : "text-svv-muted")
                  }
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Barre de progression + mention, ancrées en bas */}
        <div className="mt-auto pt-8">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-svv-line">
            <div
              className="h-full rounded-full bg-svv-green transition-all duration-500"
              style={{
                width: `${Math.min(95, Math.round(((analyseEtape + 0.5) / ETAPES_ANALYSE.length) * 100))}%`,
              }}
            />
          </div>
          <p className="mt-3 text-center text-sm text-svv-muted">
            Cela peut prendre quelques secondes.
          </p>
        </div>
      </div>
    ) : analyseErreur ? (
      /* b) erreur */
      <div className="mt-4 rounded-xl border border-svv-red/30 bg-svv-red/5 p-3 text-sm font-medium text-svv-red">
        <p>{analyseErreur}</p>
        <button
          type="button"
          onClick={handleAnalyse}
          className="svv-btn svv-btn-primary mt-3"
        >
          Réessayer
        </button>
      </div>
    ) : analyse &&
      (!analyse.resultat ||
        analyse.resultat.verdict.verdict === "INDETERMINE") ? (
      /* c) indéterminé — titre/message/bouton selon la CAUSE (front-only, ordre B→A→C→D) */
      (() => {
        const v = analyse.validation;
        const r = analyse.resultat;
        let titre: string;
        let message: string;
        let bouton: string;
        if (r != null && r.verdict.verdict === "INDETERMINE") {
          // (B) Zone non couverte par les données de relief (trou de couverture LiDAR).
          titre = "Zone non couverte par nos données";
          message =
            "Cette zone n'est pas encore couverte par les données de relief nécessaires à l'analyse. Nous ne pouvons donc pas certifier la vue depuis ce point. Notre couverture s'étend régulièrement.";
          bouton = "Essayer un autre point";
        } else if (r == null && v.valide === false) {
          // (A) Point hors bâtiment / origine invalide.
          titre = "Point en dehors d'un bâtiment";
          message =
            "Le repère doit être posé à l'intérieur de votre bâtiment, à l'emplacement de votre fenêtre. Là, il est tombé sur une rue ou un espace extérieur.";
          bouton = "Repositionner le point";
        } else if (r == null && v.valide === true && v.altitudeTerrainOrigineM == null) {
          // (C) Altitude du sol (MNT) indisponible à l'origine.
          titre = "Altitude du sol indisponible";
          message =
            "Nous n'avons pas l'altitude du terrain exactement à cet emplacement. Déplacez légèrement le repère sur votre bâtiment et réessayez.";
          bouton = "Ajuster le point";
        } else {
          // (D) Fallback (autre indétermination).
          titre = "Analyse indéterminée";
          message = "L'analyse n'a pas pu aboutir pour ce point. Réessayez ou déplacez légèrement le repère.";
          bouton = "Modifier le point";
        }
        return (
          <div className="mt-4 rounded-xl border border-svv-line bg-svv-field p-4">
            <p className="text-lg font-bold text-svv-ink">{titre}</p>
            <p className="mt-1 text-sm text-svv-muted">{message}</p>
            <button
              type="button"
              onClick={() => { setCarteCentrePret(true); setEtape("localisation"); }}
              className="svv-btn svv-btn-outline mt-3"
            >
              {bouton}
            </button>
          </div>
        );
      })()
    ) : analyse && analyse.resultat ? (
      /* d) vrai résultat — écrans 7A (certifié) / 7B (vis-à-vis) */
      <EcranResultat
        resultat={analyse.resultat}
        photo={photo}
        lat={origine.valide?.lat ?? position.latitude}
        lon={origine.valide?.lon ?? position.longitude}
        azimutDeg={azimutAjuste}
        etatPhoto={etatPhoto}
        onObtenirCertificat={() => setEtape("certificat")}
        onRecommencer={() => setEtape("accueil")}
        onRefaireTest={() => {
          reinitialiserCapteurs();             // repart d'un état niveau propre (évite le déclencheur grisé)
          setPhoto(null);
          setCapturedOrientation(null);
          origine.reset();                     // repasse en « non confirmé » → le bouton « Valider » redevient actif
          conserverPositionRef.current = true; // après la nouvelle photo, on garde le dernier point (pas de GPS)
          setEtape("photo");
          startCamera();
        }}
      />
    ) : null}
  </div>
)}

{etape === "certificat" && (
  <EcranCertificat
    onRetour={() => setEtape("resultat")}
    adresseBien={address}
    lat={origine.valide?.lat ?? position.latitude}
    lon={origine.valide?.lon ?? position.longitude}
    azimut={azimutAjuste}
    hauteurSousPlafond={hauteurSousPlafondM}
    etageInitial={Number(etage) || 0}
    dernierEtage={dernierEtage ?? false}
  />
)}
        </section>
      </div>
    </main>
  );
}