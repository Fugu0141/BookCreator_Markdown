# BookCreator Markdown (BCM)

A proposed Markdown extension and TypeScript library for structured book authoring, with source-preserving editing, declarative layout directives, and stable references.

BookCreator Markdown（BCM）は、通常のMarkdownに書籍制作向けの拡張記法を追加する独立した文書形式・ライブラリです。最初の利用アプリは [BookCreator](https://github.com/Fugu0141/BookCreator) ですが、他のアプリケーションでも利用可能な設計を目指します。

**Status:** Initial implementation 0.0.1: isolated directive header parser and source patches. Full document parser and conformance remain pending.

## Goals / 目標

- CommonMark/GFM compatibility with declarative BCM extensions.
- Source-preserving parsing and localized edits.
- Typed attributes, custom components, stable IDs and cross-reference validation.
- Shared TypeScript core for Node.js and browsers, with a standalone CLI.
- No dependency on BookCreator's GUI, pagination engine, or PDF renderer.

## Example / 記法例

    # Getting started

    :::callout{kind="tip" title="Tip"}
    Keep the original Markdown readable.
    :::

    ::figure{#fig-example src="../assets/example.png" width="75%" alt="Example" caption="Example"}

    See :ref{target="fig-example" format="label-number"}.

    ::pagebreak{side="any"}

## Documentation / 設計書

- [BCM v1 language specification (draft)](docs/SPECIFICATION.md)
- [Library architecture and proposed API](docs/ARCHITECTURE.md)
- [BookCreator application design](https://github.com/Fugu0141/BookCreator/blob/main/DESIGN.md)

The BCM language specification is maintained in this repository. BookCreator consumes the library; BCM does not depend on BookCreator.

- [Implementation and fixture plan](docs/DEVELOPMENT.md)

- [Cross-project development plan](https://github.com/Fugu0141/BookCreator/blob/main/docs/DEVELOPMENT_PLAN.md)


## Local development / ローカル開発

Node.js 22 or later and npm are required. Run from this repository:

```sh
npm install
npm run typecheck
npm test
```

TypeScript 5.8.3 is pinned. The lockfile is not yet generated; see [implementation status](docs/IMPLEMENTATION_STATUS.md). GitHub Actions is configured for initial checks; full conformance is pending.

## License / ライセンス

This project is licensed under the [MIT License](LICENSE). Third-party materials retain their respective licenses. No npm package has been released yet.

本プロジェクトはMIT Licenseで公開します。第三者の素材・依存関係には各自のライセンスが適用されます。

### Experimental CLI (build first)

    npm run build
    npm run bcm -- parse chapter.md
    npm run bcm -- validate chapter1.md chapter2.md
    npm run bcm -- ids chapter1.md chapter2.md

Read-only scanner-subset inspection; exit 0 means no detected errors in this subset, not full conformance. 1 = detected validation errors, 2 = usage/I/O error. Inline reference extraction and complete CommonMark/GFM remain pending.
