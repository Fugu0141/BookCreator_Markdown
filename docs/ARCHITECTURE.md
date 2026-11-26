# BCM — 独立ライブラリ設計

- 状態: 設計ドラフト 0.1.0。実装・npm公開・PoCは未実施。
- 言語仕様の正本: [SPECIFICATION.md](SPECIFICATION.md)
- 利用アプリ: [BookCreator](https://github.com/Fugu0141/BookCreator)
- 関連ライブラリ: [BookCreator Layout Engine](https://github.com/Fugu0141/BookCreator_LayoutEngine)（BCMとは独立。BookCreator側のアダプタがASTを中立組版入力へ変換する）
- 主言語: TypeScript（strict）。Node.jsとブラウザで利用できる共通コアを目標とする。
- ライセンス: MIT（LICENSE参照）。第三者の依存・素材は各自のライセンスに従う。

## 1. 独立性と責務

BCMはCommonMark/GFMを拡張した宣言的文書形式と、その処理ライブラリ。BookCreator固有のGUI、Electron、React、組版、PDF、Git、ファイル保存、テーマ描画、プロジェクト管理に依存しない。BookCreatorをBCMの最初の利用者とし、依存方向はBookCreator → BCMのみとする。

| BCMの責務 | 利用アプリの責務 |
| --- | --- |
| 構文解析、CST相当の原文範囲、AST | GUIノード・編集履歴・IMEの制御 |
| 標準/独自ディレクティブの構文・属性検証 | テーマの定義・描画・部品の実体 |
| 永続ID、複数文書の参照索引、参照切れ診断 | 章順、プロジェクト、ページ番号・図表番号の実際の採番 |
| 原文を保持する局所テキストパッチ | ファイルの保存・復旧・Git操作 |
| 相対パスの字句的検査、依存参照の抽出 | 実ファイル・シンボリックリンク・権限の検証 |
| 構造化診断と明示修正候補 | 診断表示、組版、HTML描画、PDF |

ページの位置・寸法・描画・参照番号をBCMが推測しない。Canvas宣言をデータとして解析/検証する契約は設けるが、描画モデルの具体的な型はBookCreator側の部品仕様との合意後に独立スキーマとして版管理する。複数利用アプリの独自部品を任意コード実行なしに登録可能にする。

## 2. 公開API案

以下は設計例であり、現在利用可能なAPIではない。名称・型はPoCで確定する。

    interface ParseOptions {
      mode: "markdown" | "bcm";
      formatVersion?: 1;
      documentId: string;
      revision: string;
      registry?: DirectiveRegistry;
    }

    interface SourceRange {
      start: number;
      end: number;
    }

    interface TextPatch {
      range: SourceRange;
      expected: string;
      replacement: string;
    }

    interface ParseResult {
      documentId: string;
      revision: string;
      source: string;
      ast: DocumentNode;
      sourceMap: SourceMap;
      diagnostics: readonly Diagnostic[];
    }

    parse(source: string, options: ParseOptions): ParseResult
    validate(document: ParseResult, options?: ValidationOptions): readonly Diagnostic[]
    indexDocuments(documents: readonly ParseResult[]): ReferenceIndex
    validateReferences(index: ReferenceIndex, context?: ReferenceContext): readonly Diagnostic[]
    createAttributePatch(document: ParseResult, nodeKey: string, key: string, value: AttributeValue | undefined): PatchResult
    applyPatches(document: ParseResult, patches: readonly TextPatch[], expectedRevision: string): PatchResult

parseは未完成原稿も扱い、入力が不正であること自体を例外とせず診断にする。未知構文をopaqueとして原文保持し、明示されたモードで解析する。サポート外の形式は誤解釈しない。ASTはJSON互換の型付きデータを基本とし、未知ノードは原文への参照を持つ。nodeKeyは同一解析結果内の識別子、永続IDとは別。sourceは原文を保持する。UTF-16範囲を基本とし、UTF-8バイト列/BOM/改行変換の処理は明示的な入出力アダプタとする。

validateは構文/属性/構造を検証する。indexDocumentsは明示的に渡された文書集合に対し書籍内IDを索引化する。参照検証は利用側が渡す文書集合・文献キー等のコンテキストを用い、未提供の文脈を勝手に欠落と断定しない。実ファイルを自動で探索しない。診断には安定したコード、severity、位置、関連位置、修正候補を含める。文書の順序や出版可否の最終判断は利用アプリの責務。

パッチは元文字列とrevision、範囲の重複、Unicode境界を検証し、一括適用する。失敗時に一部だけ書き換えない。変更後の再解析・期待意味の検査を行う。保存やUndo履歴をライブラリが勝手に管理しない。一般的な全文正規化は別API/明示操作に限定。

## 3. モジュール構成案

    BookCreator_Markdown/
      README.md
      docs/
        SPECIFICATION.md
        ARCHITECTURE.md
      src/
        syntax/        # トークン、CommonMark/GFM、BCM拡張
        ast/           # 公開型、opaqueノード
        source/        # 範囲、原文・改行の保持
        schema/        # 標準・独自ディレクティブの型
        validation/    # 構文/型/構造診断
        references/    # ID、参照索引、依存抽出
        editing/       # 局所パッチ生成・検証
        index.ts       # 安定した公開入口
      cli/             # Node専用のファイル入出力
      tests/
        fixtures/      # 入力、期待AST、診断、パッチ
        conformance/   # BCM-01〜20等

初期は単一のライブラリパッケージとし、必要に応じCLIを別入口/別パッケージ化する。公開名候補は @fugu0141/bcm または bookcreator-markdown。npmの名前可用性・組織権限は未確認で予約しない。パッケージバージョンと文書形式バージョンを独立させる。公開APIの互換性はSemVerを採用する案。最初は0.xの開発版、BCM v1は検証後に確定。

## 4. ランタイム・依存

TypeScript、ESMを基本候補とする。Node.jsとブラウザの両方でコアを動かす。コアにfs、pathのOS固有処理、DOM、Electron、ネットワーク等を直接依存させない。CLIだけがNodeファイルAPIを利用し、明示された入力を扱う。バンドラー、Nodeの最低対応バージョン、CJS対応は実際の依存と利用環境を調べて決める。

CommonMark/GFMの既存ライブラリ（remark/unified等）を候補として検証する。BCMの構文競合・原文範囲・部分編集が成立しない部分は独自トークナイザ/パーサーを用意する。既存仕様との一致を確認せずMarkdownの全文パーサーを置換することは前提としない。実際の依存・版・ライセンスを記録し、MITと整合するものを選ぶ。依存選定・ライセンス確認は別途行う。

## 5. CLI（初期案）

    bcm parse manuscript.md
    bcm validate manuscript.md
    bcm validate chapter1.md chapter2.md

parseはAST等の機械可読な結果を標準出力。validateは診断と終了コードを返す。複数ファイル検査は明示された集合のみを対象とする。既定で原稿を書き換えない。自動修正・整形を追加する場合は明示オプションと差分確認を必要とする。PDF出力・BookCreatorプロジェクトの自動探索をCLIの初期責務にしない。

## 6. 実装前ゲートと開発順

1. SPECIFICATIONの構文競合、属性・位置・エラー回復のfixtureを確定。
2. CommonMark/GFMとの互換性とBCM構文のPoC。既存候補と必要な独自処理を比較。
3. AST・原文範囲・属性・未知構文保持を実装し、BCM-01〜20のうち構文/編集に関する項目を検証。
4. 局所パッチ・参照索引・診断を実装し、Node/ブラウザで同じ入力に対する同じ意味と範囲を検査。
5. CLIとBookCreator統合用fixtureを用意。組版を必要とする検証はBookCreator側と共同実施。
6. APIレビュー、依存ライセンス、互換性、入力サイズ・再帰深度等の安全性確認後に開発版を配布。

CIで型検査、単体/fixture、ブラウザビルド、依存ライセンスの確認を行う計画。検証に合格する前に完全互換や原文無損失を保証しない。仕様変更は本リポジトリで管理し、BookCreator側は採用するBCM版を固定する。BCMの仕様に影響するBookCreator側の変更は双方の文書を確認し、二重の正本を作らない。
