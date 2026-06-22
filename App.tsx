import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceId } from "./lib/deviceId";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as Notifications from "expo-notifications";
import * as Localization from "expo-localization";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import * as Brightness from "expo-brightness";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { registerForPushNotificationsAsync } from "./lib/pushNotifications";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  Vibration,
  View
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { type DbAlert, type DbMember, type DbTeam, supabase } from "./lib/supabase";
import i18n from "./lib/i18n";

// ─── Types ───────────────────────────────────────────────────────────────────

type LocalTeam = DbTeam & {
  myMemberId: string;
  myNickname: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DEVICE_ID_KEY = "@acilping/device_id";
const SAVED_TEAMS_KEY = "@acilping/saved_teams";
const ALARM_KEEP_AWAKE_TAG = "acilping-active-alarm";

const TEAM_COLORS = [
  { bg: "#f1eee7", icon: "#4b5563" },
  { bg: "#ece7dc", icon: "#525252" },
  { bg: "#f5f1e9", icon: "#57534e" },
  { bg: "#eee9df", icon: "#44403c" },
  { bg: "#f7f3ea", icon: "#3f3f46" },
  { bg: "#e9e4d8", icon: "#52525b" },
  { bg: "#f3eee4", icon: "#57534e" },
  { bg: "#ebe6dc", icon: "#44403c" },
  { bg: "#f4efe6", icon: "#3f3f46" },
  { bg: "#eee7da", icon: "#525252" },
];

const DARK_TEAM_COLORS = [
  { bg: "#27231f", icon: "#d6d3ca" },
  { bg: "#2f2a23", icon: "#e7e0d3" },
  { bg: "#25211d", icon: "#d6d3ca" },
  { bg: "#302922", icon: "#e7e0d3" },
  { bg: "#29241f", icon: "#d6d3ca" },
  { bg: "#332b24", icon: "#e7e0d3" },
  { bg: "#28231e", icon: "#d6d3ca" },
  { bg: "#302821", icon: "#e7e0d3" },
  { bg: "#2a241f", icon: "#d6d3ca" },
  { bg: "#342c24", icon: "#e7e0d3" },
];

function getTeamColor(code: string, isDark = false) {
let hash = 0;
for (let i = 0; i < code.length; i++) {
hash = code.charCodeAt(i) + ((hash << 5) - hash);
}
const palette = isDark ? DARK_TEAM_COLORS : TEAM_COLORS;
const index = Math.abs(hash) % palette.length;
return palette[index];
}

const lightUi = {
  spinner: "#1c1917",
  placeholder: "#a8a29e",
  mutedIcon: "#a8a29e",
  inviteIcon: "#57534e",
  activeTabIcon: "#fafaf9",
  inactiveTabIcon: "#78716c",
};

const darkUi = {
  spinner: "#fafaf9",
  placeholder: "#78716c",
  mutedIcon: "#78716c",
  inviteIcon: "#d6d3ca",
  activeTabIcon: "#1c1917",
  inactiveTabIcon: "#a8a29e",
};

// Note: generateDeviceId is in lib/deviceId.ts — do not duplicate here

/** Nickname sanitization: letters, numbers, spaces, hyphens, underscores (2-24 chars) */
function isValidNickname(s: string): boolean {
  return /^[\p{L}\p{N} _\-]{2,24}$/u.test(s.trim());
}

function makeTeamCode() {
const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
return Array.from({ length: 6 }, () =>
letters[Math.floor(Math.random() * letters.length)]
).join("");
}

function uniqueById<T extends { id: string }>(items: T[]) {
const seen = new Set<string>();
return items.filter((item) => {
if (seen.has(item.id)) return false;
seen.add(item.id);
return true;
});
}

function encodeAlertTarget(targets: string[]) {
if (targets.length === 1) return targets[0];
return `multi:${JSON.stringify(targets)}`;
}

function parseAlertTargets(toTarget: string) {
  if (toTarget === "all") return { all: true, names: [] as string[] };
  if (!toTarget.startsWith("multi:")) return { all: false, names: [toTarget] };
  try {
    const names = JSON.parse(toTarget.slice(6));
    return Array.isArray(names)
      ? { all: false, names: names.filter((name): name is string => typeof name === "string").slice(0, 50) }
      : { all: false, names: [toTarget] };
  } catch {
    return { all: false, names: [toTarget] };
  }
}

function isAlertForNickname(toTarget: string, nickname: string) {
const parsed = parseAlertTargets(toTarget);
return parsed.all || parsed.names.includes(nickname);
}

function formatAlertTarget(toTarget: string, everyoneLabel: string) {
const parsed = parseAlertTargets(toTarget);
if (parsed.all) return everyoneLabel;
return parsed.names.join(", ");
}

function formatAlertTime(createdAt: string) {
const date = new Date(createdAt);
if (Number.isNaN(date.getTime())) return "";
const locale = Localization.getLocales()[0];
const uses24hourClock = Localization.getCalendars()[0]?.uses24hourClock;
return new Intl.DateTimeFormat(locale?.languageTag, {
hour: "numeric",
minute: "2-digit",
hour12: uses24hourClock === null ? undefined : !uses24hourClock
}).format(date);
}

function formatAlertDateTime(createdAt: string) {
const date = new Date(createdAt);
if (Number.isNaN(date.getTime())) return "";

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

const locale = Localization.getLocales()[0];

let dateString = "";
if (dateStart.getTime() === today.getTime()) {
  dateString = i18n.t("today");
} else if (dateStart.getTime() === yesterday.getTime()) {
  dateString = i18n.t("yesterday");
} else {
  dateString = new Intl.DateTimeFormat(locale?.languageTag, {
    day: "numeric",
    month: "numeric",
  }).format(date);
}

const uses24hourClock = Localization.getCalendars()[0]?.uses24hourClock;
const timePart = new Intl.DateTimeFormat(locale?.languageTag, {
hour: "numeric",
minute: "2-digit",
hour12: uses24hourClock === null ? undefined : !uses24hourClock
}).format(date);

return `${dateString} ${timePart}`;
}

// ─── Swipeable Team Row ──────────────────────────────────────────────────────

function SwipeableTeamRow({
  team,
onPress,
onLeave,
colors,
styles,
isDark
}: {
team: LocalTeam;
onPress: () => void;
onLeave: (team: LocalTeam, onCancel: () => void) => void;
colors: { bg: string; icon: string };
styles: typeof lightStyles;
isDark: boolean;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const screenWidth = Dimensions.get("window").width;
  const triggerThreshold = -80; // Threshold on RAW gesture movement (not visual)
  const hasTriggeredHaptic = useRef(false);
  const isCanceled = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          // Prevent capturing vertical scrolls. Must be mostly horizontal.
          return gestureState.dx < -10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2;
        },
        onPanResponderGrant: () => {
          hasTriggeredHaptic.current = false;
          isCanceled.current = false;
        },
        onPanResponderMove: (evt, gestureState) => {
          if (isCanceled.current) return;

          if (Math.abs(gestureState.dy) > 30 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 0.6) {
            isCanceled.current = true;
            hasTriggeredHaptic.current = false;
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
            return;
          }

          let rawX = gestureState.dx;
          if (rawX > 0) rawX = 0;

          // WhatsApp style friction: after -60px, it gets harder to pull
          let visualX = rawX > -60 ? rawX : -60 + (rawX + 60) * 0.35;

          // Provide haptic tick when raw movement reaches threshold
          if (rawX <= triggerThreshold && !hasTriggeredHaptic.current) {
            hasTriggeredHaptic.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } else if (rawX > triggerThreshold) {
            hasTriggeredHaptic.current = false;
          }

          pan.setValue({ x: visualX, y: 0 });
        },
        onPanResponderRelease: (evt, gestureState) => {
          if (isCanceled.current) return;

          // WhatsApp style: ALWAYS spring back immediately upon release
          Animated.spring(pan, { 
            toValue: { x: 0, y: 0 }, 
            friction: 6, // bouncy spring back
            useNativeDriver: true 
          }).start();

          // If they pulled far enough, trigger the action
          if (gestureState.dx <= triggerThreshold) {
            onLeave(team, () => {}); // onCancel is a no-op since it already sprang back
          }
        },
        onPanResponderTerminate: (evt, gestureState) => {
          hasTriggeredHaptic.current = false;
          isCanceled.current = false;
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        }
      }),
    [team.id]
  );

  useEffect(() => {
    pan.setValue({ x: 0, y: 0 });
    hasTriggeredHaptic.current = false;
  }, [team.id]);

  const bgColor = pan.x.interpolate({
    inputRange: [-80, -60, 0],
outputRange: ["#b42318", "#7f1d1d", isDark ? "#3f3a34" : "#ddd6c8"],
    extrapolate: "clamp"
  });

  const bgOpacity = pan.x.interpolate({
    inputRange: [-60, -30],
    outputRange: [1, 0],
    extrapolate: "clamp"
  });

  const bgScale = pan.x.interpolate({
    inputRange: [-100, -80, -60],
    outputRange: [1.2, 1.2, 0.8],
    extrapolate: "clamp"
  });

  return (
  <View style={{ position: "relative", marginBottom: 8, borderRadius: 4, overflow: "hidden", backgroundColor: isDark ? "#27231f" : "#f1eee7" }}>
      <Animated.View
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          left: 0,
          backgroundColor: bgColor,
          justifyContent: "center",
          alignItems: "flex-end",
          paddingRight: 30
        }}
      >
        <Animated.View style={{ opacity: bgOpacity, transform: [{ scale: bgScale }] }}>
          <Ionicons name="trash" size={24} color="#fff" />
        </Animated.View>
      </Animated.View>
      <Animated.View
        style={{ transform: pan.getTranslateTransform() }}
        {...panResponder.panHandlers}
      >
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
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const styles = isDark ? darkStyles : lightStyles;
  const ui = isDark ? darkUi : lightUi;
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [savedTeams, setSavedTeams] = useState<LocalTeam[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [members, setMembers] = useState<DbMember[]>([]);
  const [alertQueue, setAlertQueue] = useState<DbAlert[]>([]);
  const [alerts, setAlerts] = useState<DbAlert[]>([]);
const [loading, setLoading] = useState(false);
const [debugOpen, setDebugOpen] = useState(false);
const [debugBusy, setDebugBusy] = useState(false);
const [statusToggleLocked, setStatusToggleLocked] = useState(false);
  const [message, setMessage] = useState("");
const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(["all"]);
const [selectedAlertDetail, setSelectedAlertDetail] = useState<DbAlert | null>(null);
const [codeCopied, setCodeCopied] = useState(false);
const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
const pulse = useRef(new Animated.Value(0)).current;
const alarmSoundRef = useRef<Audio.Sound | null>(null);
const previousBrightnessRef = useRef<number | null>(null);
const ackInProgressRef = useRef(false);

const realtimeCleanupRef = useRef<(() => void) | null>(null);
const appStateRef = useRef<AppStateStatus>(AppState.currentState);
const myStatusRef = useRef<DbMember["status"]>("available");

const activeLocalTeam = savedTeams.find((t) => t.id === activeTeamId) ?? null;
const visibleMembers = uniqueById(members);
const visibleAlerts = uniqueById(alerts);
const myMember = visibleMembers.find((m) => m.id === activeLocalTeam?.myMemberId) ?? null;
const teamMates = visibleMembers.filter((m) => m.id !== activeLocalTeam?.myMemberId);
const recipients = teamMates.filter((m) => m.status === "available");
  const incomingAlert = alertQueue[0] ?? null;

const selectedAll = selectedRecipientIds.includes("all");
const selectedRecipients = selectedAll
? recipients
: recipients.filter((m) => selectedRecipientIds.includes(m.id));
const selectedTargetLabel = selectedAll
? i18n.t("everyone")
: selectedRecipients.length === 1
? selectedRecipients[0].nickname
: `${selectedRecipients.length} kişi`;

useEffect(() => {
if (myMember) myStatusRef.current = myMember.status;
}, [myMember?.status]);

  useEffect(() => {
    getDeviceId().then((id) => {
      setDeviceId(id);
      // Push token is registered after member creation to avoid race condition.
      // See createTeam() and joinTeam() for the correct registration point.
    });

    async function bootstrap() {
      try {
        const teamsJson = await AsyncStorage.getItem(SAVED_TEAMS_KEY);
        if (teamsJson) {
          const parsed = JSON.parse(teamsJson);
          // Deduplicate based on id in case old state has duplicates
          const uniqueTeams = Array.from(new Map(parsed.map((item: any) => [item.id, item])).values());
          setSavedTeams(uniqueTeams as LocalTeam[]);
        }
      } catch (e) {
        console.warn("Storage error", e);
      }
    }
    bootstrap();
  }, []);

useEffect(() => {
if (savedTeams.length === 0) return;
AsyncStorage.setItem(SAVED_TEAMS_KEY, JSON.stringify(savedTeams)).catch(() => {});
}, [savedTeams]);

const stopAlarmEffects = useCallback(async () => {
Vibration.cancel();
pulse.stopAnimation();
pulse.setValue(0);
try {
await alarmSoundRef.current?.stopAsync();
await alarmSoundRef.current?.unloadAsync();
} catch {}
alarmSoundRef.current = null;
try {
if (previousBrightnessRef.current !== null) {
await Brightness.setBrightnessAsync(previousBrightnessRef.current);
}
} catch {}
previousBrightnessRef.current = null;
deactivateKeepAwake(ALARM_KEEP_AWAKE_TAG).catch(() => {});
}, [pulse]);

const startAlarmEffects = useCallback(async () => {
await stopAlarmEffects();
try {
previousBrightnessRef.current = await Brightness.getBrightnessAsync();
await Brightness.setBrightnessAsync(1);
} catch {}
activateKeepAwakeAsync(ALARM_KEEP_AWAKE_TAG).catch(() => {});
Vibration.vibrate([0, 1000, 220, 1000, 220, 1500], true);
try {
await Audio.setAudioModeAsync({
allowsRecordingIOS: false,
interruptionModeIOS: InterruptionModeIOS.DoNotMix,
playsInSilentModeIOS: true,
staysActiveInBackground: false,
interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
shouldDuckAndroid: false,
playThroughEarpieceAndroid: false
});
const { sound } = await Audio.Sound.createAsync(
require("./assets/alarm.wav"),
{ isLooping: true, shouldPlay: true, volume: 1 }
);
alarmSoundRef.current = sound;
} catch (e) {
console.warn("Alarm sound failed", e);
}
Animated.loop(
Animated.sequence([
Animated.timing(pulse, { toValue: 1, duration: 520, useNativeDriver: true }),
Animated.timing(pulse, { toValue: 0, duration: 520, useNativeDriver: true })
])
).start();
}, [pulse, stopAlarmEffects]);

useEffect(() => {
if (!incomingAlert) {
void stopAlarmEffects();
return;
}
void startAlarmEffects();
return () => {
void stopAlarmEffects();
};
}, [incomingAlert?.id, startAlarmEffects, stopAlarmEffects]);

useEffect(() => {
return () => {
if (copyTimeout.current) clearTimeout(copyTimeout.current);
void stopAlarmEffects();
};
}, [stopAlarmEffects]);

useEffect(() => {
const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const wasBackground =
        appStateRef.current === "background" || appStateRef.current === "inactive";
      const isNowActive = nextState === "active";

      if (wasBackground && isNowActive && activeTeamId && activeLocalTeam) {
        realtimeCleanupRef.current?.();
        startRealtime(activeTeamId, activeLocalTeam.myMemberId).then((fn) => {
          realtimeCleanupRef.current = fn;
        });

        refreshTeamData(activeTeamId, activeLocalTeam.myMemberId);
      }
      appStateRef.current = nextState;
    });
return () => sub.remove();
}, [activeTeamId, activeLocalTeam]);

useEffect(() => {
const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
if (myStatusRef.current === "busy") return;
const alertId = response.notification.request.content.data?.alertId;
if (typeof alertId !== "string") return;
const localAlert = visibleAlerts.find((alert) => alert.id === alertId);
if (localAlert) {
setSelectedAlertDetail(localAlert);
return;
}
const { data } = await supabase.from("alerts").select("*").eq("id", alertId).maybeSingle();
if (data) setSelectedAlertDetail(data as DbAlert);
});
return () => sub.remove();
}, [visibleAlerts]);

const startRealtime = useCallback(
    async (teamId: string, myMemberId: string): Promise<() => void> => {
      const { data: memberSnap } = await supabase
        .from("members")
        .select("id, nickname")
        .eq("team_id", teamId);

      const myNickname =
        memberSnap?.find((m: { id: string; nickname: string }) => m.id === myMemberId)?.nickname ?? "";

      const alertChannel = supabase
        .channel(`alerts:${teamId}:${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "alerts", filter: `team_id=eq.${teamId}` },
          (payload) => {
            const newAlert = payload.new as DbAlert;
            setAlerts((prev) => uniqueById([newAlert, ...prev]));

const isForMe = isAlertForNickname(newAlert.to_target, myNickname);
const canInterruptMe = myStatusRef.current === "available";
            
            // Allow receiving our own alerts so we can test the system
if (isForMe && canInterruptMe) {
setAlertQueue((q) => [...q, newAlert]);
}
          }
        )
        .subscribe();

      const memberChannel = supabase
        .channel(`members:${teamId}:${Date.now()}`)
.on(
"postgres_changes",
{ event: "*", schema: "public", table: "members", filter: `team_id=eq.${teamId}` },
(payload) => {
if (payload.eventType === "INSERT") {
const inserted = payload.new as DbMember;
setMembers((prev) => uniqueById(prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]));
return;
}
if (payload.eventType === "DELETE") {
const deleted = payload.old as Pick<DbMember, "id">;
setMembers((prev) => prev.filter((m) => m.id !== deleted.id));
return;
}
const updated = payload.new as DbMember;
setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
}
)
        .subscribe();

      return () => {
        supabase.removeChannel(alertChannel);
        supabase.removeChannel(memberChannel);
      };
    },
    []
  );

  const refreshTeamData = useCallback(async (teamId: string, _myMemberId: string) => {
    try {
      const [{ data: membersData, error: mErr }, { data: alertsData, error: aErr }] =
        await Promise.all([
          supabase.from("members").select("id, team_id, nickname, status, device_id, created_at").eq("team_id", teamId).order("created_at"),
          supabase
            .from("alerts")
            .select("*")
            .eq("team_id", teamId)
            .order("created_at", { ascending: false })
            .limit(20)
        ]);

      if (mErr) throw mErr;
      if (aErr) throw aErr;

if (membersData) setMembers(uniqueById(membersData as DbMember[]));
if (alertsData) setAlerts(uniqueById(alertsData as DbAlert[]));
    } catch {
      Alert.alert(
        "Bağlantı Hatası",
        "Veriler yüklenemedi. İnternet bağlantınızı kontrol edin.",
        [{ text: "Tamam" }]
      );
    }
  }, []);

  useEffect(() => {
    if (!activeTeamId || !activeLocalTeam) return;

    setLoading(true);
    setMembers([]);
    setAlerts([]);
    setAlertQueue([]);

    refreshTeamData(activeTeamId, activeLocalTeam.myMemberId).finally(() =>
      setLoading(false)
    );

    startRealtime(activeTeamId, activeLocalTeam.myMemberId).then((fn) => {
      realtimeCleanupRef.current = fn;
    });

    return () => {
      realtimeCleanupRef.current?.();
      realtimeCleanupRef.current = null;
    };
  }, [activeTeamId]);

  async function createTeam() {
    if (!deviceId) return;
    const name = teamNameInput.trim();
    const nick = nicknameInput.trim();
    if (!name || !nick) {
      Alert.alert(i18n.t("missingInfo"), i18n.t("teamNameRequired"));
      return;
    }
    if (!isValidNickname(nick)) {
      Alert.alert(i18n.t("missingInfo"), "Kullanıcı adı 2-24 karakter olmalı ve özel sembol içermemeli.");
      return;
    }
    setLoading(true);
    try {
      const { data: team, error: teamErr } = await supabase
        .from("teams")
        .insert({ name: name.slice(0, 40), code: makeTeamCode() })
        .select()
        .single();
      if (teamErr || !team) throw teamErr ?? new Error("Team oluşturulamadı");

      const { data: member, error: memberErr } = await supabase
        .from("members")
        .insert({ team_id: team.id, nickname: nick, status: "available", device_id: deviceId })
        .select()
        .single();
      if (memberErr || !member) throw memberErr ?? new Error("Üye eklenemedi");

      // Save push token now that member exists in DB
      registerForPushNotificationsAsync().then(async (token) => {
        if (token) {
          try {
            await supabase.from("members").update({ push_token: token }).eq("id", member.id);
          } catch {}
        }
      }).catch(() => {});

      const localTeam: LocalTeam = { ...(team as DbTeam), myMemberId: member.id, myNickname: nick };
      setSavedTeams((prev) => [localTeam, ...prev]);
      setActiveTeamId(team.id);
      setTeamNameInput("");
      setNicknameInput("");
      setSelectedRecipientIds(["all"]);
      setMessage("");
    } catch (e: any) {
      Alert.alert(i18n.t("error"), e?.message ?? i18n.t("alertFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function joinTeam() {
    if (!deviceId) return;
    const code = joinCodeInput.trim().toUpperCase();
    const nick = nicknameInput.trim();
    if (code.length < 4 || !nick) {
      Alert.alert(i18n.t("missingInfo"), i18n.t("joinCodeRequired"));
      return;
    }
    if (!isValidNickname(nick)) {
      Alert.alert(i18n.t("missingInfo"), "Kullanıcı adı 2-24 karakter olmalı ve özel sembol içermemeli.");
      return;
    }

    // Zaten bu takımda mıyız? Direkt aç.
    const alreadyIn = savedTeams.find((t) => t.code === code);
    if (alreadyIn) {
      Alert.alert(
        i18n.t("alreadyMemberTitle"),
        i18n.t("alreadyMemberMsg", { team: alreadyIn.name }),
        [
          { text: i18n.t("ok"), style: "cancel" },
          {
            text: i18n.t("enterTeam"),
            onPress: () => {
              setActiveTeamId(alreadyIn.id);
              setJoinCodeInput("");
              setNicknameInput("");
            }
          }
        ]
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: team, error: teamErr } = await supabase
        .from("teams")
        .select("*")
        .eq("code", code)
        .single();

      // Network hatası vs "bulunamadı" hatasını ayırt et
      if (teamErr?.code === "PGRST116" || !team) {
        Alert.alert(i18n.t("notFound"), i18n.t("teamNotFound"));
        setLoading(false);
        return;
      }
      if (teamErr) throw teamErr;

      const { data: existing } = await supabase
        .from("members")
        .select("*")
        .eq("team_id", team.id)
        .eq("device_id", deviceId)
        .maybeSingle();

      let memberId: string;
      if (existing) {
        memberId = existing.id;
      } else {
        const { data: member, error: memberErr } = await supabase
          .from("members")
          .insert({ team_id: team.id, nickname: nick, status: "available", device_id: deviceId })
          .select()
          .single();
        if (memberErr || !member) throw memberErr ?? new Error("Üye eklenemedi");
        memberId = member.id;
        // Save push token now that member exists in DB
        registerForPushNotificationsAsync().then(async (token) => {
          if (token) {
            try {
              await supabase.from("members").update({ push_token: token }).eq("id", memberId);
            } catch {}
          }
        }).catch(() => {});
      }

      const localTeam: LocalTeam = { ...(team as DbTeam), myMemberId: memberId, myNickname: nick };
      setSavedTeams((prev) => {
        const exists = prev.find((t) => t.id === team.id);
        return exists ? prev.map((t) => (t.id === team.id ? localTeam : t)) : [localTeam, ...prev];
      });
      setActiveTeamId(team.id);
      setJoinCodeInput("");
      setNicknameInput("");
      setSelectedRecipientIds(["all"]);
      setMessage("");
    } catch (e: any) {
      Alert.alert(i18n.t("error"), e?.message ?? i18n.t("alertFailed"));
    } finally {
      setLoading(false);
    }
  }

  function leaveTeam(localTeam: LocalTeam, onCancel?: () => void) {
    Alert.alert(
      i18n.t("leaveTeamTitle"),
      i18n.t("leaveTeamMsg", { team: localTeam.name }),
      [
        { text: i18n.t("cancel"), style: "cancel", onPress: onCancel },
        {
          text: i18n.t("leaveBtn"),
          style: "destructive",
          onPress: async () => {
            try {
              await supabase.from("members").delete().eq("id", localTeam.myMemberId);
            } catch (e) {
              console.warn("Failed to delete member", e);
            }
            setSavedTeams((prev) => prev.filter((t) => t.id !== localTeam.id));
          }
        }
      ]
    );
  }

  function goHome() {
    realtimeCleanupRef.current?.();
    realtimeCleanupRef.current = null;
    setActiveTeamId(null);
    setMembers([]);
    setAlerts([]);
    setAlertQueue([]);
    setMessage("");
setSelectedRecipientIds(["all"]);
  }

function copyCode() {
if (!activeLocalTeam) return;
Clipboard.setString(activeLocalTeam.code);
setCodeCopied(true);
if (copyTimeout.current) clearTimeout(copyTimeout.current);
copyTimeout.current = setTimeout(() => setCodeCopied(false), 2000);
}

async function addDebugMember() {
if (!activeLocalTeam || debugBusy) return;
setDebugBusy(true);
try {
const nickname = `Test ${teamMates.length + 1}`;
const { data, error } = await supabase
.from("members")
.insert({
team_id: activeLocalTeam.id,
nickname,
status: "available",
device_id: `debug_${Date.now()}`,
push_token: null
})
.select()
.single();
if (error || !data) throw error ?? new Error("Test üye eklenemedi");
const member = data as DbMember;
setMembers((prev) => uniqueById(prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
} catch (e: any) {
Alert.alert(i18n.t("error"), e?.message ?? "Debug işlemi başarısız.");
} finally {
setDebugBusy(false);
}
}

async function sendDebugAlertToMe() {
if (!activeLocalTeam || !myMember || debugBusy) return;
setDebugBusy(true);
try {
const text = message.trim() || "Debug test alarmı";
const { error } = await supabase.from("alerts").insert({
team_id: activeLocalTeam.id,
from_nickname: "Debug",
to_target: myMember.nickname,
message: text,
acknowledged: false
});
if (error) throw error;
} catch (e: any) {
Alert.alert(i18n.t("error"), e?.message ?? "Debug alarmı gönderilemedi.");
} finally {
setDebugBusy(false);
}
}

async function toggleMyStatus() {
    if (!myMember) return;
    const newStatus = myMember.status === "available" ? "busy" : "available";
    const oldStatus = myMember.status;
    
// Optimistic update
myStatusRef.current = newStatus;
if (newStatus === "busy") {
void stopAlarmEffects();
setAlertQueue([]);
}
setMembers((prev) => uniqueById(prev.map((m) => (m.id === myMember.id ? { ...m, status: newStatus } : m))));
    
    try {
      const { error } = await supabase
        .from("members")
        .update({ status: newStatus })
        .eq("id", myMember.id);
        
      if (error) {
        console.warn("Status update error:", error);
setMembers((prev) =>
prev.map((m) => (m.id === myMember.id ? { ...m, status: oldStatus } : m))
);
myStatusRef.current = oldStatus;
        Alert.alert(i18n.t("error"), i18n.t("statusFailed"));
      }
    } catch (e) {
      console.warn("Status update exception:", e);
setMembers((prev) =>
prev.map((m) => (m.id === myMember.id ? { ...m, status: oldStatus } : m))
);
myStatusRef.current = oldStatus;
    }
  }

  function sendAlert() {
    if (!activeLocalTeam || !myMember) return;
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert(i18n.t("messageRequiredTitle"), i18n.t("messageRequiredMsg"));
      return;
    }
const targetNames = selectedAll ? ["all"] : selectedRecipients.map((m) => m.nickname);
if (targetNames.length === 0) {
Alert.alert(i18n.t("missingInfo"), "En az bir kişi seç.");
return;
}
const displayTarget = selectedAll ? i18n.t("everyone") : targetNames.join(", ");
    
    Alert.alert(
      i18n.t("confirmAlertTitle"),
      i18n.t("confirmAlertMsg", { message: trimmed, target: displayTarget }),
      [
        { text: i18n.t("cancel"), style: "cancel" },
        {
          text: i18n.t("yesSend"),
          style: "destructive",
          onPress: async () => {
            try {
const targetName = encodeAlertTarget(targetNames);
const { error } = await supabase.from("alerts").insert({
team_id: activeLocalTeam.id,
from_nickname: myMember.nickname,
to_target: targetName,
message: trimmed,
acknowledged: false
});
if (error) throw error;
setMessage("");
              // Push notifications are now sent server-side via DB trigger → Edge Function

            } catch {
              Alert.alert(i18n.t("error"), i18n.t("alertFailed"));
            }
          }
        }
      ]
    );
  }

  // Kuyruktaki ilk alarmı kapat, varsa bir sonrakine geç
  async function acknowledgeAlert() {
    if (!incomingAlert) return;
    // Debounce: prevent double-tap from firing twice
    if (ackInProgressRef.current) return;
    ackInProgressRef.current = true;

    void stopAlarmEffects();
    setAlertQueue((q) => q.slice(1));

    try {
      await supabase
        .from("alerts")
        .update({ acknowledged: true })
        .eq("id", incomingAlert.id);
      setAlerts((prev) =>
        prev.map((a) => (a.id === incomingAlert.id ? { ...a, acknowledged: true } : a))
      );
    } catch {
      // Sessizce geç — kullanıcıyı bloke etme
    } finally {
      ackInProgressRef.current = false;
    }
  }

  // ── Form state ──
  const [teamNameInput, setTeamNameInput] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");

  // ── Segmented tab (0 = Oluştur, 1 = Katıl) ──
  const [homeTab, setHomeTab] = useState(0);
  const tabAnim = useRef(new Animated.Value(0)).current;

  function switchTab(index: number) {
    setHomeTab(index);
    setNicknameInput("");
    Animated.spring(tabAnim, {
      toValue: index,
      useNativeDriver: false,
      speed: 20,
      bounciness: 4
    }).start();
  }

  // ─── Bootstrap tamamlanana kadar bekle ──────────────────────────────────────

  if (!deviceId) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={ui.spinner} />
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HOME SCREEN
  // ─────────────────────────────────────────────────────────────────────────────

  if (!activeTeamId) {
    return (
      <View style={styles.screen}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.authLayout}
        >
          <ScrollView
            contentContainerStyle={[
              styles.authScroll,
              { paddingTop: Math.max(insets.top, 10), paddingBottom: Math.max(insets.bottom, 40) }
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Hero */}
            <View style={styles.hero}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="radio" size={36} color="#fff" />
              </View>
              <Text style={styles.heroTitle}>{i18n.t("appTitle")}</Text>
              <Text style={styles.heroSub}>{i18n.t("appSub")}</Text>
            </View>

            {/* Takımlarım */}
            {savedTeams.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{i18n.t("myTeams")}</Text>
                  <Text style={styles.sectionMeta}>{i18n.t("teamCount", { count: savedTeams.length })}</Text>
                </View>
                {savedTeams.map((t) => {
                  const colors = getTeamColor(t.code, isDark);
                  return (
                    <SwipeableTeamRow
                      key={t.id}
                      team={t}
                      onPress={() => setActiveTeamId(t.id)}
                      onLeave={leaveTeam}
                      colors={colors}
                      styles={styles}
                      isDark={isDark}
                    />
                  );
                })}
              </View>
            )}

            {/* Segmented kart */}
            <View style={styles.card}>
              {/* Tab bar */}
              <View style={styles.segmentTrack}>
                {/* Sliding indicator */}
                <Animated.View
                  style={[
                    styles.segmentIndicator,
                    {
                      left: tabAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["2%", "51%"]
                      })
                    }
                  ]}
                />
                <Pressable style={styles.segmentBtn} onPress={() => switchTab(0)}>
                  <Ionicons
                    name="add-circle-outline"
                    size={16}
                    color={homeTab === 0 ? ui.activeTabIcon : ui.inactiveTabIcon}
                  />
                  <Text style={[styles.segmentLabel, homeTab === 0 && styles.segmentLabelActive]}>
                    {i18n.t("createTab")}
                  </Text>
                </Pressable>
                <Pressable style={styles.segmentBtn} onPress={() => switchTab(1)}>
                  <Ionicons
                    name="enter-outline"
                    size={16}
                    color={homeTab === 1 ? ui.activeTabIcon : ui.inactiveTabIcon}
                  />
                  <Text style={[styles.segmentLabel, homeTab === 1 && styles.segmentLabelActive]}>
                    {i18n.t("joinTab")}
                  </Text>
                </Pressable>
              </View>

              {/* Oluştur formu */}
              {homeTab === 0 && (
                <>
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setTeamNameInput}
                    placeholder={i18n.t("teamNamePlaceholder")}
                    placeholderTextColor={ui.placeholder}
                    style={styles.input}
                    value={teamNameInput}
                    maxLength={40}
                  />
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setNicknameInput}
                    placeholder={i18n.t("yourNickname")}
                    placeholderTextColor={ui.placeholder}
                    style={styles.input}
                    value={nicknameInput}
                    maxLength={24}
                  />
                  <Pressable
                    onPress={createTeam}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      (pressed || loading) && styles.buttonPressed
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator color={isDark ? "#1c1917" : "#fff"} />
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={20} color="#fff" />
                        <Text style={styles.primaryButtonText}>{i18n.t("createTeamBtn")}</Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}

              {/* Katıl formu */}
              {homeTab === 1 && (
                <>
                  <TextInput
                    autoCapitalize="characters"
                    onChangeText={setJoinCodeInput}
                    placeholder={i18n.t("joinCodePlaceholder")}
                    placeholderTextColor={ui.placeholder}
                    style={styles.input}
                    value={joinCodeInput}
                    maxLength={8}
                  />
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setNicknameInput}
                    placeholder={i18n.t("yourNickname")}
                    placeholderTextColor={ui.placeholder}
                    style={styles.input}
                    value={nicknameInput}
                    maxLength={24}
                  />
                  <Pressable
                    onPress={joinTeam}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      (pressed || loading) && styles.buttonPressed
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator color={isDark ? "#fafaf9" : "#1c1917"} />
                    ) : (
                      <>
                        <Ionicons name="enter" size={20} color="#92400e" />
                        <Text style={styles.secondaryButtonText}>{i18n.t("joinTeamBtn")}</Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEAM SCREEN
  // ─────────────────────────────────────────────────────────────────────────────

  // Team Screen doesn't use a full-screen loading return anymore to avoid flickering headers.

  return (
    <View style={styles.screen}>
        <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) }]}>
        <Pressable onPress={goHome} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#94a3b8" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerKicker}>{i18n.t("teamKicker")}</Text>
          {/* Bug #5: numberOfLines */}
          <Text style={styles.headerTitle} numberOfLines={1}>{activeLocalTeam?.name}</Text>
        </View>
        <Pressable onPress={copyCode} style={styles.codeBadge}>
          <Text style={styles.codeLabel}>{codeCopied ? i18n.t("copied") : "Kod"}</Text>
          <Text style={styles.codeText}>{activeLocalTeam?.code}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 40) }
        ]}
        showsVerticalScrollIndicator={false}
keyboardShouldPersistTaps="handled"
>
        {/* Debug panel — only visible in development builds */}
        {__DEV__ && (
          <View style={styles.debugPanel}>
            <Pressable
              onPress={() => setDebugOpen((open) => !open)}
              style={({ pressed }) => [styles.debugHeader, pressed && styles.buttonPressed]}
            >
              <View style={styles.debugHeaderText}>
                <Text style={styles.debugTitle}>Debug</Text>
                <Text style={styles.debugHint} numberOfLines={1}>
                  Test araçları
                </Text>
              </View>
              <Ionicons name={debugOpen ? "chevron-up" : "chevron-down"} size={18} color={ui.mutedIcon} />
            </Pressable>

            {debugOpen && (
              <View style={styles.debugBody}>
                <Pressable
                  disabled={debugBusy}
                  onPress={addDebugMember}
                  style={({ pressed }) => [styles.debugButton, (pressed || debugBusy) && styles.buttonPressed]}
                >
                  <Ionicons name="person-add-outline" size={17} color={ui.inviteIcon} />
                  <Text style={styles.debugButtonText}>Takıma test adamı ekle</Text>
                </Pressable>
                <Pressable
                  disabled={debugBusy}
                  onPress={sendDebugAlertToMe}
                  style={({ pressed }) => [styles.debugButton, (pressed || debugBusy) && styles.buttonPressed]}
                >
                  <Ionicons name="send-outline" size={17} color={ui.inviteIcon} />
                  <Text style={styles.debugButtonText}>Kendime test alarmı gönder</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

{/* Members */}
<View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{i18n.t("membersTitle")}</Text>
            <Text style={styles.sectionMeta}>{i18n.t("membersCount", { count: visibleMembers.length })}</Text>
          </View>
          
          {loading && members.length === 0 ? (
            <ActivityIndicator size="small" color={ui.spinner} style={{ marginVertical: 20 }} />
          ) : (
            visibleMembers.map((member) => {
              const isMe = member.id === activeLocalTeam?.myMemberId;
              return (
                <View key={member.id} style={styles.memberRow}>
                  <View style={[styles.avatar, member.status === "busy" && styles.avatarBusy]}>
                    <Text style={[styles.avatarText, member.status === "busy" && styles.avatarTextBusy]}>
                      {member.nickname.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.nickname}{isMe ? i18n.t("you") : ""}
                    </Text>
                    <Text style={[styles.memberStatus, member.status === "busy" && styles.memberStatusBusy]}>
                      {member.status === "available" ? `● ${i18n.t("available")}` : `● ${i18n.t("busy")}`}
                    </Text>
                  </View>
                  {isMe && (
                    <Pressable
                      onPress={toggleMyStatus}
                      style={({ pressed }) => [
                        styles.statusToggle,
                        member.status === "available" ? styles.statusToggleAvailable : styles.statusToggleBusy,
                        pressed && styles.buttonPressed
                      ]}
                    >
                      <Text style={styles.statusToggleText}>
                        {member.status === "available" ? i18n.t("busy") : i18n.t("available")}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Composer */}
        {loading && members.length === 0 ? (
          <View style={styles.composerCard}>
            <ActivityIndicator size="small" color={ui.spinner} style={{ marginVertical: 10 }} />
          </View>
        ) : teamMates.length === 0 ? (
          <View style={styles.inviteEmptyCard}>
            <Ionicons name="people-outline" size={30} color={ui.inviteIcon} />
            <Text style={styles.inviteEmptyTitle}>{i18n.t("inviteEmptyTitle")}</Text>
            <Text style={styles.inviteEmptyText}>
              {i18n.t("inviteEmptyMessage", { code: activeLocalTeam?.code ?? "" })}
            </Text>
            <Pressable onPress={copyCode} style={({ pressed }) => [styles.inviteCodeButton, pressed && styles.buttonPressed]}>
              <Text style={styles.inviteCodeLabel}>
                {codeCopied ? i18n.t("copied") : i18n.t("teamCode", { code: activeLocalTeam?.code ?? "" })}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.composerCard}>
            <Text style={styles.sectionTitle}>{i18n.t("sendAlertTitle")}</Text>

            {recipients.length === 0 ? (
              <Text style={styles.emptyText}>{i18n.t("inviteOthers")}</Text>
            ) : (
              <FlatList
              data={[
                { id: "all", nickname: i18n.t("everyone"), status: "available" as const, team_id: "", device_id: null, push_token: null, created_at: "" },
                ...recipients
              ]}
              horizontal
keyExtractor={(item) => (item.id === "all" ? "recipient-all" : `recipient-${item.id}`)}
renderItem={({ item }) => {
const selected = selectedRecipientIds.includes(item.id);
return (
<Pressable
                    onPress={() => {
                      if (item.id === "all") {
                        setSelectedRecipientIds(["all"]);
                        return;
                      }
                      setSelectedRecipientIds((prev) => {
                        const withoutAll = prev.filter((id) => id !== "all");
                        const next = withoutAll.includes(item.id)
                          ? withoutAll.filter((id) => id !== item.id)
                          : [...withoutAll, item.id];
                        return next.length === 0 ? ["all"] : next;
                      });
                    }}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                      {item.nickname}
                    </Text>
                  </Pressable>
                );
              }}
              showsHorizontalScrollIndicator={false}
              style={styles.chipList}
            />
            )}
            <TextInput
            multiline
            onChangeText={setMessage}
            placeholder={i18n.t("alertMessagePlaceholder")}
            placeholderTextColor={ui.placeholder}
            style={styles.messageInput}
            value={message}
            maxLength={300}
          />
          <Pressable
            onPress={sendAlert}
            style={({ pressed }) => [styles.dangerButton, pressed && styles.buttonPressed]}
          >
            <Ionicons name="notifications" size={20} color="#fff" />
            <Text style={styles.dangerButtonText} numberOfLines={1}>
              {i18n.t("sendBtn")} → {selectedTargetLabel}
            </Text>
</Pressable>
          </View>
        )}

        {/* History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{i18n.t("historyTitle")}</Text>
            <Text style={styles.sectionMeta}>{i18n.t("historyCount", { count: visibleAlerts.length })}</Text>
          </View>
          
          {loading && alerts.length === 0 ? (
            <ActivityIndicator size="small" color={ui.spinner} style={{ marginVertical: 20 }} />
          ) : visibleAlerts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={32} color={ui.mutedIcon} />
              <Text style={styles.emptyText}>{i18n.t("noAlerts")}</Text>
            </View>
          ) : (
visibleAlerts.slice(0, 10).map((item, index, visibleItems) => (
<Pressable
key={item.id}
onPress={() => setSelectedAlertDetail(item)}
onLongPress={() => setSelectedAlertDetail(item)}
style={({ pressed }) => [styles.historyRow, pressed && styles.buttonPressed]}
>
                <View style={styles.historyTimeline}>
                  <View style={[styles.historyDot, item.acknowledged ? styles.historyDotAck : styles.historyDotPending]} />
                  {index < visibleItems.length - 1 && <View style={styles.historyLine} />}
                </View>
                <View style={styles.historyInfo}>
                  <View style={styles.historyTopLine}>
                    <Text style={styles.historyMessage} numberOfLines={2}>{item.message}</Text>
                    <Text style={styles.historyTime}>{formatAlertDateTime(item.created_at)}</Text>
                  </View>
                  <Text style={styles.historyMeta} numberOfLines={1}>
                    {item.from_nickname} → {formatAlertTarget(item.to_target, i18n.t("everyone"))}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      {/* Bug #4: Alarm kuyruğu — sıradaki varsa göster */}
      <Modal animationType="fade" transparent visible={Boolean(incomingAlert)}>
        <View style={styles.modalBackdrop}>
          <Animated.View
            style={[
              styles.alarmCard,
              {
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.04]
                    })
                  }
                ]
              }
            ]}
          >
            {/* Bug #4: Kuyrukta kaç alarm var göster */}
            {alertQueue.length > 1 && (
              <View style={styles.queueBadge}>
                <Text style={styles.queueBadgeText}>+{alertQueue.length - 1} alarm bekliyor</Text>
              </View>
            )}
            <View style={styles.alarmIcon}>
              <Ionicons name="alert" size={44} color="#fff" />
            </View>
            <Text style={styles.alarmTitle}>{i18n.t("incomingAlert")}</Text>
            <Text style={styles.alarmFrom}>{i18n.t("from", { name: incomingAlert?.from_nickname })}</Text>
            <Text style={styles.alarmMessage}>{incomingAlert?.message}</Text>
            <Pressable
              onPress={acknowledgeAlert}
              style={({ pressed }) => [styles.ackButton, pressed && styles.buttonPressed]}
            >
              <Ionicons name="checkmark-circle" size={22} color="#92400e" />
              <Text style={styles.ackButtonText}>
                {i18n.t("acknowledgeBtn")}{alertQueue.length > 1 ? ` (${alertQueue.length - 1} kaldı)` : ""}
              </Text>
            </Pressable>
          </Animated.View>
</View>
</Modal>

<Modal animationType="fade" transparent visible={Boolean(selectedAlertDetail)}>
  <View style={styles.modalBackdrop}>
    <View style={styles.detailCard}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailTitle}>Alarm detayı</Text>
        <Pressable onPress={() => setSelectedAlertDetail(null)} style={({ pressed }) => [styles.detailClose, pressed && styles.buttonPressed]}>
          <Ionicons name="close" size={20} color={ui.inviteIcon} />
        </Pressable>
      </View>
      {selectedAlertDetail && (
        <>
          <Text style={styles.detailMessage}>{selectedAlertDetail.message}</Text>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Gönderen</Text>
            <Text style={styles.detailValue}>{selectedAlertDetail.from_nickname}</Text>
          </View>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Alıcılar</Text>
            <ScrollView style={styles.detailTargets} nestedScrollEnabled>
              {parseAlertTargets(selectedAlertDetail.to_target).all ? (
                <Text style={styles.detailValue}>{i18n.t("everyone")}</Text>
              ) : (
                <Text style={styles.detailValue}>
                  {parseAlertTargets(selectedAlertDetail.to_target).names.join(", ")}
                </Text>
              )}
            </ScrollView>
          </View>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Durum</Text>
            <Text style={styles.detailValue}>{selectedAlertDetail.acknowledged ? "Kapatıldı" : "Aktif"}</Text>
          </View>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Gönderilme Zamanı</Text>
            <Text style={styles.detailValue}>
              {(() => {
                const d = new Date(selectedAlertDetail.created_at);
                if (Number.isNaN(d.getTime())) return "—";
                return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
                  + "  ·  " + formatAlertTime(selectedAlertDetail.created_at);
              })()}
            </Text>
          </View>
        </>
      )}
    </View>
  </View>
</Modal>
</View>
);
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const lightStyles = StyleSheet.create({
screen: { flex: 1, backgroundColor: "#f7f5ef" },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
loadingText: { color: "#78716c", fontSize: 15 },

  authLayout: { flex: 1 },
authScroll: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 40, gap: 14 },
hero: { alignItems: "flex-start", paddingTop: 8, paddingBottom: 10, gap: 6 },
  heroIconWrap: {
width: 42, height: 42, borderRadius: 6, backgroundColor: "#1c1917",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
shadowColor: "transparent", shadowOffset: { width: 0, height: 0 },
shadowOpacity: 0, shadowRadius: 0
  },
heroTitle: { fontSize: 30, fontWeight: "800", color: "#1c1917" },
heroSub: { fontSize: 14, color: "#78716c", lineHeight: 20, maxWidth: 340 },

card: { backgroundColor: "#fffdf8", borderRadius: 6, padding: 14, gap: 10, borderWidth: 1, borderColor: "#ddd6c8" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
cardIconWrap: { width: 32, height: 32, borderRadius: 4, backgroundColor: "#f1eee7", alignItems: "center", justifyContent: "center" },
cardTitle: { fontSize: 17, fontWeight: "700", color: "#1c1917" },
input: { backgroundColor: "#fffefb", borderColor: "#d6d3ca", borderRadius: 4, borderWidth: 1, color: "#1c1917", fontSize: 15, height: 46, paddingHorizontal: 12 },
primaryButton: { alignItems: "center", backgroundColor: "#1c1917", borderRadius: 4, flexDirection: "row", gap: 8, height: 46, justifyContent: "center", shadowColor: "transparent", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0 },
primaryButtonText: { color: "#fafaf9", fontSize: 15, fontWeight: "700" },
secondaryButton: { alignItems: "center", backgroundColor: "#e7e0d3", borderRadius: 4, borderWidth: 1, borderColor: "#d6d3ca", flexDirection: "row", gap: 8, height: 46, justifyContent: "center" },
secondaryButtonText: { color: "#1c1917", fontSize: 15, fontWeight: "700" },
buttonPressed: { opacity: 0.7 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
dividerLine: { flex: 1, height: 1, backgroundColor: "#ddd6c8" },
dividerText: { color: "#78716c", fontSize: 13, fontWeight: "600" },

  // ── Segment tab ──
  segmentTrack: {
    flexDirection: "row",
backgroundColor: "#f1eee7",
borderRadius: 6,
    padding: 4,
    position: "relative",
    height: 52,
    marginBottom: 8,
    borderWidth: 1,
borderColor: "#ddd6c8"
  },
  segmentIndicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    width: "47%",
backgroundColor: "#1c1917",
borderRadius: 4,
shadowColor: "transparent",
shadowOffset: { width: 0, height: 0 },
shadowOpacity: 0,
shadowRadius: 0
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    zIndex: 1,
borderRadius: 4
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: "700",
color: "#78716c"
  },
  segmentLabelActive: {
color: "#fafaf9"
  },

teamRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fffdf8", borderRadius: 4, borderWidth: 1, borderColor: "#ddd6c8", padding: 12, gap: 10 },
teamRowIcon: { width: 34, height: 34, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  teamRowInfo: { flex: 1, overflow: "hidden" },
teamRowName: { color: "#1c1917", fontSize: 15, fontWeight: "700" },
teamRowMeta: { color: "#78716c", fontSize: 13, marginTop: 2 },

header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#ddd6c8", gap: 10, backgroundColor: "#fffdf8" },
backButton: { width: 38, height: 38, borderRadius: 4, backgroundColor: "#f7f5ef", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#ddd6c8" },
  headerCenter: { flex: 1, overflow: "hidden" },
headerKicker: { color: "#78716c", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
headerTitle: { color: "#1c1917", fontSize: 19, fontWeight: "800" },
codeBadge: { backgroundColor: "#fffdf8", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 7, alignItems: "center", borderWidth: 1, borderColor: "#d6d3ca", minWidth: 86 },
codeLabel: { color: "#78716c", fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
codeText: { color: "#1c1917", fontSize: 15, fontWeight: "800", letterSpacing: 1 },

  scrollView: { flex: 1 },
content: { gap: 16, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
section: { gap: 10 },
sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
sectionTitle: { color: "#1c1917", fontSize: 16, fontWeight: "800" },
sectionMeta: { color: "#78716c", fontSize: 13, fontWeight: "600" },

debugPanel: { backgroundColor: "#fffdf8", borderRadius: 6, borderWidth: 1, borderColor: "#ddd6c8", overflow: "hidden" },
debugHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 },
debugHeaderText: { flex: 1, gap: 2 },
debugTitle: { color: "#1c1917", fontSize: 15, fontWeight: "800" },
debugHint: { color: "#78716c", fontSize: 12, fontWeight: "600" },
debugBody: { borderTopWidth: 1, borderTopColor: "#ddd6c8", gap: 8, padding: 10 },
debugButton: { alignItems: "center", backgroundColor: "#f7f5ef", borderRadius: 4, borderWidth: 1, borderColor: "#d6d3ca", flexDirection: "row", gap: 8, minHeight: 40, paddingHorizontal: 10 },
debugButtonText: { color: "#1c1917", flex: 1, fontSize: 14, fontWeight: "700" },

memberRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fffdf8", borderRadius: 4, borderWidth: 1, borderColor: "#ddd6c8", padding: 12, gap: 10 },
avatar: { width: 36, height: 36, borderRadius: 4, backgroundColor: "#f1eee7", alignItems: "center", justifyContent: "center" },
avatarBusy: { backgroundColor: "#f3e6e3" },
avatarText: { color: "#44403c", fontSize: 16, fontWeight: "800" },
avatarTextBusy: { color: "#b42318" },
  memberInfo: { flex: 1, overflow: "hidden" },
memberName: { color: "#1c1917", fontSize: 15, fontWeight: "700" },
memberStatus: { color: "#4d7c0f", fontSize: 13, marginTop: 2, fontWeight: "600" },
memberStatusBusy: { color: "#b42318" },
statusToggle: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, borderWidth: 1 },
statusToggleAvailable: { backgroundColor: "#fffdf8", borderColor: "#b42318" },
statusToggleBusy: { backgroundColor: "#fffdf8", borderColor: "#4d7c0f" },
statusToggleText: { color: "#1c1917", fontSize: 12, fontWeight: "700" },

composerCard: { backgroundColor: "#fffdf8", borderRadius: 6, borderWidth: 1, borderColor: "#ddd6c8", padding: 14, gap: 12 },
inviteEmptyCard: { alignItems: "center", backgroundColor: "#fffdf8", borderRadius: 6, borderWidth: 1, borderColor: "#ddd6c8", gap: 8, padding: 18 },
inviteEmptyTitle: { color: "#1c1917", fontSize: 16, fontWeight: "800", textAlign: "center" },
inviteEmptyText: { color: "#78716c", fontSize: 14, fontWeight: "600", lineHeight: 20, textAlign: "center" },
inviteCodeButton: { backgroundColor: "#f7f5ef", borderColor: "#d6d3ca", borderRadius: 4, borderWidth: 1, marginTop: 4, paddingHorizontal: 12, paddingVertical: 9 },
inviteCodeLabel: { color: "#1c1917", fontSize: 14, fontWeight: "800" },
  chipList: { marginHorizontal: -4 },
chip: { backgroundColor: "#fffefb", borderColor: "#d6d3ca", borderRadius: 4, borderWidth: 1, marginHorizontal: 4, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 140 },
chipSelected: { backgroundColor: "#1c1917", borderColor: "#1c1917" },
chipText: { color: "#57534e", fontSize: 14, fontWeight: "700" },
chipTextSelected: { color: "#fafaf9" },
messageInput: { backgroundColor: "#fffefb", borderColor: "#d6d3ca", borderRadius: 4, borderWidth: 1, color: "#1c1917", fontSize: 15, minHeight: 86, padding: 12, textAlignVertical: "top" },
dangerButton: { alignItems: "center", backgroundColor: "#b42318", borderRadius: 4, flexDirection: "row", gap: 8, height: 48, justifyContent: "center", shadowColor: "transparent", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0 },
dangerButtonText: { color: "#fffdf8", fontSize: 15, fontWeight: "800", flexShrink: 1 },

  emptyState: { alignItems: "center", gap: 8, padding: 24 },
emptyText: { color: "#78716c", fontSize: 14, fontWeight: "600" },
  historyRow: { flexDirection: "row", alignItems: "stretch", gap: 12, minHeight: 54 },
  historyTimeline: { alignItems: "center", width: 14 },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
historyLine: { flex: 1, width: 1, backgroundColor: "#ddd6c8", marginTop: 7 },
historyDotPending: { backgroundColor: "#b42318" },
historyDotAck: { backgroundColor: "#4d7c0f" },
historyInfo: { flex: 1, gap: 4, paddingBottom: 16 },
historyTopLine: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
historyMessage: { color: "#1c1917", flex: 1, fontSize: 15, fontWeight: "700" },
historyTime: { color: "#78716c", fontSize: 12, fontWeight: "700", marginTop: 2 },
historyMeta: { color: "#78716c", fontSize: 13 },

modalBackdrop: { flex: 1, backgroundColor: "rgba(28,25,23,0.72)", alignItems: "center", justifyContent: "center", padding: 20 },
alarmCard: { alignItems: "center", backgroundColor: "#fffdf8", borderRadius: 6, borderWidth: 1, borderColor: "#b42318", padding: 24, width: "100%", gap: 8 },
queueBadge: { backgroundColor: "#b42318", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  queueBadgeText: { color: "#fff", fontSize: 13, fontWeight: "800" },
alarmIcon: { width: 70, height: 70, borderRadius: 6, backgroundColor: "#b42318", alignItems: "center", justifyContent: "center", marginBottom: 8, shadowColor: "transparent", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0 },
alarmTitle: { color: "#1c1917", fontSize: 26, fontWeight: "900" },
alarmFrom: { color: "#78716c", fontSize: 14, fontWeight: "600" },
alarmMessage: { color: "#1c1917", fontSize: 17, fontWeight: "700", lineHeight: 24, textAlign: "center", marginVertical: 10 },
ackButton: { alignItems: "center", backgroundColor: "#1c1917", borderRadius: 4, flexDirection: "row", gap: 8, height: 48, justifyContent: "center", marginTop: 8, width: "100%" },
ackButtonText: { color: "#fafaf9", fontSize: 15, fontWeight: "800" },
detailCard: { backgroundColor: "#fffdf8", borderRadius: 6, borderWidth: 1, borderColor: "#ddd6c8", gap: 14, maxHeight: "82%", padding: 18, width: "100%" },
detailHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 },
detailTitle: { color: "#1c1917", fontSize: 18, fontWeight: "900" },
detailClose: { alignItems: "center", backgroundColor: "#f7f5ef", borderColor: "#d6d3ca", borderRadius: 4, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
detailMessage: { color: "#1c1917", fontSize: 17, fontWeight: "800", lineHeight: 24 },
detailBlock: { gap: 5 },
detailLabel: { color: "#78716c", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
detailValue: { color: "#1c1917", fontSize: 15, fontWeight: "700" },
detailTargets: { maxHeight: 180 },
detailTargetItem: { color: "#1c1917", fontSize: 15, fontWeight: "700", paddingVertical: 4 }
});

const darkStyles = StyleSheet.create({
  ...lightStyles,
  screen: { ...lightStyles.screen, backgroundColor: "#14120f" },
  loadingText: { ...lightStyles.loadingText, color: "#a8a29e" },
  heroIconWrap: { ...lightStyles.heroIconWrap, backgroundColor: "#fafaf9" },
  heroTitle: { ...lightStyles.heroTitle, color: "#fafaf9" },
  heroSub: { ...lightStyles.heroSub, color: "#a8a29e" },
  card: { ...lightStyles.card, backgroundColor: "#1c1917", borderColor: "#3f3a34" },
  cardIconWrap: { ...lightStyles.cardIconWrap, backgroundColor: "#27231f" },
  cardTitle: { ...lightStyles.cardTitle, color: "#fafaf9" },
  input: { ...lightStyles.input, backgroundColor: "#181511", borderColor: "#3f3a34", color: "#fafaf9" },
  primaryButton: { ...lightStyles.primaryButton, backgroundColor: "#fafaf9" },
  primaryButtonText: { ...lightStyles.primaryButtonText, color: "#1c1917" },
  secondaryButton: { ...lightStyles.secondaryButton, backgroundColor: "#27231f", borderColor: "#3f3a34" },
  secondaryButtonText: { ...lightStyles.secondaryButtonText, color: "#fafaf9" },
  dividerLine: { ...lightStyles.dividerLine, backgroundColor: "#3f3a34" },
  dividerText: { ...lightStyles.dividerText, color: "#a8a29e" },
  segmentTrack: { ...lightStyles.segmentTrack, backgroundColor: "#181511", borderColor: "#3f3a34" },
  segmentIndicator: { ...lightStyles.segmentIndicator, backgroundColor: "#fafaf9" },
  segmentLabel: { ...lightStyles.segmentLabel, color: "#a8a29e" },
  segmentLabelActive: { ...lightStyles.segmentLabelActive, color: "#1c1917" },
  teamRow: { ...lightStyles.teamRow, backgroundColor: "#1c1917", borderColor: "#3f3a34" },
  teamRowName: { ...lightStyles.teamRowName, color: "#fafaf9" },
  teamRowMeta: { ...lightStyles.teamRowMeta, color: "#a8a29e" },
  header: { ...lightStyles.header, backgroundColor: "#1c1917", borderBottomColor: "#3f3a34" },
  backButton: { ...lightStyles.backButton, backgroundColor: "#181511", borderColor: "#3f3a34" },
  headerKicker: { ...lightStyles.headerKicker, color: "#a8a29e" },
  headerTitle: { ...lightStyles.headerTitle, color: "#fafaf9" },
  codeBadge: { ...lightStyles.codeBadge, backgroundColor: "#181511", borderColor: "#3f3a34" },
  codeLabel: { ...lightStyles.codeLabel, color: "#a8a29e" },
  codeText: { ...lightStyles.codeText, color: "#fafaf9" },
  sectionTitle: { ...lightStyles.sectionTitle, color: "#fafaf9" },
  sectionMeta: { ...lightStyles.sectionMeta, color: "#a8a29e" },
  debugPanel: { ...lightStyles.debugPanel, backgroundColor: "#1c1917", borderColor: "#3f3a34" },
  debugTitle: { ...lightStyles.debugTitle, color: "#fafaf9" },
  debugHint: { ...lightStyles.debugHint, color: "#a8a29e" },
  debugBody: { ...lightStyles.debugBody, borderTopColor: "#3f3a34" },
  debugButton: { ...lightStyles.debugButton, backgroundColor: "#181511", borderColor: "#3f3a34" },
  debugButtonText: { ...lightStyles.debugButtonText, color: "#fafaf9" },
  memberRow: { ...lightStyles.memberRow, backgroundColor: "#1c1917", borderColor: "#3f3a34" },
  avatar: { ...lightStyles.avatar, backgroundColor: "#27231f" },
  avatarBusy: { ...lightStyles.avatarBusy, backgroundColor: "#3a211e" },
  avatarText: { ...lightStyles.avatarText, color: "#d6d3ca" },
  memberName: { ...lightStyles.memberName, color: "#fafaf9" },
  memberStatus: { ...lightStyles.memberStatus, color: "#84cc16" },
  statusToggleAvailable: { ...lightStyles.statusToggleAvailable, backgroundColor: "#1c1917", borderColor: "#f87171" },
  statusToggleBusy: { ...lightStyles.statusToggleBusy, backgroundColor: "#1c1917", borderColor: "#84cc16" },
  statusToggleText: { ...lightStyles.statusToggleText, color: "#fafaf9" },
  composerCard: { ...lightStyles.composerCard, backgroundColor: "#1c1917", borderColor: "#3f3a34" },
  inviteEmptyCard: { ...lightStyles.inviteEmptyCard, backgroundColor: "#1c1917", borderColor: "#3f3a34" },
  inviteEmptyTitle: { ...lightStyles.inviteEmptyTitle, color: "#fafaf9" },
  inviteEmptyText: { ...lightStyles.inviteEmptyText, color: "#a8a29e" },
  inviteCodeButton: { ...lightStyles.inviteCodeButton, backgroundColor: "#181511", borderColor: "#3f3a34" },
  inviteCodeLabel: { ...lightStyles.inviteCodeLabel, color: "#fafaf9" },
  chip: { ...lightStyles.chip, backgroundColor: "#181511", borderColor: "#3f3a34" },
  chipSelected: { ...lightStyles.chipSelected, backgroundColor: "#fafaf9", borderColor: "#fafaf9" },
  chipText: { ...lightStyles.chipText, color: "#d6d3ca" },
  chipTextSelected: { ...lightStyles.chipTextSelected, color: "#1c1917" },
  messageInput: { ...lightStyles.messageInput, backgroundColor: "#181511", borderColor: "#3f3a34", color: "#fafaf9" },
  emptyText: { ...lightStyles.emptyText, color: "#a8a29e" },
  historyLine: { ...lightStyles.historyLine, backgroundColor: "#3f3a34" },
  historyMessage: { ...lightStyles.historyMessage, color: "#fafaf9" },
  historyTime: { ...lightStyles.historyTime, color: "#a8a29e" },
  historyMeta: { ...lightStyles.historyMeta, color: "#a8a29e" },
  alarmCard: { ...lightStyles.alarmCard, backgroundColor: "#1c1917" },
  alarmTitle: { ...lightStyles.alarmTitle, color: "#fafaf9" },
  alarmFrom: { ...lightStyles.alarmFrom, color: "#a8a29e" },
  alarmMessage: { ...lightStyles.alarmMessage, color: "#fafaf9" },
  ackButton: { ...lightStyles.ackButton, backgroundColor: "#fafaf9" },
  ackButtonText: { ...lightStyles.ackButtonText, color: "#1c1917" },
  detailCard: { ...lightStyles.detailCard, backgroundColor: "#1c1917", borderColor: "#3f3a34" },
  detailTitle: { ...lightStyles.detailTitle, color: "#fafaf9" },
  detailClose: { ...lightStyles.detailClose, backgroundColor: "#181511", borderColor: "#3f3a34" },
  detailMessage: { ...lightStyles.detailMessage, color: "#fafaf9" },
  detailLabel: { ...lightStyles.detailLabel, color: "#a8a29e" },
  detailValue: { ...lightStyles.detailValue, color: "#fafaf9" },
  detailTargetItem: { ...lightStyles.detailTargetItem, color: "#fafaf9" },
});
