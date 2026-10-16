import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell, X } from 'lucide-react-native';
import { hasPushSubscription, pushIsAvailable, registerPushNotifications } from '@/lib/push';
import { colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';

export function PushPermissionPrompt() {
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!session) {
      setVisible(false);
      return () => {
        mounted = false;
      };
    }
    (async () => {
      try {
        const available = await pushIsAvailable();
        if (!available) return;
        const subscribed = await hasPushSubscription();
        if (mounted && !subscribed && Notification.permission !== 'denied') setVisible(true);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

  const enableNotifications = async () => {
    setSaving(true);
    try {
      await registerPushNotifications();
      setVisible(false);
    } catch {
      setVisible(false);
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}><Bell size={18} color={colors.accent[400]} /></View>
      <View style={styles.copy}>
        <Text style={styles.title}>Включить уведомления?</Text>
        <Text style={styles.subtitle}>Получайте новые заявки, назначенные вам.</Text>
      </View>
      <TouchableOpacity style={styles.enableButton} onPress={enableNotifications} disabled={saving}>
        <Text style={styles.enableText}>{saving ? '...' : 'Включить'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)} hitSlop={8}>
        <X size={16} color={colors.neutral[500]} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.neutral[800],
    borderWidth: 1,
    borderColor: colors.neutral[700],
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.neutral[700],
  },
  copy: { flex: 1 },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: colors.neutral[0] },
  subtitle: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 16, color: colors.neutral[300], marginTop: 2 },
  enableButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: colors.accent[600] },
  enableText: { fontFamily: 'Inter-SemiBold', fontSize: 12, color: colors.neutral[0] },
  closeButton: { padding: 3 },
});
