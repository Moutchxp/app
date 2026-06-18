#!/usr/bin/env python3
"""
Mode A — sanity-check HAUTEUR OPÉRATIONNELLE (LECTURE SEULE, non committé).

Pour les 3 obstacles de l'axe (azimut 90°), calcule la hauteur opérationnelle =
MAX du profil nettoyé sur l'échantillon confiné (emprise ∩ couloir 2 m, érodé de
-1 m pour écarter la façade/parapet ; repli polygone plein si trop peu de pixels).

Nettoyage anti-pic : on retire les pixels > P95 + 1,0 m s'ils sont une faible
fraction (< 10 %) avant de prendre le max.

But : confirmer que le max nettoyé donne un toit cohérent malgré la façade (les
pixels bas n'affectent pas le max). Extraction psql, analyse numpy. Aucun commit.
"""
import subprocess
import sys
import numpy as np

DB = "sansvisavis"
LON, LAT = 2.269431435588249, 48.90693182287072
AZ = 90
REF = 51.95          # altitude fenêtre = 41.6 + hauteurVision(3)
BUFFER_FACADE = -1.0
PIC_OVER_P95 = 1.0
PIC_FRACTION_MAX = 0.10
T_PENTE_DEG, T_RMS_PLAT, T_RMS_PENTE = 8.0, 0.6, 0.8

OBSTACLES = [
    ("BATIMENT0000000240319902", "obstacle ~70 m (verdict)"),
    ("BATIMENT0000000241400048", "obstacle ~93 m"),
    ("BATIMENT0000000241400017", "obstacle ~155 m"),
]


def psql(sql):
    out = subprocess.run(["psql", "-d", DB, "-At", "-F", ",", "-c", sql],
                         capture_output=True, text=True)
    if out.returncode != 0:
        sys.stderr.write(out.stderr)
        raise SystemExit(f"psql échec (code {out.returncode})")
    return [l.split(",") for l in out.stdout.splitlines() if l.strip()]


def confined(cleabs, erode):
    """Pixels MNS dans (emprise ∩ couloir), érodés de -1 m si erode=True."""
    zone_geom = "ST_Buffer(b.g,-1.0)" if erode else "b.g"
    sql = f"""
    WITH b AS (SELECT ST_Force2D(geom) AS g FROM bdtopo_batiment WHERE cleabs='{cleabs}'),
    o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint({LON},{LAT}),4326),2154) AS g),
    axe AS (SELECT ST_MakeLine(o.g, ST_Translate(o.g,200*sin(radians({AZ})),200*cos(radians({AZ})))) AS ligne FROM o),
    couloir AS (SELECT ST_Buffer(ligne,1.0) AS corr FROM axe),
    zone AS (SELECT ST_Intersection({zone_geom}, couloir.corr) AS z FROM b, couloir),
    clipped AS (SELECT ST_Clip(r.rast, zone.z, true) AS rast
                FROM mns_lidar_brut r, zone WHERE ST_Intersects(r.rast, zone.z))
    SELECT pc.val FROM clipped, LATERAL ST_PixelAsCentroids(clipped.rast) AS pc
    WHERE pc.val IS NOT NULL AND pc.val <> -9999;
    """
    rows = psql(sql)
    return np.array([float(r[0]) for r in rows]) if rows else np.empty(0)


def confined_xyz(cleabs, erode):
    zone_geom = "ST_Buffer(b.g,-1.0)" if erode else "b.g"
    sql = f"""
    WITH b AS (SELECT ST_Force2D(geom) AS g FROM bdtopo_batiment WHERE cleabs='{cleabs}'),
    o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint({LON},{LAT}),4326),2154) AS g),
    axe AS (SELECT ST_MakeLine(o.g, ST_Translate(o.g,200*sin(radians({AZ})),200*cos(radians({AZ})))) AS ligne FROM o),
    couloir AS (SELECT ST_Buffer(ligne,1.0) AS corr FROM axe),
    zone AS (SELECT ST_Intersection({zone_geom}, couloir.corr) AS z FROM b, couloir),
    clipped AS (SELECT ST_Clip(r.rast, zone.z, true) AS rast
                FROM mns_lidar_brut r, zone WHERE ST_Intersects(r.rast, zone.z))
    SELECT ST_X(pc.geom), ST_Y(pc.geom), pc.val FROM clipped, LATERAL ST_PixelAsCentroids(clipped.rast) AS pc
    WHERE pc.val IS NOT NULL AND pc.val <> -9999;
    """
    rows = psql(sql)
    return np.array([[float(c) for c in r] for r in rows]) if rows else np.empty((0, 3))


def bdtopo_sommet(cleabs):
    r = psql(f"""SELECT COALESCE(altitude_maximale_toit, altitude_minimale_sol+hauteur,
                 altitude_minimale_sol+nombre_d_etages*2.90) FROM bdtopo_batiment WHERE cleabs='{cleabs}';""")
    return None if not r or r[0][0] == "" else float(r[0][0])


def anti_pic(z):
    """Retire les pics ponctuels (> P95+1 m, < 10 % des pixels) avant le max."""
    p95 = float(np.percentile(z, 95))
    high = z > p95 + PIC_OVER_P95
    frac = float(high.mean())
    z_clean = z[~high] if 0 < frac < PIC_FRACTION_MAX else z
    return p95, float(z_clean.max()), int(high.sum()), frac


def diag_class(xyz):
    x, y, z = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    A = np.column_stack([x - x.mean(), y - y.mean(), np.ones_like(x)])
    coef, *_ = np.linalg.lstsq(A, z, rcond=None)
    rms = float(np.sqrt(np.mean((z - A @ coef) ** 2)))
    slope = float(np.degrees(np.arctan(np.hypot(coef[0], coef[1]))))
    if rms > T_RMS_PENTE:
        cls = "non planaire (bord/décroché)"
    elif slope >= T_PENTE_DEG:
        cls = "pente régulière" if rms <= T_RMS_PENTE else "non planaire"
    else:
        cls = "plat" if rms <= T_RMS_PLAT else "incertain"
    return slope, rms, cls


def main():
    print(f"Hauteur de référence (fenêtre) = {REF} m NGF — un obstacle bloque si max nettoyé ≥ {REF}\n")
    hdr = f"{'cleabs':<26} {'npx':>4} {'érod':>5} {'P95':>6} {'maxNet':>7} {'cascade':>8} {'pente°':>7} {'RMS':>5} {'classe':<26} {'≥REF?':>6}"
    print(hdr)
    print("-" * len(hdr))
    for cleabs, role in OBSTACLES:
        xyz = confined_xyz(cleabs, erode=True)
        erode = "oui"
        if xyz.shape[0] < 20:                      # repli polygone plein
            xyz = confined_xyz(cleabs, erode=False)
            erode = "non"
        z = xyz[:, 2]
        p95, max_net, npic, frac = anti_pic(z)
        casc = bdtopo_sommet(cleabs)
        slope, rms, cls = diag_class(xyz)
        bloque = "OUI" if max_net >= REF else "non"
        casc_s = f"{casc:.2f}" if casc is not None else "NONE"
        print(f"{cleabs:<26} {xyz.shape[0]:>4} {erode:>5} {p95:>6.2f} {max_net:>7.2f} "
              f"{casc_s:>8} {slope:>7.2f} {rms:>5.2f} {cls:<26} {bloque:>6}")
        print(f"    └─ {role} | min échantillon={z.min():.2f} (bord) ; "
              f"pics retirés={npic} ({100*frac:.1f}%) ; max nettoyé retenu={max_net:.2f} m")
    print("\nNote : le MAX nettoyé n'est pas affecté par les pixels bas de façade "
          "(min de bord bien sous le toit) → hauteur de toit cohérente et conservatrice.")


if __name__ == "__main__":
    main()
