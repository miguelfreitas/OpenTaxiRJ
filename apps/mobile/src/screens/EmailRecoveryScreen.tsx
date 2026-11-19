import { useEffect, useState } from 'react';
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
import {
  ApiError,
  sendRecoveryCode,
  validateRecoveryCode,
} from '../api/client';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailRecovery'>;

export function EmailRecoveryScreen({ navigation, route }: Props) {
  const { login, phoneNumber, oldPhoneNumber } = route.params;
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sendCode = async () => {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await sendRecoveryCode(login);
      setNotice('Código de validação enviado para o e-mail cadastrado.');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível enviar o código para o e-mail.',
      );
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    void sendCode();
  }, []);

  const submit = async () => {
    const validationCode = code.trim().toUpperCase();
    if (!validationCode) {
      setError('Informe o código de validação.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await validateRecoveryCode({
        login,
        validationCode,
        phoneNumber,
        oldPhoneNumber,
      });
      if (result.status !== 200) {
        setError('Código de validação inválido.');
        return;
      }
      navigation.navigate('Verification', { login, phoneNumber, cod: 200 });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível validar o código.',
      );
    } finally {
      setSubmitting(false);
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
          <Text style={styles.backText}>‹ Voltar ao login</Text>
        </Pressable>

        <Text style={styles.title}>Telefone diferente</Text>
        <Text style={styles.description}>
          Seu telefone é diferente do que temos no registro. Enviamos um código de
          validação para o e-mail cadastrado para atualizar o número com segurança.
        </Text>
        {oldPhoneNumber ? (
          <Text style={styles.maskedPhone}>Telefone atual: •••••-{oldPhoneNumber.slice(-4)}</Text>
        ) : null}

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <TextInput
          accessibilityLabel="Código de validação por e-mail"
          autoCapitalize="characters"
          autoFocus
          onChangeText={(value) => setCode(value.replace(/\s/g, '').toUpperCase())}
          placeholder="Código de validação"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={code}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
            <Text style={styles.primaryText}>Validar código</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={sending}
          onPress={() => void sendCode()}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryText}>
            {sending ? 'Enviando…' : 'Enviar novamente'}
          </Text>
        </Pressable>
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
  maskedPhone: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 18 },
  notice: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 16 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 4,
    marginTop: 22,
    paddingHorizontal: 16,
    paddingVertical: 13,
    textAlign: 'center',
  },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 12 },
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
});
