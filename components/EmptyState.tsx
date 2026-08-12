import { Text, View, StyleSheet } from 'react-native';
import { colors } from '@/lib/theme';

type Props = {
  message: string;
};

export function EmptyState({ message }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  text: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: colors.neutral[500],
    textAlign: 'center',
    lineHeight: 22,
  },
});
