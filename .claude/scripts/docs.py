"""Create _docs files from .claude/templates and serve them locally.

Usage:
  python .claude/scripts/docs.py new architecture-decision
  python .claude/scripts/docs.py new architecture-overview
  python .claude/scripts/docs.py new solution TH01-03 --title "Application Shell and Homepage"
  python .claude/scripts/docs.py new plan TH01-03 --title "Application Shell and Homepage"
  python .claude/scripts/docs.py serve [--port 8765]
"""
import argparse
import datetime
import functools
import http.server

from common import DOCS, ROOT, TEMPLATES, fail

# template name -> (template file, output file name pattern)
DOC_TYPES = {
    "architecture-decision": ("architecture-decision.html", "0.architecture-decision.html"),
    "architecture-overview": ("architecture-overview.html", "1.architecture-overview.html"),
    "solution": ("solution.html", "{id}.solution.html"),
    "plan": ("plan.md", "{id}.plan.md"),
}


def cmd_new(args):
    template_name, output_pattern = DOC_TYPES[args.type]
    if "{id}" in output_pattern and not args.id:
        fail(f"'{args.type}' needs an ID, e.g. TH01-03 or REQ-013")
    output = DOCS / output_pattern.format(id=args.id)
    if output.exists() and not args.force:
        fail(f"{output.relative_to(ROOT)} exists; edit it or pass --force")

    content = (TEMPLATES / template_name).read_text(encoding="utf-8")
    for key, value in {
        "{{ID}}": args.id or "",
        "{{TITLE}}": args.title or args.id or "",
        "{{DATE}}": datetime.date.today().isoformat(),
    }.items():
        content = content.replace(key, value)
    output.write_text(content, encoding="utf-8")
    print(f"created {output.relative_to(ROOT)}")


def cmd_serve(args):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"serving http://localhost:{args.port}/_docs/  (Ctrl+C to stop)")
        server.serve_forever()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    new_parser = commands.add_parser("new", help="create a document from a template")
    new_parser.add_argument("type", choices=DOC_TYPES)
    new_parser.add_argument("id", nargs="?", help="capacity or requirement ID")
    new_parser.add_argument("--title")
    new_parser.add_argument("--force", action="store_true", help="overwrite an existing file")
    new_parser.set_defaults(run=cmd_new)

    serve_parser = commands.add_parser("serve", help="serve the repo so _docs pages can load the xlsx")
    serve_parser.add_argument("--port", type=int, default=8765)
    serve_parser.set_defaults(run=cmd_serve)

    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
