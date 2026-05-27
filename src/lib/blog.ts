export type BlogPost = {
  id: string | number;
  title: string;
  slug?: string;
  excerpt?: string;
  category?: string;
  content: string;
  image?: string;
  seo_title?: string;
  seo_description?: string;
  author_name?: string;
  created_at?: string;
};

export type DecoratedBlogPost = BlogPost & {
  category: string;
  excerpt: string;
  minutes: number;
};

export const fallbackPosts: BlogPost[] = [];

export function formatBlogDate(value?: string) {
  if (!value) {
    return 'Recently updated';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently updated';
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getBlogReadTime(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

export function getBlogCategory(post: BlogPost) {
  if (post.category?.trim()) {
    return post.category.trim();
  }

  const source = `${post.title} ${post.content}`.toLowerCase();

  if (source.includes('resell') || source.includes('seller') || source.includes('profit')) {
    return 'Business';
  }

  if (source.includes('fashion') || source.includes('style') || source.includes('wardrobe')) {
    return 'Lifestyle';
  }

  if (source.includes('ai') || source.includes('technology') || source.includes('commerce')) {
    return 'Technology';
  }

  return 'Insights';
}

export function getBlogExcerpt(content: string, maxLength = 150) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

export function decorateBlogPost(post: BlogPost): DecoratedBlogPost {
  return {
    ...post,
    category: getBlogCategory(post),
    excerpt: post.excerpt?.trim() || getBlogExcerpt(post.content),
    minutes: getBlogReadTime(post.content),
  };
}
