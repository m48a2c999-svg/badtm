"""논문 원고의 참고문헌(refs.txt)으로 사이트의 data/refs.json을 다시 만든다.
사용: python3 tools/refs_from_thesis.py <refs.txt 경로>"""
import json, re, sys
src = sys.argv[1]
out, group = [], None
for line in open(src, encoding='utf-8'):
    t = line.strip()
    if not t:
        continue
    if t in ('국내 문헌', '국외 문헌'):
        group = t
        continue
    m = re.search(r'https?://\S+', t)
    url = m.group(0).rstrip('.') if m else ''
    text = t[:m.start()].strip() if m else t
    y = re.search(r'\((\d{4})[a-z]?\)', t)
    out.append({'group': group, 'text': text, 'url': url, 'year': int(y.group(1)) if y else None})
json.dump(out, open('data/refs.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(out), sum(r['group'] == '국내 문헌' for r in out), sum(r['group'] == '국외 문헌' for r in out))
