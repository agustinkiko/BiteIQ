import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { colors } from "@/config/theme";
import { AddMealScreen } from "@/screens/AddMealScreen";
import { AIReviewScreen } from "@/screens/AIReviewScreen";
import { AssistantScreen } from "@/screens/AssistantScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { MealDetailScreen } from "@/screens/MealDetailScreen";
import { MealHistoryScreen } from "@/screens/MealHistoryScreen";
import { OnboardingScreen } from "@/screens/OnboardingScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { useAppStore } from "@/store/useAppStore";
import { MainTabParamList, RootStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

export function AppNavigator() {
  const onboarded = useAppStore((state) => state.hasCompletedOnboarding);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!onboarded ? <Stack.Screen name="Onboarding" component={OnboardingScreen} /> : null}
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="AddMeal" component={AddMealScreen} />
      <Stack.Screen name="AIReview" component={AIReviewScreen} />
      <Stack.Screen name="MealDetail" component={MealDetailScreen} />
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
        tabBarStyle: {
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarIcon: ({ color, size }) => <Ionicons name={tabIcon(route.name)} size={size} color={color} />
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="History" component={MealHistoryScreen} />
      <Tabs.Screen name="Assistant" component={AssistantScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

function tabIcon(route: keyof MainTabParamList): keyof typeof Ionicons.glyphMap {
  if (route === "Home") return "grid";
  if (route === "History") return "time";
  if (route === "Assistant") return "sparkles";
  return "settings";
}
