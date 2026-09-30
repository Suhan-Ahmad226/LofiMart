import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../_compat/shared';
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
    created_at: post.createdAt ? new Date(post.createdAt).toISOString() : undefined,
    updated_at: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
  };
}

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const posts = await prisma.blogPost.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { name: true } },
    },
  });

  return NextResponse.json(posts.map(serializeBlogPost));
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const slug = String(body.slug || '').trim();

  if (!title || !slug) {
    return NextResponse.json({ error: 'Title and slug are required' }, { status: 400 });
  }

  const post = await prisma.blogPost.create({
    data: {
      title,
      slug,
      excerpt: body.excerpt ? String(body.excerpt) : null,
      category: body.category ? String(body.category).trim() : null,
      content: String(body.content || ''),
      image: body.image ? String(body.image) : null,
      seoTitle: body.seo_title ? String(body.seo_title) : null,
      seoDescription: body.seo_description ? String(body.seo_description) : null,
      authorId: String(admin.id),
    },
    include: {
      author: { select: { name: true } },
    },
  });

  await associateEntityMedia({ ownerId: String(admin.id), entityType: 'BlogPost', entityId: post.id, fieldName: 'image', urls: [post.image] });

  return NextResponse.json(serializeBlogPost(post), { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '').trim();

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if ('title' in body) data.title = String(body.title || '').trim();
  if ('slug' in body) data.slug = String(body.slug || '').trim();
  if ('excerpt' in body) data.excerpt = body.excerpt ? String(body.excerpt) : null;
  if ('category' in body) data.category = body.category ? String(body.category).trim() : null;
  if ('content' in body) data.content = String(body.content || '');
  if ('image' in body) data.image = body.image ? String(body.image) : null;
  if ('seoTitle' in body) data.seoTitle = body.seoTitle ? String(body.seoTitle).trim() : null;
  if ('seoDescription' in body) data.seoDescription = body.seoDescription ? String(body.seoDescription).trim() : null;

  if (data.title === '' || data.slug === '') {
    return NextResponse.json({ error: 'Title and slug cannot be empty' }, { status: 400 });
  }

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
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '').trim();

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  const current = await prisma.blogPost.findUnique({ where: { id }, select: { image: true } });
  const media = await collectEntityMedia('BlogPost', id, [current?.image]);
  await prisma.blogPost.delete({ where: { id } });
  const cleanup = await deleteManyMedia(media);
  await Promise.all(cleanup.errors.map((failed) => enqueueMediaDelete({ publicId: failed.item.publicId, url: failed.item.url, resourceType: failed.item.resourceType, reason: 'blog-deleted', entityType: 'BlogPost', entityId: id })));

  return NextResponse.json({ success: true });
}
