import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Download, RefreshCcw, Share2, Volume2, X } from 'lucide-react';
import { useCamera } from '@/src/hooks/useCamera';
import { copyText } from '@/src/lib/browser-actions';

interface ARTryOnProps {
  productName?: string;
  productType?: 'accessories' | 'clothing' | 'shoes';
  onClose?: () => void;
  onCapture?: (imageUrl: string) => void;
}

const productOverlayCopy = {
  accessories: 'Align the item with your face and hold still for a cleaner preview.',
  clothing: 'Center your body in frame and step back slightly to preview the fit.',
  shoes: 'Tilt the camera lower and keep your feet visible for better framing.',
};

const measurementCopy = {
  accessories: ['Face width: approx. 145 mm', 'Bridge: approx. 17 mm', 'Temple: approx. 140 mm'],
  clothing: ['Chest: compare against your regular fit', 'Waist: check silhouette and drape', 'Length: review proportion against height'],
  shoes: ['Fit: leave some toe room', 'Width: compare standard versus wide feel', 'Length: check comfort before final size selection'],
};

export const ARTryOn: React.FC<ARTryOnProps> = ({
  productName = 'Product',
  productType = 'accessories',
  onClose,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const { stopCamera } = useCamera();

  useEffect(() => {
    let stream: MediaStream | null = null;

    const setupAR = async () => {
      try {
        setCameraError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsActive(true);
          setStatusMessage('Camera ready. Adjust your position and start previewing.');
        }
      } catch (error) {
        setIsActive(false);
        setCameraError('Camera access was denied. Please allow camera access in your browser settings and try again.');
        setStatusMessage(null);
      }
    };

    void setupAR();

    return () => {
      stopCamera();
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, [stopCamera]);

  const handleRetryCamera = async () => {
    try {
      setStatusMessage('Retrying camera access...');
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsActive(true);
      setStatusMessage('Camera ready. Adjust your position and start previewing.');
    } catch (error) {
      setIsActive(false);
      setCameraError('Still unable to access the camera. Please check browser permissions and close any app already using the camera.');
      setStatusMessage(null);
    }
  };

  const captureCurrentFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const context = canvasRef.current.getContext('2d');
    if (!context) return null;

    context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    context.save();
    if (isMirrored) {
      context.scale(-1, 1);
      context.drawImage(videoRef.current, -canvasRef.current.width, 0, canvasRef.current.width, canvasRef.current.height);
    } else {
      context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    context.restore();

    return canvasRef.current.toDataURL('image/png');
  };

  const handleCapture = () => {
    const imageUrl = captureCurrentFrame();
    if (!imageUrl) return;

    onCapture?.(imageUrl);

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${productName}-try-on.png`;
    link.click();

    setStatusMessage('Snapshot captured and downloaded successfully.');
  };

  const handleShare = async () => {
    const imageUrl = captureCurrentFrame();
    if (!imageUrl) return;

    try {
      if (navigator.share) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], `${productName}-try-on.png`, { type: 'image/png' });

        await navigator.share({
          title: `Check out my ${productName} preview`,
          text: 'I tried on this product using the AR preview.',
          files: [file],
        });

        setStatusMessage('AR preview shared successfully.');
        return;
      }

      const copied = await copyText(window.location.href);
      setStatusMessage(
        copied
          ? 'Sharing is not supported here, so the page link was copied instead.'
          : 'Sharing is not supported here, and the link could not be copied on this device.',
      );
    } catch (error) {
      setStatusMessage('Unable to share right now. Please try again in a moment.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex min-h-0 flex-col bg-black">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900 px-4 py-3 text-white sm:px-5">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold sm:text-lg">
          <Camera className="h-5 w-5" />
          <span className="truncate">AR Try-On: {productName}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 transition hover:bg-gray-800"
          title="Close"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {isActive ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className={`h-full w-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
              style={{ transform: `${isMirrored ? 'scaleX(-1)' : 'scaleX(1)'} scale(${zoom})` }}
            />

            <div className="pointer-events-none absolute inset-x-4 top-5 flex justify-center sm:inset-0 sm:items-center">
              <div className="max-w-full rounded-2xl bg-black/45 px-4 py-2 text-center text-xs font-medium text-white shadow-lg backdrop-blur sm:rounded-full sm:px-5 sm:py-3 sm:text-sm">
                {productOverlayCopy[productType]}
              </div>
            </div>

            {showMeasurements ? (
              <div className="absolute left-3 top-20 max-w-[calc(100vw-1.5rem)] space-y-1 rounded-xl bg-black/70 p-3 text-xs text-white sm:left-4 sm:top-4 sm:max-w-xs sm:text-sm">
                <p className="font-semibold">Fit guide</p>
                {measurementCopy[productType].map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}

            {showTips ? (
              <div className="absolute inset-x-3 bottom-24 rounded-2xl bg-black/75 p-4 text-sm text-white shadow-xl sm:inset-x-auto sm:bottom-28 sm:left-4 sm:max-w-xs">
                <p className="font-semibold">Quick AR tips</p>
                <ul className="mt-2 space-y-1 text-white/80">
                  <li>Use front lighting for clearer camera tracking.</li>
                  <li>Hold still for a moment before capturing.</li>
                  <li>Switch mirror mode if the preview feels reversed.</li>
                </ul>
              </div>
            ) : null}

            {statusMessage ? (
              <div className="absolute bottom-3 left-3 right-3 rounded-2xl bg-white/90 px-4 py-2 text-center text-xs font-medium text-gray-900 shadow-lg sm:bottom-6 sm:left-1/2 sm:right-auto sm:w-max sm:max-w-[min(90vw,36rem)] sm:-translate-x-1/2 sm:rounded-full sm:text-sm">
                {statusMessage}
              </div>
            ) : null}

            <canvas ref={canvasRef} className="hidden" width={1280} height={720} />
          </>
        ) : cameraError ? (
          <div className="mx-4 max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-6 text-center text-white shadow-xl backdrop-blur sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-300">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h3 className="mt-5 text-2xl font-bold">Camera access needed</h3>
            <p className="mt-3 text-sm leading-7 text-white/75">{cameraError}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={handleRetryCamera}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                <RefreshCcw className="h-4 w-4" />
                Retry camera
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5"
              >
                Close preview
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center text-white">
            <p className="mb-4 text-lg">Initializing camera...</p>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        )}
      </div>

      <div className="bg-gray-900 px-4 py-3 text-white sm:px-5 sm:py-4">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-4">
            <button
              type="button"
              onClick={handleCapture}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700 sm:w-auto"
            >
              <Download className="h-5 w-5" />
              Capture
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-2 font-semibold transition hover:bg-green-700 sm:w-auto"
            >
              <Share2 className="h-5 w-5" />
              Share
            </button>

            <button
              type="button"
              onClick={() => setIsMirrored((current) => !current)}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold transition hover:bg-gray-600"
            >
              {isMirrored ? 'Switch to normal view' : 'Switch to mirror view'}
            </button>

            <button
              type="button"
              onClick={() => setShowMeasurements((current) => !current)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                showMeasurements ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {showMeasurements ? 'Hide fit guide' : 'Show fit guide'}
            </button>
          </div>

          <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setZoom((current) => Math.max(0.5, current - 0.1))}
                disabled={zoom <= 0.5}
                className="rounded bg-gray-700 px-3 py-1 text-sm transition hover:bg-gray-600 disabled:opacity-50"
              >
                -
              </button>
              <span className="w-14 text-center text-sm">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((current) => Math.min(3, current + 0.1))}
                disabled={zoom >= 3}
                className="rounded bg-gray-700 px-3 py-1 text-sm transition hover:bg-gray-600 disabled:opacity-50"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowTips((current) => !current)}
              className="flex items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm transition hover:bg-gray-600"
            >
              <Volume2 className="h-4 w-4" />
              {showTips ? 'Hide tips' : 'Show tips'}
            </button>
          </div>

          <div className="text-center text-sm text-gray-400">
            <p>Tip: move slightly and test a few angles before deciding on fit or style.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ARTryOn;
