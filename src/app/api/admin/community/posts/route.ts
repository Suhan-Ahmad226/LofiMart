import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeCommunityPost(post: any) {
  const likesCount = Number(post.likesCount ?? 0);
  const commentsCount = Number(post.commentsCount ?? 0);
  return {
    id: post.id,
    caption: post.content,
    title: post.title ?? '',
    topic: post.topic || '',
    likes: likesCount,
    comments: commentsCount,
    created_at: post.createdAt ? new Date(post.createdAt).toISOString() : new Date().toISOString(),
    status: post.status,
    moderation_note: post.moderationNote ?? null,
    user: {
      name: post.user?.name ?? 'Community member',
      role: post.user?.role ?? 'customer',
    },
    product: {
      name: post.product?.name ?? 'Community feature',
      category: post.product?.category ?? 'General',
    },
  };
}

function serializeCommunityComment(comment: any) {
  return {
    id: comment.id,
    content: comment.content,
    status: comment.status,
    created_at: comment.createdAt ? new Date(comment.createdAt).toISOString() : new Date().toISOString(),
    moderation_note: comment.moderationNote ?? null,
    post_id: comment.postId,
    post_excerpt: comment.post?.content?.slice(0, 120) ?? '',
    user: {
      name: comment.user?.name ?? 'Community member',
      role: comment.user?.role ?? 'customer',
    },
  };
}

function serializeCommunityReport(report: any) {
  return {
    id: report.id,
    post_id: report.postId,
    reason: report.reason,
    details: report.details ?? null,
    status: report.status,
    created_at: report.createdAt ? new Date(report.createdAt).toISOString() : new Date().toISOString(),
    post_excerpt: report.post?.content?.slice(0, 120) ?? '',
    user: {
      name: report.user?.name ?? 'Community member',
      role: report.user?.role ?? 'customer',
    },
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

  const [posts, comments, reports] = await Promise.all([
    prisma.communityPost.findMany({
      include: {
        user: { select: { id: true, name: true, role: true } },
        product: { select: { id: true, name: true, category: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.communityPostComment.findMany({
      include: {
        user: { select: { id: true, name: true, role: true } },
        post: { select: { id: true, content: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.communityPostReport.findMany({
      include: {
        user: { select: { id: true, name: true, role: true } },
        post: { select: { id: true, content: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return NextResponse.json({
    posts: posts.map(serializeCommunityPost),
    comments: comments.map(serializeCommunityComment),
    reports: reports.map(serializeCommunityReport),
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const postId = String(body.post_id || body.id || '').trim();
  const status = String(body.status || '').trim();

  const allowedStatuses = new Set(['approved', 'hidden', 'rejected']);
  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Invalid post status' }, { status: 400 });
  }

  const note = body.moderation_note ? String(body.moderation_note).trim() : null;

  await prisma.communityPost.update({
    where: { id: postId },
    data: {
      status,
      moderationNote: note,
      moderatedAt: new Date(),
      moderatedById: String(admin.id),
    },
  });

  return NextResponse.json({ success: true });
}
