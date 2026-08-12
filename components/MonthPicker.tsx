import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors } from '@/lib/theme';
import { monthLabel, currentMonthKey, generateMonthKeys } from '@/lib/format';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react-native';

type Props = {
  value: string;
  onChange: (key: string) => void;
  monthsCount?: number;
};

export function MonthPicker({ value, onChange, monthsCount = 12 }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const monthKeys = generateMonthKeys(monthsCount);

  const currentIndex = monthKeys.indexOf(value);
  const canGoPrev = currentIndex < monthKeys.length - 1;
  const canGoNext = currentIndex > 0;

  const goPrev = () => {
    if (canGoPrev) onChange(monthKeys[currentIndex + 1]);
  };
  const goNext = () => {
    if (canGoNext) onChange(monthKeys[currentIndex - 1]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <TouchableOpacity
          onPress={goPrev}
          disabled={!canGoPrev}
          style={[styles.navBtn, !canGoPrev && styles.navBtnDisabled]}
          hitSlop={12}
        >
          <ChevronLeft size={20} color={canGoPrev ? colors.neutral[200] : colors.neutral[700]} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.labelWrap}
          onPress={() => setShowPicker((v) => !v)}
          activeOpacity={0.7}
        >
          <Calendar size={16} color={colors.primary[400]} />
          <Text style={styles.label}>{monthLabel(value)}</Text>
          {value === currentMonthKey() ? (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>Текущий</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goNext}
          disabled={!canGoNext}
          style={[styles.navBtn, !canGoNext && styles.navBtnDisabled]}
          hitSlop={12}
        >
          <ChevronRight size={20} color={canGoNext ? colors.neutral[200] : colors.neutral[700]} />
        </TouchableOpacity>
      </View>

      {showPicker ? (
        <ScrollView style={styles.dropdown} horizontal={false}>
          {monthKeys.map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.dropdownItem, k === value && styles.dropdownItemActive]}
              onPress={() => {
                onChange(k);
                setShowPicker(false);
              }}
            >
              <Text
                style={[styles.dropdownItemText, k === value && styles.dropdownItemTextActive]}
              >
                {monthLabel(k)}
                {k === currentMonthKey() ? ' (текущий)' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.neutral[900],
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
  navBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.neutral[800],
  },
  navBtnDisabled: {
    backgroundColor: colors.neutral[900],
  },
  labelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: colors.neutral[100],
  },
  currentBadge: {
    backgroundColor: colors.primary[600],
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currentBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    color: colors.neutral[0],
  },
  dropdown: {
    marginTop: 4,
    backgroundColor: colors.neutral[900],
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.neutral[800],
    maxHeight: 240,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[800],
  },
  dropdownItemActive: {
    backgroundColor: colors.primary[600],
  },
  dropdownItemText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: colors.neutral[300],
  },
  dropdownItemTextActive: {
    fontFamily: 'Inter-SemiBold',
    color: colors.neutral[0],
  },
});
