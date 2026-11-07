import json, re, sys, uuid
sys.path.insert(0, sys.argv[2])
from parse_common import *
L = [l.strip() for l in open(sys.argv[1], encoding='utf-8').read().split('\n')]
L = [l for l in L if not l.startswith('=== PAGE') and not re.match(r'^\d{1,3}$', l) and l != 'Tech CORE']
INLINE = re.compile(r"^Activate—(.+?) \[(one-action|two-actions|three-actions|reaction|free-action)\](?: (?:OR|TO) \[[a-z-]+\])?\s*(?:\(([^)]*)\))?\s*(.*)$")
out = []
i = 0
while i < len(L):
    m = re.match(r'^UPGRADE (\d+)(\+?)$', L[i])
    if not m or i == 0: i += 1; continue
    name = title(L[i - 1]); level = int(m.group(1))
    j = i + 1
    while j < len(L) and not L[j]: j += 1
    traits = [t.lower() for t in L[j].split()] if is_caps(L[j]) else []
    if traits: j += 1
    body = []
    while j < len(L):
        x = L[j]
        if j + 1 < len(L) and re.match(r'^UPGRADE \d+\+?$', L[j + 1]): break
        if is_caps(x) and len(x) > 6 and not x.startswith('Activate'): break
        body.append(x); j += 1
    # usage, activations, grades
    text = ' '.join(b for b in body if b)
    text = re.sub(r'(\w)- (\w)', r'\1\2', text)
    station = ''
    um = re.match(r'^Usage installed (?:in|on) (?:a |an |any )?(.+?)(?=(?: on a starship| with |;|\. | [A-Z]))', text + ' X')
    if um:
        station = um.group(1).strip().lower().rstrip('.')
        text = text[um.end():].strip()
    parts = re.split(r'(?=Activate—)|(?=Type (?:commercial|tactical|advanced|superior|elite|ultimate|paragon); Level \d+)', text)
    desc = parts[0].strip(); actions = []; grades = []
    for p in parts[1:]:
        am = INLINE.match(p.strip())
        if am:
            rest = am.group(4)
            freq = None
            fm = re.search(r'Frequency ([^;]+); ', rest)
            if fm: freq = fm.group(1); rest = rest.replace(fm.group(0), '')
            rest = re.sub(r'(?:^|; )(Trigger|Requirements|Prerequisites|Effect) ', lambda q: f'\n\n**{q.group(1)}** ', rest).strip()
            rest = re.sub(r' (Critical Success|Success|Failure|Critical Failure) ', lambda q: f'\n\n**{q.group(1)}** ', rest)
            a = {'name': am.group(1).strip(), 'cost': COST[am.group(2)], 'section': 'defensive' if am.group(2) == 'reaction' else 'offensive',
                 'traits': [t.strip().lower() for t in (am.group(3) or '').split(',') if t.strip()], 'text': rest.strip()}
            if freq: a['frequency'] = freq
            actions.append(a); continue
        gm = re.match(r'^Type (\w+); Level (\d+)\s*(.*)$', p.strip())
        if gm: grades.append({'grade': gm.group(1), 'level': int(gm.group(2)), **({'text': gm.group(3).strip()} if gm.group(3).strip() else {})})
    e = {'id': str(uuid.uuid4()), 'origin': 'user', 'kind': 'stationUpgrade', 'game': 'sf2e', 'name': name, 'sortName': name.lower(), 'level': level,
         'rarity': 'common', 'traits': traits, 'description': desc, 'sourceRefs': [], 'station': station or 'any', 'actions': actions,
         'publication': {'title': 'Tech Core (local)', 'remaster': True}}
    if grades: e['grades'] = grades
    out.append(e)
    i = j
print(json.dumps(out, ensure_ascii=False, indent=1))
