"use client";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult:
    | ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void)
    | null;
  onerror:
    | ((
        this: SpeechRecognitionInstance,
        ev: SpeechRecognitionErrorEvent
      ) => void)
    | null;
  onspeechend?: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
    puter?: {
      ai?: {
        txt2speech?: (
          text: string,
          options?: {
            voice?: string;
            language?: string;
            engine?: string;
            provider?: string;
          }
        ) => Promise<HTMLAudioElement>;
      };
    };
  }
}

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { chatBruti, transcribeAudio } from "@/lib/chat-api";
import { useRef, useState, useCallback, useEffect } from "react";
import {
  BotIcon,
  UserIcon,
  SparklesIcon,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Sun,
  Moon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Orb, AgentState } from "@/components/ui/orb";
import { Loader } from "@/components/ai-elements/loader";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

type VoiceChatMode = "idle" | "listening" | "processing" | "speaking";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Bienvenue, ami penseur ! Je suis SocratChat, ton assistant philosophique. Pose-moi tes questions, et ensemble, explorons les chemins de la sagesse. 🏛️",
    },
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"submitted" | "streaming" | "ready">(
    "ready"
  );
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMicListening, setIsMicListening] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [voiceChatMode, setVoiceChatMode] = useState<VoiceChatMode>("idle");
  const [isFullscreenVoice, setIsFullscreenVoice] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isVoiceActiveRef = useRef(false);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFullscreenVoiceRef = useRef(false);
  const startAutoListeningRef = useRef<() => void>(() => {});

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 5000);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    isVoiceActiveRef.current = isVoiceActive;
  }, [isVoiceActive]);

  useEffect(() => {
    isFullscreenVoiceRef.current = isFullscreenVoice;
  }, [isFullscreenVoice]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const shouldBeDark = savedTheme === "dark" || (!savedTheme && prefersDark);
    setIsDarkMode(shouldBeDark);
    if (shouldBeDark) {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.abort();
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, []);

  const processVoiceRecording = useCallback(
    async (audioBlob: Blob) => {
      setIsRecording(false);
      setAgentState("thinking");

      try {
        const transcript = await transcribeAudio(audioBlob);
        console.log("✅ Voice transcription:", transcript);

        if (transcript?.trim()) {
          setInput(transcript);
        } else {
          if (isVoiceActiveRef.current) {
            showToast("Je n'ai pas compris. Réessayez.");
          }
        }
      } catch (error) {
        console.error("❌ Voice transcription error:", error);
        if (isVoiceActiveRef.current) {
          showToast("Erreur de transcription. Réessayez.");
        }
      }
    },
    [showToast]
  );

  const startVoiceRecording = useCallback(async () => {
    if (!isVoiceActiveRef.current) return;

    try {
      console.log("🎤 Starting voice recording...");
      setAgentState("listening");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "";
        }
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log("🎤 Voice recording stopped, transcribing...");
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        await processVoiceRecording(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      console.log("✅ Voice recording started");
    } catch (error) {
      console.error("❌ Voice recording error:", error);
      setIsRecording(false);
      setAgentState(null);
      if (error instanceof Error && error.name === "NotAllowedError") {
        showToast(
          "🎤 Permission microphone refusée. Autorisez l'accès au micro."
        );
        setIsVoiceActive(false);
        isVoiceActiveRef.current = false;
      } else {
        showToast("Impossible d'accéder au microphone.");
      }
    }
  }, [showToast, processVoiceRecording]);

  const speakResponse = useCallback(
    async (text: string, onComplete?: () => void) => {
      if (!voiceMode && !isVoiceActiveRef.current) return;

      try {
        if (window.puter?.ai?.txt2speech) {
          setIsPlayingAudio(true);

          if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
          }

          const isFrench =
            /[àâäéèêëïîôùûüÿç]/.test(text) ||
            text.toLowerCase().includes("c'est") ||
            text.toLowerCase().includes("dans");
          const language = isFrench ? "fr-FR" : "en-US";
          const voiceToUse = isFrench ? "Mathieu" : "Matthew";

          let audio: HTMLAudioElement | undefined;

          try {
            audio = await window.puter.ai.txt2speech(text, {
              provider: "aws-polly",
              voice: voiceToUse,
              language,
            });
          } catch {
            try {
              audio = await window.puter.ai.txt2speech(text, {
                voice: voiceToUse,
                language,
                engine: "neural",
              });
            } catch {
              audio = await window.puter.ai.txt2speech(text, {
                language,
              });
            }
          }

          if (audio) {
            currentAudioRef.current = audio;

            audio.addEventListener("ended", () => {
              setIsPlayingAudio(false);
              currentAudioRef.current = null;
              if (isVoiceActiveRef.current) {
                setAgentState("listening");
                onComplete?.();
              } else {
                setAgentState(null);
              }
            });

            audio.addEventListener("error", () => {
              setIsPlayingAudio(false);
              currentAudioRef.current = null;
              if (isVoiceActiveRef.current) {
                onComplete?.();
              }
            });

            setAgentState("talking");
            await audio.play();
          } else {
            if (isVoiceActiveRef.current) {
              onComplete?.();
            }
          }
        } else {
          if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1;
            utterance.pitch = 1;

            utterance.onstart = () => {
              setAgentState("talking");
              setIsPlayingAudio(true);
            };
            utterance.onend = () => {
              setIsPlayingAudio(false);
              if (isVoiceActiveRef.current) {
                setAgentState("listening");
                onComplete?.();
              } else {
                setAgentState(null);
              }
            };

            window.speechSynthesis.speak(utterance);
          } else {
            if (isVoiceActiveRef.current) {
              onComplete?.();
            }
          }
        }
      } catch (error) {
        console.error("Error playing audio:", error);
        setIsPlayingAudio(false);
        if (isVoiceActiveRef.current) {
          onComplete?.();
        }
      }
    },
    [voiceMode]
  );

  const exitFullscreenVoice = useCallback(() => {
    isFullscreenVoiceRef.current = false;
    setIsFullscreenVoice(false);
    setVoiceChatMode("idle");
    setAgentState(null);
    setCurrentTranscript("");

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.abort();
      speechRecognitionRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    window.speechSynthesis?.cancel();
  }, []);

  const speakResponseFullscreen = useCallback(async (text: string) => {
    try {
      if (window.puter?.ai?.txt2speech) {
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          currentAudioRef.current = null;
        }

        const isFrench =
          /[àâäéèêëïîôùûüÿç]/.test(text) ||
          text.toLowerCase().includes("c'est") ||
          text.toLowerCase().includes("dans");
        const language = isFrench ? "fr-FR" : "en-US";
        const voiceToUse = isFrench ? "Mathieu" : "Matthew";

        let audio: HTMLAudioElement | undefined;

        try {
          audio = await window.puter.ai.txt2speech(text, {
            provider: "aws-polly",
            voice: voiceToUse,
            language,
          });
        } catch {
          try {
            audio = await window.puter.ai.txt2speech(text, {
              voice: voiceToUse,
              language,
              engine: "neural",
            });
          } catch {
            audio = await window.puter.ai.txt2speech(text, {
              language,
            });
          }
        }

        if (audio) {
          currentAudioRef.current = audio;
          setAgentState("talking");

          audio.addEventListener("ended", () => {
            currentAudioRef.current = null;
            if (isFullscreenVoiceRef.current) {
              setVoiceChatMode("listening");
              setAgentState("listening");
              startAutoListeningRef.current();
            }
          });

          audio.addEventListener("error", () => {
            currentAudioRef.current = null;
            if (isFullscreenVoiceRef.current) {
              setVoiceChatMode("listening");
              startAutoListeningRef.current();
            }
          });

          await audio.play();
        } else {
          if (isFullscreenVoiceRef.current) {
            setVoiceChatMode("listening");
            startAutoListeningRef.current();
          }
        }
      } else {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1;
          utterance.pitch = 1;

          utterance.onstart = () => {
            setAgentState("talking");
          };
          utterance.onend = () => {
            if (isFullscreenVoiceRef.current) {
              setVoiceChatMode("listening");
              setAgentState("listening");
              startAutoListeningRef.current();
            }
          };

          window.speechSynthesis.speak(utterance);
        } else {
          if (isFullscreenVoiceRef.current) {
            setVoiceChatMode("listening");
            startAutoListeningRef.current();
          }
        }
      }
    } catch (error) {
      console.error("Error speaking response:", error);
      if (isFullscreenVoiceRef.current) {
        setVoiceChatMode("listening");
        startAutoListeningRef.current();
      }
    }
  }, []);

  const processAutoVoiceMessage = useCallback(
    async (transcript: string) => {
      if (!transcript.trim() || !isFullscreenVoiceRef.current) return;

      setVoiceChatMode("processing");
      setAgentState("thinking");
      setCurrentTranscript("");

      try {
        let fullResponse = "";

        await chatBruti(transcript, (chunk) => {
          fullResponse += chunk;
        });

        if (!fullResponse.trim()) {
          const fallbackMessages = [
            "👍",
            "Va demander à Google, moi j'suis en grève ! 🤡",
          ];
          fullResponse =
            fallbackMessages[
              Math.floor(Math.random() * fallbackMessages.length)
            ];
        }

        if (isFullscreenVoiceRef.current) {
          setVoiceChatMode("speaking");
          await speakResponseFullscreen(fullResponse);
        }
      } catch (error) {
        console.error("Error processing voice message:", error);
        if (isFullscreenVoiceRef.current) {
          setVoiceChatMode("listening");
          startAutoListeningRef.current();
        }
      }
    },
    [speakResponseFullscreen]
  );

  const startAutoListening = useCallback(async () => {
    if (!isFullscreenVoiceRef.current) return;

    try {
      console.log("🎤 Starting auto-listening with MediaRecorder...");
      setVoiceChatMode("listening");
      setAgentState("listening");
      setCurrentTranscript("");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "";
        }
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      let silenceStart: number | null = null;
      let hasSpoken = false;
      const SILENCE_THRESHOLD = 15;
      const SILENCE_DURATION = 1500;

      const checkSilence = () => {
        if (
          !isFullscreenVoiceRef.current ||
          mediaRecorder.state === "inactive"
        ) {
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (average > SILENCE_THRESHOLD) {
          hasSpoken = true;
          silenceStart = null;
          setCurrentTranscript("🎤 Parlez...");
        } else if (hasSpoken) {
          if (silenceStart === null) {
            silenceStart = Date.now();
          } else if (Date.now() - silenceStart > SILENCE_DURATION) {
            console.log("🛑 Silence detected, stopping recording...");
            mediaRecorder.stop();
            return;
          }
        }

        requestAnimationFrame(checkSilence);
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log("🎤 Recording stopped, transcribing...");
        audioContext.close();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        if (!isFullscreenVoiceRef.current) return;

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });

        if (audioBlob.size < 1000) {
          console.log("Audio too short, restarting...");
          if (isFullscreenVoiceRef.current) {
            startAutoListeningRef.current();
          }
          return;
        }

        setVoiceChatMode("processing");
        setAgentState("thinking");
        setCurrentTranscript("Transcription...");

        try {
          const transcript = await transcribeAudio(audioBlob);
          console.log("✅ Transcription:", transcript);

          if (transcript?.trim()) {
            await processAutoVoiceMessage(transcript.trim());
          } else {
            setCurrentTranscript("");
            if (isFullscreenVoiceRef.current) {
              startAutoListeningRef.current();
            }
          }
        } catch (error) {
          console.error("❌ Transcription error:", error);
          showToast("Erreur de transcription. Réessayez.");
          if (isFullscreenVoiceRef.current) {
            setVoiceChatMode("listening");
            startAutoListeningRef.current();
          }
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      console.log("✅ Auto-listening started");

      checkSilence();
    } catch (error) {
      console.error("❌ Auto-listening error:", error);
      if (error instanceof Error && error.name === "NotAllowedError") {
        showToast(
          "🎤 Permission microphone refusée. Autorisez l'accès au micro."
        );
        setVoiceChatMode("idle");
        setAgentState(null);
      } else {
        showToast("Erreur microphone. Cliquez pour réessayer.");
        setVoiceChatMode("idle");
        setAgentState(null);
      }
    }
  }, [showToast, processAutoVoiceMessage]);

  useEffect(() => {
    startAutoListeningRef.current = startAutoListening;
  }, [startAutoListening]);

  const enterFullscreenVoice = useCallback(() => {
    isFullscreenVoiceRef.current = true;
    setIsFullscreenVoice(true);
    setVoiceChatMode("listening");
    setVoiceMode(true);
    setTimeout(() => {
      startAutoListeningRef.current();
    }, 100);
  }, []);

  const handleSendMessage = useCallback(
    async (messageText: string, fromVoiceChat: boolean = false) => {
      if (!messageText.trim() || status !== "ready") return;

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: messageText,
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setStatus("submitted");
      setAgentState("thinking");

      const botMessageId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        {
          id: botMessageId,
          role: "assistant",
          content: "",
          isStreaming: true,
        },
      ]);

      try {
        setStatus("streaming");
        let fullResponse = "";

        await chatBruti(messageText, (chunk) => {
          fullResponse += chunk;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId
                ? { ...msg, content: msg.content + chunk }
                : msg
            )
          );
        });

        if (!fullResponse.trim()) {
          const fallbackMessages = [
            "👍",
            "Va demander à Google, moi j'suis en grève ! 🤡",
            "Google knows better than me, go ask him! 🔍",
          ];
          const fallback =
            fallbackMessages[
              Math.floor(Math.random() * fallbackMessages.length)
            ];
          fullResponse = fallback;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId ? { ...msg, content: fallback } : msg
            )
          );
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId ? { ...msg, isStreaming: false } : msg
          )
        );

        if ((voiceMode || fromVoiceChat) && fullResponse) {
          await speakResponse(
            fullResponse,
            fromVoiceChat ? startVoiceRecording : undefined
          );
        } else {
          setAgentState(null);
        }
      } catch (error) {
        console.error("Error sending message:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Une erreur est survenue";

        if (errorMessage.includes("GROQ_API_KEY")) {
          showToast(
            "⚠️ Clé API manquante. Ajoutez NEXT_PUBLIC_GROQ_API_KEY dans .env.local"
          );
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId
              ? {
                  ...msg,
                  content:
                    "Oups ! Une erreur s'est produite. Même Socrate n'avait pas toutes les réponses !",
                  isStreaming: false,
                }
              : msg
          )
        );
        setAgentState(null);
        if (fromVoiceChat && isVoiceActiveRef.current) {
          startVoiceRecording();
        }
      } finally {
        setStatus("ready");
      }
    },
    [status, voiceMode, speakResponse, showToast, startVoiceRecording]
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    await handleSendMessage(input.trim());
  };

  const startRecording = useCallback(
    async (forVoiceChat: boolean = false) => {
      try {
        console.log("🎤 Starting recording...");
        setAgentState("listening");

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streamRef.current = stream;

        let mimeType = "audio/webm;codecs=opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "audio/webm";
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "";
          }
        }

        const mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          console.log("🎤 Recording stopped, transcribing...");
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mediaRecorder.mimeType || "audio/webm",
          });
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;

          setIsRecording(false);
          setAgentState("thinking");

          try {
            const transcript = await transcribeAudio(audioBlob);
            console.log("✅ Transcription:", transcript);

            if (transcript?.trim()) {
              setInput(transcript);
              if (forVoiceChat || isVoiceActiveRef.current) {
                await handleSendMessage(transcript, true);
              }
            } else {
              if (isVoiceActiveRef.current) {
                showToast("Je n'ai pas compris. Réessayez.");
                startVoiceRecording();
              } else {
                showToast("Aucune transcription reçue. Réessayez.");
                setAgentState(null);
              }
            }
          } catch (error) {
            console.error("❌ Transcription error:", error);
            if (isVoiceActiveRef.current) {
              showToast("Erreur de transcription. Réessayez.");
              startVoiceRecording();
            } else {
              showToast("Erreur de transcription. Réessayez.");
              setAgentState(null);
            }
          }
        };

        mediaRecorder.start();
        mediaRecorderRef.current = mediaRecorder;
        setIsRecording(true);
        console.log("✅ Recording started");
      } catch (error) {
        console.error("❌ Recording error:", error);
        setIsRecording(false);
        setAgentState(null);
        if (error instanceof Error && error.name === "NotAllowedError") {
          showToast(
            "🎤 Permission microphone refusée. Autorisez l'accès au micro."
          );
          if (forVoiceChat) {
            setIsVoiceActive(false);
            isVoiceActiveRef.current = false;
          }
        } else {
          showToast("Impossible d'accéder au microphone.");
        }
      }
    },
    [handleSendMessage, showToast, startVoiceRecording]
  );

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      console.log("🛑 Stopping recording...");
      mediaRecorderRef.current.stop();
    }
  }, []);

  const toggleMicrophoneInput = useCallback(() => {
    if (isMicListening) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      setIsMicListening(false);
      return;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      showToast(
        "🎤 La reconnaissance vocale n'est pas supportée par ce navigateur."
      );
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "fr-FR";

      let finalTranscript = input;

      recognition.onstart = () => {
        console.log("🎤 Speech recognition started");
        setIsMicListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript +=
              (finalTranscript ? " " : "") + result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        setInput(
          finalTranscript + (interimTranscript ? " " + interimTranscript : "")
        );
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          showToast("🎤 Permission microphone refusée.");
        }
        setIsMicListening(false);
      };

      recognition.onend = () => {
        console.log("🎤 Speech recognition ended");
        setIsMicListening(false);
        speechRecognitionRef.current = null;
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (error) {
      console.error("Speech recognition error:", error);
      showToast("Erreur de reconnaissance vocale.");
    }
  }, [isMicListening, input, showToast]);

  const toggleVoiceMode = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setIsPlayingAudio(false);
    }
    setVoiceMode(!voiceMode);
  };

  const toggleVoiceChat = useCallback(() => {
    if (isVoiceActive) {
      isVoiceActiveRef.current = false;
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      window.speechSynthesis?.cancel();
      setIsVoiceActive(false);
      setIsRecording(false);
      setIsPlayingAudio(false);
      setAgentState(null);
    } else {
      isVoiceActiveRef.current = true;
      setIsVoiceActive(true);
      setVoiceMode(true);
      startRecording(true);
    }
  }, [isVoiceActive, startRecording]);

  const handleMicButtonClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording(false);
    }
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    if (
      isVoiceActiveRef.current &&
      input.trim() &&
      status === "ready" &&
      agentState === "thinking" &&
      !isRecording
    ) {
      handleSendMessage(input.trim(), true);
    }
  }, [input, status, agentState, isRecording, handleSendMessage]);

  const clearChat = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Bienvenue, ami penseur ! Je suis SocratChat, ton assistant philosophique. Pose-moi tes questions, et ensemble, explorons les chemins de la sagesse. 🏛️",
      },
    ]);
  };

  if (isFullscreenVoice) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-b from-background via-background to-muted/50 flex flex-col items-center justify-center">
        <button
          onClick={exitFullscreenVoice}
          className="absolute top-6 right-6 p-3 rounded-full bg-muted/50 hover:bg-muted transition-colors"
        >
          <X className="size-6" />
        </button>

        <div className="flex flex-col items-center gap-8 max-w-lg px-6">
          <button
            onClick={() => {
              if (voiceChatMode === "idle") {
                startAutoListeningRef.current();
              }
            }}
            className="size-64 md:size-80 relative cursor-pointer focus:outline-none"
            disabled={voiceChatMode !== "idle"}
          >
            <Orb
              agentState={agentState}
              colors={
                voiceChatMode === "speaking"
                  ? ["#cb6441", "#b2572f"]
                  : voiceChatMode === "processing"
                  ? ["#d87757", "#cb6441"]
                  : voiceChatMode === "idle"
                  ? ["#b4b1a3", "#85837d"]
                  : ["#cb6441", "#d87757"]
              }
              className="absolute inset-0"
            />
            {voiceChatMode === "idle" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="size-20 rounded-full bg-white/10 flex items-center justify-center">
                  <Mic className="size-8 text-white/70" />
                </div>
              </div>
            )}
          </button>

          <div className="text-center space-y-3">
            <h2 className="text-2xl font-medium">
              {voiceChatMode === "listening"
                ? "J'écoute..."
                : voiceChatMode === "processing"
                ? "Je réfléchis..."
                : voiceChatMode === "speaking"
                ? "Je réponds..."
                : "Cliquez pour parler"}
            </h2>
            {currentTranscript && (
              <p className="text-lg text-muted-foreground max-w-md animate-pulse">
                &quot;{currentTranscript}&quot;
              </p>
            )}
            {!currentTranscript && voiceChatMode === "listening" && (
              <p className="text-sm text-muted-foreground">
                Parlez naturellement, je répondrai automatiquement
              </p>
            )}
            {voiceChatMode === "idle" && (
              <p className="text-sm text-muted-foreground">
                Cliquez sur l&apos;orbe pour démarrer
              </p>
            )}
          </div>

          <Button
            variant="destructive"
            size="lg"
            className="mt-4 gap-2"
            onClick={exitFullscreenVoice}
          >
            <PhoneOff className="size-5" />
            Terminer la conversation
          </Button>
        </div>

        {toast && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
              <span className="text-sm">{toast}</span>
              <button
                onClick={() => setToast(null)}
                className="hover:bg-white/10 rounded p-1 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-muted/20">
      <header className="flex items-center justify-between px-6 py-4 border-b bg-background/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <BotIcon className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-sm flex items-center gap-1.5">
              <Image
                src="/chat-icon.png"
                alt="SocratChat"
                width={18}
                height={18}
                className="rounded-sm"
              />
              SocratChat
            </h1>
            <p className="text-xs text-muted-foreground">
              Votre assistant philosophique
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={toggleDarkMode}
                >
                  {isDarkMode ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isDarkMode ? "Mode clair" : "Mode sombre"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={voiceMode ? "default" : "ghost"}
                  size="icon"
                  className="rounded-full"
                  onClick={toggleVoiceMode}
                >
                  {isPlayingAudio ? (
                    <Volume2 className="size-4" />
                  ) : voiceMode ? (
                    <Volume2 className="size-4" />
                  ) : (
                    <VolumeX className="size-4 text-muted-foreground" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {voiceMode ? "Désactiver le mode voix" : "Activer le mode voix"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <Conversation className="h-full">
          <ConversationContent className="max-w-3xl mx-auto py-8">
            {messages.length === 1 && messages[0].id === "welcome" ? (
              <ConversationEmptyState title="" description="" className="mt-8">
                <div className="flex flex-col items-center gap-6">
                  <button
                    onClick={enterFullscreenVoice}
                    className="relative group cursor-pointer focus:outline-none"
                  >
                    <div className="size-48 relative">
                      <Orb
                        agentState={agentState}
                        colors={["#cb6441", "#e7e4dd"]}
                        className="absolute inset-0"
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="size-16 rounded-full flex items-center justify-center transition-all duration-300 bg-white/10 group-hover:bg-white/20">
                          <Mic className="size-6 text-primary/70" />
                        </div>
                      </div>
                    </div>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        Démarrer une conversation vocale
                      </span>
                    </div>
                  </button>

                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-medium">
                      Explorons ensemble !
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Clique sur l&apos;orbe pour une conversation vocale ou
                      tape ci-dessous
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 w-full max-w-md">
                    {[
                      "Qu'est-ce que le bonheur ?",
                      "Comment trouver un sens à la vie ?",
                      "Qu'est-ce que la sagesse ?",
                      "Pourquoi existons-nous ?",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        className="flex items-center justify-start h-auto py-3 px-4 text-sm font-normal text-muted-foreground hover:text-foreground border bg-background shadow-xs hover:bg-accent rounded-md transition-all text-left whitespace-normal"
                        onClick={() => setInput(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </ConversationEmptyState>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-4 w-full ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <Avatar className="size-8 mt-1 border">
                        <AvatarImage src="/chat-icon.png" alt="SocratChat" />
                        <AvatarFallback className="text-base">
                          CB
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <Message
                      from={message.role}
                      className={
                        message.role === "user" ? "max-w-[80%]" : "max-w-[85%]"
                      }
                    >
                      <MessageContent
                        className={
                          message.role === "user"
                            ? "bg-primary! text-primary-foreground! shadow-sm rounded-lg"
                            : "bg-background! border shadow-sm rounded-lg px-4 py-3"
                        }
                      >
                        {message.isStreaming && message.content === "" ? (
                          <div className="flex items-center gap-2">
                            <Loader size={14} />
                            <span className="text-muted-foreground text-sm">
                              Réflexion en cours...
                            </span>
                          </div>
                        ) : (
                          <MessageResponse>{message.content}</MessageResponse>
                        )}
                      </MessageContent>
                    </Message>

                    {message.role === "user" && (
                      <Avatar className="size-8 mt-1 border">
                        <AvatarFallback>
                          <UserIcon className="size-4" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </ConversationContent>
        </Conversation>
      </div>

      <div className="p-6 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-3xl mx-auto">
          {messages.length > 1 && (
            <div className="flex justify-center mb-4">
              <button
                onClick={enterFullscreenVoice}
                className="relative group cursor-pointer focus:outline-none"
              >
                <div className="size-20 relative">
                  <Orb
                    agentState={agentState}
                    colors={["#cb6441", "#e7e4dd"]}
                    className="absolute inset-0"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="size-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                      <Mic className="size-4 text-primary/70" />
                    </div>
                  </div>
                </div>
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  Conversation vocale
                </span>
              </button>
            </div>
          )}
          <PromptInput
            onSubmit={(_, e) => handleSubmit(e)}
            className="w-full bg-card border border-border/50 rounded-2xl shadow-xl shadow-black/5 overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-black/10 focus-within:border-primary/30 focus-within:shadow-primary/5"
          >
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isVoiceActive
                  ? "Mode vocal actif - parle ou tape..."
                  : "Pose-moi une question philosophique ou pratique..."
              }
              className="min-h-[56px] max-h-[180px] px-5 pt-4 pb-2 text-[15px] resize-none border-0 focus-visible:ring-0 shadow-none bg-transparent placeholder:text-muted-foreground/50"
            />
            <PromptInputFooter className="px-3 pb-3 pt-1">
              <PromptInputTools className="gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={
                          isRecording || isMicListening
                            ? "destructive"
                            : "ghost"
                        }
                        size="icon"
                        className={`size-9 rounded-xl ${
                          isRecording || isMicListening ? "animate-pulse" : ""
                        }`}
                        onClick={
                          isRecording
                            ? stopRecording
                            : isMicListening
                            ? toggleMicrophoneInput
                            : handleMicButtonClick
                        }
                        disabled={status !== "ready"}
                      >
                        {isRecording || isMicListening ? (
                          <MicOff className="size-4" />
                        ) : (
                          <Mic className="size-4 text-muted-foreground" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isRecording
                        ? "Arrêter l'enregistrement"
                        : isMicListening
                        ? "Arrêter la dictée"
                        : "Enregistrer un message vocal"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </PromptInputTools>
              <PromptInputSubmit
                status={
                  status === "submitted" || status === "streaming"
                    ? "streaming"
                    : "ready"
                }
                className="size-9 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg rounded-xl transition-all duration-200"
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <span className="text-sm">{toast}</span>
            <button
              onClick={() => setToast(null)}
              className="hover:bg-white/10 rounded p-1 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
