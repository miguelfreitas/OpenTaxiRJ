import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Camera,
  Map,
  Marker,
  type CameraRef,
  type LngLat,
  type PressEvent,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OriginDot, OriginPin } from '../components/OriginPin';
import { reversePlace, searchPlaces } from '../services/geocoding';
import { addAddressHistory, loadAddressHistory } from '../services/addressHistory';
import { OSM_STYLE_URL } from '../mapStyle';
import { colors } from '../theme';
import type { Coordinate, Place } from '../types/booking';
import { formatCoordinate, fromLngLat, toLngLat } from '../utils/geo';

const RIO_DE_JANEIRO: Coordinate = { latitude: -22.9068, longitude: -43.1729 };

type PlacePickerProps = {
  title: string;
  eyebrow: string;
  submitLabel: string;
  initialPlace: Place | null;
  fallbackCoordinate?: Coordinate;
  secondaryPlace?: Place | null;
  showGps?: boolean;
  useGpsOnMount?: boolean;
  onBack?: () => void;
  onAccountPress?: () => void;
  onSubmit: (place: Place) => void;
};

export function PlacePicker({
  title,
  eyebrow,
  submitLabel,
  initialPlace,
  fallbackCoordinate,
  secondaryPlace,
  showGps = false,
  useGpsOnMount = showGps,
  onBack,
  onAccountPress,
  onSubmit,
}: PlacePickerProps) {
  const cameraRef = useRef<CameraRef>(null);
  const insets = useSafeAreaInsets();
  const initialCoordinate = initialPlace?.coordinate ?? fallbackCoordinate ?? RIO_DE_JANEIRO;
  const [coordinate, setCoordinate] = useState<LngLat>(toLngLat(initialCoordinate));
  const [query, setQuery] = useState(initialPlace?.label ?? '');
  const [address, setAddress] = useState(initialPlace?.label ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [history, setHistory] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);

  const inputFocusedRef = useRef(false);
  const suppressReverseRef = useRef(false);
  const reverseReadyRef = useRef(false);
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveAddress = async (next: Coordinate, force = false) => {
    if (!force && inputFocusedRef.current) return;
    setResolving(true);
    try {
      const place = await reversePlace(next);
      if (!inputFocusedRef.current || force) {
        setAddress(place.label);
        setQuery(place.label);
      }
    } catch {
      if (!inputFocusedRef.current || force) {
        const label = formatCoordinate(next);
        setAddress(label);
        setQuery(label);
      }
    } finally {
      setResolving(false);
    }
  };

  const scheduleReverse = (next: Coordinate) => {
    if (!reverseReadyRef.current || inputFocusedRef.current) return;
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    reverseTimerRef.current = setTimeout(() => {
      void resolveAddress(next);
    }, 550);
  };

  const locateMe = async (initial = false) => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setNotice('Localização indisponível. Busque um endereço ou mova o mapa.');
        if (!initial) {
          Alert.alert(
            'Localização indisponível',
            'Permita o acesso à localização ou ajuste a origem pelo mapa.',
          );
        }
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const nextLngLat = toLngLat(next);
      setNotice(null);
      suppressReverseRef.current = true;
      setCoordinate(nextLngLat);
      cameraRef.current?.flyTo({ center: nextLngLat, zoom: 17, duration: 500 });
      await resolveAddress(next, true);
    } catch {
      setNotice('Não foi possível obter sua localização.');
      if (!initial) {
        Alert.alert(
          'Não foi possível obter a localização',
          'Busque um endereço ou mova o mapa para escolher o ponto.',
        );
      }
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    const readyTimer = setTimeout(() => {
      reverseReadyRef.current = true;
    }, 900);
    void loadAddressHistory().then(setHistory);
    if (useGpsOnMount) {
      void locateMe(true);
    } else if (!initialPlace && !fallbackCoordinate) {
      void resolveAddress(initialCoordinate);
    }
    return () => {
      clearTimeout(readyTimer);
      if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const onChangeQuery = (value: string) => {
    setQuery(value);
    setAddress(value);
    setNotice(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const places = await searchPlaces(value);
        setResults(places);
      } catch {
        setResults([]);
        setNotice('Não foi possível buscar endereços. Tente novamente.');
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const selectPlace = (place: Place) => {
    const next = toLngLat(place.coordinate);
    suppressReverseRef.current = true;
    setCoordinate(next);
    setAddress(place.label);
    setQuery(place.label);
    setResults([]);
    setNotice(null);
    setInputFocused(false);
    inputFocusedRef.current = false;
    Keyboard.dismiss();
    cameraRef.current?.flyTo({ center: next, zoom: 17, duration: 450 });
  };

  const submit = () => {
    const latitude = coordinate[1];
    const longitude = coordinate[0];
    const label = address.trim() || query.trim() || 'Local no mapa';
    const place = {
      id: `pin-${latitude.toFixed(6)},${longitude.toFixed(6)}`,
      label,
      shortLabel: label.split(',')[0] || 'Local',
      coordinate: { latitude, longitude },
    };
    void addAddressHistory(place).then(setHistory);
    onSubmit(place);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <Map
        style={styles.map}
        mapStyle={OSM_STYLE_URL}
        androidView="texture"
        logo={false}
        attribution
        onRegionIsChanging={(event) => setCoordinate(event.nativeEvent.center)}
        onRegionDidChange={(event) => {
          setCoordinate(event.nativeEvent.center);
          if (suppressReverseRef.current) {
            suppressReverseRef.current = false;
            return;
          }
          scheduleReverse(fromLngLat(event.nativeEvent.center));
        }}
        onPress={(event) => {
          const { lngLat } = event.nativeEvent as PressEvent;
          cameraRef.current?.flyTo({ center: lngLat, duration: 350 });
        }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: toLngLat(initialCoordinate), zoom: 15 }}
          minZoom={10}
          maxZoom={19}
        />
        {secondaryPlace ? (
          <Marker lngLat={toLngLat(secondaryPlace.coordinate)} anchor="center">
            <OriginDot />
          </Marker>
        ) : null}
        <Marker lngLat={coordinate} anchor="bottom">
          <OriginPin />
        </Marker>
      </Map>

      <View style={[styles.header, { top: insets.top + 12 }]} pointerEvents="box-none">
        <View style={styles.headerCard}>
          {onBack ? (
            <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
              <Text style={styles.backText}>‹ Voltar</Text>
            </Pressable>
          ) : null}
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>{title}</Text>
            {onAccountPress ? (
              <Pressable
                accessibilityLabel="Minha Conta"
                accessibilityRole="button"
                onPress={onAccountPress}
                style={styles.accountButton}
              >
                <Text style={styles.accountText}>Conta</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.headerSubtitle}>
            {showGps
              ? 'Sugerimos sua localização. Ajuste pelo mapa ou busque um endereço.'
              : 'Busque um endereço ou mova o mapa para ajustar o ponto.'}
          </Text>
          <TextInput
            accessibilityLabel="Buscar endereço"
            autoCorrect={false}
            onBlur={() => {
              setInputFocused(false);
              inputFocusedRef.current = false;
            }}
            onChangeText={onChangeQuery}
            onFocus={() => {
              setInputFocused(true);
              inputFocusedRef.current = true;
              void loadAddressHistory().then(setHistory);
            }}
            placeholder="Buscar endereço ou local"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={styles.input}
            value={query}
          />
          {searching || resolving ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.statusText}>
                {searching ? 'Buscando endereços…' : 'Obtendo endereço…'}
              </Text>
            </View>
          ) : null}
          {inputFocused && query.trim().length < 3 && history.length > 0 ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              style={styles.results}
            >
              <Text style={styles.resultsLabel}>ENDEREÇOS RECENTES</Text>
              {history.map((place) => (
                <Pressable
                  accessibilityRole="button"
                  key={place.id}
                  onPress={() => selectPlace(place)}
                  style={({ pressed }) => [
                    styles.result,
                    pressed && styles.resultPressed,
                  ]}
                >
                  <Text style={styles.historyIcon}>◷</Text>
                  <View style={styles.resultText}>
                    <Text style={styles.resultTitle}>{place.shortLabel}</Text>
                    <Text numberOfLines={2} style={styles.resultSubtitle}>
                      {place.label}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {results.length > 0 && inputFocused ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              style={styles.results}
            >
              {results.map((place) => (
                <Pressable
                  accessibilityRole="button"
                  key={place.id}
                  onPress={() => selectPlace(place)}
                  style={({ pressed }) => [
                    styles.result,
                    pressed && styles.resultPressed,
                  ]}
                >
                  <Text style={styles.resultTitle}>{place.shortLabel}</Text>
                  <Text numberOfLines={2} style={styles.resultSubtitle}>
                    {place.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.bottomSheet,
          { paddingBottom: Math.max(insets.bottom, 24) + 36 },
        ]}
      >
        <View style={styles.handle} />
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text numberOfLines={2} style={styles.address}>
          {address || 'Local no mapa'}
        </Text>
        <Text style={styles.coordinate}>
          {formatCoordinate(fromLngLat(coordinate))}
        </Text>
        <Text style={styles.hint}>
          O pino no centro do mapa é a posição enviada ao servidor.
        </Text>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <View style={styles.actions}>
          {showGps ? (
            <Pressable
              accessibilityLabel="Usar minha localização"
              accessibilityRole="button"
              disabled={locating}
              onPress={() => void locateMe(false)}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
                locating && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {locating ? 'Localizando…' : 'Minha localização'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={submitLabel}
            accessibilityRole="button"
            onPress={submit}
            style={({ pressed }) => [
              styles.primaryButton,
              !showGps && styles.primaryButtonFull,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>{submitLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  map: { flex: 1 },
  header: { left: 16, position: 'absolute', right: 16 },
  headerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 3,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  backButton: { alignSelf: 'flex-start', marginBottom: 4 },
  backText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  headerTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerTitle: { color: colors.text, flex: 1, fontSize: 18, fontWeight: '700' },
  accountButton: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  accountText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
  statusText: { color: colors.muted, fontSize: 12 },
  results: { marginTop: 8, maxHeight: 230 },
  resultsLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2, marginTop: 4 },
  historyIcon: { color: colors.muted, fontSize: 18, marginRight: 10 },
  resultText: { flex: 1 },
  result: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingVertical: 10,
  },
  resultPressed: { opacity: 0.6 },
  resultTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  resultSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  bottomSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    bottom: 0,
    elevation: 12,
    left: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    position: 'absolute',
    right: 0,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: 2,
    height: 4,
    marginBottom: 14,
    width: 42,
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  address: { color: colors.text, fontSize: 19, fontWeight: '700', marginTop: 4 },
  coordinate: {
    color: colors.muted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginTop: 3,
  },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  notice: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  secondaryButtonPressed: { backgroundColor: colors.background },
  secondaryButtonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    flex: 1.2,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  primaryButtonFull: { flex: 1 },
  primaryButtonPressed: { backgroundColor: colors.accentPressed },
  primaryButtonText: { color: colors.surface, fontSize: 14, fontWeight: '700' },
  buttonDisabled: { opacity: 0.55 },
});
