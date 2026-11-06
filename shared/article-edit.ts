import { z } from 'zod';
import { articleDraftSchema } from './article-publishing.js';

// Reviewing an article is editing it (2026-11-04 user request): the review card is the article's editor. What the
// person changes is saved to the server every few seconds without becoming a version; one person edits at a time.

/** How long an edit lease lasts without a heartbeat, and how often the editor renews it. */
export const ARTICLE_LEASE_MS = 60_000;
export const ARTICLE_LEASE_HEARTBEAT_MS = 20_000;
/** How long after the last change the editor saves. */
export const ARTICLE_AUTOSAVE_MS = 2_000;

/** The whole form being edited (every field, not only the changed ones), as `editArticleDraft` takes a draft. */
export const articleEditFormSchema = articleDraftSchema.pick({
  slug: true,
  status: true,
  locales: true,
  cover: true,
});
export type ArticleEditForm = z.infer<typeof articleEditFormSchema>;

/** The unversioned changes to one version under review. */
export type ArticleEditDraft = {
  /** The version they were made to; ignored once another version is under review. */
  artifactId: string;
  form: ArticleEditForm;
  /** AI rewrites accepted in it so far. */
  ai: number;
  savedAt: string;
  savedBy: string;
  savedByName: string;
};

/** Who holds the article for editing, until when (ISO time). */
export type ArticleEditLease = { userId: string; name: string; until: string };

export type ArticleEditState = {
  lease: ArticleEditLease | null;
  /** Whether the lease is the caller's. */
  mine: boolean;
  draft: ArticleEditDraft | null;
};

export const articleEditInput = z
  .object({
    projectId: z.union([z.string(), z.number()]).transform(String),
    taskId: z.union([z.string(), z.number()]).transform(String),
    /** open takes or renews the lease (a heartbeat), save keeps the form, discard drops it, release lets go. */
    op: z.enum(['open', 'save', 'discard', 'release']),
    artifactId: z.string().min(1).max(200),
    form: articleEditFormSchema.optional(),
    ai: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();
export type ArticleEditInput = z.input<typeof articleEditInput>;

/**
 * How many places of a version AI rewrote and the person changed by hand, and what happened to its cover (2026-11-05),
 * for its Activity line.
 */
export type ArticleEdits = {
  ai: number;
  hand: number;
  cover?: 'added' | 'replaced' | 'removed';
};

/** One rewrite of a selection in the article body, with the turns before it on the same selection. */
export const articleRewriteInput = z
  .object({
    projectId: z.string().regex(/^[1-9]\d{0,15}$/),
    taskId: z.string().regex(/^\d+$/),
    artifactId: z.string().min(1).max(200),
    locale: z.string().min(2).max(20),
    /** The language's whole article as being edited: title, summary and body (Markdown). */
    title: z.string().max(1000).default(''),
    description: z.string().max(5000).default(''),
    body: z.string().max(400_000),
    /** The selected part of the body, as Markdown. */
    selection: z.string().min(1).max(40_000),
    instruction: z.string().trim().min(1).max(2000),
    /** Earlier turns on this selection: what was asked and what came back. */
    history: z
      .array(
        z
          .object({
            instruction: z.string().max(2000),
            result: z.string().max(40_000),
          })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict();
export type ArticleRewriteInput = z.input<typeof articleRewriteInput>;

/**
 * The rewrite streams back as newline-delimited JSON: `{"text": "…"}` for each piece of the replacement as the model
 * writes it, then `{"done": true}`, or `{"error": "…"}` when it stopped.
 */
export type ArticleRewriteEvent =
  { text: string } | { done: true } | { error: string; status?: number };
