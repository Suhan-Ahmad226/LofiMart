import type {
  GenerateSocialCaptionResult,
  SocialCaptionProduct,
  SocialCaptionSettings,
} from './ai/types';
import { createGeminiCaptionProvider } from './ai/gemini';

const provider = createGeminiCaptionProvider();

export type {
  GenerateSocialCaptionResult,
  SocialCaptionProduct,
  SocialCaptionSettings,
} from './ai/types';

export async function generateSocialCaption(
  product: SocialCaptionProduct,
  settings: SocialCaptionSettings,
): Promise<GenerateSocialCaptionResult> {
  return provider.generate(product, settings);
}
