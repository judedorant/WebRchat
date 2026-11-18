import { useEffect, useRef, useState } from "react";
import { Paperclip, Mic, Smile } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "../../lib/api";
import { csrf, errorMessage, mutate } from "../../lib/auth";
import { useAuth } from "../../store/auth";
import type { Contact } from "./types";
import type { SavedConversation, SavedMessage } from "./useDirectMessaging";
import { emoji } from "./emoji";
interface Props {
  userId: number;
  conversation: SavedConversation | null;
  contact?: Contact;
  disabled: boolean;
  draft: string;
  replyToId?: number;
  onEmoji: (value: string) => void;
  onSent: (conversation: SavedConversation, message: SavedMessage) => void;
}
export function RichComposer({
  userId,
  conversation,
  contact,
  disabled,
  draft,
  replyToId,
  onEmoji,
  onSent,
}: Props) {
  const [open, setOpen] = useState(false),
    [picker, setPicker] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [kind, setKind] = useState("file");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const [retry, setRetry] = useState(false);
  const [recording, setRecording] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const recordVersion = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true),
    lock = useRef(false);
  const attempt = useRef<{
    reply_to_id?: number;
    uuid: string;
    file: File;
    kind: string;
    body: string;
    conversation: SavedConversation | null;
  } | null>(null);
  const valid = () => alive.current && useAuth.getState().user?.id === userId;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  function choose(next: File | null) {
    if (lock.current || attempt.current) return;
    setError("");
    if (next && next.size > 10 * 1024 * 1024) {
      setError("Choose a file smaller than 10 MB.");
      return;
    }
    setFile(next);
    setPreview(
      next?.type.startsWith("audio/") ? URL.createObjectURL(next) : null,
    );
    setKind(
      next?.type.startsWith("image/")
        ? "image"
        : next?.type.startsWith("audio/")
          ? "voice"
          : "file",
    );
  }
  async function record() {
    if (recording || requestingMic || lock.current || attempt.current) return;
    const version = ++recordVersion.current;
    setOpen(true);
    setError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Recording is unavailable in this browser. Choose an audio file instead.",
      );
      return;
    }
    setRequestingMic(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!valid() || version !== recordVersion.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const type = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((value) => MediaRecorder.isTypeSupported(value));
      const instance = new MediaRecorder(
        media,
        type ? { mimeType: type } : undefined,
      );
      recorder.current = instance;
      const chunks: Blob[] = [];
      let bytes = 0;
      instance.ondataavailable = (event) => {
        chunks.push(event.data);
        bytes += event.data.size;
        if (bytes > 9 * 1024 * 1024 && instance.state === "recording")
          instance.stop();
      };
      instance.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        if (timer.current) clearTimeout(timer.current);
        if (!valid() || version !== recordVersion.current) return;
        setRecording(false);
        const extension = instance.mimeType.includes("ogg")
          ? "ogg"
          : instance.mimeType.includes("mp4")
            ? "m4a"
            : "webm";
        const recorded = new File(chunks, `voice-${Date.now()}.${extension}`, {
          type: instance.mimeType,
        });
        setFile(recorded);
        setPreview(URL.createObjectURL(recorded));
        setKind("voice");
      };
      instance.start(1000);
      setRecording(true);
      timer.current = setTimeout(() => {
        if (instance.state === "recording") instance.stop();
      }, 60000);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (valid() && version === recordVersion.current)
        setError(
          "Microphone access failed. Allow microphone access or choose an audio file.",
        );
    } finally {
      if (valid() && version === recordVersion.current) setRequestingMic(false);
    }
  }
  function close() {
    if (lock.current) return;
    ++recordVersion.current;
    setRequestingMic(false);
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      setFile(null);
      setPreview(null);
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    if (timer.current) clearTimeout(timer.current);
    setRecording(false);
    setOpen(false);
  }
  async function send() {
    if (lock.current || !file || recording || requestingMic || disabled) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setProgress(0);
    const pending = attempt.current ?? {
      reply_to_id: replyToId,
      uuid: crypto.randomUUID(),
      file,
      kind,
      body: draft,
      conversation,
    };
    attempt.current = pending;
    setRetry(true);
    try {
      if (!pending.conversation) {
        if (!contact) throw new Error("Select a member first");
        pending.conversation = (
          await mutate<{ data: SavedConversation }>(
            "post",
            "/conversations",
            { recipient_id: contact.id },
            { "X-Chat-Account": String(userId) },
          )
        ).data;
      }
      if (!valid()) return;
      const data = new FormData();
      data.append("file", pending.file);
      data.append("kind", pending.kind);
      data.append("client_uuid", pending.uuid);
      if (pending.reply_to_id)
        data.append("reply_to_id", String(pending.reply_to_id));
      if (pending.body.trim()) data.append("body", pending.body);
      await csrf();
      const response = await api.post<{ data: SavedMessage }>(
        `/conversations/${pending.conversation.id}/attachments`,
        data,
        {
          headers: { "X-Chat-Account": String(userId) },
          timeout: 60000,
          onUploadProgress: (event) => {
            if (valid())
              setProgress(
                Math.min(100, Math.round((event.progress ?? 0) * 100)),
              );
          },
        },
      );
      if (!valid()) return;
      onSent(pending.conversation, response.data.data);
      attempt.current = null;
      setRetry(false);
      setFile(null);
      setPreview(null);
      setOpen(false);
    } catch (error) {
      if (valid()) setError(errorMessage(error));
    } finally {
      lock.current = false;
      if (valid()) setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="chat-icon-button"
        aria-label="Attach a file"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Paperclip size={19} />
      </button>
      <button
        type="button"
        className="chat-icon-button"
        aria-label="Emoji picker"
        aria-expanded={picker}
        disabled={disabled}
        onClick={() => setPicker(!picker)}
      >
        <Smile size={19} />
      </button>
      <button
        type="button"
        className="chat-icon-button"
        aria-label="Voice message"
        disabled={disabled || busy || retry || recording || requestingMic}
        onClick={() => void record()}
      >
        <Mic size={19} />
      </button>
      {picker && (
        <span
          className="chat-emoji-picker"
          role="group"
          aria-label="Emoji choices"
        >
          {emoji.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Insert ${value}`}
              onClick={() => {
                onEmoji(value);
                setPicker(false);
              }}
            >
              {value}
            </button>
          ))}
        </span>
      )}
      {open && (
        <Modal title="Send an attachment" onClose={close}>
          <p>
            Images, PDF, plain text or audio · up to 10 MB. Images up to 4096 ×
            4096. Only conversation members can download.
          </p>
          {error && <p role="alert">{error}</p>}
          <label>
            Attachment
            <input
              type="file"
              disabled={busy || recording || requestingMic || retry}
              accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,audio/*"
              onChange={(event) => choose(event.target.files?.[0] ?? null)}
            />
          </label>
          {file && kind === "voice" && preview && (
            <audio controls src={preview} aria-label="Review voice recording" />
          )}
          {file && (
            <p>
              {file.name} · {Math.ceil(file.size / 1024)} KB
            </p>
          )}
          {recording ? (
            <button
              type="button"
              className="chat-secondary"
              onClick={() => recorder.current?.stop()}
            >
              Stop recording
            </button>
          ) : (
            <button
              type="button"
              className="chat-secondary"
              disabled={busy || retry || requestingMic}
              onClick={() => void record()}
            >
              Record audio (60 seconds maximum)
            </button>
          )}
          {requestingMic && (
            <p role="status">Waiting for microphone permission…</p>
          )}
          {recording && (
            <p role="status">Recording… Stop to review before sending.</p>
          )}
          {busy && <p role="status">Uploading {progress}%…</p>}
          <button
            type="button"
            className="chat-primary"
            disabled={busy || recording || requestingMic || !file || disabled}
            onClick={() => void send()}
          >
            {busy ? "Sending…" : retry ? "Retry attachment" : "Send attachment"}
          </button>
          {retry && !busy && (
            <button
              type="button"
              className="chat-secondary"
              onClick={() => {
                attempt.current = null;
                setRetry(false);
                setFile(null);
                setPreview(null);
                setError("");
              }}
            >
              Discard attachment retry
            </button>
          )}
          {retry && (
            <p>
              Retries use the same upload and message identifier. If you discard
              an unconfirmed upload, check the conversation before sending
              again.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
