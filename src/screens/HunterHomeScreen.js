import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  Pressable,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { colors, spacing } from "../theme";

const germanyRegion = {
  latitude: 51.1657,
  longitude: 10.4515,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

function getDisplayName({ profile, user }) {
  return (
    profile?.displayName ||
    user?.displayName ||
    profile?.email ||
    user?.email ||
    "Hunter"
  );
}

export default function HunterHomeScreen({ profile, user, onLogout }) {
  const [locationStatus, setLocationStatus] = useState("checking");
  const [locationMessage, setLocationMessage] = useState(
    "Standortfreigabe wird angefragt."
  );
  const [coords, setCoords] = useState(null);
  const displayName = getDisplayName({ profile, user });
  const canRenderNativeMap =
    Platform.OS !== "android" ||
    Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);

  const mapRegion = useMemo(() => {
    if (!coords) {
      return germanyRegion;
    }

    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };
  }, [coords]);

  useEffect(() => {
    if (!canRenderNativeMap) {
      setLocationStatus("error");
      setLocationMessage(
        "Google Maps ist fuer diesen Android-Build nicht konfiguriert."
      );
      return undefined;
    }

    let isMounted = true;
    let subscription;

    async function requestLocation() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();

        if (!isMounted) {
          return;
        }

        if (permission.status !== "granted") {
          setLocationStatus("denied");
          setLocationMessage(
            "Standortzugriff wurde nicht erlaubt. Die Karte kann deine Position erst nach Freigabe anzeigen."
          );
          return;
        }

        setLocationStatus("loading");
        setLocationMessage("Deine aktuelle Position wird geladen.");

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!isMounted) {
          return;
        }

        setCoords(currentPosition.coords);
        setLocationStatus("granted");
        setLocationMessage("Dein Standort ist aktiv.");

        const locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 10,
            timeInterval: 10000,
          },
          (position) => {
            setCoords(position.coords);
          }
        );

        if (!isMounted) {
          locationSubscription.remove();
          return;
        }

        subscription = locationSubscription;
      } catch {
        if (isMounted) {
          setLocationStatus("error");
          setLocationMessage("Dein Standort konnte nicht geladen werden.");
        }
      }
    }

    requestLocation();

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, [canRenderNativeMap]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.greetingBlock}>
            <Text style={styles.eyebrow}>Shop Hunter</Text>
            <Text style={styles.title}>Willkommen, {displayName}</Text>
            <Text style={styles.subtitle}>
              Du bist angemeldet und kannst deine Hunter-Karte verwenden.
            </Text>
          </View>

          <Pressable
            onPress={onLogout}
            style={({ pressed }) => [
              styles.logoutButton,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <Text style={styles.logoutButtonText}>Abmelden</Text>
          </Pressable>
        </View>

        <View style={styles.mapPanel}>
          {canRenderNativeMap ? (
            <MapView
              followsUserLocation
              initialRegion={germanyRegion}
              region={mapRegion}
              showsCompass={false}
              showsMyLocationButton={false}
              showsUserLocation={locationStatus === "granted"}
              style={styles.map}
              toolbarEnabled={false}
            >
              {coords ? (
                <Marker
                  coordinate={{
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                  }}
                  title="Dein Standort"
                />
              ) : null}
            </MapView>
          ) : (
            <View style={styles.mapFallback}>
              <Text style={styles.mapFallbackText}>
                Google Maps API-Key fehlt.
              </Text>
            </View>
          )}

          <View style={styles.locationStatus}>
            {locationStatus === "checking" || locationStatus === "loading" ? (
              <ActivityIndicator color={colors.brandPrimary} />
            ) : null}
            <Text style={styles.locationStatusText}>{locationMessage}</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.appBg,
    flex: 1,
  },
  content: {
    flex: 1,
    padding: spacing.pageX,
  },
  header: {
    gap: 16,
    marginBottom: 18,
  },
  greetingBlock: {
    gap: 7,
  },
  eyebrow: {
    color: colors.brandAccent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  title: {
    color: colors.inkText,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 23,
  },
  logoutButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.inkText,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  logoutButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900",
  },
  buttonPressed: {
    opacity: 0.78,
  },
  mapPanel: {
    backgroundColor: colors.white,
    borderColor: colors.inkBorder,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  mapFallbackText: {
    color: colors.brandPrimaryDark,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  locationStatus: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderTopColor: colors.inkBorder,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 14,
  },
  locationStatusText: {
    color: colors.inkText,
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 20,
  },
});
