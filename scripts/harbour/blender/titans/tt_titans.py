"""Top-10 Major Titans registry, per-class budgets, and build entry point (with E15 _AO bake)."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from hb_lib import tri_count, descendants  # noqa: E402
from tt_bake import bake_titan_ao  # noqa: E402
from tt_lod import build_titan_lod  # noqa: E402
from tt_majors_a import build_usdt, build_usdc, build_usde, build_dai, build_usds  # noqa: E402
from tt_majors_b import build_rlusd, build_usd1, build_xaut, build_usdg, build_pyusd  # noqa: E402

BUDGET_BY_CLASS = {'flagship': 3600, 'large': 3000}
LOD_BUDGET_BY_CLASS = {'flagship': 240, 'large': 220}

# Legacy module-level aliases kept for any external import compatibility
BUDGET = 3600
LOD_BUDGET = 240

# Hard berth clearance caps (PLAN.md §3)
MAX_DIMS_BY_CLASS = {
    'flagship': (32.5, 7.80),
    'large': (22.0, 6.20),
}

# Complete Top-10 Major Titans Roster (D-4 fixed roster: #10 = pyusd-paypal)
# (id, coin_id, class, builder, summary)
TITANS = [
    ('titan_usdt', 'usdt-tether', 'flagship', build_usdt,
     'Sovereign Syracusia grain colossus: 3 masts + artemon, peristyle Temple of Aphrodite aft, twin gilt crane-necks, fore turret'),
    ('titan_usdc', 'usdc-circle', 'flagship', build_usdc,
     'Imperial Deceres astrolabe flagship: 2 masts + artemon, circular 8-column gilded Tholos with 3D armillary rings, Archimedes catapult'),
    ('titan_usde', 'usde-ethena', 'large', build_usde,
     'Obsidian & silver Hellenistic pentere: hybrid split rig + sprit mizzen, razor silver beakhead prow, hanging pine/cypress deck-garden, balance-scales gantry'),
    ('titan_dai', 'dai-makerdao', 'large', build_dai,
     'Golden-ochre Doric corbita citadel: monumental broad-yard central mast + artemon, stepped crenellated stone fortress, bronze collateral vault, gilt solar-disc prow'),
    ('titan_usds', 'usds-sky', 'large', build_usds,
     'Ptolemaic Thalamegos sky-palace: soaring forward mast, twin white-and-gilt swan prows + sun-arch, 2-tier Ionic pavilion with sunset/cerulean velarium, octagonal brazier tower'),
    ('titan_rlusd', 'rlusd-ripple', 'large', build_rlusd,
     'Cobalt & seafoam trireme express packet: swift courier square sail + 48 live animated oars, bronze trident ram, oak outrigger with 20 hoplite shields, triple-plumed wave aphlaston'),
    ('titan_usd1', 'usd1-world-liberty-financial', 'large', build_usd1,
     'Gilded eagle-prow imperial liburna: 2 ceremonial square masts (twin sipara) + artemon, burnished-gilt Imperial Eagle figurehead, marble temple-loggia with crimson tympanum, velvet baldaquin'),
    ('titan_xaut', 'xaut-tether', 'large', build_xaut,
     'Sun-forged golden bullion cataphract galley: battle-mast + 40 live animated gilded oars, open gilded vault with stacked solid-gold ingot pyramid, 5-plume golden aphlaston'),
    ('titan_usdg', 'usdg-paxos', 'large', build_usdg,
     'Twin-castled global consortium naus: 2 equal twin square masts + artemon, symmetric forecastle & sterncastle joined by arched gangway over amphorae/bales, brass armillary globe'),
    ('titan_pyusd', 'pyusd-paypal', 'large', build_pyusd,
     'Sapphire & silver commerce lembos packet: hybrid split rig + sprit mizzen, scalloped silver clipper bow + twin bronze lantern davits, twin arched sapphire canopies, counting-house stern'),
]

TITAN_MAP = {t[0]: t for t in TITANS}


def build(vid, coll=None, bake_ao=True):
    """Build one Titan flagship, finish nodes, and bake E15 BVHTree `_AO` onto static hull/deck/mast."""
    _, _coin, _cls, fn, _desc = TITAN_MAP[vid]
    R = fn(coll)
    root, objs = R.finish(coll)
    if bake_ao:
        bake_titan_ao(root, samples=48, distance=3.5, offset=0.02, min_ao=0.35)
    return root, objs, R


__all__ = [
    'TITANS', 'TITAN_MAP', 'BUDGET', 'LOD_BUDGET', 'BUDGET_BY_CLASS', 'LOD_BUDGET_BY_CLASS',
    'MAX_DIMS_BY_CLASS', 'build', 'build_titan_lod', 'tri_count', 'descendants',
]
