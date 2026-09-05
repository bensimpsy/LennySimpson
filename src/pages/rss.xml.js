import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = await getCollection('blog');
  return rss({
    title: "LennySimpson — Build log",
    description: "Games and experiments by Lenny.",
    site: context.site ?? 'https://lennysimpson.pages.dev',
    items: posts.map((p) => ({
      title: p.data.title,
      pubDate: p.data.date,
      description: p.data.description ?? '',
      link: `/blog/${p.slug}/`,
    })),
  });
}
