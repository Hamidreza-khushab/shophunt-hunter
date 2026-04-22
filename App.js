import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import IntroScreen from "./src/screens/IntroScreen";

export default function App() {
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

  return (
    <>
      <StatusBar hidden style="light" />
      <IntroScreen />
    </>
  );
}
