# Astro content loader for ATProto Standard Site documents

A very basic content loader for [Astro](https://astro.build/) sites, to fully embed your posts from the likes of pckt.blog, leaflet.pub, etc on your Astro site.

Install as you would any other dependency (it's on npm and jsr). Then add it as a loader for a collection in `content.config.ts` like so:

```ts
import { defineCollection } from "astro:content";
import { standardSiteLoader } from "@dylmye/atproto-standard-site-astro-loader";

const blogPosts = defineCollection({
 loader: standardSiteLoader({
  didUri: "did:plc:mydidgoeshere",
  // collectionName: "some-custom-collection-name", (optional)
  // serviceBaseUrl: "https://some-url.example" (use if PDS isn't bsky.social)
  // limit: 57 (optional, any # 1-100 inclusive, if you only want the first X posts)
  // fetchAll: false (optional) 
 }),
});

export const collections = { blogPosts };
```

(Don't know your DID? Find it here: [https://ilo.so/bluesky-did])

Currently only supports [build-time content collections](https://docs.astro.build/en/guides/content-collections/#defining-build-time-content-collections).

> This tool is not yet stable. at all. have fun and report issues :)

Rough to-do, any feature requests are welcome too:

- [] converting from standard.site doc facets to HTML instead of making the consumer figure it out
- [] ensure full support for pckt.blog facets
- [] ensure full support for leaflet.pub facets
- [] ensure full support for sequoia.pub facets
- [] ensure full support for greengale.app facets
- [] ensure full support for offprint.app facets
- [] optional filter by publication
- [] live content loader
- [] consumer friendly instructions
- [] resolve usernames to DIDs for people who aren't weird
