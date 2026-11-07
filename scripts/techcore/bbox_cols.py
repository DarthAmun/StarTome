"""pdftotext -bbox-layout HTML → text, column by column (left then right), skipping the nav strip."""
import re, sys, html
src = open(sys.argv[1], encoding='utf-8').read()
first = int(sys.argv[2]); out = []
for pi, page in enumerate(re.findall(r'<page[^>]*>(.*?)</page>', src, re.S)):
    lines = []
    for blk in re.findall(r'<block xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</block>', page, re.S):
        bx = float(blk[0])
        for ln in re.findall(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', blk[4], re.S):
            words = [html.unescape(w) for w in re.findall(r'<word[^>]*>(.*?)</word>', ln[4], re.S)]
            x, y = float(ln[0]), float(ln[1])
            if x > 538: continue            # chapter nav strip on the right
            lines.append((0 if bx < 296 else 1, y, x, ' '.join(words)))
    lines.sort(key=lambda t: (t[0], round(t[1], 0), t[2]))
    out.append(f'=== PAGE {first + pi}')
    prev = None
    for col, y, x, t in lines:
        if prev and (col != prev[0] or y - prev[1] > 16): out.append('')
        out.append(t); prev = (col, y)
print('\n'.join(out))
