# First development milestone (0.0.1)

Implemented: isolated block directive header lexer (leaf/container, ID, quoted attributes, diagnostics, UTF-16 ranges); pure text patch application with expected source and grapheme/CRLF checks. This is NOT a complete BCM parser. Call only on isolated directive header lines, not arbitrary Markdown; CommonMark/GFM context, nested container matching, inline directives, schema validation, reference indexing, revision transactions, byte-level encoding and CLI remain unimplemented. API is experimental. No npm publication. Local Node 22.16.0 / TypeScript 5.8.3: five unit tests passed on the working copy. Full BCM conformance is not yet run. Network restrictions prevented npm installation and lockfile generation in the development environment. Before a reproducible release, generate and commit package-lock.json and replace npm install in CI with npm ci. License remains undecided; do not distribute a release until confirmed.

## Second development milestone

Added scanDocument (experimental lossless block scanner), nested BCM containers, UTF-16 source ranges, ATX heading detection, fenced code/math/comment protection, unknown-directive and mismatched/unclosed-container diagnostics. Raw Markdown remains opaque/line-based. This is NOT a complete CommonMark/GFM parser: list/quote/HTML contexts, BOM semantics, exact blank-line boundaries, inline directives, schema and reference validation are pending. Do not use it to authorize publication. Four new tests; 9/9 local tests passed (Node 22.16.0, TypeScript 5.8.3).

## Third milestone — block ID index PoC

Added indexBlockIds for scanned block directives across explicit document sets, nested IDs, duplicate diagnostics with both positions, and three tests. No inline references, schema validation, full CommonMark/GFM or complete reference index yet. Scanner limitations remain. Tests added; execution not yet verified.
