import React from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { OrbitControlsProps } from '@react-three/drei';

interface SceneSetupProps {
  children?: React.ReactNode;
  cameraPosition?: [number, number, number];
  autoRotate?: boolean;
  backgroundColor?: string;
  enableEnvironment?: boolean;
  controlsProps?: Partial<OrbitControlsProps>;
}

export const SceneSetup: React.FC<SceneSetupProps> = ({
  children,
  cameraPosition = [0, 0, 3],
  autoRotate = false,
  backgroundColor = '#f5f5f5',
  enableEnvironment = true,
  controlsProps = {},
}) => {
  return (
    <Canvas
      style={{ background: backgroundColor }}
      gl={{
        antialias: true,
        alpha: true,
        precision: 'highp',
      }}
      shadows
      dpr={[1, 2]}
      performance={{ current: 1 }}
    >
      <PerspectiveCamera makeDefault position={cameraPosition} fov={50} near={0.1} far={1000} />

      <ambientLight intensity={0.7} />
      <directionalLight
        position={[5, 10, 7]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <pointLight position={[-5, 5, -5]} intensity={0.5} />
      <hemisphereLight intensity={0.6} />

      {enableEnvironment ? <Environment preset="city" /> : null}

      <OrbitControls
        enableZoom
        enablePan
        enableRotate
        autoRotate={autoRotate}
        autoRotateSpeed={2}
        minDistance={1}
        maxDistance={10}
        {...controlsProps}
      />

      <group>{children}</group>
    </Canvas>
  );
};

export default SceneSetup;
