import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;

type MenuItemProps = {
  icon: string;
  title: string;
  description: string;
  onPress: () => void;
};

function MenuItem({ icon, title, description, onPress }: MenuItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
    >
      <View style={styles.iconCircle}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuDescription}>{description}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function AccountMenuScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const greeting = user?.displayName?.trim();

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

        <Text style={styles.title}>Conta</Text>
        <Text style={styles.description}>
          {greeting ? `Olá, ${greeting}.` : 'Acesse seus dados e suas corridas.'}
        </Text>

        <View style={styles.menu}>
          <MenuItem
            description="Veja as corridas que você já fez."
            icon="◷"
            onPress={() => navigation.navigate('RideHistory')}
            title="Histórico de Corridas"
          />
          <MenuItem
            description="Atualize seus dados de passageiro."
            icon="◎"
            onPress={() => navigation.navigate('MyAccount')}
            title="Minha Conta"
          />
        </View>
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
  description: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  menu: { gap: 12, marginTop: 24 },
  menuItem: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pressed: { opacity: 0.75 },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  icon: { color: colors.text, fontSize: 22, fontWeight: '800' },
  menuCopy: { flex: 1, marginLeft: 14 },
  menuTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  menuDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  chevron: { color: colors.muted, fontSize: 28, fontWeight: '300', marginLeft: 10 },
});
