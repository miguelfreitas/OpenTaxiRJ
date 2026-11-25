import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getRaceHistory } from '../api/client';
import type { RaceHistoryItem } from '../api/client';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';
import {
  formatRaceAmount,
  formatRaceDate,
  raceDestination,
  raceOrigin,
  raceStatus,
} from '../utils/raceHistory';

type Props = NativeStackScreenProps<RootStackParamList, 'RideHistory'>;
type LoadMode = 'initial' | 'more' | 'refresh';

function statusStyles(tone: ReturnType<typeof raceStatus>['tone']) {
  switch (tone) {
    case 'danger':
      return [styles.statusPill, styles.statusDanger];
    case 'warning':
      return [styles.statusPill, styles.statusWarning];
    case 'success':
      return [styles.statusPill, styles.statusSuccess];
    default:
      return [styles.statusPill, styles.statusNeutral];
  }
}

function statusTextStyles(tone: ReturnType<typeof raceStatus>['tone']) {
  switch (tone) {
    case 'danger':
      return styles.statusDangerText;
    case 'warning':
      return styles.statusWarningText;
    case 'success':
      return styles.statusSuccessText;
    default:
      return styles.statusNeutralText;
  }
}

function RaceRow({
  item,
  onPress,
}: {
  item: RaceHistoryItem;
  onPress: () => void;
}) {
  const status = raceStatus(item);
  const amount = formatRaceAmount(item);
  const origin = raceOrigin(item) || 'Origem não disponível';
  const destination = raceDestination(item) || 'Destino não disponível';

  return (
    <Pressable
      accessibilityLabel={`Corrida de ${origin} para ${destination}, ${status.label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.raceCard, pressed && styles.pressed]}
    >
      <View style={styles.raceHeader}>
        <Text style={styles.raceDate}>{formatRaceDate(item.createdAt)}</Text>
        <View style={statusStyles(status.tone)}>
          <Text style={[styles.statusText, statusTextStyles(status.tone)]}>
            {status.label}
          </Text>
        </View>
      </View>

      <View style={styles.placeRow}>
        <View style={[styles.placeDot, styles.originDot]} />
        <Text numberOfLines={2} style={styles.placeText}>
          {origin}
        </Text>
      </View>
      <View style={styles.placeRow}>
        <View style={[styles.placeDot, styles.destinationDot]} />
        <Text numberOfLines={2} style={styles.placeText}>
          {destination}
        </Text>
      </View>

      <View style={styles.raceFooter}>
        <Text style={styles.raceHint}>Ver detalhes</Text>
        {amount ? <Text style={styles.raceAmount}>{amount}</Text> : null}
      </View>
    </Pressable>
  );
}

export function RideHistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<RaceHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef(0);

  const load = useCallback(async (nextPage: number, mode: LoadMode) => {
    const requestId = ++activeRequest.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'more') setLoadingMore(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode !== 'more') setError(null);

    try {
      const next = await getRaceHistory(nextPage, false);
      if (requestId !== activeRequest.current) return;
      setPage(nextPage);
      setError(null);
      setItems((current) => {
        if (mode !== 'more') return next;
        const seen = new Set(current.map((race) => race.raceId).filter(Boolean));
        return [...current, ...next.filter((race) => race.raceId && !seen.has(race.raceId))];
      });
      setHasMore(next.length > 0);
    } catch {
      if (requestId !== activeRequest.current) return;
      setError('Não foi possível carregar o histórico de corridas.');
    } finally {
      if (requestId !== activeRequest.current) return;
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setItems([]);
      setHasMore(true);
      setPage(1);
      setError(null);
      void load(1, 'initial');
      return () => {
        activeRequest.current += 1;
      };
    }, [load]),
  );

  const loadMore = () => {
    if (loading || loadingMore || refreshing || !hasMore) return;
    void load(page + 1, 'more');
  };

  const refresh = () => {
    if (loading || refreshing) return;
    setHasMore(true);
    void load(1, 'refresh');
  };

  const openRace = (item: RaceHistoryItem) => {
    if (!item.raceId) return;
    navigation.navigate('HistoryRaceDetails', { raceId: item.raceId });
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ Voltar</Text>
        </Pressable>
        <Text style={styles.title}>Histórico de Corridas</Text>
        <Text style={styles.description}>Suas corridas anteriores no Taxi.Rio.</Text>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.text} size="large" />
          <Text style={styles.centerText}>Carregando histórico…</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 24 },
            items.length === 0 && styles.emptyListContent,
          ]}
          data={items}
          keyExtractor={(item, index) => item.raceId ?? `history-${index}`}
          ListEmptyComponent={
            error ? (
              <View style={styles.center}>
                <Text style={styles.errorTitle}>Não foi possível carregar</Text>
                <Text style={styles.centerText}>{error}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void load(1, 'initial')}
                  style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                >
                  <Text style={styles.retryText}>Tentar novamente</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.center}>
                <Text style={styles.emptyIcon}>◷</Text>
                <Text style={styles.emptyTitle}>Nenhuma corrida encontrada</Text>
                <Text style={styles.centerText}>
                  Suas corridas concluídas aparecerão aqui.
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={colors.text} />
                <Text style={styles.centerText}>Carregando mais corridas…</Text>
              </View>
            ) : undefined
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              colors={[colors.text]}
              onRefresh={refresh}
              refreshing={refreshing}
              tintColor={colors.text}
            />
          }
          renderItem={({ item }) => (
            <RaceRow item={item} onPress={() => openRace(item)} />
          )}
          style={styles.list}
        />
      )}

      {error && items.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void load(page, 'more')}
          style={styles.errorBanner}
        >
          <Text style={styles.errorBannerText}>{error} Toque para tentar novamente.</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: { paddingBottom: 12, paddingHorizontal: 20 },
  backButton: { alignSelf: 'flex-start' },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 18 },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  list: { flex: 1 },
  listContent: { gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  emptyListContent: { flexGrow: 1 },
  raceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  pressed: { opacity: 0.75 },
  raceHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  raceDate: { color: colors.text, fontSize: 13, fontWeight: '800' },
  statusPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: '900' },
  statusSuccess: { backgroundColor: '#E6F4EA' },
  statusSuccessText: { color: '#1E6B35' },
  statusWarning: { backgroundColor: '#FFF3CD' },
  statusWarningText: { color: '#7A5B00' },
  statusDanger: { backgroundColor: '#FDECEA' },
  statusDangerText: { color: colors.danger },
  statusNeutral: { backgroundColor: '#EEF2F5' },
  statusNeutralText: { color: colors.muted },
  placeRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 12 },
  placeDot: { borderRadius: 5, height: 10, marginRight: 10, marginTop: 4, width: 10 },
  originDot: { backgroundColor: colors.pin },
  destinationDot: { backgroundColor: colors.text },
  placeText: { color: colors.text, flex: 1, fontSize: 13, lineHeight: 18 },
  raceFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  raceHint: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  raceAmount: { color: colors.text, fontSize: 15, fontWeight: '900' },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  centerText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'center' },
  errorTitle: { color: colors.text, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyIcon: { color: colors.muted, fontSize: 38, marginBottom: 10 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  retryButton: {
    backgroundColor: colors.pin,
    borderRadius: 12,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  footer: { alignItems: 'center', paddingVertical: 18 },
  errorBanner: {
    backgroundColor: '#FDECEA',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  errorBannerText: { color: colors.danger, fontSize: 11, textAlign: 'center' },
});
