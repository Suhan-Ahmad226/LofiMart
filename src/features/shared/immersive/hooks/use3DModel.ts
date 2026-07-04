import { useCallback, useRef, useState } from 'react';
import * as THREE from 'three';

interface CameraAngle {
  name: string;
  position: [number, number, number];
  target?: [number, number, number];
}

const cameraAngles: Record<string, CameraAngle> = {
  front: { name: 'Front', position: [0, 0, 3], target: [0, 0, 0] },
  back: { name: 'Back', position: [0, 0, -3], target: [0, 0, 0] },
  left: { name: 'Left', position: [-3, 0, 0], target: [0, 0, 0] },
  right: { name: 'Right', position: [3, 0, 0], target: [0, 0, 0] },
  top: { name: 'Top', position: [0, 3, 0], target: [0, 0, 0] },
  isometric: { name: 'Isometric', position: [2.5, 2.5, 2.5], target: [0, 0, 0] },
};

type GLTFExportResult = ArrayBuffer | object;

export const use3DModel = () => {
  const [selectedColor, setSelectedColor] = useState('default');
  const [autoRotate, setAutoRotate] = useState(false);
  const [currentCamera, setCurrentCamera] = useState<CameraAngle | null>(null);
  const [zoom, setZoom] = useState(1);
  const sceneRef = useRef<THREE.Group | null>(null);

  const handleCameraChange = useCallback((angleKey: string) => {
    const angle = cameraAngles[angleKey];
    if (angle) {
      setCurrentCamera(angle);
    }
  }, []);

  const handleColorChange = useCallback((color: string) => {
    setSelectedColor(color);
  }, []);

  const toggleAutoRotate = useCallback(() => {
    setAutoRotate((current) => !current);
  }, []);

  const handleZoom = useCallback((delta: number) => {
    setZoom((current) => Math.max(0.5, Math.min(3, current + delta)));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setSelectedColor('default');
    setCurrentCamera(cameraAngles.isometric);
    setAutoRotate(false);
  }, []);

  const exportScene = useCallback(async (format: 'gltf' | 'glb' = 'glb') => {
    if (!sceneRef.current) return;

    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const exporter = new GLTFExporter();

      exporter.parse(
        sceneRef.current,
        (result: GLTFExportResult) => {
          const serialized =
            result instanceof ArrayBuffer ? result : JSON.stringify(result, null, 2);
          const blob = new Blob([serialized], {
            type: result instanceof ArrayBuffer ? 'application/octet-stream' : 'application/json',
          });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `product.${format}`;
          link.click();
          URL.revokeObjectURL(link.href);
        },
        (error: unknown) => {
          console.error('Export failed:', error);
        },
      );
    } catch (error) {
      console.error('Failed to export scene:', error);
    }
  }, []);

  const captureScreenshot = useCallback((canvas: HTMLCanvasElement) => {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'product-view.png';
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }, []);

  return {
    selectedColor,
    autoRotate,
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
    captureScreenshot,
  };
};

export default use3DModel;
