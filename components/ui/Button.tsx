import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/lib/constants';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  haptic?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = true,
  size = 'lg',
  haptic = false,
  icon,
}: ButtonProps) {
  const handlePress = () => {
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPress();
  };

  const sizeClasses = {
    sm: 'h-10 px-4 rounded-xl',
    md: 'h-12 px-5 rounded-2xl',
    lg: 'h-14 px-6 rounded-2xl',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-base',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled || loading}
        activeOpacity={0.85}
        className={`${widthClass} overflow-hidden rounded-2xl ${disabled ? 'opacity-40' : ''}`}
      >
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          className={`${sizeClasses[size]} flex-row items-center justify-center gap-2`}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <>
              {icon}
              <Text className={`${textSizeClasses[size]} font-semibold text-white`}>{label}</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const variantStyles: Record<string, string> = {
    secondary: 'bg-primary-light',
    outline: 'bg-transparent border border-primary',
    danger: 'bg-transparent border border-error',
    ghost: 'bg-transparent',
  };

  const textStyles: Record<string, string> = {
    secondary: 'text-primary font-semibold',
    outline: 'text-primary font-semibold',
    danger: 'text-error font-semibold',
    ghost: 'text-text-secondary font-medium',
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      className={`${widthClass} ${sizeClasses[size]} ${variantStyles[variant]} flex-row items-center justify-center gap-2 ${disabled ? 'opacity-40' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.primary} size="small" />
      ) : (
        <>
          {icon}
          <Text className={`${textSizeClasses[size]} ${textStyles[variant]}`}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
