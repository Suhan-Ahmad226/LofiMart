import React, { useRef, useState } from 'react';
import { Check, Image as ImageIcon, Link2, Loader2, UploadCloud } from 'lucide-react';

interface Props {
  onUploaded: (url: string) => void;
  label?: string;
  helper?: string;
}

type CloudinarySignatureResponse = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  error?: string;
};

type CloudinaryUploadSuccess = {
  event: 'success';
  info: {
    secure_url: string;
  };
};

type CloudinaryUploadResult = CloudinaryUploadSuccess | { event?: string; info?: unknown };

type CloudinaryWidgetInstance = {
  open: () => void;
};

type CloudinaryWidgetApi = {
  createUploadWidget: (
    options: Record<string, unknown>,
    callback: (error: { message?: string } | null, result: CloudinaryUploadResult) => void,
  ) => CloudinaryWidgetInstance;
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const TARGET_UPLOAD_BYTES = Math.round(1.2 * 1024 * 1024);
const DEFAULT_WEBP_QUALITY = 0.86;
const MIN_WEBP_QUALITY = 0.72;
const ALLOWED_FILE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

function isCloudinaryUploadSuccess(result: CloudinaryUploadResult): result is CloudinaryUploadSuccess {
  if (result.event !== 'success' || typeof result.info !== 'object' || result.info === null) {
    return false;
  }

  return 'secure_url' in result.info && typeof result.info.secure_url === 'string';
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File) {
  if (!ALLOWED_FILE_TYPES.has(file.type)) {
    throw new Error('Unsupported image type. Use JPG, PNG, WEBP, GIF, or AVIF.');
  }

  if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Image must be smaller than 5 MB.');
  }
}

async function loadImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not read the selected image.'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not prepare the selected image.'));
          return;
        }

        resolve(blob);
      },
      type,
      quality,
    );
  });
}

async function optimizeImageForUpload(file: File) {
  if (file.type === 'image/gif') {
    return { file, optimized: false };
  }

  const image = await loadImageElement(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image optimization is not supported in this browser.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  let quality = DEFAULT_WEBP_QUALITY;
  let blob = await canvasToBlob(canvas, 'image/webp', quality);

  while (blob.size > TARGET_UPLOAD_BYTES && quality > MIN_WEBP_QUALITY) {
    quality = Number((quality - 0.06).toFixed(2));
    blob = await canvasToBlob(canvas, 'image/webp', quality);
  }

  if (blob.size >= file.size && scale === 1) {
    return { file, optimized: false };
  }

  return {
    file: new File([blob], file.name.replace(/\.(png|jpe?g|webp|avif)$/i, '.webp'), {
      type: 'image/webp',
      lastModified: file.lastModified,
    }),
    optimized: true,
  };
}

declare global {
  interface Window {
    cloudinary?: CloudinaryWidgetApi;
  }
}

export const CloudinaryUpload: React.FC<Props> = ({ onUploaded, label = 'Upload Image', helper }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedFileSize, setSelectedFileSize] = useState('');
  const [optimizedFileSize, setOptimizedFileSize] = useState('');

  const loadWidgetScript = async () => {
    if (window.cloudinary) {
      return window.cloudinary;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://widget.cloudinary.com/v2.0/global/all.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load upload widget'));
      document.body.appendChild(script);
    });

    if (!window.cloudinary) {
      throw new Error('Upload widget did not initialize correctly');
    }

    return window.cloudinary;
  };

  const getSignature = async () => {
    const token = window.localStorage.getItem('token');
    if (!token) {
      throw new Error('Please log in as an admin or seller before uploading media');
    }

    const signatureResponse = await fetch('/api/media/signature', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const signature = (await signatureResponse.json()) as CloudinarySignatureResponse;
    if (!signatureResponse.ok) {
      throw new Error(signature.error || 'Could not get upload signature');
    }

    return signature;
  };

  const uploadFile = async (file: File) => {
    setError('');
    validateFile(file);
    setSelectedFileName(file.name);
    setSelectedFileSize(formatBytes(file.size));
    setOptimizedFileSize('');
    setPreviewUrl(URL.createObjectURL(file));
    setUploadProgress(0);
    setLoading(true);

    try {
      const prepared = await optimizeImageForUpload(file);
      if (prepared.optimized) {
        setOptimizedFileSize(formatBytes(prepared.file.size));
      }

      const signature = await getSignature();
      const uploadUrl = `https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`;
      const formData = new FormData();

      formData.append('file', prepared.file);
      formData.append('api_key', signature.apiKey);
      formData.append('timestamp', String(signature.timestamp));
      formData.append('signature', signature.signature);

      const secureUrl = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        });

        xhr.onerror = () => reject(new Error('Image upload failed'));
        xhr.onload = () => {
          try {
            const response = JSON.parse(xhr.responseText || '{}') as { secure_url?: string; error?: { message?: string } };
            if (xhr.status >= 200 && xhr.status < 300 && response.secure_url) {
              resolve(response.secure_url);
              return;
            }

            reject(new Error(response.error?.message || 'Image upload failed'));
          } catch {
            reject(new Error('Image upload failed'));
          }
        };

        xhr.send(formData);
      });

      setUrl(secureUrl);
      setUploadProgress(100);
      onUploaded(secureUrl);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
      setError(message);
      setUploadProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const openWidget = async () => {
    setError('');
    setLoading(true);

    try {
      const signature = await getSignature();
      const cloudinary = await loadWidgetScript();
      const widget = cloudinary.createUploadWidget(
        {
          cloudName: signature.cloudName,
          uploadSignatureTimestamp: signature.timestamp,
          uploadSignature: signature.signature,
          apiKey: signature.apiKey,
          resourceType: 'image',
          clientAllowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'],
          cropping: false,
          multiple: false,
          sources: ['local', 'url', 'camera'],
        },
        (widgetError, result) => {
          if (widgetError) {
            setError(widgetError.message || 'Upload failed');
            setLoading(false);
            return;
          }

          if (isCloudinaryUploadSuccess(result)) {
            setUrl(result.info.secure_url);
            setPreviewUrl(result.info.secure_url);
            setUploadProgress(100);
            onUploaded(result.info.secure_url);
            setLoading(false);
          }
        },
      );

      widget.open();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
      setError(message);
      setLoading(false);
    }
  };

  const handleFileSelection = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  return (
    <div className="space-y-3">
      {label ? <label className="block text-sm font-medium text-gray-700">{label}</label> : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(event) => {
          void handleFileSelection(event.target.files);
          event.currentTarget.value = '';
        }}
      />

      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) {
            setDragActive(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          void handleFileSelection(event.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed px-4 py-5 transition ${
          dragActive ? 'border-primary bg-primary/5' : 'border-gray-300 bg-white'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          {previewUrl ? (
            <img src={previewUrl} alt="Upload preview" className="h-28 w-28 rounded-2xl object-cover shadow-sm" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageIcon className="h-6 w-6" />}
            </div>
          )}

          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              {loading ? 'Uploading image...' : 'Drag and drop an image here'}
            </p>
            <p className="text-xs text-slate-500">
              Or choose a file directly. JPG, PNG, WEBP, GIF, or AVIF up to 5 MB.
            </p>
            {selectedFileName ? (
              <p className="text-xs text-slate-500">
                {selectedFileName}
                {selectedFileSize ? ` • ${selectedFileSize}` : ''}
                {optimizedFileSize ? ` -> ${optimizedFileSize}` : ''}
              </p>
            ) : null}
            <p className="text-[11px] text-slate-400">
              Large photos are automatically resized and compressed before upload to save time and storage.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              <UploadCloud className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Uploading...' : 'Choose file'}</span>
            </button>
            <button
              type="button"
              onClick={openWidget}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              <Link2 className="h-4 w-4" />
              <span>More sources</span>
            </button>
            {url ? <Check className="h-4 w-4 text-emerald-600" /> : null}
          </div>
        </div>
      </div>

      {loading || uploadProgress > 0 ? (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.max(uploadProgress, loading ? 8 : 0)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">{uploadProgress}% uploaded</p>
        </div>
      ) : null}

      {helper ? <p className="text-xs text-gray-500">{helper}</p> : null}
      {url ? <p className="break-all text-xs text-emerald-600">{url}</p> : null}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
};

export default CloudinaryUpload;
