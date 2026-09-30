import type { SocialCaptionProduct, SocialCaptionSettings } from './types';

function formatPrice(value: number | null | undefined) {
  return value == null ? 'Not provided' : `BDT ${Number(value).toFixed(2)}`;
}

export function buildCaptionPrompt(
  product: SocialCaptionProduct,
  settings: SocialCaptionSettings,
): string {
  const stockStatement = product.available
    ? `${product.stock} units currently available`
    : 'Currently out of stock';
  const discountStatement =
    product.oldPrice != null && product.oldPrice > product.price
      ? `Original price: ${formatPrice(product.oldPrice)}`
      : 'No original price was provided';

  return [
    'Write one Facebook product caption. Use only the product facts supplied below.',
    'Do not invent or change prices, discounts, warranties, delivery promises, specifications, stock, availability, or seller information.',
    'If a fact is not supplied, omit it rather than guessing.',
    '',
    `Product name: ${product.name}`,
    `Product description: ${product.description || 'No description provided'}`,
    `Current price: ${formatPrice(product.price)}`,
    discountStatement,
    `Availability: ${stockStatement}`,
    `Category: ${product.category || 'Not provided'}`,
    `Seller or store: ${product.sellerStoreName || 'Not provided'}`,
    '',
    `Language preference: ${settings.language || 'Bangla + English'}`,
    `Tone: ${settings.tone || 'Friendly'}`,
    `Caption length: ${settings.captionLength || 'Medium'}`,
    settings.hashtags === 'Disabled'
      ? 'Do not include hashtags.'
      : 'Include relevant hashtags only when they are supported by the supplied product information.',
    settings.ctaEnabled
      ? 'Include a clear call-to-action without promising delivery, stock, warranties, or discounts that were not supplied.'
      : 'Do not include a call-to-action.',
    '',
    'Return only the caption text. Do not include markdown, headings, quotation marks, or an explanation.',
  ].join('\n');
}
