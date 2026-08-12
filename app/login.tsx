import { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { LabeledInput } from '@/components/LabeledInput';
import { ActionButton } from '@/components/ActionButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Lock } from 'lucide-react-native';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Введите email и пароль');
      return;
    }
    setLoading(true);
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'web' ? 'padding' : undefined} style={styles.inner}>
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Lock size={32} color={colors.primary[400]} />
          </View>
          <Text style={styles.title}>CRM Manager</Text>
          <Text style={styles.subtitle}>Войдите в админ-панель</Text>
        </View>

        <View style={styles.form}>
          {error ? <ErrorBanner message={error} /> : null}
          <LabeledInput label="Email" value={email} onChangeText={setEmail} placeholder="admin@gmail.com" keyboardType="default" />
          <LabeledInput label="Пароль" value={password} onChangeText={setPassword} placeholder="••••••••" keyboardType="default" />
          <View style={{ height: 8 }} />
          <ActionButton label="Войти" onPress={handleLogin} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[950],
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.neutral[900],
    borderWidth: 1,
    borderColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 28,
    color: colors.neutral[0],
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: colors.neutral[400],
    marginTop: 4,
  },
  form: {
    backgroundColor: colors.neutral[900],
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
});
