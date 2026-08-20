import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { Download, Eye, RotateCw, Share2, ZoomIn, ZoomOut } from 'lucide-react';

import ModelLoader, { ModelProgress } from './ModelLoader';
import SceneSetup from './SceneSetup';
import use3DModel from '@/features/shared/immersive/hooks/use3DModel';

interface ProductViewer3DProps {
  modelUrl: string;
  textures?: Record<string, string>;
  enableAR?: boolean;
  autoRotate?: boolean;
  backgroundColor?: string;
  onViewInAR?: () => void;
  onColorChange?: (color: string) => void;
  productName?: string;
  colors?: Array<{ name: string; value: string }>;
  className?: string;
}

const ProductViewer3D: React.FC<ProductViewer3DProps> = ({
  modelUrl,
  textures = {},
  enableAR = false,
  autoRotate = false,
  backgroundColor = '#f5f5f5',
  onViewInAR,
  onColorChange,
  productName = 'Product',
  colors = [{ name: 'Default', value: 'default' }],
  className = '',
}) => {
  const {
    selectedColor,
    autoRotate: isAutoRotating,
    currentCamera,
    zoom,
    cameraAngles,
    sceneRef,
    handleCameraChange,
    handleColorChange,
    toggleAutoRotate,
    handleZoom,
    resetView,
    exportScene,
  } = use3DModel();

  const canvasRef = useRef<HTMLDivElement>(null);
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      setWebglSupported(Boolean(context));
    } catch {
      setWebglSupported(false);
    }
  }, []);

  const handleColorSelect = useCallback(
    (color: string) => {
      handleColorChange(color);
      onColorChange?.(color);
    },
    [handleColorChange, onColorChange],
  );

  const handleCapture = useCallback(() => {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }

      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `${productName}-3d-screenshot.png`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    });
  }, [productName]);

  if (!webglSupported || !modelUrl) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-8 ${className}`}
      >
        <div className="text-center space-y-3">
          <div className="w-24 h-24 bg-gradient-to-r from-blue-400 to-purple-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg">
            <span className="text-white text-xl font-bold">3D</span>
          </div>
          <p className="text-lg font-bold text-gray-700">{productName}</p>
          <p className="text-sm text-gray-500">3D preview will appear here once the product model is available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`} style={{ height: '500px' }}>
      <div
        ref={canvasRef}
        className="relative flex-1 rounded-2xl overflow-hidden shadow-2xl border-2 border-gray-200"
      >
        <Suspense fallback={<ModelProgress />}>
          <SceneSetup
            cameraPosition={currentCamera?.position ?? [0, 0, 3]}
            autoRotate={isAutoRotating || autoRotate}
            backgroundColor={backgroundColor}
            controlsProps={{
              minDistance: 0.5,
              maxDistance: 8,
              autoRotateSpeed: 1.5,
            }}
          >
            <ModelLoader
              modelUrl={modelUrl}
              scale={zoom}
              castShadow
              receiveShadow
              onLoaded={(scene: THREE.Group) => {
                sceneRef.current = scene;
              }}
              textureMap={textures}
            />
          </SceneSetup>
        </Suspense>

        <div className="absolute top-3 right-3 flex gap-1.5 z-20 bg-white/95 backdrop-blur-sm p-1.5 rounded-xl shadow-xl border">
          {enableAR ? (
            <button
              onClick={onViewInAR}
              className="p-1.5 hover:bg-emerald-100 rounded-lg transition-all text-emerald-700 hover:text-emerald-800"
              title="AR Try On"
            >
              <Eye className="w-4 h-4" />
            </button>
          ) : null}
          <button
            onClick={handleCapture}
            className="p-1.5 hover:bg-blue-100 rounded-lg transition-all text-blue-700 hover:text-blue-800"
            title="Screenshot"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => void exportScene('glb')}
            className="p-1.5 hover:bg-purple-100 rounded-lg transition-all text-purple-700 hover:text-purple-800"
            title="Download GLB"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 p-1 bg-gray-50 rounded-xl">
        {Object.entries(cameraAngles).map(([key, angle]) => (
          <button
            key={key}
            onClick={() => handleCameraChange(key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              currentCamera?.name === angle.name
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-white text-gray-700 hover:bg-gray-200 hover:shadow-sm border border-gray-200'
            }`}
          >
            {angle.name}
          </button>
        ))}
        <button
          onClick={toggleAutoRotate}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
            isAutoRotating
              ? 'bg-green-500 text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-gray-200 hover:shadow-sm border border-gray-200'
          }`}
        >
          <RotateCw className="w-3 h-3" />
          {isAutoRotating ? 'Stop' : 'Rotate'}
        </button>
        <button
          onClick={resetView}
          className="px-2.5 py-1 bg-gray-200 hover:bg-gray-300 rounded-lg text-xs font-medium border border-gray-300 transition-all shadow-sm"
        >
          Reset
        </button>
      </div>

      {colors.length > 1 ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 w-12 whitespace-nowrap">Colors:</span>
          {colors.map((color) => (
            <button
              key={color.value}
              onClick={() => handleColorSelect(color.value)}
              className={`w-7 h-7 rounded-full border-2 shadow-sm transition-all ${
                selectedColor === color.value
                  ? 'border-blue-500 ring-2 ring-blue-200 ring-offset-1 scale-110 shadow-lg'
                  : 'border-gray-300 hover:border-gray-400 hover:scale-105 hover:shadow-md'
              }`}
              style={{ backgroundColor: color.value === 'default' ? '#e5e5e5' : color.value }}
              title={color.name}
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleZoom(-0.1)}
            disabled={zoom <= 0.5}
            className="p-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => handleZoom(0.1)}
            disabled={zoom >= 3}
            className="p-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={toggleAutoRotate}
          className={`px-3 py-2 rounded-lg flex items-center gap-2 transition ${
            isAutoRotating ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <RotateCw className="w-4 h-4" />
          {isAutoRotating ? 'Rotating' : 'Auto Rotate'}
        </button>

        <button
          onClick={resetView}
          className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
        >
          Reset View
        </button>
      </div>
    </div>
  );
};

export default ProductViewer3D;
