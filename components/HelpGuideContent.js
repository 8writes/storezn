"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calculator,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  LifeBuoy,
  Mail,
  MessageCircle,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  HELP_TOPICS,
  POPULAR_QUESTIONS,
  START_STEPS,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP,
  findArticle,
  searchHelp,
} from "@/lib/helpContent.js";

// The vendor guide - shown at /vendor/help (signed in) and /help (public).
// Content lives in lib/helpContent.js; this is only the layout:
//   home   - search, "Start here" checklist, topic grid, popular questions
//   topic  - one topic's questions, each opening in place
//   search - matching questions across every topic
//
// `signedIn` turns the "Go to ..." links on: on the public page they'd
// only bounce to the sign-in screen.

const ICONS = { Package, ShoppingBag, FileText, Wallet, Truck, Store, Globe, Users, Calculator, Sparkles, User, LifeBuoy };

const PLAN_LABEL = { plus: "Storezn+", enterprise: "Enterprise" };

function PlanBadge({ plan }) {
  if (!plan) return null;
  return (
    <span className="shrink-0 rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
      {PLAN_LABEL[plan]}
    </span>
  );
}

function Article({ article, topicTitle, signedIn, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer hover:bg-slate-50"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-medium text-slate-900">{article.q}</span>
          {topicTitle && <span className="block text-xs text-slate-600 mt-0.5">{topicTitle}</span>}
        </span>
        <PlanBadge plan={article.plan} />
        <ChevronDown size={18} className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-sm text-slate-800 leading-relaxed">
          <p>{article.a}</p>
          {article.steps?.length > 0 && (
            <ol className="space-y-1.5">
              {article.steps.map((step, index) => (
                <li key={step} className="flex gap-2.5">
                  <span className="shrink-0 grid place-items-center h-5 w-5 rounded-full bg-brand-100 text-brand-700 text-[11px] font-bold">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
          {signedIn && article.link && (
            <Link href={article.link.href} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
              {article.link.label} <ChevronRight size={15} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function ArticleList({ items, signedIn, showTopic = false }) {
  return (
    <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden">
      {items.map(({ topic, article }) => (
        <Article
          key={`${topic.id}:${article.q}`}
          article={article}
          topicTitle={showTopic ? topic.title : null}
          signedIn={signedIn}
        />
      ))}
    </div>
  );
}

function ContactButtons({ compact = false }) {
  const size = compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm";
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`https://wa.me/${SUPPORT_WHATSAPP}`}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex items-center gap-2 font-semibold bg-[#25D366] text-white rounded-sm hover:brightness-95 transition-[filter] whitespace-nowrap ${size}`}
      >
        <MessageCircle size={compact ? 14 : 16} />
        WhatsApp us
      </a>
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className={`inline-flex items-center gap-2 font-semibold border border-slate-300 bg-surface text-slate-800 rounded-sm hover:bg-slate-50 whitespace-nowrap ${size}`}
      >
        <Mail size={compact ? 14 : 16} />
        Email us
      </a>
    </div>
  );
}

export function HelpGuideContent({ signedIn = false }) {
  const [search, setSearch] = useState("");
  const [topicId, setTopicId] = useState(null);

  const query = search.trim();
  const topic = HELP_TOPICS.find((t) => t.id === topicId) || null;
  const results = query ? searchHelp(query) : [];
  const popular = POPULAR_QUESTIONS.map(([id, q]) => findArticle(id, q)).filter(Boolean);

  const openTopic = (id) => {
    setSearch("");
    setTopicId(id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-8">
      {/* Header + search */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">How can we help?</h1>
            <p className="text-sm text-slate-700 mt-1">Search, or pick a topic below.</p>
          </div>
          <ContactButtons compact />
        </div>
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setTopicId(null);
              setSearch(e.target.value);
            }}
            placeholder="e.g. delivery fee, invoice, get paid"
            aria-label="Search help"
            className="w-full h-12 pl-11 pr-10 border border-slate-300 rounded-sm bg-surface text-base text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      {query ? (
        // Search results across every topic.
        <section className="space-y-3">
          <p className="text-sm text-slate-700">
            {results.length === 0
              ? `Nothing found for "${query}". Try another word, or message us below.`
              : `${results.length} answer${results.length === 1 ? "" : "s"} for "${query}"`}
          </p>
          {results.length > 0 && <ArticleList items={results} signedIn={signedIn} showTopic />}
        </section>
      ) : topic ? (
        // One topic.
        <section className="space-y-4">
          <button
            type="button"
            onClick={() => setTopicId(null)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft size={16} /> All topics
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{topic.title}</h2>
            <p className="text-sm text-slate-700 mt-0.5">{topic.summary}</p>
          </div>
          <ArticleList items={topic.articles.map((article) => ({ topic, article }))} signedIn={signedIn} />
        </section>
      ) : (
        <>
          {/* Start here */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">New here? Start with these 5 steps</h2>
            <ol className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-200">
              {START_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3.5 p-4">
                  <span className="shrink-0 grid place-items-center h-7 w-7 rounded-full bg-brand-600 text-white text-sm font-bold">
                    {index + 1}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-[15px] font-semibold text-slate-900">{step.title}</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{step.text}</p>
                    {signedIn && step.link && (
                      <Link href={step.link.href} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                        {step.link.label} <ChevronRight size={15} />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Topics */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Browse by topic</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {HELP_TOPICS.map((t) => {
                const Icon = ICONS[t.icon] || LifeBuoy;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTopic(t.id)}
                    className="group flex items-center gap-3 bg-surface border border-slate-200 rounded-sm p-3.5 text-left cursor-pointer transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                  >
                    <span className="shrink-0 grid place-items-center h-10 w-10 rounded-sm bg-brand-100 text-brand-700 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                      <Icon size={19} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-semibold text-slate-900">{t.title}</span>
                      <span className="block text-xs text-slate-600 truncate">{t.summary}</span>
                    </span>
                    <ChevronRight size={17} className="shrink-0 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Popular questions */}
          {popular.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900">Common questions</h2>
              <ArticleList items={popular} signedIn={signedIn} showTopic />
            </section>
          )}
        </>
      )}

      {/* Contact */}
      <section className="bg-surface border border-slate-200 rounded-sm p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="font-bold text-slate-900">Still stuck? Talk to a person.</h2>
          <p className="text-sm text-slate-700 mt-1">A real person reads every message. WhatsApp is fastest.</p>
        </div>
        <ContactButtons />
      </section>
    </div>
  );
}
