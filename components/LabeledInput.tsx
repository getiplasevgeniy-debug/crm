import { TextInput, StyleSheet, View, Text, Platform } from 'react-native';
import { colors } from '@/lib/theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  multiline?: boolean;
  datePicker?: boolean;
};

export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  datePicker = false,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.neutral[500]}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        {...(datePicker && Platform.OS === 'web'
          ? { type: 'date' } as any
          : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: colors.neutral[400],
    marginBottom: 6,
  },
  input: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: colors.neutral[0],
    backgroundColor: colors.neutral[800],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.neutral[700],
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
