import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { authClient } from "@/auth/authClient";
import { PressableScale } from "@/components/motion";
import { featureFlags } from "@/config/features";
import { colors, elevation, fonts, motion, radius } from "@/config/theme";
import { useOfflineDiaryLifecycle } from "@/hooks/useServerDayLog";
import { AddMealScreen } from "@/screens/AddMealScreen";
import { AIReviewScreen } from "@/screens/AIReviewScreen";
import { AssistantScreen } from "@/screens/AssistantScreen";
import { DiaryScreen } from "@/screens/DiaryScreen";
import { ExerciseScreen } from "@/screens/ExerciseScreen";
import { FoodDetailScreen } from "@/screens/FoodDetailScreen";
import { FoodSearchScreen } from "@/screens/FoodSearchScreen";
import { GoalsScreen } from "@/screens/GoalsScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { MealDetailScreen } from "@/screens/MealDetailScreen";
import { MoreScreen } from "@/screens/MoreScreen";
import { NutritionScreen } from "@/screens/NutritionScreen";
import { OnboardingScreen } from "@/screens/OnboardingScreen";
import { ProgressScreen } from "@/screens/ProgressScreen";
import { QuickAddScreen } from "@/screens/QuickAddScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { todayKey } from "@/services/dates";
import { useAppStore } from "@/store/useAppStore";
import { MealType } from "@/types/domain";
import { MainTabParamList, RootStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

export function AppNavigator() {
  const onboarded = useAppStore((state) => state.hasCompletedOnboarding);
  const session = authClient.useSession();
  const userId = session.data?.user.id;
  useOfflineDiaryLifecycle(userId);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!onboarded ? <Stack.Screen name="Onboarding" component={OnboardingScreen} /> : null}
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="FoodSearch" component={FoodSearchScreen} options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="FoodDetail" component={FoodDetailScreen} />
      {featureFlags.quickAdd.enabled ? <Stack.Screen name="QuickAdd" component={QuickAddScreen} /> : null}
      {featureFlags.mealPhoto.enabled || featureFlags.barcode.enabled || featureFlags.label.enabled || featureFlags.voice.enabled || featureFlags.naturalLanguageAi.enabled ? (
        <Stack.Screen name="AddMeal" component={AddMealScreen} />
      ) : null}
      {featureFlags.naturalLanguageAi.enabled ? <Stack.Screen name="AIReview" component={AIReviewScreen} /> : null}
      <Stack.Screen name="MealDetail" component={MealDetailScreen} />
      <Stack.Screen name="Nutrition" component={NutritionScreen} />
      {featureFlags.exercise.enabled ? <Stack.Screen name="Exercise" component={ExerciseScreen} /> : null}
      <Stack.Screen name="Goals" component={GoalsScreen} />
      {featureFlags.naturalLanguageAi.enabled ? <Stack.Screen name="Assistant" component={AssistantScreen} /> : null}
      {featureFlags.aiProviderConfig.enabled ? <Stack.Screen name="Settings" component={SettingsScreen} /> : null}
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtle,
        tabBarShowLabel: true,
        tabBarLabel: tabLabel(route.name),
        tabBarLabelStyle: {
          fontFamily: fonts["500"],
          fontSize: 11
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 72,
          paddingBottom: 10,
          paddingTop: 8,
          ...elevation.card
        },
        tabBarIcon: ({ focused }) => <TabIcon name={tabIcon(route.name, focused)} color={focused ? colors.primary : colors.periwinkle} focused={focused} />
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Diary" component={DiaryScreen} />
      <Tabs.Screen
        name="AddCapture"
        component={AddCapturePlaceholder}
        options={({ navigation }) => ({
          tabBarLabel: "",
          tabBarButton: () => <CenterAddButton onPress={() => openLogging(navigation)} />
        })}
      />
      {featureFlags.weightProgress.enabled ? <Tabs.Screen name="Progress" component={ProgressScreen} /> : null}
      <Tabs.Screen name="More" component={MoreScreen} />
    </Tabs.Navigator>
  );
}

/**
 * The center button drops straight into food search for whichever meal slot
 * fits the time of day — the fastest path to a logged food. AI capture is one
 * tap deeper, from the chips at the top of search.
 */
function openLogging(navigation: any) {
  const { selectedDate } = useAppStore.getState();
  const date = selectedDate || todayKey();
  const mealType = mealTypeForNow();
  navigation.getParent()?.navigate("FoodSearch", {
    mealType,
    date
  });
}

function mealTypeForNow(): MealType {
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

/** Solid glyphs throughout, as in the design — color alone marks the current tab. */
function tabIcon(route: keyof MainTabParamList, _focused: boolean): keyof typeof Ionicons.glyphMap {
  if (route === "Home") return "home";
  if (route === "Diary") return "book";
  if (route === "AddCapture") return "add";
  if (route === "Progress") return "bar-chart";
  return "menu";
}

/** The active tab's icon pops up a touch when it becomes current. */
function TabIcon({ name, color, focused }: { name: keyof typeof Ionicons.glyphMap; color: string; focused: boolean }) {
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = withSpring(focused ? 1 : 0, motion.settle);
  }, [active, focused]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -active.value * 1.5 }, { scale: 1 + active.value * 0.06 }] }));

  return (
    <Animated.View style={[styles.tabIcon, iconStyle]}>
      <Ionicons name={name} size={23} color={color} />
    </Animated.View>
  );
}

function tabLabel(route: keyof MainTabParamList) {
  if (route === "Home") return "Home";
  if (route === "Diary") return "Diary";
  if (route === "Progress") return "Progress";
  if (route === "More") return "More";
  return "";
}

function AddCapturePlaceholder() {
  return null;
}

function CenterAddButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.addButtonWrap}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Add food" onPress={onPress} pressedScale={0.88} style={styles.addButton}>
        <Ionicons name="add" size={28} color={colors.onPrimary} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  addButtonWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  addButton: {
    width: 44,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  tabIcon: {
    width: 40,
    height: 28,
    alignItems: "center",
    justifyContent: "center"
  }
});
