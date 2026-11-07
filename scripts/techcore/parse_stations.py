import json, re, sys, uuid
sys.path.insert(0, sys.argv[2])
from parse_common import *
L = [l.strip() for l in open(sys.argv[1], encoding='utf-8').read().split('\n')]
STATIONS = {
 'DRONE CONSOLE': ['level', 'upgrades', 'drones'],
 'GENERATOR': ['level', 'upgrades', 'fort'],
 'GUNNERY': ['level', 'upgrades', 'damageDice', 'tracking'],
 'MAGIC CONDUIT': ['level', 'upgrades', 'will'],
 'PILOT’S CONSOLE': ['level', 'upgrades', 'ac', 'ref'],
 'SCANNERS': ['level', 'upgrades', 'will', 'sensors'],
}
SKIP_HEADS = {'NEW TERMS', 'Tech CORE', 'READING BATTLE', 'STATION ENTRIES', 'USING CLASS FEATURES', 'STARSHIP SPELL REPOSITORY', 'BATTLE STATIONS'}
CAPTIONS = {title(k) for k in STATIONS} | {'Pilot’s Console', 'Captain\'s Seat', 'Captain’s Seat'}
out = {}; spells = []
generic = {'actions': []}
cur = None; grade = None; i = 0
def val(tok):
    tok = tok.replace('–', '-').replace('—', '-')
    if tok in ('-',): return 0
    m = re.search(r'([+-]?\d+)', tok)
    return int(m.group(1)) if m else None
while i < len(L):
    t = L[i]
    if t.startswith('=== PAGE') or not t: i += 1; continue
    if t in STATIONS and (i + 1 < len(L)):
        cur = {'id': str(uuid.uuid4()), 'origin': 'user', 'kind': 'battleStation', 'game': 'sf2e', 'name': title(t).replace("Pilot’S", "Pilot’s"),
               'sortName': '', 'level': 0, 'rarity': 'common', 'traits': [], 'description': '', 'sourceRefs': [],
               'advancement': [], 'actions': [], 'publication': {'title': 'Tech Core (local)', 'remaster': True}}
        cur['sortName'] = cur['name'].lower(); out[t] = cur; grade = None
        desc = []; i += 1
        while i < len(L) and not (is_caps(L[i]) and len(L[i]) > 5):
            if L[i] and not L[i].startswith('==='): desc.append(L[i])
            i += 1
        paras = []
        for p in join_lines(desc):
            paras += [x.strip() for x in re.split(r'(?<=[.!?]) (?=(?:Helmed )?[A-Z][\w’ ]+ Benefits: )', p) if x.strip()]
        for p in paras:
            m = re.match(r'^(Helmed [^:]+ Benefits|[^:]+ Benefits): (.*)$', p)
            if m and m.group(1).startswith('Helmed'): cur['helmedBenefits'] = (cur.get('helmedBenefits', '') + ' ' + m.group(2)).strip()
            elif m: cur['benefits'] = (cur.get('benefits', '') + ' ' + m.group(2)).strip()
            else: cur['description'] = (cur['description'] + '\n\n' + p).strip()
        continue
    m = re.match(r'^(.+) ADVANCEMENT$', t)
    if m and m.group(1) in STATIONS:
        cols = STATIONS[m.group(1)]; st = out[m.group(1)]
        toks = []; i += 1
        while i < len(L) and len(st['advancement']) < 7:
            tok = L[i]; i += 1
            if not tok or tok.startswith('==='): continue
            if tok.lower() in GRADES:
                st['advancement'].append({'grade': tok.lower(), '_v': []})
            elif st['advancement'] and len(st['advancement'][-1]['_v']) < len(cols):
                for part in re.findall(r'Tracking [+-]\d+|[+-]?\d+(?: zones?)?|[–—-](?=\s|$)', tok):
                    st['advancement'][-1]['_v'].append(part)
            # grade rows complete when values filled; last row needs its values before stopping
            if len(st['advancement']) == 7 and len(st['advancement'][-1]['_v']) < len(cols):
                continue
        while i < len(L) and len(st['advancement'][-1]['_v']) < len(cols):
            for part in re.findall(r'Tracking [+-]\d+|[+-]?\d+(?: zones?)?|[–—-](?=\s|$)', L[i]): st['advancement'][-1]['_v'].append(part)
            i += 1
        for row in st['advancement']:
            v = row.pop('_v'); r = {}
            for c, x in zip(cols, v):
                n = val(x)
                if c in ('ac', 'ref', 'fort', 'will'): r.setdefault('helmed', {})[c] = n or 0
                else: r[c] = n or 0
            row.update({'level': r.pop('level', 1), 'upgrades': r.pop('upgrades', 0), **r})
            if 'tracking' in row and not row['tracking']: del row['tracking']
        continue
    if t == 'OTHER BATTLE STATION' and i + 1 < len(L) and L[i + 1] == 'ACTIONS':
        cur = generic; grade = None; i += 2; continue
    m = re.match(r'^(COMMERCIAL|TACTICAL|ADVANCED|SUPERIOR|ELITE|ULTIMATE|PARAGON) (.+)$', t)
    if m and m.group(2) in STATIONS:
        cur = out[m.group(2)]; grade = m.group(1).lower(); i += 1; continue
    am = ACTION_HEAD.match(t)
    if am and cur is not None:
        j = i + 1
        while j < len(L) and not L[j]: j += 1
        spell_tag = None
        sm = re.match(r'^(SPELL|CANTRIP|FOCUS) (\d+)$', L[j]) if j < len(L) else None
        if sm:
            spell_tag = (sm.group(1), int(sm.group(2))); j += 1
            while j < len(L) and not L[j]: j += 1
        trait_line = L[j] if j < len(L) else ''
        if trait_line and is_caps(trait_line) and not ACTION_HEAD.match(trait_line): j += 1
        else: trait_line = ''
        body = []
        while j < len(L):
            x = L[j]
            if x.startswith('==='): j += 1; continue
            if ACTION_HEAD.match(x) or re.match(r'^(COMMERCIAL|TACTICAL|ADVANCED|SUPERIOR|ELITE|ULTIMATE|PARAGON) ', x) or x in STATIONS or re.match(r'.+ ADVANCEMENT$', x) or x in SKIP_HEADS or (is_caps(x) and len(x) > 6): break
            # image captions ("Magic Conduit" under a picture) aren't part of the text
            if x not in CAPTIONS: body.append(x)
            j += 1
        a, mm = action_from(t, trait_line, body, grade)
        if mm.group(4): spell_tag = (mm.group(4), int(mm.group(5)))
        if spell_tag:   # a starship spell
            spells.append({'id': str(uuid.uuid4()), 'origin': 'user', 'kind': 'spell', 'game': 'sf2e', 'name': a['name'], 'sortName': a['name'].lower(),
                           'level': spell_tag[1], 'rarity': 'common', 'traits': a['traits'] + (['cantrip'] if spell_tag[0] == 'CANTRIP' else []),
                           'description': a['text'], 'sourceRefs': [], 'spellType': 'spell', 'traditions': ['arcane', 'divine', 'occult', 'primal'],
                           'cast': a['cost'], 'range': 'sensor range', 'publication': {'title': 'Tech Core (local)', 'remaster': True}})
        else:
            cur['actions'].append(a)
        i = j; continue
    if t in SKIP_HEADS or (is_caps(t) and t not in STATIONS):
        # a sidebar or heading: skip its paragraph(s) until the next known structure
        i += 1
        while i < len(L) and not (ACTION_HEAD.match(L[i]) or L[i] in STATIONS or L[i] == 'OTHER BATTLE STATION' or re.match(r'^(COMMERCIAL|TACTICAL|ADVANCED|SUPERIOR|ELITE|ULTIMATE|PARAGON) ', L[i]) or re.match(r'.+ ADVANCEMENT$', L[i])):
            i += 1
        continue
    i += 1
actions = []
for a in generic['actions']:
    a.pop('grade', None)
    actions.append({'id': str(uuid.uuid4()), 'origin': 'user', 'kind': 'action', 'game': 'sf2e', 'name': a['name'], 'sortName': a['name'].lower(),
                    'level': 0, 'rarity': 'common', 'traits': sorted(set(a['traits'] + ['station'])), 'description': a['text'], 'sourceRefs': [],
                    'cost': a['cost'], 'category': 'station', **({'frequency': a['frequency']} if a.get('frequency') else {}),
                    'publication': {'title': 'Tech Core (local)', 'remaster': True}})
print(json.dumps({'stations': list(out.values()), 'spells': spells, 'actions': actions}, ensure_ascii=False, indent=1))
