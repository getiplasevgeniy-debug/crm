import { ReactNode } from 'react';
import { View, StyleSheet, SafeAreaView, Text, ActivityIndicator } from 'react-native';
import { colors } from '@/lib/theme';

type Props = {
  children: ReactNode;
  title: string;
  subtitle?: string;
  loading?: boolean;
  right?: ReactNode;
};

export function ScreenHeader({ children, title, subtitle, loading, right }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
        {loading ? (
          <ActivityIndicator color={colors.primary[400]} style={{ marginTop: 12 }} />
        ) : (
          children
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.neutral[950],
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 28,
    color: colors.neutral[0],
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: colors.neutral[400],
    marginTop: 2,
  },
});
