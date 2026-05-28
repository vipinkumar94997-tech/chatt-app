import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

const initialForm = { username: "", email: "", password: "" };
const reactionSet = ["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F62E}", "\u{1F622}"];
const chatThemes = ["classic", "ocean", "grape", "sunset"];
const emojiSet = ["😀", "😂", "😍", "🔥", "👍", "🙏", "🎉", "💬"];

const getInitials = (name = "User") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const formatTime = (date) =>
  new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(date),
  );

const formatJoined = (date) =>
  new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));

function App() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(initialForm);
  const [token, setToken] = useState(() => localStorage.getItem("authToken") || "");
  const [user, setUser] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isBooting, setIsBooting] = useState(Boolean(token));
  const [socketStatus, setSocketStatus] = useState("offline");

  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [navFilter, setNavFilter] = useState("all");
  const [selectedChat, setSelectedChat] = useState(null);
  const [messagesByChat, setMessagesByChat] = useState({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [composerText, setComposerText] = useState("");
  const [editingMessage, setEditingMessage] = useState(null);
  const [typingLabel, setTypingLabel] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ username: "", profileImage: "" });
  const [groupDraft, setGroupDraft] = useState({ name: "", avatar: "", memberIds: [] });
  const [isDarkMode, setIsDarkMode] = useState(
    () => localStorage.getItem("theme") === "dark",
  );
  const [toasts, setToasts] = useState([]);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [pinnedChats, setPinnedChats] = useState(
    () => JSON.parse(localStorage.getItem("pinnedChats") || "[]"),
  );
  const [chatTheme, setChatTheme] = useState(
    () => localStorage.getItem("chatTheme") || "classic",
  );
  const [isRecording, setIsRecording] = useState(false);

  const socketRef = useRef(null);
  const selectedChatRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);

  const isRegistering = mode === "register";
  const selectedMessages = selectedChat ? messagesByChat[selectedChat.key] || [] : [];

  const showToast = useCallback((text, tone = "info") => {
    const id = Date.now();
    setToasts((current) => [...current, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const apiRequest = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  }, [token]);

  const getChatKeyFromMessage = useCallback((message) => {
    if (message.conversationType === "group") return `group:${message.groupId}`;
    const otherId = message.senderId === user?.id
      ? message.conversationId.split(":").find((id) => Number(id) !== user.id)
      : message.senderId;
    return `direct:${otherId}`;
  }, [user]);

  const conversations = useMemo(() => {
    const directChats = users.map((chatUser) => {
      const key = `direct:${chatUser.id}`;
      const messages = messagesByChat[key] || [];
      const lastMessage = messages[messages.length - 1];

      return {
        key,
        type: "direct",
        id: chatUser.id,
        name: chatUser.username,
        email: chatUser.email,
        avatar: chatUser.profileImage,
        status: chatUser.status,
        lastSeen: chatUser.lastSeen,
        member: chatUser,
        unread: unreadCounts[key] || 0,
        preview: lastMessage?.text || "Start a private conversation",
        time: lastMessage ? formatTime(lastMessage.createdAt) : "",
      };
    });

    const groupChats = groups.map((group) => {
      const key = `group:${group.id}`;
      const messages = messagesByChat[key] || [];
      const lastMessage = messages[messages.length - 1];

      return {
        key,
        type: "group",
        id: group.id,
        name: group.name,
        avatar: group.avatar,
        members: group.members || [],
        unread: unreadCounts[key] || 0,
        preview: lastMessage?.text || `${group.members?.length || 0} members`,
        time: lastMessage ? formatTime(lastMessage.createdAt) : "",
      };
    });

    return [...directChats, ...groupChats].sort((a, b) => {
      const aPinned = pinnedChats.includes(a.key);
      const bPinned = pinnedChats.includes(b.key);
      if (aPinned === bPinned) return 0;
      return aPinned ? -1 : 1;
    }).filter((conversation) => {
      if (navFilter === "unread") return conversation.unread > 0;
      if (navFilter === "groups") return conversation.type === "group";
      return true;
    });
  }, [groups, messagesByChat, navFilter, pinnedChats, unreadCounts, users]);

  const visibleConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return conversations;

    return conversations.filter((conversation) =>
      conversation.name.toLowerCase().includes(query),
    );
  }, [conversations, searchTerm]);

  useEffect(() => {
    document.body.dataset.theme = isDarkMode ? "dark" : "light";
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem("pinnedChats", JSON.stringify(pinnedChats));
  }, [pinnedChats]);

  useEffect(() => {
    localStorage.setItem("chatTheme", chatTheme);
  }, [chatTheme]);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedMessages.length, selectedChat?.key]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const loadSession = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Session expired");
        setUser(data.user);
        setProfileDraft({
          username: data.user.username,
          profileImage: data.user.profileImage || "",
        });
      } catch (error) {
        localStorage.removeItem("authToken");
        setToken("");
        setUser(null);
        setAuthMessage(error.message);
      } finally {
        setIsBooting(false);
      }
    };

    loadSession();
    return undefined;
  }, [token]);

  useEffect(() => {
    if (!token || !user) return undefined;

    const loadChatData = async () => {
      try {
        const [usersData, groupsData] = await Promise.all([
          apiRequest("/users"),
          apiRequest("/groups"),
        ]);
        setUsers(usersData.users);
        setSearchResults(usersData.users);
        setGroups(groupsData.groups);
      } catch (error) {
        showToast(error.message, "error");
      }
    };

    loadChatData();
    return undefined;
  }, [apiRequest, showToast, token, user]);

  useEffect(() => {
    if (!token || !user) return undefined;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketStatus("online");
      socket.emit("groups:join");
    });

    socket.on("disconnect", () => setSocketStatus("offline"));
    socket.on("connect_error", (error) => showToast(error.message, "error"));

    socket.on("presence:update", ({ userId, status, lastSeen }) => {
      setUsers((current) =>
        current.map((chatUser) =>
          chatUser.id === userId ? { ...chatUser, status, lastSeen } : chatUser,
        ),
      );
    });

    socket.on("message:new", (incomingMessage) => {
      const chatKey = getChatKeyFromMessage(incomingMessage);

      setMessagesByChat((current) => ({
        ...current,
        [chatKey]: [...(current[chatKey] || []), incomingMessage],
      }));

      const activeChat = selectedChatRef.current;
      const isOpen = activeChat?.key === chatKey;
      const isMine = incomingMessage.senderId === user.id;

      if (!isOpen && !isMine) {
        setUnreadCounts((current) => ({
          ...current,
          [chatKey]: (current[chatKey] || 0) + 1,
        }));
        showToast(`New message from ${incomingMessage.sender?.username || "chat"}`);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(incomingMessage.sender?.username || "New message", {
            body: incomingMessage.text,
          });
        }
      }

      if (isOpen) {
        socket.emit("messages:read", {
          conversationType: incomingMessage.conversationType,
          conversationId: incomingMessage.conversationId,
          groupId: incomingMessage.groupId,
        });
      }
    });

    socket.on("message:updated", (updatedMessage) => {
      const chatKey = getChatKeyFromMessage(updatedMessage);
      setMessagesByChat((current) => ({
        ...current,
        [chatKey]: (current[chatKey] || []).map((message) =>
          message.id === updatedMessage.id ? updatedMessage : message,
        ),
      }));
    });

    socket.on("messages:read", ({ conversationType, conversationId, groupId, userId }) => {
      const key = conversationType === "group"
        ? `group:${groupId}`
        : `direct:${conversationId.split(":").find((id) => Number(id) !== user.id)}`;

      setMessagesByChat((current) => ({
        ...current,
        [key]: (current[key] || []).map((message) => {
          if (message.senderId !== user.id) return message;
          const alreadyRead = message.readBy?.some((reader) => reader.id === userId);
          return alreadyRead
            ? message
            : { ...message, readBy: [...(message.readBy || []), { id: userId }] };
        }),
      }));
    });

    socket.on("chat:typing", (event) => {
      const activeChat = selectedChatRef.current;
      if (!activeChat) return;

      const matchesDirect =
        activeChat.type === "direct" &&
        event.conversationType === "direct" &&
        Number(event.userId) === Number(activeChat.id);
      const matchesGroup =
        activeChat.type === "group" &&
        event.conversationType === "group" &&
        Number(event.groupId) === Number(activeChat.id);

      if ((matchesDirect || matchesGroup) && event.isTyping) {
        setTypingLabel(`${event.username} is typing...`);
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = window.setTimeout(() => setTypingLabel(""), 1800);
      }
    });

    socket.on("group:updated", (group) => {
      setGroups((current) => {
        const exists = current.some((item) => item.id === group.id);
        return exists
          ? current.map((item) => (item.id === group.id ? group : item))
          : [group, ...current];
      });
      socket.emit("groups:join");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [getChatKeyFromMessage, showToast, token, user]);

  useEffect(() => {
    if (!token || !user) return undefined;

    window.clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await apiRequest(`/users?search=${encodeURIComponent(searchTerm)}`);
        setSearchResults(data.users);
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(searchTimeoutRef.current);
  }, [apiRequest, searchTerm, showToast, token, user]);

  const handleAuthChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthMessage("");
    setIsLoading(true);

    try {
      const payload = isRegistering
        ? form
        : { email: form.email, password: form.password };
      const response = await fetch(`${API_URL}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Authentication failed");

      localStorage.setItem("authToken", data.token);
      setToken(data.token);
      setUser(data.user);
      setProfileDraft({
        username: data.user.username,
        profileImage: data.user.profileImage || "",
      });
      setForm(initialForm);
    } catch (error) {
      setAuthMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    socketRef.current?.disconnect();
    localStorage.removeItem("authToken");
    setToken("");
    setUser(null);
    setSelectedChat(null);
    setMessagesByChat({});
    showToast("Signed out");
  };

  const handleOpenChat = async (chat) => {
    setSelectedChat(chat);
    setMobileChatOpen(true);
    setTypingLabel("");
    setUnreadCounts((current) => ({ ...current, [chat.key]: 0 }));

    if (messagesByChat[chat.key]) {
      apiRequest("/messages/read", {
        method: "POST",
        body: JSON.stringify({
          conversationType: chat.type,
          conversationId: chat.type === "direct" ? [user.id, chat.id].sort((a, b) => a - b).join(":") : `group:${chat.id}`,
          groupId: chat.type === "group" ? chat.id : undefined,
        }),
      }).catch((error) => showToast(error.message, "error"));
      return;
    }

    setLoadingMessages(true);
    try {
      const path = chat.type === "direct"
        ? `/messages/direct/${chat.id}`
        : `/messages/group/${chat.id}`;
      const data = await apiRequest(path);
      setMessagesByChat((current) => ({ ...current, [chat.key]: data.messages }));
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = (event) => {
    event.preventDefault();
    const text = composerText.trim();
    if (!text || !selectedChat || socketStatus !== "online") return;

    if (editingMessage) {
      socketRef.current.emit("message:edit", { messageId: editingMessage.id, text }, (response) => {
        if (!response?.ok) showToast(response?.message || "Message could not be edited", "error");
      });
      setEditingMessage(null);
      setComposerText("");
      return;
    }

    const eventName = selectedChat.type === "group" ? "group:message" : "direct:message";
    const payload = selectedChat.type === "group"
      ? { groupId: selectedChat.id, text }
      : { receiverId: selectedChat.id, text };

    socketRef.current.emit(eventName, payload, (response) => {
      if (!response?.ok) showToast(response?.message || "Message could not be sent", "error");
    });

    setComposerText("");
  };

  const sendAttachment = (messageType, attachmentUrl, attachmentName) => {
    if (!selectedChat || socketStatus !== "online") return;

    const eventName = selectedChat.type === "group" ? "group:message" : "direct:message";
    const payload = selectedChat.type === "group"
      ? { groupId: selectedChat.id, messageType, attachmentUrl, attachmentName }
      : { receiverId: selectedChat.id, messageType, attachmentUrl, attachmentName };

    socketRef.current.emit(eventName, payload, (response) => {
      if (!response?.ok) showToast(response?.message || "Attachment could not be sent", "error");
    });
  };

  const handleImageShare = (file) => {
    imageToDataUrl(file, (value) => sendAttachment("image", value, file.name));
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      voiceChunksRef.current = [];
      recorder.ondataavailable = (event) => voiceChunksRef.current.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(voiceChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => sendAttachment("voice", reader.result, "voice-message.webm");
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      showToast("Microphone permission is required for voice messages", "error");
    }
  };

  const togglePinChat = (chatKey) => {
    setPinnedChats((current) =>
      current.includes(chatKey)
        ? current.filter((key) => key !== chatKey)
        : [chatKey, ...current],
    );
  };

  const reactToMessage = (messageId, reaction) => {
    socketRef.current?.emit("message:reaction", { messageId, reaction }, (response) => {
      if (!response?.ok) showToast(response?.message || "Reaction failed", "error");
    });
  };

  const deleteMessage = (messageId) => {
    socketRef.current?.emit("message:delete", { messageId }, (response) => {
      if (!response?.ok) showToast(response?.message || "Delete failed", "error");
    });
  };

  const beginEditMessage = (message) => {
    setEditingMessage(message);
    setComposerText(message.text);
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      showToast("Browser notifications are not supported", "error");
      return;
    }

    const permission = await Notification.requestPermission();
    showToast(permission === "granted" ? "Notifications enabled" : "Notifications blocked");
  };

  const handleTyping = (value) => {
    setComposerText(value);
    if (!selectedChat) return;

    socketRef.current?.emit("chat:typing", {
      conversationType: selectedChat.type,
      conversationId: selectedChat.key,
      receiverId: selectedChat.type === "direct" ? selectedChat.id : undefined,
      groupId: selectedChat.type === "group" ? selectedChat.id : undefined,
      isTyping: value.trim().length > 0,
    });
  };

  const imageToDataUrl = (file, callback) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => callback(reader.result);
    reader.readAsDataURL(file);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    try {
      const data = await apiRequest("/users/me", {
        method: "PATCH",
        body: JSON.stringify(profileDraft),
      });
      setUser(data.user);
      setShowProfile(false);
      showToast("Profile updated");
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const createOrUpdateGroup = async (event) => {
    event.preventDefault();

    try {
      if (selectedChat?.type === "group" && groupDraft.id) {
        const data = await apiRequest(`/groups/${groupDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify(groupDraft),
        });
        setGroups((current) =>
          current.map((group) => (group.id === data.group.id ? data.group : group)),
        );
        socketRef.current?.emit("group:created", data.group.id);
      } else {
        const data = await apiRequest("/groups", {
          method: "POST",
          body: JSON.stringify(groupDraft),
        });
        setGroups((current) => [data.group, ...current]);
        socketRef.current?.emit("group:created", data.group.id);
      }

      setShowGroupModal(false);
      setGroupDraft({ name: "", avatar: "", memberIds: [] });
      showToast("Group saved");
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const startCreateGroup = () => {
    setGroupDraft({ name: "", avatar: "", memberIds: [] });
    setShowGroupModal(true);
  };

  const startManageGroup = () => {
    if (selectedChat?.type !== "group") return;
    const group = groups.find((item) => item.id === selectedChat.id);
    setGroupDraft({
      id: group.id,
      name: group.name,
      avatar: group.avatar || "",
      memberIds: group.members?.map((member) => member.id) || [],
    });
    setShowGroupModal(true);
  };

  if (isBooting) {
    return (
      <main className="app-shell loading-shell">
        <div className="loader" aria-label="Loading session"></div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell">
        <section className="auth-layout">
          <div className="brand-panel">
            <p className="eyebrow">Realtime Chat</p>
            <h1>Secure chat with groups, profiles, and live messages.</h1>
            <p>Sign in to use the WhatsApp and Discord inspired chat experience.</p>
          </div>

          <form className="auth-card" onSubmit={handleAuthSubmit}>
            <div>
              <p className="eyebrow">Account access</p>
              <h2>{isRegistering ? "Create account" : "Welcome back"}</h2>
              <p>{isRegistering ? "Register a new chat account." : "Sign in to continue."}</p>
            </div>

            <div className="mode-switch" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                className={!isRegistering ? "active" : ""}
                onClick={() => setMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={isRegistering ? "active" : ""}
                onClick={() => setMode("register")}
              >
                Register
              </button>
            </div>

            {isRegistering && (
              <label>
                Username
                <input name="username" value={form.username} onChange={handleAuthChange} required />
              </label>
            )}
            <label>
              Email
              <input type="email" name="email" value={form.email} onChange={handleAuthChange} required />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleAuthChange}
                minLength={8}
                required
              />
            </label>
            {authMessage && <p className="form-message">{authMessage}</p>}
            <button className="primary-button" disabled={isLoading}>
              {isLoading ? "Please wait..." : isRegistering ? "Create account" : "Login"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={`chat-shell ${mobileChatOpen ? "chat-open" : ""}`}>
      <aside className="chat-sidebar" aria-label="Conversations">
        <header className="sidebar-header">
          <button className="profile-button" type="button" onClick={() => setShowProfile(true)}>
            {user.profileImage ? (
              <img src={user.profileImage} alt="" />
            ) : (
              <span>{getInitials(user.username)}</span>
            )}
          </button>
          <div className="sidebar-title">
            <strong>{user.username}</strong>
            <small className={socketStatus}>{socketStatus}</small>
          </div>
          <button className="icon-button" type="button" onClick={() => setIsDarkMode((value) => !value)}>
            {isDarkMode ? "Light" : "Dark"}
          </button>
          <button className="icon-button" type="button" onClick={requestNotifications}>
            Notify
          </button>
        </header>

        <nav className="sidebar-toolbar" aria-label="Sidebar filters">
          {["all", "unread", "groups"].map((filter) => (
            <button
              key={filter}
              type="button"
              className={`toolbar-button ${navFilter === filter ? "active" : ""}`}
              onClick={() => setNavFilter(filter)}
            >
              {filter}
            </button>
          ))}
          <button type="button" className="toolbar-button create" onClick={startCreateGroup}>
            New group
          </button>
        </nav>

        <label className="search-field">
          <span>Search users</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setIsSearching(Boolean(event.target.value.trim()));
            }}
            placeholder="Search username"
          />
        </label>

        {searchTerm && (
          <section className="search-results">
            <p>{isSearching ? "Searching..." : "User results"}</p>
            {isSearching && <div className="skeleton-row"></div>}
            {!isSearching && searchResults.length === 0 && (
              <div className="empty-state">No users found</div>
            )}
            {!isSearching &&
              searchResults.map((chatUser) => (
                <button
                  type="button"
                  key={chatUser.id}
                  className="conversation-item compact"
                  onClick={() =>
                    handleOpenChat({
                      key: `direct:${chatUser.id}`,
                      type: "direct",
                      id: chatUser.id,
                      name: chatUser.username,
                      avatar: chatUser.profileImage,
                      status: chatUser.status,
                      member: chatUser,
                    })
                  }
                >
                  <span className="chat-avatar">{getInitials(chatUser.username)}</span>
                  <span className="conversation-main">
                    <strong>{chatUser.username}</strong>
                    <span>{chatUser.email}</span>
                  </span>
                </button>
              ))}
          </section>
        )}

        <div className="conversation-list">
          {!searchTerm && visibleConversations.length === 0 && (
            <div className="empty-state">No chats here yet</div>
          )}
          {!searchTerm &&
            visibleConversations.map((conversation) => (
              <button
                type="button"
                key={conversation.key}
                className={`conversation-item ${selectedChat?.key === conversation.key ? "selected" : ""}`}
                onClick={() => handleOpenChat(conversation)}
              >
                <span className="chat-avatar">
                  {conversation.avatar ? <img src={conversation.avatar} alt="" /> : getInitials(conversation.name)}
                  {conversation.status === "online" && <span className="online-dot"></span>}
                </span>
                <span className="conversation-main">
                  <span className="conversation-topline">
                    <strong>{conversation.name}</strong>
                    <time>{conversation.time}</time>
                  </span>
                  <span className="conversation-preview">
                    <span>{pinnedChats.includes(conversation.key) ? "Pinned - " : ""}{conversation.preview}</span>
                    {conversation.unread > 0 && <b>{conversation.unread}</b>}
                  </span>
                </span>
                <span
                  role="button"
                  tabIndex="0"
                  className={`pin-toggle ${pinnedChats.includes(conversation.key) ? "active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePinChat(conversation.key);
                  }}
                >
                  Pin
                </span>
              </button>
            ))}
        </div>
      </aside>

      <section className={`chat-preview theme-${chatTheme}`} aria-label="Selected conversation">
        {selectedChat ? (
          <>
            <header className="chat-preview-header">
              <button className="mobile-back" type="button" onClick={() => setMobileChatOpen(false)}>
                Back
              </button>
              <div className="sidebar-profile">
                <span className="chat-avatar large">
                  {selectedChat.avatar ? <img src={selectedChat.avatar} alt="" /> : getInitials(selectedChat.name)}
                </span>
                <div>
                  <strong>{selectedChat.name}</strong>
                  <span>
                    {typingLabel ||
                      (selectedChat.type === "group"
                        ? `${selectedChat.members?.length || 0} members`
                        : selectedChat.status === "online"
                          ? "online"
                          : selectedChat.lastSeen
                            ? `last seen ${formatTime(selectedChat.lastSeen)}`
                            : "offline")}
                  </span>
                </div>
              </div>
              <div className="preview-actions">
                <select value={chatTheme} onChange={(event) => setChatTheme(event.target.value)}>
                  {chatThemes.map((theme) => (
                    <option key={theme} value={theme}>{theme}</option>
                  ))}
                </select>
                {selectedChat.type === "group" && (
                  <button type="button" className="icon-button" onClick={startManageGroup}>
                    Group
                  </button>
                )}
                <button type="button" className="icon-button" onClick={() => setSearchTerm("")}>
                  Find
                </button>
              </div>
            </header>

            <div className="message-area">
              <p className="date-chip">Today</p>
              {loadingMessages &&
                Array.from({ length: 4 }).map((_, index) => (
                  <div className="message-skeleton" key={index}></div>
                ))}
              {!loadingMessages &&
                selectedMessages.map((chatMessage) => {
                  const isOwn = chatMessage.senderId === user.id;
                  return (
                    <div key={chatMessage.id} className={`message-bubble ${isOwn ? "outgoing" : "incoming"}`}>
                      {selectedChat.type === "group" && !isOwn && (
                        <strong>{chatMessage.sender?.username}</strong>
                      )}
                      {chatMessage.messageType === "image" && chatMessage.attachmentUrl && (
                        <img className="shared-image" src={chatMessage.attachmentUrl} alt={chatMessage.attachmentName || "Shared"} />
                      )}
                      {chatMessage.messageType === "voice" && chatMessage.attachmentUrl && (
                        <audio controls src={chatMessage.attachmentUrl}></audio>
                      )}
                      <p className={chatMessage.deletedAt ? "deleted-text" : ""}>
                        {chatMessage.text}
                      </p>
                      {Object.values(chatMessage.reactions || {}).length > 0 && (
                        <div className="reaction-row">
                          {Object.values(chatMessage.reactions).map((reaction, index) => (
                            <span key={`${reaction}-${index}`}>{reaction}</span>
                          ))}
                        </div>
                      )}
                      <div className="message-actions">
                        {reactionSet.map((reaction) => (
                          <button type="button" key={reaction} onClick={() => reactToMessage(chatMessage.id, reaction)}>
                            {reaction}
                          </button>
                        ))}
                        {isOwn && !chatMessage.deletedAt && chatMessage.messageType === "text" && (
                          <button type="button" onClick={() => beginEditMessage(chatMessage)}>Edit</button>
                        )}
                        {isOwn && !chatMessage.deletedAt && (
                          <button type="button" onClick={() => deleteMessage(chatMessage.id)}>Delete</button>
                        )}
                      </div>
                      <span>
                        {formatTime(chatMessage.createdAt)}
                        {chatMessage.editedAt ? " edited" : ""}
                        {isOwn ? (chatMessage.readBy?.some((reader) => reader.id !== user.id) ? " seen" : " sent") : ""}
                      </span>
                    </div>
                  );
                })}
              <div ref={messagesEndRef}></div>
            </div>

            <form className="composer" onSubmit={handleSendMessage}>
              <div className="emoji-bar">
                {emojiSet.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    onClick={() => setComposerText((value) => `${value}${emoji}`)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {editingMessage && (
                <div className="editing-pill">
                  Editing message
                  <button type="button" onClick={() => {
                    setEditingMessage(null);
                    setComposerText("");
                  }}>
                    Cancel
                  </button>
                </div>
              )}
              <label className="attach-button">
                Image
                <input type="file" accept="image/*" onChange={(event) => handleImageShare(event.target.files?.[0])} />
              </label>
              <button type="button" className={`record-button ${isRecording ? "active" : ""}`} onClick={toggleRecording}>
                {isRecording ? "Stop" : "Voice"}
              </button>
              <input
                type="text"
                value={composerText}
                onChange={(event) => handleTyping(event.target.value)}
                placeholder={socketStatus === "online" ? "Type a message" : "Connecting..."}
                disabled={socketStatus !== "online"}
              />
              <button className="send-button" disabled={!composerText.trim() || socketStatus !== "online"}>
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="empty-chat">
            <h2>Select a chat</h2>
            <p>Search for users, create a group, or open an existing conversation.</p>
          </div>
        )}
      </section>

      {showProfile && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={saveProfile}>
            <header>
              <h2>Profile</h2>
              <button type="button" onClick={() => setShowProfile(false)}>Close</button>
            </header>
            <div className="profile-hero">
              <span className="profile-photo">
                {profileDraft.profileImage ? <img src={profileDraft.profileImage} alt="" /> : getInitials(user.username)}
              </span>
              <label className="upload-button">
                Change photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    imageToDataUrl(event.target.files?.[0], (value) =>
                      setProfileDraft((current) => ({ ...current, profileImage: value })),
                    )
                  }
                />
              </label>
            </div>
            <label>
              Username
              <input
                value={profileDraft.username}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, username: event.target.value }))
                }
              />
            </label>
            <div className="profile-facts">
              <p>Email <strong>{user.email}</strong></p>
              <p>Joined <strong>{formatJoined(user.createdAt)}</strong></p>
              <p>Status <strong>{socketStatus}</strong></p>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={handleLogout}>Logout</button>
              <button className="primary-button">Save profile</button>
            </div>
          </form>
        </div>
      )}

      {showGroupModal && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={createOrUpdateGroup}>
            <header>
              <h2>{groupDraft.id ? "Manage group" : "Create group"}</h2>
              <button type="button" onClick={() => setShowGroupModal(false)}>Close</button>
            </header>
            <label>
              Group name
              <input
                value={groupDraft.name}
                onChange={(event) =>
                  setGroupDraft((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </label>
            <label className="upload-button group-upload">
              Upload group avatar
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  imageToDataUrl(event.target.files?.[0], (value) =>
                    setGroupDraft((current) => ({ ...current, avatar: value })),
                  )
                }
              />
            </label>
            <div className="member-picker">
              {users.map((chatUser) => {
                const checked = groupDraft.memberIds.includes(chatUser.id);
                return (
                  <label key={chatUser.id} className="member-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setGroupDraft((current) => ({
                          ...current,
                          memberIds: event.target.checked
                            ? [...current.memberIds, chatUser.id]
                            : current.memberIds.filter((id) => id !== chatUser.id),
                        }))
                      }
                    />
                    <span>{chatUser.username}</span>
                  </label>
                );
              })}
            </div>
            <button className="primary-button">{groupDraft.id ? "Save group" : "Create group"}</button>
          </form>
        </div>
      )}

      <div className="toast-stack">
        {toasts.map((toast) => (
          <div className={`toast ${toast.tone}`} key={toast.id}>{toast.text}</div>
        ))}
      </div>
    </main>
  );
}

export default App;
