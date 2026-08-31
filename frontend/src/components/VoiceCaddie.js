import { useRef, useState } from "react";
import { toast } from "sonner";
import { Microphone } from "@phosphor-icons/react";

function speak(text) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.speak(u);
  } catch {}
}

export const VoiceCaddie = ({ getAnswer }) => {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const answer = (question) => {
    const text = getAnswer(question || "");
    toast.message("Voice Caddie", { description: text });
    speak(text);
  };

  const press = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      answer("");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => answer(e.results[0][0].transcript);
    rec.onerror = () => { setListening(false); answer(""); };
    rec.onend = () => setListening(false);
    setListening(true);
    try { rec.start(); } catch { setListening(false); answer(""); }
  };

  return (
    <button
      data-testid="voice-caddie-btn"
      onClick={press}
      className={`h-11 w-11 rounded-xl shadow-lg border flex items-center justify-center ${listening ? "bg-[#EF4444] border-[#EF4444] text-white animate-pulse" : "bg-white border-zinc-300"}`}
    >
      <Microphone size={20} weight={listening ? "fill" : "regular"} />
    </button>
  );
};
