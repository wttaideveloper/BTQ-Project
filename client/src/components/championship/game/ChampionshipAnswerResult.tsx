import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaithIQTreeMark } from "./FaithIQTreeMark";

/**
 * Championship skin for the per-question Correct / Incorrect result.
 *
 * PURE PRESENTATION. The sounds, the voice session, the continue handler and
 * every value shown here belong to FeedbackModal, which renders this instead of
 * its own markup when the battle is a Championship fixture. Team Battle, Rapid
 * Fire, Solo and Challenges keep FeedbackModal's original popup untouched.
 *
 * Styling reuses the .champ-* tokens from the Championship question board, so
 * the result reads as the same screen the player was just answering on.
 */
export function ChampionshipAnswerResult({
  isCorrect,
  question,
  correctAnswer,
  avatarMessage,
  onContinue,
}: {
  isCorrect: boolean;
  question: string;
  correctAnswer: string;
  avatarMessage: string;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#09061f]/80 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isCorrect ? "Correct answer" : "Incorrect answer"}
        className="champ-panel champ-result-card champ-enter overflow-hidden rounded-2xl"
      >
        {/* Tournament band: branding, verdict medallion, verdict. */}
        <div className="px-5 pb-5 pt-4 text-center sm:px-7 sm:pt-5">
          <div className="flex items-center justify-center gap-2">
            <FaithIQTreeMark className="h-4 w-4 text-[#d4af37]" />
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#f0d58a]">
              FaithIQ Championship
            </p>
          </div>

          <div className="mt-4 flex justify-center">
            <span
              className={`grid h-14 w-14 place-items-center rounded-full border bg-[#1a0d3d] ${
                isCorrect
                  ? "border-[#d4af37]/70 shadow-[0_0_28px_-10px_rgba(212,175,55,0.9)]"
                  : "border-[#c76a7a]/50 shadow-[0_0_28px_-12px_rgba(199,106,122,0.8)]"
              }`}
            >
              {isCorrect ? (
                <Check className="h-7 w-7 text-[#7ee2be]" strokeWidth={3} />
              ) : (
                <X className="h-7 w-7 text-[#e2a3ad]" strokeWidth={3} />
              )}
            </span>
          </div>

          <h3
            className={`mt-3 text-2xl font-black tracking-tight sm:text-3xl ${
              isCorrect ? "text-[#f0d58a]" : "text-[#e2a3ad]"
            }`}
          >
            {isCorrect ? "Correct!" : "Incorrect!"}
          </h3>
        </div>

        {/* Ivory surface, exactly as the question board presents a question. */}
        <div className="champ-card rounded-t-[2rem] border-t border-[#d8b25f]/70 px-5 py-5 text-center sm:px-8 sm:py-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#1b2559]/45">Question</p>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-[#1b2559] sm:text-base">{question}</p>

          <div className="mx-auto my-4 h-px max-w-[14rem] bg-gradient-to-r from-transparent via-[#d8b25f]/70 to-transparent" />

          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#1b2559]/45">Correct answer</p>
          <p className="mt-1.5 break-words text-xl font-black text-[#1b2559] sm:text-2xl">{correctAnswer}</p>
        </div>

        {/* Kingdom Genius message - content unchanged, framed as a quote panel. */}
        <div className="px-4 pb-4 pt-4 sm:px-6">
          <div className="rounded-xl border border-[#d4af37]/25 bg-[#1a0d3d]/70 px-4 py-3">
            <p className="text-sm italic leading-relaxed text-white/80">"{avatarMessage}"</p>
            <p className="mt-1.5 text-right text-[11px] font-semibold text-[#f0d58a]">
              — Kingdom Genius Dr. HB Holmes
            </p>
          </div>

          <Button onClick={onContinue} className="champ-btn-gold mt-4 w-full text-base">
            CONTINUE
          </Button>
        </div>
      </div>
    </div>
  );
}
