import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { useBooking } from '../state/BookingContext';
import { useRide } from '../state/RideContext';
import { colors } from '../theme';
import { digitsOnly, formatPhoneInput } from '../utils/phone';

type Props = NativeStackScreenProps<RootStackParamList, 'MyAccount'>;

export function MyAccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, refreshProfile, updateProfile, signOut } = useAuth();
  const { reset: resetBooking } = useBooking();
  const { stop: stopRide } = useRide();
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadAttempted, setLoadAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user && !initialized) {
      setFullName(user.fullName ?? '');
      setDisplayName(user.displayName ?? '');
      setEmail(user.email ?? '');
      setPhone(formatPhoneInput(user.phoneNumber ?? ''));
      setInitialized(true);
      return;
    }

    if (!user && !loading && !loadAttempted) {
      setLoadAttempted(true);
      setLoading(true);
      refreshProfile()
        .catch(() => setError('Não foi possível carregar os dados da conta.'))
        .finally(() => setLoading(false));
    }
  }, [initialized, loadAttempted, loading, refreshProfile, user]);

  const save = async () => {
    const trimmedName = fullName.trim();
    const trimmedDisplayName = displayName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedName.split(/\s+/).length < 2) {
      setError('Informe seu nome completo.');
      return;
    }
    if (!trimmedDisplayName || trimmedDisplayName.includes(' ')) {
      setError('O nome de exibição deve ser uma única palavra.');
      return;
    }
    if (!trimmedEmail.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateProfile({
        fullName: trimmedName,
        displayName: trimmedDisplayName,
        email: trimmedEmail,
        phoneNumber: digitsOnly(phone),
      });
      setSuccess('Dados da conta atualizados com sucesso.');
    } catch {
      setError('Não foi possível atualizar os dados da conta.');
    } finally {
      setSaving(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Trocar de conta', 'Deseja sair da conta atual?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Trocar de Conta',
        style: 'destructive',
        onPress: () => {
          stopRide();
          resetBooking();
          void signOut();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 24) + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ Voltar</Text>
        </Pressable>

        <Text style={styles.title}>Minha Conta</Text>
        <Text style={styles.description}>Atualize seus dados de passageiro.</Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.text} />
            <Text style={styles.loadingText}>Carregando informações…</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>Nome completo</Text>
            <TextInput
              accessibilityLabel="Nome completo"
              autoCapitalize="words"
              onChangeText={setFullName}
              placeholder="Digite seu nome completo"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={fullName}
            />

            <Text style={styles.label}>Nome de exibição</Text>
            <TextInput
              accessibilityLabel="Nome de exibição"
              autoCapitalize="words"
              onChangeText={setDisplayName}
              placeholder="Digite seu nome de exibição"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={displayName}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email da conta"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Digite seu email"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={email}
            />

            <Text style={styles.label}>Telefone</Text>
            <TextInput
              accessibilityLabel="Telefone da conta"
              editable={false}
              style={[styles.input, styles.inputDisabled]}
              value={phone}
            />
            <Text style={styles.hint}>A alteração de telefone usa a verificação por SMS.</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {success ? <Text style={styles.success}>{success}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.primaryButton,
                saving && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.primaryText}>Atualizar Dados</Text>
              )}
            </Pressable>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={confirmSignOut}
          style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
        >
          <Text style={styles.signOutText}>Trocar de Conta</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 20 },
  backButton: { alignSelf: 'flex-start' },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 18 },
  description: { color: colors.muted, fontSize: 14, marginTop: 6 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 30 },
  loadingText: { color: colors.muted, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 22,
    padding: 16,
  },
  label: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 14 },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    marginTop: 7,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputDisabled: { color: colors.muted },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 12 },
  success: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 12 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.pin,
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 52,
  },
  primaryText: { color: colors.text, fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  signOutButton: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 52,
  },
  signOutText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
});
