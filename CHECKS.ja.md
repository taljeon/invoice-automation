# 検証方法

[English](CHECKS.md) · [日本語](CHECKS.ja.md) · [README](README.ja.md)

Node.js 22.13以上（または対応する新しいLTS）とPython 3を使用します。フロントエンドとバックエンドの依存関係は、それぞれのlockfileで固定しています。

```sh
npm ci --ignore-scripts
npm --prefix functions ci --ignore-scripts
npm run check
```

`npm run check`は、フロントエンドのTypeScript検査、合成データを使うVitestテスト、バックエンドのTypeScript検査とNodeテスト、フロントエンドのproduction build、公開パッケージの情報漏えい検査を実行します。これらの検査は実際のOCR、AI、Firebase、会計サービスを呼び出しません。

公開前の追加確認:

```sh
npm audit
npm --prefix functions audit
python3 scripts/export-public-package.py
```

exportコマンドは、パッケージと同じ親ディレクトリにソース専用ZIPとファイルごとのSHA-256 manifestを生成します。依存パッケージ、コンパイル生成物、ローカル設定、Git metadataは含めません。commit、push、リモート作成、公開は実行しません。

手動ブラウザ確認: `npm run dev`で起動し、合成サンプルの読込、PDF表示、セル編集、行追加・削除、履歴の切替、別の請求書が変更されていないこと、仕入／売上CSVのダウンロードを確認します。初期設定のデモでは、ネットワーク通信先をローカル開発originの範囲に保ちます。

日付付きの[検証記録](docs/ja/verification.md)では、実施した確認（ローカルnative PDF描画、独立したルールemulatorを含む）と、未確認のcloud deployment、実際のOCR精度、providerの課金・利用権限、会計ソフトimportを区別しています。型検査・テストの成功は、実サービス統合の成功を示しません。

Java 21以上とFirebase CLIを用意すると、アクセス規則の統合確認を実行できます。

```sh
firebase emulators:exec --only firestore,storage --project demo-invoice-public 'node tests/backend-rules.emulator.cjs'
```

必ず明示したdemo projectを使ってください。このコマンドはローカルの規則を確認するもので、規則をデプロイしません。
