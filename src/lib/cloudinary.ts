type CloudinaryImageOptions = {
  width?: number;
  height?: number;
  quality?: 'auto' | 'auto:good' | 'auto:best' | 'auto:eco';
  fit?: 'limit' | 'fill' | 'pad' | 'scale';
  extraTransforms?: string[];
};

function isCloudinaryUrl(url: string) {
  return /res\.cloudinary\.com\/.+\/image\/upload\//i.test(url);
}

export function getOptimizedCloudinaryImage(
  url: string | null | undefined,
  options: CloudinaryImageOptions = {},
) {
  if (!url) {
    return '';
  }

  if (!isCloudinaryUrl(url)) {
    return url;
  }

  const width = options.width ? `w_${Math.round(options.width)}` : '';
  const height = options.height ? `h_${Math.round(options.height)}` : '';
  const fit = options.fit ? `c_${options.fit}` : 'c_limit';
  const quality = options.quality || 'auto:good';
  const transforms = ['f_auto', 'dpr_auto', `q_${quality}`, fit, width, height, ...(options.extraTransforms || [])]
    .filter(Boolean)
    .join(',');

  return url.replace('/image/upload/', `/image/upload/${transforms}/`);
}

export function getBlurPlaceholderImage(url: string | null | undefined, width = 48, height = 48) {
  return getOptimizedCloudinaryImage(url, {
    width,
    height,
    fit: 'fill',
    quality: 'auto:eco',
    extraTransforms: ['e_blur:900', 'w_48', 'h_48'],
  });
}
