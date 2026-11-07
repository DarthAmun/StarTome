import json, re, sys, uuid
text = open(sys.argv[1], encoding='utf-8').read()
L = [l.rstrip() for l in text.split('\n')]
SIZES = {'TINY': 'tiny', 'SMALL': 'sm', 'MEDIUM': 'med', 'LARGE': 'lg', 'HUGE': 'huge', 'GARGANTUAN': 'grg'}
RARITY = {'UNCOMMON': 'uncommon', 'RARE': 'rare', 'UNIQUE': 'unique'}
COST = {'[one-action]': 1, '[two-actions]': 2, '[three-actions]': 3, '[reaction]': 'reaction', '[free-action]': 'free'}
NAV = re.compile(r'^(INTRODUCTION|TECH|ANCESTRIES|TECH CLASSES|TECH FEATS|TECH GEAR|SPELLS|TACTICAL|STARSHIP|COMBAT|GM’S ARSENAL|GLOSSARY &|INDEX|SHEET|Tech CORE|\d{1,3}|Starships in a|Campaign|Starship|Archive|Hazards)$')
def is_header(l):
    s = l.strip()
    return len(s) > 3 and s.upper() == s and re.search(r'[A-Z]{3}', s) and not re.match(r'^(STARSHIP \d+|TECH|MAGICAL|DIVINE|PRIMAL|OCCULT|ARCANE|UNCOMMON|RARE|UNIQUE|LIVING|UNDEAD|[A-Z]+)$', s)
ENTRY = re.compile(r"^((?:Ranged|Melee)\s|Area Fire\s|Auto[- ]Fire\s|[A-Z][\w’'\-]*(?:\s(?:[A-Z][\w’'\-]*|of|the|and|to|a|in|on|from)){0,6}\s(?:\[(?:one|two|three)-actions?\]|\[reaction\]|\[free-action\]|See page|\())")
out = []
ids = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {}
for i, l in enumerate(L):
    m = re.match(r'^STARSHIP (\d+)$', l.strip())
    if not m: continue
    level = int(m.group(1))
    # name (and maybe size, rarity) before the level line; size and traits may follow it
    prev = [x.strip() for x in L[max(0, i - 6):i] if x.strip()]
    size = None; rarity = 'common'
    while prev and (prev[-1] in SIZES or prev[-1] in RARITY):
        t = prev.pop()
        if t in SIZES: size = SIZES[t]
        else: rarity = RARITY[t]
    if not prev: continue
    name = prev[-1].replace('\x08', '').strip().title().replace("’S", "’s").replace("'S", "'s")
    name = ' '.join(w.upper() if w in ('Sfs', 'Aac', 'Uc', 'Bmc', 'Bd', 'Sc') else w for w in name.split())
    j = i + 1; traits = []
    while j < len(L) and not L[j].startswith('Perception'):
        for t in L[j].strip().split():
            if t in SIZES and not size: size = SIZES[t]
            elif t in RARITY: rarity = RARITY[t]
            elif t.isupper() and len(t) > 2: traits.append(t.lower())
        j += 1
        if j - i > 14: break
    size = size or 'med'
    if j >= len(L) or not L[j].startswith('Perception'): continue
    # block lines until a header
    block = []
    k = j
    FIELD = re.compile(r'^(Skills |Battle Stations |Str [+-]|AC \d|HP \d|Speed \d)')
    skipping = False
    while k < len(L) and k - j < 400:
        t = L[k].strip()
        if t.startswith('=== PAGE'): k += 1; continue
        seen_speed = any(re.match(r'^Speed \d', b) for b in block)
        if k > j and is_header(t):
            if seen_speed: break
            skipping = True              # a sidebar inside the stat block: skip to the next field
        if skipping:
            if FIELD.match(t) or (seen_speed and ENTRY.match(t)): skipping = False
            else: k += 1; continue
        if t and not NAV.match(t): block.append(t)
        k += 1
    # join into logical fields/entries
    joined = []
    for t in block:
        starts = re.match(r'^(Perception|Skills |Battle Stations |Str [+-]|AC \d|HP \d|Speed \d)', t) or ENTRY.match(t)
        if starts or not joined: joined.append(t)
        else:
            joined[-1] = (joined[-1][:-1] + t) if joined[-1].endswith('-') and not joined[-1].endswith(' -') else joined[-1] + ' ' + t
    ship = {'id': ids.get(name) or str(uuid.uuid4()), 'origin': 'user', 'kind': 'starship', 'game': 'sf2e', 'name': name, 'sortName': name.lower(),
            'level': level, 'rarity': rarity, 'traits': traits, 'description': '', 'sourceRefs': [], 'size': size,
            'skills': {}, 'immunities': [], 'weaknesses': [], 'resistances': [], 'battleStations': [], 'strikes': [], 'actions': [],
            'publication': {'title': 'Tech Core (local)', 'remaster': True}}
    problems = []
    for f in joined:
        if f.startswith('Perception'):
            mm = re.match(r'Perception ([+-−–]?\d+)(?:.*?Sensor Range (\d+) zones?)?', f.replace('−', '-').replace('–', '-'))
            ship['perception'] = int(mm.group(1)); ship['sensorRange'] = int(mm.group(2) or 0)
        elif f.startswith('Skills '):
            for sk in re.finditer(r"([A-Z][\w ]*?(?:Lore)?) ([+-]\d+)", f[7:].replace('–', '-')):
                ship['skills'][sk.group(1).strip().lower()] = int(sk.group(2))
        elif f.startswith('Battle Stations '):
            s = f[len('Battle Stations '):]; depth = 0; cur = ''; parts = []
            for ch in s:
                if ch == '(': depth += 1
                if ch == ')': depth -= 1
                if ch == ',' and depth == 0: parts.append(cur.strip()); cur = ''
                else: cur += ch
            if cur.strip(): parts.append(cur.strip())
            for p in parts:
                mm = re.match(r'^(.*?)\s*(?:\((.*)\))?$', p)
                inner = [x.strip().rstrip('*') for x in (mm.group(2) or '').split(',') if x.strip()]
                ship['battleStations'].append({'station': mm.group(1).strip().lower(), 'actions': inner})
        elif re.match(r'^Str [+-]', f):
            ab = {}
            for a in re.finditer(r'(Str|Dex|Con|Int|Wis|Cha) ([+-–−]?\d+)', f.replace('–', '-').replace('−', '-')):
                ab[a.group(1).lower()] = int(a.group(2))
            ship['abilities'] = ab
        elif re.match(r'^AC \d', f):
            g = f.replace('–', '-').replace('−', '-')
            ship['ac'] = int(re.match(r'AC (\d+)', g).group(1))
            sv = dict(re.findall(r'(Fort|Ref|Will) ([+-]?\d+)', g))
            ship['saves'] = {'fort': int(sv.get('Fort', 0)), 'ref': int(sv.get('Ref', 0)), 'will': int(sv.get('Will', 0))}
        elif re.match(r'^HP \d', f):
            g = f.replace('–', '-')
            ship['hp'] = int(re.match(r'HP (\d+)', g).group(1))
            mm = re.search(r'SP (\d+)(?: \(fortify (\d+)\))?', g)
            ship['shields'] = {'max': int(mm.group(1)), 'fortify': int(mm.group(2) or 0)} if mm else None
            mm = re.search(r'Immunities ([^;]+)', g)
            if mm: ship['immunities'] = [x.strip() for x in mm.group(1).split(',')]
            for key, field in (('Weaknesses', 'weaknesses'), ('Resistances', 'resistances')):
                mm = re.search(key + r' ([^;]+)', g)
                if mm:
                    for w in mm.group(1).split(','):
                        wm = re.match(r'\s*(.*?) (\d+)\s*(.*)$', w)
                        if wm: ship[field].append({'type': wm.group(1).strip(), 'value': int(wm.group(2)), **({'note': wm.group(3).strip()} if wm.group(3).strip() else {})})
                        else: problems.append(f'{key}: {w}')
            # extra abilities after the defenses on the HP line (e.g. Protection Sigil)
        elif re.match(r'^Speed \d', f):
            mm = re.match(r'Speed (\d+) zones?', f)
            ship['speed'] = int(mm.group(1)) if mm else 0
            rest = f[mm.end():].strip(' ;,') if mm else ''
            if rest: ship['actions'].append({'name': 'Speed', 'cost': 'passive', 'section': 'interaction', 'traits': [], 'text': rest})
        elif re.match(r'^(Ranged|Melee) ', f):
            g = f.replace('–', '-').replace('−', '-')
            mm = re.match(r'^(Ranged|Melee)(?: \[[a-z-]+\])? (.+?) ([+-]\d+)(?: \((.*)\))?,? Damage (.*)$', g)
            if not mm: problems.append('strike: ' + f[:80]); ship['actions'].append({'name': f.split(' ')[0], 'cost': 1, 'section': 'offensive', 'traits': [], 'text': f}); continue
            tr = [x.strip() for x in (mm.group(4) or '').split(',') if x.strip()]
            rz = None; traits2 = []
            for t in tr:
                r = re.match(r'range increment (\d+) zones?', t)
                if r: rz = int(r.group(1))
                else: traits2.append(t.lower().replace(' ', '-'))
            dmg = []; effects = []
            for part in re.split(r' plus ', mm.group(5)):
                dm = re.match(r'^(\d+d\d+(?:[+-]\d+)?) ([a-z ]+?)$', part.strip())
                if dm: dmg.append({'formula': dm.group(1), 'type': dm.group(2).strip()})
                else: effects.append(part.strip())
            st = {'name': mm.group(2), 'range': mm.group(1).lower(), 'bonus': int(mm.group(3)), 'traits': traits2, 'damage': dmg}
            if rz: st['rangeZones'] = rz
            if effects: st['effects'] = effects
            ship['strikes'].append(st)
        else:
            mm = re.match(r"^(.+?)\s(\[(?:one|two|three)-actions?\]|\[reaction\]|\[free-action\])?\s*(?:\(([^)]*)\))?\s*(.*)$", f)
            em = ENTRY.match(f)
            name2 = em.group(1).split(' [')[0].split(' (')[0].split(' See page')[0].strip() if em else f.split(' ')[0]
            rest = f[len(name2):].strip()
            cost = 'passive'
            for k2, v in COST.items():
                if rest.startswith(k2): cost = v; rest = rest[len(k2):].strip(); break
            trs = []
            if rest.startswith('('):
                close = rest.find(')')
                trs = [x.strip().lower() for x in rest[1:close].split(',')]; rest = rest[close + 1:].strip()
            freq = None
            fm = re.match(r'^Frequency (.+?); (?:Effect )?(.*)$', rest)
            if fm: freq, rest = fm.group(1), fm.group(2)
            sec = 'defensive' if cost == 'reaction' else ('interaction' if cost == 'passive' else 'offensive')
            a = {'name': name2, 'cost': cost, 'section': sec, 'traits': trs, 'text': rest}
            if freq: a['frequency'] = freq
            ship['actions'].append(a)
    for need in ('perception', 'ac', 'hp', 'saves', 'abilities', 'speed'):
        if need not in ship: problems.append('missing ' + need)
    if problems: print('PROBLEM', name, problems, file=sys.stderr)
    out.append(ship)
print(json.dumps(out, ensure_ascii=False, indent=1))
