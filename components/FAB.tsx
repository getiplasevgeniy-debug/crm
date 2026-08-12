import { TouchableOpacity, StyleSheet, Text } from 'react-native';
import { colors } from '@/lib/theme';

type Props = {
  label: string;
  onPress: () => void;
};

export function FAB({ label, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 76,
    right: 20,
    backgroundColor: colors.primary[500],
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 24,
    elevation: 5,
    shadowColor: colors.primary[700],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: colors.neutral[0],
  },
});
