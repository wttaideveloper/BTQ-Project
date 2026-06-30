import React, { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Mail,
  Globe,
  Clock,
  MessageCircle,
  Send,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "support@faithiq.io";
const WEBSITE_URL = "https://triviagame.faithiq.io";

const contactCards = [
  {
    icon: Mail,
    title: "Email Support",
    value: SUPPORT_EMAIL,
    description: "Questions, bugs, or account help",
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
  const { user } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState(user?.username ?? "");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields before sending.",
        variant: "destructive",
      });
      return;
    }

    const body = [
      `Name: ${name.trim()}`,
      `Email: ${email.trim()}`,
      user ? `FaithIQ username: ${user.username}` : "",
      "",
      message.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;

    toast({
      title: "Opening your email app",
      description: "Send the pre-filled message to reach our support team.",
    });
  };

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

        <form
          onSubmit={handleSubmit}
          className="home-glass-card rounded-2xl p-5 sm:p-6 md:p-8 space-y-5"
        >
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Send a Message</h2>
            <p className="text-white/55 text-sm">
              Fill out the form and we'll open your email app with everything
              ready to send.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contact-name" className="text-white/90 text-sm">
                Your Name
              </Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="mt-1.5 bg-white/10 border-white/25 text-white placeholder:text-white/35 h-11"
              />
            </div>
            <div>
              <Label htmlFor="contact-email" className="text-white/90 text-sm">
                Email Address
              </Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1.5 bg-white/10 border-white/25 text-white placeholder:text-white/35 h-11"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="contact-subject" className="text-white/90 text-sm">
              Subject
            </Label>
            <Input
              id="contact-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="How can we help?"
              className="mt-1.5 bg-white/10 border-white/25 text-white placeholder:text-white/35 h-11"
            />
          </div>

          <div>
            <Label htmlFor="contact-message" className="text-white/90 text-sm">
              Message
            </Label>
            <Textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what's on your mind..."
              rows={5}
              className="mt-1.5 bg-white/10 border-white/25 text-white placeholder:text-white/35 resize-none"
            />
          </div>

          <Button
            type="submit"
            className="w-full sm:w-auto h-11 bg-accent hover:bg-accent/90 text-primary font-bold px-8"
          >
            <Send className="mr-2 h-4 w-4" />
            Send Message
          </Button>
        </form>

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
