import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import {
  fetchHunterCampaigns,
  fetchPublicHunterStories,
} from "../lib/backend";
import { colors } from "../theme";

const germanyRegion = {
  latitude: 51.1657,
  longitude: 10.4515,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

function getCampaignCoordinate(campaign) {
  const latitude = Number(campaign?.location?.latitude);
  const longitude = Number(campaign?.location?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function getCampaignRadius(campaign) {
  const radius = Number(campaign?.radiusMeters);

  if (!Number.isFinite(radius) || radius <= 0) {
    return 40;
  }

  return radius;
}

function getCampaignRegionDelta(campaign) {
  const radius = getCampaignRadius(campaign);
  const meters = Math.max(radius * 5, 900);
  return Math.max(0.008, Math.min(0.08, meters / 111000));
}

function getRegionForCoordinates(coordinates) {
  const validCoordinates = coordinates.filter(
    (coordinate) =>
      coordinate &&
      Number.isFinite(coordinate.latitude) &&
      Number.isFinite(coordinate.longitude)
  );

  if (!validCoordinates.length) {
    return null;
  }

  const latitudes = validCoordinates.map((coordinate) => coordinate.latitude);
  const longitudes = validCoordinates.map((coordinate) => coordinate.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeDelta = Math.max(0.012, (maxLatitude - minLatitude) * 1.45);
  const longitudeDelta = Math.max(0.012, (maxLongitude - minLongitude) * 1.45);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.min(0.45, latitudeDelta),
    longitudeDelta: Math.min(0.45, longitudeDelta),
  };
}

function getCampaignDescription(campaign) {
  const parts = [`Radius ${getCampaignRadius(campaign)} m`];
  const distanceMeters = Number(campaign?.distanceMeters);

  if (Number.isFinite(distanceMeters)) {
    if (distanceMeters >= 1000) {
      parts.push(`${(distanceMeters / 1000).toFixed(1)} km entfernt`);
    } else {
      parts.push(`${Math.max(1, Math.round(distanceMeters))} m entfernt`);
    }
  }

  return parts.join(" - ");
}

function getStoryLabel(story) {
  return (
    story?.customer?.companyName ||
    story?.description ||
    "Shop"
  ).slice(0, 18);
}

function getInitials(value) {
  const words = String(value || "SH")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = words[0]?.[0] || "S";
  const second = words.length > 1 ? words[1][0] : words[0]?.[1] || "H";

  return `${first}${second}`.toUpperCase();
}

function StoryBubble({ story }) {
  const imageUrl = story?.imageUrl || story?.media?.previewUrl;
  const label = getStoryLabel(story);

  return (
    <Pressable
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.storyItem,
        pressed ? styles.pressedSoft : null,
      ]}
    >
      <View style={styles.storyRing}>
        <View style={styles.storyImageFrame}>
          {imageUrl ? (
            <Image
              resizeMode="cover"
              source={{ uri: imageUrl }}
              style={styles.storyImage}
            />
          ) : (
            <Text style={styles.storyInitials}>{getInitials(label)}</Text>
          )}
        </View>
      </View>
      <Text numberOfLines={1} style={styles.storyLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function StoryRail({ loading, stories }) {
  if (!loading && !stories.length) {
    return null;
  }

  return (
    <View style={styles.storyRail}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.storyRailContent}
      >
        {loading && !stories.length
          ? Array.from({ length: 4 }).map((_, index) => (
              <View key={`story-loading-${index}`} style={styles.storyItem}>
                <View style={styles.storySkeleton} />
                <View style={styles.storyLabelSkeleton} />
              </View>
            ))
          : stories.map((story) => (
              <StoryBubble key={story.path || story.id} story={story} />
            ))}
      </ScrollView>
    </View>
  );
}

const bottomTabs = [
  {
    id: "profile",
    icon: "person-circle-outline",
    activeIcon: "person-circle",
    label: "Profil",
  },
  {
    id: "search",
    icon: "search-outline",
    activeIcon: "search",
    label: "Suche",
  },
  {
    id: "reels",
    icon: "play-circle-outline",
    activeIcon: "play-circle",
    label: "Reels",
  },
  {
    id: "map",
    icon: "map-outline",
    activeIcon: "map",
    label: "Map",
  },
];

function BottomTabBar({
  activeTab,
  onTabPress,
  onProfileLongPress,
  profilePhotoUrl,
}) {
  return (
    <View style={styles.bottomNav}>
      {bottomTabs.map((tab) => {
        const active = tab.id === activeTab;

        return (
          <Pressable
            accessibilityLabel={tab.label}
            key={tab.id}
            onLongPress={tab.id === "profile" ? onProfileLongPress : undefined}
            onPress={() => onTabPress(tab.id)}
            style={({ pressed }) => [
              styles.bottomNavItem,
              pressed ? styles.pressedSoft : null,
            ]}
          >
            {tab.id === "profile" && profilePhotoUrl ? (
              <Image
                resizeMode="cover"
                source={{ uri: profilePhotoUrl }}
                style={[
                  styles.profileTabImage,
                  active ? styles.profileTabImageActive : null,
                ]}
              />
            ) : (
              <Ionicons
                color={active ? colors.inkText : "#111827"}
                name={active ? tab.activeIcon : tab.icon}
                size={31}
              />
            )}
            {active ? <View style={styles.activeTabDot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function HunterHomeScreen({ profile, user, onLogout }) {
  const [locationStatus, setLocationStatus] = useState("checking");
  const [locationMessage, setLocationMessage] = useState(
    "Standortfreigabe wird angefragt."
  );
  const [coords, setCoords] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignStatus, setCampaignStatus] = useState("idle");
  const [campaignMessage, setCampaignMessage] = useState(
    "Aktive Kampagnen werden geladen."
  );
  const [stories, setStories] = useState([]);
  const [storyStatus, setStoryStatus] = useState("idle");
  const [activeTab, setActiveTab] = useState("map");
  const profilePhotoUrl = profile?.photoURL || user?.photoURL || null;
  const canRenderNativeMap =
    Platform.OS !== "android" ||
    Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
  const visibleCampaigns = useMemo(
    () => campaigns.filter((campaign) => getCampaignCoordinate(campaign)),
    [campaigns]
  );
  const campaignLocationKey = coords
    ? `${coords.latitude.toFixed(3)}:${coords.longitude.toFixed(3)}`
    : "no-location";
  const campaignFetchCoords = useMemo(() => {
    if (!coords) {
      return null;
    }

    return {
      latitude: Number(coords.latitude.toFixed(5)),
      longitude: Number(coords.longitude.toFixed(5)),
    };
  }, [campaignLocationKey]);

  const mapRegion = useMemo(() => {
    if (!coords) {
      const firstCampaign = visibleCampaigns[0];
      const firstCampaignCoordinate = getCampaignCoordinate(firstCampaign);

      if (firstCampaignCoordinate) {
        const delta = getCampaignRegionDelta(firstCampaign);

        return {
          ...firstCampaignCoordinate,
          latitudeDelta: delta,
          longitudeDelta: delta,
        };
      }

      return germanyRegion;
    }

    const userCoordinate = {
      latitude: coords.latitude,
      longitude: coords.longitude,
    };
    const nearbyCampaigns = visibleCampaigns.filter((campaign) =>
      Number.isFinite(Number(campaign.distanceMeters))
    );
    const campaignRegion = getRegionForCoordinates([
      userCoordinate,
      ...nearbyCampaigns.map((campaign) => getCampaignCoordinate(campaign)),
    ]);

    if (campaignRegion && nearbyCampaigns.length) {
      return campaignRegion;
    }

    return {
      ...userCoordinate,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };
  }, [coords, visibleCampaigns]);
  const isStatusLoading =
    locationStatus === "checking" ||
    locationStatus === "loading" ||
    campaignStatus === "loading";

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

  useEffect(() => {
    if (!canRenderNativeMap || !user) {
      return undefined;
    }

    let isMounted = true;
    let refreshTimer;

    async function loadCampaigns() {
      try {
        setCampaignStatus("loading");
        const idToken = await user.getIdToken();
        const result = await fetchHunterCampaigns({
          idToken,
          coords: campaignFetchCoords,
        });
        const items = Array.isArray(result?.campaigns) ? result.campaigns : [];

        if (!isMounted) {
          return;
        }

        setCampaigns(items);
        setCampaignStatus("ready");
        setCampaignMessage(
          items.length
            ? `${items.length} aktive Kampagne(n) auf der Karte.`
            : "Keine aktive Kampagne in deiner Umgebung."
        );
      } catch {
        if (isMounted) {
          setCampaignStatus("error");
          setCampaignMessage("Aktive Kampagnen konnten nicht geladen werden.");
        }
      }
    }

    loadCampaigns();
    refreshTimer = setInterval(loadCampaigns, 60000);

    return () => {
      isMounted = false;
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [canRenderNativeMap, user, campaignLocationKey, campaignFetchCoords]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    let isMounted = true;
    let refreshTimer;

    async function loadStories() {
      try {
        setStoryStatus("loading");
        const idToken = await user.getIdToken();
        const result = await fetchPublicHunterStories(idToken);
        const items = Array.isArray(result?.stories) ? result.stories : [];

        if (!isMounted) {
          return;
        }

        setStories(items);
        setStoryStatus("ready");
      } catch {
        if (isMounted) {
          setStoryStatus("error");
        }
      }
    }

    loadStories();
    refreshTimer = setInterval(loadStories, 60000);

    return () => {
      isMounted = false;
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [user]);

  function handleTabPress(tabId) {
    if (tabId === "map") {
      setActiveTab("map");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Text style={styles.appTitle}>Shop Hunter</Text>
        </View>

        <StoryRail loading={storyStatus === "loading"} stories={stories} />

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
              {visibleCampaigns.map((campaign) => {
                const coordinate = getCampaignCoordinate(campaign);

                return (
                  <Circle
                    key={`${campaign.path || campaign.id}-radius`}
                    center={coordinate}
                    fillColor="rgba(37, 99, 235, 0.15)"
                    radius={getCampaignRadius(campaign)}
                    strokeColor="rgba(37, 99, 235, 0.92)"
                    strokeWidth={2}
                  />
                );
              })}

              {visibleCampaigns.map((campaign) => {
                const coordinate = getCampaignCoordinate(campaign);

                return (
                  <Marker
                    coordinate={coordinate}
                    description={getCampaignDescription(campaign)}
                    key={campaign.path || campaign.id}
                    pinColor={colors.brandPrimary}
                    title={campaign.title || "ShopHunt Kampagne"}
                  />
                );
              })}

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

          <View style={styles.mapStatusPill}>
            {isStatusLoading ? (
              <ActivityIndicator color={colors.brandPrimary} />
            ) : null}
            <View style={styles.statusTextBlock}>
              <Text numberOfLines={1} style={styles.locationStatusText}>
                {locationMessage}
              </Text>
              {canRenderNativeMap ? (
                <Text numberOfLines={1} style={styles.campaignStatusText}>
                  {campaignMessage}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <BottomTabBar
          activeTab={activeTab}
          onProfileLongPress={onLogout}
          onTabPress={handleTabPress}
          profilePhotoUrl={profilePhotoUrl}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.white,
    flex: 1,
  },
  screen: {
    backgroundColor: colors.white,
    flex: 1,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 18,
  },
  appTitle: {
    color: colors.inkText,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 31,
  },
  storyRail: {
    borderBottomColor: "#F1F5F9",
    borderBottomWidth: 1,
    minHeight: 112,
    paddingBottom: 8,
  },
  storyRailContent: {
    gap: 16,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  storyItem: {
    alignItems: "center",
    width: 82,
  },
  storyRing: {
    alignItems: "center",
    backgroundColor: colors.brandAccent,
    borderColor: "#E11D48",
    borderRadius: 38,
    borderWidth: 3,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  storyImageFrame: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.white,
    borderRadius: 33,
    borderWidth: 3,
    height: 66,
    justifyContent: "center",
    overflow: "hidden",
    width: 66,
  },
  storyImage: {
    height: "100%",
    width: "100%",
  },
  storyInitials: {
    color: colors.brandPrimary,
    fontSize: 18,
    fontWeight: "900",
  },
  storyLabel: {
    color: colors.inkText,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 6,
    textAlign: "center",
    width: 82,
  },
  storySkeleton: {
    backgroundColor: "#E2E8F0",
    borderRadius: 38,
    height: 76,
    width: 76,
  },
  storyLabelSkeleton: {
    backgroundColor: "#E2E8F0",
    borderRadius: 6,
    height: 10,
    marginTop: 8,
    width: 54,
  },
  mapPanel: {
    backgroundColor: "#EAF2FF",
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
  mapStatusPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderColor: "rgba(226, 232, 240, 0.96)",
    borderRadius: 8,
    borderWidth: 1,
    bottom: 14,
    flexDirection: "row",
    gap: 10,
    left: 14,
    minHeight: 54,
    paddingHorizontal: 13,
    position: "absolute",
    right: 14,
  },
  statusTextBlock: {
    flex: 1,
    gap: 1,
    justifyContent: "center",
  },
  locationStatusText: {
    color: colors.inkText,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },
  campaignStatusText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  bottomNav: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderTopColor: "#E5E7EB",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    minHeight: 76,
    paddingBottom: Platform.OS === "ios" ? 8 : 6,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  bottomNavItem: {
    alignItems: "center",
    height: 54,
    justifyContent: "center",
    width: 64,
  },
  profileTabImage: {
    borderColor: "#111827",
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    width: 30,
  },
  profileTabImageActive: {
    borderWidth: 2,
  },
  activeTabDot: {
    backgroundColor: colors.inkText,
    borderRadius: 3,
    height: 5,
    marginTop: 5,
    width: 5,
  },
  pressedSoft: {
    opacity: 0.62,
  },
});
