export function serializeOrderItem(item: {
  id: string;
  productId: string;
  qty: number;
  price: number;
  product?: {
    id: string;
    name: string;
    image?: string | null;
    slug?: string | null;
  } | null;
}) {
  return {
    id: item.id,
    product_id: item.productId,
    quantity: item.qty,
    price: Number(item.price),
    product: item.product
      ? {
          id: item.product.id,
          name: item.product.name,
          image: item.product.image ?? null,
          slug: item.product.slug ?? null,
        }
      : null,
  };
}

export function serializeCategory(category: {
  id: string;
  name: string;
  icon?: string | null;
  subcategories?: Array<{
    id: string;
    name: string;
    icon?: string | null;
    subsubcategories?: Array<{ id: string; name: string }>;
  }>;
}) {
  return {
    id: category.id,
    name: category.name,
    icon: category.icon ?? null,
    subcategories: category.subcategories?.map((sub) => ({
      id: sub.id,
      name: sub.name,
      icon: sub.icon ?? null,
      subsubcategories: sub.subsubcategories?.map((ss) => ({
        id: ss.id,
        name: ss.name,
      })),
    })),
  };
}

export function serializeReview(review: {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  comment?: string | null;
  createdAt?: Date;
  user?: {
    id: string;
    name?: string | null;
  } | null;
}) {
  return {
    id: review.id,
    product_id: review.productId,
    user_id: review.userId,
    rating: review.rating,
    comment: review.comment ?? '',
    created_at: review.createdAt ? new Date(review.createdAt).toISOString() : undefined,
    user_name: review.user?.name ?? 'Anonymous',
  };
}
