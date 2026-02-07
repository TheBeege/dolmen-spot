'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Character } from '@/lib/types';

interface HexMapProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

interface MapPin {
  id: string;
  x: number; // percentage of image width (0-100)
  y: number; // percentage of image height (0-100)
  label: string;
  hex: string;
  isCurrentLocation: boolean;
}

export default function HexMap({ character, onChange }: HexMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [posStart, setPosStart] = useState({ x: 0, y: 0 });
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [newPinLabel, setNewPinLabel] = useState('');
  const [newPinHex, setNewPinHex] = useState('');
  const [showPinForm, setShowPinForm] = useState(false);
  const [pendingPinPos, setPendingPinPos] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Load pins from character otherNotes (stored as JSON under a marker)
  const PIN_MARKER = '<!--MAP_PINS-->';
  const parsePins = useCallback((): MapPin[] => {
    const notes = character.otherNotes || '';
    const idx = notes.indexOf(PIN_MARKER);
    if (idx === -1) return [];
    try {
      return JSON.parse(notes.slice(idx + PIN_MARKER.length));
    } catch {
      return [];
    }
  }, [character.otherNotes]);

  const savePins = useCallback((pins: MapPin[]) => {
    const notes = character.otherNotes || '';
    const idx = notes.indexOf(PIN_MARKER);
    const baseNotes = idx === -1 ? notes : notes.slice(0, idx);
    onChange({ otherNotes: baseNotes + PIN_MARKER + JSON.stringify(pins) });
  }, [character.otherNotes, onChange]);

  const pins = parsePins();

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(prev => Math.max(0.5, Math.min(5, prev + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isPlacingPin) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPosStart({ ...position });
  }, [isPlacingPin, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: posStart.x + (e.clientX - dragStart.x),
      y: posStart.y + (e.clientY - dragStart.y),
    });
  }, [isDragging, dragStart, posStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch support
  const touchStartRef = useRef<{ x: number; y: number; pos: { x: number; y: number } } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isPlacingPin || e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      pos: { ...position },
    };
  }, [isPlacingPin, position]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPosition({
      x: touchStartRef.current.pos.x + (touch.clientX - touchStartRef.current.x),
      y: touchStartRef.current.pos.y + (touch.clientY - touchStartRef.current.y),
    });
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  const handleMapClick = useCallback((e: React.MouseEvent) => {
    if (!isPlacingPin || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingPinPos({ x, y });
    setShowPinForm(true);
    setIsPlacingPin(false);
  }, [isPlacingPin]);

  const confirmPin = useCallback(() => {
    if (!pendingPinPos) return;
    const newPin: MapPin = {
      id: crypto.randomUUID(),
      x: pendingPinPos.x,
      y: pendingPinPos.y,
      label: newPinLabel || 'Marker',
      hex: newPinHex,
      isCurrentLocation: false,
    };
    savePins([...pins, newPin]);
    setShowPinForm(false);
    setPendingPinPos(null);
    setNewPinLabel('');
    setNewPinHex('');
  }, [pendingPinPos, newPinLabel, newPinHex, pins, savePins]);

  const deletePin = useCallback((id: string) => {
    savePins(pins.filter(p => p.id !== id));
  }, [pins, savePins]);

  const setCurrentLocationPin = useCallback((id: string) => {
    const updated = pins.map(p => ({
      ...p,
      isCurrentLocation: p.id === id,
    }));
    const pin = updated.find(p => p.id === id);
    savePins(updated);
    if (pin) {
      onChange({ currentLocation: pin.label + (pin.hex ? ` (Hex ${pin.hex})` : '') });
    }
  }, [pins, savePins, onChange]);

  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Prevent default scroll on the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', prevent, { passive: false });
    return () => el.removeEventListener('wheel', prevent);
  }, []);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3 border-b border-[#5a3a28] pb-2">
          <h2 className="text-lg font-bold text-[#c4a35a]">Dolmenwood Map</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScale(s => Math.min(5, s + 0.25))}
              className="bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-2 py-1 text-sm transition-colors"
            >
              +
            </button>
            <span className="text-[#f5e6c8]/60 text-xs min-w-[3rem] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
              className="bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-2 py-1 text-sm transition-colors"
            >
              -
            </button>
            <button
              onClick={resetView}
              className="bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-2 py-1 text-xs transition-colors ml-1"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setIsPlacingPin(!isPlacingPin);
              setShowPinForm(false);
            }}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              isPlacingPin
                ? 'bg-[#c4a35a] text-[#1a1a2e] font-semibold'
                : 'bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8]'
            }`}
          >
            {isPlacingPin ? 'Click map to place pin...' : 'Place Pin'}
          </button>
          {isPlacingPin && (
            <button
              onClick={() => setIsPlacingPin(false)}
              className="text-xs text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors"
            >
              Cancel
            </button>
          )}
          <span className="text-[#f5e6c8]/40 text-xs">
            Scroll to zoom, drag to pan. 6 miles per hex.
          </span>
        </div>
      </div>

      {/* Pin Form */}
      {showPinForm && (
        <div className="bg-[#2a2a3e] rounded-lg p-4 border border-[#c4a35a]/40">
          <h3 className="text-[#c4a35a] text-sm font-semibold mb-2">New Map Pin</h3>
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="text-[#c4a35a] text-xs block mb-1">Label</label>
              <input
                type="text"
                value={newPinLabel}
                onChange={(e) => setNewPinLabel(e.target.value)}
                placeholder="Location name"
                className="bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#c4a35a]"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && confirmPin()}
              />
            </div>
            <div>
              <label className="text-[#c4a35a] text-xs block mb-1">Hex #</label>
              <input
                type="text"
                value={newPinHex}
                onChange={(e) => setNewPinHex(e.target.value)}
                placeholder="e.g. 0704"
                className="bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-sm w-20 focus:outline-none focus:border-[#c4a35a]"
                onKeyDown={(e) => e.key === 'Enter' && confirmPin()}
              />
            </div>
            <button
              onClick={confirmPin}
              className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 text-sm transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => { setShowPinForm(false); setPendingPinPos(null); }}
              className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Map Viewport */}
      <div
        ref={containerRef}
        className="bg-[#1a1a2e] rounded-lg overflow-hidden relative"
        style={{ height: '60vh', cursor: isPlacingPin ? 'crosshair' : isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
          className="w-full h-full flex items-center justify-center"
        >
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src="/dolmenwood-map.png"
              alt="Dolmenwood Hex Map"
              className="max-w-none select-none pointer-events-auto"
              style={{ width: '1200px' }}
              draggable={false}
              onClick={handleMapClick}
            />
            {/* Pins */}
            {pins.map(pin => (
              <div
                key={pin.id}
                className="absolute group"
                style={{
                  left: `${pin.x}%`,
                  top: `${pin.y}%`,
                  transform: 'translate(-50%, -100%)',
                  zIndex: pin.isCurrentLocation ? 20 : 10,
                }}
              >
                {/* Pin icon */}
                <div className={`w-4 h-4 rounded-full border-2 ${
                  pin.isCurrentLocation
                    ? 'bg-[#c4a35a] border-[#f5e6c8] shadow-lg shadow-[#c4a35a]/50'
                    : 'bg-[#8b2500] border-[#f5e6c8]'
                }`} />
                {/* Label tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block pointer-events-none whitespace-nowrap">
                  <div className="bg-[#1a1a2e] border border-[#5a3a28] rounded px-2 py-1 text-xs text-[#f5e6c8] shadow-lg">
                    <div className="font-semibold">{pin.label}</div>
                    {pin.hex && <div className="text-[#c4a35a]">Hex {pin.hex}</div>}
                    {pin.isCurrentLocation && <div className="text-[#c4a35a] text-[10px]">Current Location</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pin List */}
      {pins.length > 0 && (
        <div className="bg-[#2a2a3e] rounded-lg p-4">
          <h3 className="text-[#c4a35a] text-sm font-semibold mb-2">Map Pins</h3>
          <div className="space-y-1">
            {pins.map(pin => (
              <div
                key={pin.id}
                className={`flex items-center justify-between p-2 rounded text-sm ${
                  pin.isCurrentLocation ? 'bg-[#c4a35a]/10 border border-[#c4a35a]/30' : 'bg-[#1a1a2e]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    pin.isCurrentLocation ? 'bg-[#c4a35a]' : 'bg-[#8b2500]'
                  }`} />
                  <span className="text-[#f5e6c8] truncate">{pin.label}</span>
                  {pin.hex && <span className="text-[#f5e6c8]/40 text-xs shrink-0">Hex {pin.hex}</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {!pin.isCurrentLocation && (
                    <button
                      onClick={() => setCurrentLocationPin(pin.id)}
                      className="text-xs px-2 py-0.5 bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded transition-colors"
                      title="Set as current location"
                    >
                      Set Location
                    </button>
                  )}
                  <button
                    onClick={() => deletePin(pin.id)}
                    className="text-[#8b2500] hover:text-[#b33a1a] text-xs px-1 transition-colors"
                    title="Delete pin"
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
