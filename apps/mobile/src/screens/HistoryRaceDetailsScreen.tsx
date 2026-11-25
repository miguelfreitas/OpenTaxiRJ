import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getRaceHistoryById } from '../api/client';
import type { RaceHistoryItem } from '../api/client';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';
import { formatBRL } from '../utils/geo';
import { parseBRL } from '../utils/money';
import {
  formatRaceDate,
  raceDestination,
  raceDiscount,
  raceDiscountLabel,
  raceDistance,
  raceDriverName,
  raceDriverVehicle,
  raceDuration,
  raceOrigin,
  racePayment,
  raceStatus,
} from '../utils/raceHistory';

type Props = NativeStackScreenProps<RootStackParamList, 'HistoryRaceDetails'>;

function statusPillStyle(tone: ReturnType<typeof raceStatus>['tone']) {
  switch (tone) {
    case 'danger':
      return [styles.statusPill, styles.statusDanger];
    case 'warning':
      return [styles.statusPill, styles.statusWarning];
    case 'success':
      return [styles.statusPill, styles.statusSuccess];
    default:
      return styles.statusPill;
  }
}

function statusTextStyle(tone: ReturnType<typeof raceStatus>['tone']) {
  switch (tone) {
    case 'danger':
      return styles.statusDangerText;
    case 'warning':
      return styles.statusWarningText;
    case 'success':
      return styles.statusSuccessText;
    default:
      return styles.statusText;
  }
}

function tollTotal(item: RaceHistoryItem) {
  if (!Array.isArray(item.tolls)) return 0;
  return item.tolls.reduce<number>((sum, toll) => {
    if (typeof toll === 'number') return sum + (Number.isFinite(toll) ? toll : 0);
    if (typeof toll === 'string') return sum + (parseBRL(toll) ?? 0);
    if (toll && typeof toll === 'object' && 'value' in toll) {
      return sum + (parseBRL((toll as { value?: unknown }).value) ?? 0);
    }
    return sum;
  }, 0);
}

export function HistoryRaceDetailsScreen({ navigation, route }: Props) {
  const { raceId } = route.params;
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<RaceHistoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getRaceHistoryById(raceId)
      .then((next) => {
        if (active) setItem(next);
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar os detalhes da corrida.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [raceId]);

  const status = item ? raceStatus(item) : null;
  const total = item ? parseBRL(item.total) : null;
  const discount = item ? raceDiscount(item) : null;
  const tolls = item ? tollTotal(item) : 0;
  const amount = item ? parseBRL(item.priceToPay ?? item.total ?? item.estimatedPrice) : null;
  const payment = item ? racePayment(item) : null;
  const distance = item ? raceDistance(item) : null;
  const duration = item ? raceDuration(item) : null;
  const driverName = item ? raceDriverName(item) : null;
  const driverVehicle = item ? raceDriverVehicle(item) : null;
  const discountLabel = item ? raceDiscountLabel(item) : null;
  const origin = item ? raceOrigin(item) || 'Origem não disponível' : '';
  const destination = item ? raceDestination(item) || 'Destino não disponível' : '';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 24) + 28 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ Voltar</Text>
        </Pressable>

        <Text style={styles.title}>Detalhes da Corrida</Text>
        <Text style={styles.description}>Solicitação {raceId}</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.text} size="large" />
            <Text style={styles.centerText}>Carregando detalhes…</Text>
          </View>
        ) : error || !item ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Não foi possível carregar</Text>
            <Text style={styles.centerText}>
              {error ?? 'Corrida não encontrada.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLoading(true);
                setError(null);
                getRaceHistoryById(raceId)
                  .then(setItem)
                  .catch(() => setError('Não foi possível carregar os detalhes da corrida.'))
                  .finally(() => setLoading(false));
              }}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.headerCard}>
              <View style={styles.headerRow}>
                <Text style={styles.dateText}>{formatRaceDate(item.createdAt)}</Text>
                {status ? (
                  <View style={statusPillStyle(status.tone)}>
                    <Text style={[styles.statusText, statusTextStyle(status.tone)]}>
                      {status.label}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.metricsRow}>
                {distance ? <Text style={styles.metric}>{distance}</Text> : null}
                {duration ? <Text style={styles.metric}>{duration}</Text> : null}
                {amount !== null ? <Text style={styles.metric}>{formatBRL(amount)}</Text> : null}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>TRAJETO</Text>
              <View style={styles.placeRow}>
                <View style={[styles.placeDot, styles.originDot]} />
                <View style={styles.placeCopy}>
                  <Text style={styles.placeEyebrow}>ORIGEM</Text>
                  <Text style={styles.placeText}>{origin}</Text>
                </View>
              </View>
              <View style={styles.placeRow}>
                <View style={[styles.placeDot, styles.destinationDot]} />
                <View style={styles.placeCopy}>
                  <Text style={styles.placeEyebrow}>DESTINO</Text>
                  <Text style={styles.placeText}>{destination}</Text>
                </View>
              </View>
            </View>

            {driverName || driverVehicle ? (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>MOTORISTA</Text>
                <Text style={styles.driverName}>{driverName ?? 'Motorista'}</Text>
                {driverVehicle ? <Text style={styles.driverVehicle}>{driverVehicle}</Text> : null}
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>PAGAMENTO</Text>
              {total !== null ? (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Total</Text>
                  <Text style={styles.fareValue}>{formatBRL(total)}</Text>
                </View>
              ) : null}
              {discount !== null && discount > 0 ? (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>
                    Desconto{discountLabel ? ` (${discountLabel})` : ''}
                  </Text>
                  <Text style={styles.fareValue}>- {formatBRL(discount)}</Text>
                </View>
              ) : null}
              {tolls > 0 ? (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Pedágio</Text>
                  <Text style={styles.fareValue}>{formatBRL(tolls)}</Text>
                </View>
              ) : null}
              {amount !== null ? (
                <View style={[styles.fareRow, styles.fareTotalRow]}>
                  <Text style={styles.fareTotalLabel}>Valor da Corrida</Text>
                  <Text style={styles.fareTotalValue}>{formatBRL(amount)}</Text>
                </View>
              ) : null}
              {payment ? <Text style={styles.paymentText}>{payment}</Text> : null}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 20 },
  backButton: { alignSelf: 'flex-start' },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 18 },
  description: { color: colors.muted, fontSize: 12, marginTop: 6 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingVertical: 48 },
  centerText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'center' },
  errorTitle: { color: colors.text, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  retryButton: { backgroundColor: colors.pin, borderRadius: 12, marginTop: 18, paddingHorizontal: 18, paddingVertical: 12 },
  retryText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  pressed: { opacity: 0.75 },
  headerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 22,
    padding: 16,
  },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  dateText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  statusPill: { backgroundColor: '#EEF2F5', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusSuccess: { backgroundColor: '#E6F4EA' },
  statusSuccessText: { color: '#1E6B35' },
  statusWarning: { backgroundColor: '#FFF3CD' },
  statusWarningText: { color: '#7A5B00' },
  statusDanger: { backgroundColor: '#FDECEA' },
  statusDangerText: { color: colors.danger },
  statusText: { color: colors.muted, fontSize: 10, fontWeight: '900' },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metric: { backgroundColor: colors.background, borderRadius: 8, color: colors.muted, fontSize: 12, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 5 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
  },
  sectionLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.6, marginBottom: 10 },
  placeRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 10 },
  placeDot: { borderRadius: 5, height: 10, marginRight: 10, marginTop: 5, width: 10 },
  originDot: { backgroundColor: colors.pin },
  destinationDot: { backgroundColor: colors.text },
  placeCopy: { flex: 1 },
  placeEyebrow: { color: colors.muted, fontSize: 9, fontWeight: '800' },
  placeText: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 2 },
  driverName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  driverVehicle: { color: colors.muted, fontSize: 12, marginTop: 4 },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  fareLabel: { color: colors.muted, fontSize: 13 },
  fareValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  fareTotalRow: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 13, paddingTop: 12 },
  fareTotalLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  fareTotalValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  paymentText: { color: colors.muted, fontSize: 12, marginTop: 10 },
});
