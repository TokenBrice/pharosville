"""Harbour civic kit - registry of builders: kind -> fn() -> (root empty, info dict), and plot footprints (w x d metres)."""
from functools import partial
import cv_works, cv_yard, cv_civic, cv_office_works

OFFICE_CHAINS = cv_civic.OFFICE_CHAINS
FOOT = {'mint': (64, 44), 'burn': (30, 30), 'shipyard': (150, 80), 'customs': (42, 30), 'registry': (26, 20), 'chartroom': (18, 14),
        'stormstation': (14, 14), 'harbourmaster': (20, 16), 'keeperslog': (12, 10), 'hull-stages': (60, 14), 'office-works': (10, 10)}
BUILDERS = {'mint': cv_works.build_mint, 'burn': cv_works.build_burn, 'shipyard': cv_yard.build_shipyard,
            'customs': cv_civic.build_customs, 'registry': cv_civic.build_registry, 'chartroom': cv_civic.build_chartroom,
            'stormstation': cv_civic.build_stormstation, 'harbourmaster': cv_civic.build_harbourmaster,
            'keeperslog': cv_civic.build_keeperslog}
for _c in OFFICE_CHAINS:
    FOOT[f'harbour-office:{_c}'] = (20, 16)
    BUILDERS[f'harbour-office:{_c}'] = partial(cv_civic.build_office, _c)
BUILDERS['hull-stages'] = cv_yard.build_hull_stages
BUILDERS['office-works'] = cv_office_works.build_office_works
