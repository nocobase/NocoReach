# NocoReach article API

A small HTTP protocol a website or CMS implements so NocoReach can publish articles to it safely (target kind `http`, see [ARTICLE-PUBLISHING.md](ARTICLE-PUBLISHING.md)). The base URL is configured per target, for example `https://cms.example.com/nocoreach`; it must use HTTPS.

## Authentication

Every request carries `Authorization: Bearer <key>`, the key the administrator saved with the target. Answer `401` or `403` when it is not valid.

## Article

```json
{
  "id": "a1",
  "slug": "hello-world",
  "status": "published",
  "version": "2026-10-18T08:00:00.000Z",
  "locales": {
    "en": {
      "title": "Hello",
      "description": "Summary",
      "body": "# Hello\n\nMarkdown body"
    },
    "zh": { "title": "你好", "description": "摘要", "body": "# 你好\n\n正文" }
  },
  "cover": "https://cdn.example.com/covers/hello.png"
}
```

- `id` is stable; `slug` may change only if your system supports it.
- `version` is opaque and must change on every change to the article, whoever makes it.
- `status` is `draft` or `published` (optional).
- Locale keys are the target's configured languages. Bodies are Markdown.
- `cover` is the article's cover image address, or `null` (optional; only for a site that declares covers, see Capabilities). A site with a cover per language puts it inside each language instead: `"locales": { "en": { …, "cover": "…" } }`.

Responses wrap results in `{ "data": … }`; errors are `{ "error": { "code": "…" } }`.

## Endpoints

| Request                             | Purpose                              | Response                                                                                 |
| ----------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `GET /articles?q=<text>&limit=<n>`  | Search by title or slug (at most 50) | `{ data: [{ id, slug, title, status?, updatedAt? }] }`                                   |
| `GET /articles?slug=<slug>&limit=2` | Find by slug                         | same list; at most one entry may match                                                   |
| `GET /articles/{id}`                | Read one article                     | `{ data: Article }`, or `404`                                                            |
| `POST /articles`                    | Create                               | `201 { data: Article }`; `409 { error: { code: "slug_taken" } }`                         |
| `PATCH /articles/{id}`              | Update                               | `200 { data: Article }`; `409 { error: { code: "version_conflict", current: Article } }` |
| `GET /capabilities`                 | Optional: what the site supports     | `{ data: { cover?: Cover } }`, or `404` for none                                         |
| `POST /images`                      | Optional: take a cover image         | `201 { data: { url } }`                                                                  |

### Create

Body: `{ slug, status?, locales, cover? }`. Header `Idempotency-Key: <key>`: a repeated request with the same key returns the article created the first time, without creating another.

### Update

Body: `{ baseVersion, slug?, status?, locales, cover? }`. `locales` contains only the fields to change; absent locales and fields keep their values, and an absent `cover` keeps the cover (`null` removes it). Header `Idempotency-Key` as for create.

**Apply the update only if the article's current `version` equals `baseVersion`, atomically** (for example `UPDATE … WHERE id = ? AND version = ?`). Otherwise answer `409` with `version_conflict` and the current article. This check is what lets NocoReach guarantee it never overwrites a change someone else made after its draft was based.

### Capabilities

A site that keeps covers answers `GET /capabilities` with `{ "data": { "cover": { "ratio": "16:9", "minWidth": 1200, "required": false, "perLocale": false } } }`. Every member of `cover` is optional: `ratio` is `W:H` (absent means any), `minWidth` the narrowest width in pixels, `required` whether a new published article must have one, `perLocale` whether each language has its own cover. NocoReach reads it when the target is connected and on each Test connection; an administrator can adjust what it read. A `404`, or no `cover`, means the site takes no covers, and NocoReach never sends one.

### Images

`POST /images` takes a cover as multipart form data (`file`) with an `Idempotency-Key` header, and answers `201 { data: { url } }`: the address the article's `cover` is then set to. A repeated request with the same key returns the same address. NocoReach uploads a cover only when the article changes it, before the create or update that sets it.

## Errors

| Status        | Meaning                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| `400` / `422` | The request is invalid (unknown locale or field)                                         |
| `401` / `403` | The key is not valid                                                                     |
| `404`         | No such article                                                                          |
| `409`         | `version_conflict` or `slug_taken`                                                       |
| `5xx`         | NocoReach treats the outcome of a write as unknown and reads the article before retrying |
