import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { assertHunterAccess, getAuthErrorMessage } from "./src/lib/auth";
import { firebaseAuth } from "./src/lib/firebase";
import AuthScreen from "./src/screens/AuthScreen";
import IntroScreen from "./src/screens/IntroScreen";

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({
  duration: 350,
  fade: true,
});

export default function App() {
  const [authState, setAuthState] = useState({
    checking: true,
    message: "",
    profile: null,
    user: null,
  });

  const appIsReady = !authState.checking;

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
    if (!firebaseAuth) {
      setAuthState((currentState) => ({
        ...currentState,
        checking: false,
      }));
      return undefined;
    }

    let isMounted = true;

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user) {
        if (isMounted) {
          setAuthState({
            checking: false,
            message: "",
            profile: null,
            user: null,
          });
        }
        return;
      }

      try {
        const profile = await assertHunterAccess(user);
        if (isMounted) {
          setAuthState({
            checking: false,
            message: "",
            profile,
            user,
          });
        }
      } catch (error) {
        await signOut(firebaseAuth).catch(() => {});
        if (isMounted) {
          setAuthState({
            checking: false,
            message: getAuthErrorMessage(error),
            profile: null,
            user: null,
          });
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
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
      {authState.user ? (
        <IntroScreen />
      ) : (
        <AuthScreen
          authMessage={authState.message}
          onClearAuthMessage={() =>
            setAuthState((currentState) => ({
              ...currentState,
              message: "",
            }))
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
