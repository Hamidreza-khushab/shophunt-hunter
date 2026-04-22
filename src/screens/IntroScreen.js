import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, spacing } from "../theme";

const introPoints = [
  {
    title: "Lokale Angebote werden spielerisch",
    text:
      "ShopHunt verbindet echte Orte, Kampagnen und digitale Belohnungen zu einer kurzen mobilen Hunt.",
  },
  {
    title: "AR-Spawns statt Wand-QRs",
    text:
      "Virtuelle QR-Identitaeten erscheinen spaeter im Jagdradius als AR-Begegnungen in der Kamera.",
  },
  {
    title: "Direkt mit dem ShopHunt Backend verbunden",
    text:
      "Die Hunter-App ist fuer dieselben Firebase-Kampagnen, Spawns und QR-Tokens vorbereitet.",
  },
];

export default function IntroScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Image
            source={require("../../assets/icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.brand}>ShopHunt</Text>
            <Text style={styles.brandSubline}>Hunter App</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroMedia}>
            <View style={styles.radarOuter}>
              <View style={styles.radarMiddle}>
                <View style={styles.radarCore}>
                  <Text style={styles.radarQr}>QR</Text>
                </View>
              </View>
            </View>
            <View style={styles.arBadge}>
              <Text style={styles.arBadgeText}>AR Spawn</Text>
            </View>
          </View>

          <Text style={styles.kicker}>Lokale Hunt Experience</Text>
          <Text style={styles.title}>Jage Angebote in deiner Umgebung.</Text>
          <Text style={styles.lead}>
            ShopHunt macht Kampagnen auffindbar: Hunter bewegen sich in den
            Kampagnenradius, entdecken virtuelle Spawns und koennen spaeter
            daraus Rewards, Discounts oder Missionen starten.
          </Text>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Wichtig zur QR-Logik</Text>
          <Text style={styles.noticeText}>
            QR bedeutet hier keine gedruckte Markierung an einer Wand. Jeder
            Spawn hat eine eigene virtuelle QR-Identitaet, die in der mobilen
            AR-Encounter-Schicht verwendet wird.
          </Text>
        </View>

        <View style={styles.points}>
          {introPoints.map((item, index) => (
            <View key={item.title} style={styles.pointRow}>
              <View
                style={[
                  styles.pointIndex,
                  index === 1 ? styles.pointIndexAccent : null,
                ]}
              >
                <Text
                  style={[
                    styles.pointIndexText,
                    index === 1 ? styles.pointIndexTextAccent : null,
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <View style={styles.pointContent}>
                <Text style={styles.pointTitle}>{item.title}</Text>
                <Text style={styles.pointText}>{item.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable style={styles.primaryAction}>
          <Text style={styles.primaryActionText}>Startscreen bereit</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.appBg,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.pageX,
    paddingBottom: 28,
    paddingTop: 18,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  logo: {
    backgroundColor: colors.white,
    borderColor: colors.inkBorder,
    borderRadius: 8,
    borderWidth: 1,
    height: 48,
    width: 48,
  },
  brand: {
    color: colors.inkText,
    fontSize: 19,
    fontWeight: "800",
  },
  brandSubline: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  hero: {
    paddingTop: 26,
  },
  heroMedia: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.inkBg,
    borderRadius: 8,
    height: 216,
    justifyContent: "center",
    marginBottom: 26,
    overflow: "hidden",
    width: "100%",
  },
  radarOuter: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 120,
    borderWidth: 1,
    height: 186,
    justifyContent: "center",
    width: 186,
  },
  radarMiddle: {
    alignItems: "center",
    borderColor: "rgba(37,99,235,0.58)",
    borderRadius: 80,
    borderWidth: 2,
    height: 132,
    justifyContent: "center",
    width: 132,
  },
  radarCore: {
    alignItems: "center",
    backgroundColor: colors.brandPrimary,
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: 8,
    borderWidth: 2,
    height: 66,
    justifyContent: "center",
    width: 66,
  },
  radarQr: {
    color: colors.white,
    fontSize: 20,
    fontWeight: "900",
  },
  arBadge: {
    backgroundColor: colors.brandAccent,
    borderRadius: 8,
    bottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: "absolute",
    right: 18,
  },
  arBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "800",
  },
  kicker: {
    color: colors.brandPrimary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    color: colors.inkText,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 40,
    marginTop: 10,
  },
  lead: {
    color: colors.inkMuted,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 16,
  },
  notice: {
    backgroundColor: colors.white,
    borderColor: "rgba(249,115,22,0.28)",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 22,
    padding: 16,
  },
  noticeTitle: {
    color: colors.brandAccent,
    fontSize: 14,
    fontWeight: "900",
  },
  noticeText: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  points: {
    gap: 12,
    marginTop: 18,
  },
  pointRow: {
    alignItems: "flex-start",
    backgroundColor: colors.white,
    borderColor: colors.inkBorder,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    padding: 15,
  },
  pointIndex: {
    alignItems: "center",
    backgroundColor: "rgba(37,99,235,0.1)",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  pointIndexAccent: {
    backgroundColor: "rgba(249,115,22,0.13)",
  },
  pointIndexText: {
    color: colors.brandPrimary,
    fontSize: 15,
    fontWeight: "900",
  },
  pointIndexTextAccent: {
    color: colors.brandAccent,
  },
  pointContent: {
    flex: 1,
  },
  pointTitle: {
    color: colors.inkText,
    fontSize: 15,
    fontWeight: "800",
  },
  pointText: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },
  primaryAction: {
    alignItems: "center",
    backgroundColor: colors.brandPrimary,
    borderRadius: 8,
    marginTop: 22,
    paddingVertical: 15,
  },
  primaryActionText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900",
  },
});
