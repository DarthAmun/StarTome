import re
COST = {'one-action': 1, 'two-actions': 2, 'three-actions': 3, 'reaction': 'reaction', 'free-action': 'free'}
ACTION_HEAD = re.compile(r"^([A-Z0-9][A-Z0-9’'\-,&/ ]*?) \[(one-action|two-actions|three-actions|reaction|free-action)\](?: (?:OR|TO) \[(one-action|two-actions|three-actions)\])?(?:\s+(SPELL|CANTRIP|FOCUS) (\d+))?$")
DEGREE = re.compile(r'^(Critical Success|Success|Failure|Critical Failure) ')
FIELDS = re.compile(r'^(Trigger|Requirements|Frequency|Prerequisites|Effect|Traditions|Range|Targets|Defense|Duration|Area|Heightened \([^)]*\)) ')
GRADES = ['commercial', 'tactical', 'advanced', 'superior', 'elite', 'ultimate', 'paragon']
def title(s):
    small = {'a', 'an', 'the', 'of', 'to', 'in', 'on', 'and', 'or', 'from', 'for'}
    w = s.lower().split()
    return ' '.join(x if (i and x in small) else (x[0].upper() + x[1:]) for i, x in enumerate(w)).replace("’S ", "’s ")
def is_caps(t):
    return len(t) > 2 and t.upper() == t and re.search(r'[A-Z]{2}', t) is not None
def join_lines(lines):
    """Lines of a body → markdown paragraphs: fields and degrees start new lines."""
    out = []
    for t in lines:
        if not t: continue
        m = DEGREE.match(t) or FIELDS.match(t)
        if m or not out:
            out.append(f'**{m.group(1)}** {t[len(m.group(1)):].strip()}' if m else t)
        elif out[-1].endswith('-') and not out[-1].endswith(' -'):
            out[-1] = out[-1][:-1] + t
        else:
            out[-1] += ' ' + t
    return out
def action_from(head, trait_line, body_lines, grade=None):
    m = ACTION_HEAD.match(head)
    name = title(m.group(1))
    cost = COST[m.group(2)]
    if m.group(3): cost = {'min': COST[m.group(2)], 'max': COST[m.group(3)]} if isinstance(COST[m.group(2)], int) else cost
    traits = [t.lower() for t in trait_line.split()] if trait_line and is_caps(trait_line) and not ACTION_HEAD.match(trait_line) else []
    body = body_lines if traits or not trait_line else [trait_line] + body_lines
    paras = join_lines(body)
    freq = trig = req = None
    rest = []
    for p in paras:
        if p.startswith('**Frequency** '): freq = p[len('**Frequency** '):]
        else: rest.append(p)
    a = {'name': name, 'cost': cost, 'section': 'defensive' if cost == 'reaction' else 'offensive', 'traits': traits, 'text': '\n\n'.join(rest)}
    if freq: a['frequency'] = freq
    if grade: a['grade'] = grade
    return a, m
