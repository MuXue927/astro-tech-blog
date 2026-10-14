import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { SITE } from "@/config";

export const POSTS_PATH = "src/content/posts";

const posts = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: `./${POSTS_PATH}` }),
  schema: ({ image }) =>
    z.object({
      author: z.string().default(SITE.author),
      title: z.string().trim().min(1),
      date: z.coerce.date(),
      description: z.string().trim().min(1),
      tags: z.array(z.string().trim().min(1)).min(1),
      updatedDate: z.coerce.date().optional().nullable(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      ogImage: image().or(z.string()).optional(),
      canonicalURL: z.string().optional(),
      hideEditPost: z.boolean().optional(),
      timezone: z.string().optional(),
    }),
});

export const collections = { posts };
