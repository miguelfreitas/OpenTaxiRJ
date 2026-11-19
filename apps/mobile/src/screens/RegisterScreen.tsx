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
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation, route }: Props) {
  const { login, phoneNumber, smsCode } = route.params;
  const insets = useSafeAreaInsets();
  const { completeSignUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmedName = fullName.trim();
    const trimmedDisplayName = displayName.trim();
    if (trimmedName.split(/\s+/).length < 2) {
      setError('Informe seu nome completo.');
      return;
    }
    if (!trimmedDisplayName || trimmedDisplayName.includes(' ')) {
      setError('O nome de exibição deve ser uma única palavra.');
      return;
    }
    if (!acceptedTerms) {
      setError('Aceite os termos de uso para continuar.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await completeSignUp({
        login,
        phoneNumber,
        smsCode,
        fullName: trimmedName,
        displayName: trimmedDisplayName,
      });
    } catch {
      setError('Não foi possível concluir o cadastro.');
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
          <Text style={styles.backText}>‹ Voltar</Text>
        </Pressable>

        <Text style={styles.title}>Quase lá!</Text>
        <Text style={styles.description}>
          Vamos terminar de criar sua conta. Informe seu nome completo e o nome de
          exibição.
        </Text>

        <Text style={styles.label}>Seu nome completo</Text>
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

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acceptedTerms }}
          onPress={() => setAcceptedTerms((current) => !current)}
          style={styles.termsRow}
        >
          <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
            <Text style={styles.checkboxText}>{acceptedTerms ? '✓' : ''}</Text>
          </View>
          <Text style={styles.termsText}>Aceito os termos de uso.</Text>
        </Pressable>

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
            <Text style={styles.primaryText}>Criar conta</Text>
          )}
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
  title: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 24 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  label: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 20 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    marginTop: 7,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  termsRow: { alignItems: 'center', flexDirection: 'row', marginTop: 22 },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.text,
    borderRadius: 5,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxChecked: { backgroundColor: colors.pin },
  checkboxText: { color: colors.text, fontSize: 15, fontWeight: '900' },
  termsText: { color: colors.text, flex: 1, fontSize: 13, marginLeft: 10 },
  error: { color: colors.danger, fontSize: 12, marginTop: 14 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.pin,
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 54,
  },
  primaryText: { color: colors.text, fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
