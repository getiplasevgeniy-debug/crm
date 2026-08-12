import { Text, View, StyleSheet } from 'react-native';
import { colors } from '@/lib/theme';

type Props = {
  message: string;
};

export function ErrorBanner({ message }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.error[50],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.error[100],
  },
  text: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: colors.error[600],
    textAlign: 'center',
  },
});
