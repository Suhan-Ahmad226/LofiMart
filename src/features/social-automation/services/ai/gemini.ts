import type {
  GenerateSocialCaptionResult,
  SocialCaptionProduct,
  SocialCaptionProvider,
  SocialCaptionSettings,
} from './types';
import { buildCaptionPrompt } from './prompt';

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export function createGeminiCaptionProvider(): SocialCaptionProvider {
  return {
    async generate(
      product: SocialCaptionProduct,
      settings: SocialCaptionSettings,
    ): Promise<GenerateSocialCaptionResult> {
      if (!settings.aiCaptionEnabled) {
        return {
          ok: false,
          code: 'AI_DISABLED',
          message: 'AI caption generation is disabled for this seller.',
        };
      }

      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        return {
          ok: false,
          code: 'AI_NOT_CONFIGURED',
          message: 'AI provider is not configured.',
        };
      }

      try {
        const response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: buildCaptionPrompt(product, settings) }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 512,
              },
            }),
          },
        );

        if (!response.ok) {
          return {
            ok: false,
            code: 'AI_PROVIDER_ERROR',
            message: 'AI caption service is temporarily unavailable.',
          };
        }

        const data = (await response.json()) as GeminiResponse;
        const caption = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
        if (!caption) {
          return {
            ok: false,
            code: 'AI_EMPTY_RESPONSE',
            message: 'AI caption service returned an empty result.',
          };
        }

        return { ok: true, caption };
      } catch {
        return {
          ok: false,
          code: 'AI_PROVIDER_ERROR',
          message: 'AI caption service is temporarily unavailable.',
        };
      }
    },
  };
}
