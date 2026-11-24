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
import { ApiError, authPassenger, sendEmailCode } from '../api/client';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';
import { digitsOnly, formatPhoneInput } from '../utils/phone';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp');
  const [error, setError] = useState<string | null>(null);

  const login = email.trim();
  const phoneNumber = digitsOnly(phone);
  const canSubmit =
    email.trim().includes('@') && phoneNumber.length === 11 && !submitting;

  const submit = async () => {
    if (!canSubmit) {
      setError('Informe um e-mail válido e um telefone com 11 dígitos.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (method === 'email') {
        await sendEmailCode(login);
        navigation.navigate('Verification', { login, phoneNumber, cod: 200, method });
        return;
      }
      const result = await authPassenger(login, phoneNumber, method === 'whatsapp');
      if (result.status === 201) {
        navigation.navigate('Verification', { login, phoneNumber, cod: 201, method });
      } else if (result.status === 200) {
        navigation.navigate('Verification', { login, phoneNumber, cod: 200, method });
      } else if (result.status === 202) {
        navigation.navigate('EmailRecovery', {
          login,
          phoneNumber,
          oldPhoneNumber: result.body.oldPhoneNumber,
        });
      } else {
        setError('Resposta de autenticação não reconhecida.');
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível iniciar o login. Tente novamente.',
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
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 36, paddingBottom: Math.max(insets.bottom, 24) + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.mark}>
            <Text style={styles.markText}>OT</Text>
          </View>
          <Text style={styles.brand}>Open Taxi RJ</Text>
          <Text style={styles.tagline}>Sua corrida na cidade</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Entrar</Text>
          <Text style={styles.description}>
            Use seu e-mail e telefone para acessar sua conta.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
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
            accessibilityLabel="Telefone"
            autoComplete="tel"
            keyboardType="phone-pad"
            maxLength={15}
            onChangeText={(value) => setPhone(formatPhoneInput(value))}
            placeholder="(21) 99999-9999"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={phone}
          />

          <Text style={styles.label}>Receber código</Text>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: method === 'email' }}
            onPress={() => setMethod('email')}
            style={styles.methodRow}
          >
            <View style={[styles.radio, method === 'email' && styles.radioOn]}>
              {method === 'email' ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.methodText}>
              <Text style={styles.methodTitle}>E-mail</Text>
              <Text style={styles.methodSub}>Código por e-mail</Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: method === 'sms' }}
            onPress={() => setMethod('sms')}
            style={styles.methodRow}
          >
            <View style={[styles.radio, method === 'sms' && styles.radioOn]}>
              {method === 'sms' ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.methodText}>
              <Text style={styles.methodTitle}>SMS</Text>
              <Text style={styles.methodSub}>Código por mensagem de texto</Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: method === 'whatsapp' }}
            onPress={() => setMethod('whatsapp')}
            style={styles.methodRow}
          >
            <View style={[styles.radio, method === 'whatsapp' && styles.radioOn]}>
              {method === 'whatsapp' ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.methodText}>
              <Text style={styles.methodTitle}>WhatsApp</Text>
              <Text style={styles.methodSub}>Código pelo WhatsApp</Text>
            </View>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.primaryButton,
              (!canSubmit || submitting) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.primaryText}>Entrar</Text>
            )}
          </Pressable>

          <Text style={styles.footer}>
            Caso não tenha uma conta, use os campos acima para criá-la e cuidaremos do
            resto.
          </Text>
          <Text style={styles.help}>Não consegue acessar?</Text>
          <Text style={styles.helpLink}>Entre em contato com o Open Taxi RJ</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.text, flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 18 },
  hero: { alignItems: 'center', paddingBottom: 30, paddingTop: 10 },
  mark: {
    alignItems: 'center',
    backgroundColor: colors.pin,
    borderRadius: 22,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  markText: { color: colors.text, fontSize: 23, fontWeight: '900' },
  brand: { color: colors.pin, fontSize: 28, fontWeight: '900', marginTop: 14 },
  tagline: { color: '#BFD0DA', fontSize: 13, marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  title: { color: colors.text, fontSize: 23, fontWeight: '900' },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  label: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 20 },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 12 },
  methodRow: { alignItems: 'center', flexDirection: 'row', marginTop: 12 },
  methodText: { flex: 1, marginLeft: 12 },
  methodTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  methodSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  radio: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 11,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  radioOn: { borderColor: colors.pin },
  radioDot: { backgroundColor: colors.pin, borderRadius: 5, height: 10, width: 10 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.pin,
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 54,
  },
  primaryText: { color: colors.text, fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  footer: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 22,
    textAlign: 'center',
  },
  help: { color: colors.text, fontSize: 13, marginTop: 24, textAlign: 'center' },
  helpLink: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },
});
