import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceId } from "./lib/deviceId";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
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

const TEAM_COLORS = [
  { bg: "#451a03", icon: "#f59e0b" }, // Amber
  { bg: "#14532d", icon: "#22c55e" }, // Green
  { bg: "#164e63", icon: "#06b6d4" }, // Cyan
  { bg: "#1e3a8a", icon: "#3b82f6" }, // Blue
  { bg: "#312e81", icon: "#6366f1" }, // Indigo
  { bg: "#4c1d95", icon: "#8b5cf6" }, // Violet
  { bg: "#701a75", icon: "#d946ef" }, // Fuchsia
  { bg: "#831843", icon: "#f43f5e" }, // Rose
  { bg: "#7f1d1d", icon: "#ef4444" }, // Red
  { bg: "#7c2d12", icon: "#f97316" }, // Orange
];

function getTeamColor(code: string) {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = code.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TEAM_COLORS.length;
  return TEAM_COLORS[index];
}

function generateDeviceId() {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeTeamCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    letters[Math.floor(Math.random() * letters.length)]
  ).join("");
}

// ─── Swipeable Team Row ──────────────────────────────────────────────────────

function SwipeableTeamRow({
  team,
  onPress,
  onLeave,
  colors
}: {
  team: LocalTeam;
  onPress: () => void;
  onLeave: (team: LocalTeam, onCancel: () => void) => void;
  colors: { bg: string; icon: string };
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
    outputRange: ["#ef4444", "#991b1b", "#1e293b"], // Vibrant red when fully triggered
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
    <View style={{ position: "relative", marginBottom: 8, borderRadius: 12, overflow: "hidden", backgroundColor: "#0f172a" }}>
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
          <Ionicons name="chevron-forward" size={18} color="#334155" />
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
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [savedTeams, setSavedTeams] = useState<LocalTeam[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [members, setMembers] = useState<DbMember[]>([]);
  const [alertQueue, setAlertQueue] = useState<DbAlert[]>([]);
  const [alerts, setAlerts] = useState<DbAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusToggleLocked, setStatusToggleLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("all");
  const [codeCopied, setCodeCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  const realtimeCleanupRef = useRef<(() => void) | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const activeLocalTeam = savedTeams.find((t) => t.id === activeTeamId) ?? null;
  const myMember = members.find((m) => m.id === activeLocalTeam?.myMemberId) ?? null;
  const recipients = members.filter((m) => m.status === "available");
  const incomingAlert = alertQueue[0] ?? null;

  const selectedTarget =
    selectedRecipientId === "all"
      ? "Tüm ekip"
      : members.find((m) => m.id === selectedRecipientId)?.nickname ?? "Tüm ekip";

  useEffect(() => {
    getDeviceId().then((id) => {
      setDeviceId(id);
      
      // Request push token in background and update DB
      registerForPushNotificationsAsync().then(async (token) => {
        if (token && id) {
          await supabase.from("members").update({ push_token: token }).eq("device_id", id);
        }
      }).catch(console.error);
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

  useEffect(() => {
    if (!incomingAlert) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    Vibration.vibrate([0, 700, 300, 700], true);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true })
      ])
    ).start();
    return () => {
      Vibration.cancel();
      pulse.stopAnimation();
    };
  }, [incomingAlert?.id, pulse]);

  useEffect(() => {
    return () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    };
  }, []);

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
            setAlerts((prev) => [newAlert, ...prev]);

            const isForMe =
              newAlert.to_target === "all" ||
              newAlert.to_target === myNickname;
            
            // Allow receiving our own alerts so we can test the system
            if (isForMe) {
              setAlertQueue((q) => [...q, newAlert]);
            }
          }
        )
        .subscribe();

      const memberChannel = supabase
        .channel(`members:${teamId}:${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "members", filter: `team_id=eq.${teamId}` },
          (payload) => {
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
          supabase.from("members").select("*").eq("team_id", teamId).order("created_at"),
          supabase
            .from("alerts")
            .select("*")
            .eq("team_id", teamId)
            .order("created_at", { ascending: false })
            .limit(20)
        ]);

      if (mErr) throw mErr;
      if (aErr) throw aErr;

      if (membersData) setMembers(membersData as DbMember[]);
      if (alertsData) setAlerts(alertsData as DbAlert[]);
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
    setLoading(true);
    try {
      const { data: team, error: teamErr } = await supabase
        .from("teams")
        .insert({ name, code: makeTeamCode() })
        .select()
        .single();
      if (teamErr || !team) throw teamErr ?? new Error("Team oluşturulamadı");

      const { data: member, error: memberErr } = await supabase
        .from("members")
        .insert({ team_id: team.id, nickname: nick, status: "available", device_id: deviceId })
        .select()
        .single();
      if (memberErr || !member) throw memberErr ?? new Error("Üye eklenemedi");

      const localTeam: LocalTeam = { ...(team as DbTeam), myMemberId: member.id, myNickname: nick };
      setSavedTeams((prev) => [localTeam, ...prev]);
      setActiveTeamId(team.id);
      setTeamNameInput("");
      setNicknameInput("");
      setSelectedRecipientId("all");
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
      }

      const localTeam: LocalTeam = { ...(team as DbTeam), myMemberId: memberId, myNickname: nick };
      setSavedTeams((prev) => {
        const exists = prev.find((t) => t.id === team.id);
        return exists ? prev.map((t) => (t.id === team.id ? localTeam : t)) : [localTeam, ...prev];
      });
      setActiveTeamId(team.id);
      setJoinCodeInput("");
      setNicknameInput("");
      setSelectedRecipientId("all");
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
    setSelectedRecipientId("all");
  }

  function copyCode() {
    if (!activeLocalTeam) return;
    Clipboard.setString(activeLocalTeam.code);
    setCodeCopied(true);
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCodeCopied(false), 2000);
  }

  async function toggleMyStatus() {
    if (!myMember) return;
    const newStatus = myMember.status === "available" ? "busy" : "available";
    const oldStatus = myMember.status;
    
    // Optimistic update
    setMembers((prev) => prev.map((m) => (m.id === myMember.id ? { ...m, status: newStatus } : m)));
    
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
        Alert.alert(i18n.t("error"), i18n.t("statusFailed"));
      }
    } catch (e) {
      console.warn("Status update exception:", e);
      setMembers((prev) =>
        prev.map((m) => (m.id === myMember.id ? { ...m, status: oldStatus } : m))
      );
    }
  }

  function sendAlert() {
    if (!activeLocalTeam || !myMember) return;
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert(i18n.t("messageRequiredTitle"), i18n.t("messageRequiredMsg"));
      return;
    }
    const targetName = selectedTarget === "all" ? "all" : members.find(m => m.id === selectedTarget)?.nickname ?? selectedTarget;
    const displayTarget = selectedTarget === "all" ? i18n.t("everyone") : targetName;
    
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
              const { error } = await supabase.from("alerts").insert({
                team_id: activeLocalTeam.id,
                from_nickname: myMember.nickname,
                to_target: targetName,
                message: trimmed,
                acknowledged: false
              });
              if (error) throw error;
              setMessage("");
              
              // Send native push notifications
              const pushMessages = [];
              for (const m of members) {
                if (!m.push_token) continue;
                if (targetName === "all" || m.nickname === targetName) {
                  pushMessages.push({
                    to: m.push_token,
                    sound: 'default',
                    title: `AcilPing — ${myMember.nickname}`,
                    body: trimmed,
                    data: { teamId: activeLocalTeam.id },
                  });
                }
              }
              
              if (pushMessages.length > 0) {
                fetch('https://exp.host/--/api/v2/push/send', {
                  method: 'POST',
                  headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(pushMessages),
                }).catch(console.error);
              }
              
            } catch {
              Alert.alert(i18n.t("error"), i18n.t("alertFailed"));
            }
          }
        }
      ]
    );
  }

  // Bug #4: Kuyruktaki ilk alarmı kapat, varsa bir sonrakine geç
  async function acknowledgeAlert() {
    if (!incomingAlert) return;
    Vibration.cancel();
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
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HOME SCREEN
  // ─────────────────────────────────────────────────────────────────────────────

  if (!activeTeamId) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
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
                  const colors = getTeamColor(t.code);
                  return (
                    <SwipeableTeamRow
                      key={t.id}
                      team={t}
                      onPress={() => setActiveTeamId(t.id)}
                      onLeave={leaveTeam}
                      colors={colors}
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
                    color={homeTab === 0 ? "#f1f5f9" : "#475569"}
                  />
                  <Text style={[styles.segmentLabel, homeTab === 0 && styles.segmentLabelActive]}>
                    {i18n.t("createTab")}
                  </Text>
                </Pressable>
                <Pressable style={styles.segmentBtn} onPress={() => switchTab(1)}>
                  <Ionicons
                    name="enter-outline"
                    size={16}
                    color={homeTab === 1 ? "#f1f5f9" : "#475569"}
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
                    placeholderTextColor="#475569"
                    style={styles.input}
                    value={teamNameInput}
                    maxLength={40}
                  />
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setNicknameInput}
                    placeholder={i18n.t("yourNickname")}
                    placeholderTextColor="#475569"
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
                      <ActivityIndicator color="#fff" />
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
                    placeholderTextColor="#475569"
                    style={styles.input}
                    value={joinCodeInput}
                    maxLength={8}
                  />
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setNicknameInput}
                    placeholder={i18n.t("yourNickname")}
                    placeholderTextColor="#475569"
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
                      <ActivityIndicator color="#92400e" />
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
      <StatusBar style="light" />

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
        {/* Members */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{i18n.t("membersTitle")}</Text>
            <Text style={styles.sectionMeta}>{i18n.t("membersCount", { count: members.length })}</Text>
          </View>
          
          {loading && members.length === 0 ? (
            <ActivityIndicator size="small" color="#6366f1" style={{ marginVertical: 20 }} />
          ) : (
            members.map((member) => {
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
        <View style={styles.composerCard}>
          <Text style={styles.sectionTitle}>{i18n.t("sendAlertTitle")}</Text>
          
          {loading && members.length === 0 ? (
            <ActivityIndicator size="small" color="#6366f1" style={{ marginVertical: 10 }} />
          ) : recipients.length === 0 ? (
            <Text style={styles.emptyText}>{i18n.t("inviteOthers")}</Text>
          ) : (
            <FlatList
              data={[
                { id: "all", nickname: i18n.t("everyone"), status: "available" as const, team_id: "", device_id: null, push_token: null, created_at: "" },
                ...recipients
              ]}
              horizontal
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const selected = selectedRecipientId === item.id;
                return (
                  <Pressable
                    onPress={() => setSelectedRecipientId(item.id)}
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
            placeholderTextColor="#475569"
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
              {i18n.t("sendBtn")} → {selectedTarget === "all" ? i18n.t("everyone") : selectedTarget}
            </Text>
          </Pressable>
        </View>

        {/* History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{i18n.t("historyTitle")}</Text>
            <Text style={styles.sectionMeta}>{i18n.t("historyCount", { count: alerts.length })}</Text>
          </View>
          
          {loading && alerts.length === 0 ? (
            <ActivityIndicator size="small" color="#6366f1" style={{ marginVertical: 20 }} />
          ) : alerts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={32} color="#334155" />
              <Text style={styles.emptyText}>{i18n.t("noAlerts")}</Text>
            </View>
          ) : (
            alerts.slice(0, 10).map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <View style={[styles.historyDot, item.acknowledged ? styles.historyDotAck : styles.historyDotPending]} />
                <View style={styles.historyInfo}>
                  <Text style={styles.historyMessage} numberOfLines={2}>{item.message}</Text>
                  <Text style={styles.historyMeta} numberOfLines={1}>
                    {item.from_nickname} → {item.to_target === "all" ? i18n.t("everyone") : item.to_target} · {item.acknowledged ? i18n.t("received") : i18n.t("sent")}
                  </Text>
                </View>
              </View>
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
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0a0f1e" },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#64748b", fontSize: 16 },

  authLayout: { flex: 1 },
  authScroll: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40, gap: 16 },
  hero: { alignItems: "center", paddingTop: 10, paddingBottom: 20, gap: 10 },
  heroIconWrap: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: "#6366f1",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
    shadowColor: "#6366f1", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 16
  },
  heroTitle: { fontSize: 40, fontWeight: "900", color: "#f8fafc", letterSpacing: -1 },
  heroSub: { fontSize: 16, color: "#64748b", textAlign: "center", lineHeight: 24, maxWidth: 300 },

  card: { backgroundColor: "#111827", borderRadius: 16, padding: 20, gap: 12, borderWidth: 1, borderColor: "#1e293b" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  cardIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#f1f5f9" },
  input: { backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: 10, borderWidth: 1, color: "#f8fafc", fontSize: 16, height: 50, paddingHorizontal: 16 },
  primaryButton: { alignItems: "center", backgroundColor: "#6366f1", borderRadius: 12, flexDirection: "row", gap: 8, height: 52, justifyContent: "center", shadowColor: "#6366f1", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  secondaryButton: { alignItems: "center", backgroundColor: "#fbbf24", borderRadius: 12, flexDirection: "row", gap: 8, height: 52, justifyContent: "center" },
  secondaryButtonText: { color: "#92400e", fontSize: 16, fontWeight: "800" },
  buttonPressed: { opacity: 0.6 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#1e293b" },
  dividerText: { color: "#475569", fontSize: 14, fontWeight: "600" },

  // ── Segment tab ──
  segmentTrack: {
    flexDirection: "row",
    backgroundColor: "#0a0f1e",
    borderRadius: 14,
    padding: 4,
    position: "relative",
    height: 52,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1e293b"
  },
  segmentIndicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    width: "47%",
    backgroundColor: "#6366f1",
    borderRadius: 10,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 10
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    zIndex: 1,
    borderRadius: 10
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.1
  },
  segmentLabelActive: {
    color: "#ffffff"
  },

  teamRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#111827", borderRadius: 12, borderWidth: 1, borderColor: "#1e293b", padding: 14, gap: 12 },
  teamRowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  teamRowInfo: { flex: 1, overflow: "hidden" },
  teamRowName: { color: "#f1f5f9", fontSize: 15, fontWeight: "700" },
  teamRowMeta: { color: "#475569", fontSize: 13, marginTop: 2 },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1e293b", gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#111827", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#1e293b" },
  headerCenter: { flex: 1, overflow: "hidden" },
  headerKicker: { color: "#475569", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  headerTitle: { color: "#f8fafc", fontSize: 20, fontWeight: "800" },
  codeBadge: { backgroundColor: "#111827", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "#1e293b", minWidth: 90 },
  codeLabel: { color: "#6366f1", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  codeText: { color: "#f8fafc", fontSize: 16, fontWeight: "900", letterSpacing: 2 },

  scrollView: { flex: 1 },
  content: { gap: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  sectionTitle: { color: "#f1f5f9", fontSize: 17, fontWeight: "800" },
  sectionMeta: { color: "#475569", fontSize: 14, fontWeight: "600" },

  memberRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#111827", borderRadius: 12, borderWidth: 1, borderColor: "#1e293b", padding: 14, gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#1e3a5f", alignItems: "center", justifyContent: "center" },
  avatarBusy: { backgroundColor: "#450a0a" },
  avatarText: { color: "#60a5fa", fontSize: 18, fontWeight: "900" },
  avatarTextBusy: { color: "#ef4444" },
  memberInfo: { flex: 1, overflow: "hidden" },
  memberName: { color: "#f1f5f9", fontSize: 15, fontWeight: "700" },
  memberStatus: { color: "#22c55e", fontSize: 13, marginTop: 2, fontWeight: "600" },
  memberStatusBusy: { color: "#ef4444" },
  statusToggle: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  statusToggleAvailable: { backgroundColor: "#450a0a", borderColor: "#ef4444" },
  statusToggleBusy: { backgroundColor: "#052e16", borderColor: "#22c55e" },
  statusToggleText: { color: "#f1f5f9", fontSize: 12, fontWeight: "700" },

  composerCard: { backgroundColor: "#111827", borderRadius: 16, borderWidth: 1, borderColor: "#3f1515", padding: 18, gap: 14 },
  chipList: { marginHorizontal: -4 },
  chip: { backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: 8, borderWidth: 1, marginHorizontal: 4, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 140 },
  chipSelected: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { color: "#94a3b8", fontSize: 14, fontWeight: "700" },
  chipTextSelected: { color: "#fff" },
  messageInput: { backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: 10, borderWidth: 1, color: "#f8fafc", fontSize: 16, minHeight: 90, padding: 14, textAlignVertical: "top" },
  dangerButton: { alignItems: "center", backgroundColor: "#dc2626", borderRadius: 12, flexDirection: "row", gap: 8, height: 54, justifyContent: "center", shadowColor: "#dc2626", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
  dangerButtonText: { color: "#fff", fontSize: 16, fontWeight: "800", flexShrink: 1 },

  emptyState: { alignItems: "center", gap: 8, padding: 24 },
  emptyText: { color: "#334155", fontSize: 15, fontWeight: "600" },
  historyRow: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#111827", borderRadius: 12, borderWidth: 1, borderColor: "#1e293b", padding: 14, gap: 12 },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  historyDotPending: { backgroundColor: "#f59e0b" },
  historyDotAck: { backgroundColor: "#22c55e" },
  historyInfo: { flex: 1, gap: 4 },
  historyMessage: { color: "#f1f5f9", fontSize: 15, fontWeight: "700" },
  historyMeta: { color: "#475569", fontSize: 13 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", alignItems: "center", justifyContent: "center", padding: 24 },
  alarmCard: { alignItems: "center", backgroundColor: "#111827", borderRadius: 24, borderWidth: 1, borderColor: "#3f1515", padding: 32, width: "100%", gap: 8 },
  queueBadge: { backgroundColor: "#dc2626", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 8 },
  queueBadgeText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  alarmIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center", marginBottom: 8, shadowColor: "#dc2626", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 24 },
  alarmTitle: { color: "#f8fafc", fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  alarmFrom: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  alarmMessage: { color: "#f1f5f9", fontSize: 18, fontWeight: "700", lineHeight: 26, textAlign: "center", marginVertical: 12 },
  ackButton: { alignItems: "center", backgroundColor: "#fbbf24", borderRadius: 12, flexDirection: "row", gap: 8, height: 54, justifyContent: "center", marginTop: 8, width: "100%" },
  ackButtonText: { color: "#92400e", fontSize: 16, fontWeight: "900" }
});
