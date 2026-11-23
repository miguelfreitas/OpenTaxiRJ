import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  API_BASE_URL,
  cancelRide,
  createRide,
  isNoCancelableRideError,
  getFareOptions,
  getMyOriginCity,
  getRouteDetails,
} from '../api/client';
import { getDrivingRoute } from '../services/routing';
import { OriginPin } from '../components/OriginPin';
import { OSM_STYLE_URL } from '../mapStyle';
import { useAuth } from '../state/AuthContext';
import { useBooking } from '../state/BookingContext';
import { colors } from '../theme';
import type { FareOption, RouteInfo } from '../types/booking';
import type { RootStackParamList } from '../navigation/types';
import { formatApiError } from '../utils/diagnostics';
import { formatBRL, formatDistance, formatDuration, toLngLat } from '../utils/geo';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteFare'>;

const moneyPayment = {
  id: 'money',
  label: 'Dinheiro',
  description: 'Pague diretamente ao motorista',
};

const fallbackPayment = {
  pindex: 0,
  paymentId: 'money',
  name: 'Dinheiro',
};

const activeStatuses = new Set([100, 110, 111, 112]);

export function RouteFareScreen({ navigation }: Props) {
  const { origin, destination, setRoute, setFare } = useBooking();
  const { profile, refreshProfile, clearActiveRide } = useAuth();
  const associatedPayment = profile?.associatedPaymentMethod ?? fallbackPayment;
  const eligiblePaymentId = profile?.listEligiblePaymentMethodsNative?.find(
    (item) => Number(item.pindex) === Number(associatedPayment.pindex),
  )?.paymentMethodId;
  const payment = useMemo(
    () =>
      eligiblePaymentId && !associatedPayment.paymentId
        ? { ...associatedPayment, paymentId: eligiblePaymentId }
        : associatedPayment,
    [associatedPayment, eligiblePaymentId],
  );
  const cityId = profile?.city?.cityId ?? '1';
  const [activeCityId, setActiveCityId] = useState(String(cityId));
  const cameraRef = useRef<CameraRef>(null);
  const insets = useSafeAreaInsets();
  const [route, setLocalRoute] = useState<RouteInfo | null>(null);
  const [fares, setFares] = useState<FareOption[]>([]);
  const [fare, setLocalFare] = useState<FareOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!origin || !destination) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      setDetail(null);
      try {
        let nextRoute;
        try {
          nextRoute = await getRouteDetails(origin, destination);
        } catch (routeCause) {
          try {
            nextRoute = await getDrivingRoute(origin.coordinate, destination.coordinate);
          } catch (fallbackCause) {
            throw new Error(
              `Rota: ${formatApiError(routeCause, 'servidor')} / fallback: ${formatApiError(fallbackCause)}`,
            );
          }
        }
        if (!active) return;
        setLocalRoute(nextRoute);
        setRoute(nextRoute);
        const originCity = await getMyOriginCity(origin.coordinate).catch(() => null);
        const resolvedCityId = String(originCity?.cityId ?? cityId);
        setActiveCityId(resolvedCityId);
        const options = await getFareOptions(origin, destination, payment, resolvedCityId);
        if (!active) return;
        setFares(options);
        setLocalFare(options[0]);
        setFare(options[0]);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Não foi possível calcular a corrida.');
        setDetail(
          `${formatApiError(cause, `tarifas (pindex ${payment?.pindex ?? 'auto'} ${typeof payment?.pindex}, paymentId ${payment?.paymentId ?? 'null'}, city ${activeCityId})`)}
` +
            `Servidor: ${API_BASE_URL}`,
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [cityId, origin, destination, payment, setFare, setRoute]);

  useEffect(() => {
    if (!route?.coordinates.length) return;
    const lngs = route.coordinates.map(([lng]) => lng);
    const lats = route.coordinates.map(([, lat]) => lat);
    cameraRef.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      {
        padding: { top: 130, right: 40, bottom: 40, left: 40 },
        duration: 500,
      },
    );
  }, [route]);

  if (!origin || !destination) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Defina a origem e o destino primeiro.</Text>
        <Pressable onPress={() => navigation.popToTop()} style={styles.retryButton}>
          <Text style={styles.retryText}>Escolher origem</Text>
        </Pressable>
      </View>
    );
  }

  const routeGeoJson = route
    ? {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: route.coordinates,
        },
      }
    : null;

  const cancelExisting = () => {
    Alert.alert(
      'Cancelar corrida',
      'Existe uma corrida aguardando taxista. Deseja cancelá-la?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Cancelar corrida',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await cancelRide();
              setError(null);
              setDetail(null);
              clearActiveRide();
              navigation.popToTop();
            } catch (cause) {
              if (isNoCancelableRideError(cause)) {
                setError(null);
                setDetail(null);
                clearActiveRide();
                navigation.popToTop();
                return;
              }
              try {
                const nextProfile = await refreshProfile();
                const race = nextProfile?.currentRace;
                const status = Number(race?.statusId ?? nextProfile?.statusId);
                if (!race || !activeStatuses.has(status)) {
                  setError(null);
                  setDetail(null);
                  clearActiveRide();
                  navigation.popToTop();
                  return;
                }
              } catch {}
              setError(cause instanceof Error ? cause.message : 'Não foi possível cancelar a corrida.');
              setDetail(formatApiError(cause, 'cancelamento'));
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  const submit = async () => {
    if (!route || !fare) return;
    setSubmitting(true);
    setError(null);
    try {
      const race = await createRide(origin, destination, route, fare, payment, activeCityId);
      if (!race.raceId) {
        const nextProfile = await refreshProfile();
        const recovered = nextProfile?.currentRace;
        if (!recovered?.raceId) throw new Error('Resposta inválida ao solicitar a corrida.');
        const recoveredStatus = Number(recovered.statusId ?? nextProfile?.statusId ?? 100);
        navigation.navigate('Ride', {
          raceId: recovered.raceId,
          initialStatusId: activeStatuses.has(recoveredStatus) ? recoveredStatus : 100,
        });
        return;
      }
      navigation.navigate('Ride', {
        raceId: race.raceId,
        initialStatusId: race.statusId,
      });
    } catch (cause) {
      try {
        const nextProfile = await refreshProfile();
        const recovered = nextProfile?.currentRace;
        const status = Number(recovered?.statusId ?? nextProfile?.statusId);
        if (recovered?.raceId && activeStatuses.has(status)) {
          navigation.navigate('Ride', { raceId: recovered.raceId, initialStatusId: status });
          return;
        }
      } catch {}
      setError(cause instanceof Error ? cause.message : 'Não foi possível solicitar a corrida.');
      setDetail(`${formatApiError(cause, 'solicitação')}
Servidor: ${API_BASE_URL}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.mapWrap}>
        <Map
          style={styles.map}
          mapStyle={OSM_STYLE_URL}
          androidView="texture"
          logo={false}
          attribution
        >
          <Camera
            ref={cameraRef}
            initialViewState={{ center: toLngLat(origin.coordinate), zoom: 12 }}
          />
          {routeGeoJson ? (
            <GeoJSONSource id="route" data={routeGeoJson}>
              <Layer
                id="route-line"
                type="line"
                source="route"
                paint={{
                  'line-color': colors.accent,
                  'line-opacity': 0.9,
                  'line-width': 5,
                }}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              />
            </GeoJSONSource>
          ) : null}
          <Marker lngLat={toLngLat(origin.coordinate)} anchor="bottom">
            <OriginPin />
          </Marker>
          <Marker lngLat={toLngLat(destination.coordinate)} anchor="bottom">
            <OriginPin color={colors.accent} />
          </Marker>
        </Map>
      </View>

      <View style={[styles.topBar, { top: insets.top + 12 }]}>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Voltar</Text>
        </Pressable>
        <Text style={styles.topTitle}>Revisar corrida</Text>
      </View>

      <View
        style={[
          styles.bottomSheet,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        <View style={styles.handle} />
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.loadingText}>Calculando rota e tarifa…</Text>
          </View>
        ) : error ? (
          <View>
            <Text style={styles.errorTitle}>Não foi possível continuar</Text>
            <Text style={styles.errorText}>{error}</Text>
            {detail ? <Text style={styles.errorDetail}>{detail}</Text> : null}
            {error ? (
              <Pressable
                disabled={cancelling}
                onPress={cancelExisting}
                style={[styles.retryButton, styles.cancelRideButton]}
              >
                <Text style={styles.cancelRideText}>
                  {cancelling ? 'Cancelando…' : 'Cancelar corrida existente'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => navigation.goBack()} style={styles.retryButton}>
              <Text style={styles.retryText}>Voltar</Text>
            </Pressable>
          </View>
        ) : (
          <>
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.eyebrow}>SUA CORRIDA</Text>
            <View style={styles.placeRow}>
              <View style={styles.originDot} />
              <View style={styles.placeText}>
                <Text numberOfLines={1} style={styles.placeLabel}>{origin.shortLabel}</Text>
                <Text numberOfLines={1} style={styles.placeSub}>{origin.label}</Text>
              </View>
            </View>
            <View style={styles.placeRow}>
              <View style={styles.destinationDot} />
              <View style={styles.placeText}>
                <Text numberOfLines={1} style={styles.placeLabel}>{destination.shortLabel}</Text>
                <Text numberOfLines={1} style={styles.placeSub}>{destination.label}</Text>
              </View>
            </View>

            {route ? (
              <View style={styles.metrics}>
                <Text style={styles.metric}>{formatDistance(route.distanceMeters)}</Text>
                <Text style={styles.metricSeparator}>·</Text>
                <Text style={styles.metric}>{formatDuration(route.durationSeconds)}</Text>
                {route.source === 'fallback' || route.source === 'server-fallback' ? <Text style={styles.approx}>rota aproximada</Text> : null}
              </View>
            ) : null}

            <Text style={styles.discountTitle}>Selecione o desconto</Text>
            <View style={styles.discountHeader}>
              <Text style={[styles.discountHeaderText, styles.discountName]}>Desconto</Text>
              <Text style={[styles.discountHeaderText, styles.discountDrivers]}>Taxistas{`\n`}Disponíveis</Text>
              <Text style={[styles.discountHeaderText, styles.discountValue]}>Valor{`\n`}Estimado</Text>
            </View>
            {fares.map((option) => {
              const selected = fare?.id === option.id;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={option.id}
                  onPress={() => {
                    setLocalFare(option);
                    setFare(option);
                  }}
                  style={({ pressed }) => [
                    styles.discountRow,
                    selected && styles.discountRowSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.discountName}>
                    <Text style={styles.discountFare}>{option.label}</Text>
                    <Text style={styles.discountFlag}>{option.flag}</Text>
                  </View>
                  <Text style={[styles.discountDrivers, styles.discountNumber]}>
                    {option.drivers}
                  </Text>
                  <Text style={[styles.discountValue, styles.discountPrice]}>
                    {formatBRL(option.amount)}
                  </Text>
                  <View style={[styles.selectMark, selected && styles.selectMarkActive]}>
                    <Text style={styles.selectMarkText}>{selected ? 'OK' : ''}</Text>
                  </View>
                </Pressable>
              );
            })}

            <Text style={styles.sectionLabel}>PAGAMENTO</Text>
            <View style={styles.paymentCard}>
              <View style={styles.radio}>
                <View style={styles.radioDot} />
              </View>
              <View style={styles.paymentText}>
                <Text style={styles.paymentLabel}>{moneyPayment.label}</Text>
                <Text style={styles.paymentSub}>{moneyPayment.description}</Text>
              </View>
            </View>

          </ScrollView>
          <Pressable
            accessibilityRole="button"
            disabled={submitting || !route || !fare}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.primaryButton,
              (submitting || !route || !fare) && styles.buttonDisabled,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.primaryButtonText}>Solicitar corrida</Text>
            )}
          </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  mapWrap: { flex: 0.42 },
  map: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  topBar: { left: 16, position: 'absolute', right: 16 },
  backButton: { alignSelf: 'flex-start' },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  topTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 4 },
  bottomSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 12,
    flex: 0.58,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  handle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: 2, height: 4, marginBottom: 14, width: 42 },
  sheetContent: { paddingBottom: 12 },
  sheetScroll: { flex: 1 },
  loading: { alignItems: 'center', paddingVertical: 32 },
  loadingText: { color: colors.muted, marginTop: 12 },
  errorTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 4 },
  errorText: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  errorDetail: {
    color: colors.muted,
    fontFamily: 'monospace',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  retryButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 12, borderWidth: 1, marginTop: 16, paddingVertical: 12 },
  retryText: { color: colors.text, fontWeight: '700' },
  cancelRideButton: { borderColor: colors.danger, marginTop: 8 },
  cancelRideText: { color: colors.danger, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  placeRow: { alignItems: 'center', flexDirection: 'row', marginTop: 12 },
  originDot: { backgroundColor: colors.pin, borderRadius: 5, height: 10, marginRight: 12, width: 10 },
  destinationDot: { backgroundColor: colors.accent, borderRadius: 5, height: 10, marginRight: 12, width: 10 },
  placeText: { flex: 1 },
  placeLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  placeSub: { color: colors.muted, fontSize: 12, marginTop: 1 },
  metrics: { alignItems: 'center', flexDirection: 'row', marginTop: 14 },
  metric: { color: colors.text, fontSize: 14, fontWeight: '600' },
  metricSeparator: { color: colors.muted, marginHorizontal: 7 },
  approx: { color: colors.muted, fontSize: 11, marginLeft: 8 },
  discountTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  discountHeader: { alignItems: 'center', backgroundColor: colors.text, borderRadius: 12, flexDirection: 'row', marginTop: 8, paddingHorizontal: 10, paddingVertical: 10 },
  discountHeaderText: { color: colors.surface, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  discountName: { flex: 1.2 },
  discountDrivers: { flex: 0.9 },
  discountValue: { flex: 1 },
  discountRow: { alignItems: 'center', backgroundColor: '#FFF3CC', borderRadius: 12, flexDirection: 'row', marginTop: 6, minHeight: 52, paddingLeft: 12 },
  discountRowSelected: { borderColor: colors.accent, borderWidth: 1 },
  discountFare: { color: colors.text, fontSize: 14, fontWeight: '800' },
  discountFlag: { color: colors.muted, fontSize: 10, marginTop: 2 },
  discountNumber: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  discountPrice: { color: colors.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  selectMark: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: '#FFE08A', borderBottomRightRadius: 12, borderTopRightRadius: 12, justifyContent: 'center', marginLeft: 8, width: 58 },
  selectMarkActive: { backgroundColor: '#FFD45E' },
  selectMarkText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginTop: 14 },
  paymentCard: { alignItems: 'center', borderColor: colors.accent, borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginTop: 8, padding: 14 },
  radio: { alignItems: 'center', borderColor: colors.accent, borderRadius: 10, borderWidth: 2, height: 20, justifyContent: 'center', marginRight: 12, width: 20 },
  radioDot: { backgroundColor: colors.accent, borderRadius: 5, height: 10, width: 10 },
  paymentText: { flex: 1 },
  paymentLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  paymentSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 12, justifyContent: 'center', marginTop: 18, minHeight: 52, paddingHorizontal: 16 },
  primaryButtonPressed: { backgroundColor: colors.accentPressed },
  primaryButtonText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  buttonDisabled: { opacity: 0.5 },
});
