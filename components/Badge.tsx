import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors } from '@/lib/theme';

type Props = {
  children: React.ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'error';
};

export function Badge({ children, variant = 'info' }: Props) {
  const bg =
    variant === 'success'
      ? colors.accent[100]
      : variant === 'warning'
        ? colors.warning[100]
        : variant === 'error'
          ? colors.error[100]
          : colors.primary[100];
  const fg =
    variant === 'success'
      ? colors.accent[700]
      : variant === 'warning'
        ? colors.warning[600]
        : variant === 'error'
          ? colors.error[600]
          : colors.primary[700];
  return <Text style={[styles.badge, { backgroundColor: bg, color: fg }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  badge: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
});
