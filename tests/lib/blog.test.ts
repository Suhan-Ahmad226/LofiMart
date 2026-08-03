import { describe, it, expect } from 'vitest';
import { formatBlogDate, decorateBlogPost, type BlogPost } from '@/lib/blog';

describe('formatBlogDate', () => {
  it('returns "Recently updated" for undefined', () => {
    expect(formatBlogDate()).toBe('Recently updated');
  });

  it('returns "Recently updated" for invalid date', () => {
    expect(formatBlogDate('not-a-date')).toBe('Recently updated');
  });

  it('formats a valid date string', () => {
    const result = formatBlogDate('2025-01-15');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('Recently updated');
  });
});

describe('decorateBlogPost', () => {
  it('adds category, excerpt, and minutes to a blog post', () => {
    const post: BlogPost = {
      id: 1,
      title: 'Test Post',
      content: 'This is test content with enough words to calculate read time properly across multiple sentences and paragraphs.',
      author: 'Test Author',
      publishedAt: '2025-01-15',
      imageUrl: 'https://example.com/img.jpg',
      slug: 'test-post',
    };

    const decorated = decorateBlogPost(post);
    expect(decorated.title).toBe('Test Post');
    expect(typeof decorated.category).toBe('string');
    expect(typeof decorated.excerpt).toBe('string');
    expect(typeof decorated.minutes).toBe('number');
    expect(decorated.minutes).toBeGreaterThanOrEqual(1);
  });

  it('handles posts without content', () => {
    const post: BlogPost = {
      id: 2,
      title: 'Empty Post',
      content: '',
      author: 'Author',
      publishedAt: '2025-01-01',
      imageUrl: 'https://example.com/img.jpg',
      slug: 'empty',
    };

    const decorated = decorateBlogPost(post);
    expect(decorated.minutes).toBe(1);
  });
});
