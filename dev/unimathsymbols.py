'''
This script parses uni-math symbols from
http://milde.users.sourceforge.net/LUCR/Math/data/unimathsymbols.txt
and save the result as a json file.
The result is used to generate command intellisense for LaTeX Workshop.
'''

import json
import re
from typing import List, Set, Dict, Tuple, Union, Optional, Match


def to_markdown(doc: str) -> str:
    arry: List[str] = []
    cmd = r'[=#xt]\s+(\\\w+(\{[\\\w\{\}]+\})?\s*(\(.*?\))?)\s*,?'
    for m in re.finditer(cmd, doc):
        arry.append('- ' + m.group(1))
    doc = re.sub(cmd, '', doc)
    doc = doc.strip()

    def capitalize(m: Match) -> str:
        return m.group(0).capitalize()

    doc = re.sub(r'[A-Z]+', capitalize, doc)
    if doc == '':
        return '\n'.join(arry)
    else:
        return '- ' + doc + '\n' + '\n'.join(arry)


data = {}

with open('unimathsymbols.txt', encoding='utf-8') as f:
    for line in f:
        if line[0] == '#':
            continue
        segments = line.split('^')
        if segments[3] == '':
            continue
        if segments[3][0] == '\\':
            segments[3] = segments[3][1:]
        data[segments[3]] = {
            'command': segments[3],
            'detail': segments[1],
            'documentation': to_markdown(segments[7].strip())
        }
        if segments[6] != '' and segments[6][0] != '-':
            data[segments[3]]['detail'] += ' ("{}" command)'.format(segments[6])

json.dump(data, open('../data/unimathsymbols.json', 'w', encoding='utf-8'),
          indent=2, separators=(',', ': '), sort_keys=True, ensure_ascii=False)
