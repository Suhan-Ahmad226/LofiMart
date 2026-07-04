import React, { useRef, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Grid } from '@react-three/drei';
import { Suspense } from 'react';
import ModelLoader from './ModelLoader';
import { Plus, Trash2, RotateCw, Save, Download, Home } from 'lucide-react';

interface FurnitureItem {
  id: string;
  modelUrl: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

interface RoomVisualizerProps {
  onSave?: (design: FurnitureItem[]) => void;
  onLoadPreset?: (presetName: string) => void;
  roomDimensions?: {
    width: number;
    height: number;
    depth: number;
  };
}

const PRESET_FURNITURE = {
  sofa: {
    name: 'Modern Sofa',
    modelUrl: 'https://models.readyplayer.me/63c1d13ba4a07800087fa5d6.glb',
  },
  chair: {
    name: 'Office Chair',
    modelUrl: 'https://models.readyplayer.me/63c1d13ba4a07800087fa5d6.glb',
  },
  table: {
    name: 'Coffee Table',
    modelUrl: 'https://models.readyplayer.me/63c1d13ba4a07800087fa5d6.glb',
  },
  lamp: {
    name: 'Floor Lamp',
    modelUrl: 'https://models.readyplayer.me/63c1d13ba4a07800087fa5d6.glb',
  },
  bookshelf: {
    name: 'Bookshelf',
    modelUrl: 'https://models.readyplayer.me/63c1d13ba4a07800087fa5d6.glb',
  },
};

const RoomScene: React.FC<{
  items: FurnitureItem[];
  onItemSelect: (id: string) => void;
  onItemUpdate: (id: string, updates: Partial<FurnitureItem>) => void;
  selectedItemId?: string;
}> = ({ items, onItemSelect, onItemUpdate, selectedItemId }) => {
  return (
    <>
      {/* Room Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#d0d0d0" />
      </mesh>

      {/* Room Walls */}
      {/* Back wall */}
      <mesh position={[0, 2.5, -5]} receiveShadow>
        <boxGeometry args={[10, 5, 0.1]} />
        <meshStandardMaterial color="#e8e8e8" />
      </mesh>

      {/* Right wall */}
      <mesh position={[5, 2.5, 0]} receiveShadow>
        <boxGeometry args={[0.1, 5, 10]} />
        <meshStandardMaterial color="#ececec" />
      </mesh>

      {/* Left wall */}
      <mesh position={[-5, 2.5, 0]} receiveShadow>
        <boxGeometry args={[0.1, 5, 10]} />
        <meshStandardMaterial color="#ececec" />
      </mesh>

      {/* Grid helper */}
      <Grid args={[10, 10]} cellSize={0.5} cellColor="#999" sectionSize={5} />

      {/* Furniture Items */}
      {items.map((item) => (
        <group
          key={item.id}
          onClick={() => onItemSelect(item.id)}
          position={item.position}
          rotation={item.rotation}
          scale={item.scale}
        >
          <Suspense fallback={null}>
            <ModelLoader
              modelUrl={item.modelUrl}
              castShadow
              receiveShadow
            />
          </Suspense>
          {/* Selection box */}
          {selectedItemId === item.id && (
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial
                color="#00ff00"
                wireframe
                depthTest={true}
              />
            </mesh>
          )}
        </group>
      ))}

      {/* Lighting */}
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-5, 5, 5]} intensity={0.5} />
    </>
  );
};

export const RoomVisualizer: React.FC<RoomVisualizerProps> = ({
  onSave,
  onLoadPreset,
  roomDimensions = { width: 10, height: 5, depth: 10 },
}) => {
  const [items, setItems] = useState<FurnitureItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();
  const [furnitureType, setFurnitureType] = useState<string>('sofa');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleAddFurniture = useCallback(() => {
    const furniture = PRESET_FURNITURE[furnitureType as keyof typeof PRESET_FURNITURE];
    if (furniture) {
      const newItem: FurnitureItem = {
        id: `item-${Date.now()}`,
        modelUrl: furniture.modelUrl,
        name: furniture.name,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      };
      setItems((currentItems) => [...currentItems, newItem]);
      setSelectedItemId(newItem.id);
    }
  }, [furnitureType]);

  const handleDeleteItem = useCallback(() => {
    if (selectedItemId) {
      setItems((currentItems) => currentItems.filter((item) => item.id !== selectedItemId));
      setSelectedItemId(undefined);
    }
  }, [selectedItemId]);

  const handleUpdateItem = useCallback(
    (id: string, updates: Partial<FurnitureItem>) => {
      setItems((currentItems) =>
        currentItems.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      );
    },
    [],
  );

  const handleSaveDesign = useCallback(() => {
    if (!items.length) {
      setStatusMessage('Add at least one item before saving this layout.');
      return;
    }
    onSave?.(items);
    setStatusMessage('Design saved successfully.');
  }, [items, onSave]);

  const handleExportDesign = useCallback(async () => {
    if (!items.length) {
      setStatusMessage('Nothing to export yet. Add some furniture first.');
      return;
    }
    const designData = JSON.stringify(items, null, 2);
    const blob = new Blob([designData], { type: 'application/json' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = 'room-design.json';
    link.click();
    URL.revokeObjectURL(objectUrl);
    setStatusMessage('Design exported as JSON.');
  }, [items]);

  const selectedItem = items.find((item) => item.id === selectedItemId);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left Sidebar - Controls */}
      <div className="w-80 bg-white shadow-lg p-6 overflow-y-auto">
        <div className="space-y-6">
          {statusMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {statusMessage}
            </div>
          )}
          {/* Title */}
          <div className="flex items-center gap-2">
            <Home className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Room Visualizer</h1>
          </div>

          {/* Add Furniture Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Add Furniture</h2>
            <select
              value={furnitureType}
              onChange={(e) => setFurnitureType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(PRESET_FURNITURE).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddFurniture}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Item
            </button>
          </div>

          {/* Items List */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Placed Items ({items.length})
            </h2>
            {items.length === 0 ? (
              <p className="text-gray-500 text-sm">No items added yet</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition ${
                      selectedItemId === item.id
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-gray-100 border-2 border-transparent hover:bg-gray-200'
                    }`}
                  >
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">
                      Pos: ({item.position[0].toFixed(1)}, {item.position[1].toFixed(1)})
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Item Controls */}
          {selectedItem && (
            <div className="space-y-4 border-t pt-6">
              <h3 className="font-semibold text-gray-900">Item Properties</h3>

              {/* Position */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Position</label>
                <div className="space-y-2">
                  {['X', 'Y', 'Z'].map((axis, idx) => (
                    <div key={axis} className="flex items-center gap-2">
                      <label className="w-8 text-sm font-medium text-gray-600">{axis}</label>
                      <input
                        type="range"
                        min="-5"
                        max="5"
                        step="0.1"
                        value={selectedItem.position[idx]}
                        onChange={(e) => {
                          const newPos = [...selectedItem.position] as [number, number, number];
                          newPos[idx] = parseFloat(e.target.value);
                          handleUpdateItem(selectedItem.id, { position: newPos });
                        }}
                        className="flex-1"
                      />
                      <span className="w-12 text-right text-sm text-gray-600">
                        {selectedItem.position[idx].toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rotation */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Rotation</label>
                <div className="space-y-2">
                  {['X', 'Y', 'Z'].map((axis, idx) => (
                    <div key={axis} className="flex items-center gap-2">
                      <label className="w-8 text-sm font-medium text-gray-600">{axis}</label>
                      <input
                        type="range"
                        min="0"
                        max={Math.PI * 2}
                        step="0.01"
                        value={selectedItem.rotation[idx]}
                        onChange={(e) => {
                          const newRot = [...selectedItem.rotation] as [number, number, number];
                          newRot[idx] = parseFloat(e.target.value);
                          handleUpdateItem(selectedItem.id, { rotation: newRot });
                        }}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Scale */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Scale</label>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={selectedItem.scale[0]}
                  onChange={(e) => {
                    const scale = parseFloat(e.target.value);
                    handleUpdateItem(selectedItem.id, {
                      scale: [scale, scale, scale],
                    });
                  }}
                  className="w-full"
                />
                <p className="text-sm text-gray-600">
                  Scale: {selectedItem.scale[0].toFixed(1)}x
                </p>
              </div>

              {/* Delete Button */}
              <button
                onClick={handleDeleteItem}
                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
              >
                <Trash2 className="w-5 h-5" />
                Delete Item
              </button>
            </div>
          )}

          {/* Save/Export */}
          <div className="space-y-2 border-t pt-6">
            <button
              onClick={handleSaveDesign}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              Save Design
            </button>
            <button
              onClick={handleExportDesign}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              Export as JSON
            </button>
          </div>

          {/* Room Info */}
          <div className="bg-blue-50 rounded-lg p-4 text-sm text-gray-700 space-y-1">
            <p className="font-semibold">Room Dimensions:</p>
            <p>Width: {roomDimensions.width}m</p>
            <p>Height: {roomDimensions.height}m</p>
            <p>Depth: {roomDimensions.depth}m</p>
          </div>
        </div>
      </div>

      {/* 3D Canvas */}
      <div ref={canvasRef} className="flex-1 relative">
        <Suspense
          fallback={
            <div className="w-full h-full flex items-center justify-center bg-gray-200">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Loading Room...</p>
              </div>
            </div>
          }
        >
          <Canvas
            camera={{
              position: [5, 5, 5],
              fov: 50,
            }}
            gl={{
              antialias: true,
              alpha: true,
            }}
            shadows
          >
            <RoomScene
              items={items}
              selectedItemId={selectedItemId}
              onItemSelect={setSelectedItemId}
              onItemUpdate={handleUpdateItem}
            />

            <Environment preset="apartment" />
            <OrbitControls
              enableZoom={true}
              enablePan={true}
              enableRotate={true}
              minDistance={2}
              maxDistance={20}
            />
          </Canvas>
        </Suspense>

        {/* Info Overlay */}
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-lg shadow-md max-w-xs">
          <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <RotateCw className="w-4 h-4" />
            Controls
          </h3>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• Click to select items</li>
            <li>• Drag to rotate view</li>
            <li>• Scroll to zoom</li>
            <li>• Use sliders to adjust</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default RoomVisualizer;
