import { useState } from 'react';
import {
  ActivityIndicator,
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
import { ApiError, sendNewSmsCode } from '../api/client';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';
import { digitsOnly, maskPhone } from '../utils/phone';

type Props = NativeStackScreenProps<RootStackParamList, 'Verification'>;

export function VerificationScreen({ navigation, route }: Props) {
  const { login, phoneNumber } = route.params;
  const insets = useSafeAreaInsets();
  const { completeLogin } = useAuth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    const smsCode = digitsOnly(code);
    if (smsCode.length !== 6) {
      setError('Informe o código de 6 dígitos.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await completeLogin({ login, phoneNumber, smsCode });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível validar o código. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (resending) return;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      await sendNewSmsCode(phoneNumber);
      setNotice('Código enviado novamente.');
    } catch {
      setError('Não foi possível reenviar o código.');
    } finally {
      setResending(false);
    }
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
          { paddingTop: insets.top + 28, paddingBottom: Math.max(insets.bottom, 24) + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ Alterar telefone</Text>
        </Pressable>

        <Text style={styles.title}>Verificação de SMS</Text>
        <Text style={styles.description}>
          Foi enviado um SMS para o número de celular informado. Por favor, digite-o
          abaixo.
        </Text>

        <View style={styles.phoneRow}>
          <Text style={styles.phone}>{maskPhone(phoneNumber)}</Text>
          <Text style={styles.phoneLabel}>Código de 6 dígitos</Text>
        </View>

        <TextInput
          accessibilityLabel="Código SMS"
          autoComplete="sms-otp"
          autoFocus
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={(value) => setCode(digitsOnly(value))}
          placeholder="••••••"
          placeholderTextColor={colors.muted}
          style={styles.codeInput}
          textContentType="oneTimeCode"
          value={code}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.primaryButton,
            submitting && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.primaryText}>Verificar</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={resending}
          onPress={() => void resend()}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryText}>
            {resending ? 'Enviando…' : 'Enviar novamente'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.popToTop()}
          style={styles.loginButton}
        >
          <Text style={styles.loginText}>Voltar ao login</Text>
        </Pressable>

        <Text style={styles.spam}>
          Se você não estiver vendo a mensagem, verifique em Configurações &gt; Spam e
          Bloqueadas.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 22 },
  backButton: { alignSelf: 'flex-start' },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 28 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  phoneRow: { marginTop: 28 },
  phone: { color: colors.text, fontSize: 21, fontWeight: '900' },
  phoneLabel: { color: colors.muted, fontSize: 12, marginTop: 4 },
  codeInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 10,
    marginTop: 26,
    paddingHorizontal: 20,
    paddingVertical: 14,
    textAlign: 'center',
  },
  error: { color: colors.danger, fontSize: 12, marginTop: 12 },
  notice: { color: colors.text, fontSize: 12, marginTop: 12 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.pin,
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 54,
  },
  primaryText: { color: colors.text, fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  loginButton: { alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  loginText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  spam: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 28,
    textAlign: 'center',
  },
});
