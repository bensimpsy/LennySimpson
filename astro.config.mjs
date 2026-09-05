import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// Add integrations as needed (e.g., mdx) - can remove if not wanted.
export default defineConfig({
  site: 'https://lenny-simpson.pages.dev', // TODO: replace with real Pages URL / custom domain
  output: 'static', // Cloudflare Pages serves dist/ directly, no adapter needed
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true
    }
  }
});
