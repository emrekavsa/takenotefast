import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Clipboard,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View
} from "react-native";

// ─── Types ───────────────────────────────────────────────────────────────────

type Member = {
  id: string;
  nickname: string;
  status: "available" | "busy";
};

type Team = {
  id: string;
  name: string;
  code: string;
  members: Member[];
  history: AlertEvent[];
};

type AlertEvent = {
  id: string;
  from: string;
  to: string;
  message: string;
  createdAt: Date;
  acknowledged: boolean;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const MY_ID = "you";

function makeTeamCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    letters[Math.floor(Math.random() * letters.length)]
  ).join("");
}

function makeId() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 6);
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  // my global nickname (set when creating / joining first team)
  const [myNickname, setMyNickname] = useState("Sen");

  // all teams saved locally
  const [teams, setTeams] = useState<Team[]>([]);

  // which team is currently open (null = home screen)
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  // home screen form state
  const [teamNameInput, setTeamNameInput] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");

  // team screen composer state
  const [message, setMessage] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("all");

  // incoming alert modal (only fires when YOU receive one — not when you send)
  const [incomingAlert, setIncomingAlert] = useState<AlertEvent | null>(null);

  // copy code feedback
  const [codeCopied, setCodeCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // pulse animation
  const pulse = useRef(new Animated.Value(0)).current;

  // ── Derived ──

  const activeTeam = useMemo(
    () => teams.find((t) => t.id === activeTeamId) ?? null,
    [teams, activeTeamId]
  );

  const me = useMemo<Member | null>(() => {
    if (!activeTeam) return null;
    return activeTeam.members.find((m) => m.id === MY_ID) ?? null;
  }, [activeTeam]);

  // recipients = all members EXCEPT me
  const recipients = useMemo(() => {
    if (!activeTeam) return [];
    return activeTeam.members.filter((m) => m.id !== MY_ID);
  }, [activeTeam]);

  const selectedTarget = useMemo(() => {
    if (selectedMemberId === "all") return "Tüm ekip";
    return (
      recipients.find((m) => m.id === selectedMemberId)?.nickname ?? "Tüm ekip"
    );
  }, [selectedMemberId, recipients]);

  // ── Pulse animation when incoming alert ──

  useEffect(() => {
    if (!incomingAlert) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    Vibration.vibrate([0, 700, 300, 700], true);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true
        })
      ])
    ).start();

    return () => {
      Vibration.cancel();
      pulse.stopAnimation();
    };
  }, [incomingAlert, pulse]);

  useEffect(() => {
    return () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    };
  }, []);

  // ── Helpers ──

  function updateTeam(teamId: string, updater: (t: Team) => Team) {
    setTeams((prev) => prev.map((t) => (t.id === teamId ? updater(t) : t)));
  }

  // ── Actions ──

  function createTeam() {
    const name = teamNameInput.trim();
    const nick = nicknameInput.trim() || myNickname;
    if (!name) {
      Alert.alert("Team adı gerekli", "Devam etmek için bir team adı yaz.");
      return;
    }

    const newTeam: Team = {
      id: makeId(),
      name,
      code: makeTeamCode(),
      members: [
        { id: MY_ID, nickname: nick, status: "available" },
        { id: "deniz", nickname: "Deniz", status: "available" },
        { id: "aylin", nickname: "Aylin", status: "busy" }
      ],
      history: []
    };

    if (nick !== myNickname) setMyNickname(nick);
    setTeams((prev) => [newTeam, ...prev]);
    setActiveTeamId(newTeam.id);
    setTeamNameInput("");
    setNicknameInput("");
    setSelectedMemberId("all");
    setMessage("");
  }

  function joinTeam() {
    const code = joinCodeInput.trim().toUpperCase();
    const nick = nicknameInput.trim();

    if (code.length < 4 || !nick) {
      Alert.alert("Eksik bilgi", "Team kodu ve nickname gerekli.");
      return;
    }

    const newTeam: Team = {
      id: makeId(),
      name: `Team ${code}`,
      code,
      members: [
        { id: MY_ID, nickname: nick, status: "available" },
        { id: "mert", nickname: "Mert", status: "available" },
        { id: "elif", nickname: "Elif", status: "available" }
      ],
      history: []
    };

    setMyNickname(nick);
    setTeams((prev) => [newTeam, ...prev]);
    setActiveTeamId(newTeam.id);
    setJoinCodeInput("");
    setNicknameInput("");
    setSelectedMemberId("all");
    setMessage("");
  }

  function goHome() {
    // go back to home WITHOUT destroying the team
    setActiveTeamId(null);
    setMessage("");
    setSelectedMemberId("all");
  }

  function openTeam(teamId: string) {
    setActiveTeamId(teamId);
    setSelectedMemberId("all");
    setMessage("");
  }

  function copyCode() {
    if (!activeTeam) return;
    Clipboard.setString(activeTeam.code);
    setCodeCopied(true);
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCodeCopied(false), 2000);
  }

  function toggleMyStatus() {
    if (!activeTeam) return;
    updateTeam(activeTeam.id, (t) => ({
      ...t,
      members: t.members.map((m) =>
        m.id === MY_ID
          ? { ...m, status: m.status === "available" ? "busy" : "available" }
          : m
      )
    }));
  }

  function sendAlert() {
    if (!activeTeam) return;

    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert("Mesaj gerekli", "Alarm göndermek için kısa bir mesaj yaz.");
      return;
    }

    Alert.alert(
      "Alarm Gönderilsin mi?",
      `"${trimmed}"\n\nAlıcı: ${selectedTarget}`,
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Evet, Gönder",
          style: "destructive",
          onPress: () => {
            const event: AlertEvent = {
              id: makeId(),
              from: me?.nickname ?? "Sen",
              to: selectedTarget,
              message: trimmed,
              createdAt: new Date(),
              acknowledged: false
            };

            // Sadece geçmişe ekle — alarm sadece alıcı cihazda çıkar
            // (gerçek backend olmadığı için popup simülasyonu KALDIRILDI)
            updateTeam(activeTeam.id, (t) => ({
              ...t,
              history: [event, ...t.history]
            }));
            setMessage("");
          }
        }
      ]
    );
  }

  function acknowledgeAlert() {
    if (!incomingAlert || !activeTeam) return;
    Vibration.cancel();
    updateTeam(activeTeam.id, (t) => ({
      ...t,
      history: t.history.map((item) =>
        item.id === incomingAlert.id ? { ...item, acknowledged: true } : item
      )
    }));
    setIncomingAlert(null);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HOME SCREEN
  // ─────────────────────────────────────────────────────────────────────────────

  if (!activeTeam) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.authLayout}
        >
          <ScrollView
            contentContainerStyle={styles.authScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Hero */}
            <View style={styles.hero}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="radio" size={36} color="#fff" />
              </View>
              <Text style={styles.heroTitle}>AcilPing</Text>
              <Text style={styles.heroSub}>
                Ekibini oluştur, kodla katıl, anında acil alarm gönder.
              </Text>
            </View>

            {/* Takımlarım */}
            {teams.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Takımlarım</Text>
                  <Text style={styles.sectionMeta}>{teams.length} team</Text>
                </View>
                {teams.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => openTeam(t.id)}
                    style={({ pressed }) => [
                      styles.teamRow,
                      pressed && styles.buttonPressed
                    ]}
                  >
                    <View style={styles.teamRowIcon}>
                      <Ionicons name="people" size={18} color="#6366f1" />
                    </View>
                    <View style={styles.teamRowInfo}>
                      <Text style={styles.teamRowName}>{t.name}</Text>
                      <Text style={styles.teamRowMeta}>
                        {t.members.length} üye · Kod: {t.code}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#334155" />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Create Team */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Ionicons name="add-circle-outline" size={20} color="#6366f1" />
                </View>
                <Text style={styles.cardTitle}>Yeni Team Oluştur</Text>
              </View>
              <TextInput
                autoCapitalize="words"
                onChangeText={setTeamNameInput}
                placeholder="Team adı"
                placeholderTextColor="#475569"
                style={styles.input}
                value={teamNameInput}
              />
              <TextInput
                autoCapitalize="words"
                onChangeText={setNicknameInput}
                placeholder="Senin nicknamin"
                placeholderTextColor="#475569"
                style={styles.input}
                value={nicknameInput}
              />
              <Pressable
                onPress={createTeam}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed
                ]}
              >
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Team Oluştur</Text>
              </Pressable>
            </View>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>veya</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Join Team */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconWrap, { backgroundColor: "#fef3c7" }]}>
                  <Ionicons name="enter-outline" size={20} color="#d97706" />
                </View>
                <Text style={styles.cardTitle}>Team'e Katıl</Text>
              </View>
              <TextInput
                autoCapitalize="characters"
                onChangeText={setJoinCodeInput}
                placeholder="Team kodu (örn: XK7P2A)"
                placeholderTextColor="#475569"
                style={styles.input}
                value={joinCodeInput}
              />
              <TextInput
                autoCapitalize="words"
                onChangeText={setNicknameInput}
                placeholder="Senin nicknamin"
                placeholderTextColor="#475569"
                style={styles.input}
                value={nicknameInput}
              />
              <Pressable
                onPress={joinTeam}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.buttonPressed
                ]}
              >
                <Ionicons name="enter" size={20} color="#92400e" />
                <Text style={styles.secondaryButtonText}>Koda Katıl</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEAM SCREEN
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goHome} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#94a3b8" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerKicker}>Team</Text>
          <Text style={styles.headerTitle}>{activeTeam.name}</Text>
        </View>
        <Pressable onPress={copyCode} style={styles.codeBadge}>
          <Text style={styles.codeLabel}>
            {codeCopied ? "✓ Kopyalandı!" : "Kod"}
          </Text>
          <Text style={styles.codeText}>{activeTeam.code}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Members */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Üyeler</Text>
            <Text style={styles.sectionMeta}>
              {activeTeam.members.length} kişi
            </Text>
          </View>
          {activeTeam.members.map((member) => {
            const isMe = member.id === MY_ID;
            return (
              <View key={member.id} style={styles.memberRow}>
                <View
                  style={[
                    styles.avatar,
                    member.status === "busy" && styles.avatarBusy
                  ]}
                >
                  <Text
                    style={[
                      styles.avatarText,
                      member.status === "busy" && styles.avatarTextBusy
                    ]}
                  >
                    {member.nickname.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {isMe ? `${member.nickname} (Sen)` : member.nickname}
                  </Text>
                  <Text
                    style={[
                      styles.memberStatus,
                      member.status === "busy" && styles.memberStatusBusy
                    ]}
                  >
                    {member.status === "available" ? "● Uygun" : "● Meşgul"}
                  </Text>
                </View>
                {isMe && (
                  <Pressable
                    onPress={toggleMyStatus}
                    style={[
                      styles.statusToggle,
                      member.status === "available"
                        ? styles.statusToggleAvailable
                        : styles.statusToggleBusy
                    ]}
                  >
                    <Text style={styles.statusToggleText}>
                      {member.status === "available"
                        ? "Meşgule al"
                        : "Uygun yap"}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        {/* Alert Composer */}
        <View style={styles.composerCard}>
          <Text style={styles.sectionTitle}>Acil Alarm Gönder</Text>

          {/* Recipient chips — sadece diğer üyeler */}
          {recipients.length === 0 ? (
            <Text style={styles.emptyText}>
              Alarmı gönderebilmek için başka üye gerekli.
            </Text>
          ) : (
            <FlatList
              data={[
                {
                  id: "all",
                  nickname: "Tüm Ekip",
                  status: "available" as const
                },
                ...recipients
              ]}
              horizontal
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const selected = selectedMemberId === item.id;
                return (
                  <Pressable
                    onPress={() => setSelectedMemberId(item.id)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected && styles.chipTextSelected
                      ]}
                    >
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
            placeholder="Örn: Prod ödeme akışı düştü, hemen bakar mısın?"
            placeholderTextColor="#475569"
            style={styles.messageInput}
            value={message}
          />
          <Pressable
            onPress={sendAlert}
            style={({ pressed }) => [
              styles.dangerButton,
              pressed && styles.buttonPressed
            ]}
          >
            <Ionicons name="notifications" size={20} color="#fff" />
            <Text style={styles.dangerButtonText}>
              Alarm Gönder → {selectedTarget}
            </Text>
          </Pressable>
        </View>

        {/* History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Geçmiş</Text>
            <Text style={styles.sectionMeta}>
              {activeTeam.history.length} alarm
            </Text>
          </View>
          {activeTeam.history.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="notifications-off-outline"
                size={32}
                color="#334155"
              />
              <Text style={styles.emptyText}>Henüz alarm gönderilmedi.</Text>
            </View>
          ) : (
            activeTeam.history.slice(0, 5).map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <View
                  style={[
                    styles.historyDot,
                    item.acknowledged
                      ? styles.historyDotAck
                      : styles.historyDotPending
                  ]}
                />
                <View style={styles.historyInfo}>
                  <Text style={styles.historyMessage}>{item.message}</Text>
                  <Text style={styles.historyMeta}>
                    {item.to} · {item.acknowledged ? "✓ Aldı" : "Gönderildi"}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Incoming Alert Modal */}
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
            <View style={styles.alarmIcon}>
              <Ionicons name="alert" size={44} color="#fff" />
            </View>
            <Text style={styles.alarmTitle}>Acil Alarm!</Text>
            <Text style={styles.alarmFrom}>
              {incomingAlert?.from} gönderdi
            </Text>
            <Text style={styles.alarmMessage}>{incomingAlert?.message}</Text>
            <Pressable
              onPress={acknowledgeAlert}
              style={({ pressed }) => [
                styles.ackButton,
                pressed && styles.buttonPressed
              ]}
            >
              <Ionicons name="checkmark-circle" size={22} color="#92400e" />
              <Text style={styles.ackButtonText}>Aldım, Kapatıyorum</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0a0f1e"
  },

  // ── AUTH ──
  authLayout: { flex: 1 },
  authScroll: { padding: 24, paddingBottom: 48, gap: 16 },
  hero: { alignItems: "center", paddingVertical: 28, gap: 10 },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16
  },
  heroTitle: {
    fontSize: 40,
    fontWeight: "900",
    color: "#f8fafc",
    letterSpacing: -1
  },
  heroSub: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 300
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: "#1e293b"
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#ede9fe",
    alignItems: "center",
    justifyContent: "center"
  },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#f1f5f9" },
  input: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderRadius: 10,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 16,
    height: 50,
    paddingHorizontal: 16
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#6366f1",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    height: 52,
    justifyContent: "center",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12
  },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#fbbf24",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    height: 52,
    justifyContent: "center"
  },
  secondaryButtonText: { color: "#92400e", fontSize: 16, fontWeight: "800" },
  buttonPressed: { opacity: 0.75 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 4
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#1e293b" },
  dividerText: { color: "#475569", fontSize: 14, fontWeight: "600" },

  // ── TAKIMLARIM ──
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 14,
    gap: 12
  },
  teamRowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#1e1b4b",
    alignItems: "center",
    justifyContent: "center"
  },
  teamRowInfo: { flex: 1 },
  teamRowName: { color: "#f1f5f9", fontSize: 15, fontWeight: "700" },
  teamRowMeta: { color: "#475569", fontSize: 13, marginTop: 2 },

  // ── TEAM HEADER ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    gap: 12
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1e293b"
  },
  headerCenter: { flex: 1 },
  headerKicker: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  headerTitle: { color: "#f8fafc", fontSize: 20, fontWeight: "800" },
  codeBadge: {
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e293b",
    minWidth: 90
  },
  codeLabel: {
    color: "#6366f1",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  codeText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2
  },

  // ── CONTENT ──
  scrollView: { flex: 1 },
  content: { gap: 20, padding: 20, paddingBottom: 40 },
  section: { gap: 10 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2
  },
  sectionTitle: { color: "#f1f5f9", fontSize: 17, fontWeight: "800" },
  sectionMeta: { color: "#475569", fontSize: 14, fontWeight: "600" },

  // ── MEMBERS ──
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 14,
    gap: 12
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#1e3a5f",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarBusy: { backgroundColor: "#3b1f0c" },
  avatarText: { color: "#60a5fa", fontSize: 18, fontWeight: "900" },
  avatarTextBusy: { color: "#fb923c" },
  memberInfo: { flex: 1 },
  memberName: { color: "#f1f5f9", fontSize: 15, fontWeight: "700" },
  memberStatus: {
    color: "#22c55e",
    fontSize: 13,
    marginTop: 2,
    fontWeight: "600"
  },
  memberStatusBusy: { color: "#fb923c" },
  statusToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1
  },
  statusToggleAvailable: {
    backgroundColor: "#1c1917",
    borderColor: "#fb923c"
  },
  statusToggleBusy: {
    backgroundColor: "#052e16",
    borderColor: "#22c55e"
  },
  statusToggleText: { color: "#f1f5f9", fontSize: 12, fontWeight: "700" },

  // ── COMPOSER ──
  composerCard: {
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#3f1515",
    padding: 18,
    gap: 14
  },
  chipList: { marginHorizontal: -4 },
  chip: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 4,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  chipSelected: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { color: "#94a3b8", fontSize: 14, fontWeight: "700" },
  chipTextSelected: { color: "#fff" },
  messageInput: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderRadius: 10,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 16,
    minHeight: 90,
    padding: 14,
    textAlignVertical: "top"
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    height: 54,
    justifyContent: "center",
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12
  },
  dangerButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  // ── HISTORY ──
  emptyState: { alignItems: "center", gap: 8, padding: 24 },
  emptyText: { color: "#334155", fontSize: 15, fontWeight: "600" },
  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 14,
    gap: 12
  },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  historyDotPending: { backgroundColor: "#f59e0b" },
  historyDotAck: { backgroundColor: "#22c55e" },
  historyInfo: { flex: 1, gap: 4 },
  historyMessage: { color: "#f1f5f9", fontSize: 15, fontWeight: "700" },
  historyMeta: { color: "#475569", fontSize: 13 },

  // ── MODAL ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  alarmCard: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#3f1515",
    padding: 32,
    width: "100%",
    gap: 8
  },
  alarmIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 24
  },
  alarmTitle: {
    color: "#f8fafc",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.5
  },
  alarmFrom: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  alarmMessage: {
    color: "#f1f5f9",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
    textAlign: "center",
    marginVertical: 12
  },
  ackButton: {
    alignItems: "center",
    backgroundColor: "#fbbf24",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    height: 54,
    justifyContent: "center",
    marginTop: 8,
    width: "100%"
  },
  ackButtonText: { color: "#92400e", fontSize: 16, fontWeight: "900" }
});
