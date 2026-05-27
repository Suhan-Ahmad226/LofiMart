import React, { useEffect, useState } from 'react';
import { useGLTF, useProgress } from '@react-three/drei';
import * as THREE from 'three';

interface ModelLoaderProps {
  modelUrl: string;
  scale?: number | [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
  onLoaded?: (scene: THREE.Group) => void;
  textureMap?: Record<string, string | THREE.Texture>;
}

export const ModelLoader: React.FC<ModelLoaderProps> = ({
  modelUrl,
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  castShadow = true,
  receiveShadow = true,
  onLoaded,
  textureMap = {},
}) => {
  const { scene } = useGLTF(modelUrl);
  const [clonedScene, setClonedScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    if (scene) {
      const cloned = scene.clone(true) as THREE.Group;
      const textureLoader = new THREE.TextureLoader();

      // Apply shadows
      cloned.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = castShadow;
          child.receiveShadow = receiveShadow;

          // Apply textures from textureMap
          if (child.material) {
            const material = Array.isArray(child.material)
              ? child.material[0]
              : child.material;

            if (material instanceof THREE.MeshStandardMaterial) {
              const meshName = child.name.toLowerCase();
              Object.entries(textureMap).forEach(([colorName, texture]) => {
                if (meshName.includes(colorName.toLowerCase())) {
                  material.map =
                    typeof texture === 'string' ? textureLoader.load(texture) : texture;
                  material.needsUpdate = true;
                }
              });
            }
          }
        }
      });

      setClonedScene(cloned);
      onLoaded?.(cloned);
    }
  }, [scene, castShadow, receiveShadow, textureMap, onLoaded]);

  if (!clonedScene) {
    return <group />;
  }

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <primitive object={clonedScene} />
    </group>
  );
};

// Progress component for loading states
export const ModelProgress: React.FC = () => {
  const { progress, active } = useProgress();

  return active ? (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '200px',
          height: '30px',
          border: '2px solid #ccc',
          borderRadius: '15px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            transition: 'width 0.3s ease-in-out',
          }}
        />
      </div>
      <p style={{ marginTop: '10px', color: '#666' }}>{Math.round(progress)}%</p>
    </div>
  ) : null;
};

export default ModelLoader;
