import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import IntroScreen from "./src/screens/IntroScreen";

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({
  duration: 350,
  fade: true,
});

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    async function hideAndroidSystemNavigation() {
      try {
        await NavigationBar.setBehaviorAsync("overlay-swipe");
        await NavigationBar.setVisibilityAsync("hidden");
      } catch {
        // Some Android launch contexts do not allow changing system navigation.
      }
    }

    hideAndroidSystemNavigation();
  }, []);

  useEffect(() => {
    setAppIsReady(true);
  }, []);

  const handleRootLayout = useCallback(() => {
    if (appIsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <View style={styles.root} onLayout={handleRootLayout}>
      <StatusBar hidden style="light" />
      <IntroScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
