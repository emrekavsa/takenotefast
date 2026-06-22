import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View
} from "react-native";

type Member = {
  id: string;
  nickname: string;
  status: "available" | "busy";
};

type Team = {
  name: string;
  code: string;
  members: Member[];
};

type AlertEvent = {
  id: string;
  from: string;
  to: string;
  message: string;
  createdAt: Date;
  acknowledged: boolean;
};

const currentUser: Member = {
  id: "you",
  nickname: "Sen",
  status: "available"
};

const demoMembers: Member[] = [
  currentUser,
  { id: "deniz", nickname: "Deniz", status: "available" },
  { id: "aylin", nickname: "Aylin", status: "busy" }
];

function makeTeamCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
}

export default function App() {
  const [team, setTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState("Gece Operasyon");
  const [joinCode, setJoinCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("all");
  const [incomingAlert, setIncomingAlert] = useState<AlertEvent | null>(null);
  const [history, setHistory] = useState<AlertEvent[]>([]);
  const pulse = useRef(new Animated.Value(0)).current;

  const selectedTarget = useMemo(() => {
    if (!team || selectedMemberId === "all") {
      return "Tüm ekip";
    }

    return team.members.find((member) => member.id === selectedMemberId)?.nickname ?? "Tüm ekip";
  }, [selectedMemberId, team]);

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

  function createTeam() {
    const trimmedName = teamName.trim();
    if (!trimmedName) {
      Alert.alert("Team adı gerekli", "Devam etmek için bir team adı yaz.");
      return;
    }

    setTeam({
      name: trimmedName,
      code: makeTeamCode(),
      members: demoMembers
    });
  }

  function joinTeam() {
    const trimmedCode = joinCode.trim().toUpperCase();
    const trimmedNickname = nickname.trim();

    if (trimmedCode.length < 4 || !trimmedNickname) {
      Alert.alert("Eksik bilgi", "Team kodu ve nickname gerekli.");
      return;
    }

    setTeam({
      name: "Katıldığın Team",
      code: trimmedCode,
      members: [
        { ...currentUser, nickname: trimmedNickname },
        { id: "mert", nickname: "Mert", status: "available" },
        { id: "elif", nickname: "Elif", status: "available" }
      ]
    });
  }

  function sendAlert() {
    if (!team) {
      return;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      Alert.alert("Mesaj gerekli", "Alarm göndermek için kısa bir mesaj yaz.");
      return;
    }

    const event: AlertEvent = {
      id: String(Date.now()),
      from: "Sen",
      to: selectedTarget,
      message: trimmedMessage,
      createdAt: new Date(),
      acknowledged: false
    };

    setHistory((items) => [event, ...items]);
    setMessage("");

    // MVP demo: simulate the receiver's phone by showing the alarm locally.
    setTimeout(() => setIncomingAlert(event), 450);
  }

  function acknowledgeAlert() {
    if (!incomingAlert) {
      return;
    }

    Vibration.cancel();
    setHistory((items) =>
      items.map((item) => (item.id === incomingAlert.id ? { ...item, acknowledged: true } : item))
    );
    setIncomingAlert(null);
  }

  if (!team) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.authLayout}
        >
          <View>
            <View style={styles.brandMark}>
              <Ionicons name="radio" size={34} color="#f8fafc" />
            </View>
            <Text style={styles.title}>AcilPing</Text>
            <Text style={styles.subtitle}>Team kur, kodla katıl, normal mesaj yerine acil alarm gönder.</Text>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Team oluştur</Text>
            <TextInput
              autoCapitalize="words"
              onChangeText={setTeamName}
              placeholder="Team adı"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={teamName}
            />
            <Pressable onPress={createTeam} style={styles.primaryButton}>
              <Ionicons name="add-circle" size={20} color="#ffffff" />
              <Text style={styles.primaryButtonText}>Team Oluştur</Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Team'e katıl</Text>
            <TextInput
              autoCapitalize="characters"
              onChangeText={setJoinCode}
              placeholder="Team kodu"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={joinCode}
            />
            <TextInput
              autoCapitalize="words"
              onChangeText={setNickname}
              placeholder="Nickname"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={nickname}
            />
            <Pressable onPress={joinTeam} style={styles.secondaryButton}>
              <Ionicons name="enter" size={20} color="#111827" />
              <Text style={styles.secondaryButtonText}>Koda Katıl</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Team</Text>
          <Text style={styles.headerTitle}>{team.name}</Text>
        </View>
        <View style={styles.codeBadge}>
          <Text style={styles.codeLabel}>Kod</Text>
          <Text style={styles.codeText}>{team.code}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Alıcı</Text>
            <Text style={styles.sectionMeta}>{selectedTarget}</Text>
          </View>
          <FlatList
            data={[{ id: "all", nickname: "Tüm ekip", status: "available" as const }, ...team.members]}
            horizontal
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const selected = selectedMemberId === item.id;
              return (
                <Pressable
                  onPress={() => setSelectedMemberId(item.id)}
                  style={[styles.memberChip, selected && styles.memberChipSelected]}
                >
                  <Text style={[styles.memberChipText, selected && styles.memberChipTextSelected]}>
                    {item.nickname}
                  </Text>
                </Pressable>
              );
            }}
            showsHorizontalScrollIndicator={false}
          />
        </View>

        <View style={styles.alertComposer}>
          <Text style={styles.sectionTitle}>Acil mesaj</Text>
          <TextInput
            multiline
            onChangeText={setMessage}
            placeholder="Örn: Prod ödeme akışı düştü, hemen bakar mısın?"
            placeholderTextColor="#94a3b8"
            style={styles.messageInput}
            value={message}
          />
          <Pressable onPress={sendAlert} style={styles.dangerButton}>
            <Ionicons name="notifications" size={20} color="#ffffff" />
            <Text style={styles.dangerButtonText}>Alarm Gönder</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Üyeler</Text>
            <Text style={styles.sectionMeta}>{team.members.length} kişi</Text>
          </View>
          {team.members.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{member.nickname.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.nickname}</Text>
                <Text style={styles.memberStatus}>{member.status === "available" ? "Uygun" : "Meşgul"}</Text>
              </View>
              <View
                style={[
                  styles.statusDot,
                  member.status === "available" ? styles.statusAvailable : styles.statusBusy
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Geçmiş</Text>
            <Text style={styles.sectionMeta}>{history.length} alarm</Text>
          </View>
          {history.length === 0 ? (
            <Text style={styles.emptyText}>Henüz alarm yok.</Text>
          ) : (
            history.slice(0, 3).map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <Text style={styles.historyMessage}>{item.message}</Text>
                <Text style={styles.historyMeta}>
                  {item.to} · {item.acknowledged ? "Aldı" : "Bekliyor"}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

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
                      outputRange: [1, 1.03]
                    })
                  }
                ]
              }
            ]}
          >
            <View style={styles.alarmIcon}>
              <Ionicons name="alert" size={44} color="#ffffff" />
            </View>
            <Text style={styles.alarmTitle}>Acil Alarm</Text>
            <Text style={styles.alarmFrom}>{incomingAlert?.from} gönderdi</Text>
            <Text style={styles.alarmMessage}>{incomingAlert?.message}</Text>
            <Pressable onPress={acknowledgeAlert} style={styles.ackButton}>
              <Ionicons name="checkmark-circle" size={22} color="#111827" />
              <Text style={styles.ackButtonText}>Aldım</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  authLayout: {
    flex: 1,
    gap: 18,
    justifyContent: "center",
    padding: 22
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 16,
    height: 64,
    justifyContent: "center",
    marginBottom: 18,
    width: 64
  },
  title: {
    color: "#0f172a",
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: 0
  },
  subtitle: {
    color: "#475569",
    fontSize: 17,
    lineHeight: 25,
    marginTop: 8
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  panelTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700"
  },
  input: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 16,
    height: 48,
    paddingHorizontal: 14
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    height: 50,
    justifyContent: "center"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#facc15",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    height: 50,
    justifyContent: "center"
  },
  secondaryButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20
  },
  kicker: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  headerTitle: {
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "800"
  },
  codeBadge: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    minWidth: 88,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  codeLabel: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "700"
  },
  codeText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0
  },
  content: {
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 20
  },
  section: {
    gap: 10
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800"
  },
  sectionMeta: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600"
  },
  memberChip: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  memberChipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827"
  },
  memberChipText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "700"
  },
  memberChipTextSelected: {
    color: "#ffffff"
  },
  alertComposer: {
    backgroundColor: "#ffffff",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  messageInput: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 16,
    minHeight: 92,
    padding: 14,
    textAlignVertical: "top"
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    height: 52,
    justifyContent: "center"
  },
  dangerButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800"
  },
  memberRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    padding: 12
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#e0f2fe",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  avatarText: {
    color: "#075985",
    fontSize: 18,
    fontWeight: "800"
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12
  },
  memberName: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800"
  },
  memberStatus: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 2
  },
  statusDot: {
    borderRadius: 7,
    height: 14,
    width: 14
  },
  statusAvailable: {
    backgroundColor: "#22c55e"
  },
  statusBusy: {
    backgroundColor: "#f97316"
  },
  emptyText: {
    color: "#64748b",
    fontSize: 15
  },
  historyRow: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12
  },
  historyMessage: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700"
  },
  historyMeta: {
    color: "#64748b",
    fontSize: 13
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.86)",
    flex: 1,
    justifyContent: "center",
    padding: 20
  },
  alarmCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 22,
    width: "100%"
  },
  alarmIcon: {
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 48,
    height: 96,
    justifyContent: "center",
    marginBottom: 16,
    width: 96
  },
  alarmTitle: {
    color: "#111827",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0
  },
  alarmFrom: {
    color: "#64748b",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4
  },
  alarmMessage: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 28,
    marginTop: 18,
    textAlign: "center"
  },
  ackButton: {
    alignItems: "center",
    backgroundColor: "#facc15",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    height: 54,
    justifyContent: "center",
    marginTop: 24,
    width: "100%"
  },
  ackButtonText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900"
  }
});
