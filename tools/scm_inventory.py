#!/usr/bin/env python3
"""Build a deterministic migration inventory from the supplied Java checkout."""

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


# Keep strings and line offsets intact while masking Java/JavaScript comments.
CODE = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|/\*[\s\S]*?\*/|//[^\r\n]*')
MAPPING = re.compile(r'@(?P<type>Request|Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(?P<args>[^)]*)\)', re.S)
CLASS = re.compile(r'\bclass\s+\w+')
HANDLER = re.compile(r'\bpublic\s+[\w<>,.?\[\] ]+?\s+(\w+)\s*\(')
PATH = re.compile(r'"(/[^"\\]*)"')
VIEW = re.compile(r'\breturn\s+"(/?[\w/-]+)"\s*;')
RESOURCE = re.compile(r'/(?:static|resources)/[\w./-]+\.js\b')


def hide_comments(source):
    return CODE.sub(lambda m: re.sub(r'[^\r\n]', ' ', m[0]) if m[0].startswith('/') else m[0], source)


def source_routes(path, source, views):
    source = hide_comments(source)
    class_match = CLASS.search(source)
    if not class_match:
        return
    annotations = list(MAPPING.finditer(source))
    prefixes = ['']
    for match in annotations:
        if match.start() < class_match.start():
            prefixes = PATH.findall(match['args']) or prefixes
    for index, match in enumerate(annotations):
        if match.start() < class_match.start():
            continue
        end = annotations[index + 1].start() if index + 1 < len(annotations) else len(source)
        method_code = source[match.end():end]
        handler = HANDLER.search(method_code)
        if not handler:
            raise ValueError(f'{path}: no public handler for {match[0]}')
        methods = re.findall(r'\bRequestMethod\.(\w+)', match['args'])
        if not methods:
            methods = ['ANY' if match['type'] == 'Request' else match['type'].upper()]
        candidates = [f'{name.lstrip("/")}.jsp' for name in VIEW.findall(method_code)]
        # Only literal returns resolving to real files are claimed as view links.
        result_views = sorted({name for name in candidates if name in views})
        for prefix in prefixes:
            for endpoint in PATH.findall(match['args']) or ['']:
                for method in sorted(set(methods)):
                    yield {'method': method, 'route': '/' + '/'.join(x.strip('/') for x in (prefix, endpoint) if x.strip('/')),
                           'controller': path, 'handler': handler[1], 'line': source.count('\n', 0, match.start()) + 1,
                           'views': result_views}


def inventory(root):
    source = root / 'src/main'
    controllers = source / 'java/com/velox/itsm/controller'
    web = source / 'webapp'
    views = web / 'WEB-INF/views'
    if not controllers.is_dir() or not views.is_dir():
        raise ValueError('Expected SCM Java controller and WEB-INF/views directories')
    view_names = {p.relative_to(views).as_posix(): p for p in views.rglob('*.jsp')}
    routes = sorted((row for p in controllers.glob('*.java') for row in source_routes(
        p.name, p.read_text(errors='replace'), view_names)), key=lambda row: (row['route'], row['method'], row['controller'], row['line']))
    view_routes = defaultdict(list)
    routes_by_path = defaultdict(set)
    for row in routes:
        route_key = f"{row['method']} {row['route']}"
        routes_by_path[row['route'].split('/{', 1)[0]].add(route_key)
        for name in row['views']:
            view_routes[name].append(route_key)
    routes_pattern = re.compile(r"(?<![\w/])(?:" + '|'.join(re.escape(route) for route in sorted(routes_by_path, key=lambda r: (-len(r), r))) + r")(?![\w/-])")
    scripts = {}

    def find_endpoints(src):
        return sorted({key for match in routes_pattern.finditer(src) for key in routes_by_path[match[0]]})

    pages = []
    for name, p in sorted([*view_names.items(), *((f'@root/{p.name}', p) for p in web.glob('*.jsp'))]):
        if not p.is_file():
            continue
        original = p.read_text(errors='replace')
        markup = re.sub(r'<!--.*?-->|<%--.*?--%>', '', original, flags=re.S)
        # Scan custom scripts and top-level scripts; vendor bundles are not part of the feature inventory.
        asset_refs = {url for url in RESOURCE.findall(markup) if url.startswith(('/static/custom/', '/static/Login/')) or url.count('/') == 2}
        for url in sorted(asset_refs - scripts.keys()):
            asset = web / url.lstrip('/')
            scripts[url] = find_endpoints(hide_comments(asset.read_text(errors='replace'))) if asset.is_file() else None
        pages.append({'view': name, 'servedBy': sorted(set(view_routes[name])), 'inlineReferences': find_endpoints(markup),
                      'scripts': sorted(asset_refs), 'leadingNuls': len(original) - len(original.lstrip('\0'))})
    return {
        'summary': {'controllerSources': len(list(controllers.glob('*.java'))),
                    'controllersWithHandlers': len({row['controller'] for row in routes}), 'routeMethodPairs': len(routes),
                    'jspUnderViews': len(view_names), 'rootEntryPages': sum(page['view'].startswith('@root/') for page in pages),
                    'jspWithDirectControllerMapping': sum(bool(page['servedBy']) for page in pages),
                    'routesByController': dict(sorted(Counter(row['controller'] for row in routes).items()))},
        'routes': routes, 'views': pages, 'scripts': scripts,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('legacy_root', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    output = json.dumps(inventory(args.legacy_root), indent=2, ensure_ascii=False) + '\n'
    if args.check:
        if not args.output.is_file() or args.output.read_text() != output:
            raise SystemExit('Inventory differs from the supplied SCM sources')
        print('Inventory matches SCM sources.')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output)


if __name__ == '__main__':
    main()
