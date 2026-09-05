# SILICON DRIFT

果てしなく続く、ひとつの電子基板を探索する3D作品です。
**1.1.0 は、スマホ向け修正版を基にした「分離ファイル + GitHub Pages」版です。**

HTML・CSS・JavaScriptを直接編集し、そのまま配信します。単一HTMLへの結合、Viteなどによるコンパイル、CDNやAPIキーは不要です。GitHub Pages用の処理も、公開するファイルをコピーするだけです。

## GitHub Pagesで公開する

対象リポジトリ名は **`SILICON-DRIFT`**、自動デプロイ対象ブランチは **`main`** です。

### 1. リポジトリのルートに配置する

ZIPを解凍し、`SILICON-DRIFT` フォルダの**中身**をリポジトリのルートへ配置します。`.github` など、ドットから始まるファイル・フォルダも含めてください。

```text
SILICON-DRIFT/                 ← Gitリポジトリのルート
├─ index.html
├─ css/
│  ├─ style.css
│  └─ noscript.css
├─ js/
│  ├─ bootstrap.js
│  ├─ math.js
│  ├─ geometry.js
│  ├─ renderer.js
│  ├─ world.js
│  ├─ controls.js
│  └─ app.js
├─ assets/
│  └─ favicon.svg
├─ .github/workflows/
│  └─ deploy-pages.yml
├─ scripts/
│  ├─ site-files.mjs
│  └─ prepare-pages.mjs
├─ tests/
├─ docs/
├─ serve.mjs
├─ package.json
├─ .node-version
├─ .nojekyll
├─ .gitignore
├─ .gitattributes
├─ .editorconfig
└─ README.md
```

`SILICON-DRIFT/SILICON-DRIFT/index.html` のように、リポジトリ内にもう一段フォルダを作らないでください。既存の `.git` はそのまま残します。このZIPにGit履歴・認証情報は含めていません。

### 2. GitHub側を一度だけ設定する

リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。`Deploy from a branch` ではありません。ワークフローは同梱済みなので、GitHub側で別のテンプレートを追加する必要はありません。既にPages用ワークフローがある場合は、二重デプロイにならないよう旧ワークフローを整理してください。

GitHub Actionsの利用がリポジトリ・組織のポリシーで許可されている必要があります。GitHub Pagesを利用できる公開範囲はGitHubのプランによって異なります。サイトには公開してよいデータだけを配置してください。

空のリポジトリでまだPagesを設定できない場合は、先に初回pushを行い、設定後に **Actions → Deploy to GitHub Pages → Run workflow → main** で実行してください。失敗した実行を再実行する方法でも構いません。

### 3. コミットしてpushする

**既存のローカルリポジトリを使う場合**は、`main` ブランチでZIPの中身を配置した後、変更内容を確認して実行します。

```powershell
git status
git diff
git add .
git commit -m "refactor: ソースを分離しGitHub Pagesへの自動デプロイを追加"
git push origin main
```

`git diff` は未追跡のファイル内容を表示しないため、新規ファイルはエディターでも確認してください。既存リポジトリに無関係な変更がある場合は、一括追加せず対象ファイルだけをステージしてください。

**GitHub上のリポジトリが完全に空で、ローカルにもGit履歴がない場合**は、解凍した `SILICON-DRIFT` フォルダで次を実行できます。`YOUR_USERNAME` を自分のGitHubユーザー名に置き換えます。

```powershell
git init -b main
git add .
git commit -m "feat: 無限基板の3DサイトとGitHub Pages自動デプロイを追加"
git remote add origin https://github.com/YOUR_USERNAME/SILICON-DRIFT.git
git push -u origin main
```

GitHub側にREADMEなどのコミットがある場合は、この空リポジトリ向け手順を使わず、既存リポジトリをcloneして中身を配置してください。**force pushは不要です。**

## 自動デプロイの流れ

```text
main への push
  → GitHub Actions 起動
  → Node.jsで自動テスト
  → 公開ファイルを _site/ へコピー
  → GitHub Pages用アーティファクトをアップロード
  → GitHub Pagesへデプロイ
```

commitだけでは発火せず、`main` へのpushで発火します。他のブランチへのpushではデプロイしません。手動実行も用意していますが、`main` 以外からの手動実行はスキップします。テスト失敗時はデプロイ工程へ進みません。

公開先は通常、次の形式です。実際のURLは **Settings → Pages** またはActionsのデプロイ結果から確認してください。

```text
https://YOUR_USERNAME.github.io/SILICON-DRIFT/
```

CSS・JS・アイコンは `./css/...` / `./js/...` / `./assets/...` の相対パスで参照します。`/SILICON-DRIFT/` 配下でもサイトのルートでも、HTMLと各フォルダの相対位置を維持して配信できます。

独自のSecrets、Personal Access Token、`gh-pages` ブランチは、このワークフローには不要です。デプロイジョブに `contents: read`、`pages: write`、`id-token: write` を設定しています。ワークフローがソースコードをコミット・pushすることはありません。

公開するのは `index.html`、`css/`、`js/`、`assets/`、`.nojekyll` だけです。README・テスト・Gitの設定・検証記録はサイト用アーティファクトへ含めません。ただし公開リポジトリにコミットしたファイルは、リポジトリ上では閲覧できます。秘密情報をコミットしないでください。

## ローカルで確認する

Node.js **22以上**が必要です。ワークフローと `.node-version` は **24** を指定しています。外部npmパッケージは不要なので、`npm install` は必要ありません。

```powershell
npm run dev
```

表示されたローカルURLをブラウザで開きます。スマホから確認する場合:

```powershell
node serve.mjs --lan
```

PCとスマホを同じWi-Fiにつなぎ、表示されたPCのネットワークアドレスをSafariなどのブラウザで開きます。スマホ側で `localhost` を入力してもPCにはつながりません。

GitHub Pagesと同じパスで確認する場合:

```powershell
node serve.mjs --lan --base=/SILICON-DRIFT/
```

ポート変更は `--port=8080`、停止は **Ctrl + C** です。`--lan` はサイトをLANから閲覧可能にするため、信頼できるネットワークで使用してください。新しいファイルを追加した場合はサーバーを再起動します。

**この版は `index.html` だけを移動しても動きません。** `css/`・`js/`・`assets/` を一緒に配置してください。HTMLファイルの添付プレビューではなく、HTTP/HTTPSのURLとして開いてください。

## 編集するファイル

| ファイル | 主な役割 |
|---|---|
| `index.html` | 画面の構造・文言・操作パネル |
| `css/style.css` | 配色・レイアウト・レスポンシブ表示 |
| `css/noscript.css` | JavaScript無効時の案内表示 |
| `js/bootstrap.js` | 起動監視・エラー表示・互換モード再試行 |
| `js/math.js` | 行列計算・乱数・ノイズ |
| `js/geometry.js` | 部品用の基本形状 |
| `js/renderer.js` | WebGL 2・ライティング・影・発光 |
| `js/world.js` | 部品配置・配線・区画の生成と破棄 |
| `js/controls.js` | カメラ・マウス・キーボード・タッチ操作 |
| `js/app.js` | 初期化・描画ループ・設定・UI連携 |

JavaScriptは既存の `window.SD` 名前空間を使い、HTML内の `defer` により記述順に読み込みます。ES Modulesやバンドラーへの移行は行っていません。`bootstrap → math → geometry → renderer → world → controls → app` の順を維持してください。

編集したファイルがそのままサイト本体です。別のテンプレートや単一HTMLを作り直す手順はありません。スマホの軽量設定、区画の段階生成、起動監視、互換モード、タッチ操作は前版を引き継いでいます。

## テストと配信用ファイルの確認

```powershell
npm test
npm run package:pages
```

`npm test` はNode.jsだけで実行するテストです。Actionsでも同じテストを実行します。`npm run package:pages` は `_site/` を作り直し、分離した公開ファイルをコピーします。HTML・CSS・JSの結合や変換は行いません。生成される `_site/` は `.gitignore` で除外しています。

任意のブラウザテストにはPython・Playwright・Chromiumを別途用意します。

```powershell
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/browser.test.py
```

通常は同梱サーバーを自動起動し、`/SILICON-DRIFT/` をブラウザで開きます。`CHROMIUM_PATH` でブラウザの実行ファイルを指定できます。出力は `test-results/` です。ブラウザテストは今回のデプロイワークフローには含めていません。

この配布物で実際に確認した環境と制約は [docs/VERIFICATION.md](docs/VERIFICATION.md) に記載しています。iPhone実機のSafariやGitHub上でのデプロイ成功を、ローカル検証だけで保証するものではありません。

## 動かないとき

読み込み画面に「JavaScript の起動待ち」が残る場合は、開き方と `js/` の配置を確認してください。起動途中のエラーは画面内に診断を表示します。「互換モードで再試行」、またはURLの `?safe=1` で軽量設定にできます。すでにクエリがあるURLには `&safe=1` を追加します。互換モードでもWebGL 2が必要です。

GitHub Pagesで失敗する場合は、SourceがGitHub Actionsになっているか、ブランチ名が `main` か、`.github/workflows/deploy-pages.yml` がリポジトリのルート基準で配置されているかを確認します。Actionsタブの失敗した工程に詳細が表示されます。組織のActions許可設定や `github-pages` 環境の承認ルールがある場合は、その設定も確認してください。

## 参考資料

GitHub公式ドキュメント（設定の確認に使用）:

- [GitHub Pagesのカスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Pagesの公開元設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [actions/deploy-pages](https://github.com/actions/deploy-pages)

この作品は鑑賞用の生成アートです。電子回路の電気的動作を再現するシミュレーターではありません。
