import * as Localization from 'expo-localization';
import { I18n } from 'i18n-js';

const translations = {
  en: {
    // General
    loading: "Loading...",
    error: "Error",
    ok: "OK",
    cancel: "Cancel",
    missingInfo: "Missing Info",
    notFound: "Not Found",
    today: "Today",
    yesterday: "Yesterday",
    
    // Home Screen
    appTitle: "AcilPing",
    appSub: "Create a team, join with a code, send urgent alerts instantly.",
    myTeams: "My Teams",
    teamCount: "%{count} team(s)",
    createTab: "Create",
    joinTab: "Join",
    createTeamTitle: "Create New Team",
    teamNamePlaceholder: "Team Name",
    yourNickname: "Your Nickname",
    createTeamBtn: "Create Team",
    or: "or",
    joinTeamTitle: "Join Team",
    joinCodePlaceholder: "Team Code (e.g. XK7P2A)",
    joinTeamBtn: "Join with Code",
    teamNameRequired: "Team name and nickname are required.",
    teamCreated: "Team created successfully.",
    joinCodeRequired: "Team code and nickname are required.",
    teamNotFound: "No team found with this code.",
    nicknameTaken: "This nickname is already taken in this team. Please choose a different one.",
    alreadyMemberTitle: "Already a Member",
    alreadyMemberMsg: "You are already registered to '%{team}'.",
    enterTeam: "Enter Team",
    leaveTeamTitle: "Leave Team",
    leaveTeamMsg: "Are you sure you want to leave '%{team}'?",
    leaveBtn: "Leave",

    // Team Screen
    teamCode: "CODE: %{code}",
    copied: "Copied!",
    membersTitle: "Members",
    membersCount: "%{count} member(s)",
    available: "Available",
    busy: "Busy",
    you: " (You)",
    teamKicker: "Team",
    inviteOthers: "Share the code to invite others!",
    inviteEmptyTitle: "No one else is here yet",
    inviteEmptyMessage: "You can invite people with code %{code}.",
    
    // Alerts
    sendAlertTitle: "Send Urgent Alert",
    selectTarget: "Select Target:",
    everyone: "Everyone",
    alertTitlePlaceholder: "Alert Title",
    alertBodyPlaceholder: "Detailed description...",
    alertMessagePlaceholder: "Enter urgent message...",
    sendBtn: "Send Alert",
    messageRequiredTitle: "Missing Info",
    messageRequiredMsg: "Please write a title and message to send an alert.",
    titleRequiredMsg: "Please write a title for the alert.",
    confirmAlertTitle: "Send Alert?",
    confirmAlertMsg: "'%{title}'\n%{message}\n\nTarget: %{target}",
    yesSend: "Yes, Send",
    alertFailed: "Could not send alert. Please check your connection.",
    
    // Incoming Alerts
    incomingAlert: "🚨 URGENT ALERT",
    from: "From: %{name}",
    acknowledgeBtn: "I got it",
    waitingAlerts: "+%{count} waiting alert(s)",
    statusFailed: "Could not update status.",
    
    // History
    historyTitle: "History",
    historyCount: "%{count} alert(s)",
    noAlerts: "No alerts sent yet.",
    received: "✓ Received",
    sent: "Sent",
    
    // Detail Modal
    detailAlertTitle: "Title",
    detailBody: "Content"
  },
  tr: {
    loading: "Yükleniyor...",
    error: "Hata",
    ok: "Tamam",
    cancel: "İptal",
    missingInfo: "Eksik Bilgi",
    notFound: "Bulunamadı",
    today: "Bugün",
    yesterday: "Dün",
    
    appTitle: "AcilPing",
    appSub: "Ekibini oluştur, kodla katıl, anında acil alarm gönder.",
    myTeams: "Takımlarım",
    teamCount: "%{count} takım",
    createTab: "Oluştur",
    joinTab: "Katıl",
    createTeamTitle: "Yeni Takım Oluştur",
    teamNamePlaceholder: "Takım Adı",
    yourNickname: "Kullanıcı Adın",
    createTeamBtn: "Takım Oluştur",
    or: "veya",
    joinTeamTitle: "Takıma Katıl",
    joinCodePlaceholder: "Takım Kodu (örn: XK7P2A)",
    joinTeamBtn: "Takıma Katıl",
    teamNameRequired: "Takım adı ve kullanıcı adın gerekli.",
    teamCreated: "Takım başarıyla oluşturuldu.",
    joinCodeRequired: "Takım kodu ve kullanıcı adın gerekli.",
    teamNotFound: "Bu koda sahip bir takım bulunamadı.",
    nicknameTaken: "Bu kullanıcı adı bu takımda zaten kullanılıyor. Farklı bir ad seç.",
    alreadyMemberTitle: "Zaten Üyesin",
    alreadyMemberMsg: "'%{team}' takımına zaten kayıtlısın.",
    enterTeam: "Takıma Gir",
    leaveTeamTitle: "Takımdan Ayrıl",
    leaveTeamMsg: "'%{team}' takımından ayrılmak istediğine emin misin?",
    leaveBtn: "Ayrıl",

    teamCode: "KOD: %{code}",
    copied: "Kopyalandı!",
    membersTitle: "Üyeler",
    membersCount: "%{count} üye",
    available: "Uygun",
    busy: "Meşgul",
    you: " (Sen)",
    teamKicker: "Takım",
    inviteOthers: "Kod paylaşarak başkalarını davet et!",
    inviteEmptyTitle: "Takımda henüz kimse yok",
    inviteEmptyMessage: "İnsanları %{code} kodu ile davet edebilirsin.",
    
    sendAlertTitle: "Acil Alarm Gönder",
    selectTarget: "Kime:",
    everyone: "Herkes",
    alertTitlePlaceholder: "Alarm Başlığı",
    alertBodyPlaceholder: "Detaylı açıklama...",
    alertMessagePlaceholder: "Acil durumu buraya yazın...",
    sendBtn: "Alarm Gönder",
    messageRequiredTitle: "Eksik Bilgi",
    messageRequiredMsg: "Alarm göndermek için başlık ve mesaj yaz.",
    titleRequiredMsg: "Alarm için bir başlık yaz.",
    confirmAlertTitle: "Alarm Gönderilsin mi?",
    confirmAlertMsg: "'%{title}'\n%{message}\n\nAlıcı: %{target}",
    yesSend: "Evet, Gönder",
    alertFailed: "Alarm gönderilemedi. İnternet bağlantınızı kontrol edin.",
    
    incomingAlert: "🚨 ACİL ALARM",
    from: "Kimden: %{name}",
    acknowledgeBtn: "Aldım",
    waitingAlerts: "+%{count} alarm bekliyor",
    statusFailed: "Durum güncellenemedi.",
    
    historyTitle: "Geçmiş",
    historyCount: "%{count} alarm",
    noAlerts: "Henüz alarm gönderilmedi.",
    received: "✓ Aldı",
    sent: "Gönderildi",
    
    detailAlertTitle: "Başlık",
    detailBody: "İçerik"
  },
  de: {
    loading: "Wird geladen...",
    error: "Fehler",
    ok: "OK",
    cancel: "Abbrechen",
    missingInfo: "Fehlende Info",
    notFound: "Nicht gefunden",
    today: "Heute",
    yesterday: "Gestern",
    
    appTitle: "AcilPing",
    appSub: "Team erstellen, per Code beitreten, sofort Alarme senden.",
    myTeams: "Meine Teams",
    teamCount: "%{count} Team(s)",
    createTab: "Erstellen",
    joinTab: "Beitreten",
    createTeamTitle: "Neues Team erstellen",
    teamNamePlaceholder: "Teamname",
    yourNickname: "Dein Spitzname",
    createTeamBtn: "Team erstellen",
    or: "oder",
    joinTeamTitle: "Team beitreten",
    joinCodePlaceholder: "Team-Code (z.B. XK7P2A)",
    joinTeamBtn: "Mit Code beitreten",
    teamNameRequired: "Teamname und Spitzname sind erforderlich.",
    teamCreated: "Team erfolgreich erstellt.",
    joinCodeRequired: "Team-Code und Spitzname sind erforderlich.",
    teamNotFound: "Kein Team mit diesem Code gefunden.",
    nicknameTaken: "Dieser Spitzname ist in diesem Team bereits vergeben. Bitte wähle einen anderen.",
    alreadyMemberTitle: "Bereits Mitglied",
    alreadyMemberMsg: "Du bist bereits im Team '%{team}' registriert.",
    enterTeam: "Team betreten",
    leaveTeamTitle: "Team verlassen",
    leaveTeamMsg: "Möchtest du das Team '%{team}' wirklich verlassen?",
    leaveBtn: "Verlassen",

    teamCode: "CODE: %{code}",
    copied: "Kopiert!",
    membersTitle: "Mitglieder",
    membersCount: "%{count} Mitglied(er)",
    available: "Verfügbar",
    busy: "Beschäftigt",
    you: " (Du)",
    teamKicker: "Team",
    inviteOthers: "Teile den Code, um andere einzuladen!",
    inviteEmptyTitle: "Noch niemand anderes ist hier",
    inviteEmptyMessage: "Du kannst Personen mit dem Code %{code} einladen.",
    
    sendAlertTitle: "Dringenden Alarm senden",
    selectTarget: "Ziel:",
    everyone: "Alle",
    alertTitlePlaceholder: "Alarm-Titel",
    alertBodyPlaceholder: "Detaillierte Beschreibung...",
    alertMessagePlaceholder: "Dringende Nachricht hier eingeben...",
    sendBtn: "Alarm senden",
    messageRequiredTitle: "Fehlende Info",
    messageRequiredMsg: "Bitte schreibe einen Titel und eine Nachricht.",
    titleRequiredMsg: "Bitte schreibe einen Titel für den Alarm.",
    confirmAlertTitle: "Alarm senden?",
    confirmAlertMsg: "'%{title}'\n%{message}\n\nZiel: %{target}",
    yesSend: "Ja, senden",
    alertFailed: "Alarm konnte nicht gesendet werden. Bitte Verbindung prüfen.",
    
    incomingAlert: "🚨 DRINGENDER ALARM",
    from: "Von: %{name}",
    acknowledgeBtn: "Verstanden",
    waitingAlerts: "+%{count} wartende Alarme",
    statusFailed: "Status konnte nicht aktualisiert werden.",

    historyTitle: "Verlauf",
    historyCount: "%{count} Alarm(e)",
    noAlerts: "Noch keine Alarme gesendet.",
    received: "✓ Empfangen",
    sent: "Gesendet",
    
    detailAlertTitle: "Titel",
    detailBody: "Inhalt"
  },
  fr: {
    loading: "Chargement...",
    error: "Erreur",
    ok: "OK",
    cancel: "Annuler",
    missingInfo: "Infos manquantes",
    notFound: "Introuvable",
    today: "Aujourd'hui",
    yesterday: "Hier",
    
    appTitle: "AcilPing",
    appSub: "Créez une équipe, rejoignez avec un code, envoyez des alertes.",
    myTeams: "Mes Équipes",
    teamCount: "%{count} équipe(s)",
    createTab: "Créer",
    joinTab: "Rejoindre",
    createTeamTitle: "Créer une Équipe",
    teamNamePlaceholder: "Nom de l'équipe",
    yourNickname: "Votre pseudo",
    createTeamBtn: "Créer l'équipe",
    or: "ou",
    joinTeamTitle: "Rejoindre",
    joinCodePlaceholder: "Code d'équipe (ex: XK7P2A)",
    joinTeamBtn: "Rejoindre avec code",
    teamNameRequired: "Le nom de l'équipe et le pseudo sont requis.",
    teamCreated: "Équipe créée avec succès.",
    joinCodeRequired: "Le code d'équipe et le pseudo sont requis.",
    teamNotFound: "Aucune équipe trouvée avec ce code.",
    nicknameTaken: "Ce pseudo est déjà utilisé dans cette équipe. Veuillez en choisir un autre.",
    alreadyMemberTitle: "Déjà membre",
    alreadyMemberMsg: "Vous êtes déjà inscrit dans '%{team}'.",
    enterTeam: "Entrer",
    leaveTeamTitle: "Quitter l'équipe",
    leaveTeamMsg: "Voulez-vous vraiment quitter '%{team}' ?",
    leaveBtn: "Quitter",

    teamCode: "CODE: %{code}",
    copied: "Copié !",
    membersTitle: "Membres",
    membersCount: "%{count} membre(s)",
    available: "Disponible",
    busy: "Occupé",
    you: " (Toi)",
    teamKicker: "Équipe",
    inviteOthers: "Partagez le code pour inviter !",
    inviteEmptyTitle: "Personne d'autre n'est encore ici",
    inviteEmptyMessage: "Vous pouvez inviter des personnes avec le code %{code}.",
    
    sendAlertTitle: "Envoyer une Alerte",
    selectTarget: "Pour:",
    everyone: "Tous",
    alertTitlePlaceholder: "Titre de l'alerte",
    alertBodyPlaceholder: "Description détaillée...",
    alertMessagePlaceholder: "Entrez le message urgent...",
    sendBtn: "Envoyer l'alerte",
    messageRequiredTitle: "Infos manquantes",
    messageRequiredMsg: "Veuillez écrire un titre et un message.",
    titleRequiredMsg: "Veuillez écrire un titre pour l'alerte.",
    confirmAlertTitle: "Envoyer l'alerte ?",
    confirmAlertMsg: "'%{title}'\n%{message}\n\nPour: %{target}",
    yesSend: "Oui, envoyer",
    alertFailed: "Échec de l'envoi de l'alerte. Vérifiez votre connexion.",
    
    incomingAlert: "🚨 ALERTE URGENTE",
    from: "De: %{name}",
    acknowledgeBtn: "J'ai compris",
    waitingAlerts: "+%{count} alertes en attente",
    statusFailed: "Impossible de mettre à jour le statut.",

    historyTitle: "Historique",
    historyCount: "%{count} alerte(s)",
    noAlerts: "Aucune alerte envoyée.",
    received: "✓ Reçu",
    sent: "Envoyé",
    
    detailAlertTitle: "Titre",
    detailBody: "Contenu"
  }
};

const i18n = new I18n(translations);

// Fallback to English if localization is missing
i18n.enableFallback = true;
// Set default locale
i18n.defaultLocale = 'en';

// Device locale handling
// expo-localization returns locales like 'en-US', we just want 'en'
const locales = Localization.getLocales();
if (locales && locales.length > 0) {
  const deviceLang = locales[0].languageCode;
  // If we support the device language, use it. Otherwise, use English.
  if (deviceLang && Object.keys(translations).includes(deviceLang)) {
    i18n.locale = deviceLang;
  } else {
    i18n.locale = 'en';
  }
} else {
  i18n.locale = 'en';
}

export default i18n;
