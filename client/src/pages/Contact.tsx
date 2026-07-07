import React from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Mail,
  Globe,
  Clock,
  MessageCircle,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "support@faithiq.io";
const WEBSITE_URL = "https://triviagame.faithiq.io";

const contactCards = [
  {
    icon: Mail,
    title: "Email Support",
    value: SUPPORT_EMAIL,
    description: "Tap to open your email app",
    href: `mailto:${SUPPORT_EMAIL}`,
    accent: "home-icon-gold",
  },
  {
    icon: Globe,
    title: "Website",
    value: "triviagame.faithiq.io",
    description: "Play FaithIQ Bible Trivia online",
    href: WEBSITE_URL,
    accent: "home-icon-blue",
  },
  {
    icon: Clock,
    title: "Response Time",
    value: "1–2 business days",
    description: "We reply to every message",
    accent: "home-icon-purple",
  },
];

export default function Contact() {
  const [_, setLocation] = useLocation();

  return (
    <div className="home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] font-heading">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <Button
          variant="outline"
          className="home-btn-outline"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Home
        </Button>

        <div className="text-center sm:text-left">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/15 text-accent mb-4">
            <MessageCircle className="h-7 w-7" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Contact <span className="text-accent">Us</span>
          </h1>
          <p className="text-white/70 text-base sm:text-lg max-w-xl">
            Have a question, found a bug, or need help with FaithIQ? We're here
            for you.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {contactCards.map((card) => {
            const Icon = card.icon;
            const inner = (
              <>
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center mb-3 shadow-sm",
                    card.accent
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.25} />
                </div>
                <h3 className="font-semibold text-white text-sm">{card.title}</h3>
                <p className="text-accent text-sm font-medium mt-1 break-all">
                  {card.value}
                </p>
                <p className="text-white/50 text-xs mt-1">{card.description}</p>
              </>
            );

            if (card.href) {
              return (
                <a
                  key={card.title}
                  href={card.href}
                  target={card.href.startsWith("http") ? "_blank" : undefined}
                  rel={card.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="home-glass-card rounded-xl p-4 sm:p-5 block transition-all hover:border-accent/30 hover:scale-[1.02]"
                >
                  {inner}
                </a>
              );
            }

            return (
              <div
                key={card.title}
                className="home-glass-card rounded-xl p-4 sm:p-5"
              >
                {inner}
              </div>
            );
          })}
        </div>

        <div className="home-glass-card rounded-xl p-4 sm:p-5 flex gap-3 items-start">
          <MapPin className="h-5 w-5 text-accent shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-white text-sm">FaithIQ Bible Trivia</h3>
            <p className="text-white/60 text-sm mt-1 leading-relaxed">
              Hosted by Kingdom Genius Dr. HB Holmes — test your Bible knowledge,
              play solo or with friends, and compete in live Team Battles.
            </p>
          </div>
        </div>

        <footer className="text-center text-white/40 text-xs pb-4">
          © {new Date().getFullYear()} FaithIQ. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
