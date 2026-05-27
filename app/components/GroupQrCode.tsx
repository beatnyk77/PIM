import React from 'react';
import { View } from 'react-native';

interface GroupQrCodeProps {
  value: string;
  size?: number;
}

export default function GroupQrCode({ value, size = 200 }: GroupQrCodeProps) {
  // Simple deterministic hash of value to generate random-looking but static data
  const hashString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  };

  const seed = hashString(value);

  // Generate 21x21 grid representing Version 1 QR code
  const gridSize = 21;
  const grid: boolean[][] = [];

  // Corner finder pattern boundaries
  // Top-left: [0-6][0-6]
  // Top-right: [0-6][14-20]
  // Bottom-left: [14-20][0-6]
  const isFinderPattern = (r: number, c: number) => {
    // Top-left
    if (r < 7 && c < 7) {
      return (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
    }
    // Top-right
    if (r < 7 && c >= 14) {
      const adjC = c - 14;
      return (r === 0 || r === 6 || adjC === 0 || adjC === 6 || (r >= 2 && r <= 4 && adjC >= 2 && adjC <= 4));
    }
    // Bottom-left
    if (r >= 14 && c < 7) {
      const adjR = r - 14;
      return (adjR === 0 || adjR === 6 || c === 0 || c === 6 || (adjR >= 2 && adjR <= 4 && c >= 2 && c <= 4));
    }
    return null;
  };

  for (let r = 0; r < gridSize; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < gridSize; c++) {
      const finder = isFinderPattern(r, c);
      if (finder !== null) {
        row.push(finder);
      } else {
        // Deterministic pseudo-random generation based on cell coordinate and value seed
        const val = Math.sin(seed + r * 12.9898 + c * 78.233) * 43758.5453;
        row.push((val - Math.floor(val)) > 0.5);
      }
    }
    grid.push(row);
  }

  const cellSize = Math.floor(size / gridSize);

  return (
    <View 
      style={{ width: size + 16, height: size + 16 }} 
      className="bg-white p-2 rounded-2xl border border-gray-200 items-center justify-center shadow-md"
    >
      <View style={{ width: size, height: size, flexDirection: 'column' }}>
        {grid.map((row, rIdx) => (
          <View key={rIdx} style={{ height: cellSize, flexDirection: 'row' }}>
            {row.map((cell, cIdx) => (
              <View
                key={cIdx}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: cell ? '#0f172a' : '#ffffff', // slate-900 vs white
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
