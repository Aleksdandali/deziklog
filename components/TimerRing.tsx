import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS } from '@/lib/constants';

interface TimerRingProps {
  totalSeconds: number;
  remainingSeconds: number;
  size?: number;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TimerRing({ totalSeconds, remainingSeconds, size = 220 }: TimerRingProps) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = totalSeconds > 0 ? Math.max(0, remainingSeconds / totalSeconds) : 0;
  const strokeDashoffset = circumference * (1 - progress);

  const center = size / 2;

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={COLORS.primaryLight}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={COLORS.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      <Text
        className="text-[#1B1B1B] font-bold"
        style={{ fontSize: 48, fontVariant: ['tabular-nums'], letterSpacing: 2 }}
      >
        {formatTime(Math.max(0, remainingSeconds))}
      </Text>
    </View>
  );
}
