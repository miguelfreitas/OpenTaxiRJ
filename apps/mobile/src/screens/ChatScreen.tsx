import { useEffect, useRef, useState, type ComponentRef } from 'react';
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
import { subscribeToChat, sendChatMessage, type ChatMessage } from '../services/chat';
import { useRide } from '../state/RideContext';
import { colors } from '../theme';
import { driverName, driverVehicle } from '../utils/driver';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export function ChatScreen({ navigation, route }: Props) {
  const { raceId } = route.params;
  const { driver } = useRide();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToChat(raceId, setMessages);
    return unsubscribe;
  }, [raceId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendChatMessage(raceId, driver, value);
      setText('');
    } catch {
      setError('Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Chat</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {driverName(driver)}
            {driverVehicle(driver) ? ` · ${driverVehicle(driver)}` : ''}
          </Text>
        </View>
        <View style={styles.onlineDot} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        style={styles.list}
      >
        {messages.length === 0 ? (
          <Text style={styles.empty}>Nenhuma mensagem ainda.</Text>
        ) : (
          messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.bubble,
                message.mine ? styles.myBubble : styles.driverBubble,
              ]}
            >
              <Text style={[styles.messageText, message.mine && styles.myMessageText]}>
                {message.text}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel="Mensagem para o motorista"
            multiline
            onChangeText={setText}
            placeholder="Digite aqui sua mensagem"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={text}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar mensagem"
            disabled={sending || !text.trim()}
            onPress={() => void send()}
            style={({ pressed }) => [
              styles.sendButton,
              (sending || !text.trim()) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {sending ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text style={styles.sendText}>Enviar</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: colors.text,
    flexDirection: 'row',
    paddingBottom: 12,
    paddingHorizontal: 18,
  },
  backButton: { paddingRight: 12, paddingTop: 2 },
  backText: { color: colors.surface, fontSize: 30, fontWeight: '300', lineHeight: 30 },
  headerText: { flex: 1 },
  title: { color: colors.surface, fontSize: 18, fontWeight: '900' },
  subtitle: { color: '#C8D4DA', fontSize: 11, marginTop: 2 },
  onlineDot: { backgroundColor: colors.pin, borderRadius: 5, height: 10, width: 10 },
  list: { flex: 1 },
  messages: { gap: 8, padding: 16, paddingBottom: 24 },
  empty: { color: colors.muted, marginTop: 30, textAlign: 'center' },
  bubble: { borderRadius: 16, maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10 },
  driverBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  myBubble: { alignSelf: 'flex-end', backgroundColor: colors.text },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 19 },
  myMessageText: { color: colors.surface },
  composer: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 10 },
  inputRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 8 },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 16, borderWidth: 1, color: colors.text, flex: 1, maxHeight: 110, minHeight: 46, paddingHorizontal: 14, paddingVertical: 10 },
  sendButton: { alignItems: 'center', backgroundColor: colors.pin, borderRadius: 14, justifyContent: 'center', minHeight: 46, paddingHorizontal: 16 },
  sendText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  error: { color: colors.danger, fontSize: 12, marginBottom: 6 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
