import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from "react-native-reanimated";
import i18n from "../lib/i18n";

export type SwipeableTeam = {
  id: string;
  name: string;
  code: string;
  created_at: string;
  myMemberId: string;
  myNickname: string;
};

type TeamRowStyles = {
  teamRow: StyleProp<ViewStyle>;
  teamRowIcon: StyleProp<ViewStyle>;
  teamRowInfo: StyleProp<ViewStyle>;
  teamRowName: StyleProp<TextStyle>;
  teamRowMeta: StyleProp<TextStyle>;
  buttonPressed: StyleProp<ViewStyle>;
};

type Props = {
  team: SwipeableTeam;
  onPress: () => void;
  onLeave: (team: SwipeableTeam, onCancel: () => void) => void;
  colors: { bg: string; icon: string };
  styles: TeamRowStyles;
  isDark: boolean;
  onSwipeActiveChange?: (active: boolean) => void;
};

const springConfig = {
  damping: 22,
  stiffness: 260,
  mass: 0.8
};

function SwipeableTeamRowComponent({
  team,
  onPress,
  onLeave,
  colors,
  styles,
  isDark,
  onSwipeActiveChange
}: Props) {
  const { width } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const rawX = useSharedValue(0);
  const thresholdReached = useSharedValue(false);
  const triggerThreshold = -Math.min(104, Math.max(76, width * 0.24));

  const setSwipeActive = useCallback(
    (active: boolean) => {
      onSwipeActiveChange?.(active);
    },
    [onSwipeActiveChange]
  );

  const triggerLeave = useCallback(() => {
    onLeave(team, () => {});
  }, [onLeave, team]);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 100000])
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          rawX.value = 0;
          thresholdReached.value = false;
          runOnJS(setSwipeActive)(true);
        })
        .onUpdate((event) => {
          const nextRawX = Math.min(0, event.translationX);
          rawX.value = nextRawX;
          translateX.value =
            nextRawX > triggerThreshold
              ? nextRawX
              : triggerThreshold + (nextRawX - triggerThreshold) * 0.28;

          if (nextRawX <= triggerThreshold && !thresholdReached.value) {
            thresholdReached.value = true;
            runOnJS(triggerHaptic)();
          } else if (nextRawX > triggerThreshold) {
            thresholdReached.value = false;
          }
        })
        .onEnd(() => {
          const shouldLeave = rawX.value <= triggerThreshold;

          translateX.value = withSpring(0, springConfig);
          rawX.value = 0;
          thresholdReached.value = false;
          runOnJS(setSwipeActive)(false);

          if (shouldLeave) {
            runOnJS(triggerLeave)();
          }
        })
        .onFinalize(() => {
          translateX.value = withSpring(0, springConfig);
          rawX.value = 0;
          thresholdReached.value = false;
          runOnJS(setSwipeActive)(false);
        }),
    [rawX, setSwipeActive, thresholdReached, translateX, triggerHaptic, triggerLeave, triggerThreshold]
  );

  useEffect(() => {
    translateX.value = 0;
    rawX.value = 0;
    thresholdReached.value = false;

    return () => onSwipeActiveChange?.(false);
  }, [onSwipeActiveChange, rawX, team.id, thresholdReached, translateX]);

  const actionStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      translateX.value,
      [triggerThreshold, triggerThreshold * 0.55, 0],
      ["#b42318", "#ef4444", isDark ? "#1c1917" : "#fffdf8"]
    )
  }));

  const actionContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [triggerThreshold * 0.75, triggerThreshold * 0.35], [1, 0], "clamp"),
    transform: [
      {
        scale: interpolate(
          translateX.value,
          [triggerThreshold * 1.08, triggerThreshold, triggerThreshold * 0.55],
          [1.2, 1.2, 0.8],
          "clamp"
        )
      }
    ]
  }));

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }]
  }));

  return (
    <View
      style={{
        position: "relative",
        marginBottom: 8,
        borderRadius: 4,
        overflow: "hidden",
        backgroundColor: isDark ? "#1c1917" : "#fffdf8"
      }}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            left: 0,
            justifyContent: "center",
            alignItems: "flex-end",
            paddingRight: 30
          },
          actionStyle
        ]}
      >
        <Animated.View
          style={[
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 6
            },
            actionContentStyle
          ]}
        >
          <Ionicons name="log-out-outline" size={24} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>{i18n.t("leaveBtn")}</Text>
        </Animated.View>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={rowStyle}>
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.teamRow, { marginBottom: 0 }, pressed && styles.buttonPressed]}
          >
            <View style={[styles.teamRowIcon, { backgroundColor: colors.bg }]}>
              <Ionicons name="people" size={18} color={colors.icon} />
            </View>
            <View style={styles.teamRowInfo}>
              <Text style={styles.teamRowName} numberOfLines={1}>
                {team.name}
              </Text>
              <Text style={styles.teamRowMeta} numberOfLines={1}>
                {team.myNickname} · {i18n.t("teamCode", { code: team.code })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={isDark ? "#78716c" : "#a8a29e"} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const SwipeableTeamRow = memo(SwipeableTeamRowComponent);
