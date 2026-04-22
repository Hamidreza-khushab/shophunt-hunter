import {
  Image,
  ImageBackground,
  Platform,
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
    title: "Entdecken",
    text:
      "Finde aktive Kampagnen in deiner Umgebung und bewege dich in den Jagdradius.",
  },
  {
    title: "AR-Spawns",
    text:
      "QR-Identitaeten werden nicht an Waende geklebt. Sie erscheinen als virtuelle Encounter in der Kamera.",
  },
  {
    title: "Rewards",
    text:
      "Aus Spawns entstehen spaeter Discounts, Rewards und Missionen direkt aus dem gemeinsamen Firebase Backend.",
  },
];

export default function IntroScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ImageBackground
          source={require("../../assets/hero-home.png")}
          style={styles.hero}
          imageStyle={styles.heroImage}
          resizeMode="cover"
        >
          <View style={styles.heroShade}>
            <View style={styles.header}>
              <Image
                source={require("../../assets/icon.png")}
                style={styles.logo}
                resizeMode="contain"
              />
              <View>
                <Text style={styles.brand}>Shop Hunter</Text>
                <Text style={styles.brandSubline}>AR campaign hunt</Text>
              </View>
            </View>

            <View style={styles.heroCopy}>
              <View style={styles.kickerPill}>
                <Text style={styles.kicker}>Powered by ShopHunt</Text>
              </View>
              <Text style={styles.title}>Finde Spawns. Oeffne Rewards.</Text>
              <Text style={styles.lead}>
                Bewege dich durch reale Orte, entdecke virtuelle QR-Identitaeten
                im AR-Radius und starte spaeter Kampagnen direkt aus der Kamera.
              </Text>
            </View>
          </View>
        </ImageBackground>

        <View style={styles.summary}>
          <Text style={styles.summaryEyebrow}>Worum es geht</Text>
          <Text style={styles.summaryTitle}>Eine mobile Hunt fuer echte Orte.</Text>
          <Text style={styles.summaryText}>
            Shop Hunter ist die App fuer Spieler, die Kampagnen von lokalen
            Shops entdecken. Das Dashboard erstellt Kampagnen und virtuelle
            Spawn-QRs; diese App ist die mobile Seite fuer den spaeteren
            Encounter.
          </Text>
        </View>

        <View style={styles.pointsGrid}>
          {introPoints.map((item, index) => (
            <View key={item.title} style={styles.pointCard}>
              <View
                style={[
                  styles.pointIcon,
                  index === 1 ? styles.pointIconAccent : null,
                ]}
              >
                <Text
                  style={[
                    styles.pointIconText,
                    index === 1 ? styles.pointIconTextAccent : null,
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <Text style={styles.pointTitle}>{item.title}</Text>
              <Text style={styles.pointText}>{item.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.notice}>
          <View style={styles.noticeHeader}>
            <Text style={styles.noticeLabel}>AR statt Wandlabel</Text>
            <Text style={styles.noticeBadge}>QR identity</Text>
          </View>
          <Text style={styles.noticeText}>
            QR bedeutet in Shop Hunter keinen physischen Aufkleber im Laden.
            Jeder Spawn besitzt eine eigene virtuelle QR-Identitaet, die im
            Jagdradius als mobile AR-Begegnung sichtbar wird.
          </Text>
        </View>

        <Pressable style={styles.primaryAction}>
          <Text style={styles.primaryActionText}>Weiter zur Hunt</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingBottom: 28,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: spacing.pageX,
    paddingTop: 18,
  },
  logo: {
    backgroundColor: colors.white,
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: 8,
    borderWidth: 1,
    height: 48,
    width: 48,
  },
  brand: {
    color: colors.white,
    fontSize: 19,
    fontWeight: "800",
  },
  brandSubline: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  hero: {
    minHeight: 500,
    width: "100%",
  },
  heroImage: {
    backgroundColor: colors.inkBg,
  },
  heroShade: {
    backgroundColor: "rgba(11,18,32,0.48)",
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: 34,
  },
  heroCopy: {
    paddingHorizontal: spacing.pageX,
  },
  kickerPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.88)",
    borderColor: "rgba(37,99,235,0.22)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  kicker: {
    color: colors.brandPrimary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    color: colors.white,
    fontSize: 38,
    fontWeight: "900",
    lineHeight: 44,
    marginTop: 16,
    maxWidth: 340,
  },
  lead: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 16,
    lineHeight: 25,
    marginTop: 14,
    maxWidth: 350,
  },
  summary: {
    backgroundColor: colors.white,
    borderColor: colors.inkBorder,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: spacing.pageX,
    marginTop: -26,
    padding: 18,
    ...Platform.select({
      android: { elevation: 8 },
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { height: 12, width: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 24,
      },
    }),
  },
  summaryEyebrow: {
    color: colors.brandAccent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  summaryTitle: {
    color: colors.inkText,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28,
    marginTop: 8,
  },
  summaryText: {
    color: colors.inkMuted,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 10,
  },
  pointsGrid: {
    gap: 12,
    marginHorizontal: spacing.pageX,
    marginTop: 18,
  },
  pointCard: {
    backgroundColor: colors.white,
    borderColor: colors.inkBorder,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  pointIcon: {
    alignItems: "center",
    backgroundColor: "rgba(37,99,235,0.1)",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  pointIconAccent: {
    backgroundColor: "rgba(249,115,22,0.13)",
  },
  pointIconText: {
    color: colors.brandPrimary,
    fontSize: 15,
    fontWeight: "900",
  },
  pointIconTextAccent: {
    color: colors.brandAccent,
  },
  pointTitle: {
    color: colors.inkText,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 12,
  },
  pointText: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  notice: {
    backgroundColor: "#FFF7ED",
    borderColor: "rgba(249,115,22,0.28)",
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: spacing.pageX,
    marginTop: 22,
    padding: 18,
  },
  noticeHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  noticeLabel: {
    color: colors.brandAccent,
    fontSize: 14,
    fontWeight: "900",
  },
  noticeBadge: {
    backgroundColor: colors.white,
    borderColor: "rgba(249,115,22,0.28)",
    borderRadius: 8,
    borderWidth: 1,
    color: colors.brandAccent,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: "uppercase",
  },
  noticeText: {
    color: colors.inkText,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
  primaryAction: {
    alignItems: "center",
    backgroundColor: colors.brandPrimary,
    borderRadius: 8,
    marginHorizontal: spacing.pageX,
    marginTop: 22,
    paddingVertical: 15,
  },
  primaryActionText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900",
  },
});
