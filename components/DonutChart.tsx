import { StyleSheet, View, Text } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { colors } from '@/lib/theme';

type DonutSlice = {
  label: string;
  value: number;
  color: string;
};

type DonutChartProps = {
  data: DonutSlice[];
  total: number;
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
};

const STATUS_COLORS: Record<string, string> = {
  'В работе': colors.primary[400],
  'Депозит': colors.accent[400],
  'Не валид': colors.error[400],
  'Новый': colors.neutral[300],
  'Потенциальный': colors.warning[400],
};

export function colorForStatus(status: string): string {
  return STATUS_COLORS[status] || colors.neutral[500];
}

export function DonutChart({
  data,
  total,
  size = 180,
  strokeWidth = 28,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  const slices = data.filter((d) => d.value > 0);
  const totalValue = slices.reduce((sum, s) => sum + s.value, 0);

  if (totalValue === 0) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.neutral[800]}
            strokeWidth={strokeWidth}
            fill="none"
          />
        </Svg>
        <View style={styles.centerContent}>
          <Text style={styles.centerValue}>{centerValue ?? '0'}</Text>
          {centerLabel ? <Text style={styles.centerLabel}>{centerLabel}</Text> : null}
        </View>
      </View>
    );
  }

  let offset = 0;
  const sliceElements: React.ReactNode[] = [];

  for (const slice of slices) {
    const fraction = slice.value / totalValue;
    const dashLength = fraction * circumference;
    const gapLength = circumference - dashLength;

    sliceElements.push(
      <Circle
        key={slice.label}
        cx={center}
        cy={center}
        r={radius}
        stroke={slice.color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${dashLength} ${gapLength}`}
        strokeDashoffset={-offset}
        strokeLinecap="butt"
        rotation={-90}
        origin={`${center},${center}`}
      />
    );

    offset += dashLength;
  }

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <G>{sliceElements}</G>
      </Svg>
      <View style={styles.centerContent}>
        <Text style={styles.centerValue}>{centerValue ?? String(total)}</Text>
        {centerLabel ? <Text style={styles.centerLabel}>{centerLabel}</Text> : null}
      </View>
    </View>
  );
}

type LegendProps = {
  items: DonutSlice[];
};

export function DonutLegend({ items }: LegendProps) {
  return (
    <View style={styles.legend}>
      {items
        .filter((i) => i.value > 0)
        .map((item) => (
          <View style={styles.legendItem} key={item.label}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel}>{item.label}</Text>
            <Text style={styles.legendValue}>{item.value}</Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 28,
    color: colors.neutral[0],
  },
  centerLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: colors.neutral[400],
    marginTop: 2,
  },
  legend: { gap: 6, flex: 1 },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    flexShrink: 0,
  },
  legendLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.neutral[300],
    flex: 1,
  },
  legendValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: colors.neutral[0],
  },
});
