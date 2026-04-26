import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
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
  reportHunterInteraction,
} from "../lib/backend";
import { colors } from "../theme";

const STORY_DURATION_MS = 3600;
const STORY_PROGRESS_INTERVAL_MS = 50;
const STORY_VIEWS_STORAGE_PREFIX = "hunter-story-views";

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

function getStoryCompanyName(story) {
  return (
    story?.companyName ||
    story?.customer?.companyName ||
    story?.description ||
    "Shop"
  );
}

function getStoryLabel(story) {
  return getStoryCompanyName(story).slice(0, 18);
}

function getStoryId(story) {
  return String(
    story?.path ||
      story?.id ||
      [
        getStoryCompanyName(story),
        story?.publishedAt || "",
        story?.imageUrl || story?.media?.previewUrl || "",
      ].join(":")
  );
}

function getStoryCompanyKey(story) {
  const customerUid = String(story?.customer?.uid || "").trim();

  if (customerUid) {
    return `customer:${customerUid}`;
  }

  const companyName = getStoryCompanyName(story)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 120);

  if (companyName) {
    return `company:${companyName}`;
  }

  return `story:${getStoryId(story)}`;
}

function getStoryTimestamp(story) {
  const timestamp = Date.parse(String(story?.publishedAt || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getStoryImageUrl(story) {
  return story?.imageUrl || story?.media?.previewUrl || null;
}

function getStoryViewsStorageKey(uid) {
  return `${STORY_VIEWS_STORAGE_PREFIX}:${uid}`;
}

function parseStoredStoryViews(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([storyId]) => Boolean(storyId))
    );
  } catch {
    return {};
  }
}

function addViewedStory(current, story) {
  const storyId = getStoryId(story);

  if (!storyId || current[storyId]) {
    return current;
  }

  return {
    ...current,
    [storyId]: Date.now(),
  };
}

function getFirstUnseenStoryIndex(group, viewedStoryIds) {
  if (!group?.stories?.length) {
    return 0;
  }

  const firstUnseenIndex = group.stories.findIndex(
    (story) => !viewedStoryIds[getStoryId(story)]
  );

  return firstUnseenIndex === -1 ? 0 : firstUnseenIndex;
}

function buildStoryGroups(stories, viewedStoryIds) {
  const groups = new Map();

  stories.forEach((story) => {
    const companyKey = getStoryCompanyKey(story);
    const current = groups.get(companyKey) || {
      companyKey,
      companyName: getStoryCompanyName(story),
      stories: [],
      latestPublishedAt: 0,
    };

    current.companyName = current.companyName || getStoryCompanyName(story);
    current.latestPublishedAt = Math.max(
      current.latestPublishedAt,
      getStoryTimestamp(story)
    );
    current.stories.push(story);

    groups.set(companyKey, current);
  });

  return Array.from(groups.values())
    .map((group) => {
      const sortedStories = [...group.stories].sort((first, second) => {
        const timeDelta = getStoryTimestamp(first) - getStoryTimestamp(second);

        if (timeDelta !== 0) {
          return timeDelta;
        }

        return getStoryId(first).localeCompare(getStoryId(second));
      });
      const unseenCount = sortedStories.filter(
        (story) => !viewedStoryIds[getStoryId(story)]
      ).length;

      return {
        ...group,
        coverStory: sortedStories[sortedStories.length - 1] || null,
        isViewed: unseenCount === 0,
        stories: sortedStories,
        unseenCount,
      };
    })
    .sort((first, second) => {
      if (first.latestPublishedAt !== second.latestPublishedAt) {
        return second.latestPublishedAt - first.latestPublishedAt;
      }

      return first.companyName.localeCompare(second.companyName);
    });
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

function StoryBubble({ group, onPress }) {
  const imageUrl = getStoryImageUrl(group?.coverStory);
  const label = getStoryLabel(group?.coverStory || group);

  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.storyItem,
        pressed ? styles.pressedSoft : null,
      ]}
    >
      <View
        style={[
          styles.storyRing,
          group?.isViewed ? styles.storyRingViewed : styles.storyRingActive,
        ]}
      >
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

function StoryRail({ loading, storyGroups, onOpenGroup }) {
  if (!loading && !storyGroups.length) {
    return null;
  }

  return (
    <View style={styles.storyRail}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.storyRailContent}
      >
        {loading && !storyGroups.length
          ? Array.from({ length: 4 }).map((_, index) => (
              <View key={`story-loading-${index}`} style={styles.storyItem}>
                <View style={styles.storySkeleton} />
                <View style={styles.storyLabelSkeleton} />
              </View>
            ))
          : storyGroups.map((group, index) => (
              <StoryBubble
                group={group}
                key={group.companyKey}
                onPress={() => onOpenGroup(index)}
              />
            ))}
      </ScrollView>
    </View>
  );
}

function StoryViewer({
  visible,
  group,
  storyIndex,
  progress,
  onClose,
  onNext,
  onPrevious,
}) {
  const activeStory = group?.stories?.[storyIndex] || null;
  const imageUrl = getStoryImageUrl(activeStory);
  const companyName = group?.companyName || getStoryCompanyName(activeStory);

  if (!visible || !group || !activeStory) {
    return null;
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      visible={visible}
    >
      <View style={styles.storyViewerBackdrop}>
        <SafeAreaView style={styles.storyViewerSafeArea}>
          <View style={styles.storyViewerProgressRow}>
            {group.stories.map((story, index) => {
              let fillWidth = "0%";

              if (index < storyIndex) {
                fillWidth = "100%";
              } else if (index === storyIndex) {
                fillWidth = `${Math.max(0, Math.min(100, progress * 100))}%`;
              }

              return (
                <View
                  key={getStoryId(story)}
                  style={styles.storyViewerProgressTrack}
                >
                  <View
                    style={[
                      styles.storyViewerProgressFill,
                      { width: fillWidth },
                    ]}
                  />
                </View>
              );
            })}
          </View>

          <View style={styles.storyViewerHeader}>
            <View style={styles.storyViewerIdentity}>
              <View style={styles.storyViewerAvatar}>
                {imageUrl ? (
                  <Image
                    resizeMode="cover"
                    source={{ uri: imageUrl }}
                    style={styles.storyViewerAvatarImage}
                  />
                ) : (
                  <Text style={styles.storyViewerAvatarInitials}>
                    {getInitials(companyName)}
                  </Text>
                )}
              </View>

              <View style={styles.storyViewerMeta}>
                <Text numberOfLines={1} style={styles.storyViewerCompanyName}>
                  {companyName}
                </Text>
                <Text style={styles.storyViewerCounter}>
                  {storyIndex + 1} / {group.stories.length}
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityLabel="Story schliessen"
              onPress={onClose}
              style={({ pressed }) => [
                styles.storyViewerCloseButton,
                pressed ? styles.pressedHard : null,
              ]}
            >
              <Ionicons color={colors.white} name="close" size={24} />
            </Pressable>
          </View>

          <View style={styles.storyViewerStage}>
            {imageUrl ? (
              <Image
                resizeMode="cover"
                source={{ uri: imageUrl }}
                style={styles.storyViewerImage}
              />
            ) : (
              <View style={styles.storyViewerFallback}>
                <Text style={styles.storyViewerFallbackInitials}>
                  {getInitials(companyName)}
                </Text>
              </View>
            )}

            <View style={styles.storyViewerTopShade} />
            <View style={styles.storyViewerBottomShade} />

            <View style={styles.storyViewerCaption}>
              <Text numberOfLines={3} style={styles.storyViewerCaptionText}>
                {activeStory?.description || companyName}
              </Text>
            </View>

            <View style={styles.storyViewerTapRow}>
              <Pressable
                accessibilityLabel="Vorherige Story"
                onPress={onPrevious}
                style={styles.storyViewerTapZone}
              />
              <Pressable
                accessibilityLabel="Naechste Story"
                onPress={onNext}
                style={styles.storyViewerTapZone}
              />
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
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
  const [viewedStoryIds, setViewedStoryIds] = useState({});
  const [storyViewsReady, setStoryViewsReady] = useState(false);
  const [storyViewer, setStoryViewer] = useState({
    visible: false,
    groupIndex: 0,
    storyIndex: 0,
  });
  const [storyProgress, setStoryProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("map");
  const profilePhotoUrl = profile?.photoURL || user?.photoURL || null;
  const canRenderNativeMap =
    Platform.OS !== "android" ||
    Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
  const visibleCampaigns = useMemo(
    () => campaigns.filter((campaign) => getCampaignCoordinate(campaign)),
    [campaigns]
  );
  const storyGroups = useMemo(
    () => buildStoryGroups(stories, viewedStoryIds),
    [stories, viewedStoryIds]
  );
  const activeStoryGroup = storyViewer.visible
    ? storyGroups[storyViewer.groupIndex] || null
    : null;
  const activeStory = activeStoryGroup?.stories?.[storyViewer.storyIndex] || null;
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

  function markStoryViewed(story) {
    setViewedStoryIds((current) => addViewedStory(current, story));
  }

  function openStoryGroup(groupIndex) {
    const group = storyGroups[groupIndex];

    if (!group) {
      return;
    }

    setStoryProgress(0);
    setStoryViewer({
      visible: true,
      groupIndex,
      storyIndex: getFirstUnseenStoryIndex(group, viewedStoryIds),
    });
  }

  function closeStoryViewer() {
    if (activeStory && storyProgress >= 0.85) {
      markStoryViewed(activeStory);
    }

    setStoryProgress(0);
    setStoryViewer((current) => ({
      ...current,
      visible: false,
    }));
  }

  function goToPreviousStory() {
    if (!activeStoryGroup) {
      return;
    }

    setStoryProgress(0);

    if (storyViewer.storyIndex > 0) {
      setStoryViewer((current) => ({
        ...current,
        storyIndex: current.storyIndex - 1,
      }));
      return;
    }

    const previousGroup = storyGroups[storyViewer.groupIndex - 1];

    if (!previousGroup) {
      return;
    }

    setStoryViewer({
      visible: true,
      groupIndex: storyViewer.groupIndex - 1,
      storyIndex: Math.max(previousGroup.stories.length - 1, 0),
    });
  }

  function goToNextStory() {
    if (!activeStoryGroup || !activeStory) {
      setStoryProgress(0);
      setStoryViewer((current) => ({
        ...current,
        visible: false,
      }));
      return;
    }

    markStoryViewed(activeStory);

    if (storyViewer.storyIndex < activeStoryGroup.stories.length - 1) {
      setStoryProgress(0);
      setStoryViewer((current) => ({
        ...current,
        storyIndex: current.storyIndex + 1,
      }));
      return;
    }

    const nextGroup = storyGroups[storyViewer.groupIndex + 1];

    if (!nextGroup) {
      setStoryProgress(0);
      setStoryViewer((current) => ({
        ...current,
        visible: false,
      }));
      return;
    }

    setStoryProgress(0);
    setStoryViewer({
      visible: true,
      groupIndex: storyViewer.groupIndex + 1,
      storyIndex: getFirstUnseenStoryIndex(nextGroup, viewedStoryIds),
    });
  }

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

  useEffect(() => {
    if (!user?.uid) {
      setViewedStoryIds({});
      setStoryViewsReady(false);
      return undefined;
    }

    let isMounted = true;

    setViewedStoryIds({});
    setStoryViewsReady(false);

    async function loadViewedStories() {
      try {
        const storedViews = await AsyncStorage.getItem(
          getStoryViewsStorageKey(user.uid)
        );

        if (!isMounted) {
          return;
        }

        setViewedStoryIds(parseStoredStoryViews(storedViews));
      } catch {
        if (isMounted) {
          setViewedStoryIds({});
        }
      } finally {
        if (isMounted) {
          setStoryViewsReady(true);
        }
      }
    }

    loadViewedStories();

    return () => {
      isMounted = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !storyViewsReady) {
      return;
    }

    AsyncStorage.setItem(
      getStoryViewsStorageKey(user.uid),
      JSON.stringify(viewedStoryIds)
    ).catch(() => {});
  }, [storyViewsReady, user?.uid, viewedStoryIds]);

  useEffect(() => {
    if (!storyViewer.visible || !activeStory || !activeStoryGroup) {
      setStoryProgress(0);
      return undefined;
    }

    const startedAt = Date.now();
    setStoryProgress(0);

    const intervalId = setInterval(() => {
      const nextProgress = Math.min(
        1,
        (Date.now() - startedAt) / STORY_DURATION_MS
      );
      setStoryProgress(nextProgress);
    }, STORY_PROGRESS_INTERVAL_MS);
    const timeoutId = setTimeout(() => {
      setViewedStoryIds((current) => addViewedStory(current, activeStory));

      if (storyViewer.storyIndex < activeStoryGroup.stories.length - 1) {
        setStoryProgress(0);
        setStoryViewer((current) => ({
          ...current,
          storyIndex: current.storyIndex + 1,
        }));
        return;
      }

      const nextGroup = storyGroups[storyViewer.groupIndex + 1];

      if (!nextGroup) {
        setStoryProgress(0);
        setStoryViewer((current) => ({
          ...current,
          visible: false,
        }));
        return;
      }

      setStoryProgress(0);
      setStoryViewer({
        visible: true,
        groupIndex: storyViewer.groupIndex + 1,
        storyIndex: getFirstUnseenStoryIndex(nextGroup, viewedStoryIds),
      });
    }, STORY_DURATION_MS);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [
    activeStory,
    activeStoryGroup,
    storyGroups,
    viewedStoryIds,
    storyViewer.groupIndex,
    storyViewer.storyIndex,
    storyViewer.visible,
  ]);

  useEffect(() => {
    if (!storyViewer.visible) {
      return;
    }

    if (!storyGroups.length) {
      setStoryProgress(0);
      setStoryViewer((current) => ({
        ...current,
        visible: false,
      }));
      return;
    }

    const currentGroup = storyGroups[storyViewer.groupIndex];

    if (!currentGroup) {
      setStoryViewer((current) => ({
        ...current,
        groupIndex: Math.max(storyGroups.length - 1, 0),
        storyIndex: 0,
      }));
      return;
    }

    if (!currentGroup.stories[storyViewer.storyIndex]) {
      setStoryViewer((current) => ({
        ...current,
        storyIndex: Math.max(currentGroup.stories.length - 1, 0),
      }));
    }
  }, [
    storyGroups,
    storyViewer.groupIndex,
    storyViewer.storyIndex,
    storyViewer.visible,
  ]);

  function handleTabPress(tabId) {
    if (tabId === "map") {
      setActiveTab("map");
    }
  }

  async function handleCampaignMarkerPress(campaign) {
    const itemId = String(campaign?.recombeeItemId || campaign?.id || "").trim();

    if (!itemId || !user?.getIdToken) {
      return;
    }

    try {
      const idToken = await user.getIdToken();
      await reportHunterInteraction({
        eventName: "item_open",
        idToken,
        itemId,
        recommId: campaign?.recommId || undefined,
      });
    } catch (error) {
      console.error("Campaign interaction could not be reported", error);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Text style={styles.appTitle}>Shop Hunter</Text>
        </View>

        <StoryRail
          loading={storyStatus === "loading"}
          onOpenGroup={openStoryGroup}
          storyGroups={storyGroups}
        />

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
                    onPress={() => handleCampaignMarkerPress(campaign)}
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

        <StoryViewer
          group={activeStoryGroup}
          onClose={closeStoryViewer}
          onNext={goToNextStory}
          onPrevious={goToPreviousStory}
          progress={storyProgress}
          storyIndex={storyViewer.storyIndex}
          visible={storyViewer.visible}
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
    borderRadius: 38,
    borderWidth: 3,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  storyRingActive: {
    backgroundColor: "#FFE4E6",
    borderColor: "#E11D48",
  },
  storyRingViewed: {
    backgroundColor: "#E2E8F0",
    borderColor: "#94A3B8",
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
  storyViewerBackdrop: {
    backgroundColor: "#05070D",
    flex: 1,
  },
  storyViewerSafeArea: {
    backgroundColor: "#05070D",
    flex: 1,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  storyViewerProgressRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  storyViewerProgressTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 999,
    flex: 1,
    height: 3,
    overflow: "hidden",
  },
  storyViewerProgressFill: {
    backgroundColor: colors.white,
    borderRadius: 999,
    height: "100%",
  },
  storyViewerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  storyViewerIdentity: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minWidth: 0,
  },
  storyViewerAvatar: {
    alignItems: "center",
    backgroundColor: "#182235",
    borderColor: "rgba(255, 255, 255, 0.28)",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
    width: 44,
  },
  storyViewerAvatarImage: {
    height: "100%",
    width: "100%",
  },
  storyViewerAvatarInitials: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900",
  },
  storyViewerMeta: {
    flex: 1,
    minWidth: 0,
  },
  storyViewerCompanyName: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900",
  },
  storyViewerCounter: {
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  storyViewerCloseButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  storyViewerStage: {
    backgroundColor: "#0B1220",
    borderRadius: 26,
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },
  storyViewerImage: {
    height: "100%",
    width: "100%",
  },
  storyViewerFallback: {
    alignItems: "center",
    backgroundColor: "#172033",
    flex: 1,
    justifyContent: "center",
  },
  storyViewerFallbackInitials: {
    color: colors.white,
    fontSize: 72,
    fontWeight: "900",
  },
  storyViewerTopShade: {
    backgroundColor: "rgba(3, 7, 18, 0.42)",
    height: 120,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  storyViewerBottomShade: {
    backgroundColor: "rgba(3, 7, 18, 0.54)",
    bottom: 0,
    height: 180,
    left: 0,
    position: "absolute",
    right: 0,
  },
  storyViewerCaption: {
    bottom: 24,
    left: 20,
    position: "absolute",
    right: 20,
  },
  storyViewerCaptionText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 24,
  },
  storyViewerTapRow: {
    bottom: 0,
    flexDirection: "row",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  storyViewerTapZone: {
    flex: 1,
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
  pressedHard: {
    opacity: 0.42,
  },
});
