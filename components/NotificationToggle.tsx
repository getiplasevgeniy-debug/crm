import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import {
  hasPushSubscription,
  pushIsAvailable,
  registerPushNotifications,
  unregisterPushNotifications,
} from '@/lib/push';
import { colors } from '@/lib/theme';

export function NotificationToggle() {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const isAvailable = await pushIsAvailable();
        if (!mounted) return;
        setAvailable(isAvailable);
        if (!isAvailable) return;
        const subscribed = await hasPushSubscription();
        if (mounted) setEnabled(subscribed);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onToggle = async (value: boolean) => {
    setBusy(true);
    try {
      if (value) {
        await registerPushNotifications();
        setEnabled(true);
      } else {
        await unregisterPushNotifications();
        setEnabled(false);
      }
    } catch {
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  };

  if (!available) return null;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <Bell size={18} color={colors.accent[400]} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Уведомления</Text>
          <Text style={styles.subtitle}>
            {enabled ? 'Вы будете получать новые заявки' : 'Включите, чтобы получать новые заявки'}
          </Text>
        </View>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        disabled={busy}
        trackColor={{ false: colors.neutral[700], true: colors.accent[600] }}
        thumbColor={enabled ? colors.neutral[0] : colors.neutral[400]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.neutral[900],
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[800],
  },
  copy: {
    flex: 1,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: colors.neutral[0],
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.neutral[400],
    marginTop: 2,
    lineHeight: 17,
  },
});
