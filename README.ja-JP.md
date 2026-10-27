<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/public/assets/nocoreach-mark.svg" width="72" alt="NocoReach">
</p>

<h1 align="center">NocoReach</h1>

<p align="center"><strong>AI が成長の機会を見つけ、エージェントが実行します。</strong></p>

<p align="center">AI グロース運用プラットフォーム · NocoBase Core で構築</p>

<p align="center">
  <a href="https://solutions.nocobase.com/reach/"><strong>オンラインで試す</strong></a> · <a href="https://www.nocobase.com/solution-reach/">Web サイト</a> · <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>日本語</strong>
</p>

https://github.com/user-attachments/assets/7fa9af94-3ce1-4918-841e-07cb9e6869e1

NocoReach は AI グロース運用プラットフォームです。検索や AI 検索からコミュニティ、競合まで 20 以上のデータソースに接続し、取り組む価値のあることを毎日見つけて、エージェントに任せます。変更はすべてあなたがレビューします。

| ステップ                | 内容                                                                      |
| ----------------------- | ------------------------------------------------------------------------- |
| 1. データを一か所に     | Web サイト、検索、AI 検索、コミュニティ、競合を毎日同期                   |
| 2. 毎日の分析           | AI がその日の変化を一件ずつ判断し、取り組む価値のあるものを改善機会にする |
| 3. エージェントに任せる | 確認すれば、複数のタスクが同時に進む                                      |
| 4. あなたがレビュー     | 記事やページの変更は、承認してから公開                                    |
| 5. 効果の比較           | 公開から 7 日後と 28 日後に自動で比較                                     |

![インサイト：毎日の分析と、今日判断が必要なこと](https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/insights-en.webp)

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
