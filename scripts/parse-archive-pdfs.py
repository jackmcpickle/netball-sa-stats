#!/usr/bin/env python3
"""Parse AMND archive PDF bbox fixtures into placement JSON."""
from __future__ import annotations

import json
import pathlib
import re
import sys

FIX = pathlib.Path('data/archive/fixtures')
OUT = pathlib.Path('data/archive/placements')

TITLE_RE = re.compile(
    r'ADELAIDE\s+METROPOLITAN|FINAL\s+PREMIERSHIP|PREMIERSHIP\s+PLACINGS|PREMIERSHIP\s+TABLES',
    re.I,
)
ORD_ONLY = re.compile(r'^(?P<pos>\d+)(?:st|nd|rd|th|\.)?$', re.I)
ORD_NAME = re.compile(r'^(?P<pos>\d+)(?:st|nd|rd|th|\.)?\s+(?P<name>.+)$', re.I)
SQUAD_RE = re.compile(r'^(?P<name>.*?)\s*\((?P<squad>\d+)\)\s*$')
GRADE_RE = re.compile(
    r'^(?:'
    r'AMND(?:\s+LEAGUE)?|'
    r'A\.?\s*(?:GRADE)?\s*\d*\.?|'
    r'A\d+\.?|'
    r'B\.?\s*\d+\.?|'
    r'C\.?\s*\d+\.?|'
    r'H\.?\s*GRADE|'
    r'H\s+GRADE|'
    r'INTER(?:MEDIATE)?\.?\s*\d*\.?|'
    r'INT\.?\s*\d+\.?|'
    r'JUNIOR\s*\d*\.?|'
    r'JNR\.?\s*\d+\.?|'
    r'SUB-?JUNIOR\s*\d*\.?|'
    r'S\.?J\.?\s*\d+\.?|'
    r'PRIM(?:ARY)?\.?\s*\d*\.?|'
    r'SUB-?PRIMARY\s*\d*\.?'
    r')$',
    re.I,
)
BAD_NAME = re.compile(r'https?://|\s\d+(?:st|nd|rd|th|\.)?\s+\S', re.I)


def is_title(text: str) -> bool:
    return bool(TITLE_RE.search(text.strip()))


def is_grade_header(text: str) -> bool:
    t = ' '.join(text.strip().split())
    if not t or is_title(t):
        return False
    if ORD_ONLY.match(t) or ORD_NAME.match(t):
        return False
    return bool(GRADE_RE.match(t))


def y_rows(lines, tol=5.0):
    lines = sorted(lines, key=lambda L: (-L['y0'], L['x0']))
    rows = []
    for L in lines:
        if not rows or abs(rows[-1][0]['y0'] - L['y0']) > tol:
            rows.append([L])
        else:
            rows[-1].append(L)
    return rows


def split_sections(page_lines):
    content = [L for L in page_lines if not is_title(L['text'])]
    rows = y_rows(content, tol=6.0)
    sections = []
    current_headers = None
    current_body = []
    for row in rows:
        headers = [L for L in row if is_grade_header(L['text'])]
        others = [L for L in row if not is_grade_header(L['text'])]
        has_placement = any(
            ORD_ONLY.match(L['text'].strip()) or ORD_NAME.match(L['text'].strip())
            for L in others
        )
        if headers and not has_placement:
            if current_headers is not None:
                sections.append((current_headers, current_body))
            current_headers = headers
            current_body = []
            continue
        if current_headers is not None:
            current_body.extend(row)
    if current_headers is not None:
        sections.append((current_headers, current_body))
    return sections


def bands_from_headers(headers, page_width):
    headers = sorted(headers, key=lambda L: L['x0'])
    xs = [h['x0'] for h in headers]
    bounds = [0.0]
    for i in range(len(xs) - 1):
        bounds.append((xs[i] + xs[i + 1]) / 2.0)
    bounds.append(page_width + 50)
    return [
        {'name': ' '.join(h['text'].split()), 'left': bounds[i], 'right': bounds[i + 1]}
        for i, h in enumerate(headers)
    ]


def parse_name(name: str):
    name = ' '.join(name.split())
    sm = SQUAD_RE.match(name)
    if sm:
        return sm.group('name').strip(), int(sm.group('squad'))
    # Trailing squad digit without parens: "Contax 1"
    m = re.match(r'^(.*\S)\s+(\d+)$', name)
    if m and not BAD_NAME.search(m.group(1)):
        return m.group(1).strip(), int(m.group(2))
    return name, None


def placements_for_band(body_lines, band, year):
    frags = [
        L
        for L in body_lines
        if band['left'] <= (L['x0'] + L['x1']) / 2 < band['right']
    ]
    rows = y_rows(frags, tol=6.0)
    out = []
    for row in rows:
        row = sorted(row, key=lambda L: L['x0'])
        texts = [L['text'].strip() for L in row]
        if not texts:
            continue
        if len(texts) == 1:
            m = ORD_NAME.match(texts[0])
            if not m:
                continue
            pos = int(m.group('pos'))
            name = m.group('name').strip()
        else:
            m0 = ORD_ONLY.match(texts[0])
            m1 = ORD_NAME.match(texts[0])
            if m0:
                pos = int(m0.group('pos'))
                name = ' '.join(texts[1:]).strip()
            elif m1:
                pos = int(m1.group('pos'))
                name = ' '.join([m1.group('name')] + texts[1:]).strip()
            else:
                continue
        if not name or name.lower() == 'bye':
            continue
        if pos < 1 or pos > 24 or pos == year:
            continue
        if BAD_NAME.search(name):
            continue
        team, squad = parse_name(name)
        if not team or team.isdigit() or BAD_NAME.search(team):
            continue
        out.append({'ladderPosition': pos, 'teamName': team, 'squadNumber': squad})
    by_pos = {}
    for e in out:
        by_pos.setdefault(e['ladderPosition'], e)
    return [by_pos[p] for p in sorted(by_pos)]


def validate(entries):
    if not entries:
        return 'empty'
    positions = [e['ladderPosition'] for e in entries]
    if positions[0] != 1 or positions != list(range(1, positions[-1] + 1)):
        return f'non-contiguous {positions}'
    return None


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    all_names: set[str] = set()
    any_issues = False
    for fixture in sorted(FIX.glob('*-bbox.json')):
        data = json.loads(fixture.read_text())
        year = data['year']
        page_width = max((L['x1'] for page in data['pages'] for L in page), default=800)
        combined: dict[str, list] = {}
        for page in data['pages']:
            for headers, body in split_sections(page):
                for band in bands_from_headers(headers, page_width):
                    entries = placements_for_band(body, band, year)
                    if not entries:
                        continue
                    key = band['name']
                    prev = combined.get(key)
                    if prev is None or len(entries) > len(prev):
                        combined[key] = entries
        grades_out = []
        issues = []
        for gname, entries in sorted(combined.items()):
            issue = validate(entries)
            if issue:
                issues.append(f'{gname}: {issue}')
                any_issues = True
            grades_out.append({'gradeName': gname, 'teams': entries})
            for t in entries:
                all_names.add(t['teamName'])
        (OUT / f'{year}.json').write_text(
            json.dumps({'year': year, 'grades': grades_out, 'issues': issues}, indent=2) + '\n'
        )
        print(f'{year}: {len(grades_out)} grades, {sum(len(g["teams"]) for g in grades_out)} rows, issues={issues}')
    pathlib.Path('data/archive/team-names.json').write_text(
        json.dumps(sorted(all_names), indent=2) + '\n'
    )
    print(f'unique names {len(all_names)}')
    return 1 if any_issues else 0


if __name__ == '__main__':
    sys.exit(main())
