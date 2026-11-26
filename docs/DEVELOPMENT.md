# BCM — 実装計画

状態: 未実装。正本はSPECIFICATION.md、公開APIはARCHITECTURE.md。3リポジトリ共通の計画は [DEVELOPMENT_PLAN](https://github.com/Fugu0141/BookCreator/blob/main/docs/DEVELOPMENT_PLAN.md)。

## 作業順
1. TypeScript strictの最小パッケージ、型検査、単体テスト、Node/ブラウザビルド。依存版・ライセンスを記録。
2. CommonMark/GFMの標準fixtureとBCMの構文競合fixtureを作る。remark等の候補の拡張性・原文位置・未知構文の扱いを検証する。
3. AST/CST相当の範囲、opaque、診断、属性型を実装。コード・数式・脚注・入れ子・エスケープ・不正入力の境界を確認する。
4. 局所パッチ、revision前提条件、原文/改行/BOM保持、参照索引・複製時のID変換を実装する。
5. CLI、外部利用API、ブラウザ検証、BookCreator共通fixtureを作る。パッケージ名、Node最低版は確認後に決定。プロジェクトのライセンスはMIT。依存・配布素材の権利確認は継続する。

## Fixtureの構成

各fixtureは入力の生バイト列/文字列、mode/version、期待ASTの意味的部分、正確なUTF-16範囲、期待診断コード、任意のパッチ、期待出力を持つ。AST全体のスナップショットだけに依存しない。BCM-01〜20を追跡する。特にコード中の拡張の非認識、Unicode/CRLF/BOM、入れ子、未知記法、重複属性、$の金額衝突、参照切れ、相対パス、局所編集を検証。行/バイト/UTF-16位置の変換を明示的に試験する。GUI/組版を必要とする受入項目はBookCreator/Engineと共同fixtureで検査する。

## API・依存境界

書き戻しはテキストパッチと再解析で意味を検証し、ファイルの保存やUndo管理をコアに含めない。ファイルシステム・DOM・組版・BookCreatorのYAMLに依存しない。CLIのファイル入出力はコアと別入口。BCMの文法の変更はここで行い、BookCreatorの保存形式やEngineの配置意味論を勝手に変更しない。原文保持・セキュリティ・対応形式の実測が不十分なら開発版として制約を明記し、完全互換と称さない。MIT希望は記録するが最終確定は保留。全項目not-run。
