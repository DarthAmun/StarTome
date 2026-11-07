"""Builds the local Tech Core homebrew pack for StarTome from the parsed pieces. Stable ids: uuid5(name+kind)."""
import json, re, sys, uuid
T = sys.argv[1]; sys.path.insert(0, T + "/tools")
from parse_common import *
NS = uuid.UUID('6f1c2b6a-3f0e-4c1e-9a9e-7a1c0de57a2b')
PUB = {'title': 'Tech Core (local)', 'remaster': True}
TS = '2026-11-07T12:00:00.000Z'
def sid(kind, name): return str(uuid.uuid5(NS, f'{kind}:{name.lower()}'))
def fin(e):
    e['id'] = sid(e['kind'], e['name']); e['publication'] = PUB; e['createdAt'] = TS; e['updatedAt'] = TS; e['origin'] = 'user'; e['game'] = 'sf2e'
    e['sortName'] = e['name'].lower(); e.setdefault('sourceRefs', []); e.setdefault('description', ''); e.setdefault('rarity', 'common')
    return e
rules = []
# ── frames (layout text) ──
lay = open(T + '/tc.txt', encoding='utf-8').read()
FRAMES = {
 'Bulwark': {'sensorRange': 5, 'defaultStations': [{'station': "pilot’s console", 'upgrades': ['ramming prow']}, {'station': 'generator', 'upgrades': []}]},
 'Explorer': {'sensorRange': 6, 'defaultStations': [{'station': "pilot’s console", 'upgrades': []}, {'station': 'generator', 'upgrades': ['pulse shield']}]},
 'Skirmisher': {'sensorRange': 4, 'defaultStations': [{'station': "pilot’s console", 'upgrades': ['rotational thrusters']}, {'station': 'generator', 'upgrades': []}]},
}
for name, extra in FRAMES.items():
    k = lay.index(f'{name.upper()} STATISTICS BY LEVEL')
    rows = []
    for line in lay[k:k + 6000].split('\n')[1:]:
        m = re.match(r'^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\+(\d+)\s+\+(\d+)\s+\+(\d+)\s+(\d+) zones', line)
        if m:
            v = list(map(int, m.groups()))
            rows.append({'level': v[0], 'hp': v[1], 'sp': v[2], 'ac': v[3], 'fort': v[4], 'ref': v[5], 'will': v[6], 'speed': v[7]})
        if len(rows) == 20: break
    assert len(rows) == 20, (name, len(rows))
    rules.append(fin({'kind': 'starshipFrame', 'name': name, 'level': 0, 'traits': ['tech'], 'size': 'med', 'expansionBays': 4, 'customSlots': 4, 'stats': rows, **extra}))
# ── stations, starship spells, generic station actions ──
st = json.load(open(T + '/stations.json'))
for s in st['stations']: rules.append(fin(s))
for s in st['spells']: rules.append(fin(s))
for a in st['actions']: rules.append(fin(a))
# ── upgrades ──
for u in json.load(open(T + '/upgrades.json')):
    if u['description'].startswith('Usage replace default escape pods'):
        u['station'] = 'escape pods'; u['description'] = u['description'][len('Usage replace default escape pods'):].strip()
    u['description'] = re.sub(r'^on a starship with a ramming prow \(page \d+\)\s*', 'Requires a ramming prow. ', u['description'])
    rules.append(fin(u))
# ── weapons (layout table) ──
w = open(T + '/cols/weapons_layout.txt', encoding='utf-8').read()
cat = None
for line in w.split('\n'):
    if 'SIMPLE RANGED STARSHIP WEAPONS' in line: cat = 'simple'; continue
    if 'MARTIAL RANGED STARSHIP WEAPONS' in line: cat = 'martial'; continue
    if 'ADVANCED RANGED STARSHIP WEAPONS' in line: cat = 'advanced'; continue
    m = re.match(r'^\s+([A-Z][a-z][\w ’\-]*?)\s{2,}(\d+)\s+(\d+)(d\d+) ([A-Z][a-z]?)\s+(\d+) zones\s+(\d+)\s+(\w+)\s+(.*)$', line)
    if not (cat and m): continue
    DT = {'A': 'acid', 'P': 'piercing', 'F': 'fire', 'E': 'electricity', 'B': 'bludgeoning', 'S': 'slashing', 'C': 'cold', 'So': 'sonic', 'M': 'mental', 'Fo': 'force'}
    traits = []
    for t in re.split(r',\s*(?![^()]*\))', m.group(9).strip()):
        t = t.strip().lower()
        a = re.match(r'area \((cone|line|burst ?(\d+) zones?)\)', t)
        if a: traits.append('area-' + ('burst-' + a.group(2) if a.group(2) else a.group(1).split()[0])); continue
        traits.append(re.sub(r'\s+', '-', t.replace('(', '').replace(')', '')))
    wname = title(m.group(1)); wname = 'Hypervelocity Macron Accelerator' if wname == 'Hypervelocity Macron' else wname
    rules.append(fin({'kind': 'stationUpgrade', 'name': wname, 'level': int(m.group(2)), 'traits': traits, 'station': 'gunnery', 'actions': [],
                      'weapon': {'category': cat, 'damage': {'dice': int(m.group(3)), 'die': m.group(4), 'type': DT.get(m.group(5), m.group(5).lower())},
                                 'range': int(m.group(6)), 'upgrades': int(m.group(7)), 'group': m.group(8).lower()}}))
# ── drones (drone console upgrades with station actions) ──
D = [l.strip() for l in open(T + '/cols/drones.txt', encoding='utf-8').read().split('\n')]
D = [l for l in D if not l.startswith('=== PAGE')]
i = 0
while i < len(D):
    if re.match(r'^[A-Z ]+ DRONE$', D[i]) and D[i] != 'STARSHIP DRONES':
        name = title(D[i]); i += 1; desc = []; acts = []
        while i < len(D) and not ACTION_HEAD.match(D[i].replace(' ][', ' [')):
            if D[i]: desc.append(D[i])
            i += 1
        while i < len(D) and not (re.match(r'^[A-Z ]+ DRONE$', D[i]) or (is_caps(D[i]) and len(D[i]) > 6 and not ACTION_HEAD.match(D[i].replace(' ][', ' [')))):
            h = D[i].replace(' ][', ' [')
            if ACTION_HEAD.match(h):
                j = i + 1
                while j < len(D) and not D[j]: j += 1
                tl = D[j] if j < len(D) and is_caps(D[j]) and not ACTION_HEAD.match(D[j]) else ''
                if tl: j += 1
                body = []
                while j < len(D) and not ACTION_HEAD.match(D[j].replace(' ][', ' [')) and not (is_caps(D[j]) and len(D[j]) > 6):
                    body.append(D[j]); j += 1
                a, _ = action_from(h, tl, body)
                acts.append(a); i = j
            else: i += 1
        rules.append(fin({'kind': 'stationUpgrade', 'name': name, 'level': 0, 'traits': ['drone', 'starship', 'tech'], 'station': 'drone console',
                          'description': ' '.join(join_lines(desc)), 'actions': acts}))
    else: i += 1
# ── expansion bays ──
E = ' '.join(l.strip() for l in open(T + '/cols/all.txt', encoding='utf-8').read().split('=== PAGE 195', 1)[1].split('=== PAGE 197')[0].split('\n') if l.strip() and not l.startswith('==='))
E = re.sub(r'(\w)- (\w)', r'\1\2', E)
BAYS = ['DATA CENTER', 'FABRICATION LAB', 'HOLO DEN', 'MEDICAL BAY', 'PASSENGER QUARTERS', 'SCIENCE LAB', 'UNIVERSAL EXPANSION BAYS']
def between(a, b):
    s = E.index(a) + len(a); e = E.index(b, s) if b else len(E)
    return E[s:e].strip()
for k, name in enumerate(BAYS[:-1]):
    txt = between(name, BAYS[k + 1])
    txt = re.sub(r'\s(Lounge|Medbay|Mess Bay|Tech CORE|\d{3})\s', ' ', ' ' + txt + ' ').strip()
    opts = []
    if name == 'PASSENGER QUARTERS':
        main, rest = txt.split(' Basic:', 1)
        for o in re.split(r' (?=(?:Prison|Luxury): )', 'Basic:' + rest):
            n, t = o.split(':', 1); opts.append({'name': n.strip(), 'text': t.strip()})
        txt = main
    rules.append(fin({'kind': 'expansionBay', 'name': title(name), 'level': 0, 'traits': [], 'takesSlot': True, 'description': txt, **({'options': opts} if opts else {})}))
# universal bays: crew quarters (options), lounge, mess bay
cq = between('Crew Quarters This expansion bay', None)
cq_text, rest = ('This expansion bay' + cq).split(' Bunks:', 1)
opts = []
for o in re.split(r' (?=(?:Budget|Comfortable|Extravagant): )', 'Bunks:' + rest):
    n, t = o.split(':', 1); opts.append({'name': n.strip(), 'text': re.sub(r'\s(Mess Bay|Tech CORE)\s', ' ', ' ' + t.strip() + ' ').strip()})
cq_text = re.sub(r'\s(Mess Bay|Tech CORE)\s', ' ', ' ' + cq_text + ' ').strip()
rules.append(fin({'kind': 'expansionBay', 'name': 'Crew Quarters', 'level': 0, 'traits': [], 'takesSlot': False, 'description': cq_text, 'options': opts}))
COLS = open(T + '/cols/all.txt', encoding='utf-8').read()
for name, start in (('Lounge', 'A starship’s lounge can be'), ('Mess Bay', 'Depending on the size and purpose of a starship, a mess bay')):
    k = COLS.find(start)
    if k < 0: continue
    # the paragraph(s) up to the next heading or blank line, in column order
    para = []
    for line in COLS[k:].split('\n'):
        t = line.strip()
        if not t or t.startswith('==='): break
        para.append(t)
    text = re.sub(r'(\w)- (\w)', r'\1\2', ' '.join(para))
    rules.append(fin({'kind': 'expansionBay', 'name': name, 'level': 0, 'traits': [], 'takesSlot': False, 'description': text}))
# ── starships ──
for s in json.load(open(T + '/archive.json')): rules.append(fin(s))
# dedupe by id (last wins)
by = {}
for r in rules: by[r['id']] = r
print(json.dumps({'version': 2, 'app': 'startome', 'type': 'homebrew', 'exportedAt': TS, 'rules': list(by.values())}, ensure_ascii=False, indent=1))
