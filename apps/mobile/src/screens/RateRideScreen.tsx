import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { rateRide, skipRideRating } from '../api/client';
import { useBooking } from '../state/BookingContext';
import { useRide } from '../state/RideContext';
import { colors } from '../theme';
import { driverInitial, driverName, driverVehicle } from '../utils/driver';
import { formatBRL } from '../utils/geo';
import { digitsOnly, formatPhoneNumber } from '../utils/phone';
import { buildStaticPixPayload, toPixPhoneKey } from '../utils/pix';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RateRide'>;

export function RateRideScreen({ navigation, route }: Props) {
  const { raceId } = route.params;
  const { driver, driverPhotoUrl, finalFare, stop } = useRide();
  const { reset } = useBooking();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pixKey = toPixPhoneKey(driver?.phoneNumber);
  const pixAmount = finalFare?.priceToPay ?? null;
  const pixCode =
    pixKey && pixAmount !== null && pixAmount > 0
      ? buildStaticPixPayload({ phoneKey: pixKey, amount: pixAmount })
      : null;

  const copyPix = async () => {
    if (!pixCode) return;
    try {
      await Clipboard.setStringAsync(pixCode);
      setCopied(true);
    } catch {
      Alert.alert('Não foi possível copiar', 'Tente novamente.');
    }
  };

  const sharePix = async () => {
    if (!pixCode) return;
    try {
      await Share.share(
        { message: pixCode, title: 'Código PIX' },
        { dialogTitle: 'Compartilhar código PIX' },
      );
    } catch {
      Alert.alert('Não foi possível compartilhar', 'Tente novamente.');
    }
  };

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => back.remove();
  }, []);

  const finish = async (skip = false) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (skip || (rating === 0 && !comment.trim())) {
        await skipRideRating();
      } else {
        await rateRide(rating, comment.trim());
      }
      stop();
      reset();
      navigation.popToTop();
    } catch {
      setError('Não foi possível enviar a avaliação.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 20) + 16 },
      ]}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Avaliar corrida</Text>
        <Text style={styles.subtitle}>Como foi sua experiência com o taxista?</Text>

        <View style={styles.driverCard}>
          <View style={styles.avatar}>
            {driverPhotoUrl ? (
              <Image source={{ uri: driverPhotoUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{driverInitial(driver)}</Text>
            )}
          </View>
          <View style={styles.driverText}>
            <Text style={styles.driverName}>{driverName(driver)}</Text>
            <Text style={styles.driverCar}>{driverVehicle(driver) || 'Taxi.Rio'}</Text>
            {driver?.phoneNumber ? (
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  void Linking.openURL(
                    `tel:0${digitsOnly(driver.phoneNumber ?? '')}`,
                  ).catch(() => undefined)
                }
                style={({ pressed }) => [styles.phoneLink, pressed && styles.pressed]}
              >
                <Text style={styles.phoneText}>
                  Ligar {formatPhoneNumber(driver.phoneNumber)}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {finalFare &&
        (finalFare.total !== null ||
          finalFare.discount !== null ||
          finalFare.priceToPay !== null) ? (
          <View style={styles.fareCard}>
            <Text style={styles.fareTitle}>Resumo da corrida</Text>
            {finalFare.total !== null ? (
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Total</Text>
                <Text style={styles.fareValue}>{formatBRL(finalFare.total)}</Text>
              </View>
            ) : null}
            {finalFare.discount !== null && finalFare.discount > 0 ? (
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>
                  Desconto{finalFare.discountLabel ? ` (${finalFare.discountLabel})` : ''}
                </Text>
                <Text style={styles.fareValue}>- {formatBRL(finalFare.discount)}</Text>
              </View>
            ) : null}
            {finalFare.tolls !== null && finalFare.tolls > 0 ? (
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Pedágio</Text>
                <Text style={styles.fareValue}>{formatBRL(finalFare.tolls)}</Text>
              </View>
            ) : null}
            {finalFare.priceToPay !== null ? (
              <View style={[styles.fareRow, styles.fareTotalRow]}>
                <Text style={styles.fareTotalLabel}>A pagar</Text>
                <Text style={styles.fareTotalValue}>{formatBRL(finalFare.priceToPay)}</Text>
              </View>
            ) : null}
            {finalFare.paymentLabel ? (
              <Text style={styles.farePayment}>{finalFare.paymentLabel}</Text>
            ) : null}
          </View>
        ) : null}

        {pixCode && pixAmount !== null ? (
          <View style={styles.pixCard}>
            <Text style={styles.pixTitle}>Pagar com PIX</Text>
            <Text style={styles.pixAmount}>{formatBRL(pixAmount)}</Text>
            <Text style={styles.pixKey}>
              Chave PIX (telefone): {formatPhoneNumber(driver?.phoneNumber)}
            </Text>
            <View style={styles.pixActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void copyPix()}
                style={({ pressed }) => [styles.pixPrimary, pressed && styles.pressed]}
              >
                <Text style={styles.pixPrimaryText}>
                  {copied ? 'Código copiado!' : 'Copiar código PIX'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void sharePix()}
                style={({ pressed }) => [styles.pixSecondary, pressed && styles.pressed]}
              >
                <Text style={styles.pixSecondaryText}>Compartilhar</Text>
              </Pressable>
            </View>
            <Text style={styles.pixWarning}>
              Este código só funciona se a chave PIX do motorista for o telefone dele.
              Confirme o nome do recebedor no app do banco antes de pagar.
            </Text>
            <Text style={styles.pixHint}>
              Nome do motorista no app: {driverName(driver)}
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>SUA AVALIAÇÃO</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${value} estrelas`}
              key={value}
              onPress={() => setRating((current) => (current === value ? 0 : value))}
              style={styles.starButton}
            >
              <Text style={[styles.star, value <= rating && styles.starActive]}>★</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>COMENTÁRIO</Text>
        <TextInput
          accessibilityLabel="Comentário da corrida"
          multiline
          onChangeText={setComment}
          placeholder="Digite aqui sua mensagem"
          placeholderTextColor={colors.muted}
          style={styles.comment}
          value={comment}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.raceId}>Solicitação {raceId}</Text>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => void finish(false)}
          style={({ pressed }) => [
            styles.primaryButton,
            submitting && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.primaryText}>Finalizar</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => void finish(true)}
          style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
        >
          <Text style={styles.skipText}>Não quero avaliar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1, paddingHorizontal: 20 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 8, textAlign: 'center' },
  driverCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginTop: 24, padding: 14 },
  avatar: { alignItems: 'center', backgroundColor: colors.text, borderRadius: 24, height: 48, justifyContent: 'center', overflow: 'hidden', width: 48 },
  avatarImage: { height: '100%', width: '100%' },
  avatarText: { color: colors.pin, fontSize: 20, fontWeight: '900' },
  driverText: { flex: 1, marginLeft: 12 },
  driverName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  driverCar: { color: colors.muted, fontSize: 12, marginTop: 3 },
  phoneLink: { marginTop: 4 },
  phoneText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  fareCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  fareTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  fareRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  fareLabel: { color: colors.muted, fontSize: 13 },
  fareValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  fareTotalRow: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  fareTotalLabel: { color: colors.text, fontSize: 15, fontWeight: '900' },
  fareTotalValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  farePayment: { color: colors.muted, fontSize: 11, marginTop: 8 },
  pixCard: {
    backgroundColor: colors.surface,
    borderColor: colors.pin,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  pixTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  pixAmount: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 2 },
  pixKey: { color: colors.muted, fontSize: 11, marginTop: 2 },
  pixActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pixPrimary: {
    alignItems: 'center',
    backgroundColor: colors.text,
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  pixPrimaryText: { color: colors.surface, fontSize: 13, fontWeight: '900' },
  pixSecondary: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  pixSecondaryText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  pixWarning: { color: colors.danger, fontSize: 11, lineHeight: 16, marginTop: 10 },
  pixHint: { color: colors.muted, fontSize: 11, marginTop: 4 },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 24 },
  stars: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  starButton: { paddingHorizontal: 7, paddingVertical: 4 },
  star: { color: colors.border, fontSize: 42 },
  starActive: { color: colors.pin },
  comment: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.text, fontSize: 14, marginTop: 8, minHeight: 110, padding: 14, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 12, marginTop: 10, textAlign: 'center' },
  raceId: { color: colors.muted, fontSize: 11, marginTop: 12, textAlign: 'center' },
  actions: { gap: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.pin, borderRadius: 12, justifyContent: 'center', minHeight: 52 },
  primaryText: { color: colors.text, fontSize: 15, fontWeight: '900' },
  skipButton: { alignItems: 'center', minHeight: 42, justifyContent: 'center' },
  skipText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
