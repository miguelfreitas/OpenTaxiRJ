import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { cancelRide } from '../api/client';
import { DriverMarker, OriginPin } from '../components/OriginPin';
import { OSM_STYLE_URL } from '../mapStyle';
import { useBooking } from '../state/BookingContext';
import { useRide } from '../state/RideContext';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { formatBRL, formatDistance, formatDuration, toLngLat } from '../utils/geo';

type Props = NativeStackScreenProps<RootStackParamList, 'Ride'>;

export function RideScreen({ navigation, route: navRoute }: Props) {
  const { origin, destination, route, fare, reset } = useBooking();
  const { stage, statusId, connection, driver, driverPosition, liveRoute, start, stop } = useRide();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);
  const allowLeaveRef = useRef(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { raceId } = navRoute.params;
  const activeRoute = liveRoute ?? route;

  useEffect(() => {
    start(raceId);
    return () => stop();
  }, [raceId, start, stop]);

  useEffect(() => {
    const hardwareBack = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stage === 'finished') {
        allowLeaveRef.current = true;
        reset();
        navigation.popToTop();
        return true;
      }
      setConfirmVisible(true);
      return true;
    });
    const removeListener = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      setConfirmVisible(true);
    });
    return () => {
      hardwareBack.remove();
      removeListener();
    };
  }, [navigation, reset, stage]);

  useEffect(() => {
    if (!activeRoute?.coordinates.length) return;
    const lngs = activeRoute.coordinates.map(([lng]) => lng);
    const lats = activeRoute.coordinates.map(([, lat]) => lat);
    cameraRef.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      {
        padding: { top: 70, right: 36, bottom: 36, left: 36 },
        duration: 500,
      },
    );
  }, [activeRoute]);

  useEffect(() => {
    if (stage !== 'finished') return;
    allowLeaveRef.current = true;
    navigation.replace('RateRide', { raceId });
  }, [navigation, raceId, stage]);

  useEffect(() => {
    if (statusId !== 103) return;
    allowLeaveRef.current = true;
    stop();
    reset();
    navigation.popToTop();
  }, [navigation, reset, statusId, stop]);

  const goHomeAfterRide = () => {
    allowLeaveRef.current = true;
    stop();
    reset();
    navigation.popToTop();
  };

  const confirmCancel = async () => {
    setCancelling(true);
    try {
      await cancelRide();
      setConfirmVisible(false);
      goHomeAfterRide();
    } catch (cause) {
      Alert.alert(
        'Não foi possível cancelar',
        cause instanceof Error ? cause.message : 'Tente novamente.',
      );
    } finally {
      setCancelling(false);
    }
  };

  const title =
    stage === 'waiting'
      ? 'Motorista a caminho'
      : stage === 'in_race'
        ? 'Corrida em andamento'
        : stage === 'finished'
          ? 'Corrida finalizada'
          : 'Buscando motorista';

  const subtitle =
    stage === 'waiting'
      ? 'O taxista aceitou sua corrida e está a caminho.'
      : stage === 'in_race'
        ? 'Você está em corrida com o taxista.'
        : stage === 'finished'
          ? 'A corrida foi concluída.'
          : 'Aguarde enquanto encontramos um taxista próximo.';

  const routeGeoJson = activeRoute
    ? {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: activeRoute.coordinates },
      }
    : null;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <Map
        style={styles.map}
        mapStyle={OSM_STYLE_URL}
        androidView="texture"
        logo={false}
        attribution
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: toLngLat(origin?.coordinate ?? { latitude: -22.9068, longitude: -43.1729 }),
            zoom: 12,
          }}
        />
        {routeGeoJson ? (
          <GeoJSONSource id="ride-route" data={routeGeoJson}>
            <Layer
              id="ride-route-line"
              type="line"
              source="ride-route"
              paint={{ 'line-color': colors.accent, 'line-opacity': 0.95, 'line-width': 5 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        ) : null}
        {origin ? (
          <Marker lngLat={toLngLat(origin.coordinate)} anchor="bottom">
            <OriginPin />
          </Marker>
        ) : null}
        {destination ? (
          <Marker lngLat={toLngLat(destination.coordinate)} anchor="bottom">
            <OriginPin color={colors.pin} />
          </Marker>
        ) : null}
        {driverPosition ? (
          <Marker lngLat={toLngLat(driverPosition)} anchor="center">
            <DriverMarker />
          </Marker>
        ) : null}
      </Map>

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => {
            if (stage === 'finished') {
              navigation.replace('RateRide', { raceId });
            } else {
              setConfirmVisible(true);
            }
          }}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.topText}>
          <Text style={styles.topTitle}>{title}</Text>
          <Text style={styles.topSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.brand}>
          <Text style={styles.brandTitle}>OPEN</Text>
          <Text style={styles.brandSub}>TAXI RJ</Text>
        </View>
      </View>

      <View
        style={[
          styles.bottomSheet,
          { paddingBottom: Math.max(insets.bottom, 20) + 8 },
        ]}
      >
        <View style={styles.handle} />
        <View style={styles.statusRow}>
          <View style={styles.statusDotWrap}>
            {stage === 'finding' || connection === 'connecting' ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <View style={[styles.statusDot, stage === 'finished' && styles.statusDotDone]} />
            )}
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{title}</Text>
            <Text style={styles.statusSubtitle}>
              {connection === 'closed'
                ? 'Conexão com o servidor perdida.'
                : `Solicitação ${raceId}${statusId ? ` · status ${statusId}` : ''}`}
            </Text>
          </View>
        </View>

        <View style={styles.routeCard}>
          <View style={styles.placeRow}>
            <View style={styles.originDot} />
            <View style={styles.placeText}>
              <Text numberOfLines={1} style={styles.placeLabel}>
                {origin?.shortLabel ?? 'Origem'}
              </Text>
              <Text numberOfLines={1} style={styles.placeSub}>
                {origin?.label ?? ''}
              </Text>
            </View>
          </View>
          <View style={styles.placeRow}>
            <View style={styles.destinationDot} />
            <View style={styles.placeText}>
              <Text numberOfLines={1} style={styles.placeLabel}>
                {destination?.shortLabel ?? 'Destino'}
              </Text>
              <Text numberOfLines={1} style={styles.placeSub}>
                {destination?.label ?? ''}
              </Text>
            </View>
          </View>
          {activeRoute ? (
            <View style={styles.metrics}>
              <Text style={styles.metric}>{formatDistance(activeRoute.distanceMeters)}</Text>
              <Text style={styles.metricSeparator}>·</Text>
              <Text style={styles.metric}>{formatDuration(activeRoute.durationSeconds)}</Text>
              {fare ? (
                <>
                  <Text style={styles.metricSeparator}>·</Text>
                  <Text style={styles.metric}>{formatBRL(fare.amount)}</Text>
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        {driver ? (
          <View style={styles.driverCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{driver.name?.charAt(0) ?? 'M'}</Text>
            </View>
            <View style={styles.driverText}>
              <Text style={styles.driverName}>{driver.name ?? 'Motorista'}</Text>
              <Text style={styles.driverCar}>
                {[driver.carModel, driver.carPlate].filter(Boolean).join(' · ') ||
                  'Dados do veículo aguardando'}
              </Text>
            </View>
          </View>
        ) : null}

        {stage === 'finished' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.replace('RateRide', { raceId })}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>Avaliar corrida</Text>
          </Pressable>
        ) : (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={cancelling}
              onPress={() => setConfirmVisible(true)}
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.pressed,
                cancelling && styles.disabled,
              ]}
            >
              <Text style={styles.cancelText}>Cancelar Corrida?</Text>
            </Pressable>
            {stage === 'waiting' || stage === 'in_race' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('Chat', { raceId })}
                style={({ pressed }) => [styles.messageButton, pressed && styles.pressed]}
              >
                <Text style={styles.messageText}>Mensagem</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
        transparent
        visible={confirmVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancelar corrida</Text>
            <Text style={styles.modalMessage}>Deseja cancelar a corrida?</Text>
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={cancelling}
                onPress={() => setConfirmVisible(false)}
                style={({ pressed }) => [styles.modalSecondary, pressed && styles.pressed]}
              >
                <Text style={styles.modalSecondaryText}>Não</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={cancelling}
                onPress={() => void confirmCancel()}
                style={({ pressed }) => [
                  styles.modalPrimary,
                  pressed && styles.pressed,
                  cancelling && styles.disabled,
                ]}
              >
                {cancelling ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Sim, cancelar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  map: { flex: 0.45 },
  topBar: {
    alignItems: 'flex-start',
    backgroundColor: colors.text,
    flexDirection: 'row',
    left: 0,
    paddingBottom: 12,
    paddingHorizontal: 18,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  backButton: { paddingRight: 10, paddingTop: 2 },
  backText: { color: colors.surface, fontSize: 30, fontWeight: '300', lineHeight: 30 },
  topText: { flex: 1 },
  topTitle: { color: colors.surface, fontSize: 18, fontWeight: '800' },
  topSubtitle: { color: '#C8D4DA', fontSize: 11, marginTop: 2 },
  brand: { alignItems: 'flex-end' },
  brandTitle: { color: colors.pin, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  brandSub: { color: colors.surface, fontSize: 9, fontWeight: '700', letterSpacing: 1.3 },
  bottomSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    elevation: 12,
    flex: 0.55,
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  handle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: 2, height: 4, marginBottom: 12, width: 42 },
  statusRow: { alignItems: 'center', flexDirection: 'row' },
  statusDotWrap: { alignItems: 'center', height: 30, justifyContent: 'center', width: 30 },
  statusDot: { backgroundColor: colors.pin, borderRadius: 7, height: 14, width: 14 },
  statusDotDone: { backgroundColor: colors.accent },
  statusCopy: { flex: 1, marginLeft: 8 },
  statusTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  statusSubtitle: { color: colors.muted, fontSize: 11, marginTop: 1 },
  routeCard: { backgroundColor: colors.background, borderRadius: 14, marginTop: 12, padding: 12 },
  placeRow: { alignItems: 'center', flexDirection: 'row', marginVertical: 3 },
  originDot: { backgroundColor: colors.pin, borderRadius: 5, height: 10, marginRight: 10, width: 10 },
  destinationDot: { backgroundColor: colors.pin, borderRadius: 2, height: 10, marginRight: 10, width: 10 },
  placeText: { flex: 1 },
  placeLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  placeSub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  metrics: { alignItems: 'center', flexDirection: 'row', marginTop: 8 },
  metric: { color: colors.text, fontSize: 12, fontWeight: '700' },
  metricSeparator: { color: colors.muted, marginHorizontal: 6 },
  driverCard: { alignItems: 'center', backgroundColor: '#FFF7D6', borderRadius: 14, flexDirection: 'row', marginTop: 10, padding: 12 },
  avatar: { alignItems: 'center', backgroundColor: colors.text, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  avatarText: { color: colors.pin, fontSize: 18, fontWeight: '900' },
  driverText: { flex: 1, marginLeft: 10 },
  driverName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  driverCar: { color: colors.muted, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 50 },
  cancelText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  messageButton: { alignItems: 'center', backgroundColor: colors.text, borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 50 },
  messageText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.pin, borderRadius: 12, justifyContent: 'center', marginTop: 14, minHeight: 50 },
  primaryButtonText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.5 },
  modalBackdrop: { alignItems: 'center', backgroundColor: '#00000066', flex: 1, justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 18, padding: 20, width: '100%' },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  modalMessage: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalSecondary: { alignItems: 'center', borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  modalSecondaryText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  modalPrimary: { alignItems: 'center', backgroundColor: colors.pin, borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 48 },
  modalPrimaryText: { color: colors.text, fontSize: 14, fontWeight: '900' },
});
