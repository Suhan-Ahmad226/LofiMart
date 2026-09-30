export type SocialCaptionProduct = {
  name: string;
  description: string | null;
  price: number;
  oldPrice: number | null;
  stock: number;
  category: string | null;
  available: boolean;
  sellerStoreName: string | null;
};

export type SocialCaptionSettings = {
  language: string;
  tone: string;
  captionLength: string;
  hashtags: string;
  ctaEnabled: boolean;
  aiCaptionEnabled: boolean;
};

export type GenerateSocialCaptionResult =
  | { ok: true; caption: string }
  | {
      ok: false;
      code: 'AI_DISABLED' | 'AI_NOT_CONFIGURED' | 'AI_PROVIDER_ERROR' | 'AI_EMPTY_RESPONSE';
      message: string;
    };

export type SocialCaptionProvider = {
  generate: (
    product: SocialCaptionProduct,
    settings: SocialCaptionSettings,
  ) => Promise<GenerateSocialCaptionResult>;
};
