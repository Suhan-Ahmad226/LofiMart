import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../../_compat/shared';
import { associateEntityMedia, collectEntityMedia, deleteManyMedia, enqueueMediaDelete } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeBlogPost(post: any) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? '',
    category: post.category ?? '',
    content: post.content,
    image: post.image ?? '',
    seo_title: post.seoTitle ?? '',
    seo_description: post.seoDescription ?? '',
    author_id: post.authorId,
    author_name: post.author?.name ?? '',
  };
}

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if ('title' in body) data.title = String(body.title || '').trim();
  if ('slug' in body) data.slug = String(body.slug || '').trim();
  if ('excerpt' in body) data.excerpt = body.excerpt ? String(body.excerpt) : null;
  if ('category' in body) data.category = body.category ? String(body.category).trim() : null;
  if ('content' in body) data.content = String(body.content || '');
  if ('image' in body) data.image = body.image ? String(body.image) : null;
  if ('seoTitle' in body) data.seoTitle = body.seoTitle ? String(body.seoTitle).trim() : null;
  if ('seoDescription' in body) data.seoDescription = body.seoDescription ? String(body.seoDescription).trim() : null;

  if (('title' in data && data.title === '') || ('slug' in data && data.slug === '')) {
    return NextResponse.json({ error: 'Title and slug cannot be empty' }, { status: 400 });
  }

  try {
    const current = await prisma.blogPost.findUnique({ where: { id }, select: { image: true } });
    const post = await prisma.blogPost.update({
      where: { id },
      data,
      include: {
        author: { select: { name: true } },
      },
    });

    await associateEntityMedia({ ownerId: String(admin.id), entityType: 'BlogPost', entityId: post.id, fieldName: 'image', urls: [post.image] });
    if (current?.image && current.image !== post.image) {
      const cleanup = await deleteManyMedia([{ url: current.image }]);
      await Promise.all(cleanup.errors.map((failed) => enqueueMediaDelete({ publicId: failed.item.publicId, url: failed.item.url, resourceType: failed.item.resourceType, reason: 'blog-replaced-old-asset' })));
    }

    return NextResponse.json(serializeBlogPost(post));
  } catch (error) {
    console.error('PATCH /api/admin/blog/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update blog post' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;

  try {
    const current = await prisma.blogPost.findUnique({ where: { id }, select: { image: true } });
    const media = await collectEntityMedia('BlogPost', id, [current?.image]);
    await prisma.blogPost.delete({ where: { id } });
    const cleanup = await deleteManyMedia(media);
    await Promise.all(cleanup.errors.map((failed) => enqueueMediaDelete({ publicId: failed.item.publicId, url: failed.item.url, resourceType: failed.item.resourceType, reason: 'blog-deleted', entityType: 'BlogPost', entityId: id })));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/admin/blog/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete blog post' }, { status: 500 });
  }
}
