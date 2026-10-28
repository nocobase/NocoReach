<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/public/assets/nocoreach-mark.svg" width="72" alt="NocoReach">
</p>

<h1 align="center">NocoReach</h1>

<p align="center"><strong>AI が成長の機会を見つけ、エージェントが実行します。</strong></p>

<p align="center">AI グロース運用プラットフォーム · NocoBase Core で構築</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoReach/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoReach?label=version&sort=semver" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase%20Core-1f6feb" alt="Built on NocoBase Core"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/reach/"><strong>オンラインで試す</strong></a> · <a href="https://www.nocobase.com/solution-reach/">Web サイト</a> · <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>日本語</strong>
</p>

https://github.com/user-attachments/assets/7fa9af94-3ce1-4918-841e-07cb9e6869e1

NocoReach は AI グロース運用プラットフォームです。検索や AI 検索からコミュニティ、競合まで 20 以上のデータソースに接続し、すべてのデータの変化を毎日自動で分析して、データに潜む機会を見つけます。取り組む価値のあるマーケティング施策はエージェントに任せ、変更はあなたがレビューし、公開後は効果を自動で比較します。

## 特長

- **ワンストップ**：キーワード調査、データの確認、エージェントへの執筆依頼、レビューと公開、効果の比較まで、ひとつのシステムで完結します。推奨やマーケティング提案は接続したすべてのデータに基づくため、より的確です。
- **22 のデータソースを一か所に**：GA4、Search Console、キーワードと順位、Google Trends、競合、AI検索（ChatGPT、Google AI Overviews）、GitHub、npm / PyPI / Docker Hub、Discourse、Discord、Slack、Reddit、Hacker News、X、YouTube。足りないデータソースは Coding Agent に開発させられます。
- **毎日の分析**：44 個の内蔵ルールで変化を見つけ、AI が一件ずつ判断します（対応推奨、経過観察、対応不要）。取り組む価値のあるマーケティング施策は、根拠付きの改善機会になります。ルールの調整は AI が手伝います。各ルールが最近見つけた変化をもとに AI が変更を提案し、確認すると反映されるので、ルールを実際のニーズに合わせられます。
- **エージェントによる実行**：Claude Code や Codex などのコーディングエージェントが、Runner を通じてあなたのパソコンやサーバー上で動き、複数のタスクを並行して進めます。調査、コンテンツ作成、コンテンツ改善、技術的な修正をカバーする 12 個のプレイブックを内蔵し、編集も AI による新規作成もできます。
- **人によるレビュー**：記事は読者が見るとおりにプレビューし、ページの変更は変更前後を表示します。承認するまで公開されません。
- **効果の比較**：公開から 7 日後と 28 日後に、変更したページの検索クリック数とページビューを自動で比較します。
- **カスタマイズ**：スキル（標準の SKILL.md 形式）、ナレッジ、分析ルール、プレイブックはチームに合わせて変えられます。ソースコードが公開されているので、Coding Agent に必要な部分をカスタマイズさせられます。
- **セルフホスト**：データは自分のサーバーに保存され、モデルとエージェントは自由に選べます。Apache-2.0 ライセンス。

## スクリーンショット

<table>
  <tr>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/insights-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/insights-en-thumb.webp" width="240" alt="インサイト"></a><br><b>インサイト</b><br><sub>毎日の分析が、その日の変化を一件ずつ判断</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/opportunities-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/opportunities-en-thumb.webp" width="240" alt="改善機会"></a><br><b>改善機会</b><br><sub>すべてに根拠があり、ワンクリックでエージェントへ</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/tasks-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/tasks-en-thumb.webp" width="240" alt="タスク"></a><br><b>タスク</b><br><sub>複数のタスクが並行して進む</sub></td>
  </tr>
  <tr>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/traffic-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/traffic-en-thumb.webp" width="240" alt="トラフィック"></a><br><b>トラフィック</b><br><sub>GA4 の訪問、流入元、キーイベント</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/keywords-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/keywords-en-thumb.webp" width="240" alt="キーワード"></a><br><b>キーワード</b><br><sub>選んでエージェントに任せる</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/aisearch-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/aisearch-en-thumb.webp" width="240" alt="AI検索"></a><br><b>AI検索</b><br><sub>他社は出てくるのに自社は出てこない質問をエージェントへ</sub></td>
  </tr>
</table>

その他のページ：

- **データ**：ページ、サイト監査、パフォーマンス、トレンド、競合、GitHub、ダウンロード、フォーラム、Hacker News、Reddit、X、Discord、Slack、YouTube
- **運用**：成果、プレイブック、スキル、ナレッジ、分析ルール、エージェント、メンバー & ロール、データソース

## はじめに

まず見てみたい場合は、[オンラインで試す](https://solutions.nocobase.com/reach/)ことができます。デモアカウントで自動的にサインインし、データはすべて架空です。

自分のパソコンで動かすには、Node.js 24 と pnpm が必要です。

```bash
git clone https://github.com/nocobase/nocoreach.git
cd nocoreach
pnpm install
pnpm nocobase config init
pnpm dev
```

ターミナルに表示されたアドレスを開き、`config.yml` の初期管理者アカウントでサインインします。プロジェクトを作成したら、「設定 › データソース」でデータを接続します。本番環境へのデプロイは[ビルドとデプロイ](docs/APP-TEMPLATE.md)を参照してください。

## ライセンス

NocoReach は NocoBase Core で構築されており、[Apache-2.0](LICENSE) ライセンスで公開しています。
