import { TouchableOpacity, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { colors } from '@/lib/theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: Props) {
  const bg =
    variant === 'primary'
      ? colors.primary[500]
      : variant === 'danger'
        ? colors.error[500]
        : colors.neutral[800];
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bg }, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={colors.neutral[0]} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'ghost' && { color: colors.neutral[300] },
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: colors.neutral[0],
  },
  disabled: {
    opacity: 0.5,
  },
});
