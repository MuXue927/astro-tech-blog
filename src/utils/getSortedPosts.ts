import type { CollectionEntry } from "astro:content";
import postFilter from "./postFilter";

const getSortedPosts = (posts: CollectionEntry<"posts">[]) => {
  return posts
    .filter(postFilter)
    .sort(
      (a, b) =>
        Math.floor(
          new Date(b.data.updatedDate ?? b.data.date).getTime() / 1000
        ) -
        Math.floor(new Date(a.data.updatedDate ?? a.data.date).getTime() / 1000)
    );
};

export default getSortedPosts;
