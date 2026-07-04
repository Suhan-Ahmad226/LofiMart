export interface ProductVariantValue {
  label: string;
  price_adjustment?: number;
  stock_override?: number | null;
  sku_suffix?: string | null;
}

export interface ProductVariantOption {
  name: string;
  values: ProductVariantValue[];
}

export interface ProductSpecification {
  label: string;
  value: string;
}

export interface Product {
  id: number;
  sku?: string | null;
  name: string;
  slug: string;
  description: string;
  price: number;
  old_price: number;
  image: string | null;
  gallery_images?: string[];
  video_url?: string | null;
  model_3d?: string;
  category: string;
  stock: number;
  rating: number;
  reviews_count: number;
  variant_options?: ProductVariantOption[];
  specifications?: ProductSpecification[];
  reseller_enabled?: boolean;
  reseller_base_price?: number | null;
  reseller_suggested_price?: number | null;
  reseller_notes?: string | null;
  product_status?: 'draft' | 'published';
  is_published?: boolean;
  published_at?: string | null;
  reseller_ref_code?: string;
  reseller_sale_price?: number | null;
  selected_variant_key?: string;
  selected_variant_summary?: string;
  selected_variant_sku?: string;
  seller_id?: number;
  seller_name?: string;
  store_name?: string | null;
  seller_rating?: number | null;
  response_time_hours?: number | null;
  verification_badge?: boolean;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  alternate_phone?: string | null;
  role: 'customer' | 'seller' | 'reseller' | 'admin';
  store_name?: string | null;
  storefront_slug?: string | null;
  storefront_banner_url?: string | null;
  storefront_headline?: string | null;
  seller_status?: 'draft' | 'pending_review' | 'under_review' | 'approved' | 'rejected' | 'suspended';
}
