# 営業資料・サイン棚

GitHubで管理し、Vercelで公開し、Supabaseに資料データを同期できる構成です。

## 構成

- `index.html`: 画面の土台
- `src/styles.css`: 見た目
- `src/app.js`: 画面操作と保存処理
- `api/config.js`: Vercel環境変数を画面へ渡すAPI
- `supabase/schema.sql`: Supabaseに作成するテーブルとポリシー
- `vercel.json`: Vercel公開用設定

## Supabase設定

SupabaseのSQL Editorで `supabase/schema.sql` を実行してください。

その後、VercelのProject Settings > Environment Variables に以下を登録します。

- `SUPABASE_URL`: Supabase Project URL
- `SUPABASE_ANON_KEY`: Supabase anon public key

環境変数がない場合でも、アプリは端末内保存で動きます。環境変数がある場合は、端末内保存に加えてSupabaseへ同期します。

## GitHubからVercelへ公開

1. このフォルダをGitHubリポジトリに push
2. VercelでそのリポジトリをImport
3. Framework PresetはOtherのままでOK
4. Environment VariablesにSupabaseの値を登録
5. Deploy

## ローカル確認

Node.jsが使える環境では以下で確認できます。

```bash
npm run dev
```

表示URLは `http://127.0.0.1:4173` です。

## 注意

現在の互換構成では、PDFや画像は既存アプリと同じくデータURLとして保存します。大きなファイルを多く扱う場合は、次の段階でSupabase Storageへファイル本体を分ける構成にすると安定します。

`supabase/schema.sql` は初期導入しやすいように、匿名キーで読み書きできるポリシーにしています。公開URLを社外や不特定多数に共有する場合は、Supabase Authを入れて利用者を制限してください。
