import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const entries = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/entries' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tag: z.enum(['shipped', 'wip', 'writing', 'note', 'release']),
    pinned: z.boolean().optional().default(false),
    link: z.string().url().optional(),
  }),
});

export const collections = { entries };
